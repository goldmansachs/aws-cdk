import json
import logging
import os
import subprocess

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# these are coming from the kubectl layer
os.environ['PATH'] = '/opt/kubectl:/opt/awscli:' + os.environ['PATH']

outdir = os.environ.get('TEST_OUTDIR', '/tmp')
kubeconfig = os.path.join(outdir, 'kubeconfig')


def patch_handler(event, context):
    logger.info(json.dumps(event))

    request_type = event['RequestType']
    props = event['ResourceProperties']

    # resource properties (all required)
    cluster_name  = props['ClusterName']
    cluster_endpoint = props['ClusterEndpoint']
    cluster_certificate_authority_data = props['ClusterCertificateAuthorityData']
    role_arn      = props['RoleArn']

    # "log in" to the cluster
#    subprocess.check_call([ 'aws', 'eks', 'update-kubeconfig',
#        '--role-arn', role_arn,
#        '--name', cluster_name,
#        '--kubeconfig', kubeconfig
#    ])

    kubeconfig_file = open(kubeconfig, "w")

    kubeconfig_data = f"""apiVersion: v1
        clusters:
          - name: {cluster_name}
            cluster:
              server: {cluster_endpoint}
              certificate-authority-data: {cluster_certificate_authority_data}
        users:
          - name: lambda
            user:
              exec:
                apiVersion: client.authentication.k8s.io/v1alpha1
                command: /opt/aws-iam-authenticator/aws-iam-authenticator
                args:
                  - token
                  - -i
                  - {cluster_name}
                  - -r
                  - {role_arn}
        contexts:
          - name: default
            context:
              cluster: {cluster_name}
              user: lambda
        current-context: default
    """
    kubeconfig_file.write(kubeconfig_data)
    kubeconfig_file.close()

    print(kubeconfig_data)

    if os.path.isfile(kubeconfig):
        os.chmod(kubeconfig, 0o600)

    resource_name = props['ResourceName']
    resource_namespace = props['ResourceNamespace']
    apply_patch_json = props['ApplyPatchJson']
    restore_patch_json = props['RestorePatchJson']
    patch_type = props['PatchType']

    patch_json = None
    if request_type == 'Create' or request_type == 'Update':
        patch_json = apply_patch_json
    elif request_type == 'Delete':
        patch_json = restore_patch_json
    else:
        raise Exception("invalid request type %s" % request_type)

    kubectl([ 'patch', resource_name, '-n', resource_namespace, '-p', patch_json, '--type', patch_type ])


def kubectl(args):
    maxAttempts = 3
    retry = maxAttempts
    while retry > 0:
        try:
            cmd = [ 'kubectl', '--kubeconfig', kubeconfig ] + args
            output = subprocess.check_output(cmd, stderr=subprocess.STDOUT)
        except subprocess.CalledProcessError as exc:
            output = exc.output
            if b'i/o timeout' in output and retry > 0:
                retry = retry - 1
                logger.info("kubectl timed out, retries left: %s" % retry)
            else:
                raise Exception(output)
        else:
            logger.info(output)
            return
    raise Exception(f'Operation failed after {maxAttempts} attempts: {output}')

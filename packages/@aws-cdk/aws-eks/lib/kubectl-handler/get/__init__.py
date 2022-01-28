import json
import logging
import os
import subprocess
import time

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# these are coming from the kubectl layer
os.environ['PATH'] = '/opt/kubectl:/opt/awscli:' + os.environ['PATH']

outdir = os.environ.get('TEST_OUTDIR', '/tmp')
kubeconfig = os.path.join(outdir, 'kubeconfig')


def get_handler(event, context):
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

    kubeconfig_data = f"""
apiVersion: v1
clusters:
- cluster:
    certificate-authority-data: {cluster_certificate_authority_data}
    server: {cluster_endpoint}
  name: {cluster_name}
contexts:
- context:
    cluster: {cluster_name}
    user: lambda
  name: default
current-context: default
users:
- name: lambda
  user:
    exec:
      apiVersion: client.authentication.k8s.io/v1alpha1
      args:
      - token
      - -i
      - {cluster_name}
      - -r
      - {role_arn}
      command: /opt/kubectl/aws-iam-authenticator
"""
    kubeconfig_file.write(kubeconfig_data)
    kubeconfig_file.close()

    if os.path.isfile(kubeconfig):
        os.chmod(kubeconfig, 0o600)

    object_type         = props['ObjectType']
    object_name         = props['ObjectName']
    object_namespace    = props['ObjectNamespace']
    json_path           = props['JsonPath']
    timeout_seconds     = props['TimeoutSeconds']

    # json path should be surrouded with '{}'
    path = '{{{0}}}'.format(json_path)
    if request_type == 'Create' or request_type == 'Update':
        output = wait_for_output(['get', '-n', object_namespace, object_type, object_name, "-o=jsonpath='{{{0}}}'".format(json_path)], int(timeout_seconds))
        return {'Data': {'Value': output}}
    elif request_type == 'Delete':
        pass
    else:
        raise Exception("invalid request type %s" % request_type)

def wait_for_output(args, timeout_seconds):

  end_time = time.time() + timeout_seconds
  error = None

  while time.time() < end_time:
    try:
      # the output is surrounded with '', so we unquote
      output = kubectl(args).decode('utf-8')[1:-1]
      if output:
        return output
    except Exception as e:
      error = str(e)
      # also a recoverable error
      if 'NotFound' in error:
        pass
    time.sleep(10)

  raise RuntimeError(f'Timeout waiting for output from kubectl command: {args} (last_error={error})')

def kubectl(args):
    retry = 3
    while retry > 0:
        try:
            cmd = [ 'kubectl', '--kubeconfig', kubeconfig ] + args
            output = subprocess.check_output(cmd, stderr=subprocess.STDOUT)
        except subprocess.CalledProcessError as exc:
            output = exc.output
            if b'i/o timeout' in output and retry > 0:
                logger.info("kubectl timed out, retries left: %s" % retry)
                retry = retry - 1
            else:
                raise Exception(output)
        else:
            logger.info(output)
            return output

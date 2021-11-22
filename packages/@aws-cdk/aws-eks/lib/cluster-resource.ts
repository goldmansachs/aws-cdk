import * as ec2 from '@aws-cdk/aws-ec2';
import * as iam from '@aws-cdk/aws-iam';
import * as kms from '@aws-cdk/aws-kms';
import * as lambda from '@aws-cdk/aws-lambda';
import { ArnComponents, CustomResource, Token } from '@aws-cdk/core';
import { Construct } from 'constructs';
import { CLUSTER_RESOURCE_TYPE } from './cluster-resource-handler/consts';
import { ClusterResourceProvider } from './cluster-resource-provider';
import { CfnCluster } from './eks.generated';

// v2 - keep this import as a separate section to reduce merge conflict when forward merging with the v2 branch.
// eslint-disable-next-line
import { Construct as CoreConstruct } from '@aws-cdk/core';

export interface ClusterResourceProps {
  readonly resourcesVpcConfig: CfnCluster.ResourcesVpcConfigProperty;
  readonly roleArn: string;
  readonly encryptionConfig?: Array<CfnCluster.EncryptionConfigProperty>;
  readonly kubernetesNetworkConfig?: CfnCluster.KubernetesNetworkConfigProperty;
  readonly name: string;
  readonly version?: string;
  readonly endpointPrivateAccess: boolean;
  readonly endpointPublicAccess: boolean;
  readonly publicAccessCidrs?: string[];
  readonly vpc: ec2.IVpc;
  readonly environment?: { [key: string]: string };
  readonly subnets?: ec2.ISubnet[];
  readonly secretsEncryptionKey?: kms.IKey;
  readonly onEventLayer?: lambda.ILayerVersion;
  readonly clusterHandlerSecurityGroup?: ec2.ISecurityGroup;
  readonly clusterResourceProviderTemplateURL?: string;
}

/**
 * A low-level CFN resource Amazon EKS cluster implemented through a custom
 * resource.
 *
 * Implements EKS create/update/delete through a CloudFormation custom resource
 * in order to allow us to control the IAM role which creates the cluster. This
 * is required in order to be able to allow CloudFormation to interact with the
 * cluster via `kubectl` to enable Kubernetes management capabilities like apply
 * manifest and IAM role/user RBAC mapping.
 */
export class ClusterResource extends CoreConstruct {
  public readonly attrEndpoint: string;
  public readonly attrArn: string;
  public readonly attrCertificateAuthorityData: string;
  public readonly attrClusterSecurityGroupId: string;
  public readonly attrEncryptionConfigKeyArn: string;
  public readonly attrOpenIdConnectIssuerUrl: string;
  public readonly attrOpenIdConnectIssuer: string;
  public readonly ref: string;

  public readonly clusterCreationRole: iam.IRole;

  constructor(scope: Construct, id: string, props: ClusterResourceProps) {
    super(scope, id);

    if (!props.roleArn) {
      throw new Error('"roleArn" is required');
    }

    this.clusterCreationRole = props.clusterCreationRole;

    const provider = ClusterResourceProvider.getOrCreate(this, {
      clusterResourceProviderTemplateURL: props.clusterResourceProviderTemplateURL,
      clusterCreationRole: this.clusterCreationRole,
      subnets: props.subnets,
      vpc: props.vpc,
      environment: props.environment,
      onEventLayer: props.onEventLayer,
      securityGroup: props.clusterHandlerSecurityGroup,
    });

    const resource = new CustomResource(this, 'Resource', {
      resourceType: CLUSTER_RESOURCE_TYPE,
      serviceToken: provider.serviceToken,
      properties: {
        // the structure of config needs to be that of 'aws.EKS.CreateClusterRequest' since its passed as is
        // to the eks.createCluster sdk invocation.
        Config: {
          name: props.name,
          version: props.version,
          roleArn: props.roleArn,
          encryptionConfig: props.encryptionConfig,
          kubernetesNetworkConfig: props.kubernetesNetworkConfig,
          resourcesVpcConfig: {
            subnetIds: (props.resourcesVpcConfig as CfnCluster.ResourcesVpcConfigProperty).subnetIds,
            securityGroupIds: (props.resourcesVpcConfig as CfnCluster.ResourcesVpcConfigProperty).securityGroupIds,
            endpointPublicAccess: props.endpointPublicAccess,
            endpointPrivateAccess: props.endpointPrivateAccess,
            publicAccessCidrs: props.publicAccessCidrs,
          },
        },
        AssumeRoleArn: this.clusterCreationRole.roleArn,

        // IMPORTANT: increment this number when you add new attributes to the
        // resource. Otherwise, CloudFormation will error with "Vendor response
        // doesn't contain XXX key in object" (see #8276) by incrementing this
        // number, you will effectively cause a "no-op update" to the cluster
        // which will return the new set of attribute.
        AttributesRevision: 2,
      },
    });

    resource.node.addDependency(this.clusterCreationRole);

    this.ref = resource.ref;
    this.attrEndpoint = Token.asString(resource.getAtt('Endpoint'));
    this.attrArn = Token.asString(resource.getAtt('Arn'));
    this.attrCertificateAuthorityData = Token.asString(resource.getAtt('CertificateAuthorityData'));
    this.attrClusterSecurityGroupId = Token.asString(resource.getAtt('ClusterSecurityGroupId'));
    this.attrEncryptionConfigKeyArn = Token.asString(resource.getAtt('EncryptionConfigKeyArn'));
    this.attrOpenIdConnectIssuerUrl = Token.asString(resource.getAtt('OpenIdConnectIssuerUrl'));
    this.attrOpenIdConnectIssuer = Token.asString(resource.getAtt('OpenIdConnectIssuer'));
  }

}

export function clusterArnComponents(clusterName: string): ArnComponents {
  return {
    service: 'eks',
    resource: 'cluster',
    resourceName: clusterName,
  };
}

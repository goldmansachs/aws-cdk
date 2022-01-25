import * as path from 'path';
import * as ec2 from '@aws-cdk/aws-ec2';
import {
  Arn,
  CustomResource,
  CustomResourceProvider,
  CustomResourceProviderRuntime,
  IResource,
  Resource,
  Token,
} from '@aws-cdk/core';
import { Construct } from 'constructs';

// eslint-disable-next-line
import { OidcProviderNestedStack } from './gs-extension/oidc-provider-nested-stack';

const RESOURCE_TYPE = 'Custom::AWSCDKOpenIdConnectProvider';

/**
 * Represents an IAM OpenID Connect provider.
 *
 */
export interface IOpenIdConnectProvider extends IResource {
  /**
   * The Amazon Resource Name (ARN) of the IAM OpenID Connect provider.
   */
  readonly openIdConnectProviderArn: string;

  /**
   * The issuer for OIDC Provider
   */
  readonly openIdConnectProviderIssuer: string;
}

/**
 * Initialization properties for `OpenIdConnectProvider`.
 */
export interface OpenIdConnectProviderProps {
  /**
   * The URL of the identity provider. The URL must begin with https:// and
   * should correspond to the iss claim in the provider's OpenID Connect ID
   * tokens. Per the OIDC standard, path components are allowed but query
   * parameters are not. Typically the URL consists of only a hostname, like
   * https://server.example.org or https://example.com.
   *
   * You can find your OIDC Issuer URL by:
   * aws eks describe-cluster --name %cluster_name% --query "cluster.identity.oidc.issuer" --output text
   */
  readonly url: string;

  /**
   * Specify S3 template URL to use a compiled CFN template for the
   * OIDC provider
   *
   * @default - Bundled asset Lambda function is used when oidcProviderTemplateURL is not provided
   */
  readonly oidcProviderTemplateURL?: string;

  /**
   * Subnets to use for compiled CFN Lambda functions
   *
   * @default - Lambda function not used when oidcProviderTemplateURL is not provided
   */
  readonly subnets?: ec2.ISubnet[];

  /**
   * Security group to use for compiled CFN Lambda functions
   * @default - Lambda function not used when oidcProviderTemplateURL is not provided
   */
  readonly securityGroup?: ec2.ISecurityGroup;
}

/**
 * IAM OIDC identity providers are entities in IAM that describe an external
 * identity provider (IdP) service that supports the OpenID Connect (OIDC)
 * standard, such as Google or Salesforce. You use an IAM OIDC identity provider
 * when you want to establish trust between an OIDC-compatible IdP and your AWS
 * account.
 *
 * This implementation has default values for thumbprints and clientIds props
 * that will be compatible with the eks cluster
 *
 * @see http://openid.net/connect
 * @see https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_providers_oidc.html
 *
 * @resource AWS::CloudFormation::CustomResource
 */
export class OpenIdConnectProvider extends Resource implements IOpenIdConnectProvider {
  /**
   * Imports an Open ID connect provider from an ARN.
   * @param scope The definition scope
   * @param id ID of the construct
   * @param openIdConnectProviderArn the ARN to import
   */
  public static fromOpenIdConnectProviderArn(scope: Construct, id: string, openIdConnectProviderArn: string): IOpenIdConnectProvider {
    const resourceName = Arn.extractResourceName(openIdConnectProviderArn, 'oidc-provider');

    class Import extends Resource implements IOpenIdConnectProvider {
      public readonly openIdConnectProviderArn = openIdConnectProviderArn;
      public readonly openIdConnectProviderIssuer = resourceName;
    }

    return new Import(scope, id);
  }

  /**
   * The Amazon Resource Name (ARN) of the IAM OpenID Connect provider.
   */
  public readonly openIdConnectProviderArn: string;

  public readonly openIdConnectProviderIssuer: string;

  /**
   * Defines an OpenID Connect provider.
   * @param scope The definition scope
   * @param id Construct ID
   * @param props Initialization properties
   */
  public constructor(scope: Construct, id: string, props: OpenIdConnectProviderProps) {
    super(scope, id);

    /**
     * For some reason EKS isn't validating the root certificate but a intermediate certificate
     * which is one level up in the tree. Because of the a constant thumbprint value has to be
     * stated with this OpenID Connect provider. The certificate thumbprint is the same for all the regions.
     */
    const thumbprints = ['9e99a48a9960b14926bb7f3b02e22da2b0ab7280'];

    const clientIds = ['sts.amazonaws.com'];

    let serviceToken;
    if (props.oidcProviderTemplateURL) {
      const oidcProvider = new OidcProviderNestedStack(this, RESOURCE_TYPE, {
        templateURL: props.oidcProviderTemplateURL,
      });

      serviceToken = oidcProvider.serviceToken;
    } else {
      serviceToken = this.getOrCreateProvider();
    }

    const resource = new CustomResource(this, 'Resource', {
      resourceType: RESOURCE_TYPE,
      serviceToken,
      properties: {
        ClientIDList: clientIds,
        ThumbprintList: thumbprints,
        Url: props.url,
      },
    });

    this.openIdConnectProviderArn = Token.asString(resource.ref);
    this.openIdConnectProviderIssuer = Arn.extractResourceName(this.openIdConnectProviderArn, 'oidc-provider');
  }

  private getOrCreateProvider() {
    return CustomResourceProvider.getOrCreate(this, RESOURCE_TYPE, {
      codeDirectory: path.join(__dirname, '..', '..', 'aws-iam', 'lib', 'oidc-provider'),
      runtime: CustomResourceProviderRuntime.NODEJS_12_X,
      policyStatements: [
        {
          Effect: 'Allow',
          Resource: '*',
          Action: [
            'iam:CreateOpenIDConnectProvider',
            'iam:DeleteOpenIDConnectProvider',
            'iam:UpdateOpenIDConnectProviderThumbprint',
            'iam:AddClientIDToOpenIDConnectProvider',
            'iam:RemoveClientIDFromOpenIDConnectProvider',
          ],
        },
      ],
    });
  }
}

import { AddToPrincipalPolicyResult, IPrincipal, IRole, OpenIdConnectPrincipal, PolicyStatement, PrincipalPolicyFragment, Role } from '@aws-cdk/aws-iam';
import { CfnJson, Names } from '@aws-cdk/core';
import { Construct } from 'constructs';
import { ICluster } from './cluster';
import { KubernetesManifest } from './k8s-manifest';

// v2 - keep this import as a separate section to reduce merge conflict when forward merging with the v2 branch.
// eslint-disable-next-line
import { Construct as CoreConstruct } from '@aws-cdk/core';

// eslint-disable-next-line
import { CfnJsonProviderNestedStack } from './gs-extension/cfn-json-provider-nested-stack';
// eslint-disable-next-line
import { CfnJsonCustomResource } from './gs-extension/cfn-json-custom-resource';
// eslint-disable-next-line
import { LoadBalancerControllerNestedStack } from './gs-extension/load-balancer-controller-nested-stack';

/**
 * Options for `ServiceAccount`
 */
export interface ServiceAccountOptions {
  /**
   * The name of the service account.
   * @default - If no name is given, it will use the id of the resource.
   */
  readonly name?: string;

  /**
   * The namespace of the service account.
   * @default "default"
   */
  readonly namespace?: string;

  /**
 * Specify S3 template URL to use a compiled CFN template for the
 * CfnJson
 *
 * @default - Use CDK provided CfnJson lambda
 */
  readonly cfnJsonProviderTemplateURL?: string;

  /**
  * Specify S3 template URL to use a compiled CFN template for the
  * EKS Load Balancer Controller Role
  *
  * @default - Use CDK provided Load Balancer Controller Role
  */
  readonly loadBalancerControllerTemplateURL?: string;
}

/**
 * Properties for defining service accounts
 */
export interface ServiceAccountProps extends ServiceAccountOptions {
  /**
   * The cluster to apply the patch to.
   */
  readonly cluster: ICluster;
}

/**
 * Service Account
 */
export class ServiceAccount extends CoreConstruct implements IPrincipal {
  /**
   * The role which is linked to the service account.
   */
  public readonly role: IRole;

  public readonly assumeRoleAction!: string;
  public readonly grantPrincipal!: IPrincipal;
  public readonly policyFragment!: PrincipalPolicyFragment;

  /**
   * The name of the service account.
   */
  public readonly serviceAccountName: string;

  /**
   * The namespace where the service account is located in.
   */
  public readonly serviceAccountNamespace: string;

  private readonly loadBalancerControllerTemplateURL?: string;

  constructor(scope: Construct, id: string, props: ServiceAccountProps) {
    super(scope, id);

    this.loadBalancerControllerTemplateURL = props.loadBalancerControllerTemplateURL;

    const { cluster } = props;
    this.serviceAccountName = props.name ?? Names.uniqueId(this).toLowerCase();
    this.serviceAccountNamespace = props.namespace ?? 'default';

    if (this.loadBalancerControllerTemplateURL) {
      const loadBalancerControllerStack = new LoadBalancerControllerNestedStack(this, 'LoadBalancerControllerRoleProvider', {
        templateURL: this.loadBalancerControllerTemplateURL,
        openIdConnectProviderRef: cluster.openIdConnectProvider.openIdConnectProviderArn,
      });
      this.role = Role.fromRoleArn(this, 'Role', loadBalancerControllerStack.eksLoadBalancerControllerRoleArn);
    } else {
      const conditionsValue = {
        [`${cluster.openIdConnectProvider.openIdConnectProviderIssuer}:aud`]: 'sts.amazonaws.com',
        [`${cluster.openIdConnectProvider.openIdConnectProviderIssuer}:sub`]: `system:serviceaccount:${this.serviceAccountNamespace}:${this.serviceAccountName}`,
      };

      let conditions;
      if (props.cluster.cfnJsonProviderTemplateURL) {
        const cfnJsonProvider = new CfnJsonProviderNestedStack(this, 'ConditionJsonProvider', {
          templateURL: props.cluster.cfnJsonProviderTemplateURL,
        });

        conditions = new CfnJsonCustomResource(this, 'ConditionJson', {
          serviceToken: cfnJsonProvider.serviceToken,
          value: conditionsValue,
        });
      } else {
        /* Add conditions to the role to improve security. This prevents other pods in the same namespace to assume the role.
        * See documentation: https://docs.aws.amazon.com/eks/latest/userguide/create-service-account-iam-policy-and-role.html
        */
        conditions = new CfnJson(this, 'ConditionJson', {
          value: conditionsValue,
        });
      }

      const principal = new OpenIdConnectPrincipal(cluster.openIdConnectProvider).withConditions({
        StringEquals: conditions,
      });
      this.role = new Role(this, 'Role', { assumedBy: principal });
      this.assumeRoleAction = this.role.assumeRoleAction;
      this.grantPrincipal = this.role.grantPrincipal;
      this.policyFragment = this.role.policyFragment;
    }

    // Note that we cannot use `cluster.addManifest` here because that would create the manifest
    // constrct in the scope of the cluster stack, which might be a different stack than this one.
    // This means that the cluster stack would depend on this stack because of the role,
    // and since this stack inherintely depends on the cluster stack, we will have a circular dependency.
    new KubernetesManifest(this, `manifest-${id}ServiceAccountResource`, {
      cluster,
      manifest: [{
        apiVersion: 'v1',
        kind: 'ServiceAccount',
        metadata: {
          name: this.serviceAccountName,
          namespace: this.serviceAccountNamespace,
          labels: {
            'app.kubernetes.io/name': this.serviceAccountName,
          },
          annotations: {
            'eks.amazonaws.com/role-arn': this.role.roleArn,
          },
        },
      }],
    });

  }

  /**
   * @deprecated use `addToPrincipalPolicy()`
   */
  public addToPolicy(statement: PolicyStatement): boolean {
    return this.addToPrincipalPolicy(statement).statementAdded;
  }

  public addToPrincipalPolicy(statement: PolicyStatement): AddToPrincipalPolicyResult {
    if (this.loadBalancerControllerTemplateURL) {
      throw new Error("Cannot call 'addToPrincipalPolicy' on Load Balancer Controller imported role");
    }

    return this.role.addToPrincipalPolicy(statement);
  }
}

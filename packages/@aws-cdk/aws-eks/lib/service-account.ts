import { AddToPrincipalPolicyResult, IPrincipal, IRole, OpenIdConnectPrincipal, PolicyStatement, PrincipalPolicyFragment, Role } from '@aws-cdk/aws-iam';
import { CfnJson, Names } from '@aws-cdk/core';
import { Construct } from 'constructs';
import { ICluster } from './cluster';
import { KubernetesManifest } from './k8s-manifest';

// v2 - keep this import as a separate section to reduce merge conflict when forward merging with the v2 branch.
// eslint-disable-next-line
import { Construct as CoreConstruct } from '@aws-cdk/core';

// eslint-disable-next-line
// import { CfnJsonProviderNestedStack } from './gs-extension/cfn-json-provider-nested-stack';
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
  readonly loadBalancerControllerRoleTemplateURL?: string;
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

  private readonly cfnJsonProviderTemplateURL?: string;
  private readonly loadBalancerControllerRoleTemplateURL?: string;

  constructor(scope: Construct, id: string, props: ServiceAccountProps) {
    super(scope, id);

    this.cfnJsonProviderTemplateURL = props.cfnJsonProviderTemplateURL;
    this.loadBalancerControllerRoleTemplateURL = props.loadBalancerControllerRoleTemplateURL;

    const { cluster } = props;
    this.serviceAccountName = props.name ?? Names.uniqueId(this).toLowerCase();
    this.serviceAccountNamespace = props.namespace ?? 'default';

    /* Add conditions to the role to improve security. This prevents other pods in the same namespace to assume the role.
    * See documentation: https://docs.aws.amazon.com/eks/latest/userguide/create-service-account-iam-policy-and-role.html
    */
    let conditions;
    if (this.cfnJsonProviderTemplateURL && this.loadBalancerControllerRoleTemplateURL) {
      const loadBalancerControllerStack = new LoadBalancerControllerNestedStack(this, 'LoadBalancerControllerRoleProvider', {
        templateURL: this.loadBalancerControllerRoleTemplateURL,
        openIdConnectProviderRef: cluster.openIdConnectProvider.openIdConnectProviderArn,
        subnets: cluster.kubectlPrivateSubnets,
        securityGroup: cluster.clusterHandlerSecurityGroup,
      });
      this.role = Role.fromRoleArn(this, 'Role', loadBalancerControllerStack.eksLoadBalancerControllerRoleArn);
    } else {
      // TODO: Handle case where customer uses a custom ServiceAccount
      conditions = new CfnJson(this, 'ConditionJson', {
        value: {
          [`${cluster.openIdConnectProvider.openIdConnectProviderIssuer}:aud`]: 'sts.amazonaws.com',
          [`${cluster.openIdConnectProvider.openIdConnectProviderIssuer}:sub`]: `system:serviceaccount:${this.serviceAccountNamespace}:${this.serviceAccountName}`,
        },
      });
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
    if (this.cfnJsonProviderTemplateURL && this.loadBalancerControllerRoleTemplateURL) {
      throw new Error("Cannot call 'addToPrincipalPolicy' on Load Balancer Controller imported role");
    }

    return this.role.addToPrincipalPolicy(statement);
  }
}

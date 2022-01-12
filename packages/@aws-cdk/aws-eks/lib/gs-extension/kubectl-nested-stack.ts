import * as iam from '@aws-cdk/aws-iam';
import { CfnStack, Fn, RemovalPolicy, Token } from '@aws-cdk/core';
import { ICluster } from '../cluster';
import { IKubectlProvider } from '../kubectl-provider';

// v2 - keep this import as a separate section to reduce merge conflict when forward merging with the v2 branch.
// eslint-disable-next-line
import { Construct as CoreConstruct } from '@aws-cdk/core';

export interface KubectlNestedStackProps {
  templateURL: string;
  clusterCreationRole: iam.IRole;
  cluster: ICluster;

  removalPolicy?: RemovalPolicy;
}

const PROVIDER_ARN_OUTPUT_NAME = 'Outputs.KubectlProviderframeworkonEventC84E6CE2Arn';
const HANDLER_ROLE_ARN_OUTPUT_NAME = 'Outputs.HandlerServiceRoleFCDC14AEArn';

export class KubectlNestedStack extends CoreConstruct implements IKubectlProvider {
  private readonly resource: CfnStack;

  constructor(
    scope: CoreConstruct,
    id: string,
    private readonly props: KubectlNestedStackProps,
  ) {
    super(scope, id);

    if (!props.cluster.kubectlPrivateSubnets || props.cluster.kubectlPrivateSubnets.length === 0) {
      throw new Error(`Subnets must be provided to use "kubectlProviderTemplateURL" S3 nested stack template.
       Ensure placeClusterHandlerInVpc is set to true.`);
    }

    if (!props.cluster.clusterHandlerSecurityGroup) {
      throw new Error(`Security group must be provided to use "kubectlProviderTemplateURL" S3 nested stack template.
       Ensure placeClusterHandlerInVpc is set to true and clusterHandlerSecurityGroup is specified`);
    }


    const parentScope = new CoreConstruct(scope, id + '.NestedStack');

    this.resource = new CfnStack(parentScope, `${id}.NestedStackResource`, {
      templateUrl: props.templateURL,
      parameters: {
        ClusterArn: props.cluster.clusterArn,
        ClusterCreationRoleArn: props.clusterCreationRole.roleArn,
        SubnetIds: Fn.join(',', props.cluster.kubectlPrivateSubnets.map(subnet => subnet.subnetId)),
        SecurityGroupIds: Fn.join(',', [props.cluster.clusterHandlerSecurityGroup.securityGroupId]),
      },
    });
    this.resource.applyRemovalPolicy(props.removalPolicy ?? RemovalPolicy.DESTROY);
  }

  /**
   * Helper method to conform to the IKubectlProvider interface and
   * the custom resource service token for this provider.
   */
  public get serviceToken() {
    return Token.asString(
      this.resource.getAtt(PROVIDER_ARN_OUTPUT_NAME),
    );
  }

  /**
   * Helper method to conform to the IKubectlProvider interface and
   * return the roleArn of the attached role
   */
  public get roleArn() {
    return this.props.clusterCreationRole.roleArn;
  }

  /**
   * Helper method to conform to the IKubectlProvider interface and
   * return the roleArn of the attached role
   */
  public get handlerRole() {
    return iam.Role.fromRoleArn(
      this,
      'HandlerRole',
      Token.asString(
        this.resource.getAtt(HANDLER_ROLE_ARN_OUTPUT_NAME),
      ),
    );
  }
}

import * as ec2 from '@aws-cdk/aws-ec2';
import * as iam from '@aws-cdk/aws-iam';
import { CfnStack, Fn, RemovalPolicy, Token } from '@aws-cdk/core';

// v2 - keep this import as a separate section to reduce merge conflict when forward merging with the v2 branch.
// eslint-disable-next-line
import { Construct as CoreConstruct } from '@aws-cdk/core';

export interface ClusterResourceNestedStackProps {
  // templateUrl: string;
  clusterCreationRole: iam.IRole;
  subnets?: ec2.ISubnet[];
  securityGroup?: ec2.ISecurityGroup;

  removalPolicy?: RemovalPolicy;
}

const CLUSTER_RESOURCE_NESTED_STACK_TEMPLATE_URL = '';

const PROVIDER_ARN_OUTPUT_NAME = 'Outputs.ClusterResourceProviderframeworkonEventC6B02E13Arn';

export class ClusterResourceNestedStack extends CoreConstruct {
  private readonly resource: CfnStack;

  constructor(
    scope: CoreConstruct,
    id: string,
    props: ClusterResourceNestedStackProps,
  ) {
    super(scope, id);

    // Validate kubectlPrivateSubnets and clusterHandlerSecurityGroup are set

    const parentScope = new CoreConstruct(scope, id + '.NestedStack');

    this.resource = new CfnStack(parentScope, `${id}.NestedStackResource`, {
      templateUrl: CLUSTER_RESOURCE_NESTED_STACK_TEMPLATE_URL,
      parameters: {
        ClusterCreationRoleArn: props.clusterCreationRole.roleArn,
        SubnetIds: Fn.join(',', props.subnets!.map(subnet => subnet.subnetId)),
        SecurityGroupIds: Fn.join(',', [props.securityGroup!.securityGroupId]),
      },
    });
    this.resource.applyRemovalPolicy(props.removalPolicy ?? RemovalPolicy.DESTROY);
  }

  /**
   * The custom resource service token for this provider.
   */
  public get serviceToken() {
    return Token.asString(
      this.resource.getAtt(PROVIDER_ARN_OUTPUT_NAME),
    );
  }
}

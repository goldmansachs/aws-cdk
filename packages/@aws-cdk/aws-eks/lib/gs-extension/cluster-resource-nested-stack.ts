import * as ec2 from '@aws-cdk/aws-ec2';
import * as iam from '@aws-cdk/aws-iam';
import { CfnStack, Fn, RemovalPolicy, Token } from '@aws-cdk/core';

// v2 - keep this import as a separate section to reduce merge conflict when forward merging with the v2 branch.
// eslint-disable-next-line
import { Construct as CoreConstruct } from '@aws-cdk/core';

export interface ClusterResourceNestedStackProps {
  templateURL: string;
  clusterCreationRole: iam.IRole;
  subnets?: ec2.ISubnet[];
  securityGroup?: ec2.ISecurityGroup;

  removalPolicy?: RemovalPolicy;
}

const PROVIDER_ARN_OUTPUT_NAME = 'Outputs.ClusterResourceProviderframeworkonEventC6B02E13Arn';

export class ClusterResourceNestedStack extends CoreConstruct {
  private readonly resource: CfnStack;

  constructor(
    scope: CoreConstruct,
    id: string,
    props: ClusterResourceNestedStackProps,
  ) {
    super(scope, id);

    if (!props.subnets || props.subnets.length === 0) {
      throw new Error(`Subnets must be provided to use "clusterResourceProviderTemplateURL" S3 nested stack template.
       Ensure placeClusterHandlerInVpc is set to true.`);
    }

    if (!props.securityGroup) {
      throw new Error(`Security group must be provided to use "clusterResourceProviderTemplateURL" S3 nested stack template.
       Ensure placeClusterHandlerInVpc is set to true and clusterHandlerSecurityGroup is specified`);
    }

    const parentScope = new CoreConstruct(scope, id + '.NestedStack');

    this.resource = new CfnStack(parentScope, `${id}.NestedStackResource`, {
      templateUrl: props.templateURL,
      parameters: {
        ClusterCreationRoleArn: props.clusterCreationRole.roleArn,
        SubnetIds: Fn.join(',', props.subnets.map(subnet => subnet.subnetId)),
        SecurityGroupIds: Fn.join(',', [props.securityGroup.securityGroupId]),
      },
    });
    this.resource.applyRemovalPolicy(props.removalPolicy ?? RemovalPolicy.DESTROY);
  }

  /**
   * Helper method to conform to the ClusterResourceProvider interface and
   * the custom resource service token for this provider.
   */
  public get serviceToken() {
    return Token.asString(
      this.resource.getAtt(PROVIDER_ARN_OUTPUT_NAME),
    );
  }
}

import * as ec2 from '@aws-cdk/aws-ec2';
import { CfnStack, Fn, RemovalPolicy, Token } from '@aws-cdk/core';

// v2 - keep this import as a separate section to reduce merge conflict when forward merging with the v2 branch.
// eslint-disable-next-line
import { Construct as CoreConstruct } from '@aws-cdk/core';

export interface LoadBalancerControllerNestedStackProps {
  templateURL: string;
  openIdConnectProviderRef: string;
  subnets?: ec2.ISubnet[];
  securityGroup?: ec2.ISecurityGroup;

  removalPolicy?: RemovalPolicy;
}

const EKS_LOAD_BALANCER_CONTROLLER_ROLE_ARN_OUTPUT_NAME = 'Outputs.EKSAlbControllerRoleArn';

export class LoadBalancerControllerNestedStack extends CoreConstruct {
  private readonly resource: CfnStack;

  constructor(
    scope: CoreConstruct,
    id: string,
    props: LoadBalancerControllerNestedStackProps,
  ) {
    super(scope, id);

    if (!props.subnets || props.subnets.length === 0) {
      throw new Error(`Subnets must be provided to use S3 nested stack template.
       Ensure placeClusterHandlerInVpc is set to true.`);
    }

    if (!props.securityGroup) {
      throw new Error(`Security group must be provided to use S3 nested stack template.
       Ensure placeClusterHandlerInVpc is set to true and clusterHandlerSecurityGroup is specified`);
    }

    const parentScope = new CoreConstruct(scope, id + '.NestedStack');

    this.resource = new CfnStack(parentScope, `${id}.NestedStackResource`, {
      templateUrl: props.templateURL,
      parameters: {
        OpenIdConnectProvider: props.openIdConnectProviderRef,
        SubnetIds: Fn.join(',', props.subnets.map(subnet => subnet.subnetId)),
        SecurityGroupIds: Fn.join(',', [props.securityGroup.securityGroupId]),
      },
    });
    this.resource.applyRemovalPolicy(props.removalPolicy ?? RemovalPolicy.DESTROY);
  }

  /**
   * Load Balancer Controller role arn
   */
  public get eksLoadBalancerControllerRoleArn() {
    return Token.asString(
      this.resource.getAtt(EKS_LOAD_BALANCER_CONTROLLER_ROLE_ARN_OUTPUT_NAME),
    );
  }
}

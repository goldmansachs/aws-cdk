import { CfnStack, RemovalPolicy, Token } from '@aws-cdk/core';

// v2 - keep this import as a separate section to reduce merge conflict when forward merging with the v2 branch.
// eslint-disable-next-line
import { Construct as CoreConstruct } from '@aws-cdk/core';

export interface LoadBalancerControllerNestedStackProps {
  templateURL: string;
  openIdConnectProviderRef: string;

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

    const parentScope = new CoreConstruct(scope, id + '.NestedStack');

    this.resource = new CfnStack(parentScope, `${id}.NestedStackResource`, {
      templateUrl: props.templateURL,
      parameters: {
        OpenIdConnectProvider: props.openIdConnectProviderRef,
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

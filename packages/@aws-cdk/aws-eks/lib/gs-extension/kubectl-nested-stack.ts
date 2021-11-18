import * as iam from '@aws-cdk/aws-iam';
import { CfnStack, Fn, RemovalPolicy, Token } from '@aws-cdk/core';
import { ICluster } from '../cluster';

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

export class KubectlNestedStack extends CoreConstruct {
  private readonly resource: CfnStack;

  constructor(
    scope: CoreConstruct,
    id: string,
    props: KubectlNestedStackProps,
  ) {
    super(scope, id);

    // Validate kubectlPrivateSubnets and clusterHandlerSecurityGroup are set

    const parentScope = new CoreConstruct(scope, id + '.NestedStack');

    this.resource = new CfnStack(parentScope, `${id}.NestedStackResource`, {
      templateUrl: props.templateURL,
      parameters: {
        ClusterArn: props.cluster.clusterArn,
        ClusterCreationRoleArn: props.clusterCreationRole.roleArn,
        SubnetIds: Fn.join(',', props.cluster.kubectlPrivateSubnets!.map(subnet => subnet.subnetId)),
        SecurityGroupIds: Fn.join(',', [props.cluster.clusterHandlerSecurityGroup!.securityGroupId]),
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

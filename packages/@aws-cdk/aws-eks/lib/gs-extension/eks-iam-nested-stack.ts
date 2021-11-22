import * as iam from '@aws-cdk/aws-iam';
import * as kms from '@aws-cdk/aws-kms';
import { CfnStack, RemovalPolicy, Token } from '@aws-cdk/core';

// v2 - keep this import as a separate section to reduce merge conflict when forward merging with the v2 branch.
// eslint-disable-next-line
import { Construct as CoreConstruct } from '@aws-cdk/core';

export interface EKSRolesNestedStackProps {
  templateUrl: string;
  key?: kms.IKey;
  podExecutionRole?: iam.IRole

  removalPolicy?: RemovalPolicy;
}

const CLUSTER_CREATION_ROLE_ARN_OUTPUT_NAME = 'Outputs.ClusterCreationRoleArn';
const MASTERS_ROLE_ARN_OUTPUT_NAME = 'Outputs.MastersRoleArn';
const EKS_SERVICE_ROLE_ARN_OUTPUT_NAME = 'Outputs.EKSServiceArn';

export class EKSRolesNestedStack extends CoreConstruct {
  private readonly resource: CfnStack;

  constructor(
    scope: CoreConstruct,
    id: string,
    props: EKSRolesNestedStackProps,
  ) {
    super(scope, id);


    const parentScope = new CoreConstruct(scope, id + '.NestedStack');

    this.resource = new CfnStack(parentScope, `${id}.NestedStackResource`, {
      templateUrl: props.templateUrl,
      parameters: {
        SecretKeyArn: props.key!.keyArn,
      },
    });
    this.resource.applyRemovalPolicy(props.removalPolicy ?? RemovalPolicy.DESTROY);
  }

  /**
   * The creation role for this cluster.
   */
  public get clusterCreationRoleArn() {
    return Token.asString(
      this.resource.getAtt(CLUSTER_CREATION_ROLE_ARN_OUTPUT_NAME),
    );
  }

  /**
   * The masters role for aws-auth config map.
   */
  public get mastersRoleArn() {
    return Token.asString(
      this.resource.getAtt(MASTERS_ROLE_ARN_OUTPUT_NAME),
    );
  }

  /**
   * The service role needed for EKS.
   */
  public get eksServiceRoleArn() {
    return Token.asString(
      this.resource.getAtt(EKS_SERVICE_ROLE_ARN_OUTPUT_NAME),
    );
  }

}

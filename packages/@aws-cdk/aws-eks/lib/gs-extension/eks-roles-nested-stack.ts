import * as kms from '@aws-cdk/aws-kms';
import { CfnStack, RemovalPolicy, Token } from '@aws-cdk/core';

// v2 - keep this import as a separate section to reduce merge conflict when forward merging with the v2 branch.
// eslint-disable-next-line
import { Construct as CoreConstruct } from '@aws-cdk/core';

export interface EksRolesNestedStackProps {
  templateUrl: string;
  key?: kms.IKey;

  removalPolicy?: RemovalPolicy;
}

const CLUSTER_CREATION_ROLE_ARN_OUTPUT_NAME = 'Outputs.EKSClusterCreationRoleArn';
const EKS_SERVICE_ROLE_ARN_OUTPUT_NAME = 'Outputs.EKSServiceRoleArn';
const MASTERS_ROLE_ARN_OUTPUT_NAME = 'Outputs.EKSMastersRoleArn';
const EKS_POD_EXECUTION_ROLE_ARN_OUTPUT_NAME = 'Outputs.EKSPodExecutionRoleArn';

export class EksRolesNestedStack extends CoreConstruct {
  private readonly resource: CfnStack;

  constructor(
    scope: CoreConstruct,
    id: string,
    props: EksRolesNestedStackProps,
  ) {
    super(scope, id);

    if (!props.key) {
      throw new Error(`KMS Key must be provided to use S3 nested stack template.
       Ensure secretsEncryptionKey is set.`);
    }

    const parentScope = new CoreConstruct(scope, id + '.NestedStack');

    this.resource = new CfnStack(parentScope, `${id}.NestedStackResource`, {
      templateUrl: props.templateUrl,
      parameters: {
        SecretKeyArn: props.key.keyArn,
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

  /**
   * Pod execution role required for EKS Fargate
   */
  public get eksPodExecutionRoleArn() {
    return Token.asString(
      this.resource.getAtt(EKS_POD_EXECUTION_ROLE_ARN_OUTPUT_NAME),
    );
  }

}

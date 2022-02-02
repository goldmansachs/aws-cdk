import { CfnStack, RemovalPolicy, Token } from '@aws-cdk/core';

// v2 - keep this import as a separate section to reduce merge conflict when forward merging with the v2 branch.
// eslint-disable-next-line
import { Construct as CoreConstruct } from '@aws-cdk/core';

export interface CfnJsonProviderNestedStackProps {
  templateURL: string;

  removalPolicy?: RemovalPolicy;
}

const PROVIDER_ARN_OUTPUT_NAME = 'Outputs.AWSCDKCfnUtilsProviderArn';

export class CfnJsonProviderNestedStack extends CoreConstruct {
  private readonly resource: CfnStack;

  constructor(
    scope: CoreConstruct,
    id: string,
    props: CfnJsonProviderNestedStackProps,
  ) {
    super(scope, id);

    const parentScope = new CoreConstruct(scope, id + '.NestedStack');

    this.resource = new CfnStack(parentScope, `${id}.NestedStackResource`, {
      templateUrl: props.templateURL,
    });
    this.resource.applyRemovalPolicy(props.removalPolicy ?? RemovalPolicy.DESTROY);
  }

  /**
   * Helper method to conform to the OidcProvider interface and
   * the custom resource service token for this provider.
   */
  public get serviceToken() {
    return Token.asString(
      this.resource.getAtt(PROVIDER_ARN_OUTPUT_NAME),
    );
  }
}

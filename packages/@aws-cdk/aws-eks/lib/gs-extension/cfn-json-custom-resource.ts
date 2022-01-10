import { CfnResource, IResolveContext, Reference, RemovalPolicy, Stack } from '@aws-cdk/core';

// v2 - keep this import as a separate section to reduce merge conflict when forward merging with the v2 branch.
// eslint-disable-next-line
import { Construct as CoreConstruct } from '@aws-cdk/core';

export interface CfnJsonCustomResourceProps {
  serviceToken: string;
  value: any;

  removalPolicy?: RemovalPolicy;
}

export class CfnJsonCustomResource extends CoreConstruct {
  public readonly value: Reference;

  private readonly resource: CfnResource;
  private readonly jsonString: string;

  constructor(
    scope: CoreConstruct,
    id: string,
    props: CfnJsonCustomResourceProps,
  ) {
    super(scope, id);

    this.jsonString = Stack.of(this).toJsonString(props.value);

    this.resource = new CfnResource(this, 'Resource', {
      type: 'Custom::AWSCDKCfnJson',
      properties: {
        ServiceToken: props.serviceToken,
        Value: this.jsonString,
      },
    });
    this.resource.applyRemovalPolicy(props.removalPolicy ?? RemovalPolicy.DESTROY);

    this.value = this.resource.getAtt('Value');
  }

  /**
   * This is required in case someone JSON.stringifys an object which refrences
   * this object. Otherwise, we'll get a cyclic JSON reference.
   */
  public toJSON() {
    return this.jsonString;
  }

  public resolve(_: IResolveContext): any {
    return this.value;
  }
}

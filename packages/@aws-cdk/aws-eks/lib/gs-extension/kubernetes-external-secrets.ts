import { Construct } from 'constructs';
import { Cluster } from '../cluster';
import { HelmChart, HelmChartOptions } from '../helm-chart';
import { ServiceAccount } from '../service-account';

// v2 - keep this import as a separate section to reduce merge conflict when forward merging with the v2 branch.
// eslint-disable-next-line
import { Construct as CoreConstruct, Names, Stack } from '@aws-cdk/core';

/**
 * Properties for `KubernetesExternalSecrets`.
 */
export interface KubernetesExternalSecretsProps {
  /**
   * Kubernetes namespace for external secrets
   *
   * @default - kube-system
   */
  readonly namespace?: string;

  /**
 * [disable-awslint:ref-via-interface]
 * Cluster to install the controller onto.
 */
  readonly cluster: Cluster;

  /**
   * Service account to use for external secrets
   *
   * @default - ServiceAccount is created
   */
  readonly serviceAccount?: ServiceAccount;

  // using a subset of HelmChartOptions since we only want certain props passed
  // in
  /**
   * helm chart props override to allow using chart from S3 asset
   *
   * @default - Pulls helm chart from https://external-secrets.github.io/kubernetes-external-secrets
   */
  readonly helmChartProps?: HelmChartOptions
}

/**
 * Construct for installing the Kubernetes external secrets on EKS clusters.
 *
 * Use the factory functions `get` and `getOrCreate` to obtain/create instances of this external secrets.
 *
 * @see https://github.com/external-secrets/kubernetes-external-secrets
 *
 */
export class KubernetesExternalSecrets extends CoreConstruct {

  /**
   * Create the controller construct associated with this cluster and scope.
   *
   * Singleton per stack/cluster.
   */
  public static create(scope: Construct, props: KubernetesExternalSecretsProps) {
    const stack = Stack.of(scope);
    const uid = KubernetesExternalSecrets.uid(props.cluster);
    return new KubernetesExternalSecrets(stack, uid, props);
  }

  private static uid(cluster: Cluster) {
    return `${Names.nodeUniqueId(cluster.node)}-ExternalSecrets`;
  }

  /**
   * Service account for KubernetesExternalSecrets
   */
  public readonly serviceAccount: ServiceAccount;

  public constructor(
    scope: Construct,
    id: string,
    props: KubernetesExternalSecretsProps,
  ) {
    super(scope, id);

    const region = Stack.of(this).region;

    const namespace = props.namespace ?? 'kube-system';
    this.serviceAccount =
      props.serviceAccount ??
      new ServiceAccount(this, 'k8s-external-secrets-sa', {
        namespace,
        name: 'kubernetes-external-secrets',
        cluster: props.cluster,
      });

    const chart = new HelmChart(this, 'Resource', {
      cluster: props.cluster,
      chartAsset: props.helmChartProps?.chartAsset,
      chart: props.helmChartProps?.chartAsset ? undefined : 'kubernetes-external-secrets',
      repository: props.helmChartProps?.chartAsset ? undefined : 'https://external-secrets.github.io/kubernetes-external-secrets',
      release: props.helmChartProps?.chartAsset ? undefined : 'kubernetes-external-secrets',

      // latest at the time of writing
      version: props.helmChartProps?.chartAsset ? undefined : '8.5.2',

      namespace,
      values: {
        serviceAccount: {
          create: false,
          name: this.serviceAccount.serviceAccountName,
        },
        env: {
          AWS_REGION: region,
          AWS_DEFAULT_REGION: region,
        },
      },
    });

    // the secrets rely on permissions deployed using these resources.
    chart.node.addDependency(this.serviceAccount);
    chart.node.addDependency(props.cluster.openIdConnectProvider);
  }
}

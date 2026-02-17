import type { Logger } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';

import { exec } from 'child_process';
import { promisify } from 'util';

import { execHelmCommand, forceDeleteHelmReleaseRecord, getHelmReleaseStatus, hasDeployedHelmRelease } from './helm.js';
import { deleteResourceByLabel, getChartDir, waitForResourceByLabel } from './k8s.js';

const execAsync = promisify(exec);

export async function restartBot(namespace: string, log: Logger) {
  log.info(`Restarting bot`);
  await deleteResourceByLabel({ resource: 'pods', namespace, label: 'app.kubernetes.io/name=bot' });
  await sleep(10 * 1000);
  // Some bot images may take time to report Ready due to heavy boot-time proving.
  // Waiting for PodReadyToStartContainers ensures the pod is scheduled and starting without blocking on full readiness.
  await waitForResourceByLabel({
    resource: 'pods',
    namespace,
    label: 'app.kubernetes.io/name=bot',
    condition: 'PodReadyToStartContainers',
  });
  log.info(`Bot restarted`);
}

/**
 * Installs or upgrades the transfer bot Helm release for the given namespace.
 * Intended for test setup to enable L2 traffic generation only when needed.
 */
export async function installTransferBot({
  namespace,
  spartanDir,
  logger: log,
  replicas = 1,
  txIntervalSeconds = 10,
  followChain = 'CHECKPOINTED',
  mnemonic = process.env.LABS_INFRA_MNEMONIC ?? 'test test test test test test test test test test test junk',
  mnemonicStartIndex,
  botPrivateKey = process.env.BOT_TRANSFERS_L2_PRIVATE_KEY ?? '0xcafe01',
  nodeUrl,
  timeout = '15m',
  reuseValues = true,
  aztecSlotDuration = Number(process.env.AZTEC_SLOT_DURATION ?? 12),
}: {
  namespace: string;
  spartanDir: string;
  logger: Logger;
  replicas?: number;
  txIntervalSeconds?: number;
  followChain?: string;
  mnemonic?: string;
  mnemonicStartIndex?: number | string;
  botPrivateKey?: string;
  nodeUrl?: string;
  timeout?: string;
  reuseValues?: boolean;
  aztecSlotDuration?: number;
}) {
  const instanceName = `${namespace}-bot-transfers`;
  const helmChartDir = getChartDir(spartanDir, 'aztec-bot');
  const resolvedNodeUrl = nodeUrl ?? `http://${namespace}-rpc-aztec-node.${namespace}.svc.cluster.local:8080`;

  log.info(`Installing/upgrading transfer bot: replicas=${replicas}, followChain=${followChain}`);

  const values: Record<string, string | number | boolean> = {
    'bot.replicaCount': replicas,
    'bot.txIntervalSeconds': txIntervalSeconds,
    'bot.followChain': followChain,
    'bot.botPrivateKey': botPrivateKey,
    'bot.nodeUrl': resolvedNodeUrl,
    'bot.mnemonic': mnemonic,
    'bot.feePaymentMethod': 'fee_juice',
    'aztec.slotDuration': aztecSlotDuration,
    // Ensure bot can reach its own PXE started in-process (default rpc.port is 8080)
    // Note: since aztec-bot depends on aztec-node with alias `bot`, env vars go under `bot.node.env`.
    'bot.node.env.BOT_PXE_URL': 'http://127.0.0.1:8080',
    // Provide L1 execution RPC for bridging fee juice
    'bot.node.env.ETHEREUM_HOSTS': `http://${namespace}-eth-execution.${namespace}.svc.cluster.local:8545`,
    // Provide L1 mnemonic for bridging (falls back to labs mnemonic)
    'bot.node.env.BOT_L1_MNEMONIC': mnemonic,

    // The bot does not need Kubernetes API access. Disable RBAC + ServiceAccount creation so the chart
    // can be installed by users without cluster-scoped RBAC permissions.
    'bot.rbac.create': false,
    'bot.serviceAccount.create': false,
    'bot.serviceAccount.name': 'default',
  };
  // Ensure we derive a funded L1 key (index 0 is funded on anvil default mnemonic)
  if (mnemonicStartIndex === undefined) {
    values['bot.mnemonicStartIndex'] = 0;
  }
  // Also pass a funded private key directly if available
  if (process.env.FUNDING_PRIVATE_KEY) {
    values['bot.node.env.BOT_L1_PRIVATE_KEY'] = process.env.FUNDING_PRIVATE_KEY;
  }
  // Align bot image with the running network image: prefer env var, else detect from a validator pod
  let repositoryFromEnv: string | undefined;
  let tagFromEnv: string | undefined;
  const aztecDockerImage = process.env.AZTEC_DOCKER_IMAGE;
  if (aztecDockerImage && aztecDockerImage.includes(':')) {
    const lastColon = aztecDockerImage.lastIndexOf(':');
    repositoryFromEnv = aztecDockerImage.slice(0, lastColon);
    tagFromEnv = aztecDockerImage.slice(lastColon + 1);
  }

  let repository = repositoryFromEnv;
  let tag = tagFromEnv;
  if (!repository || !tag) {
    try {
      const { stdout } = await execAsync(
        `kubectl get pods -l app.kubernetes.io/name=validator -n ${namespace} -o jsonpath='{.items[0].spec.containers[?(@.name=="aztec")].image}' | cat`,
      );
      const image = stdout.trim().replace(/^'|'$/g, '');
      if (image && image.includes(':')) {
        const lastColon = image.lastIndexOf(':');
        repository = image.slice(0, lastColon);
        tag = image.slice(lastColon + 1);
      }
    } catch (err) {
      log.warn(`Could not detect aztec image from validator pod: ${String(err)}`);
    }
  }
  if (repository && tag) {
    values['global.aztecImage.repository'] = repository;
    values['global.aztecImage.tag'] = tag;
  }
  if (mnemonicStartIndex !== undefined) {
    values['bot.mnemonicStartIndex'] =
      typeof mnemonicStartIndex === 'string' ? mnemonicStartIndex : Number(mnemonicStartIndex);
  }

  // If a previous install attempt left the release in a non-deployed state (e.g. FAILED),
  // `helm upgrade --install` can error with "has no deployed releases".
  // In that case, clear the release record and do a clean install.
  const existingStatus = await getHelmReleaseStatus(instanceName, namespace);
  if (existingStatus && existingStatus.toLowerCase() !== 'deployed') {
    log.warn(`Transfer bot release ${instanceName} is in status '${existingStatus}'. Reinstalling cleanly.`);
    await execAsync(`helm uninstall ${instanceName} --namespace ${namespace} --wait --ignore-not-found`).catch(
      () => undefined,
    );
    // If helm left the release in `uninstalling`, force-delete the record so we can reinstall.
    const afterUninstallStatus = await getHelmReleaseStatus(instanceName, namespace);
    if (afterUninstallStatus?.toLowerCase() === 'uninstalling') {
      await forceDeleteHelmReleaseRecord(instanceName, namespace, log);
    }
  }

  // `--reuse-values` fails if the release has never successfully deployed (e.g. first install, or a previous failed install).
  // Only reuse values when we have a deployed release to reuse from.
  const effectiveReuseValues = reuseValues && (await hasDeployedHelmRelease(instanceName, namespace));

  await execHelmCommand({
    instanceName,
    helmChartDir,
    namespace,
    valuesFile: undefined,
    timeout,
    values: values as unknown as Record<string, string | number | boolean>,
    reuseValues: effectiveReuseValues,
  });

  if (replicas > 0) {
    await waitForResourceByLabel({
      resource: 'pods',
      namespace,
      label: 'app.kubernetes.io/name=bot',
      condition: 'PodReadyToStartContainers',
    });
  }
}

/**
 * Uninstalls the transfer bot Helm release from the given namespace.
 * Intended for test teardown to clean up bot resources.
 */
export async function uninstallTransferBot(namespace: string, log: Logger) {
  const instanceName = `${namespace}-bot-transfers`;
  log.info(`Uninstalling transfer bot release ${instanceName}`);
  await execAsync(`helm uninstall ${instanceName} --namespace ${namespace} --wait --ignore-not-found`);
  // Ensure any leftover pods are removed
  await deleteResourceByLabel({ resource: 'pods', namespace, label: 'app.kubernetes.io/name=bot' }).catch(
    () => undefined,
  );
}

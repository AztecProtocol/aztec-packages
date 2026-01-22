import { createLogger } from '@aztec/aztec.js/log';
import type { Logger } from '@aztec/foundation/log';

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const logger = createLogger('e2e:k8s-utils');

function shellQuote(value: string) {
  // Single-quote safe shell escaping: ' -> '\''
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function valuesToArgs(values: Record<string, string | number | boolean>) {
  return Object.entries(values)
    .map(([key, value]) =>
      typeof value === 'number' || typeof value === 'boolean'
        ? `--set ${key}=${value}`
        : `--set-string ${key}=${shellQuote(String(value))}`,
    )
    .join(' ');
}

export function createHelmCommand({
  instanceName,
  helmChartDir,
  namespace,
  valuesFile,
  timeout,
  values,
  reuseValues = false,
}: {
  instanceName: string;
  helmChartDir: string;
  namespace: string;
  valuesFile: string | undefined;
  timeout: string;
  values: Record<string, string | number | boolean>;
  reuseValues?: boolean;
}) {
  const valuesFileArgs = valuesFile ? `--values ${helmChartDir}/values/${valuesFile}` : '';
  const reuseValuesArgs = reuseValues ? '--reuse-values' : '';
  return `helm upgrade --install ${instanceName} ${helmChartDir} --namespace ${namespace} ${valuesFileArgs} ${reuseValuesArgs} --wait --timeout=${timeout} ${valuesToArgs(
    values,
  )}`;
}

export async function execHelmCommand(args: Parameters<typeof createHelmCommand>[0]) {
  const helmCommand = createHelmCommand(args);
  logger.info(`helm command: ${helmCommand}`);
  const { stdout } = await execAsync(helmCommand);
  return stdout;
}

export async function getHelmReleaseStatus(instanceName: string, namespace: string): Promise<string | undefined> {
  try {
    const { stdout } = await execAsync(
      `helm list --namespace ${namespace} --all --filter '^${instanceName}$' --output json | cat`,
    );
    const parsed = JSON.parse(stdout) as Array<{ name?: string; status?: string }>;
    const row = parsed.find(r => r.name === instanceName);
    return row?.status;
  } catch {
    return undefined;
  }
}

export async function forceDeleteHelmReleaseRecord(instanceName: string, namespace: string, log?: Logger) {
  const labelSelector = `owner=helm,name=${instanceName}`;
  const cmd = `kubectl delete secret -n ${namespace} -l ${labelSelector} --ignore-not-found=true`;
  (log ?? logger).warn(`Force deleting Helm release record: ${cmd}`);
  await execAsync(cmd).catch(() => undefined);
}

export async function hasDeployedHelmRelease(instanceName: string, namespace: string): Promise<boolean> {
  try {
    const status = await getHelmReleaseStatus(instanceName, namespace);
    return status?.toLowerCase() === 'deployed';
  } catch {
    return false;
  }
}

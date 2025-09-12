import type { NamespacedApiHandlers } from '@aztec/foundation/json-rpc/server';
import type { LogFn } from '@aztec/foundation/log';
import {
  type CliPXEOptions,
  type PXEService,
  type PXEServiceConfig,
  allPxeConfigMappings,
  createPXEService,
} from '@aztec/pxe/server';
import { type AztecNode, PXESchema, createAztecNodeClient } from '@aztec/stdlib/interfaces/client';
import { makeTracedFetch } from '@aztec/telemetry-client';

import { extractRelevantOptions } from '../util.js';
import { getVersions } from '../versioning.js';

export type { PXEServiceConfig, CliPXEOptions };

export async function startPXE(
  options: any,
  signalHandlers: (() => Promise<void>)[],
  services: NamespacedApiHandlers,
  userLog: LogFn,
): Promise<{ pxe: PXEService; config: PXEServiceConfig & CliPXEOptions }> {
  return await addPXE(options, signalHandlers, services, userLog, {});
}

export async function addPXE(
  options: any,
  _signalHandlers: (() => Promise<void>)[],
  services: NamespacedApiHandlers,
  userLog: LogFn,
  deps: { node?: AztecNode } = {},
): Promise<{ pxe: PXEService; config: PXEServiceConfig & CliPXEOptions }> {
  const pxeConfig = extractRelevantOptions<PXEServiceConfig & CliPXEOptions>(options, allPxeConfigMappings, 'pxe');
  const nodeUrl = pxeConfig.nodeUrl;

  if (!nodeUrl && !deps.node) {
    userLog('Aztec Node URL (nodeUrl | AZTEC_NODE_URL) option is required to start PXE without --node option');
    process.exit(1);
  }

  const node = deps.node ?? createAztecNodeClient(nodeUrl!, getVersions(pxeConfig), makeTracedFetch([1, 2, 3], true));
  const pxe = await createPXEService(node, pxeConfig as PXEServiceConfig);

  // Add PXE to services list
  services.pxe = [pxe, PXESchema];

  return { pxe, config: pxeConfig };
}

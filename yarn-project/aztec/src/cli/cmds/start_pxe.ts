import type { NamespacedApiHandlers } from '@aztec/foundation/json-rpc/server';
import type { LogFn } from '@aztec/foundation/log';
import { type CliPXEOptions, type PXEServiceConfig, allPxeConfigMappings, createPXEService } from '@aztec/pxe/server';
import { type AztecNode, PXESchema, createAztecNodeClient } from '@aztec/stdlib/interfaces/client';
import { makeTracedFetch } from '@aztec/telemetry-client';
import { TestWallet } from '@aztec/test-wallet';

import { extractRelevantOptions } from '../util.js';
import { getVersions } from '../versioning.js';

export type { CliPXEOptions, PXEServiceConfig };

export async function startPXEServiceGetWallet(
  options: any,
  services: NamespacedApiHandlers,
  userLog: LogFn,
  deps: { node?: AztecNode } = {},
): Promise<{ wallet: TestWallet; config: PXEServiceConfig & CliPXEOptions }> {
  const pxeConfig = extractRelevantOptions<PXEServiceConfig & CliPXEOptions>(options, allPxeConfigMappings, 'pxe');
  const nodeUrl = pxeConfig.nodeUrl;

  if (!nodeUrl && !deps.node) {
    userLog('Aztec Node URL (nodeUrl | AZTEC_NODE_URL) option is required to start PXE without --node option');
    process.exit(1);
  }

  const node = deps.node ?? createAztecNodeClient(nodeUrl!, getVersions(pxeConfig), makeTracedFetch([1, 2, 3], true));
  const pxe = await createPXEService(node, pxeConfig as PXEServiceConfig);

  const wallet = new TestWallet(pxe, node);

  // Add PXE to services list
  services.pxe = [pxe, PXESchema];

  return { wallet, config: pxeConfig };
}

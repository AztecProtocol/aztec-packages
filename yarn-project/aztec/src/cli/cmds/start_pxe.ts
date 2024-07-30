import { type AztecNode, createAztecNodeClient } from '@aztec/circuit-types';
import { type ServerList } from '@aztec/foundation/json-rpc/server';
import { type LogFn } from '@aztec/foundation/log';
import { Network, type PXEServiceConfig, createPXERpcServer, createPXEService, getPXEServiceConfig } from '@aztec/pxe';

import { mergeEnvVarsAndCliOptions, parseModuleOptions } from '../util.js';

const contractAddressesUrl = 'http://static.aztec.network';

export async function startPXE(options: any, signalHandlers: (() => Promise<void>)[], userLog: LogFn) {
  const services: ServerList = [];
  await addPXE(options, services, signalHandlers, userLog, {});
  return services;
}

function isValidNetwork(value: any): value is Network {
  return Object.values(Network).includes(value);
}

async function fetchBasicContracts(url: string) {}

export async function addPXE(
  options: any,
  services: ServerList,
  signalHandlers: (() => Promise<void>)[],
  userLog: LogFn,
  deps: { node?: AztecNode } = {},
) {
  const pxeCliOptions = parseModuleOptions(options.pxe);
  const pxeConfig = mergeEnvVarsAndCliOptions<PXEServiceConfig>(getPXEServiceConfig(), pxeCliOptions);
  let nodeUrl;
  if (options.network) {
    if (isValidNetwork(options.network)) {
      if (!options.apiKey) {
        userLog('API Key is required to connect to Devnet');
        process.exit(1);
      }
      nodeUrl = `https://api.aztec.network/${options.network}/aztec-node-1/${options.apiKey}`;
    } else {
      userLog(`Network ${options.network} is not supported`);
      process.exit(1);
    }
  } else {
    nodeUrl = pxeCliOptions.nodeUrl ?? process.env.AZTEC_NODE_URL;
  }
  if (!nodeUrl && !deps.node && !options.network) {
    userLog('Aztec Node URL (nodeUrl | AZTEC_NODE_URL) option is required to start PXE without --node option');
    process.exit(1);
  }

  const node = deps.node ?? createAztecNodeClient(nodeUrl);
  const pxe = await createPXEService(node, pxeConfig);
  const pxeServer = createPXERpcServer(pxe);

  // register basic contracts
  if (options.network) {
    const contracts = await fetchBasicContracts(`${contractAddressesUrl}/${options.network}/basic_contracts.json`);
    pxe.registerContracts(contracts);
  }

  // Add PXE to services list
  services.push({ pxe: pxeServer });

  // Add PXE stop function to signal handlers
  signalHandlers.push(pxe.stop);

  return pxe;
}

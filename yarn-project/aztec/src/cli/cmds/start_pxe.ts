import {
  type ContractArtifact,
  type ContractInstanceWithAddress,
  Fr,
  PublicKeys,
  getContractClassFromArtifact,
} from '@aztec/aztec.js';
import { type AztecNode, PXESchema, createAztecNodeClient } from '@aztec/circuit-types';
import { getContractArtifact } from '@aztec/cli/cli-utils';
import { type NamespacedApiHandlers } from '@aztec/foundation/json-rpc/server';
import { type LogFn } from '@aztec/foundation/log';
import {
  AztecAddress,
  type CliPXEOptions,
  type PXEServiceConfig,
  allPxeConfigMappings,
  createPXEService,
} from '@aztec/pxe';
import { L2BasicContractsMap, Network } from '@aztec/types/network';

import { extractRelevantOptions } from '../util.js';

const contractAddressesUrl = 'http://static.aztec.network';

export async function startPXE(
  options: any,
  signalHandlers: (() => Promise<void>)[],
  services: NamespacedApiHandlers,
  userLog: LogFn,
) {
  await addPXE(options, signalHandlers, services, userLog, {});
  return services;
}

function isValidNetwork(value: any): value is Network {
  return Object.values(Network).includes(value);
}

async function fetchBasicContractAddresses(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch basic contract addresses from ${url}`);
  }
  return response.json();
}

export async function addPXE(
  options: any,
  signalHandlers: (() => Promise<void>)[],
  services: NamespacedApiHandlers,
  userLog: LogFn,
  deps: { node?: AztecNode } = {},
) {
  const pxeConfig = extractRelevantOptions<PXEServiceConfig & CliPXEOptions>(options, allPxeConfigMappings, 'pxe');

  let nodeUrl;
  if (pxeConfig.network) {
    if (isValidNetwork(pxeConfig.network)) {
      if (!pxeConfig.apiKey && !pxeConfig.nodeUrl) {
        userLog(`API Key or Aztec Node URL is required to connect to ${pxeConfig.network}`);
        process.exit(1);
      } else if (pxeConfig.apiKey) {
        nodeUrl = `https://api.aztec.network/${pxeConfig.network}/aztec-node-1/${pxeConfig.apiKey}`;
      } else if (pxeConfig.nodeUrl) {
        nodeUrl = pxeConfig.nodeUrl;
      }
    } else {
      userLog(`Network ${pxeConfig.network} is not supported`);
      process.exit(1);
    }
  } else {
    nodeUrl = pxeConfig.nodeUrl;
  }
  if (!nodeUrl && !deps.node && !pxeConfig.network) {
    userLog('Aztec Node URL (nodeUrl | AZTEC_NODE_URL) option is required to start PXE without --node option');
    process.exit(1);
  }

  const node = deps.node ?? createAztecNodeClient(nodeUrl!);
  const pxe = await createPXEService(node, pxeConfig as PXEServiceConfig);

  // register basic contracts
  if (pxeConfig.network) {
    userLog(`Registering basic contracts for ${pxeConfig.network}`);
    const basicContractsInfo = await fetchBasicContractAddresses(
      `${contractAddressesUrl}/${pxeConfig.network}/basic_contracts.json`,
    );
    const l2Contracts: Record<
      string,
      { name: string; address: AztecAddress; initHash: Fr; salt: Fr; artifact: ContractArtifact }
    > = {};
    for (const [key, artifactName] of Object.entries(L2BasicContractsMap[pxeConfig.network as Network])) {
      l2Contracts[key] = {
        name: key,
        address: AztecAddress.fromString(basicContractsInfo[key].address),
        initHash: Fr.fromHexString(basicContractsInfo[key].initHash),
        salt: Fr.fromHexString(basicContractsInfo[key].salt),
        artifact: await getContractArtifact(artifactName, userLog),
      };
    }

    Object.values(l2Contracts).forEach(async ({ name, address, artifact, initHash, salt }) => {
      const instance: ContractInstanceWithAddress = {
        version: 1,
        salt,
        initializationHash: initHash,
        address,
        deployer: AztecAddress.ZERO,
        contractClassId: getContractClassFromArtifact(artifact!).id,
        publicKeys: PublicKeys.default(),
      };
      userLog(`Registering ${name} at ${address.toString()}`);
      await pxe.registerContract({ artifact, instance });
    });
  }

  // Add PXE to services list
  services.pxe = [pxe, PXESchema];

  return pxe;
}

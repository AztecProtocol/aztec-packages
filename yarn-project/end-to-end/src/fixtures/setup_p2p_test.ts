/**
 * Test fixtures and utilities to set up and run a test using multiple validators
 */
import { type AztecNodeConfig, AztecNodeService } from '@aztec/aztec-node';
import { range } from '@aztec/foundation/array';
import { SecretValue } from '@aztec/foundation/config';
import { withLoggerBindings } from '@aztec/foundation/log/server';
import { bufferToHex } from '@aztec/foundation/string';
import type { DateProvider } from '@aztec/foundation/timer';
import type { GenesisData } from '@aztec/world-state';

import getPort from 'get-port';

import { TEST_PEER_CHECK_INTERVAL_MS } from './fixtures.js';
import { createAndSyncProverNode, getPrivateKeyFromIndex } from './utils.js';
import { getEndToEndTestTelemetryClient } from './with_telemetry_utils.js';

// Setup snapshots will create a node with index 0, and run extra bootstrap with
// index 1, and prover node with index 2, so all of our loops here need to start from 3
// to avoid running validators with the same key
export const ATTESTER_PRIVATE_KEYS_START_INDEX = 3;

// Global counters for actor naming (start at 1)
let validatorCounter = 1;
let nodeCounter = 1;
let proverCounter = 1;

export function generatePrivateKeys(startIndex: number, numberOfKeys: number): `0x${string}`[] {
  const privateKeys: `0x${string}`[] = [];
  // Do not start from 0 as it is used during setup
  for (let i = startIndex; i < startIndex + numberOfKeys; i++) {
    privateKeys.push(`0x${getPrivateKeyFromIndex(i)!.toString('hex')}`);
  }
  return privateKeys;
}

export async function createNodes(
  config: AztecNodeConfig & { dontStartSequencer?: boolean },
  dateProvider: DateProvider,
  bootstrapNodeEnr: string,
  numNodes: number,
  bootNodePort: number,
  genesis?: GenesisData,
  dataDirectory?: string,
  metricsPort?: number,
  indexOffset = 0,
  validatorsPerNode = 1,
): Promise<AztecNodeService[]> {
  const nodePromises: Promise<AztecNodeService>[] = [];

  for (let i = 0; i < numNodes; i++) {
    const index = indexOffset + i;
    // We run on ports from the bootnode upwards
    const port = bootNodePort + 1 + index;

    // Determine validator indices for this node
    const validatorIndices = validatorsPerNode === 1 ? index : range(validatorsPerNode, validatorsPerNode * index);

    // Assign data directory
    const dataDir = dataDirectory ? `${dataDirectory}-${index}` : undefined;

    const nodePromise = createNode(
      config,
      dateProvider,
      port,
      bootstrapNodeEnr,
      validatorIndices,
      genesis,
      dataDir,
      metricsPort,
    );
    nodePromises.push(nodePromise);
  }
  const nodes = await Promise.all(nodePromises);

  // Sanity check that we have a sequencer if required
  const seqClient = nodes[0].getSequencer();
  if (!seqClient && config.disableValidator === false) {
    throw new Error('Sequencer not found');
  }

  return nodes;
}

/** Extended config type for createNode with test-specific overrides. */
export type CreateNodeConfig = AztecNodeConfig & {
  /** Whether to skip starting the sequencer. */
  dontStartSequencer?: boolean;
  /** Override the private key (instead of deriving from addressIndex). */
  validatorPrivateKey?: `0x${string}`;
  /** Corrupt only the block proposal at this indexWithinCheckpoint (testing only). */
  invalidBlockProposalIndexWithinCheckpoint?: number;
  /** Accept proposal gossip regardless of slot timing (testing only). */
  skipProposalSlotValidation?: boolean;
};

/** Creates a P2P enabled instance of Aztec Node Service with a validator. */
export async function createNode(
  config: CreateNodeConfig,
  dateProvider: DateProvider,
  tcpPort: number,
  bootstrapNode: string | undefined,
  addressIndex: number | number[],
  genesis?: GenesisData,
  dataDirectory?: string,
  metricsPort?: number,
) {
  const actorIndex = validatorCounter++;
  return await withLoggerBindings({ actor: `validator-${actorIndex}` }, async () => {
    const validatorConfig = await createValidatorConfig(config, bootstrapNode, tcpPort, addressIndex, dataDirectory);
    const telemetry = await getEndToEndTestTelemetryClient(metricsPort);
    return await AztecNodeService.createAndSync(
      validatorConfig,
      { telemetry, dateProvider },
      { genesis, dontStartSequencer: config.dontStartSequencer },
    );
  });
}

/** Creates a P2P enabled instance of Aztec Node Service without a validator */
export async function createNonValidatorNode(
  baseConfig: AztecNodeConfig,
  dateProvider: DateProvider,
  tcpPort: number,
  bootstrapNode: string | undefined,
  genesis?: GenesisData,
  dataDirectory?: string,
  metricsPort?: number,
) {
  const actorIndex = nodeCounter++;
  return await withLoggerBindings({ actor: `node-${actorIndex}` }, async () => {
    const p2pConfig = await createP2PConfig(baseConfig, bootstrapNode, tcpPort, dataDirectory);
    const config: AztecNodeConfig = {
      ...p2pConfig,
      disableValidator: true,
      validatorPrivateKeys: undefined,
      sequencerPublisherPrivateKeys: [],
    };
    const telemetry = await getEndToEndTestTelemetryClient(metricsPort);
    return await AztecNodeService.createAndSync(config, { telemetry, dateProvider }, { genesis });
  });
}

export async function createProverNode(
  config: AztecNodeConfig,
  tcpPort: number,
  bootstrapNode: string | undefined,
  addressIndex: number,
  deps: { dateProvider: DateProvider },
  genesis?: GenesisData,
  dataDirectory?: string,
  metricsPort?: number,
): Promise<{ proverNode: AztecNodeService }> {
  const actorIndex = proverCounter++;
  return await withLoggerBindings({ actor: `prover-${actorIndex}` }, async () => {
    const proverNodePrivateKey = getPrivateKeyFromIndex(ATTESTER_PRIVATE_KEYS_START_INDEX + addressIndex)!;
    const telemetry = await getEndToEndTestTelemetryClient(metricsPort);

    const p2pConfig = await createP2PConfig(config, bootstrapNode, tcpPort, dataDirectory);

    return await createAndSyncProverNode(
      bufferToHex(proverNodePrivateKey),
      { ...config, ...p2pConfig },
      { dataDirectory },
      { ...deps, telemetry },
      { genesis },
    );
  });
}

export async function createP2PConfig(
  config: AztecNodeConfig,
  bootstrapNodeEnr?: string,
  port?: number,
  dataDirectory?: string,
) {
  port = port ?? (await getPort());

  const nodeConfig: AztecNodeConfig = {
    ...config,
    p2pIp: `127.0.0.1`,
    p2pPort: port,
    p2pEnabled: true,
    peerCheckIntervalMS: TEST_PEER_CHECK_INTERVAL_MS,
    blockCheckIntervalMS: 1000,
    dataDirectory,
    bootstrapNodes: bootstrapNodeEnr ? [bootstrapNodeEnr] : [],
  };

  return nodeConfig;
}

export async function createValidatorConfig(
  config: CreateNodeConfig,
  bootstrapNodeEnr?: string,
  port?: number,
  addressIndex: number | number[] = 1,
  dataDirectory?: string,
) {
  const addressIndices = Array.isArray(addressIndex) ? addressIndex : [addressIndex];
  if (addressIndices.length === 0 && !config.validatorPrivateKey) {
    throw new Error('At least one address index must be provided to create a validator config');
  }

  // Use override private key if provided, otherwise derive from address indices
  const attesterPrivateKeys = config.validatorPrivateKey
    ? [config.validatorPrivateKey]
    : addressIndices.map(index => bufferToHex(getPrivateKeyFromIndex(ATTESTER_PRIVATE_KEYS_START_INDEX + index)!));
  const p2pConfig = await createP2PConfig(config, bootstrapNodeEnr, port, dataDirectory);
  const nodeConfig: AztecNodeConfig = {
    ...config,
    ...p2pConfig,
    validatorPrivateKeys: new SecretValue(attesterPrivateKeys),
    sequencerPublisherPrivateKeys: [new SecretValue(attesterPrivateKeys[0])],
  };

  return nodeConfig;
}

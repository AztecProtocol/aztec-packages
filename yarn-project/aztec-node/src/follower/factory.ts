import { createRpcSyncArchiver } from '@aztec/archiver';
import { EpochCache } from '@aztec/epoch-cache';
import { createEthereumChain } from '@aztec/ethereum/chain';
import { makeL1HttpTransport } from '@aztec/ethereum/client';
import { RollupContract } from '@aztec/ethereum/contracts';
import type { Logger } from '@aztec/foundation/log';
import { DateProvider } from '@aztec/foundation/timer';
import { trySnapshotSync } from '@aztec/node-lib/actions';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vk-tree';
import { protocolContractsHash } from '@aztec/protocol-contracts';
import { FeeProviderImpl, GlobalVariableBuilder } from '@aztec/sequencer-client';
import type { NodeInfo } from '@aztec/stdlib/contract';
import { type AztecNode, createAztecNodeClient } from '@aztec/stdlib/interfaces/client';
import { WorldStateRunningState, createArchiverClient, tryStop } from '@aztec/stdlib/interfaces/server';
import { type DebugLogStore, InMemoryDebugLogStore, NullDebugLogStore } from '@aztec/stdlib/logs';
import { getPackageVersion } from '@aztec/stdlib/update-checker';
import { getComponentsVersionsFromConfig } from '@aztec/stdlib/versioning';
import { getTelemetryClient } from '@aztec/telemetry-client';
import { createWorldState, createWorldStateSynchronizer } from '@aztec/world-state';

import { createPublicClient } from 'viem';

import type { AztecNodeConfig } from '../aztec-node/config.js';
import { AztecNodeService } from '../aztec-node/server.js';
import type { CreateAztecNodeDeps, CreateAztecNodeOptions } from '../factory.js';
import { checkConfigMatchesRollup } from '../modules/config_checks.js';
import { assertValidFollowerConfig } from './config.js';
import { UpstreamTxGateway } from './upstream_tx_gateway.js';

/**
 * Creates a follower node: a read-only node that replicates every block, checkpoint and L1-to-L2 message from a
 * single trusted upstream node over RPC and forwards the transactions it receives to that same upstream. It
 * runs no p2p stack, no validator, no sequencer, no prover, no slashing watchers and no proof verifiers, so it
 * needs neither a public IP nor any signing key.
 *
 * It still opens an L1 connection for fee queries (`getCurrentMinFees`, public-call simulation) and for the
 * epoch cache; replacing those with upstream queries is the next step and would leave the follower L1-less.
 */
export async function createFollowerNodeService(
  config: AztecNodeConfig & { followerUpstreamUrl: string },
  deps: CreateAztecNodeDeps,
  options: CreateAztecNodeOptions,
  log: Logger,
): Promise<AztecNodeService> {
  assertValidFollowerConfig(config);

  // Initialise the bb.js sync WASM singleton here, before any subsystem runs. Unlike a full node, a follower
  // never touches blobs (it takes block bodies from its upstream), so the KZG setup is left unwarmed.
  const { BarretenbergSync } = await import('@aztec/bb.js');
  await BarretenbergSync.initSingleton();

  const packageVersion = getPackageVersion();
  const telemetry = deps.telemetry ?? getTelemetryClient();
  const dateProvider = deps.dateProvider ?? new DateProvider();
  const upstreamUrl = config.followerUpstreamUrl;

  // Handshake first, over a client with no version expectations of its own, so a mismatch is reported as the
  // configuration error it is instead of as an opaque failure on the first replication call.
  const nodeInfo = await getUpstreamNodeInfo(upstreamUrl, log);
  assertUpstreamIsCompatible(config, nodeInfo, packageVersion, log);

  // Take the L1 addresses and the rollup version from the upstream rather than from the registry: the follower
  // must serve exactly the chain its upstream serves, and this also spares it a registry lookup on L1.
  Object.assign(config, nodeInfo.l1ContractAddresses);
  config.rollupVersion = nodeInfo.rollupVersion;

  const versions = getComponentsVersionsFromConfig(config, protocolContractsHash, getVKTreeRoot());
  const upstreamNode = createAztecNodeClient(upstreamUrl, versions);
  const upstreamArchiver = createArchiverClient(upstreamUrl, versions);

  const [l1Constants, { genesisArchiveRoot }] = await Promise.all([
    upstreamArchiver.getL1Constants(),
    upstreamArchiver.getGenesisValues(),
  ]);
  checkConfigMatchesRollup(config, l1Constants);

  const ethereumChain = createEthereumChain(config.l1RpcUrls, config.l1ChainId);
  if (config.l1ChainId !== ethereumChain.chainInfo.id) {
    throw new Error(
      `RPC URL configured for chain id ${ethereumChain.chainInfo.id} but expected id ${config.l1ChainId}`,
    );
  }

  // Bootstrap the local stores from a snapshot when configured. The follower reconciles whatever tip the
  // snapshot leaves it at against its upstream on the first replication pass.
  await trySnapshotSync(config, log);

  // Track started resources so we can clean up on partial failure during node creation.
  const started: { stop?(): Promise<void> | void }[] = [];
  try {
    const nativeWs = await createWorldState(config, options.genesis);
    const localGenesisBlockHash = await nativeWs.getInitialHeader().hash();

    const archiver = await createRpcSyncArchiver(
      config,
      upstreamArchiver,
      { ...l1Constants, genesisArchiveRoot },
      { telemetry, dateProvider },
      { blockUntilSync: !config.skipArchiverInitialSync },
    );
    started.push(archiver);

    // The archiver takes its genesis block from the upstream, so a local genesis built from different state
    // would make every archive root disagree. Fail here rather than on the first world-state block.
    const upstreamGenesisBlockHash = archiver.getGenesisBlockHash();
    if (!localGenesisBlockHash.equals(upstreamGenesisBlockHash)) {
      throw new Error(
        `Local genesis block hash ${localGenesisBlockHash} does not match the upstream node's ` +
          `${upstreamGenesisBlockHash}. The follower must be configured with the same genesis state as its upstream.`,
      );
    }

    // The synchronizer takes ownership of the native world-state from here
    const worldStateSynchronizer = await createWorldStateSynchronizer(config, archiver, nativeWs, telemetry);
    started.push(worldStateSynchronizer);
    await worldStateSynchronizer.start();

    let debugLogStore: DebugLogStore;
    if (!config.realProofs) {
      log.warn(`Aztec node is accepting fake proofs`);
      debugLogStore = new InMemoryDebugLogStore();
    } else {
      debugLogStore = new NullDebugLogStore();
    }

    // Everything below is the follower's remaining L1 coupling: min-fee queries and the slot/epoch clock.
    const publicClient = createPublicClient({
      chain: ethereumChain.chainInfo,
      transport: makeL1HttpTransport(config.l1RpcUrls, { timeout: config.l1HttpTimeoutMS }),
      pollingInterval: config.viemPollingIntervalMS,
    });
    const rollupContract = new RollupContract(publicClient, config.rollupAddress.toString());
    const globalVariableBuilderConfig = {
      rollupAddress: config.rollupAddress,
      ethereumSlotDuration: config.ethereumSlotDuration,
      rollupVersion: BigInt(config.rollupVersion),
      l1GenesisTime: l1Constants.l1GenesisTime,
      slotDuration: l1Constants.slotDuration,
    };
    const globalVariableBuilder = new GlobalVariableBuilder(publicClient, globalVariableBuilderConfig);
    const feeProvider = new FeeProviderImpl(dateProvider, publicClient, globalVariableBuilderConfig);
    const epochCache = await EpochCache.create(config.rollupAddress, config, { dateProvider });

    /**
     * A follower is ready once it has replicated the whole chain at least once and its world state is running.
     * Deliberately latched on the initial sync rather than on the archiver's `caughtUp` flag: `caughtUp` goes
     * false whenever the upstream is a block ahead mid-cycle, which would flap a load balancer's health check
     * on every block. Ongoing staleness is reported by the archiver's health surface instead.
     */
    const readinessProbe = async () => {
      const { state } = await worldStateSynchronizer.status();
      return archiver.getHealth().initialSyncComplete && state === WorldStateRunningState.RUNNING;
    };

    log.info(`Aztec node running in follower mode, replicating from ${upstreamUrl}`, {
      upstreamUrl,
      rollupVersion: config.rollupVersion,
      l1ChainId: config.l1ChainId,
    });

    return new AztecNodeService({
      config,
      txGateway: new UpstreamTxGateway(upstreamNode, log.createChild('upstream-tx-gateway')),
      archiverApi: archiver,
      blockSource: archiver,
      logsSource: archiver,
      contractDataSource: archiver,
      l1ToL2MessageSource: archiver,
      worldStateSynchronizer,
      sequencer: undefined,
      proverNode: undefined,
      slasherClient: undefined,
      validatorsSentinel: undefined,
      stopStartedWatchers: () => Promise.resolve(),
      l1ChainId: ethereumChain.chainInfo.id,
      version: config.rollupVersion,
      globalVariableBuilder,
      rollupContract,
      feeProvider,
      epochCache,
      packageVersion,
      readinessProbe,
      telemetry,
      log,
      debugLogStore,
    });
  } catch (err) {
    log.error('Failed during follower node creation, stopping started resources', err);
    for (const resource of started.reverse()) {
      await tryStop(resource);
    }
    throw err;
  }
}

/** Reads the upstream node's info, turning an unreachable upstream into an actionable startup error. */
async function getUpstreamNodeInfo(upstreamUrl: string, log: Logger): Promise<NodeInfo> {
  const handshakeClient: AztecNode = createAztecNodeClient(upstreamUrl);
  try {
    return await handshakeClient.getNodeInfo();
  } catch (err) {
    log.error(`Failed to reach upstream node at ${upstreamUrl}`, err);
    throw new Error(`Cannot start follower node: upstream node at ${upstreamUrl} is not reachable`);
  }
}

/**
 * Fails fast when the upstream node serves a different chain than this node is configured for. A follower
 * copies its upstream's chain wholesale, so a mismatch here would otherwise surface much later as unresolvable
 * block-hash disagreements.
 */
function assertUpstreamIsCompatible(
  config: Pick<AztecNodeConfig, 'l1ChainId' | 'rollupVersion'>,
  nodeInfo: NodeInfo,
  packageVersion: string,
  log: Logger,
): void {
  const mismatches: string[] = [];
  if (nodeInfo.l1ChainId !== config.l1ChainId) {
    mismatches.push(
      `upstream is on L1 chain ${nodeInfo.l1ChainId} but this node is configured for ${config.l1ChainId}`,
    );
  }
  if (typeof config.rollupVersion === 'number' && nodeInfo.rollupVersion !== config.rollupVersion) {
    mismatches.push(
      `upstream serves rollup version ${nodeInfo.rollupVersion} but this node is configured for ${config.rollupVersion}`,
    );
  }
  if (mismatches.length > 0) {
    throw new Error(`Cannot follow the upstream node: ${mismatches.join('; ')}`);
  }
  if (nodeInfo.nodeVersion !== packageVersion) {
    log.warn(
      `Upstream node runs version ${nodeInfo.nodeVersion} while this node runs ${packageVersion}; ` +
        `replication may break if their data formats differ`,
    );
  }
}

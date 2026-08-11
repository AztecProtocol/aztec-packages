import { createRpcSyncArchiver } from '@aztec/archiver';
import { EpochSlotMath } from '@aztec/epoch-cache';
import type { Logger } from '@aztec/foundation/log';
import { DateProvider } from '@aztec/foundation/timer';
import { trySnapshotSync } from '@aztec/node-lib/actions';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vk-tree';
import { protocolContractsHash } from '@aztec/protocol-contracts';
import type { NodeInfo } from '@aztec/stdlib/contract';
import type { L1RollupConstants } from '@aztec/stdlib/epoch-helpers';
import { type AztecNode, createAztecNodeClient } from '@aztec/stdlib/interfaces/client';
import { WorldStateRunningState, createArchiverClient, tryStop } from '@aztec/stdlib/interfaces/server';
import { type DebugLogStore, InMemoryDebugLogStore, NullDebugLogStore } from '@aztec/stdlib/logs';
import { getPackageVersion } from '@aztec/stdlib/update-checker';
import { getComponentsVersionsFromConfig } from '@aztec/stdlib/versioning';
import { getTelemetryClient } from '@aztec/telemetry-client';
import { createWorldState, createWorldStateSynchronizer } from '@aztec/world-state';

import type { AztecNodeConfig } from '../aztec-node/config.js';
import { AztecNodeService } from '../aztec-node/server.js';
import type { CreateAztecNodeDeps, CreateAztecNodeOptions } from '../factory.js';
import { checkConfigMatchesRollup } from '../modules/config_checks.js';
import { assertValidFollowerConfig } from './config.js';
import { UpstreamFeeProvider } from './upstream_fee_provider.js';
import { UpstreamGlobalVariableBuilder } from './upstream_global_variable_builder.js';
import { UpstreamTxGateway } from './upstream_tx_gateway.js';

/**
 * Creates a follower node: a read-only node that replicates every block, checkpoint and L1-to-L2 message from a
 * single trusted upstream node over RPC and forwards the transactions it receives to that same upstream. It
 * runs no p2p stack, no validator, no sequencer, no prover, no slashing watchers and no proof verifiers, so it
 * needs neither a public IP nor any signing key.
 *
 * It opens no L1 connection at all: contract addresses, rollup constants and min fees all come from the
 * upstream, and the slot/epoch clock is pure arithmetic over those constants. `l1RpcUrls` is therefore
 * optional in follower mode, unlike for every other node role.
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

  if (config.l1RpcUrls?.length) {
    log.info(`Ignoring the configured L1 RPC URLs: a follower node reads all chain data from its upstream node`);
  }

  // Bootstrap the local stores from a snapshot when configured. The follower reconciles whatever tip the
  // snapshot leaves it at against its upstream on the first replication pass. Snapshot sync only uses the L1
  // block number to gauge how stale the local stores are, so an estimate off the rollup constants stands in
  // for the L1 query a full node makes.
  await trySnapshotSync(config, log, {
    getCurrentL1BlockNumber: () => Promise.resolve(estimateL1BlockNumber(l1Constants, dateProvider)),
  });

  // Track started resources so we can clean up on partial failure during node creation.
  const started: { stop?(): Promise<void> | void }[] = [];
  try {
    const nativeWs = await createWorldState(config, options.genesis);
    // Owned here until the synchronizer takes over, so a failure in between (notably the genesis-hash check
    // below) still closes the freshly-opened world-state databases.
    let unownedNativeWs: typeof nativeWs | undefined = nativeWs;
    started.push({ stop: () => unownedNativeWs?.close() });
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
    unownedNativeWs = undefined;
    started.push(worldStateSynchronizer);
    await worldStateSynchronizer.start();

    let debugLogStore: DebugLogStore;
    if (!config.realProofs) {
      log.warn(`Aztec node is accepting fake proofs`);
      debugLogStore = new InMemoryDebugLogStore();
    } else {
      debugLogStore = new NullDebugLogStore();
    }

    // Fees come from the upstream's own L1 view, and the slot/epoch clock is pure arithmetic over the rollup
    // constants the upstream reported, so none of the below touches L1. The fee provider is shared with the
    // global variable builder so a simulation and a fee quote in the same L1 slot cost one upstream call.
    const feeProvider = new UpstreamFeeProvider(upstreamNode, dateProvider, l1Constants);
    const globalVariableBuilder = new UpstreamGlobalVariableBuilder(feeProvider, dateProvider, {
      l1ChainId: config.l1ChainId,
      rollupVersion: config.rollupVersion,
      slotDuration: l1Constants.slotDuration,
      l1GenesisTime: l1Constants.l1GenesisTime,
      ethereumSlotDuration: l1Constants.ethereumSlotDuration,
    });
    const epochCache = new EpochSlotMath(l1Constants, dateProvider);

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
      l1ChainId: config.l1ChainId,
      version: config.rollupVersion,
      globalVariableBuilder,
      // No rollup contract: the simulator's chain-state overrides can only be applied as an L1 `eth_call`
      // state override, so the follower falls back to the same pinned-tips plan TXE uses (and the upstream
      // fee RPCs ignore it anyway — see UpstreamGlobalVariableBuilder).
      rollupContract: undefined,
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

/**
 * Estimates the current L1 block number from the rollup constants and the wall clock, assuming L1 produces a
 * block every slot. Only used to decide whether the local stores are far enough behind (half a day of L1
 * blocks, by default) to be worth replacing with a snapshot, where being off by the number of missed L1 slots
 * is immaterial.
 */
function estimateL1BlockNumber(l1Constants: L1RollupConstants, dateProvider: DateProvider): bigint {
  const { l1StartBlock, l1GenesisTime, ethereumSlotDuration } = l1Constants;
  const now = BigInt(dateProvider.nowInSeconds());
  const elapsed = now > l1GenesisTime ? now - l1GenesisTime : 0n;
  return l1StartBlock + elapsed / BigInt(ethereumSlotDuration);
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

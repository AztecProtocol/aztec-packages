import { createArchiverStore, createContractDataSource } from '@aztec/archiver';
import type { L1ContractsConfig } from '@aztec/ethereum/config';
import { BlockNumber } from '@aztec/foundation/branded-types';
import type { Logger } from '@aztec/foundation/log';
import { DateProvider } from '@aztec/foundation/timer';
import { type ProverClientConfig, createProverClient } from '@aztec/prover-client';
import { ProverBrokerConfig, createAndStartProvingBroker } from '@aztec/prover-client/broker';
import { getLastSiblingPath } from '@aztec/prover-client/helpers';
import { ChonkCache } from '@aztec/prover-client/orchestrator';
import { AvmSimulatorPool, PublicProcessorFactory } from '@aztec/simulator/server';
import type { L2Block } from '@aztec/stdlib/block';
import { getEpochAtSlot, getSlotRangeForEpoch } from '@aztec/stdlib/epoch-helpers';
import type { ITxProvider } from '@aztec/stdlib/interfaces/server';
import type { DataStoreConfig } from '@aztec/stdlib/kv-store';
import { MerkleTreeId } from '@aztec/stdlib/trees';
import type { Tx, TxHash } from '@aztec/stdlib/tx';
import type { GenesisData } from '@aztec/stdlib/world-state';
import { getTelemetryClient } from '@aztec/telemetry-client';
import { createWorldState } from '@aztec/world-state';

import { readFileSync } from 'fs';

import { CheckpointProver } from '../job/checkpoint-prover.js';
import { type EpochProvingJobData, deserializeEpochProvingJobData } from '../job/epoch-proving-job-data.js';
import { EpochSession, type SessionSpec } from '../job/epoch-session.js';
import { ProverNodeJobMetrics } from '../metrics.js';

type RerunConfig = DataStoreConfig &
  ProverBrokerConfig &
  ProverClientConfig &
  Pick<L1ContractsConfig, 'aztecEpochDuration'>;

/**
 * Given a local folder where `downloadEpochProvingJob` was called, creates a new archiver and world state
 * using the state snapshots, and creates a new epoch proving session to prove the downloaded proving job.
 * Proving is done with a local proving broker and agents as specified by the config.
 */
export async function rerunEpochProvingJob(localPath: string, log: Logger, config: RerunConfig, genesis?: GenesisData) {
  await using ctx = await createRerunContext(localPath, log, config, genesis);
  const { jobData, prover, metrics } = ctx;

  log.info(`Rerunning epoch proving for epoch ${jobData.epochNumber}`);

  const provers: CheckpointProver[] = [];
  for (let i = 0; i < jobData.checkpoints.length; i++) {
    provers.push(await buildCheckpointProver(ctx, i, log));
  }

  // Local rerun never publishes — stub the service so submit() always resolves 'published'
  // and withdraw is a no-op.
  const publishingService = {
    submit: () => Promise.resolve('published' as const),
    withdraw: () => {},
  };

  const l1Constants = { epochDuration: config.aztecEpochDuration };
  const [fromSlot, toSlot] = getSlotRangeForEpoch(jobData.epochNumber, l1Constants);
  const spec: SessionSpec = { kind: 'full', epochNumber: jobData.epochNumber, fromSlot, toSlot };

  const session = new EpochSession(spec, provers, {
    proverFactory: prover,
    proverId: prover.getProverId(),
    publishingService,
    metrics,
    dateProvider: new DateProvider(),
    deadline: undefined,
    config: {},
    bindings: log.getBindings(),
  });

  const finalState = await session.start();
  log.info(`Completed proving for epoch ${jobData.epochNumber} with status ${finalState}`, {
    derivedEpoch: getEpochAtSlot(provers[0].slotNumber, l1Constants),
  });
  return finalState;
}

/**
 * Re-proves a single downloaded checkpoint proving job (as uploaded by a `CheckpointProver` failure).
 * Reconstructs just that checkpoint's sub-tree prover from the snapshot and awaits its block proofs — no
 * epoch top-tree, no L1 submission — so a checkpoint-level failure can be reproduced offline in isolation.
 * Returns the block-rollup proof outputs on success; throws if the checkpoint fails to prove again.
 */
export async function rerunCheckpointProvingJob(
  localPath: string,
  log: Logger,
  config: RerunConfig,
  genesis?: GenesisData,
) {
  await using ctx = await createRerunContext(localPath, log, config, genesis);
  const { jobData } = ctx;
  const checkpointNumber = jobData.checkpoints[0].number;

  log.info(`Rerunning checkpoint proving for checkpoint ${checkpointNumber} (epoch ${jobData.epochNumber})`);

  const prover = await buildCheckpointProver(ctx, 0, log);
  try {
    const blockProofs = await prover.whenBlockProofsReady();
    log.info(`Completed proving for checkpoint ${checkpointNumber} with ${blockProofs.length} block proof(s)`);
    return blockProofs;
  } finally {
    prover.cancel({ routine: true });
    await prover.whenDone();
  }
}

/** Everything a rerun needs, reconstructed from the downloaded snapshot + job data. */
type RerunContext = {
  jobData: EpochProvingJobData;
  metrics: ProverNodeJobMetrics;
  worldState: Awaited<ReturnType<typeof createWorldState>>;
  publicProcessorFactory: PublicProcessorFactory;
  prover: Awaited<ReturnType<typeof createProverClient>>;
  chonkCache: ChonkCache;
  txProvider: ITxProvider;
} & AsyncDisposable;

/**
 * Rebuilds the offline proving environment from a downloaded job: world state + archiver from the
 * snapshots, a local proving broker + client, a chonk cache, and a tx provider that replays the job's txs.
 */
async function createRerunContext(
  localPath: string,
  log: Logger,
  config: RerunConfig,
  genesis?: GenesisData,
): Promise<RerunContext> {
  const jobData = deserializeEpochProvingJobData(readFileSync(localPath));
  log.info(`Loaded proving job data for epoch ${jobData.epochNumber}`);

  const telemetry = getTelemetryClient();
  const metrics = new ProverNodeJobMetrics(telemetry.getMeter('prover-job'), telemetry.getTracer('prover-job'));
  const worldState = await createWorldState(config, genesis);
  const initialBlockHash = await worldState.getInitialHeader().hash();
  const archiver = await createArchiverStore(config, initialBlockHash);
  const avmSimulator = await AvmSimulatorPool.spawn({ wsdbIpcPath: worldState.getIpcPath() });
  const publicProcessorFactory = new PublicProcessorFactory(
    createContractDataSource(archiver),
    avmSimulator,
    undefined,
    undefined,
    log.getBindings(),
  );
  const broker = await createAndStartProvingBroker(config, telemetry);
  const prover = await createProverClient(config, worldState, broker, telemetry);
  const chonkCache = new ChonkCache(log.getBindings());
  const txProvider = makeReplayingTxProvider(jobData.txs);

  return {
    jobData,
    metrics,
    worldState,
    publicProcessorFactory,
    prover,
    chonkCache,
    txProvider,
    async [Symbol.asyncDispose]() {
      await avmSimulator[Symbol.asyncDispose]();
      await worldState[Symbol.asyncDispose]();
    },
  };
}

/** Reconstructs the `CheckpointProver` for the checkpoint at `index` in the job, ready to prove. */
async function buildCheckpointProver(ctx: RerunContext, index: number, log: Logger): Promise<CheckpointProver> {
  const { jobData, worldState, prover, chonkCache, publicProcessorFactory, txProvider, metrics } = ctx;
  const checkpoint = jobData.checkpoints[index];
  const previousBlockHeader =
    index === 0 ? jobData.previousBlockHeader : jobData.checkpoints[index - 1].blocks.at(-1)!.header;
  const l1ToL2Messages = jobData.l1ToL2Messages[checkpoint.number] ?? [];
  const previousArchiveSiblingPath = await getLastSiblingPath(
    MerkleTreeId.ARCHIVE,
    worldState.getSnapshot(BlockNumber(checkpoint.blocks[0].number - 1)),
  );
  const attestations = checkpoint.number === jobData.checkpoints.at(-1)!.number ? jobData.attestations : [];
  return new CheckpointProver(
    {
      checkpoint,
      epochNumber: jobData.epochNumber,
      attestations,
      previousBlockHeader,
      l1ToL2Messages,
      previousArchiveSiblingPath,
    },
    {
      proverFactory: prover,
      chonkCache,
      publicProcessorFactory,
      dbProvider: worldState,
      txProvider,
      dateProvider: new DateProvider(),
      proverId: prover.getProverId(),
      metrics,
      txGatheringTimeoutMs: 120_000,
      deadline: undefined,
      log,
    },
  );
}

/** Build a synthetic ITxProvider that returns the supplied txs map by lookup. */
function makeReplayingTxProvider(txs: Map<string, Tx>): ITxProvider {
  const lookup = (hashes: TxHash[]) => {
    const found: Tx[] = [];
    const missing: TxHash[] = [];
    for (const hash of hashes) {
      const tx = txs.get(hash.toString());
      if (tx) {
        found.push(tx);
      } else {
        missing.push(hash);
      }
    }
    return { txs: found, missingTxs: missing };
  };
  return {
    getAvailableTxs: hashes => Promise.resolve(lookup(hashes)),
    hasTxs: hashes => Promise.resolve(hashes.map(h => txs.has(h.toString()))),
    getTxsForBlockProposal: () => Promise.resolve({ txs: [], missingTxs: [] }),
    getTxsForBlock: (block: L2Block) => Promise.resolve(lookup(block.body.txEffects.map(e => e.txHash))),
  };
}

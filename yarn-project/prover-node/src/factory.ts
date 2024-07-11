import { createArchiver } from '@aztec/archiver';
import { createDebugLogger } from '@aztec/foundation/log';
import { createStore } from '@aztec/kv-store/utils';
import { createProverClient } from '@aztec/prover-client';
import { getL1Publisher } from '@aztec/sequencer-client';
import { PublicProcessorFactory, createSimulationProvider } from '@aztec/simulator';
import { type TelemetryClient } from '@aztec/telemetry-client';
import { NoopTelemetryClient } from '@aztec/telemetry-client/noop';
import { createWorldStateSynchronizer } from '@aztec/world-state';

import { type ProverNodeConfig } from './config.js';
import { ProverNode } from './prover-node.js';
import { createTxProvider } from './tx-provider/factory.js';

/** Creates a new prover node given a config. */
export async function createProverNode(
  config: ProverNodeConfig,
  telemetry: TelemetryClient = new NoopTelemetryClient(),
  log = createDebugLogger('aztec:prover'),
  storeLog = createDebugLogger('aztec:prover:lmdb'),
) {
  const store = await createStore(config, config.l1Contracts.rollupAddress, storeLog);

  const archiver = await createArchiver(config, store, telemetry, { blockUntilSync: true });

  const worldStateConfig = { ...config, worldStateProvenBlocksOnly: true };
  const worldStateSynchronizer = await createWorldStateSynchronizer(worldStateConfig, store, archiver);
  await worldStateSynchronizer.start();

  const simulationProvider = await createSimulationProvider(config, log);

  const prover = await createProverClient(config, worldStateSynchronizer, archiver);

  // REFACTOR: Move publisher out of sequencer package and into an L1-related package
  const publisher = getL1Publisher(config);

  const latestWorldState = worldStateSynchronizer.getLatest();
  const publicProcessorFactory = new PublicProcessorFactory(latestWorldState, archiver, simulationProvider, telemetry);

  const txProvider = createTxProvider(config);

  return new ProverNode(prover!, publicProcessorFactory, publisher, archiver, txProvider);
}

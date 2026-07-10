import { createLogger } from '@aztec/foundation/log';
import { TestDateProvider } from '@aztec/foundation/timer';
import { PublicSimulatorConfig } from '@aztec/stdlib/avm';
import { GasFees } from '@aztec/stdlib/gas';
import { GlobalVariables } from '@aztec/stdlib/tx';
import { getTelemetryClient } from '@aztec/telemetry-client';
import { NativeWorldStateService } from '@aztec/world-state';

import type { AvmSimulator } from '../avm_simulator.js';
import { AvmSimulatorPool } from '../avm_simulator_pool.js';
import { NapiAvmSimulator } from '../napi_avm_simulator.js';
import { PublicContractsDB } from '../public_db_sources.js';
import { GuardedMerkleTreeOperations } from '../public_processor/guarded_merkle_tree.js';
import { PublicProcessor } from '../public_processor/public_processor.js';
import { PublicTxSimulator } from '../public_tx_simulator/public_tx_simulator.js';
import { PublicTxSimulationTester } from './public_tx_simulation_tester.js';
import { SimpleContractDataSource } from './simple_contract_data_source.js';

/** Options for {@link PublicProcessorTestEnv.create}. */
export interface PublicProcessorTestEnvOptions {
  /** Global variables shared by the processor and the tester. Defaults to empty with nonzero gas fees. */
  globals?: GlobalVariables;
  /** Simulator config for the processor's PublicTxSimulator. */
  config?: Partial<PublicSimulatorConfig>;
}

function defaultGlobals(): GlobalVariables {
  const globals = GlobalVariables.empty();
  globals.gasFees = new GasFees(2, 3);
  return globals;
}

const defaultConfig = PublicSimulatorConfig.from({
  skipFeeEnforcement: false,
  collectDebugLogs: true,
  collectHints: false,
  collectStatistics: false,
  collectCallMetadata: true,
});

/**
 * Bundles the real-AVM wiring shared by public-processor app tests: a live WSDB world state, a CDB IPC
 * server, a spawned AVM simulator, a {@link PublicProcessor} backed by all three, and a setup-only
 * {@link PublicTxSimulationTester} sharing the same fork and contract data source for building txs and
 * seeding balances. Own it with `await using`, or call {@link Symbol.asyncDispose} from `afterEach`.
 */
export class PublicProcessorTestEnv implements AsyncDisposable {
  private constructor(
    public readonly processor: PublicProcessor,
    public readonly tester: PublicTxSimulationTester,
    public readonly contractsDB: PublicContractsDB,
    public readonly globals: GlobalVariables,
    private readonly worldStateService: NativeWorldStateService,
    private readonly avmSimulator: AvmSimulator & AsyncDisposable,
  ) {}

  static async create(opts: PublicProcessorTestEnvOptions = {}): Promise<PublicProcessorTestEnv> {
    const globals = opts.globals ?? defaultGlobals();
    const config = opts.config ? PublicSimulatorConfig.from({ ...defaultConfig, ...opts.config }) : defaultConfig;

    const contractDataSource = new SimpleContractDataSource();
    const worldStateService = await NativeWorldStateService.tmp();
    const merkleTrees = await worldStateService.fork();
    const contractsDB = new PublicContractsDB(contractDataSource);

    const forkId = merkleTrees.getRevision().forkId;
    // AVM_INPROCESS_NODE runs the AVM in-process (NAPI) instead of a bb-avm-sim subprocess pool; both
    // satisfy AvmSimulator, so the rest of the env is identical. Used to prove the in-process round-trip.
    const wsdbIpcPath = worldStateService.getIpcPath();
    const avmSimulator = process.env.AVM_INPROCESS_NODE
      ? await NapiAvmSimulator.spawn({ wsdbIpcPath })
      : await AvmSimulatorPool.spawn({ wsdbIpcPath });

    const simulator = new PublicTxSimulator(avmSimulator, globals, contractsDB, config, undefined, forkId);
    const processor = new PublicProcessor(
      globals,
      new GuardedMerkleTreeOperations(merkleTrees),
      contractsDB,
      simulator,
      new TestDateProvider(),
      getTelemetryClient(),
      createLogger('simulator:public-processor'),
    );

    const tester = new PublicTxSimulationTester(merkleTrees, contractDataSource, globals);

    return new PublicProcessorTestEnv(processor, tester, contractsDB, globals, worldStateService, avmSimulator);
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.avmSimulator[Symbol.asyncDispose]();
    await this.tester.close();
    await this.worldStateService.close();
  }
}

import { DEFAULT_TEARDOWN_DA_GAS_LIMIT, DEFAULT_TEARDOWN_L2_GAS_LIMIT } from '@aztec/constants';
import { asyncMap } from '@aztec/foundation/async-map';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { type ContractArtifact, encodeArguments } from '@aztec/stdlib/abi';
import { PublicSimulatorConfig, type PublicTxResult } from '@aztec/stdlib/avm';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import { Gas, GasFees } from '@aztec/stdlib/gas';
import type { MerkleTreeWriteOperations } from '@aztec/stdlib/interfaces/server';
import { PublicCallRequest } from '@aztec/stdlib/kernel';
import { GlobalVariables, PublicCallRequestWithCalldata, type Tx } from '@aztec/stdlib/tx';
import { NativeWorldStateService } from '@aztec/world-state';

import { BaseAvmSimulationTester } from '../avm/fixtures/base_avm_simulation_tester.js';
import {
  DEFAULT_BLOCK_NUMBER,
  DEFAULT_TIMESTAMP,
  getContractFunctionAbi,
  getFunctionSelector,
} from '../avm/fixtures/utils.js';
import { PublicContractsDB } from '../public_db_sources.js';
import { MeasuredCppPublicTxSimulator } from '../public_tx_simulator/cpp_public_tx_simulator.js';
import { MeasuredCppVsTsPublicTxSimulator } from '../public_tx_simulator/cpp_vs_ts_public_tx_simulator.js';
import type { MeasuredPublicTxSimulatorInterface } from '../public_tx_simulator/public_tx_simulator_interface.js';
import { TestExecutorMetrics } from '../test_executor_metrics.js';
import { SimpleContractDataSource } from './simple_contract_data_source.js';
import { type TestPrivateInsertions, createTxForPublicCalls } from './utils.js';

const DEFAULT_GAS_FEES = new GasFees(2, 3);

export type TestEnqueuedCall = {
  sender?: AztecAddress;
  address: AztecAddress;
  fnName?: string;
  args: any[];
  isStaticCall?: boolean;
  contractArtifact?: ContractArtifact;
};

const defaultConfig: PublicSimulatorConfig = PublicSimulatorConfig.from({
  skipFeeEnforcement: false,
  collectCallMetadata: true,
  collectDebugLogs: true,
  collectHints: false,
  collectPublicInputs: false,
  collectStatistics: false,
});

/**
 * Factory type for creating a MeasuredPublicTxSimulatorInterface.
 */
export type MeasuredSimulatorFactory = (
  merkleTree: MerkleTreeWriteOperations,
  contractsDB: PublicContractsDB,
  globals: GlobalVariables,
  metrics: TestExecutorMetrics,
  config: PublicSimulatorConfig,
) => MeasuredPublicTxSimulatorInterface;

/**
 * A test class that extends the BaseAvmSimulationTester to enable real-app testing of the PublicTxSimulator.
 * It provides an interface for simulating one transaction at a time and maintains state between subsequent
 * transactions.
 */
export class PublicTxSimulationTester extends BaseAvmSimulationTester {
  protected txCount: number = 0;
  private simulator: MeasuredPublicTxSimulatorInterface;
  private metricsPrefix?: string;

  constructor(
    merkleTree: MerkleTreeWriteOperations,
    contractDataSource: SimpleContractDataSource,
    globals: GlobalVariables = defaultGlobals(),
    private metrics: TestExecutorMetrics = new TestExecutorMetrics(),
    simulatorFactory?: MeasuredSimulatorFactory,
    config: PublicSimulatorConfig = defaultConfig,
  ) {
    super(contractDataSource, merkleTree);

    const contractsDB = new PublicContractsDB(contractDataSource);
    if (simulatorFactory) {
      this.simulator = simulatorFactory(merkleTree, contractsDB, globals, this.metrics, config);
    } else {
      this.simulator = new MeasuredCppPublicTxSimulator(merkleTree, contractsDB, globals, this.metrics, config);
    }
  }

  public static async create(
    worldStateService: NativeWorldStateService, // make sure to close this later
    globals: GlobalVariables = defaultGlobals(),
    metrics: TestExecutorMetrics = new TestExecutorMetrics(),
    useCppSimulator = false,
    config: PublicSimulatorConfig = defaultConfig,
  ): Promise<PublicTxSimulationTester> {
    const contractDataSource = new SimpleContractDataSource();
    const merkleTree = await worldStateService.fork();
    const simulatorFactory: MeasuredSimulatorFactory = useCppSimulator
      ? (mt, cdb, g, m, c) => new MeasuredCppPublicTxSimulator(mt, cdb, g, m, c)
      : (mt, cdb, g, m, c) => new MeasuredCppVsTsPublicTxSimulator(mt, cdb, g, m, c);
    return new PublicTxSimulationTester(merkleTree, contractDataSource, globals, metrics, simulatorFactory, config);
  }

  public setMetricsPrefix(prefix: string) {
    this.metricsPrefix = prefix;
  }

  public async createTx(
    sender: AztecAddress,
    setupCalls: TestEnqueuedCall[] = [],
    appCalls: TestEnqueuedCall[] = [],
    teardownCall?: TestEnqueuedCall,
    feePayer: AztecAddress = sender,
    /* need some unique first nullifier for note-nonce computations */
    privateInsertions: TestPrivateInsertions = { nonRevertible: { nullifiers: [new Fr(420000 + this.txCount)] } },
  ): Promise<Tx> {
    const setupCallRequests = await asyncMap(setupCalls, call =>
      this.#createPubicCallRequestForCall(call, call.sender ?? sender),
    );
    const appCallRequests = await asyncMap(appCalls, call =>
      this.#createPubicCallRequestForCall(call, call.sender ?? sender),
    );
    const teardownCallRequest = teardownCall
      ? await this.#createPubicCallRequestForCall(teardownCall, teardownCall.sender ?? sender)
      : undefined;

    this.txCount++;
    return createTxForPublicCalls(
      privateInsertions,
      setupCallRequests,
      appCallRequests,
      teardownCallRequest,
      feePayer,
      /*gasUsedByPrivate*/ teardownCall
        ? new Gas(DEFAULT_TEARDOWN_DA_GAS_LIMIT, DEFAULT_TEARDOWN_L2_GAS_LIMIT)
        : Gas.empty(),
      defaultGlobals(),
    );
  }

  public async simulateTx(
    sender: AztecAddress,
    setupCalls: TestEnqueuedCall[] = [],
    appCalls: TestEnqueuedCall[] = [],
    teardownCall?: TestEnqueuedCall,
    feePayer: AztecAddress = sender,
    /* need some unique first nullifier for note-nonce computations */
    privateInsertions?: TestPrivateInsertions,
    txLabel: string = 'unlabeledTx',
  ): Promise<PublicTxResult> {
    const tx = await this.createTx(sender, setupCalls, appCalls, teardownCall, feePayer, privateInsertions);

    await this.setFeePayerBalance(feePayer);

    const txLabelWithCount = `${txLabel}/${this.txCount - 1}`;
    const fullTxLabel = this.metricsPrefix ? `${this.metricsPrefix}/${txLabelWithCount}` : txLabelWithCount;

    if (!this.simulator) {
      throw new Error(
        'No simulator configured. Pass a simulatorFactory to the constructor or use PublicTxSimulationTester.create()',
      );
    }
    const avmResult = await this.simulator.simulate(tx, fullTxLabel);

    // Something like this is often useful for debugging:
    //if (avmResult.revertReason) {
    //  // resolve / enrich revert reason
    //  const lastAppCall = appCalls[appCalls.length - 1];

    //  const contractArtifact =
    //    lastAppCall.contractArtifact || (await this.contractDataSource.getContractArtifact(lastAppCall.address));
    //  const fnAbi = getContractFunctionAbi(lastAppCall.fnName, contractArtifact!);
    //  const revertReason = resolveAssertionMessageFromRevertData(avmResult.revertReason.revertData, fnAbi!);
    //  this.logger.debug(`Revert reason: ${revertReason}`);
    //}

    return avmResult;
  }

  /**
   * Just simulate the transaction and return the result.
   *
   * This wrapper around simulation allows for easy labeling of a TX
   * which is especially useful when reporting benchmarks or metrics.
   */
  public async simulateTxWithLabel(
    txLabel: string,
    sender: AztecAddress,
    setupCalls?: TestEnqueuedCall[],
    appCalls?: TestEnqueuedCall[],
    teardownCall?: TestEnqueuedCall,
    feePayer?: AztecAddress,
    privateInsertions?: TestPrivateInsertions,
  ): Promise<PublicTxResult> {
    return await this.simulateTx(sender, setupCalls, appCalls, teardownCall, feePayer, privateInsertions, txLabel);
  }

  /**
   * Execute a transaction and return the result.
   *
   * This function can be (it is) overridden by a subclass (AvmProvingTester)
   * to do more work (like prove and verify) while still reusing existing
   * test fixtures (like amm_test). That is why it is not named "simulate*".
   */
  public async executeTxWithLabel(
    txLabel: string,
    sender: AztecAddress,
    setupCalls?: TestEnqueuedCall[],
    appCalls?: TestEnqueuedCall[],
    teardownCall?: TestEnqueuedCall,
    feePayer?: AztecAddress,
    privateInsertions?: TestPrivateInsertions,
  ): Promise<PublicTxResult> {
    return await this.simulateTxWithLabel(
      txLabel,
      sender,
      setupCalls,
      appCalls,
      teardownCall,
      feePayer,
      privateInsertions,
    );
  }

  public prettyPrintMetrics() {
    this.metrics.prettyPrint();
  }

  /**
   * Cancel the current simulation if one is in progress.
   * This signals the underlying simulator (e.g., C++) to stop at the next safe point.
   * Safe to call even if no simulation is in progress.
   *
   * @param waitTimeoutMs - If provided, wait up to this many ms for the simulation to actually stop.
   */
  public async cancel(waitTimeoutMs?: number): Promise<void> {
    await this.simulator.cancel?.(waitTimeoutMs);
  }

  /**
   * Get the underlying simulator for advanced test scenarios.
   * Use this when you need direct control over simulation (e.g., for testing cancellation).
   */
  public getSimulator(): MeasuredPublicTxSimulatorInterface {
    return this.simulator;
  }

  async #createPubicCallRequestForCall(
    call: TestEnqueuedCall,
    sender: AztecAddress,
  ): Promise<PublicCallRequestWithCalldata> {
    const address = call.address;
    const contractArtifact = call.contractArtifact || (await this.contractDataSource.getContractArtifact(address));
    if (!contractArtifact) {
      throw new Error(`Contract artifact not found for address: ${address}`);
    }

    let calldata: Fr[] = [];
    if (!call.fnName) {
      this.logger.debug(
        `No function name specified for call to contract ${call.address.toString()}. Assuming this is a custom bytecode with no public_dispatch function.`,
      );
      this.logger.debug(`Not using ABI to encode arguments. Not prepending fn selector to calldata.`);
      try {
        calldata = call.args.map(arg => new Fr(arg));
      } catch (error) {
        this.logger.warn(`Tried assuming that all arguments are Field-like. Failed. Error: ${error}`);
        throw error;
      }
    } else {
      const fnSelector = await getFunctionSelector(call.fnName, contractArtifact);
      const fnAbi = getContractFunctionAbi(call.fnName, contractArtifact)!;
      const encodedArgs = encodeArguments(fnAbi, call.args);
      calldata = [fnSelector.toField(), ...encodedArgs];
    }
    const isStaticCall = call.isStaticCall ?? false;
    const request = await PublicCallRequest.fromCalldata(sender, address, isStaticCall, calldata);

    return new PublicCallRequestWithCalldata(request, calldata);
  }
}

export function defaultGlobals() {
  const globals = GlobalVariables.empty();
  globals.timestamp = DEFAULT_TIMESTAMP;
  globals.gasFees = DEFAULT_GAS_FEES; // apply some nonzero default gas fees
  globals.blockNumber = BlockNumber(DEFAULT_BLOCK_NUMBER);
  return globals;
}

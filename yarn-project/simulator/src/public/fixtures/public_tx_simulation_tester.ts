import { asyncMap } from '@aztec/foundation/async-map';
import { Fr } from '@aztec/foundation/fields';
import { type ContractArtifact, encodeArguments } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import { Gas, GasFees } from '@aztec/stdlib/gas';
import type { MerkleTreeWriteOperations } from '@aztec/stdlib/interfaces/server';
import { PublicCallRequest } from '@aztec/stdlib/kernel';
import { GlobalVariables, PublicCallRequestWithCalldata, type Tx } from '@aztec/stdlib/tx';
import { NativeWorldStateService } from '@aztec/world-state';

import { BaseAvmSimulationTester } from '../avm/fixtures/base_avm_simulation_tester.js';
import { DEFAULT_BLOCK_NUMBER, getContractFunctionAbi, getFunctionSelector } from '../avm/fixtures/index.js';
import { PublicContractsDB } from '../public_db_sources.js';
import { MeasuredPublicTxSimulator } from '../public_tx_simulator/measured_public_tx_simulator.js';
import type { PublicTxResult } from '../public_tx_simulator/public_tx_simulator.js';
import { TestExecutorMetrics } from '../test_executor_metrics.js';
import { SimpleContractDataSource } from './simple_contract_data_source.js';
import { createTxForPublicCalls } from './utils.js';

const TIMESTAMP = 99833n;
const DEFAULT_GAS_FEES = new GasFees(2, 3);

export type TestEnqueuedCall = {
  sender?: AztecAddress;
  address: AztecAddress;
  fnName: string;
  args: any[];
  isStaticCall?: boolean;
  contractArtifact?: ContractArtifact;
};

/**
 * A test class that extends the BaseAvmSimulationTester to enable real-app testing of the PublicTxSimulator.
 * It provides an interface for simulating one transaction at a time and maintains state between subsequent
 * transactions.
 */
export class PublicTxSimulationTester extends BaseAvmSimulationTester {
  private txCount = 0;
  private simulator: MeasuredPublicTxSimulator;
  private metricsPrefix?: string;

  constructor(
    merkleTree: MerkleTreeWriteOperations,
    contractDataSource: SimpleContractDataSource,
    globals: GlobalVariables = defaultGlobals(),
    private metrics: TestExecutorMetrics = new TestExecutorMetrics(),
  ) {
    super(contractDataSource, merkleTree);

    const contractsDB = new PublicContractsDB(contractDataSource);
    this.simulator = new MeasuredPublicTxSimulator(
      merkleTree,
      contractsDB,
      globals,
      /*doMerkleOperations=*/ true,
      /*skipFeeEnforcement=*/ false,
      /*clientInitiatedSimulation=*/ true,
      this.metrics,
    );
  }

  public static async create(
    globals: GlobalVariables = defaultGlobals(),
    metrics: TestExecutorMetrics = new TestExecutorMetrics(),
  ): Promise<PublicTxSimulationTester> {
    const contractDataSource = new SimpleContractDataSource();
    const merkleTree = await (await NativeWorldStateService.tmp()).fork();
    return new PublicTxSimulationTester(merkleTree, contractDataSource, globals, metrics);
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
    firstNullifier = new Fr(420000 + this.txCount++),
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

    return createTxForPublicCalls(
      firstNullifier,
      setupCallRequests,
      appCallRequests,
      teardownCallRequest,
      feePayer,
      /*gasUsedByPrivate*/ Gas.empty(),
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
    firstNullifier = new Fr(420000 + this.txCount++),
    txLabel: string = 'unlabeledTx',
  ): Promise<PublicTxResult> {
    const tx = await this.createTx(sender, setupCalls, appCalls, teardownCall, feePayer, firstNullifier);

    await this.setFeePayerBalance(feePayer);

    const txLabelWithCount = `${txLabel}/${this.txCount - 1}`;
    const fullTxLabel = this.metricsPrefix ? `${this.metricsPrefix}/${txLabelWithCount}` : txLabelWithCount;

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

  public async simulateTxWithLabel(
    txLabel: string,
    sender: AztecAddress,
    setupCalls?: TestEnqueuedCall[],
    appCalls?: TestEnqueuedCall[],
    teardownCall?: TestEnqueuedCall,
    feePayer?: AztecAddress,
    firstNullifier?: Fr,
  ): Promise<PublicTxResult> {
    return await this.simulateTx(sender, setupCalls, appCalls, teardownCall, feePayer, firstNullifier, txLabel);
  }

  public prettyPrintMetrics() {
    this.metrics.prettyPrint();
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

    const fnSelector = await getFunctionSelector(call.fnName, contractArtifact);
    const fnAbi = getContractFunctionAbi(call.fnName, contractArtifact)!;
    const encodedArgs = encodeArguments(fnAbi, call.args);
    const calldata = [fnSelector.toField(), ...encodedArgs];
    const isStaticCall = call.isStaticCall ?? false;
    const request = await PublicCallRequest.fromCalldata(sender, address, isStaticCall, calldata);

    return new PublicCallRequestWithCalldata(request, calldata);
  }
}

export function defaultGlobals() {
  const globals = GlobalVariables.empty();
  globals.timestamp = TIMESTAMP;
  globals.gasFees = DEFAULT_GAS_FEES; // apply some nonzero default gas fees
  globals.blockNumber = new Fr(DEFAULT_BLOCK_NUMBER);
  return globals;
}

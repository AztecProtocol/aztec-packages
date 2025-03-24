import { PUBLIC_DISPATCH_SELECTOR } from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';
import { type ContractArtifact, FunctionSelector, encodeArguments } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import { GasFees } from '@aztec/stdlib/gas';
import type { MerkleTreeWriteOperations } from '@aztec/stdlib/interfaces/server';
import { PublicExecutionRequest, type Tx } from '@aztec/stdlib/tx';
import { CallContext, GlobalVariables } from '@aztec/stdlib/tx';
import type { TelemetryClient } from '@aztec/telemetry-client';
import { NativeWorldStateService } from '@aztec/world-state';

import { BaseAvmSimulationTester } from '../avm/fixtures/base_avm_simulation_tester.js';
import { getContractFunctionArtifact, getFunctionSelector } from '../avm/fixtures/index.js';
import { SimpleContractDataSource } from '../avm/fixtures/simple_contract_data_source.js';
import { PublicContractsDB, PublicTreesDB } from '../public_db_sources.js';
import { type PublicTxResult, PublicTxSimulator } from '../public_tx_simulator/public_tx_simulator.js';
import { createTxForPublicCalls } from './index.js';

const TIMESTAMP = new Fr(99833);
const DEFAULT_GAS_FEES = new GasFees(2, 3);
export const DEFAULT_BLOCK_NUMBER = 42;

export type TestEnqueuedCall = {
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

  constructor(
    private merkleTree: MerkleTreeWriteOperations,
    contractDataSource: SimpleContractDataSource,
    private telemetryClient?: TelemetryClient,
  ) {
    super(contractDataSource, merkleTree);
  }

  public static async create(telemetryClient?: TelemetryClient): Promise<PublicTxSimulationTester> {
    const contractDataSource = new SimpleContractDataSource();
    const merkleTree = await (await NativeWorldStateService.tmp()).fork();
    return new PublicTxSimulationTester(merkleTree, contractDataSource, telemetryClient);
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
    const setupExecutionRequests: PublicExecutionRequest[] = [];
    for (let i = 0; i < setupCalls.length; i++) {
      const address = setupCalls[i].address;
      const contractArtifact =
        setupCalls[i].contractArtifact || (await this.contractDataSource.getContractArtifact(address));
      if (!contractArtifact) {
        throw new Error(`Contract artifact not found for address: ${address}`);
      }
      const req = await executionRequestForCall(
        contractArtifact,
        sender,
        address,
        setupCalls[i].fnName,
        setupCalls[i].args,
        setupCalls[i].isStaticCall,
      );
      setupExecutionRequests.push(req);
    }
    const appExecutionRequests: PublicExecutionRequest[] = [];
    for (let i = 0; i < appCalls.length; i++) {
      const address = appCalls[i].address;
      const contractArtifact =
        appCalls[i].contractArtifact || (await this.contractDataSource.getContractArtifact(address));
      if (!contractArtifact) {
        throw new Error(`Contract artifact not found for address: ${address}`);
      }
      const req = await executionRequestForCall(
        contractArtifact,
        sender,
        address,
        appCalls[i].fnName,
        appCalls[i].args,
        appCalls[i].isStaticCall,
      );
      appExecutionRequests.push(req);
    }

    let teardownExecutionRequest: PublicExecutionRequest | undefined = undefined;
    if (teardownCall) {
      const address = teardownCall.address;
      const contractArtifact =
        teardownCall.contractArtifact || (await this.contractDataSource.getContractArtifact(address));
      if (!contractArtifact) {
        throw new Error(`Contract artifact not found for address: ${address}`);
      }
      teardownExecutionRequest = await executionRequestForCall(
        contractArtifact,
        sender,
        address,
        teardownCall.fnName,
        teardownCall.args,
        teardownCall.isStaticCall,
      );
    }

    return await createTxForPublicCalls(
      firstNullifier,
      setupExecutionRequests,
      appExecutionRequests,
      teardownExecutionRequest,
      feePayer,
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
    globals = defaultGlobals(),
    metricsTag?: string,
  ): Promise<PublicTxResult> {
    const tx = await this.createTx(sender, setupCalls, appCalls, teardownCall, feePayer, firstNullifier);

    await this.setFeePayerBalance(feePayer);

    const treesDB = new PublicTreesDB(this.merkleTree);
    const contractsDB = new PublicContractsDB(this.contractDataSource);
    const simulator = new PublicTxSimulator(
      treesDB,
      contractsDB,
      globals,
      /*doMerkleOperations=*/ true,
      /*skipFeeEnforcement=*/ false,
      this.telemetryClient,
    );

    const startTime = performance.now();
    const avmResult = await simulator.simulate(tx, metricsTag);
    const endTime = performance.now();
    this.logger.debug(`Public transaction simulation took ${endTime - startTime}ms`);

    return avmResult;
  }
}

async function executionRequestForCall(
  contractArtifact: ContractArtifact,
  sender: AztecAddress,
  address: AztecAddress,
  fnName: string,
  args: Fr[] = [],
  isStaticCall: boolean = false,
): Promise<PublicExecutionRequest> {
  const fnSelector = await getFunctionSelector(fnName, contractArtifact);
  const fnAbi = getContractFunctionArtifact(fnName, contractArtifact);
  const encodedArgs = encodeArguments(fnAbi!, args);
  const calldata = [fnSelector.toField(), ...encodedArgs];

  const callContext = new CallContext(
    sender,
    address,
    /*selector=*/ new FunctionSelector(PUBLIC_DISPATCH_SELECTOR),
    isStaticCall,
  );
  return new PublicExecutionRequest(callContext, calldata);
}

export function defaultGlobals() {
  const globals = GlobalVariables.empty();
  globals.timestamp = TIMESTAMP;
  globals.gasFees = DEFAULT_GAS_FEES; // apply some nonzero default gas fees
  globals.blockNumber = new Fr(DEFAULT_BLOCK_NUMBER);
  return globals;
}

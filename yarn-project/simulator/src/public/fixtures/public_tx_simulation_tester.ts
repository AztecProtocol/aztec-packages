import { asyncMap } from '@aztec/foundation/async-map';
import { Fr } from '@aztec/foundation/fields';
import { type ContractArtifact, encodeArguments } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import { GasFees } from '@aztec/stdlib/gas';
import type { MerkleTreeWriteOperations } from '@aztec/stdlib/interfaces/server';
import { PublicCallRequest } from '@aztec/stdlib/kernel';
import { GlobalVariables, PublicCallRequestWithCalldata, type Tx } from '@aztec/stdlib/tx';
import { NativeWorldStateService } from '@aztec/world-state';

import { BaseAvmSimulationTester } from '../avm/fixtures/base_avm_simulation_tester.js';
import { getContractFunctionAbi, getFunctionSelector } from '../avm/fixtures/index.js';
import { SimpleContractDataSource } from '../avm/fixtures/simple_contract_data_source.js';
import { PublicContractsDB, PublicTreesDB } from '../public_db_sources.js';
import { type PublicTxResult, PublicTxSimulator } from '../public_tx_simulator/public_tx_simulator.js';
import { createTxForPublicCalls } from './utils.js';

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

  constructor(private merkleTree: MerkleTreeWriteOperations, contractDataSource: SimpleContractDataSource) {
    super(contractDataSource, merkleTree);
  }

  public static async create(): Promise<PublicTxSimulationTester> {
    const contractDataSource = new SimpleContractDataSource();
    const merkleTree = await (await NativeWorldStateService.tmp()).fork();
    return new PublicTxSimulationTester(merkleTree, contractDataSource);
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
    const setupCallRequests = await asyncMap(setupCalls, call => this.#createPubicCallRequestForCall(call, sender));
    const appCallRequests = await asyncMap(appCalls, call => this.#createPubicCallRequestForCall(call, sender));
    const teardownCallRequest = teardownCall
      ? await this.#createPubicCallRequestForCall(teardownCall, sender)
      : undefined;

    return createTxForPublicCalls(firstNullifier, setupCallRequests, appCallRequests, teardownCallRequest, feePayer);
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
  ): Promise<PublicTxResult> {
    const tx = await this.createTx(sender, setupCalls, appCalls, teardownCall, feePayer, firstNullifier);

    await this.setFeePayerBalance(feePayer);

    const treesDB = new PublicTreesDB(this.merkleTree);
    const contractsDB = new PublicContractsDB(this.contractDataSource);
    const simulator = new PublicTxSimulator(treesDB, contractsDB, globals, /*doMerkleOperations=*/ true);

    const startTime = performance.now();
    const avmResult = await simulator.simulate(tx);
    const endTime = performance.now();
    this.logger.debug(`Public transaction simulation took ${endTime - startTime}ms`);

    return avmResult;
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

import { MerkleTreeId, type MerkleTreeWriteOperations, PublicExecutionRequest, type Tx } from '@aztec/circuit-types';
import {
  AvmCircuitPublicInputs,
  CallContext,
  FunctionSelector,
  GasFees,
  GlobalVariables,
  MAX_NOTE_HASHES_PER_TX,
  MAX_NULLIFIERS_PER_TX,
  NULLIFIER_SUBTREE_HEIGHT,
  PUBLIC_DATA_TREE_HEIGHT,
  PUBLIC_DISPATCH_SELECTOR,
} from '@aztec/circuits.js';
import { type ContractArtifact, encodeArguments } from '@aztec/foundation/abi';
import { AztecAddress } from '@aztec/foundation/aztec-address';
import { padArrayEnd } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/fields';
import { AvmTestContractArtifact } from '@aztec/noir-contracts.js/AvmTest';
import { NativeWorldStateService } from '@aztec/world-state';

import { BaseAvmSimulationTester } from '../../avm/fixtures/base_avm_simulation_tester.js';
import { getContractFunctionArtifact, getFunctionSelector } from '../../avm/fixtures/index.js';
import { SimpleContractDataSource } from '../../avm/fixtures/simple_contract_data_source.js';
import { WorldStateDB } from '../public_db_sources.js';
import { type PublicTxResult, PublicTxSimulator } from '../public_tx_simulator.js';
import { createTxForPublicCalls } from './index.js';

const TIMESTAMP = new Fr(99833);
const DEFAULT_GAS_FEES = new GasFees(2, 3);
const DEFAULT_BLOCK_NUMBER = new Fr(42);

export type TestEnqueuedCall = {
  address: AztecAddress;
  fnName: string;
  args: any[];
  isStaticCall?: boolean;
};

/**
 * A test class that extends the BaseAvmSimulationTester to enable real-app testing of the PublicTxSimulator.
 * It provides an interface for simulating one transaction at a time and maintains state between subsequent
 * transactions.
 */
export class PublicTxSimulationTester extends BaseAvmSimulationTester {
  private txCount = 0;

  constructor(
    private worldStateDB: WorldStateDB,
    contractDataSource: SimpleContractDataSource,
    merkleTrees: MerkleTreeWriteOperations,
  ) {
    super(contractDataSource, merkleTrees);
  }

  public static async create(): Promise<PublicTxSimulationTester> {
    const contractDataSource = new SimpleContractDataSource();
    const merkleTrees = await (await NativeWorldStateService.tmp()).fork();
    const worldStateDB = new WorldStateDB(merkleTrees, contractDataSource);
    return new PublicTxSimulationTester(worldStateDB, contractDataSource, merkleTrees);
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
      const contractArtifact = await this.contractDataSource.getContractArtifact(address);
      const req = await executionRequestForCall(
        sender,
        address,
        setupCalls[i].fnName,
        setupCalls[i].args,
        setupCalls[i].isStaticCall,
        contractArtifact,
      );
      setupExecutionRequests.push(req);
    }
    const appExecutionRequests: PublicExecutionRequest[] = [];
    for (let i = 0; i < appCalls.length; i++) {
      const address = appCalls[i].address;
      const contractArtifact = await this.contractDataSource.getContractArtifact(address);
      const req = await executionRequestForCall(
        sender,
        address,
        appCalls[i].fnName,
        appCalls[i].args,
        appCalls[i].isStaticCall,
        contractArtifact,
      );
      appExecutionRequests.push(req);
    }

    let teardownExecutionRequest: PublicExecutionRequest | undefined = undefined;
    if (teardownCall) {
      const address = teardownCall.address;
      const contractArtifact = await this.contractDataSource.getContractArtifact(address);
      teardownExecutionRequest = await executionRequestForCall(
        sender,
        address,
        teardownCall.fnName,
        teardownCall.args,
        teardownCall.isStaticCall,
        contractArtifact,
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
    feePayer: AztecAddress = AztecAddress.zero(),
    /* need some unique first nullifier for note-nonce computations */
    firstNullifier = new Fr(420000 + this.txCount++),
    globals = defaultGlobals(),
  ): Promise<PublicTxResult> {
    const tx = await this.createTx(sender, setupCalls, appCalls, teardownCall, feePayer, firstNullifier);

    await this.setFeePayerBalance(feePayer);

    const simulator = new PublicTxSimulator(this.merkleTrees, this.worldStateDB, globals, /*doMerkleOperations=*/ true);

    const startTime = performance.now();
    const avmResult = await simulator.simulate(tx);
    const endTime = performance.now();
    this.logger.debug(`Public transaction simulation took ${endTime - startTime}ms`);

    if (avmResult.revertCode.isOK()) {
      await this.commitTxStateUpdates(avmResult.avmProvingRequest.inputs.publicInputs);
    }

    return avmResult;
  }

  private async commitTxStateUpdates(avmCircuitInputs: AvmCircuitPublicInputs) {
    await this.merkleTrees.appendLeaves(
      MerkleTreeId.NOTE_HASH_TREE,
      padArrayEnd(avmCircuitInputs.accumulatedData.noteHashes, Fr.ZERO, MAX_NOTE_HASHES_PER_TX),
    );
    try {
      await this.merkleTrees.batchInsert(
        MerkleTreeId.NULLIFIER_TREE,
        padArrayEnd(avmCircuitInputs.accumulatedData.nullifiers, Fr.ZERO, MAX_NULLIFIERS_PER_TX).map(n => n.toBuffer()),
        NULLIFIER_SUBTREE_HEIGHT,
      );
    } catch (error) {
      this.logger.warn(`Detected duplicate nullifier.`);
    }

    await this.merkleTrees.batchInsert(
      MerkleTreeId.PUBLIC_DATA_TREE,
      avmCircuitInputs.accumulatedData.publicDataWrites.map(w => w.toBuffer()),
      PUBLIC_DATA_TREE_HEIGHT,
    );
  }
}

async function executionRequestForCall(
  sender: AztecAddress,
  address: AztecAddress,
  fnName: string,
  args: Fr[] = [],
  isStaticCall: boolean = false,
  contractArtifact: ContractArtifact = AvmTestContractArtifact,
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

function defaultGlobals() {
  const globals = GlobalVariables.empty();
  globals.timestamp = TIMESTAMP;
  globals.gasFees = DEFAULT_GAS_FEES; // apply some nonzero default gas fees
  globals.blockNumber = DEFAULT_BLOCK_NUMBER;
  return globals;
}

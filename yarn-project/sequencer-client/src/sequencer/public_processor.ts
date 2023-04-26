import { BarretenbergWasm } from '@aztec/barretenberg.js/wasm';
import {
  CircuitsWasm,
  Fr,
  MembershipWitness,
  PUBLIC_CALL_STACK_LENGTH,
  PUBLIC_DATA_TREE_HEIGHT,
  PublicCallData,
  PublicCallStackItem,
  PublicCircuitPublicInputs,
  PublicKernelInputsNoPreviousKernel,
  PublicKernelPublicInputs,
  StateRead,
  StateTransition,
  TxRequest,
  WitnessedPublicCallData,
} from '@aztec/circuits.js';
import { AztecAddress, createDebugLogger } from '@aztec/foundation';
import {
  CompleteContractData,
  ContractData,
  ContractDataSource,
  EncodedContractFunction,
  PublicTx,
  Tx,
} from '@aztec/types';
import { MerkleTreeId, MerkleTreeOperations, computePublicDataTreeLeafIndex } from '@aztec/world-state';
import { pedersenGetHash } from '@aztec/barretenberg.js/crypto';
import times from 'lodash.times';
import { Proof, PublicProver } from '../prover/index.js';
import { PublicCircuitSimulator, PublicKernelCircuitSimulator } from '../simulator/index.js';
import { ProcessedTx, makeEmptyProcessedTx, makeProcessedTx } from './processed_tx.js';

export class MockContractDataSource implements ContractDataSource {
  getL2ContractDataInBlock(blockNum: number): Promise<ContractData[]> {
    return Promise.resolve([]);
  }
  getL2ContractData(_address: AztecAddress): Promise<CompleteContractData | undefined> {
    return Promise.resolve(undefined);
  }
  getL2ContractInfo(_address: AztecAddress): Promise<ContractData | undefined> {
    return Promise.resolve(undefined);
  }
  getPublicFunction(_address: AztecAddress, _selector: Buffer): Promise<EncodedContractFunction | undefined> {
    return Promise.resolve(undefined);
  }
}

export class PublicProcessor {
  constructor(
    protected db: MerkleTreeOperations,
    protected publicCircuit: PublicCircuitSimulator,
    protected publicKernel: PublicKernelCircuitSimulator,
    protected publicProver: PublicProver,
    protected contractDataSource: ContractDataSource,

    private log = createDebugLogger('aztec:sequencer:public-processor'),
  ) {}

  /**
   * Run each tx through the public circuit and the public kernel circuit if needed.
   * @param txs - txs to process
   * @returns the list of processed txs with their circuit simulation outputs.
   */
  public async process(txs: Tx[]): Promise<[ProcessedTx[], Tx[]]> {
    const result: ProcessedTx[] = [];
    const failed: Tx[] = [];

    for (const tx of txs) {
      this.log(`Processing tx ${await tx.getTxHash()}`);
      try {
        result.push(await this.processTx(tx));
      } catch (err) {
        this.log(`Error processing tx ${await tx.getTxHash()}: ${err}`);
        failed.push(tx);
      }
    }
    return [result, failed];
  }

  protected async processTx(tx: Tx): Promise<ProcessedTx> {
    if (tx.isPublic()) {
      const [publicKernelOutput, publicKernelProof] = await this.processPublicTx(tx);
      return makeProcessedTx(tx, publicKernelOutput, publicKernelProof);
    } else if (tx.isPrivate()) {
      return makeProcessedTx(tx);
    } else {
      return makeEmptyProcessedTx();
    }
  }

  // TODO: This is just picking up the txRequest and executing one iteration of it. It disregards
  // any existing private execution information, and any subsequent calls.
  protected async processPublicTx(tx: PublicTx): Promise<[PublicKernelPublicInputs, Proof]> {
    const { txRequest } = tx.txRequest;
    const contractAddress = txRequest.to;

    const fn = await this.contractDataSource.getPublicFunction(
      contractAddress,
      txRequest.functionData.functionSelector,
    );
    const functionSelector = txRequest.functionData.functionSelector;
    if (!fn) throw new Error(`Bytecode not found for ${functionSelector}@${contractAddress}`);
    const contractData = await this.contractDataSource.getL2ContractData(contractAddress);
    if (!contractData) throw new Error(`Portal contract address not found for contract ${contractAddress}`);
    const { portalContractAddress } = contractData;

    const circuitOutput = await this.publicCircuit.publicCircuit(txRequest, fn.bytecode, portalContractAddress);
    const circuitProof = await this.publicProver.getPublicCircuitProof(circuitOutput);
    const publicCallData = await this.processPublicCallData(txRequest, fn.bytecode, circuitOutput, circuitProof);

    const publicKernelInput = new PublicKernelInputsNoPreviousKernel(tx.txRequest, publicCallData);
    const publicKernelOutput = await this.publicKernel.publicKernelCircuitNoInput(publicKernelInput);
    const publicKernelProof = await this.publicProver.getPublicKernelCircuitProof(publicKernelOutput);

    return [publicKernelOutput, publicKernelProof];
  }

  protected async processPublicCallData(
    txRequest: TxRequest,
    functionBytecode: Buffer,
    publicCircuitOutput: PublicCircuitPublicInputs,
    publicCircuitProof: Proof,
  ) {
    // The first call is built from the tx request directly with an empty stack
    const contractAddress = txRequest.to;
    const callStackItem = new PublicCallStackItem(contractAddress, txRequest.functionData, publicCircuitOutput);
    const publicCallStackPreimages: PublicCallStackItem[] = times(PUBLIC_CALL_STACK_LENGTH, PublicCallStackItem.empty);

    // TODO: How to get the bytecode hash? Pedersen or SHA256? What generator to use?
    const bytecodeHash = Fr.fromBuffer(pedersenGetHash(await CircuitsWasm.get(), functionBytecode));
    const portalContractAddress = publicCircuitOutput.callContext.portalContractAddress.toField();

    const publicCallData = new PublicCallData(
      callStackItem,
      publicCallStackPreimages,
      publicCircuitProof,
      portalContractAddress,
      bytecodeHash,
    );

    // Get public data tree root before we make any changes
    const treeRoot = await this.db.getTreeInfo(MerkleTreeId.PUBLIC_DATA_TREE).then(i => Fr.fromBuffer(i.root));

    // Alter public data tree as we go through state transitions producing hash paths
    const { stateReads, stateTransitions } = publicCircuitOutput;
    const { transitionsHashPaths, readsHashPaths } = await this.processStateTransitions(
      contractAddress,
      stateReads,
      stateTransitions,
    );

    return new WitnessedPublicCallData(publicCallData, transitionsHashPaths, readsHashPaths, treeRoot);
  }

  protected async processStateTransitions(
    contract: AztecAddress,
    stateReads: StateRead[],
    stateTransitions: StateTransition[],
  ) {
    const transitionsHashPaths: MembershipWitness<typeof PUBLIC_DATA_TREE_HEIGHT>[] = [];
    const readsHashPaths: MembershipWitness<typeof PUBLIC_DATA_TREE_HEIGHT>[] = [];

    const wasm = await BarretenbergWasm.get();
    const getLeafIndex = (slot: Fr) => computePublicDataTreeLeafIndex(contract, slot, wasm);

    // We get all reads from the unmodified tree
    for (const stateRead of stateReads) {
      readsHashPaths.push(await this.getMembershipWitness(getLeafIndex(stateRead.storageSlot)));
    }

    // And then apply state transitions
    for (const stateTransition of stateTransitions) {
      const index = getLeafIndex(stateTransition.storageSlot);
      transitionsHashPaths.push(await this.getMembershipWitness(index));
      await this.db.updateLeaf(MerkleTreeId.PUBLIC_DATA_TREE, stateTransition.newValue.toBuffer(), index);
    }

    return { readsHashPaths, transitionsHashPaths };
  }

  protected async getMembershipWitness(leafIndex: bigint) {
    const path = await this.db.getSiblingPath(MerkleTreeId.PUBLIC_DATA_TREE, leafIndex);
    return new MembershipWitness(PUBLIC_DATA_TREE_HEIGHT, leafIndex, path.data.map(Fr.fromBuffer));
  }
}

export class MockPublicProcessor extends PublicProcessor {
  protected processPublicTx(_tx: PublicTx): Promise<[PublicKernelPublicInputs, Proof]> {
    throw new Error('Public tx not supported by mock public processor');
  }
}

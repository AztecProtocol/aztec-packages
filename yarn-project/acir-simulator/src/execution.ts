import { ACVMField, acvmMock, ACVMWitness, ACVMNoteInputs, toACVMField, fromACVMField } from './acvm.js';
import {
  ARGS_LENGTH,
  AztecAddress,
  CallContext,
  ContractDeploymentData,
  EMITTED_EVENTS_LENGTH,
  EthAddress,
  Fr,
  L1_MSG_STACK_LENGTH,
  NEW_COMMITMENTS_LENGTH,
  NEW_NULLIFIERS_LENGTH,
  OldTreeRoots,
  PrivateCallStackItem,
  PrivateCircuitPublicInputs,
  PRIVATE_CALL_STACK_LENGTH,
  PUBLIC_CALL_STACK_LENGTH,
  RETURN_VALUES_LENGTH,
  TxRequest,
} from './circuits.js';
import { DBOracle } from './db_oracle.js';
import { frToAztecAddress, frToBoolean, frToEthAddress, WitnessReader, WitnessWriter } from './witness_io.js';

export interface ExecutionPreimages {
  newNotes: Fr[][];
  nullifiedNotes: Fr[];
}

export interface ExecutionResult {
  // Needed for prover
  acir: Buffer;
  partialWitness: Map<number, ACVMField>;
  // Needed for the verifier (kernel)
  callStackItem: PrivateCallStackItem;
  // Needed for the user
  preimages: ExecutionPreimages;
  // Nested executions
  nestedExecutions: this[];
}

export class Execution {
  constructor(
    private db: DBOracle,
    private request: TxRequest,
    private entryPointACIR: Buffer,
    private contractAddress: AztecAddress,
    private portalContractAddress: EthAddress,
    private oldRoots: OldTreeRoots,
  ) {}

  public run(): Promise<ExecutionResult> {
    const callContext = new CallContext(
      this.request.from,
      this.request.to,
      this.portalContractAddress,
      false,
      false,
      this.request.functionData.isConstructor,
    );

    return this.runExternalFunction(
      this.entryPointACIR,
      this.contractAddress,
      this.request.functionData.functionSelector,
      this.request.args,
      callContext,
    );
  }

  // Separate function so we can recurse in the future
  private async runExternalFunction(
    acir: Buffer,
    contractAddress: AztecAddress,
    functionSelector: Buffer,
    args: Fr[],
    callContext: CallContext,
  ): Promise<ExecutionResult> {
    const initialWitness = this.arrangeInitialWitness(args, callContext);
    const newNotePreimages: Fr[][] = [];
    const newNullifiers: Fr[] = [];
    const nestedExecutionContexts: ExecutionResult[] = [];

    const { partialWitness } = await acvmMock(acir, initialWitness, {
      getSecretKey: async (publicKey: ACVMField) => {
        const key = await this.db.getSecretKey(contractAddress, fromACVMField(publicKey).buffer);
        return toACVMField(key);
      },
      getNotes2: async (storageSlot: ACVMField) => {
        const notes = await this.db.getNotes(contractAddress, fromACVMField(storageSlot).buffer);
        const mapped: ACVMNoteInputs[] = notes.slice(0, 2).map(note => ({
          note: note.note.map(f => toACVMField(f)),
          siblingPath: note.siblingPath.map(f => toACVMField(f)),
          index: note.index,
          root: toACVMField(this.oldRoots.privateDataTreeRoot),
        }));
        return mapped;
      },
      getRandomField: () => Promise.resolve(toACVMField(Fr.random())),
      notifyCreatedNote: (notePreimage: ACVMField[]) => {
        const preimage = notePreimage.map(f => fromACVMField(f));
        newNotePreimages.push(preimage);
        return Promise.resolve();
      },
      notifyNullifiedNote: (notePreimage: ACVMField) => {
        newNullifiers.push(fromACVMField(notePreimage));
        return Promise.resolve();
      },
    });

    const publicInputs = this.extractPublicInputs(partialWitness);

    const callStackItem = new PrivateCallStackItem(contractAddress, functionSelector, publicInputs);

    return {
      acir,
      partialWitness,
      callStackItem,
      preimages: {
        newNotes: newNotePreimages,
        nullifiedNotes: newNullifiers,
      },
      nestedExecutions: nestedExecutionContexts,
    };
  }

  private arrangeInitialWitness(args: Fr[], callContext: CallContext) {
    const witness: ACVMWitness = new Map();

    const writer = new WitnessWriter(1, witness);

    writer.writeField(callContext.msgSender);
    writer.writeField(callContext.storageContractAddress);
    writer.writeField(callContext.portalContractAddress);
    writer.writeField(callContext.isDelegateCall);
    writer.writeField(callContext.isStaticCall);
    writer.writeField(callContext.isContractDeployment);

    writer.writeFieldArray(new Array(ARGS_LENGTH).fill(Fr.ZERO).map((value, i) => args[i] || value));

    writer.jump(RETURN_VALUES_LENGTH);
    writer.jump(EMITTED_EVENTS_LENGTH);
    writer.jump(NEW_COMMITMENTS_LENGTH);
    writer.jump(NEW_NULLIFIERS_LENGTH);
    writer.jump(PRIVATE_CALL_STACK_LENGTH);
    writer.jump(PUBLIC_CALL_STACK_LENGTH);
    writer.jump(L1_MSG_STACK_LENGTH);

    writer.writeField(this.oldRoots.privateDataTreeRoot);
    writer.writeField(this.oldRoots.nullifierTreeRoot);
    writer.writeField(this.oldRoots.contractTreeRoot);

    writer.writeField(this.request.txContext.contractDeploymentData.constructorVkHash);
    writer.writeField(this.request.txContext.contractDeploymentData.functionTreeRoot);
    writer.writeField(this.request.txContext.contractDeploymentData.contractAddressSalt);
    writer.writeField(this.request.txContext.contractDeploymentData.portalContractAddress);

    return witness;
  }

  private extractPublicInputs(partialWitness: ACVMWitness): PrivateCircuitPublicInputs {
    const witnessReader = new WitnessReader(1, partialWitness);

    const callContext = new CallContext(
      frToAztecAddress(witnessReader.readField()),
      frToAztecAddress(witnessReader.readField()),
      frToEthAddress(witnessReader.readField()),
      frToBoolean(witnessReader.readField()),
      frToBoolean(witnessReader.readField()),
      frToBoolean(witnessReader.readField()),
    );

    const args = witnessReader.readFieldArray(ARGS_LENGTH);
    const returnValues = witnessReader.readFieldArray(RETURN_VALUES_LENGTH);
    const emittedEvents = witnessReader.readFieldArray(EMITTED_EVENTS_LENGTH);
    const newCommitments = witnessReader.readFieldArray(NEW_COMMITMENTS_LENGTH);
    const newNullifiers = witnessReader.readFieldArray(NEW_NULLIFIERS_LENGTH);
    const privateCallStack = witnessReader.readFieldArray(PRIVATE_CALL_STACK_LENGTH);
    const publicCallStack = witnessReader.readFieldArray(PUBLIC_CALL_STACK_LENGTH);
    const l1MsgStack = witnessReader.readFieldArray(L1_MSG_STACK_LENGTH);

    const privateDataTreeRoot = witnessReader.readField();
    const nullifierTreeRoot = witnessReader.readField();
    const contractTreeRoot = witnessReader.readField();

    const contractDeploymentData = new ContractDeploymentData(
      witnessReader.readField(),
      witnessReader.readField(),
      witnessReader.readField(),
      frToEthAddress(witnessReader.readField()),
    );

    return new PrivateCircuitPublicInputs(
      callContext,
      args,
      returnValues,
      emittedEvents,
      newCommitments,
      newNullifiers,
      privateCallStack,
      publicCallStack,
      l1MsgStack,
      privateDataTreeRoot,
      nullifierTreeRoot,
      contractTreeRoot,
      contractDeploymentData,
    );
  }
}

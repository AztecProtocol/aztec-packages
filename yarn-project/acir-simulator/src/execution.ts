import { ACVMField, acvmMock, ACVMWitness, ACVMNoteInputs } from './acvm.js';
import {
  ARGS_LENGTH,
  AztecAddress,
  CallContext,
  EMITTED_EVENTS_LENGTH,
  EthAddress,
  Fr,
  L1_MSG_STACK_LENGTH,
  NEW_COMMITMENTS_LENGTH,
  NEW_NULLIFIERS_LENGTH,
  OldTreeRoots,
  PrivateCallStackItem,
  PRIVATE_CALL_STACK_LENGTH,
  PUBLIC_CALL_STACK_LENGTH,
  RETURN_VALUES_LENGTH,
  TxRequest,
} from './circuits.js';
import { DBOracle } from './db_oracle.js';

export interface ExecutionPreimages {
  newNotes: Fr[][];
  nullifiedNotes: Fr[];
}

export interface ExecutionResult {
  // Needed for prover
  acir: Buffer;
  partialWitness: Map<number, Fr>;
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

    const { partialWitness: partialACVMWitness } = await acvmMock(acir, initialWitness, {
      getSecretKey: async (publicKey: ACVMField) => {
        const key = await this.db.getSecretKey(contractAddress, this.fromACVMField(publicKey).buffer);
        return this.toACVMField(key);
      },
      getNotes2: async (storageSlot: ACVMField) => {
        const notes = await this.db.getNotes(contractAddress, this.fromACVMField(storageSlot).buffer);
        const mapped: ACVMNoteInputs[] = notes.slice(0, 2).map(note => ({
          note: note.note.map(f => this.toACVMField(f)),
          siblingPath: note.siblingPath.map(f => this.toACVMField(f)),
          index: note.index,
          root: this.toACVMField(this.oldRoots.privateDataTreeRoot),
        }));
        return mapped;
      },
      getRandomField: () => Promise.resolve(this.toACVMField(Fr.random())),
      notifyCreatedNote: (notePreimage: ACVMField[]) => {
        const preimage = notePreimage.map(f => this.fromACVMField(f));
        newNotePreimages.push(preimage);
        return Promise.resolve();
      },
      notifyNullifiedNote: (notePreimage: ACVMField) => {
        newNullifiers.push(this.fromACVMField(notePreimage));
        return Promise.resolve();
      },
    });

    const partialWitness = new Map<number, Fr>(
      Array.from(partialACVMWitness).map(([k, v]) => [k, this.fromACVMField(v)]),
    );

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
    // TODO get these indices from circuits.js and consider offset
    witness.set(1, this.toACVMField(callContext.msgSender));
    witness.set(2, this.toACVMField(callContext.storageContractAddress));
    witness.set(3, this.toACVMField(callContext.portalContractAddress));
    witness.set(4, this.toACVMField(callContext.isDelegateCall));
    witness.set(5, this.toACVMField(callContext.isStaticCall));
    witness.set(6, this.toACVMField(callContext.isContractDeployment));

    for (let i = 0; i < ARGS_LENGTH; i++) {
      witness.set(7 + i, this.toACVMField(args[i]));
    }

    const ROOTS_INDEX =
      7 +
      ARGS_LENGTH +
      RETURN_VALUES_LENGTH +
      EMITTED_EVENTS_LENGTH +
      NEW_COMMITMENTS_LENGTH +
      NEW_NULLIFIERS_LENGTH +
      PRIVATE_CALL_STACK_LENGTH +
      PUBLIC_CALL_STACK_LENGTH +
      L1_MSG_STACK_LENGTH;

    witness.set(ROOTS_INDEX, this.toACVMField(this.oldRoots.privateDataTreeRoot));
    witness.set(ROOTS_INDEX + 1, this.toACVMField(this.oldRoots.nullifierTreeRoot));
    witness.set(ROOTS_INDEX + 2, this.toACVMField(this.oldRoots.contractTreeRoot));

    witness.set(ROOTS_INDEX + 3, this.toACVMField(this.request.txContext.contractDeploymentData.constructorVkHash));
    witness.set(ROOTS_INDEX + 4, this.toACVMField(this.request.txContext.contractDeploymentData.functionTreeRoot));
    witness.set(ROOTS_INDEX + 5, this.toACVMField(this.request.txContext.contractDeploymentData.contractAddressSalt));
    witness.set(ROOTS_INDEX + 6, this.toACVMField(this.request.txContext.contractDeploymentData.portalContractAddress));

    return witness;
  }

  private extractPublicInputs(partialWitness: Map<number, Fr>): Fr[] {
    // TODO get these indices from circuits.js and consider offset
  }

  private toACVMField(value: Fr | Buffer | boolean): `0x${string}` {
    if (typeof value === 'boolean') {
      return value ? '0x01' : '0x00';
    }
    let buffer;
    if (!Buffer.isBuffer(value)) {
      buffer = value.buffer;
    } else {
      buffer = value;
    }
    return `0x${buffer.toString('hex')}`;
  }

  private fromACVMField(field: `0x${string}`): Fr {
    const buffer = Buffer.from(field.slice(2), 'hex');
    return new Fr(buffer);
  }
}

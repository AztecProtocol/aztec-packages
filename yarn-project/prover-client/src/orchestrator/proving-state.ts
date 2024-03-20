import { ProcessedTx, ProvingResult } from '@aztec/circuit-types';
import {
  BaseOrMergeRollupPublicInputs,
  Fr,
  GlobalVariables,
  NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP,
  Proof,
  RootParityInput,
} from '@aztec/circuits.js';
import { randomBytes } from '@aztec/foundation/crypto';
import { Tuple } from '@aztec/foundation/serialize';

/**
 * Enums and structs to communicate the type of work required in each request.
 */
export enum PROVING_JOB_TYPE {
  STATE_UPDATE,
  BASE_ROLLUP,
  MERGE_ROLLUP,
  ROOT_ROLLUP,
  BASE_PARITY,
  ROOT_PARITY,
}

export type ProvingJob = {
  type: PROVING_JOB_TYPE;
  operation: () => Promise<void>;
};

export type MergeRollupInputData = {
  inputs: [BaseOrMergeRollupPublicInputs | undefined, BaseOrMergeRollupPublicInputs | undefined];
  proofs: [Proof | undefined, Proof | undefined];
};

/**
 * The current state of the proving schedule. Contains the raw inputs (txs) and intermediate state to generate every constituent proof in the tree.
 * Carries an identifier so we can identify if the proving state is discarded and a new one started.
 * Captures resolve and reject callbacks to provide a promise base interface to the consumer of our proving.
 */
export class ProvingState {
  private _stateIdentifier: string;
  private _mergeRollupInputs: MergeRollupInputData[] = [];
  private _rootParityInputs: Array<RootParityInput | undefined> = [];
  private _finalRootParityInput: RootParityInput | undefined;
  private __finished = false;
  private _txs: ProcessedTx[] = [];
  constructor(
    private _numTxs: number,
    private _completionCallback: (result: ProvingResult) => void,
    private _rejectionCallback: (reason: string) => void,
    private _globalVariables: GlobalVariables,
    private _newL1ToL2Messages: Tuple<Fr, typeof NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP>,
    numRootParityInputs: number,
    private _emptyTx: ProcessedTx,
  ) {
    this._stateIdentifier = randomBytes(32).toString('hex');
    this._rootParityInputs = Array.from({ length: numRootParityInputs }).map(_ => undefined);
  }

  public get baseMergeLevel() {
    return BigInt(Math.ceil(Math.log2(this.totalNumTxs)) - 1);
  }

  public get numMergeLevels() {
    return this.baseMergeLevel;
  }

  public get numRealTxs() {
    return this._numTxs;
  }

  public get numPaddingTxs() {
    return this.totalNumTxs - this.numRealTxs;
  }

  public get totalNumTxs() {
    const realTxs = Math.max(2, this.numRealTxs);
    const pow2Txs = Math.ceil(Math.log2(realTxs));
    return 2 ** pow2Txs;
  }

  public addNewTx(tx: ProcessedTx) {
    this._txs.push(tx);
    return this._txs.length - 1;
  }

  public get transactionsReceived() {
    return this._txs.length;
  }

  public get globalVariables() {
    return this._globalVariables;
  }

  public get newL1ToL2Messages() {
    return this._newL1ToL2Messages;
  }

  public get stateIdentifier() {
    return this._stateIdentifier;
  }

  public get finalRootParityInput() {
    return this._finalRootParityInput;
  }

  public set finalRootParityInput(input: RootParityInput | undefined) {
    this._finalRootParityInput = input;
  }

  public get rootParityInputs() {
    return this._rootParityInputs;
  }

  public verifyState(stateId: string) {
    return stateId === this._stateIdentifier && !this.__finished;
  }

  public get emptyTx() {
    return this._emptyTx;
  }

  public get allTxs() {
    return this._txs;
  }

  public storeMergeInputs(
    mergeInputs: [BaseOrMergeRollupPublicInputs, Proof],
    indexWithinMerge: number,
    indexOfMerge: number,
  ) {
    if (!this._mergeRollupInputs[indexOfMerge]) {
      const mergeInputData: MergeRollupInputData = {
        inputs: [undefined, undefined],
        proofs: [undefined, undefined],
      };
      mergeInputData.inputs[indexWithinMerge] = mergeInputs[0];
      mergeInputData.proofs[indexWithinMerge] = mergeInputs[1];
      this._mergeRollupInputs[indexOfMerge] = mergeInputData;
      return false;
    }
    const mergeInputData = this._mergeRollupInputs[indexOfMerge];
    mergeInputData.inputs[indexWithinMerge] = mergeInputs[0];
    mergeInputData.proofs[indexWithinMerge] = mergeInputs[1];
    return true;
  }

  public getMergeInputs(indexOfMerge: number) {
    return this._mergeRollupInputs[indexOfMerge];
  }

  public isReadyForRootRollup() {
    if (this._mergeRollupInputs[0] === undefined) {
      return false;
    }
    if (this._mergeRollupInputs[0].inputs.findIndex(p => !p) !== -1) {
      return false;
    }
    if (this._finalRootParityInput === undefined) {
      return false;
    }
    return true;
  }

  public setRootParityInputs(inputs: RootParityInput, index: number) {
    this._rootParityInputs[index] = inputs;
  }

  public areRootParityInputsReady() {
    return this._rootParityInputs.findIndex(p => !p) === -1;
  }

  public reject(reason: string, stateIdentifier: string) {
    if (!this.verifyState(stateIdentifier)) {
      return;
    }
    if (this.__finished) {
      return;
    }
    this.__finished = true;
    this._rejectionCallback(reason);
  }

  public resolve(result: ProvingResult, stateIdentifier: string) {
    if (!this.verifyState(stateIdentifier)) {
      return;
    }
    if (this.__finished) {
      return;
    }
    this.__finished = true;
    this._completionCallback(result);
  }
}

import {
  type AvmProvingRequest,
  EncryptedNoteTxL2Logs,
  EncryptedTxL2Logs,
  type ProcessedTx,
  type PublicInputsAndRecursiveProof,
  UnencryptedTxL2Logs,
  toTxEffect,
} from '@aztec/circuit-types';
import { type BaseOrMergeRollupPublicInputs, Fr, type GlobalVariables } from '@aztec/circuits.js';
import { memoize } from '@aztec/foundation/decorators';
import { createDebugLogger } from '@aztec/foundation/log';
import { toFriendlyJSON } from '@aztec/foundation/serialize';

import { AvmCircuit } from './circuits/avm.js';
import { BaseRollupCircuit } from './circuits/base-rollup.js';
import { PublicKernelNonTailCircuit } from './circuits/public-kernel-non-tail.js';
import { PublicKernelTailCircuit } from './circuits/public-kernel-tail.js';
import { TubeCircuit } from './circuits/tube.js';
import { type OrchestratorContext } from './types.js';

/**
 * Orchestrates the proving of a single transaction.
 */
export class TxOrchestrator {
  private readonly baseRollup: BaseRollupCircuit;

  private readonly logger = createDebugLogger('aztec:prover-client:tx-orchestrator');

  constructor(
    public readonly tx: ProcessedTx,
    public readonly globalVariables: GlobalVariables,
    public readonly index: number,
    private readonly context: OrchestratorContext,
  ) {
    this.validateTx();
    this.baseRollup = this.createBaseRollup();
    this.handleError = this.handleError.bind(this);
  }

  /**
   * Updates world-state with the outputs of the transaction.
   * Required in order for simulate and prove to complete.
   */
  @memoize
  public async updateState() {
    await this.baseRollup.updateState();
  }

  /**
   * Simulates the base rollup circuit for the transaction.
   * Requires updateState to have been called, blocks otherwise.
   */
  @memoize
  public simulate(): Promise<BaseOrMergeRollupPublicInputs> {
    return this.baseRollup.simulate();
  }

  /**
   * Proves all public proof requests in the transaction and returns the base rollup proof.
   * Requires updateState to have been called, blocks otherwise.
   */
  @memoize
  public async prove(): Promise<PublicInputsAndRecursiveProof<BaseOrMergeRollupPublicInputs>> {
    void this.startProving();
    return await this.baseRollup.prove();
  }

  /**
   * Returns the tx effect for the transaction.
   */
  @memoize
  public getTxEffect() {
    return toTxEffect(this.tx, this.globalVariables.gasFees);
  }

  private createBaseRollup() {
    return new BaseRollupCircuit(this.tx, this.globalVariables, this.index, this.context);
  }

  private startProving() {
    const tube = new TubeCircuit(this.tx, this.context);

    // The first kernel will be fed the output of the tube proof
    let previousKernel: TubeCircuit | PublicKernelNonTailCircuit | PublicKernelTailCircuit = tube;

    for (let i = 0; i < this.tx.publicProvingRequests.length; i++) {
      const provingRequest = this.tx.publicProvingRequests[i];

      // Public kernels are either tied to an AVM proof or a tail
      const publicKernel =
        provingRequest.type === 'AVM'
          ? this.createPublicKernelForAvm(provingRequest)
          : new PublicKernelTailCircuit(provingRequest, this.context);

      // Kick off proving for the previous kernel and wire its output onto the next one
      void previousKernel
        .prove()
        .then(proof => publicKernel.setPreviousKernelProof(proof))
        .catch(this.handleError);

      previousKernel = publicKernel;
    }

    // Prove the last kernel and wire it into the base rollup
    previousKernel
      .prove()
      .then(proof => this.baseRollup.setNestedKernelProof(proof))
      .catch(this.handleError);
  }

  private createPublicKernelForAvm(provingRequest: AvmProvingRequest) {
    const avm = new AvmCircuit(provingRequest, this.context);
    const publicKernelNonTail = new PublicKernelNonTailCircuit(provingRequest.kernelRequest, this.context);

    // Kick off AVM proving and wire it into its kernel
    void avm
      .prove()
      .then(proof => publicKernelNonTail.setNestedAvmProof(proof))
      .catch(this.handleError);

    return publicKernelNonTail;
  }

  private handleError(err: Error) {
    this.logger.error(`Error in tx orchestrator`, err);
    throw new Error('Unimplemented');
  }

  private validateTx() {
    const tx = this.tx;
    const kernelData = tx.data;
    const txHeader = kernelData.constants.historicalHeader;

    if (txHeader.state.l1ToL2MessageTree.isZero()) {
      throw new Error(`Empty L1 to L2 messages tree in tx: ${toFriendlyJSON(tx)}`);
    }
    if (txHeader.state.partial.noteHashTree.isZero()) {
      throw new Error(`Empty note hash tree in tx: ${toFriendlyJSON(tx)}`);
    }
    if (txHeader.state.partial.nullifierTree.isZero()) {
      throw new Error(`Empty nullifier tree in tx: ${toFriendlyJSON(tx)}`);
    }
    if (txHeader.state.partial.publicDataTree.isZero()) {
      throw new Error(`Empty public data tree in tx: ${toFriendlyJSON(tx)}`);
    }

    const txNoteEncryptedLogs = EncryptedNoteTxL2Logs.hashNoteLogs(
      kernelData.end.noteEncryptedLogsHashes.filter(log => !log.isEmpty()).map(log => log.value.toBuffer()),
    );

    if (!txNoteEncryptedLogs.equals(tx.noteEncryptedLogs.hash())) {
      throw new Error(
        `Note encrypted logs hash mismatch: ${Fr.fromBuffer(txNoteEncryptedLogs)} !== ${Fr.fromBuffer(
          tx.noteEncryptedLogs.hash(),
        )}`,
      );
    }

    const txEncryptedLogs = EncryptedTxL2Logs.hashSiloedLogs(
      kernelData.end.encryptedLogsHashes.filter(log => !log.isEmpty()).map(log => log.getSiloedHash()),
    );

    if (!txEncryptedLogs.equals(tx.encryptedLogs.hash())) {
      throw new Error(
        `Encrypted logs hash mismatch: ${Fr.fromBuffer(txEncryptedLogs)} !== ${Fr.fromBuffer(tx.encryptedLogs.hash())}`,
      );
    }

    const txUnencryptedLogs = UnencryptedTxL2Logs.hashSiloedLogs(
      kernelData.end.unencryptedLogsHashes.filter(log => !log.isEmpty()).map(log => log.getSiloedHash()),
    );

    if (!txUnencryptedLogs.equals(tx.unencryptedLogs.hash())) {
      throw new Error(
        `Unencrypted logs hash mismatch: ${Fr.fromBuffer(txUnencryptedLogs)} !== ${Fr.fromBuffer(
          tx.unencryptedLogs.hash(),
        )}`,
      );
    }
  }
}

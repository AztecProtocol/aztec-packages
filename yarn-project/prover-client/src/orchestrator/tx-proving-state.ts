import {
  EncryptedNoteTxL2Logs,
  EncryptedTxL2Logs,
  type MerkleTreeId,
  type ProcessedTx,
  type ProofAndVerificationKey,
  UnencryptedTxL2Logs,
} from '@aztec/circuit-types';
import {
  type AVM_PROOF_LENGTH_IN_FIELDS,
  AVM_VK_INDEX,
  type AppendOnlyTreeSnapshot,
  AvmProofData,
  type BaseRollupHints,
  Fr,
  PrivateBaseRollupInputs,
  PrivateTubeData,
  PublicBaseRollupInputs,
  PublicTubeData,
  type RecursiveProof,
  type TUBE_PROOF_LENGTH,
  TUBE_VK_INDEX,
  TubeInputs,
  VkWitnessData,
} from '@aztec/circuits.js';
import { getVKIndex, getVKSiblingPath } from '@aztec/noir-protocol-circuits-types';

/**
 * Helper class to manage the proving cycle of a transaction
 * This includes the public VMs and the public kernels
 * Also stores the inputs to the base rollup for this transaction and the tree snapshots
 */
export class TxProvingState {
  private tube?: ProofAndVerificationKey<RecursiveProof<typeof TUBE_PROOF_LENGTH>>;
  private avm?: ProofAndVerificationKey<RecursiveProof<typeof AVM_PROOF_LENGTH_IN_FIELDS>>;

  constructor(
    public readonly processedTx: ProcessedTx,
    private readonly baseRollupHints: BaseRollupHints,
    public readonly treeSnapshots: Map<MerkleTreeId, AppendOnlyTreeSnapshot>,
  ) {}

  get requireAvmProof() {
    return !!this.processedTx.avmProvingRequest;
  }

  public ready() {
    return !!this.tube && (!this.requireAvmProof || !!this.avm);
  }

  public getTubeInputs() {
    return new TubeInputs(this.processedTx.clientIvcProof);
  }

  public getAvmInputs() {
    return this.processedTx.avmProvingRequest!.inputs;
  }

  public getPrivateBaseInputs() {
    if (this.requireAvmProof) {
      throw new Error('Should create public base rollup for a tx requiring avm proof.');
    }
    if (!this.tube) {
      throw new Error('Tx not ready for proving base rollup.');
    }

    const vkData = this.getTubeVkData();
    const tubeData = new PrivateTubeData(this.processedTx.data.toKernelCircuitPublicInputs(), this.tube.proof, vkData);

    return new PrivateBaseRollupInputs(tubeData, this.baseRollupHints);
  }

  public getPublicBaseInputs() {
    if (!this.processedTx.avmProvingRequest) {
      throw new Error('Should create private base rollup for a tx not requiring avm proof.');
    }
    if (!this.tube) {
      throw new Error('Tx not ready for proving base rollup: tube proof undefined');
    }
    if (!this.avm) {
      throw new Error('Tx not ready for proving base rollup: avm proof undefined');
    }

    const tubeData = new PublicTubeData(
      this.processedTx.data.toPublicKernelCircuitPublicInputs(),
      this.tube.proof,
      this.getTubeVkData(),
    );

    const avmProofData = new AvmProofData(
      this.processedTx.avmProvingRequest.inputs.output,
      this.avm.proof,
      this.getAvmVkData(),
    );

    return new PublicBaseRollupInputs(tubeData, avmProofData, this.baseRollupHints);
  }

  public assignTubeProof(tubeProofAndVk: ProofAndVerificationKey<RecursiveProof<typeof TUBE_PROOF_LENGTH>>) {
    this.tube = tubeProofAndVk;
  }

  public assignAvmProof(avmProofAndVk: ProofAndVerificationKey<RecursiveProof<typeof AVM_PROOF_LENGTH_IN_FIELDS>>) {
    this.avm = avmProofAndVk;
  }

  public verifyStateOrReject(): string | undefined {
    const txEffect = this.processedTx.txEffect;
    const fromPrivate = this.processedTx.data;

    const noteEncryptedLogsHashes = [
      fromPrivate.forRollup?.end.noteEncryptedLogsHashes || [],
      fromPrivate.forPublic?.nonRevertibleAccumulatedData.noteEncryptedLogsHashes || [],
      fromPrivate.forPublic?.revertibleAccumulatedData.noteEncryptedLogsHashes || [],
    ].flat();
    const txNoteEncryptedLogsHash = EncryptedNoteTxL2Logs.hashNoteLogs(
      noteEncryptedLogsHashes.filter(log => !log.isEmpty()).map(log => log.value.toBuffer()),
    );
    if (!txNoteEncryptedLogsHash.equals(txEffect.noteEncryptedLogs.hash())) {
      return `Note encrypted logs hash mismatch: ${Fr.fromBuffer(txNoteEncryptedLogsHash)} === ${Fr.fromBuffer(
        txEffect.noteEncryptedLogs.hash(),
      )}`;
    }

    const encryptedLogsHashes = [
      fromPrivate.forRollup?.end.encryptedLogsHashes || [],
      fromPrivate.forPublic?.nonRevertibleAccumulatedData.encryptedLogsHashes || [],
      fromPrivate.forPublic?.revertibleAccumulatedData.encryptedLogsHashes || [],
    ].flat();
    const txEncryptedLogsHash = EncryptedTxL2Logs.hashSiloedLogs(
      encryptedLogsHashes.filter(log => !log.isEmpty()).map(log => log.getSiloedHash()),
    );
    if (!txEncryptedLogsHash.equals(txEffect.encryptedLogs.hash())) {
      // @todo This rejection messages is never seen. Never making it out to the logs
      return `Encrypted logs hash mismatch: ${Fr.fromBuffer(txEncryptedLogsHash)} === ${Fr.fromBuffer(
        txEffect.encryptedLogs.hash(),
      )}`;
    }

    const avmOutput = this.processedTx.avmProvingRequest?.inputs.output;
    const unencryptedLogsHashes = avmOutput
      ? avmOutput.accumulatedData.unencryptedLogsHashes
      : fromPrivate.forRollup!.end.unencryptedLogsHashes;
    const txUnencryptedLogsHash = UnencryptedTxL2Logs.hashSiloedLogs(
      unencryptedLogsHashes.filter(log => !log.isEmpty()).map(log => log.getSiloedHash()),
    );
    if (!txUnencryptedLogsHash.equals(txEffect.unencryptedLogs.hash())) {
      return `Unencrypted logs hash mismatch: ${Fr.fromBuffer(txUnencryptedLogsHash)} === ${Fr.fromBuffer(
        txEffect.unencryptedLogs.hash(),
      )}`;
    }
  }

  private getTubeVkData() {
    let vkIndex = TUBE_VK_INDEX;
    try {
      vkIndex = getVKIndex(this.tube!.verificationKey);
    } catch (_ignored) {
      // TODO(#7410) The VK for the tube won't be in the tree for now, so we manually set it to the tube vk index
    }
    const vkPath = getVKSiblingPath(vkIndex);

    return new VkWitnessData(this.tube!.verificationKey, vkIndex, vkPath);
  }

  private getAvmVkData() {
    const vkIndex = AVM_VK_INDEX;
    const vkPath = getVKSiblingPath(vkIndex);
    return new VkWitnessData(this.avm!.verificationKey, AVM_VK_INDEX, vkPath);
  }
}

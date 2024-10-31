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
  type RecursiveProof,
  type TUBE_PROOF_LENGTH,
  TUBE_VK_INDEX,
  TubeInputs,
  VMCircuitPublicInputs,
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
    const tubeData = new PrivateTubeData(this.processedTx.data, this.tube.proof, vkData);

    return new PrivateBaseRollupInputs(tubeData, this.baseRollupHints);
  }

  public getPublicBaseInputs() {
    if (!this.requireAvmProof) {
      throw new Error('Should create private base rollup for a tx not requiring avm proof.');
    }
    if (!this.tube) {
      throw new Error('Tx not ready for proving base rollup: tube proof undefined');
    }
    if (!this.avm) {
      throw new Error('Tx not ready for proving base rollup: avm proof undefined');
    }

    // Temporary hack.
    // Passing this.processedTx.data to the tube, which is the output of the simulated public_kernel_tail,
    // so that the output of the public base will contain all the side effects.
    // This should be the output of the private_kernel_tail_to_public when the output of the avm proof is the result of
    // simulating the entire public call stack.
    const tubeData = new PrivateTubeData(this.processedTx.data, this.tube.proof, this.getTubeVkData());

    const avmProofData = new AvmProofData(
      VMCircuitPublicInputs.empty(), // TODO
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
    const kernelPublicInputs = this.processedTx.data;

    const txNoteEncryptedLogs = EncryptedNoteTxL2Logs.hashNoteLogs(
      kernelPublicInputs.end.noteEncryptedLogsHashes.filter(log => !log.isEmpty()).map(log => log.value.toBuffer()),
    );
    if (!txNoteEncryptedLogs.equals(this.processedTx.noteEncryptedLogs.hash())) {
      return `Note encrypted logs hash mismatch: ${Fr.fromBuffer(txNoteEncryptedLogs)} === ${Fr.fromBuffer(
        this.processedTx.noteEncryptedLogs.hash(),
      )}`;
    }

    const txEncryptedLogs = EncryptedTxL2Logs.hashSiloedLogs(
      kernelPublicInputs.end.encryptedLogsHashes.filter(log => !log.isEmpty()).map(log => log.getSiloedHash()),
    );
    if (!txEncryptedLogs.equals(this.processedTx.encryptedLogs.hash())) {
      // @todo This rejection messages is never seen. Never making it out to the logs
      return `Encrypted logs hash mismatch: ${Fr.fromBuffer(txEncryptedLogs)} === ${Fr.fromBuffer(
        this.processedTx.encryptedLogs.hash(),
      )}`;
    }

    const txUnencryptedLogs = UnencryptedTxL2Logs.hashSiloedLogs(
      kernelPublicInputs.end.unencryptedLogsHashes.filter(log => !log.isEmpty()).map(log => log.getSiloedHash()),
    );
    if (!txUnencryptedLogs.equals(this.processedTx.unencryptedLogs.hash())) {
      return `Unencrypted logs hash mismatch: ${Fr.fromBuffer(txUnencryptedLogs)} === ${Fr.fromBuffer(
        this.processedTx.unencryptedLogs.hash(),
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

import { BackendOptions, Barretenberg } from './index.js';
import { RawBuffer } from '../types/raw_buffer.js';
import { flattenFieldsAsArray, ProofData, reconstructHonkProof } from '../proof/index.js';

// TODO: once UP is removed we can just roll this into the bas `Barretenberg` class.

export class BarretenbergVerifier {
  // These type assertions are used so that we don't
  // have to initialize `api` and `acirComposer` in the constructor.
  // These are initialized asynchronously in the `init` function,
  // constructors cannot be asynchronous which is why we do this.

  private api!: Barretenberg;
  // eslint-disable-next-line  @typescript-eslint/no-explicit-any
  private acirComposer: any;

  constructor(private options: BackendOptions = { threads: 1 }) {}

  /** @ignore */
  async instantiate(): Promise<void> {
    if (!this.api) {
      const api = await Barretenberg.new(this.options);
      await api.initSRSForCircuitSize(0);

      this.api = api;
    }
  }

  /** @description Verifies a proof */
  async verifyUltraHonkProof(proofData: ProofData, verificationKey: Uint8Array): Promise<boolean> {
    await this.instantiate();

    const proof = reconstructHonkProof(flattenFieldsAsArray(proofData.publicInputs), proofData.proof);
    return await this.api.acirVerifyUltraZKHonk(proof, new RawBuffer(verificationKey));
  }

  async destroy(): Promise<void> {
    if (!this.api) {
      return;
    }
    await this.api.destroy();
  }
}

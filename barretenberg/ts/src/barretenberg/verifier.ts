import { BackendOptions, Barretenberg } from './index.js';
import { RawBuffer } from '../types/raw_buffer.js';

// TODO: once UP is removed we can just roll this into the bas `Barretenberg` class.

export class BarretenbergVerifier {
  // eslint-disable-next-line  @typescript-eslint/no-explicit-any
  private acirComposer: any;

  constructor(private api: Barretenberg) {}

  static async new(options?: BackendOptions): Promise<BarretenbergVerifier> {
    const api = await Barretenberg.new(options);
    return new BarretenbergVerifier(api);
  }

  /** @ignore */
  async instantiate(): Promise<void> {
    if (!this.acirComposer) {
      await this.api.initSRSForCircuitSize(0);
      this.acirComposer = await this.api.acirNewAcirComposer(0);
    }
  }

  /** @description Verifies a proof */
  async verifyUltraplonkProof(proof: Uint8Array, verificationKey: Uint8Array): Promise<boolean> {
    await this.instantiate();
    // The verifier can be used for a variety of ACIR programs so we should not assume that it
    // is preloaded with the correct verification key.
    await this.api.acirLoadVerificationKey(this.acirComposer, new RawBuffer(verificationKey));

    return await this.api.acirVerifyProof(this.acirComposer, proof);
  }

  /** @description Verifies a proof */
  async verifyUltrahonkProof(proof: Uint8Array, verificationKey: Uint8Array): Promise<boolean> {
    await this.instantiate();

    return await this.api.acirVerifyUltraHonk(proof, new RawBuffer(verificationKey));
  }

  async destroy(): Promise<void> {
    await this.api.destroy();
  }
}

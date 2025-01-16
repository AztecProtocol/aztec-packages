import { BarretenbergSync } from './index.js';
import { RawBuffer } from '../types/raw_buffer.js';
import { flattenFieldsAsArray, ProofData, reconstructHonkProof, reconstructUltraPlonkProof } from '../proof/index.js';
import { Crs } from '../crs/index.js';

// TODO: once UP is removed we can just roll this into the bas `Barretenberg` class.

export class BarretenbergVerifier {
  // These type assertions are used so that we don't
  // have to initialize `api` and `acirComposer` in the constructor.
  // These are initialized asynchronously in the `init` function,
  // constructors cannot be asynchronous which is why we do this.

  private api!: BarretenbergSync;
  // eslint-disable-next-line  @typescript-eslint/no-explicit-any
  private acirComposer: any;

  constructor() {}

  /** @ignore */
  async instantiate(): Promise<void> {
    if (!this.api) {
      const api = BarretenbergSync.getSingleton();
      const crs = await Crs.new(1);
      api.srsInitSrs(new RawBuffer(crs.getG1Data()), crs.numPoints, new RawBuffer(crs.getG2Data()));

      this.acirComposer = api.acirNewAcirComposer(0);
      this.api = api;
    }
  }

  /** @description Verifies a proof */
  async verifyUltraPlonkProof(proofData: ProofData, verificationKey: Uint8Array): Promise<boolean> {
    await this.instantiate();
    // The verifier can be used for a variety of ACIR programs so we should not assume that it
    // is preloaded with the correct verification key.
    this.api.acirLoadVerificationKey(this.acirComposer, new RawBuffer(verificationKey));

    const proof = reconstructUltraPlonkProof(proofData);
    return this.api.acirVerifyProof(this.acirComposer, proof);
  }

  /** @description Verifies a proof */
  async verifyUltraHonkProof(proofData: ProofData, verificationKey: Uint8Array): Promise<boolean> {
    await this.instantiate();

    const proof = reconstructHonkProof(flattenFieldsAsArray(proofData.publicInputs), proofData.proof);
    return this.api.acirVerifyUltraHonk(proof, new RawBuffer(verificationKey));
  }

  destroy(): Promise<void> {
    if (this.api) {
      this.api.acirDeleteAcirComposer(this.acirComposer);
    }
    return Promise.resolve();
  }
}

import { Barretenberg } from '../barretenberg/index.js';
import { BarretenbergCmds, Circuit, FieldsAndBinary } from '../barretenberg_cmds/index.js';
import { Crs } from '../crs/index.js';
import { Ptr } from '../types/ptr.js';
import { RawBuffer } from '../types/raw_buffer.js';

// This is the number of bytes in a UltraPlonk proof minus the public inputs.
const numBytesInProofWithoutPublicInputs = 2144;

export class BarretenbergCmdsWasm implements BarretenbergCmds {
  private apiPromise: Promise<Barretenberg> | undefined;

  private composerPromises: Record<string, Promise<Ptr>> = {};

  async prove(circuit: Circuit, witness: Buffer): Promise<{ proof: FieldsAndBinary; vk: FieldsAndBinary }> {
    const { api, composer } = await this.getComposer(circuit);

    await api.acirInitProvingKey(composer, circuit.bytecode);
    const proof = await api.acirCreateProof(composer, circuit.bytecode, witness);
    const proofFields = await api.acirSerializeProofIntoFields(composer, proof, numBytesInProofWithoutPublicInputs);
    const vk = await api.acirGetVerificationKey(composer);
    const vkFields = await api.acirSerializeVerificationKeyIntoFields(composer);

    return { proof: { binary: proof, fields: proofFields }, vk: { binary: vk, fields: vkFields } };
  }

  private async getApi() {
    if (!this.apiPromise) {
      const threads = await this.getThreads();
      this.apiPromise = Barretenberg.new({ threads });
    }
    return await this.apiPromise;
  }

  private async getComposer(circuit?: Circuit) {
    const [name, subgroup] = circuit
      ? [circuit.name, (await this.computeCircuitSize(circuit.bytecode)).subgroup]
      : ['__LITE__', 0];

    if (!this.composerPromises[name]) {
      this.composerPromises[name] = this.createComposer(subgroup);
    }

    return { api: await this.getApi(), composer: await this.composerPromises[name] };
  }

  private async createComposer(subgroup: number) {
    const api = await this.getApi();
    const crs = await Crs.new(subgroup + 1);
    await api.commonInitSlabAllocator(subgroup);
    await api.srsInitSrs(new RawBuffer(crs.getG1Data()), crs.numPoints, new RawBuffer(crs.getG2Data()));
    return await api.acirNewAcirComposer(subgroup);
  }

  private async computeCircuitSize(bytecode: Buffer, honkRecursion = false) {
    const api = await this.getApi();
    const [exact, total, subgroup] = await api.acirGetCircuitSizes(bytecode, honkRecursion);
    return { exact, total, subgroup };
  }

  private async getThreads() {
    try {
      if (process.env.HARDWARE_CONCURRENCY) {
        return +process.env.HARDWARE_CONCURRENCY;
      } else if (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) {
        return navigator.hardwareConcurrency;
      } else {
        const os = await import('os');
        return os.cpus().length;
      }
    } catch {
      return 1;
    }
  }
}

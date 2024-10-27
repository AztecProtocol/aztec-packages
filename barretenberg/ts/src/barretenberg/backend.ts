async generateRecursiveProofArtifacts(
    proofData: ProofData,
    numOfPublicInputs: number = 0
  ): Promise<{ proofAsFields: string[]; vkAsFields: string[]; vkHash: string }> {
    await this.instantiate();
    const proof = reconstructUltraPlonkProof(proofData);
    const proofAsFields = (
      await this.api.acirSerializeProofIntoFields(this.acirComposer, proof, numOfPublicInputs)
    ).slice(numOfPublicInputs);

    await this.api.acirInitVerificationKey(this.acirComposer);
    const vk = await this.api.acirSerializeVerificationKeyIntoFields(this.acirComposer);

    return {
      proofAsFields: proofAsFields.map(p => p.toString()),
      vkAsFields: vk[0].map(vk => vk.toString()),
      vkHash: vk[1].toString(),
    };
  }
}

export class UltraHonkBackend extends AbstractBackend {
  constructor(acirBytecode: string, options: BackendOptions = { threads: 1 }) {
    super(acirToUint8Array(acirBytecode), options);
  }

  async instantiate(honkRecursion: boolean = true): Promise<void> {
    if (!this.api) {
      this.api = await Barretenberg.new(this.options);
      await this.api.acirInitSRS(this.acirUncompressedBytecode, honkRecursion);
    }
  }

  async generateRecursiveProofArtifacts(
    _proof: Uint8Array,
    _numOfPublicInputs: number
  ): Promise<{ proofAsFields: string[]; vkAsFields: string[]; vkHash: string }> {
    await this.instantiate();
    const vkBuf = await this.api.acirWriteVkUltraHonk(this.acirUncompressedBytecode);
    const vk = await this.api.acirVkAsFieldsUltraHonk(vkBuf);

    return {
      proofAsFields: [],
      vkAsFields: vk.map(vk => vk.toString()),
      vkHash: '',
    };
  }
}

// Utility functions
function acirToUint8Array(base64EncodedBytecode: string): Uint8Array {
  const compressedByteCode = base64Decode(base64EncodedBytecode);
  return gunzip(compressedByteCode);
}

function base64Decode(input: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(input, 'base64').buffer);
  } else if (typeof atob === 'function') {
    return Uint8Array.from(atob(input), c => c.charCodeAt(0));
  } else {
    throw new Error('No implementation found for base64 decoding.');
  }
}

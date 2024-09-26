// Buffers are prepended with their size. The size takes 4 bytes.
const serializedBufferSize = 4;
const fieldByteSize = 32;
const publicInputOffset = 3;
const publicInputsOffsetBytes = publicInputOffset * fieldByteSize;

export function splitHonkProof(proofWithPublicInputs: Uint8Array): { publicInputs: Uint8Array; proof: Uint8Array } {
  const proofAsStrings = deflattenFields(proofWithPublicInputs.slice(4));

  const numPublicInputs = Number(proofAsStrings[1]);

  // Account for the serialized buffer size at start
  const publicInputsOffset = publicInputsOffsetBytes + serializedBufferSize;
  // Get the part before and after the public inputs
  const proofStart = proofWithPublicInputs.slice(0, publicInputsOffset);
  const publicInputsSplitIndex = numPublicInputs * fieldByteSize;
  const proofEnd = proofWithPublicInputs.slice(publicInputsOffset + publicInputsSplitIndex);
  // Construct the proof without the public inputs
  const proof = new Uint8Array([...proofStart, ...proofEnd]);

  // Fetch the number of public inputs out of the proof string
  const publicInputs = proofWithPublicInputs.slice(publicInputsOffset, publicInputsOffset + publicInputsSplitIndex);

  return {
    proof,
    publicInputs,
  };
}

export function reconstructHonkProof(publicInputs: Uint8Array, proof: Uint8Array): Uint8Array {
  const proofStart = proof.slice(0, publicInputsOffsetBytes + serializedBufferSize);
  const proofEnd = proof.slice(publicInputsOffsetBytes + serializedBufferSize);

  // Concatenate publicInputs and proof
  const proofWithPublicInputs = Uint8Array.from([...proofStart, ...publicInputs, ...proofEnd]);

  return proofWithPublicInputs;
}

function deflattenFields(flattenedFields: Uint8Array): string[] {
  const publicInputSize = 32;
  const chunkedFlattenedPublicInputs: Uint8Array[] = [];

  for (let i = 0; i < flattenedFields.length; i += publicInputSize) {
    const publicInput = flattenedFields.slice(i, i + publicInputSize);
    chunkedFlattenedPublicInputs.push(publicInput);
  }

  return chunkedFlattenedPublicInputs.map(uint8ArrayToHex);
}

function uint8ArrayToHex(buffer: Uint8Array): string {
  const hex: string[] = [];

  buffer.forEach(function (i) {
    let h = i.toString(16);
    if (h.length % 2) {
      h = '0' + h;
    }
    hex.push(h);
  });

  return '0x' + hex.join('');
}

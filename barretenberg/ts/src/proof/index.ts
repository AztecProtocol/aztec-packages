/**
 * @description
 * The representation of a proof
 * */
export type ProofData = {
  /** @description Public inputs of a proof */
  publicInputs: string[];
  /** @description An byte array representing the proof */
  proof: Uint8Array;
};

/**
 * @description
 * The representation of a proof
 * */
export type ProofDataForRecursion = {
  /** @description Public inputs of a proof */
  publicInputs: string[];
  /** @description An byte array representing the proof */
  proof: string[];
};

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

export function reconstructUltraPlonkProof(proofData: ProofData): Uint8Array {
  // Flatten publicInputs
  const publicInputsConcatenated = flattenFieldsAsArray(proofData.publicInputs);

  // Concatenate publicInputs and proof
  const proofWithPublicInputs = Uint8Array.from([...publicInputsConcatenated, ...proofData.proof]);

  return proofWithPublicInputs;
}

export function deflattenFields(flattenedFields: Uint8Array): string[] {
  const publicInputSize = 32;
  const chunkedFlattenedPublicInputs: Uint8Array[] = [];

  for (let i = 0; i < flattenedFields.length; i += publicInputSize) {
    const publicInput = flattenedFields.slice(i, i + publicInputSize);
    chunkedFlattenedPublicInputs.push(publicInput);
  }

  return chunkedFlattenedPublicInputs.map(uint8ArrayToHex);
}

export function flattenFieldsAsArray(fields: string[]): Uint8Array {
  const flattenedPublicInputs = fields.map(hexToUint8Array);
  return flattenUint8Arrays(flattenedPublicInputs);
}

function flattenUint8Arrays(arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((acc, val) => acc + val.length, 0);
  const result = new Uint8Array(totalLength);

  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }

  return result;
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

function hexToUint8Array(hex: string): Uint8Array {
  const sanitisedHex = BigInt(hex).toString(16).padStart(64, '0');

  const len = sanitisedHex.length / 2;
  const u8 = new Uint8Array(len);

  let i = 0;
  let j = 0;
  while (i < len) {
    u8[i] = parseInt(sanitisedHex.slice(j, j + 2), 16);
    i += 1;
    j += 2;
  }

  return u8;
}

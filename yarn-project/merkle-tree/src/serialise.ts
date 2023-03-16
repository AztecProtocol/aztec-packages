/**
 * Concatenates buffers and prefixes them with the resulting length.
 * @param arr - An array of buffers to serialize to a vector.
 * @returns A vector containing the length of the array, followed by the concatenated buffers.
 */
export function serializeBufferArrayToVector(arr: Buffer[]): Buffer {
  const lengthBuf = Buffer.alloc(4);
  lengthBuf.writeUInt32BE(arr.length, 0);
  return Buffer.concat([lengthBuf, ...arr]);
}

/**
 * Extracts a buffer from a vector and returns the buffer and the amount of bytes advanced.
 * @param vector - A vector from which we extract the buffer.
 * @param offset - An offset from which to start extracting the buffer.
 * @returns Extracted buffer and the amount of bytes advanced.
 */
export function deserializeBufferFromVector(vector: Buffer, offset = 0) {
  const length = vector.readUInt32BE(offset);
  const adv = 4 + length;
  return { elem: vector.slice(offset + 4, offset + adv), adv };
}

/**
 * Deserializes elements from a vector using the provided deserialization function and returns the elements as array.
 * @param deserialize - A function used to deserialize the elements of the array.
 * @param vector - A vector from which to extract the elements.
 * @param offset - An offset from which to start extracting the elements.
 * @returns An array of elements and the amount of bytes advanced.
 */
export function deserializeArrayFromVector<T>(
  deserialize: (
    buf: Buffer,
    offset: number,
  ) => {
    /**
     * A deserialized element.
     */
    elem: T;
    /**
     * An amount of bytes advanced.
     */
    adv: number;
  },
  vector: Buffer,
  offset = 0,
) {
  let pos = offset;
  const size = vector.readUInt32BE(pos);
  pos += 4;
  const arr = new Array<T>(size);
  for (let i = 0; i < size; ++i) {
    const { elem, adv } = deserialize(vector, pos);
    pos += adv;
    arr[i] = elem;
  }
  return { elem: arr, adv: pos - offset };
}

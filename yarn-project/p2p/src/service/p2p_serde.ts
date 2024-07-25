import { numToUInt32BE } from "@aztec/foundation/serialize";

    // Serialize

  export function createMessageComponent(obj?: { toBuffer: () => Buffer }) {
    if (!obj) {
      // specify a length of 0 bytes
      return numToUInt32BE(0);
    }
    const buffer = obj.toBuffer();
    return Buffer.concat([numToUInt32BE(buffer.length), buffer]);
  };

  // eslint-disable-next-line jsdoc/require-jsdoc
  export function createMessageComponents(obj?: { toBuffer: () => Buffer }[]) {
    if (!obj || !obj.length) {
      // specify a length of 0 bytes
      return numToUInt32BE(0);
    }
    const allComponents = Buffer.concat(obj.map(createMessageComponent));
    return Buffer.concat([numToUInt32BE(obj.length), allComponents]);
  };

  // Deserialize

  // eslint-disable-next-line jsdoc/require-jsdoc
  export function toObject<T>(objectBuffer: Buffer, factory: { fromBuffer: (b: Buffer) => T }) {
    const objectSize = objectBuffer.readUint32BE(0);

    return {
      remainingData: objectBuffer.subarray(objectSize + 4),
      obj: objectSize === 0 ? undefined : factory.fromBuffer(objectBuffer.subarray(4, objectSize + 4)),
    };
  };

  // eslint-disable-next-line jsdoc/require-jsdoc
  export function toObjectArray<T>(objectBuffer: Buffer, factory: { fromBuffer: (b: Buffer) => T }) {
    const output: T[] = [];
    const numItems = objectBuffer.readUint32BE(0);
    let workingBuffer = objectBuffer.subarray(4);
    for (let i = 0; i < numItems; i++) {
      const obj = toObject<T>(workingBuffer, factory);
      workingBuffer = obj.remainingData;
      if (obj !== undefined) {
        output.push(obj.obj!);
      }
    }
    return {
      remainingData: workingBuffer,
      objects: output,
    };
  };
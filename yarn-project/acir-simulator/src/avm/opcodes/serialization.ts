export enum OperandType {
  UINT8,
  UINT16,
  UINT32,
  UINT64,
  UINT128,
  FIELD,
}

export type OperandPair = [(c: any) => any, OperandType];

function readBigUint128BE(this: Buffer): bigint {
  const totalBytes = 16;
  let ret: bigint = 0n;
  for (let i = 0; i < totalBytes; ++i) {
    ret <<= 8n;
    ret |= BigInt(this.readUint8(i));
  }
  return ret;
}

function writeBigUint128BE(this: Buffer, value: bigint): void {
  const totalBytes = 16;
  for (let offset = totalBytes - 1; offset >= 0; --offset) {
    this.writeUint8(Number(value & 0xffn), offset);
    value >>= 8n;
  }
}

const operandSpec: Map<OperandType, [number, () => any, (value: any) => any]> = new Map([
  [OperandType.UINT8, [1, Buffer.prototype.readUint8, Buffer.prototype.writeUint8]],
  [OperandType.UINT16, [2, Buffer.prototype.readUint16BE, Buffer.prototype.writeUint16BE]],
  [OperandType.UINT32, [4, Buffer.prototype.readUint32BE, Buffer.prototype.writeUint32BE]],
  [OperandType.UINT64, [8, Buffer.prototype.readBigUInt64BE, Buffer.prototype.writeBigUint64BE]],
  [OperandType.UINT128, [16, readBigUint128BE, writeBigUint128BE]],
]);

export function deserialize(buf: Buffer, operands: OperandPair[]): any[] {
  const argValues = [];

  for (const op of operands) {
    const [_opGetter, opType] = op;
    const [sizeBytes, reader, _writer] = operandSpec.get(opType)!;
    argValues.push(reader.call(buf));
    buf = buf.subarray(sizeBytes);
  }

  return argValues;
}

export function serialize(operands: OperandPair[], cls: any): Buffer {
  const chunks: Buffer[] = [];

  for (const op of operands) {
    const [opGetter, opType] = op;
    const [sizeBytes, _reader, writer] = operandSpec.get(opType)!;
    const buf = Buffer.alloc(sizeBytes);
    writer.call(buf, opGetter(cls));
    chunks.push(buf);
  }

  return Buffer.concat(chunks);
}

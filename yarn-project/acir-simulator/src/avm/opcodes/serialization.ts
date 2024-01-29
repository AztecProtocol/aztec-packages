export enum OperandType {
  UINT8,
  UINT16,
  UINT32,
  UINT64,
  UINT128,
  FIELD,
}

export type OperandPair = [(c: any) => any, OperandType];

function readBigUintBE(buf: Buffer, totalBytes: number): bigint {
  let ret: bigint = 0n;
  for (let i = 0; i < totalBytes; ++i) {
    ret |= BigInt(buf.readUint8());
    ret <<= 1n;
  }
  return ret;
}

function writeBigUintBE(buf: Buffer, value: bigint, totalBytes: number): void {
  for (let i = totalBytes - 1; i >= 0; --i) {
    buf.writeUint8(Number(value & 0xFFn));
    value >>= 1n;
  }
}

const operandSpec: Map<OperandType, [number, () => any, (value: any) => any]> = new Map([
  [OperandType.UINT8, [1, Buffer.prototype.readUint8, Buffer.prototype.writeUint8]],
  [OperandType.UINT16, [2, Buffer.prototype.readUint16BE, Buffer.prototype.writeUint16BE]],
  [OperandType.UINT32, [4, Buffer.prototype.readUint32BE, Buffer.prototype.writeUint32BE]],
  [OperandType.UINT64, [8, Buffer.prototype.readBigUInt64BE, Buffer.prototype.writeBigUint64BE]],
  [OperandType.UINT128, [16, readBigUintBE.bind(16), writeBigUintBE.bind(16)]], // FIXME: binds first not last argument
  [OperandType.FIELD, [32, readBigUintBE.bind(32), writeBigUintBE.bind(32)]], // FIXME: binds first not last argument
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
  const chunks: Buffer[] = []

  for (const op of operands) {
    const [opGetter, opType] = op;
    const [sizeBytes, _reader, writer] = operandSpec.get(opType)!;
    const buf = Buffer.alloc(sizeBytes);
    writer.call(buf, opGetter(cls));
    chunks.push(buf);
  }

  return Buffer.concat(chunks);
}
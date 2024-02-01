import { strict as assert } from 'assert';

import { BufferCursor } from './buffer_cursor.js';

/**
 * All AVM opcodes. (Keep in sync with cpp counterpart code AvmMini_opcode.hpp).
 * Source: https://yp-aztec.netlify.app/docs/public-vm/instruction-set
 */
export enum Opcode {
  ADD,
  SUB,
  MUL,
  DIV,
  EQ,
  LT,
  LTE,
  AND,
  OR,
  XOR,
  NOT,
  SHL,
  SHR,
  CAST,
  ADDRESS,
  STORAGEADDRESS,
  ORIGIN,
  SENDER,
  PORTAL,
  FEEPERL1GAS,
  FEEPERL2GAS,
  FEEPERDAGAS,
  CONTRACTCALLDEPTH,
  CHAINID,
  VERSION,
  BLOCKNUMBER,
  TIMESTAMP,
  COINBASE,
  BLOCKL1GASLIMIT,
  BLOCKL2GASLIMIT,
  BLOCKDAGASLIMIT,
  CALLDATACOPY,
  L1GASLEFT,
  L2GASLEFT,
  DAGASLEFT,
  JUMP,
  JUMPI,
  INTERNALCALL,
  INTERNALRETURN,
  SET,
  MOV,
  CMOV,
  BLOCKHEADERBYNUMBER,
  SLOAD, // Public Storage
  SSTORE, // Public Storage
  READL1TOL2MSG, // Messages
  SENDL2TOL1MSG, // Messages
  EMITNOTEHASH, // Notes & Nullifiers
  EMITNULLIFIER, // Notes & Nullifiers
  EMITUNENCRYPTEDLOG,
  CALL,
  STATICCALL,
  RETURN,
  REVERT,
  KECCAK,
  POSEIDON,
  // Add new opcodes before this
  TOTAL_OPCODES_NUMBER,
}

export enum OperandType {
  UINT8,
  UINT16,
  UINT32,
  UINT64,
  UINT128,
}

function readBigInt128BE(this: Buffer): bigint {
  const totalBytes = 16;
  let ret: bigint = 0n;
  for (let i = 0; i < totalBytes; ++i) {
    ret <<= 8n;
    ret |= BigInt(this.readUint8(i));
  }
  return ret;
}

function writeBigInt128BE(this: Buffer, value: bigint): void {
  const totalBytes = 16;
  for (let offset = totalBytes - 1; offset >= 0; --offset) {
    this.writeUint8(Number(value & 0xffn), offset);
    value >>= 8n;
  }
}

const OPERAND_SPEC = new Map<OperandType, [number, () => any, (value: any) => any]>([
  [OperandType.UINT8, [1, Buffer.prototype.readUint8, Buffer.prototype.writeUint8]],
  [OperandType.UINT16, [2, Buffer.prototype.readUint16BE, Buffer.prototype.writeUint16BE]],
  [OperandType.UINT32, [4, Buffer.prototype.readUint32BE, Buffer.prototype.writeUint32BE]],
  [OperandType.UINT64, [8, Buffer.prototype.readBigInt64BE, Buffer.prototype.writeBigInt64BE]],
  [OperandType.UINT128, [16, readBigInt128BE, writeBigInt128BE]],
]);

export function deserialize(cursor: BufferCursor | Buffer, operands: OperandType[]): any[] {
  const argValues = [];
  if (cursor instanceof Buffer) {
    cursor = new BufferCursor(cursor);
  }

  for (const op of operands) {
    const opType = op;
    const [sizeBytes, reader, _writer] = OPERAND_SPEC.get(opType)!;
    argValues.push(reader.call(cursor.bufferAtPosition()));
    cursor.advance(sizeBytes);
  }

  return argValues;
}

export function serialize(operands: OperandType[], cls: any): Buffer {
  const chunks: Buffer[] = [];

  // TODO: infer opcode not in this loop
  const classValues = [cls.constructor.opcode, ...Object.values(cls)];
  assert(
    classValues.length === operands.length,
    `Got ${classValues.length} values but only ${operands.length} serialization operands are specified!`,
  );
  for (let i = 0; i < operands.length; i++) {
    const opType = operands[i];
    const [sizeBytes, _reader, writer] = OPERAND_SPEC.get(opType)!;
    const buf = Buffer.alloc(sizeBytes);
    writer.call(buf, classValues[i]);
    chunks.push(buf);
  }

  return Buffer.concat(chunks);
}

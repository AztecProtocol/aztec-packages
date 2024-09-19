import { Opcode } from './serialization/instruction_serialization.js';

const AVM_MAGIC_SUFFIX = Buffer.from([
  Opcode.MOV_16, // opcode
  0x00, // indirect
  ...Buffer.from('18ca', 'hex'), // srcOffset
  ...Buffer.from('18ca', 'hex'), // dstOffset
]);

export function markBytecodeAsAvm(bytecode: Buffer): Buffer {
  return Buffer.concat([bytecode, AVM_MAGIC_SUFFIX]);
}

export function isAvmBytecode(bytecode: Buffer): boolean {
  const magicSize = AVM_MAGIC_SUFFIX.length;
  return bytecode.subarray(-magicSize).equals(AVM_MAGIC_SUFFIX);
}

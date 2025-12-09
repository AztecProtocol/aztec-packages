export { TypeTag } from '../avm_memory_types.js';
export { Opcode } from '../serialization/instruction_serialization.js';
export {
  ARITHMETIC_TYPE_VARIANTS,
  BITWISE_TYPE_VARIANTS,
  SPAM_CONFIGS,
  createMaxSizeLogConfig,
  createMaxSizeLogNestedBytecode,
  createNestedSpamBytecode,
  createNestedSpamBytecodeFromConfig,
  createSpamBytecode,
  createSpamBytecodeFromConfig,
  expandTypeVariants,
  getSpammableOpcodes,
  getSideEffectLimit,
  isSideEffectLimited,
  isSpammable,
  type MemSetup,
  type NestedSpamBytecodeResult,
  type SpamBytecodeResult,
  type SpamConfig,
  type TypeVariant,
} from './opcode_spammer.js';

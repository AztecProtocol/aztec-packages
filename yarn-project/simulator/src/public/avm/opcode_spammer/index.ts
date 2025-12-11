export { TypeTag } from '../avm_memory_types.js';
export { Opcode } from '../serialization/instruction_serialization.js';
export {
  SPAM_CONFIGS,
  createNestedSpamBytecodeFromConfig,
  createSpamBytecodeFromConfig,
  getAllSpamTestCases,
  type MemSetup,
  type NestedSpamBytecode,
  type OpcodeTestGroup,
  type SpamBytecodeResult,
  type SpamConfig,
  type SpamTestCase,
} from './opcode_spammer.js';

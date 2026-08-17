export {
  ORACLE_REGISTRY,
  makeEntry,
  type NamedValue,
  type OracleRegistryEntry,
  type ParamTypes,
} from './oracle/oracle_registry.js';
export {
  ALIAS,
  ARRAY,
  AZTEC_ADDRESS,
  BIGINT,
  BLOCK_HASH,
  BLOCK_HEADER,
  BLOCK_NUMBER,
  BOOL,
  BOUNDED_VEC,
  U8,
  CONTRACT_INSTANCE,
  DELIVERY_MODE,
  EPHEMERAL_ARRAY,
  ETH_ADDRESS,
  EVENT_VALIDATION_REQUEST,
  FIELD,
  FIXED_ARRAY,
  FIXED_BOUNDED_VEC,
  FUNCTION_SELECTOR,
  GAS_FEES,
  LEAF,
  LEAF_INDEX,
  LOG_RETRIEVAL_REQUEST,
  LOG_RETRIEVAL_RESPONSE,
  MEMBERSHIP_WITNESS,
  NOTE_SELECTOR,
  NOTE_VALIDATION_REQUEST,
  OPTION,
  PENDING_TAGGED_LOG,
  POINT,
  PROVIDED_SECRET,
  PUBLIC_KEYS,
  SCALAR,
  SLOT_NUMBER,
  STR,
  STRUCT,
  TX_HASH,
  U32,
  U64,
  U128,
  VECTOR,
  tryFieldWidth,
  isArrayMapping,
  isBoundedVecMapping,
  isEphemeralArrayMapping,
  isFixedArrayMapping,
  isFixedBoundedVecMapping,
  isOptionMapping,
  isStructMapping,
  isVectorMapping,
  type ArrayMapping,
  type BoundedVecMapping,
  type CompositeMapping,
  type EphemeralArrayMapping,
  type FixedArrayMapping,
  type FixedBoundedVecMapping,
  type InputSlot,
  type MaybePromise,
  type OptionMapping,
  type OutputSlot,
  type SlotShape,
  type StructField,
  type StructMapping,
  type TypeMapping,
  type VectorMapping,
} from './oracle/oracle_type_mappings.js';
export { ExecutionNoteCache } from './execution_note_cache.js';
export { ExecutionTaggingIndexCache } from './execution_tagging_index_cache.js';
export { HashedValuesCache } from './hashed_values_cache.js';
export { pickNotes } from './pick_notes.js';
export type { IMiscOracle, IUtilityExecutionOracle, IPrivateExecutionOracle } from './oracle/interfaces.js';
export type { FactCollection } from './noir-structs/fact_collection.js';
export type { NoteData } from './noir-structs/note_data.js';
export type { ResolvedTaggingStrategy } from './noir-structs/resolved_tagging_strategy.js';
export { TxResolverService } from '../messages/tx_resolver_service.js';
export { UtilityExecutionOracle } from './oracle/utility_execution_oracle.js';
export { PrivateExecutionOracle } from './oracle/private_execution_oracle.js';
export { buildACIRCallback, UnavailableOracleError } from './oracle/acir_callback.js';
export { LEGACY_ORACLE_REGISTRY } from './oracle/legacy_oracle_registry.js';
export { executePrivateFunction, extractPrivateCircuitPublicInputs } from './oracle/private_execution.js';
export { generateSimulatedProvingResult } from './contract_function_simulator.js';
export { packAsHintedNote } from './oracle/note_packing_utils.js';
export { BoundedVec } from './noir-structs/bounded_vec.js';
export type { ContractClassLogData } from './noir-structs/contract_class_log_data.js';
export type { EmbeddedCurvePoint } from './noir-structs/embedded_curve_point.js';
export { EphemeralArray } from './noir-structs/ephemeral_array.js';
export { Option } from './noir-structs/option.js';
export type { UtilityContext } from './noir-structs/utility_context.js';
export { EventValidationRequest } from './noir-structs/event_validation_request.js';
export type { LogRetrievalRequest } from './noir-structs/log_retrieval_request.js';
export type { LogRetrievalResponse } from './noir-structs/log_retrieval_response.js';
export { NoteValidationRequest } from './noir-structs/note_validation_request.js';
export type { PendingTaggedLog } from './noir-structs/pending_tagged_log.js';
export type { TxEffectData } from './noir-structs/tx_effect_data.js';
export type { ProvidedSecret } from './noir-structs/provided_secret.js';
export type { ResolvedTx } from './noir-structs/resolved_tx.js';
export type { NullifierMembershipWitnessData } from './noir-structs/nullifier_membership_witness_data.js';
export type { PublicDataWitnessData } from './noir-structs/public_data_witness_data.js';
export { TransientArrayService } from './transient_array_service.js';

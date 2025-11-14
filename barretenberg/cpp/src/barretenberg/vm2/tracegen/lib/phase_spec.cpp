#include "barretenberg/vm2/tracegen/lib/phase_spec.hpp"
#include "barretenberg/vm2/common/aztec_constants.hpp"

#include <array>
#include <cstdint>
#include <unordered_map>
#include <vector>

namespace bb::avm2::tracegen {

// Each value of the map is a TxPhaseSpec struct that contains static attributes for the given transaction phase.
// For readability, we only include the fields that are non-zero for the given phase. The default values are 0
// as per the TxPhaseSpec struct definition, so that each struct is fully initialized.
const std::unordered_map<TransactionPhase, TxPhaseSpec> TX_PHASE_SPEC_MAP = { {
    { TransactionPhase::NR_NULLIFIER_INSERTION,
      {
          .phase_value = static_cast<uint8_t>(TransactionPhase::NR_NULLIFIER_INSERTION),
          .read_pi_start_offset = AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_NULLIFIERS_ROW_IDX,
          .read_pi_length_offset =
              AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_NULLIFIERS_ROW_IDX,
          .non_revertible_append_nullifier = 1,
          .can_emit_nullifier = 1,
      } },
    { TransactionPhase::NR_NOTE_INSERTION,
      {
          .phase_value = static_cast<uint8_t>(TransactionPhase::NR_NOTE_INSERTION),
          .read_pi_start_offset = AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_NOTE_HASHES_ROW_IDX,
          .read_pi_length_offset =
              AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_NOTE_HASHES_ROW_IDX,
          .non_revertible_append_note_hash = 1,
          .can_emit_note_hash = 1,
      } },
    { TransactionPhase::NR_L2_TO_L1_MESSAGE,
      {
          .phase_value = static_cast<uint8_t>(TransactionPhase::NR_L2_TO_L1_MESSAGE),
          .read_pi_start_offset = AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX,
          .read_pi_length_offset =
              AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_L2_TO_L1_MSGS_ROW_IDX,
          .non_revertible_append_l2_l1_msg = 1,
          .can_emit_l2_l1_msg = 1,
      } },
    { TransactionPhase::SETUP,
      {
          .phase_value = static_cast<uint8_t>(TransactionPhase::SETUP),
          .is_public_call_request = 1,
          .read_pi_start_offset = AVM_PUBLIC_INPUTS_PUBLIC_SETUP_CALL_REQUESTS_ROW_IDX,
          .read_pi_length_offset = AVM_PUBLIC_INPUTS_PUBLIC_CALL_REQUEST_ARRAY_LENGTHS_SETUP_CALLS_ROW_IDX,
          .can_emit_note_hash = 1,
          .can_emit_nullifier = 1,
          .can_write_public_data = 1,
          .can_emit_unencrypted_log = 1,
          .can_emit_l2_l1_msg = 1,
      } },
    { TransactionPhase::R_NULLIFIER_INSERTION,
      {
          .phase_value = static_cast<uint8_t>(TransactionPhase::R_NULLIFIER_INSERTION),
          .is_revertible = 1,
          .read_pi_start_offset = AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_NULLIFIERS_ROW_IDX,
          .read_pi_length_offset =
              AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_NULLIFIERS_ROW_IDX,
          .revertible_append_nullifier = 1,
          .can_emit_nullifier = 1,
          .next_phase_on_revert = static_cast<uint8_t>(TransactionPhase::TEARDOWN),
      } },
    { TransactionPhase::R_NOTE_INSERTION,
      {
          .phase_value = static_cast<uint8_t>(TransactionPhase::R_NOTE_INSERTION),
          .is_revertible = 1,
          .read_pi_start_offset = AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_NOTE_HASHES_ROW_IDX,
          .read_pi_length_offset =
              AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_NOTE_HASHES_ROW_IDX,
          .revertible_append_note_hash = 1,
          .can_emit_note_hash = 1,
          .next_phase_on_revert = static_cast<uint8_t>(TransactionPhase::TEARDOWN),
      } },
    { TransactionPhase::R_L2_TO_L1_MESSAGE,
      {
          .phase_value = static_cast<uint8_t>(TransactionPhase::R_L2_TO_L1_MESSAGE),
          .is_revertible = 1,
          .read_pi_start_offset = AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX,
          .read_pi_length_offset =
              AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_L2_TO_L1_MSGS_ROW_IDX,
          .revertible_append_l2_l1_msg = 1,
          .can_emit_l2_l1_msg = 1,
          .next_phase_on_revert = static_cast<uint8_t>(TransactionPhase::TEARDOWN),
      } },
    { TransactionPhase::APP_LOGIC,
      {
          .phase_value = static_cast<uint8_t>(TransactionPhase::APP_LOGIC),
          .is_public_call_request = 1,
          .is_revertible = 1,
          .read_pi_start_offset = AVM_PUBLIC_INPUTS_PUBLIC_APP_LOGIC_CALL_REQUESTS_ROW_IDX,
          .read_pi_length_offset = AVM_PUBLIC_INPUTS_PUBLIC_CALL_REQUEST_ARRAY_LENGTHS_APP_LOGIC_CALLS_ROW_IDX,
          .can_emit_note_hash = 1,
          .can_emit_nullifier = 1,
          .can_write_public_data = 1,
          .can_emit_unencrypted_log = 1,
          .can_emit_l2_l1_msg = 1,
          .next_phase_on_revert = static_cast<uint8_t>(TransactionPhase::TEARDOWN),
      } },
    { TransactionPhase::TEARDOWN,
      {
          .phase_value = static_cast<uint8_t>(TransactionPhase::TEARDOWN),
          .is_public_call_request = 1,
          .is_teardown = 1,
          .is_revertible = 1,
          .read_pi_start_offset = AVM_PUBLIC_INPUTS_PUBLIC_TEARDOWN_CALL_REQUEST_ROW_IDX,
          .read_pi_length_offset = AVM_PUBLIC_INPUTS_PUBLIC_CALL_REQUEST_ARRAY_LENGTHS_TEARDOWN_CALL_ROW_IDX,
          .can_emit_note_hash = 1,
          .can_emit_nullifier = 1,
          .can_write_public_data = 1,
          .can_emit_unencrypted_log = 1,
          .can_emit_l2_l1_msg = 1,
          .next_phase_on_revert = static_cast<uint8_t>(TransactionPhase::COLLECT_GAS_FEES),
      } },
    { TransactionPhase::COLLECT_GAS_FEES,
      {
          .phase_value = static_cast<uint8_t>(TransactionPhase::COLLECT_GAS_FEES),
          .is_collect_fee = 1,
          .read_pi_start_offset = AVM_PUBLIC_INPUTS_EFFECTIVE_GAS_FEES_ROW_IDX,
          .can_write_public_data = 1,
      } },
    { TransactionPhase::TREE_PADDING,
      {
          .phase_value = static_cast<uint8_t>(TransactionPhase::TREE_PADDING),
          .is_tree_padding = 1,
          .can_emit_note_hash = 1,
          .can_emit_nullifier = 1,
      } },
    { TransactionPhase::CLEANUP,
      {
          .phase_value = static_cast<uint8_t>(TransactionPhase::CLEANUP),
          .is_cleanup = 1,
      } },
} };

} // namespace bb::avm2::tracegen

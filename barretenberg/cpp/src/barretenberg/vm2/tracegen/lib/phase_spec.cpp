#include "barretenberg/vm2/tracegen/lib/phase_spec.hpp"
#include "barretenberg/vm2/common/aztec_constants.hpp"

#include <array>
#include <cstdint>
#include <unordered_map>
#include <vector>

namespace bb::avm2::tracegen {
namespace {

const std::unordered_map<TransactionPhase, TxPhaseOffsetsTable::Offsets> PHASE_PUB_INPUTS_OFFSETS = { {
    { TransactionPhase::SETUP,
      {
          .read_pi_offset = AVM_PUBLIC_INPUTS_PUBLIC_SETUP_CALL_REQUESTS_ROW_IDX,
          .write_pi_offset = 0, // No write offset for public call request
          .read_pi_length_offset = AVM_PUBLIC_INPUTS_PUBLIC_CALL_REQUEST_ARRAY_LENGTHS_SETUP_CALLS_ROW_IDX,
      } },
    { TransactionPhase::APP_LOGIC,
      {
          .read_pi_offset = AVM_PUBLIC_INPUTS_PUBLIC_APP_LOGIC_CALL_REQUESTS_ROW_IDX,
          .write_pi_offset = 0, // No write offset for public call request
          .read_pi_length_offset = AVM_PUBLIC_INPUTS_PUBLIC_CALL_REQUEST_ARRAY_LENGTHS_APP_LOGIC_CALLS_ROW_IDX,
      } },
    { TransactionPhase::TEARDOWN,
      {
          .read_pi_offset = AVM_PUBLIC_INPUTS_PUBLIC_TEARDOWN_CALL_REQUEST_ROW_IDX,
          .write_pi_offset = 0, // No write offset for public call request
          .read_pi_length_offset = AVM_PUBLIC_INPUTS_PUBLIC_CALL_REQUEST_ARRAY_LENGTHS_TEARDOWN_CALL_ROW_IDX,
      } },
    { TransactionPhase::NR_NOTE_INSERTION,
      {
          .read_pi_offset = AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_NOTE_HASHES_ROW_IDX,
          .write_pi_offset = AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_NOTE_HASHES_ROW_IDX,
          .read_pi_length_offset =
              AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_NOTE_HASHES_ROW_IDX,
      } },
    { TransactionPhase::NR_NULLIFIER_INSERTION,
      {
          .read_pi_offset = AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_NULLIFIERS_ROW_IDX,
          .write_pi_offset = AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_NULLIFIERS_ROW_IDX,
          .read_pi_length_offset =
              AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_NULLIFIERS_ROW_IDX,
      } },
    { TransactionPhase::R_NOTE_INSERTION,
      {
          .read_pi_offset = AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_NOTE_HASHES_ROW_IDX,
          .write_pi_offset = AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_NOTE_HASHES_ROW_IDX,
          .read_pi_length_offset =
              AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_NOTE_HASHES_ROW_IDX,
      } },
    { TransactionPhase::R_NULLIFIER_INSERTION,
      {
          .read_pi_offset = AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_NULLIFIERS_ROW_IDX,
          .write_pi_offset = AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_NULLIFIERS_ROW_IDX,
          .read_pi_length_offset =
              AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_NULLIFIERS_ROW_IDX,
      } },
    { TransactionPhase::NR_L2_TO_L1_MESSAGE,
      {
          .read_pi_offset = AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX,
          .write_pi_offset = AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX,
          .read_pi_length_offset =
              AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_L2_TO_L1_MSGS_ROW_IDX,
      } },
    { TransactionPhase::R_L2_TO_L1_MESSAGE,
      {
          .read_pi_offset = AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX,
          .write_pi_offset = AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_L2_TO_L1_MSGS_ROW_IDX,
          .read_pi_length_offset =
              AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_L2_TO_L1_MSGS_ROW_IDX,
      } },

    { TransactionPhase::COLLECT_GAS_FEES,
      {
          .read_pi_offset = AVM_PUBLIC_INPUTS_EFFECTIVE_GAS_FEES_ROW_IDX,
          .write_pi_offset = AVM_PUBLIC_INPUTS_TRANSACTION_FEE_ROW_IDX,
          .read_pi_length_offset = 0,
      } },
} };

} // namespace

const TxPhaseOffsetsTable::Offsets& TxPhaseOffsetsTable::get_offsets(TransactionPhase phase)
{
    assert(PHASE_PUB_INPUTS_OFFSETS.contains(phase));
    return PHASE_PUB_INPUTS_OFFSETS.at(phase);
}

} // namespace bb::avm2::tracegen

#include "barretenberg/vm2/tracegen/lib/phase_spec.hpp"
#include "barretenberg/vm2/common/aztec_constants.hpp"

#include <array>
#include <cstdint>
#include <unordered_map>
#include <vector>

namespace bb::avm2::tracegen {

namespace {
// TODO: check back after public inputs are done
const std::unordered_map<TransactionPhase, TxPhaseOffsetsTable::Offsets> PHASE_PUB_INPUTS_OFFSETS = { {
    { TransactionPhase::SETUP,
      {
          AVM_PUBLIC_INPUTS_PUBLIC_SETUP_CALL_REQUESTS_ROW_IDX,
          0,
          0,
      } },
    { TransactionPhase::APP_LOGIC,
      {
          AVM_PUBLIC_INPUTS_PUBLIC_APP_LOGIC_CALL_REQUESTS_ROW_IDX,
          0,
          0,
      } },
    { TransactionPhase::TEARDOWN,
      {
          AVM_PUBLIC_INPUTS_PUBLIC_TEARDOWN_CALL_REQUEST_ROW_IDX,
          0,
          0,
      } },
    { TransactionPhase::NR_NOTE_INSERTION,
      {
          AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_NOTE_HASHES_ROW_IDX,
          AVM_PUBLIC_INPUTS_END_ACCUMULATED_DATA_NOTE_HASHES_ROW_IDX,
          AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_ROW_IDX,
      } },
    { TransactionPhase::NR_NULLIFIER_INSERTION,
      {
          AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_NULLIFIERS_ROW_IDX,
          AVM_PUBLIC_INPUTS_END_ACCUMULATED_DATA_NULLIFIERS_ROW_IDX,
          AVM_PUBLIC_INPUTS_PREVIOUS_NON_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_ROW_IDX,
      } },
    { TransactionPhase::R_NOTE_INSERTION,
      {
          AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_NOTE_HASHES_ROW_IDX,
          AVM_PUBLIC_INPUTS_END_ACCUMULATED_DATA_NOTE_HASHES_ROW_IDX,
          AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_ROW_IDX,
      } },
    { TransactionPhase::R_NULLIFIER_INSERTION,
      {
          AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_NULLIFIERS_ROW_IDX,
          AVM_PUBLIC_INPUTS_END_ACCUMULATED_DATA_NULLIFIERS_ROW_IDX,
          AVM_PUBLIC_INPUTS_PREVIOUS_REVERTIBLE_ACCUMULATED_DATA_ARRAY_LENGTHS_ROW_IDX,
      } },

} };
} // namespace

const TxPhaseOffsetsTable::Offsets& TxPhaseOffsetsTable::get_offsets(TransactionPhase phase) const
{
    return PHASE_PUB_INPUTS_OFFSETS.at(phase);
}

const TxPhaseOffsetsTable& TxPhaseOffsetsTable::get()
{
    static const TxPhaseOffsetsTable table;
    return table;
}

} // namespace bb::avm2::tracegen

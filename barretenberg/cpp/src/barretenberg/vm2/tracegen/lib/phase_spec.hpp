#pragma once

#include <cstdint>

#include "barretenberg/vm2/common/aztec_types.hpp"

namespace bb::avm2::tracegen {

// TxPhaseSpec contains the fields that are read from the precomputed table
// via the #[READ_PHASE_SPEC] lookup in tx.pil.
struct TxPhaseSpec {
    uint8_t phase_value = 0;
    uint8_t is_public_call_request = 0;
    uint8_t is_teardown = 0;
    uint8_t is_collect_fee = 0;
    uint8_t is_tree_padding = 0;
    uint8_t is_cleanup = 0;
    uint8_t is_revertible = 0;
    uint32_t read_pi_start_offset = 0;
    uint32_t read_pi_length_offset = 0;
    uint8_t non_revertible_append_note_hash = 0;
    uint8_t non_revertible_append_nullifier = 0;
    uint8_t non_revertible_append_l2_l1_msg = 0;
    uint8_t revertible_append_note_hash = 0;
    uint8_t revertible_append_nullifier = 0;
    uint8_t revertible_append_l2_l1_msg = 0;
    uint8_t can_emit_note_hash = 0;
    uint8_t can_emit_nullifier = 0;
    uint8_t can_write_public_data = 0;
    uint8_t can_emit_unencrypted_log = 0;
    uint8_t can_emit_l2_l1_msg = 0;
    uint8_t next_phase_on_revert = 0;
};

// Lazy-initialized function to avoid expensive startup initialization
const std::unordered_map<TransactionPhase, TxPhaseSpec>& get_tx_phase_spec_map();

} // namespace bb::avm2::tracegen

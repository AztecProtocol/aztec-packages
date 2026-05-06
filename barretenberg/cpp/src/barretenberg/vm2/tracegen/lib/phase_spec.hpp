#pragma once

#include <cstdint>

#include "barretenberg/vm2/common/aztec_types.hpp"

namespace bb::avm2::tracegen {

// TxPhaseSpec contains the fields that are read from the precomputed table
// via the #[READ_PHASE_SPEC] lookup in tx.pil.
struct TxPhaseSpec {
    bool is_public_call_request = false;
    bool is_teardown = false;
    bool is_collect_fee = false;
    bool is_tree_padding = false;
    bool is_cleanup = false;
    bool is_revertible = false;
    uint32_t read_pi_start_offset = 0;
    uint32_t read_pi_length_offset = 0;
    bool append_note_hash = false;
    bool append_nullifier = false;
    bool append_l2_l1_msg = false;
    uint8_t next_phase_on_revert = 0;
};

// Lazy-initialized function to avoid expensive startup initialization
const std::unordered_map<TransactionPhase, TxPhaseSpec>& get_tx_phase_spec_map();

} // namespace bb::avm2::tracegen

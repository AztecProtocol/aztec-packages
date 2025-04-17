// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include <cstdint>
#include <vector>

namespace bb::plonk {

struct commitment_open_proof {
    std::vector<uint8_t> proof_data;
};

} // namespace bb::plonk

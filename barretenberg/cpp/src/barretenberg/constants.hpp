#pragma once
#include <cstdint>

namespace bb {
// The log of the max circuit size assumed in order to achieve constant sized Honk proofs
// TODO(https://github.com/AztecProtocol/barretenberg/issues/1046): Remove the need for const sized proofs
static constexpr uint32_t CONST_PROOF_SIZE_LOG_N = 28;
static constexpr uint32_t CONST_OINK_PROOF_SIZE = 100; // WORKTODO (in FF)
} // namespace bb
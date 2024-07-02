#pragma once
#include <cstdint>

namespace bb {
// The log of the max circuit size assumed in order to achieve constant sized Honk proofs
// LONDONTODO(CONSTANT SIEZ): This shoudl go away. In the short term, will this be a problem for the AVM?
static constexpr uint32_t CONST_PROOF_SIZE_LOG_N = 28;
} // namespace bb
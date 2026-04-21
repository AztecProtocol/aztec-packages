// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/constants.hpp"
#include "barretenberg/honk/execution_trace/mega_execution_trace.hpp"

namespace bb {

// Number of leading zeros prepended to L, R (and M in PREPEND mode) so that merge polynomial
// commitments match the circuit's ecc_op_wire commitments, whose data starts at the first block
// (row TRACE_OFFSET + NUM_ZERO_ROWS) of the Mega execution trace.
static constexpr size_t MERGE_FULL_SHIFT = MegaExecutionTraceBlocks::TRACE_OFFSET + NUM_ZERO_ROWS;

// Shift applied to M in APPEND mode (final merge). The merged commitment [M] is shared (copy-constrained)
// with the Translator's op queue wire commitments, which require RANDOMNESS_START = 2 leading zeros for
// polynomial shiftability. Equality with TranslatorFlavor::RANDOMNESS_START is static_asserted in
// merge_prover.cpp (kept out of this header to avoid pulling in translator_flavor.hpp).
static constexpr size_t MERGE_APPEND_OUTPUT_SHIFT = 2;

} // namespace bb

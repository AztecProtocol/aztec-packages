// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Luke, Raju], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/common/ref_vector.hpp"
#include "barretenberg/constants.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/honk/execution_trace/execution_trace_block.hpp"
#include "barretenberg/honk/execution_trace/ultra_execution_trace.hpp"
#include <cstdint>

namespace bb {

/**
 * @brief Mega execution trace wrapper: adds the offset/size bookkeeping used by the prover to a
 * codegen-emitted block list.
 *
 * @tparam BlockData A generated `<Flavor>TraceBlockData` listing the blocks of one Mega
 * arithmetization and the `GateKind`s each owns. A reduced arithmetization omits the blocks whose
 * gates its flavor does not constrain, which is what makes a gate the flavor cannot constrain
 * impossible to create: there is no block to append it to. The concrete trace types are emitted
 * alongside their block data (see `generated/<flavor>_execution_trace_generated.hpp`).
 *
 * @note The `ecc_op` block must be first in the trace so the `ecc_op_wire` polynomials align with
 * the main wires via `ecc_op_wire[r] == w_shift[r]` (enforced by EccOpQueueRelation).
 */
template <typename BlockData> class MegaExecutionTraceBlocks_ : public ExecutionTraceBlocksBase<BlockData> {
  public:
    // Distinguishes the two arithmetization families for the builder concepts below; the Mega family carries
    // the ecc op queue and databus, which selects goblin-style stdlib primitives.
    static constexpr bool IS_MEGA_ARITHMETIZATION = true;

    MegaExecutionTraceBlocks_() = default;

    bool operator==(const MegaExecutionTraceBlocks_& other) const = default;
};

} // namespace bb

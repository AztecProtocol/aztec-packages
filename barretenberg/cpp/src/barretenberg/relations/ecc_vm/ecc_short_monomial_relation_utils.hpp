// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

namespace bb {

template <typename Accumulator> using ECCVMShortMonomialView = typename Accumulator::CoefficientAccumulator;

} // namespace bb

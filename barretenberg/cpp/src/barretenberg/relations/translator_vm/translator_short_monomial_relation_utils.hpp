// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

namespace bb {

template <typename Accumulator> class TranslatorShortMonomialView : public Accumulator {
  public:
    using CoefficientAccumulator = typename Accumulator::CoefficientAccumulator;

    TranslatorShortMonomialView() = default;

    template <typename Edge>
    explicit TranslatorShortMonomialView(const Edge& edge)
        : Accumulator(CoefficientAccumulator(edge))
    {}
};

} // namespace bb

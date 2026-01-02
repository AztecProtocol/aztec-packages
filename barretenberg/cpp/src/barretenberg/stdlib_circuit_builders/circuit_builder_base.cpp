// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "circuit_builder_base_impl.hpp"

namespace bb {

template class CircuitBuilderBase<bb::fr>;
template class CircuitBuilderBase<grumpkin::fr>;
} // namespace bb

// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Suyash], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "barretenberg/ecc/curves/bn254/fq.hpp"
#include "barretenberg/ecc/curves/secp256k1/secp256k1.hpp"
#include "barretenberg/ecc/curves/secp256r1/secp256r1.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders_fwd.hpp"
#include "bigfield_impl.hpp"

namespace bb::stdlib {
// 2 builders x (Fr, Fq)
template class bigfield<UltraCircuitBuilder, secp256r1::FqParams>;
template class bigfield<UltraCircuitBuilder, secp256r1::FrParams>;
// Bigfield-backed: only the arithmetizations that keep the non-native-field gate.
#define INSTANTIATE_BIGFIELD_SECP256R1(Builder)                                                                        \
    template class bigfield<Builder, secp256r1::FqParams>;                                                             \
    template class bigfield<Builder, secp256r1::FrParams>;
INSTANTIATE_FOR_EACH_MEGA_BUILDER_WITH_NNF(INSTANTIATE_BIGFIELD_SECP256R1)
#undef INSTANTIATE_BIGFIELD_SECP256R1
} // namespace bb::stdlib

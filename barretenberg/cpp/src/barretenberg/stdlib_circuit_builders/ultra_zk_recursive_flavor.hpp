#pragma once

#include "barretenberg/stdlib_circuit_builders/ultra_zk_flavor.hpp"

namespace bb {

/*!
\brief A class used to recursively verify UltraZK proofs.
*/
template <typename BuilderType> class UltraZKRecursiveFlavor_ : public UltraRecursiveFlavor_<BuilderType> {
  public:
    using NativeFlavor = UltraZKFlavor;

    // Indicates that this flavor runs with non-ZK Sumcheck.
    static constexpr bool HasZK = true;

    // BATCHED_RELATION_PARTIAL_LENGTH = algebraic degree of sumcheck relation *after* multiplying by the `pow_zeta`
    // random polynomial e.g. For \sum(x) [A(x) * B(x) + C(x)] * PowZeta(X), relation length = 2 and random relation
    // length = 3
    static constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = NativeFlavor::BATCHED_RELATION_PARTIAL_LENGTH;
};
} // namespace bb
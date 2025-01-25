#pragma once

#include "barretenberg/stdlib_circuit_builders/ultra_zk_flavor.hpp"

namespace bb {

/*!
\brief Child class of UltraFlavor that runs with ZK Sumcheck.
\details
Most of the properties of UltraFlavor are
inherited without any changes, except for the MAX_PARTIAL_RELATION_LENGTH which is now computed as a maximum of
SUBRELATION_PARTIAL_LENGTHS incremented by the corresponding SUBRELATION_WITNESS_DEGREES over all relations included in
UltraFlavor, which also affects the size of ExtendedEdges univariate containers.
Moreover, the container SumcheckTupleOfTuplesOfUnivariates is resized to reflect that masked
witness polynomials are of degree at most \f$2\f$ in each variable, and hence, for any subrelation, the corresponding
univariate accumuluator size has to be increased by the subrelation's witness degree. See more in
\ref docs/src/sumcheck-outline.md "Sumcheck Outline".
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
// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/flavor/ultra_recursive_flavor.hpp"
#include "barretenberg/flavor/ultra_zk_flavor.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"

namespace bb {

/**
 * @brief The recursive counterpart to the Ultra flavor with ZK.
 * @details This flavor can be used to instantiate a recursive Ultra Honk ZK verifier for a proof created using the
 * ZK Ultra flavor. It is similar in structure to its native counterpart with two main differences: 1) the
 * curve types are stdlib types (e.g. field_t instead of field) and 2) it does not specify any Prover related types
 * (e.g. Polynomial, ProverUnivariates, etc.) since we do not emulate prover computation in circuits, i.e. it only makes
 * sense to instantiate a Verifier with this flavor.
 *
 * @note Unlike conventional flavors, "recursive" flavors are templated by a builder (much like native vs stdlib types).
 * This is because the flavor itself determines the details of the underlying verifier algorithm (i.e. the set of
 * relations), while the Builder determines the arithmetization of that algorithm into a circuit.
 *
 * @tparam BuilderType Determines the arithmetization of the verifier circuit defined based on this flavor.
 */
template <typename BuilderType> class UltraZKRecursiveFlavor_ : public UltraRecursiveFlavor_<BuilderType> {
  public:
    using NativeFlavor = UltraZKFlavor;
    using Commitment = typename UltraRecursiveFlavor_<BuilderType>::Commitment;
    using VerificationKey = typename UltraRecursiveFlavor_<BuilderType>::VerificationKey;
    using FF = typename UltraRecursiveFlavor_<BuilderType>::FF;

    static constexpr bool HasZK = true;

    // The number of entities added for ZK (gemini_masking_poly)
    static constexpr size_t NUM_MASKING_POLYNOMIALS = 1;

    // NUM_ALL_ENTITIES includes gemini_masking_poly
    static constexpr size_t NUM_ALL_ENTITIES =
        UltraRecursiveFlavor_<BuilderType>::NUM_ALL_ENTITIES + NUM_MASKING_POLYNOMIALS;

    static constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = NativeFlavor::BATCHED_RELATION_PARTIAL_LENGTH;

    // Override to include ZK entities
    class AllValues : public UltraFlavor::AllEntities_<FF, HasZK> {
      public:
        using Base = UltraFlavor::AllEntities_<FF, HasZK>;
        using Base::Base;
    };

    using VerifierCommitments = UltraFlavor::VerifierCommitments_<Commitment, VerificationKey, HasZK>;
};

} // namespace bb

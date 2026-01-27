// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/flavor/ultra_flavor.hpp"
#include "barretenberg/srs/factories/crs_factory.hpp"

#include <array>
#include <concepts>
#include <span>
#include <string>
#include <type_traits>
#include <vector>

#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"

namespace bb {

/**
 * @brief The recursive counterpart to the "native" Ultra flavor.
 * @details This flavor can be used to instantiate a recursive Ultra Honk verifier for a proof created using the
 * conventional Ultra flavor. It is similar in structure to its native counterpart with two main differences: 1) the
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
template <typename BuilderType> class UltraRecursiveFlavor_ {
  public:
    using CircuitBuilder = BuilderType; // Determines arithmetization of circuit instantiated with this flavor
    using Curve = stdlib::bn254<CircuitBuilder>;
    using PCS = KZG<Curve>;
    using GroupElement = typename Curve::Element;
    using Commitment = typename Curve::Element;
    using FF = typename Curve::ScalarField;
    using NativeFlavor = UltraFlavor;
    using NativeVerificationKey = NativeFlavor::VerificationKey;
    using Codec = stdlib::StdlibCodec<FF>;
    using Transcript = StdlibTranscript<CircuitBuilder>;

    static constexpr size_t VIRTUAL_LOG_N = UltraFlavor::VIRTUAL_LOG_N;
    // indicates when evaluating sumcheck, edges can be left as degree-1 monomials
    static constexpr bool USE_SHORT_MONOMIALS = UltraFlavor::USE_SHORT_MONOMIALS;

    // Note(luke): Eventually this may not be needed at all
    using VerifierCommitmentKey = bb::VerifierCommitmentKey<NativeFlavor::Curve>;
    // Indicates that this flavor runs with non-ZK Sumcheck.
    static constexpr bool HasZK = false;
    // To achieve fixed proof size and that the recursive verifier circuit is constant, we are using padding in Sumcheck
    // and Shplemini
    static constexpr bool USE_PADDING = UltraFlavor::USE_PADDING;
    static constexpr size_t NUM_WIRES = UltraFlavor::NUM_WIRES;
    // The number of multivariate polynomials on which a sumcheck prover sumcheck operates (including shifts). We often
    // need containers of this size to hold related data, so we choose a name more agnostic than `NUM_POLYNOMIALS`.
    // Note: this number does not include the individual sorted list polynomials.
    static constexpr size_t NUM_ALL_ENTITIES = UltraFlavor::NUM_ALL_ENTITIES;
    // The number of polynomials precomputed to describe a circuit and to aid a prover in constructing a satisfying
    // assignment of witnesses. We again choose a neutral name.
    static constexpr size_t NUM_PRECOMPUTED_ENTITIES = UltraFlavor::NUM_PRECOMPUTED_ENTITIES;
    // The total number of witness entities not including shifts.
    static constexpr size_t NUM_WITNESS_ENTITIES = UltraFlavor::NUM_WITNESS_ENTITIES;

    static constexpr size_t FINAL_PCS_MSM_SIZE(size_t log_n = VIRTUAL_LOG_N)
    {
        return UltraFlavor::FINAL_PCS_MSM_SIZE(log_n);
    };
    static constexpr RepeatedCommitmentsData REPEATED_COMMITMENTS = UltraFlavor::REPEATED_COMMITMENTS;

    // define the tuple of Relations that comprise the Sumcheck relation
    using Relations = UltraFlavor::Relations_<FF>;

    static constexpr size_t MAX_PARTIAL_RELATION_LENGTH = compute_max_partial_relation_length<Relations>();
    // static_assert(MAX_PARTIAL_RELATION_LENGTH == 7);

    // BATCHED_RELATION_PARTIAL_LENGTH = algebraic degree of sumcheck relation *after* multiplying by the `pow_zeta`
    // random polynomial e.g. For \sum(x) [A(x) * B(x) + C(x)] * PowZeta(X), relation length = 2 and random relation
    // length = 3
    static constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = MAX_PARTIAL_RELATION_LENGTH + 1;
    static constexpr size_t NUM_RELATIONS = std::tuple_size<Relations>::value;

    // A challenge whose powers are used to batch subrelation contributions during Sumcheck
    static constexpr size_t NUM_SUBRELATIONS = NativeFlavor::NUM_SUBRELATIONS;
    using SubrelationSeparator = FF;

    using VerificationKey = StdlibVerificationKey_<CircuitBuilder,
                                                   NativeFlavor::PrecomputedEntities<Commitment>,
                                                   typename NativeFlavor::VerificationKey>;

    /**
     * @brief A field element for each entity of the flavor. These entities represent the prover polynomials
     * evaluated at one point.
     */
    class AllValues : public UltraFlavor::AllEntities<FF> {
      public:
        using Base = UltraFlavor::AllEntities<FF>;
        using Base::Base;
    };

    using CommitmentLabels = UltraFlavor::CommitmentLabels;

    using WitnessCommitments = UltraFlavor::WitnessEntities<Commitment>;

    // Reuse the VerifierCommitments from Ultra
    using VerifierCommitments = UltraFlavor::VerifierCommitments_<Commitment, VerificationKey>;

    using VKAndHash = VKAndHash_<FF, VerificationKey>;
};

} // namespace bb

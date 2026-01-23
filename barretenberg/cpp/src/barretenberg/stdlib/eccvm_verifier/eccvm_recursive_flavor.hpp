// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/eccvm/eccvm_flavor.hpp"
#include "barretenberg/stdlib/eccvm_verifier/verifier_commitment_key.hpp"
#include "barretenberg/stdlib/primitives/curves/grumpkin.hpp"
#include "barretenberg/stdlib/proof/proof.hpp"

// NOLINTBEGIN(cppcoreguidelines-avoid-const-or-ref-data-members) ?

namespace bb {

class ECCVMRecursiveFlavor {
  public:
    using CircuitBuilder = UltraCircuitBuilder; // determines the arithmetisation of recursive verifier
    using Curve = stdlib::grumpkin<CircuitBuilder>;
    using Commitment = Curve::AffineElement;
    using GroupElement = Curve::Element;
    using FF = Curve::ScalarField;
    using BF = Curve::BaseField;
    using NativeFlavor = ECCVMFlavor;
    using NativeVerificationKey = NativeFlavor::VerificationKey;
    using PCS = IPA<Curve>;

    // Indicates that this flavor runs with non-ZK Sumcheck.
    static constexpr bool HasZK = true;
    // ECCVM proof size and its recursive verifier circuit are genuinely fixed, hence no padding is needed.
    static constexpr bool USE_PADDING = ECCVMFlavor::USE_PADDING;

    static constexpr size_t NUM_WIRES = ECCVMFlavor::NUM_WIRES;
    // The number of multivariate polynomials on which a sumcheck prover sumcheck operates (including shifts). We often
    // need containers of this size to hold related data, so we choose a name more agnostic than `NUM_POLYNOMIALS`.
    // Note: this number does not include the individual sorted list polynomials.
    static constexpr size_t NUM_ALL_ENTITIES = ECCVMFlavor::NUM_ALL_ENTITIES;
    // The number of polynomials precomputed to describe a circuit and to aid a prover in constructing a satisfying
    // assignment of witnesses. We again choose a neutral name.
    static constexpr size_t NUM_PRECOMPUTED_ENTITIES = ECCVMFlavor::NUM_PRECOMPUTED_ENTITIES;
    // The total number of witness entities not including shifts.
    static constexpr size_t NUM_WITNESS_ENTITIES = ECCVMFlavor::NUM_WITNESS_ENTITIES;

    static constexpr RepeatedCommitmentsData REPEATED_COMMITMENTS = ECCVMFlavor::REPEATED_COMMITMENTS;
    // define the tuple of Relations that comprise the Sumcheck relation
    // Reuse the Relations from ECCVM
    using Relations = ECCVMFlavor::Relations_<FF>;

    static constexpr size_t NUM_SUBRELATIONS = ECCVMFlavor::NUM_SUBRELATIONS;
    using SubrelationSeparators = std::array<FF, NUM_SUBRELATIONS - 1>;

    static constexpr size_t MAX_PARTIAL_RELATION_LENGTH = ECCVMFlavor::MAX_PARTIAL_RELATION_LENGTH;

    // BATCHED_RELATION_PARTIAL_LENGTH = algebraic degree of sumcheck relation *after* multiplying by the `pow_zeta`
    // random polynomial e.g. For \sum(x) [A(x) * B(x) + C(x)] * PowZeta(X), relation length = 2 and random relation
    // length = 3
    static constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = ECCVMFlavor::BATCHED_RELATION_PARTIAL_LENGTH;
    static constexpr size_t NUM_RELATIONS = std::tuple_size<Relations>::value;

    /**
     * @brief A field element for each entity of the flavor.  These entities represent the prover polynomials
     * evaluated at one point.
     */
    class AllValues : public ECCVMFlavor::AllEntities<FF> {
      public:
        using Base = ECCVMFlavor::AllEntities<FF>;
        using Base::Base;
    };

    using VerifierCommitmentKey = bb::VerifierCommitmentKey<Curve>;

    /**
     * @brief The verification key is responsible for storing the commitments to the precomputed (non-witness)
     * polynomials used by the verifier.
     */
    using VerificationKey =
        FixedStdlibVKAndHash_<CircuitBuilder, ECCVMFlavor::PrecomputedEntities<Commitment>, NativeVerificationKey>;

    /**
     * @brief A container for the witness commitments.
     */
    using WitnessCommitments = ECCVMFlavor::WitnessEntities<Commitment>;

    using CommitmentLabels = ECCVMFlavor::CommitmentLabels;
    // Reuse the VerifierCommitments from ECCVM
    using VerifierCommitments = ECCVMFlavor::VerifierCommitments_<Commitment, VerificationKey>;
    // Reuse the transcript from ECCVM
    using Transcript = StdlibTranscript<CircuitBuilder>;

    // Proof type for recursive verification
    using Proof = stdlib::Proof<CircuitBuilder>;

    using VKAndHash = VKAndHash_<VerificationKey, FF>;

}; // NOLINTEND(cppcoreguidelines-avoid-const-or-ref-data-members)

} // namespace bb

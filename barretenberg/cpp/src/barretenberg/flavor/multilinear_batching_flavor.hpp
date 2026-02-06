// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/commitment_schemes/kzg/kzg.hpp"
#include "barretenberg/common/ref_vector.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/flavor/flavor_macros.hpp"
#include "barretenberg/flavor/partially_evaluated_multivariates.hpp"
#include "barretenberg/flavor/relation_definitions.hpp"
#include "barretenberg/relations/multilinear_batching/multilinear_batching_relation.hpp"
#include "barretenberg/transcript/transcript.hpp"

namespace bb {

// Forward declaration for debug comparison method
template <typename Curve> struct MultilinearBatchingVerifierClaim;

class MultilinearBatchingFlavor {
  public:
    using Curve = curve::BN254;
    using FF = Curve::ScalarField;
    using GroupElement = Curve::Element;
    using Commitment = Curve::AffineElement;
    using PCS = KZG<Curve>;
    using Polynomial = bb::Polynomial<FF>;
    using CommitmentKey = bb::CommitmentKey<Curve>;
    using VerifierCommitmentKey = bb::VerifierCommitmentKey<Curve>;
    using Transcript = NativeTranscript;
    using Codec = FrCodec;

    // An upper bound on the size of the MultilinearBatching-circuits. `CONST_FOLDING_LOG_N` bounds the log circuit
    // sizes in the Chonk context.
    static constexpr size_t VIRTUAL_LOG_N = CONST_FOLDING_LOG_N;
    static constexpr bool USE_SHORT_MONOMIALS = false;
    // Indicates that this flavor runs with non-ZK Sumcheck.
    static constexpr bool HasZK = false;
    // Indicates that this flavor runs with Multilinear Batching.
    static constexpr bool IS_MULTILINEAR_BATCHING = true;
    // To achieve fixed proof size and that the recursive verifier circuit is constant, we are using padding in Sumcheck
    // and Shplemini
    static constexpr bool USE_PADDING = true;

    // ============ PROOF STRUCTURE CONSTANTS ============
    // Number of accumulator commitments sent in proof (non_shifted + shifted).
    // Note: instance commitments are computed by verifier from Oink witness commitments.
    // Note: eq polynomials are computed from challenges, not committed.
    static constexpr size_t NUM_ACCUMULATOR_COMMITMENTS = 2;
    // Number of accumulator evaluations sent in proof (non_shifted + shifted).
    static constexpr size_t NUM_ACCUMULATOR_EVALUATIONS = 2;

    // ============ SUMCHECK CONSTANTS ============
    // Total polynomials in sumcheck: 4 unshifted + 2 shifted views.
    static constexpr size_t NUM_ALL_ENTITIES = 6;
    static constexpr size_t NUM_SHIFTED_ENTITIES = 2;

    // define the tuple of Relations that comprise the Sumcheck relation
    // Note: made generic for use in MegaRecursive.
    template <typename FF>
    using Relations_ =
        std::tuple<bb::MultilinearBatchingAccumulatorRelation<FF>, bb::MultilinearBatchingInstanceRelation<FF>>;
    using Relations = Relations_<FF>;

    static constexpr size_t MAX_PARTIAL_RELATION_LENGTH = compute_max_partial_relation_length<Relations>();
    // BATCHED_RELATION_PARTIAL_LENGTH = algebraic degree of sumcheck relation *after* multiplying by the `pow_zeta`
    // random polynomial e.g. For \sum(x) [A(x) * B(x) + C(x)] * PowZeta(X), relation length = 2 and random relation
    // length = 3
    static constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = MAX_PARTIAL_RELATION_LENGTH + 1;
    static constexpr size_t NUM_RELATIONS = std::tuple_size_v<Relations>;

    // A challenge whose powers are used to batch subrelation contributions during Sumcheck
    static constexpr size_t NUM_SUBRELATIONS = compute_number_of_subrelations<Relations>();
    using SubrelationSeparator = FF;

    /**
     * @brief All polynomials used in multilinear batching sumcheck.
     * @details Used to build containers for: the prover's polynomials during sumcheck; the sumcheck's folded
     * polynomials; the univariates constructed during sumcheck; the evaluations produced by sumcheck.
     *
     * Layout:
     *   - batched_unshifted_accumulator: commitment SENT in proof
     *   - batched_unshifted_instance:    commitment computed by verifier from Oink witness commitments
     *   - eq_accumulator/eq_instance:    computed from challenges by both prover and verifier (not committed)
     *   - batched_shifted_*:             shifted views of the batched polynomials
     */
    template <typename DataType> class AllEntities {
      public:
        DEFINE_FLAVOR_MEMBERS(DataType,
                              batched_unshifted_accumulator, // Accumulator's batched unshifted poly (committed)
                              batched_unshifted_instance,    // Instance's batched unshifted poly (verifier computes)
                              eq_accumulator,                // eq(u, r_acc) selector (derived from challenges)
                              eq_instance,                   // eq(u, r_inst) selector (derived from challenges)
                              batched_shifted_accumulator,   // Accumulator's batched shifted poly
                              batched_shifted_instance);     // Instance's batched shifted poly

        auto get_unshifted()
        {
            return RefArray{ batched_unshifted_accumulator, batched_unshifted_instance, eq_accumulator, eq_instance };
        };
        auto get_shifted() { return RefArray{ batched_shifted_accumulator, batched_shifted_instance }; };
    };

    /**
     * @brief A field element for each entity of the flavor. These entities represent the prover polynomials evaluated
     * at one point.
     */
    class AllValues : public AllEntities<FF> {
      public:
        using Base = AllEntities<FF>;
        using Base::Base;
    };

    /**
     * @brief A container for the prover polynomials handles.
     */
    class ProverPolynomials : public AllEntities<Polynomial> {
      public:
        [[nodiscard]] size_t get_polynomial_size() const { return batched_unshifted_accumulator.size(); }
        void increase_polynomials_virtual_size(const size_t size_in)
        {
            for (auto& polynomial : this->get_all()) {
                polynomial.increase_virtual_size(size_in);
            }
        }
    };

    /**
     * @brief Prover's claim for multilinear batching - contains polynomials and their evaluation claims.
     * @details Used as input to ProvingKey and as output from HyperNova folding.
     * Each claim represents: "polynomial P evaluated at challenge r equals evaluation v".
     */
    struct ProverClaim {
        std::vector<FF> challenge;         // Evaluation point r
        FF non_shifted_evaluation;         // Claimed value P(r)
        FF shifted_evaluation;             // Claimed value P_shifted(r)
        Polynomial non_shifted_polynomial; // The polynomial P
        Polynomial shifted_polynomial;     // The shiftable polynomial (pre-shift form)
        Commitment non_shifted_commitment; // Commitment [P]
        Commitment shifted_commitment;     // Commitment [P_shifted]
        size_t dyadic_size;                // Size of the polynomial domain

#ifndef NDEBUG
        /**
         * @brief Debug helper to compare prover claim against verifier claim.
         * @details Recomputes commitments and evaluations to verify consistency.
         */
        bool compare_with_verifier_claim(const MultilinearBatchingVerifierClaim<curve::BN254>& verifier_claim);
#endif
    };

    /**
     * @brief The proving key for multilinear batching sumcheck.
     *
     * @details In HyperNova folding, we reduce two polynomial evaluation claims to one via sumcheck.
     *
     * Each claim asserts: "polynomial P evaluated at point r equals v", i.e., P(r) = v.
     * - Accumulator claim: P_acc(r_acc) = v_acc  (from previous folding rounds)
     * - Instance claim:    P_inst(r_inst) = v_inst (from the incoming circuit)
     *
     * The multilinear batching sumcheck proves both claims simultaneously by checking:
     *   sum_x [ P_acc(x) * eq(x, r_acc) ] = v_acc
     *   sum_x [ P_inst(x) * eq(x, r_inst) ] = v_inst
     *
     * where eq(x, r) is the equality polynomial that is 1 when x = r and 0 elsewhere on the hypercube.
     *
     * After sumcheck, both claims are reduced to evaluations at a new random point u, producing a
     * single combined claim that can be verified with one polynomial opening.
     *
     * Field mapping from ProverClaim to ProvingKey:
     * - non_shifted_polynomial → polynomials.batched_unshifted_{accumulator,instance}
     * - shifted_polynomial     → polynomials.batched_shifted_{accumulator,instance} (via .shifted())
     * - challenge              → {accumulator,instance}_challenge + polynomials.eq_{accumulator,instance}
     * - {non_shifted,shifted}_evaluation → {accumulator,instance}_evaluations
     * - {non_shifted,shifted}_commitment → {non_shifted,shifted}_{accumulator,instance}_commitment
     * - shifted_polynomial     → preshifted_{accumulator,instance} (for new claim computation)
     */
    class ProvingKey {
      public:
        // Polynomials for sumcheck: batched witnesses + eq selectors
        ProverPolynomials polynomials;

        // Evaluation points r_acc and r_inst (sent to verifier for eq polynomial construction)
        std::vector<FF> accumulator_challenge;
        std::vector<FF> instance_challenge;

        // Claimed evaluations v_acc = P_acc(r_acc) and v_inst = P_inst(r_inst)
        std::vector<FF> accumulator_evaluations;
        std::vector<FF> instance_evaluations;

        size_t circuit_size;

        // Commitments [P_acc] and [P_inst] - combined into output claim's commitment
        Commitment non_shifted_accumulator_commitment;
        Commitment shifted_accumulator_commitment;
        Commitment non_shifted_instance_commitment;
        Commitment shifted_instance_commitment;

        // Pre-shifted polynomials for computing new claim's shifted polynomial
        Polynomial preshifted_accumulator;
        Polynomial preshifted_instance;

        ProvingKey() = default;

        /**
         * @brief Construct from accumulator and instance claims.
         * @details Takes ownership via move semantics. After construction, the claims are consumed.
         */
        ProvingKey(ProverClaim&& accumulator_claim, ProverClaim&& instance_claim);
    };

    /**
     * @brief A container for storing the partially evaluated multivariates produced by sumcheck.
     */
    using PartiallyEvaluatedMultivariates =
        PartiallyEvaluatedMultivariatesBase<AllEntities<Polynomial>, ProverPolynomials, Polynomial>;

    /**
     * @brief A container for univariates used in sumcheck.
     * @details During folding and sumcheck, the prover evaluates the relations on these univariates.
     */
    template <size_t LENGTH> using ProverUnivariates = AllEntities<bb::Univariate<FF, LENGTH>>;

    /**
     * @brief A container for univariates produced during the hot loop in sumcheck.
     */
    using ExtendedEdges = ProverUnivariates<MAX_PARTIAL_RELATION_LENGTH>;
};

// Type alias for external usage
using MultilinearBatchingProverClaim = MultilinearBatchingFlavor::ProverClaim;

} // namespace bb

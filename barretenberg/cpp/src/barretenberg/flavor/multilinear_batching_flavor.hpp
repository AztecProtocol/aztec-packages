// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include <utility>

#include "barretenberg/commitment_schemes/kzg/kzg.hpp"
#include "barretenberg/common/ref_vector.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/flavor/flavor_macros.hpp"
#include "barretenberg/flavor/relation_definitions.hpp"
#include "barretenberg/relations/multilinear_batching/multilinear_batching_relation.hpp"
#include "barretenberg/transcript/transcript.hpp"

namespace bb {

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

    // An upper bound on the size of the MultilinearBatching-circuits. `CONST_PG_LOG_N` bounds the log circuit sizes in
    // the CIVC context. `MEGA_AVM_LOG_N` is determined by the size of the AVMRecursiveVerifier.
    static constexpr size_t VIRTUAL_LOG_N = std::max(CONST_PG_LOG_N, MEGA_AVM_LOG_N);
    static constexpr bool USE_SHORT_MONOMIALS = false;
    // Indicates that this flavor runs with non-ZK Sumcheck.
    static constexpr bool HasZK = false;
    // Indicates that this flavor runs with Multilinear Batching.
    static constexpr bool IS_MULTILINEAR_BATCHING = true;
    // To achieve fixed proof size and that the recursive verifier circuit is constant, we are using padding in Sumcheck
    // and Shplemini
    static constexpr bool USE_PADDING = true;
    static constexpr size_t NUM_WIRES = 4;
    // The number of multivariate polynomials on which a sumcheck prover sumcheck operates (including shifts). We often
    // need containers of this size to hold related data, so we choose a name more agnostic than `NUM_POLYNOMIALS`.
    static constexpr size_t NUM_ALL_ENTITIES = 6;
    // The total number of witness entities not including shifts.
    static constexpr size_t NUM_WITNESS_ENTITIES = 4;
    // The number of shifted witness entities including derived witness entities
    static constexpr size_t NUM_SHIFTED_WITNESSES = 2;

    // define the tuple of Relations that comprise the Sumcheck relation
    // Note: made generic for use in MegaRecursive.
    template <typename FF> using Relations_ = std::tuple<bb::MultilinearBatchingRelation<FF>>;
    using Relations = Relations_<FF>;

    static constexpr size_t MAX_PARTIAL_RELATION_LENGTH = compute_max_partial_relation_length<Relations>();
    // BATCHED_RELATION_PARTIAL_LENGTH = algebraic degree of sumcheck relation *after* multiplying by the `pow_zeta`
    // random polynomial e.g. For \sum(x) [A(x) * B(x) + C(x)] * PowZeta(X), relation length = 2 and random relation
    // length = 3
    static constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = MAX_PARTIAL_RELATION_LENGTH + 1;
    static constexpr size_t NUM_RELATIONS = std::tuple_size_v<Relations>;

    // For instances of this flavour, used in folding, we need a unique sumcheck batching challenges for each
    // subrelation. This is because using powers of alpha would increase the degree of Protogalaxy polynomial $G$ (the
    // combiner) too much.
    static constexpr size_t NUM_SUBRELATIONS = compute_number_of_subrelations<Relations>();
    using SubrelationSeparators = std::array<FF, NUM_SUBRELATIONS - 1>;

    // Whether or not the first row of the execution trace is reserved for 0s to enable shifts
    static constexpr bool has_zero_row = false;

    // WireEntities for basic witness entities
    template <typename DataType> class WireEntities {
      public:
        DEFINE_FLAVOR_MEMBERS(DataType,
                              w_non_shifted_accumulator, // column 0
                              w_non_shifted_instance,    // column 1
                              w_evaluations_accumulator, // column 2
                              w_evaluations_instance);   // column 3
    };

    /**
     * @brief Container for all witness polynomials used/constructed by the prover.
     * @details Shifts are not included here since they do not occupy their own memory.
     * Combines WireEntities + DerivedEntities.
     */
    template <typename DataType> class WitnessEntities : public WireEntities<DataType> {
      public:
        DEFINE_FLAVOR_MEMBERS(DataType,
                              w_non_shifted_accumulator, // column 0
                              w_non_shifted_instance,    // column 1
                              w_evaluations_accumulator, // column 2
                              w_evaluations_instance);   // column 3

        MSGPACK_FIELDS(this->w_non_shifted_accumulator,
                       this->w_non_shifted_instance,
                       this->w_evaluations_accumulator,
                       this->w_evaluations_instance);
    };

    /**
     * @brief Class for ShiftedEntities, containing the shifted witness polynomials.
     */
    template <typename DataType> class ShiftedEntities {
      public:
        DEFINE_FLAVOR_MEMBERS(DataType,
                              w_shifted_accumulator, // column 0
                              w_shifted_instance     // column 1
        );
        auto get_shifted() { return RefArray{ w_shifted_accumulator, w_shifted_instance }; };
    };

    /**
     * @brief A base class labelling all entities (for instance, all of the polynomials used by the prover during
     * sumcheck) in this Honk variant along with particular subsets of interest
     * @details Used to build containers for: the prover's polynomial during sumcheck; the sumcheck's folded
     * polynomials; the univariates consturcted during during sumcheck; the evaluations produced by sumcheck.
     *
     * Symbolically we have: AllEntities = PrecomputedEntities + WitnessEntities + "ShiftedEntities". It could be
     * implemented as such, but we have this now.
     */
    template <typename DataType>
    class AllEntities : public WitnessEntities<DataType>, public ShiftedEntities<DataType> {
      public:
        DEFINE_COMPOUND_GET_ALL(WitnessEntities<DataType>, ShiftedEntities<DataType>)

        auto get_unshifted() { return WitnessEntities<DataType>::get_all(); };
        auto get_shifted() { return ShiftedEntities<DataType>::get_all(); };
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
        // Define all operations as default, except copy construction/assignment
        ProverPolynomials() = default;
        // fully-formed constructor
        ProverPolynomials(size_t circuit_size)
        {
            BB_BENCH_NAME("ProverPolynomials(size_t)");

            // catch-all with fully formed polynomials
            for (auto& poly : get_unshifted()) {
                if (poly.is_empty()) {
                    // Not set above
                    poly = Polynomial{ /*memory size*/ circuit_size, /*largest possible index*/ 1 << VIRTUAL_LOG_N };
                }
            }

            for (auto& poly : get_shifted()) {
                poly = Polynomial{ /*memory size*/ circuit_size, /*largest possible index*/ 1 << VIRTUAL_LOG_N };
            }
        }
        [[nodiscard]] size_t get_polynomial_size() const { return w_non_shifted_accumulator.size(); }
        void increase_polynomials_virtual_size(const size_t size_in)
        {
            for (auto& polynomial : this->get_all()) {
                polynomial.increase_virtual_size(size_in);
            }
        }
    };

    /**
     * @brief The proving key is responsible for storing the polynomials used by the prover.
     *
     */
    class ProvingKey {
      public:
        ProverPolynomials polynomials; // storage for all polynomials evaluated by the prover
        std::vector<FF> accumulator_challenge;
        std::vector<FF> instance_challenge;
        std::vector<FF> accumulator_evaluations;
        std::vector<FF> instance_evaluations;
        size_t circuit_size;
        ProvingKey(ProverPolynomials&& polynomials,
                   std::vector<FF> accumulator_challenge,
                   std::vector<FF> instance_challenge,
                   std::vector<FF> accumulator_evaluations,
                   std::vector<FF> instance_evaluations)
            : polynomials(std::move(polynomials))
            , accumulator_challenge(std::move(accumulator_challenge))
            , instance_challenge(std::move(instance_challenge))
            , accumulator_evaluations(std::move(accumulator_evaluations))
            , instance_evaluations(std::move(instance_evaluations))
            , circuit_size(polynomials.get_polynomial_size())
        {}
    };

    /**
     * @brief A container for storing the partially evaluated multivariates produced by sumcheck.
     */
    class PartiallyEvaluatedMultivariates : public AllEntities<Polynomial> {

      public:
        PartiallyEvaluatedMultivariates() = default;
        PartiallyEvaluatedMultivariates(const ProverPolynomials& full_polynomials, size_t circuit_size)
        {
            for (auto [poly, full_poly] : zip_view(get_all(), full_polynomials.get_all())) {
                // After the initial sumcheck round, the new size is CEIL(size/2).
                size_t desired_size = full_poly.end_index() / 2 + full_poly.end_index() % 2;
                poly = Polynomial(desired_size, circuit_size / 2);
            }
        }
    };

    /**
     * @brief A container for univariates used during Protogalaxy folding and sumcheck.
     * @details During folding and sumcheck, the prover evaluates the relations on these univariates.
     */
    template <size_t LENGTH> using ProverUnivariates = AllEntities<bb::Univariate<FF, LENGTH>>;

    /**
     * @brief A container for univariates produced during the hot loop in sumcheck.
     */
    using ExtendedEdges = ProverUnivariates<MAX_PARTIAL_RELATION_LENGTH>;

    /**
     * @brief A container for the witness commitments.
     */
    using WitnessCommitments = WitnessEntities<Commitment>;

    /**
     * @brief A container for commitment labels.
     * @note It's debatable whether this should inherit from AllEntities. since most entries are not strictly needed. It
     * has, however, been useful during debugging to have these labels available.
     *
     */
    class CommitmentLabels : public AllEntities<std::string> {
      public:
        CommitmentLabels()
        {
            w_non_shifted_accumulator = "W_NON_SHIFTED_ACCUMULATOR";
            w_non_shifted_instance = "W_NON_SHIFTED_INSTANCE";
            w_evaluations_accumulator = "W_EVALUATIONS_ACCUMULATOR";
            w_evaluations_instance = "W_EVALUATIONS_INSTANCE";
            w_shifted_accumulator = "W_SHIFTED_ACCUMULATOR";
            w_shifted_instance = "W_SHIFTED_INSTANCE";
        };
    };
};

} // namespace bb

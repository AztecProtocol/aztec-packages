#pragma once
#include "barretenberg/commitment_schemes/commitment_key.hpp"
#include "barretenberg/commitment_schemes/kzg/kzg.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/polynomials/univariate.hpp"
#include "barretenberg/relations/avm_templates/generic_permutation_relation.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/relations/relation_types.hpp"
#include "relation_definitions_fwd.hpp"
#include <array>
#include <concepts>
#include <span>
#include <string>
#include <type_traits>
#include <vector>

// NOLINTBEGIN(cppcoreguidelines-avoid-const-or-ref-data-members)

namespace proof_system::honk {
namespace flavor {

class AVMTemplate {
  public:
    using Curve = curve::BN254;
    using FF = Curve::ScalarField;
    using GroupElement = Curve::Element;
    using Commitment = Curve::AffineElement;
    using CommitmentHandle = Curve::AffineElement;
    using PCS = pcs::kzg::KZG<Curve>;
    using Polynomial = barretenberg::Polynomial<FF>;
    using PolynomialHandle = std::span<FF>;
    using CommitmentKey = pcs::CommitmentKey<Curve>;
    using VerifierCommitmentKey = pcs::VerifierCommitmentKey<Curve>;

    static constexpr size_t NUM_WIRES = 2;

    // The number of multivariate polynomials on which a sumcheck prover sumcheck operates (including shifts). We often
    // need containers of this size to hold related data, so we choose a name more agnostic than `NUM_POLYNOMIALS`.
    // Note: this number does not include the individual sorted list polynomials.
    static constexpr size_t NUM_ALL_ENTITIES = 5;
    // The number of polynomials precomputed to describe a circuit and to aid a prover in constructing a satisfying
    // assignment of witnesses. We again choose a neutral name.
    static constexpr size_t NUM_PRECOMPUTED_ENTITIES = 2;
    // The total number of witness entities not including shifts.
    static constexpr size_t NUM_WITNESS_ENTITIES = 3;

    // define the tuple of Relations that comprise the Sumcheck relation
    using Relations = std::tuple<sumcheck::GenericPermutationRelation<FF>>;

    static constexpr size_t MAX_PARTIAL_RELATION_LENGTH = compute_max_partial_relation_length<Relations>();

    // BATCHED_RELATION_PARTIAL_LENGTH = algebraic degree of sumcheck relation *after* multiplying by the `pow_zeta`
    // random polynomial e.g. For \sum(x) [A(x) * B(x) + C(x)] * PowZeta(X), relation length = 2 and random relation
    // length = 3
    static constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = MAX_PARTIAL_RELATION_LENGTH + 1;
    static constexpr size_t NUM_RELATIONS = std::tuple_size<Relations>::value;

    // Instantiate the BarycentricData needed to extend each Relation Univariate

    // define the containers for storing the contributions from each relation in Sumcheck
    using SumcheckTupleOfTuplesOfUnivariates = decltype(create_sumcheck_tuple_of_tuples_of_univariates<Relations>());
    using TupleOfArraysOfValues = decltype(create_tuple_of_arrays_of_values<Relations>());

  private:
    /**
     * @brief A base class labelling precomputed entities and (ordered) subsets of interest.
     * @details Used to build the proving key and verification key.
     */
    template <typename DataType, typename HandleType>
    class PrecomputedEntities : public PrecomputedEntities_<DataType, HandleType, NUM_PRECOMPUTED_ENTITIES> {
      public:
        DataType lagrange_first;         // column 0
        DataType enable_set_permutation; // column 1

        DEFINE_POINTER_VIEW(NUM_PRECOMPUTED_ENTITIES, &lagrange_first)

        std::vector<HandleType> get_selectors() override { return { lagrange_first }; };
        std::vector<HandleType> get_sigma_polynomials() override { return {}; };
        std::vector<HandleType> get_id_polynomials() override { return {}; };
        std::vector<HandleType> get_table_polynomials() { return {}; };
    };

    /**
     * @brief Container for all witness polynomials used/constructed by the prover.
     * @details Shifts are not included here since they do not occupy their own memory.
     */
    template <typename DataType, typename HandleType>
    class WitnessEntities : public WitnessEntities_<DataType, HandleType, NUM_WITNESS_ENTITIES> {
      public:
        DataType column_0;             // column 0
        DataType column_1;             // column 1
        DataType permutation_inverses; // column 2

        DEFINE_POINTER_VIEW(NUM_WITNESS_ENTITIES, &column_0, &column_1, &permutation_inverses)
        std::vector<HandleType> get_wires() override { return { column_0, column_1 }; };
        // The sorted concatenations of table and witness data needed for plookup.
        std::vector<HandleType> get_sorted_polynomials() { return {}; };
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
    template <typename DataType, typename HandleType>
    class AllEntities : public AllEntities_<DataType, HandleType, NUM_ALL_ENTITIES> {
      public:
        DataType lagrange_first;           // column 0
        DataType enable_set_permutation;   // column 0
        DataType permutation_set_column_1; // column 1
        DataType permutation_set_column_2; // column 2
        DataType permutation_inverses;     // column 3

        // defines a method pointer_view that returns the following, with const and non-const variants
        DEFINE_POINTER_VIEW(NUM_ALL_ENTITIES,
                            &lagrange_first,
                            &enable_set_permutation,
                            &permutation_set_column_1,
                            &permutation_set_column_2,
                            &permutation_inverses)
        std::vector<HandleType> get_wires() override
        {
            return {
                permutation_set_column_1,
                permutation_set_column_2,
            };
        };
        // Gemini-specific getters.
        std::vector<HandleType> get_unshifted() override
        {
            return {
                lagrange_first,           enable_set_permutation, permutation_set_column_1,
                permutation_set_column_2, permutation_inverses,
            };
        };

        std::vector<HandleType> get_to_be_shifted() override { return {}; };
        std::vector<HandleType> get_shifted() override { return {}; };
    };

  public:
    /**
     * @brief The proving key is responsible for storing the polynomials used by the prover.
     * @note TODO(Cody): Maybe multiple inheritance is the right thing here. In that case, nothing should eve inherit
     * from ProvingKey.
     */
    class ProvingKey : public ProvingKey_<PrecomputedEntities<Polynomial, PolynomialHandle>,
                                          WitnessEntities<Polynomial, PolynomialHandle>> {
      public:
        // Expose constructors on the base class
        using Base = ProvingKey_<PrecomputedEntities<Polynomial, PolynomialHandle>,
                                 WitnessEntities<Polynomial, PolynomialHandle>>;
        using Base::Base;

        // The plookup wires that store plookup read data.
        std::array<PolynomialHandle, 3> get_table_column_wires() { return {}; };
    };

    /**
     * @brief The verification key is responsible for storing the the commitments to the precomputed (non-witnessk)
     * polynomials used by the verifier.
     *
     * @note Note the discrepancy with what sort of data is stored here vs in the proving key. We may want to resolve
     * that, and split out separate PrecomputedPolynomials/Commitments data for clarity but also for portability of our
     * circuits.
     */
    using VerificationKey = VerificationKey_<PrecomputedEntities<Commitment, CommitmentHandle>>;

    /**
     * @brief A container for polynomials produced after the first round of sumcheck.
     * @todo TODO(#394) Use polynomial classes for guaranteed memory alignment.
     */
    using FoldedPolynomials = AllEntities<std::vector<FF>, PolynomialHandle>;

    /**
     * @brief A field element for each entity of the flavor.  These entities represent the prover polynomials evaluated
     * at one point.
     */
    class AllValues : public AllEntities<FF, FF> {
      public:
        using Base = AllEntities<FF, FF>;
        using Base::Base;
    };

    /**
     * @brief An owning container of polynomials.
     * @warning When this was introduced it broke some of our design principles.
     *   - Execution trace builders don't handle "polynomials" because the interpretation of the execution trace columns
     *     as polynomials is a detail of the proving system, and trace builders are (sometimes in practice, always in
     *     principle) reusable for different proving protocols (e.g., Plonk and Honk).
     *   - Polynomial storage is handled by key classes. Polynomials aren't moved, but are accessed elsewhere by
     * std::spans.
     *
     *  We will consider revising this data model: TODO(https://github.com/AztecProtocol/barretenberg/issues/743)
     */
    class AllPolynomials : public AllEntities<Polynomial, PolynomialHandle> {
      public:
        [[nodiscard]] size_t get_polynomial_size() const { return this->lagrange_first.size(); }
        AllValues get_row(const size_t row_idx) const
        {
            AllValues result;
            for (auto [result_field, polynomial] : zip_view(result.pointer_view(), this->pointer_view())) {
                *result_field = (*polynomial)[row_idx];
            }
            return result;
        }
    };
    /**
     * @brief A container for polynomials produced after the first round of sumcheck.
     * @todo TODO(#394) Use polynomial classes for guaranteed memory alignment.
     */
    using RowPolynomials = AllEntities<FF, FF>;

    /**
     * @brief A container for storing the partially evaluated multivariates produced by sumcheck.
     */
    class PartiallyEvaluatedMultivariates : public AllEntities<Polynomial, PolynomialHandle> {

      public:
        PartiallyEvaluatedMultivariates() = default;
        PartiallyEvaluatedMultivariates(const size_t circuit_size)
        {
            // Storage is only needed after the first partial evaluation, hence polynomials of size (n / 2)
            for (auto* poly : this->pointer_view()) {
                *poly = Polynomial(circuit_size / 2);
            }
        }
    };

    /**
     * @brief A container for univariates used during sumcheck.
     */
    template <size_t LENGTH>
    using ProverUnivariates = AllEntities<barretenberg::Univariate<FF, LENGTH>, barretenberg::Univariate<FF, LENGTH>>;

    /**
     * @brief A container for univariates produced during the hot loop in sumcheck.
     */
    using ExtendedEdges = ProverUnivariates<MAX_PARTIAL_RELATION_LENGTH>;

    /**
     * @brief A container for the prover polynomials handles; only stores spans.
     */
    class ProverPolynomials : public AllEntities<PolynomialHandle, PolynomialHandle> {
      public:
        /**
         * @brief Returns the evaluations of all prover polynomials at one point on the boolean hypercube, which
         * represents one row in the execution trace.
         */
        AllValues get_row(const size_t row_idx)
        {
            AllValues result;
            for (auto [result_field, polynomial] : zip_view(result.pointer_view(), this->pointer_view())) {
                *result_field = (*polynomial)[row_idx];
            }
            return result;
        }
    };

    /**
     * @brief A container for commitment labels.
     * @note It's debatable whether this should inherit from AllEntities. since most entries are not strictly needed. It
     * has, however, been useful during debugging to have these labels available.
     *
     */
    class CommitmentLabels : public AllEntities<std::string, std::string> {
      private:
        using Base = AllEntities<std::string, std::string>;

      public:
        CommitmentLabels()
            : AllEntities<std::string, std::string>()
        {
            Base::permutation_set_column_1 = "PERMUTATION_SET_COLUMN_1";
            Base::permutation_set_column_2 = "PERMUTATION_SET_COLUMN_2";
            Base::permutation_inverses = "PERMUTATION_INVERSES";
            // The ones beginning with "__" are only used for debugging
            Base::lagrange_first = "__LAGRANGE_FIRST";
            Base::enable_set_permutation = "__ENABLE_SET_PERMUTATION";
        };
    };

    class VerifierCommitments : public AllEntities<Commitment, CommitmentHandle> {
      private:
        using Base = AllEntities<Commitment, CommitmentHandle>;

      public:
        VerifierCommitments(const std::shared_ptr<VerificationKey>& verification_key,
                            [[maybe_unused]] const BaseTranscript<FF>& transcript)
        {
            static_cast<void>(transcript);
            Base::lagrange_first = verification_key->lagrange_first;
        }
    };

    /**
     * @brief Derived class that defines proof structure for ECCVM proofs, as well as supporting functions.
     *
     */
    class Transcript : public BaseTranscript<FF> {
      public:
        uint32_t circuit_size;
        Commitment column_0_comm;
        Commitment column_1_comm;
        Commitment permutation_inverses_comm;
        std::vector<barretenberg::Univariate<FF, BATCHED_RELATION_PARTIAL_LENGTH>> sumcheck_univariates;
        std::array<FF, NUM_ALL_ENTITIES> sumcheck_evaluations;

        std::vector<Commitment> zm_cq_comms;
        Commitment zm_cq_comm;
        Commitment zm_pi_comm;

        Transcript() = default;

        Transcript(const std::vector<uint8_t>& proof)
            : BaseTranscript<FF>(proof)
        {}

        void deserialize_full_transcript() override
        {
            // take current proof and put them into the struct
            size_t num_bytes_read = 0;
            circuit_size = BaseTranscript<FF>::template deserialize_from_buffer<uint32_t>(
                BaseTranscript<FF>::proof_data, num_bytes_read);
            size_t log_n = numeric::get_msb(circuit_size);
            column_0_comm = BaseTranscript<FF>::template deserialize_from_buffer<Commitment>(
                BaseTranscript<FF>::proof_data, num_bytes_read);
            column_1_comm = BaseTranscript<FF>::template deserialize_from_buffer<Commitment>(
                BaseTranscript<FF>::proof_data, num_bytes_read);
            permutation_inverses_comm = BaseTranscript<FF>::template deserialize_from_buffer<Commitment>(
                BaseTranscript<FF>::proof_data, num_bytes_read);

            for (size_t i = 0; i < log_n; ++i) {
                sumcheck_univariates.push_back(
                    deserialize_from_buffer<barretenberg::Univariate<FF, BATCHED_RELATION_PARTIAL_LENGTH>>(
                        proof_data, num_bytes_read));
            }
            sumcheck_evaluations =
                deserialize_from_buffer<std::array<FF, NUM_ALL_ENTITIES>>(proof_data, num_bytes_read);
            for (size_t i = 0; i < log_n; ++i) {
                zm_cq_comms.push_back(deserialize_from_buffer<Commitment>(proof_data, num_bytes_read));
            }
            zm_cq_comm = deserialize_from_buffer<Commitment>(proof_data, num_bytes_read);
            zm_pi_comm = deserialize_from_buffer<Commitment>(proof_data, num_bytes_read);
        }

        void serialize_full_transcript() override
        {
            size_t old_proof_length = BaseTranscript<FF>::proof_data.size();
            BaseTranscript<FF>::proof_data.clear();
            size_t log_n = numeric::get_msb(circuit_size);

            BaseTranscript<FF>::template serialize_to_buffer(circuit_size, BaseTranscript<FF>::proof_data);
            BaseTranscript<FF>::template serialize_to_buffer(column_0_comm, BaseTranscript<FF>::proof_data);
            BaseTranscript<FF>::template serialize_to_buffer(column_1_comm, BaseTranscript<FF>::proof_data);
            BaseTranscript<FF>::template serialize_to_buffer(permutation_inverses_comm, BaseTranscript<FF>::proof_data);
            for (size_t i = 0; i < log_n; ++i) {
                BaseTranscript<FF>::template serialize_to_buffer(sumcheck_univariates[i], proof_data);
            }
            BaseTranscript<FF>::template serialize_to_buffer(sumcheck_evaluations, proof_data);
            for (size_t i = 0; i < log_n; ++i) {
                BaseTranscript<FF>::template serialize_to_buffer(zm_cq_comms[i], proof_data);
            }
            BaseTranscript<FF>::template serialize_to_buffer(zm_cq_comm, proof_data);
            BaseTranscript<FF>::template serialize_to_buffer(zm_pi_comm, proof_data);

            // sanity check to make sure we generate the same length of proof as before.
            ASSERT(proof_data.size() == old_proof_length);
        }
    };
};

// NOLINTEND(cppcoreguidelines-avoid-const-or-ref-data-members)

} // namespace flavor
namespace sumcheck {

extern template class GenericPermutationRelationImpl<barretenberg::fr>;

DECLARE_SUMCHECK_RELATION_CLASS(GenericPermutationRelationImpl, flavor::AVMTemplate);

} // namespace sumcheck
} // namespace proof_system::honk

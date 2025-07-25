// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/commitment_schemes/kzg/kzg.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/ecc/curves/bn254/g1.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/flavor/flavor_macros.hpp"
#include "barretenberg/flavor/repeated_commitments_data.hpp"
#include "barretenberg/honk/library/grand_product_delta.hpp"
#include "barretenberg/honk/library/grand_product_library.hpp"
#include "barretenberg/honk/types/aggregation_object_type.hpp"
#include "barretenberg/polynomials/barycentric.hpp"
#include "barretenberg/polynomials/evaluation_domain.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/polynomials/univariate.hpp"
#include "barretenberg/relations/delta_range_constraint_relation.hpp"
#include "barretenberg/relations/elliptic_relation.hpp"
#include "barretenberg/relations/logderiv_lookup_relation.hpp"
#include "barretenberg/relations/memory_relation.hpp"
#include "barretenberg/relations/non_native_field_relation.hpp"
#include "barretenberg/relations/permutation_relation.hpp"
#include "barretenberg/relations/poseidon2_external_relation.hpp"
#include "barretenberg/relations/poseidon2_internal_relation.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/relations/ultra_arithmetic_relation.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include "barretenberg/transcript/transcript.hpp"

namespace bb {

class UltraFlavor {
  public:
    using CircuitBuilder = UltraCircuitBuilder;
    using Curve = curve::BN254;
    using FF = Curve::ScalarField;
    using GroupElement = Curve::Element;
    using Commitment = Curve::AffineElement;
    using PCS = KZG<Curve>;
    using Polynomial = bb::Polynomial<FF>;
    using CommitmentKey = bb::CommitmentKey<Curve>;
    using VerifierCommitmentKey = bb::VerifierCommitmentKey<Curve>;

    // indicates when evaluating sumcheck, edges can be left as degree-1 monomials
    static constexpr bool USE_SHORT_MONOMIALS = true;

    // Indicates that this flavor runs with non-ZK Sumcheck.
    static constexpr bool HasZK = false;
    // To achieve fixed proof size and that the recursive verifier circuit is constant, we are using padding in Sumcheck
    // and Shplemini
    static constexpr bool USE_PADDING = true;
    static constexpr size_t NUM_WIRES = CircuitBuilder::NUM_WIRES;
    // The number of multivariate polynomials on which a sumcheck prover sumcheck operates (witness polynomials,
    // precomputed polynomials and shifts). We often need containers of this size to hold related data, so we choose a
    // name more agnostic than `NUM_POLYNOMIALS`.
    static constexpr size_t NUM_ALL_ENTITIES = 41;
    // The number of polynomials precomputed to describe a circuit and to aid a prover in constructing a satisfying
    // assignment of witnesses. We again choose a neutral name.
    static constexpr size_t NUM_PRECOMPUTED_ENTITIES = 28;
    // The total number of witness entities not including shifts.
    static constexpr size_t NUM_WITNESS_ENTITIES = 8;
    // Total number of folded polynomials, which is just all polynomials except the shifts
    static constexpr size_t NUM_FOLDED_ENTITIES = NUM_PRECOMPUTED_ENTITIES + NUM_WITNESS_ENTITIES;
    // The number of shifted witness entities including derived witness entities
    static constexpr size_t NUM_SHIFTED_WITNESSES = 5;

    // A container to be fed to ShpleminiVerifier to avoid redundant scalar muls
    static constexpr RepeatedCommitmentsData REPEATED_COMMITMENTS = RepeatedCommitmentsData(
        NUM_PRECOMPUTED_ENTITIES, NUM_PRECOMPUTED_ENTITIES + NUM_WITNESS_ENTITIES, NUM_SHIFTED_WITNESSES);

    // define the tuple of Relations that comprise the Sumcheck relation
    // Note: made generic for use in MegaRecursive.
    template <typename FF>

    // List of relations reflecting the Ultra arithmetisation. WARNING: As UltraKeccak flavor inherits from
    // Ultra flavor any change of ordering in this tuple needs to be reflected in the smart contract, otherwise
    // relation accumulation will not match.
    using Relations_ = std::tuple<bb::UltraArithmeticRelation<FF>,
                                  bb::UltraPermutationRelation<FF>,
                                  bb::LogDerivLookupRelation<FF>,
                                  bb::DeltaRangeConstraintRelation<FF>,
                                  bb::EllipticRelation<FF>,
                                  bb::MemoryRelation<FF>,
                                  bb::NonNativeFieldRelation<FF>,
                                  bb::Poseidon2ExternalRelation<FF>,
                                  bb::Poseidon2InternalRelation<FF>>;

    using Relations = Relations_<FF>;

    static constexpr size_t MAX_PARTIAL_RELATION_LENGTH = compute_max_partial_relation_length<Relations>();
    static_assert(MAX_PARTIAL_RELATION_LENGTH == 7);
    static constexpr size_t MAX_TOTAL_RELATION_LENGTH = compute_max_total_relation_length<Relations>();
    static_assert(MAX_TOTAL_RELATION_LENGTH == 11);
    static constexpr size_t NUM_SUBRELATIONS = compute_number_of_subrelations<Relations>();
    // For instances of this flavour, used in folding, we need a unique sumcheck batching challenge for each
    // subrelation. This is because using powers of alpha would increase the degree of Protogalaxy polynomial $G$ (the
    // combiner) too much.
    using SubrelationSeparators = std::array<FF, NUM_SUBRELATIONS - 1>;

    // BATCHED_RELATION_PARTIAL_LENGTH = algebraic degree of sumcheck relation *after* multiplying by the `pow_zeta`
    // random polynomial e.g. For \sum(x) [A(x) * B(x) + C(x)] * PowZeta(X), relation length = 2 and random relation
    // length = 3
    static constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = MAX_PARTIAL_RELATION_LENGTH + 1;
    static constexpr size_t NUM_RELATIONS = std::tuple_size_v<Relations>;

    static constexpr size_t num_frs_comm = bb::field_conversion::calc_num_bn254_frs<Commitment>();
    static constexpr size_t num_frs_fr = bb::field_conversion::calc_num_bn254_frs<FF>();
    // Proof length formula
    static constexpr size_t OINK_PROOF_LENGTH_WITHOUT_PUB_INPUTS =
        /* 1. NUM_WITNESS_ENTITIES commitments */ (NUM_WITNESS_ENTITIES * num_frs_comm);
    static constexpr size_t DECIDER_PROOF_LENGTH =
        /* 2. CONST_PROOF_SIZE_LOG_N sumcheck univariates */
        (CONST_PROOF_SIZE_LOG_N * BATCHED_RELATION_PARTIAL_LENGTH * num_frs_fr) +
        /* 3. NUM_ALL_ENTITIES sumcheck evaluations */ (NUM_ALL_ENTITIES * num_frs_fr) +
        /* 4. CONST_PROOF_SIZE_LOG_N - 1 Gemini Fold commitments */ ((CONST_PROOF_SIZE_LOG_N - 1) * num_frs_comm) +
        /* 5. CONST_PROOF_SIZE_LOG_N Gemini a evaluations */ (CONST_PROOF_SIZE_LOG_N * num_frs_fr) +
        /* 6. Shplonk Q commitment */ (num_frs_comm) +
        /* 7. KZG W commitment */ (num_frs_comm);
    static constexpr size_t PROOF_LENGTH_WITHOUT_PUB_INPUTS =
        OINK_PROOF_LENGTH_WITHOUT_PUB_INPUTS + DECIDER_PROOF_LENGTH;

    template <size_t NUM_KEYS>
    using ProtogalaxyTupleOfTuplesOfUnivariatesNoOptimisticSkipping =
        decltype(create_protogalaxy_tuple_of_tuples_of_univariates<Relations, NUM_KEYS>());
    template <size_t NUM_KEYS>
    using ProtogalaxyTupleOfTuplesOfUnivariates =
        decltype(create_protogalaxy_tuple_of_tuples_of_univariates<Relations,
                                                                   NUM_KEYS,
                                                                   /*optimised=*/true>());
    using SumcheckTupleOfTuplesOfUnivariates = decltype(create_sumcheck_tuple_of_tuples_of_univariates<Relations>());
    using TupleOfArraysOfValues = decltype(create_tuple_of_arrays_of_values<Relations>());

    // Whether or not the first row of the execution trace is reserved for 0s to enable shifts
    static constexpr bool has_zero_row = true;

    static constexpr bool is_decider = true;

    /**
     * @brief A base class labelling precomputed entities and (ordered) subsets of interest.
     * @details Used to build the proving key and verification key.
     */
    template <typename DataType_> class PrecomputedEntities {
      public:
        bool operator==(const PrecomputedEntities&) const = default;
        using DataType = DataType_;
        DEFINE_FLAVOR_MEMBERS(DataType,
                              q_m,                  // column 0
                              q_c,                  // column 1
                              q_l,                  // column 2
                              q_r,                  // column 3
                              q_o,                  // column 4
                              q_4,                  // column 5
                              q_lookup,             // column 6
                              q_arith,              // column 7
                              q_delta_range,        // column 8
                              q_elliptic,           // column 9
                              q_memory,             // column 10
                              q_nnf,                // column 11
                              q_poseidon2_external, // column 12
                              q_poseidon2_internal, // column 13
                              sigma_1,              // column 14
                              sigma_2,              // column 15
                              sigma_3,              // column 16
                              sigma_4,              // column 17
                              id_1,                 // column 18
                              id_2,                 // column 19
                              id_3,                 // column 20
                              id_4,                 // column 21
                              table_1,              // column 22
                              table_2,              // column 23
                              table_3,              // column 24
                              table_4,              // column 25
                              lagrange_first,       // column 26
                              lagrange_last)        // column 27

        static constexpr CircuitType CIRCUIT_TYPE = CircuitBuilder::CIRCUIT_TYPE;

        auto get_non_gate_selectors() { return RefArray{ q_m, q_c, q_l, q_r, q_o, q_4 }; }
        auto get_gate_selectors()
        {
            return RefArray{ q_lookup, q_arith, q_delta_range,        q_elliptic,
                             q_memory, q_nnf,   q_poseidon2_external, q_poseidon2_internal };
        }
        auto get_selectors() { return concatenate(get_non_gate_selectors(), get_gate_selectors()); }

        auto get_sigmas() { return RefArray{ sigma_1, sigma_2, sigma_3, sigma_4 }; };
        auto get_ids() { return RefArray{ id_1, id_2, id_3, id_4 }; };
        auto get_tables() { return RefArray{ table_1, table_2, table_3, table_4 }; };
    };

    /**
     * @brief Container for all witness polynomials used/constructed by the prover.
     * @details Shifts are not included here since they do not occupy their own memory.
     */
    template <typename DataType> class WitnessEntities {
      public:
        DEFINE_FLAVOR_MEMBERS(DataType,
                              w_l,                // column 0
                              w_r,                // column 1
                              w_o,                // column 2
                              w_4,                // column 3
                              z_perm,             // column 4
                              lookup_inverses,    // column 5
                              lookup_read_counts, // column 6
                              lookup_read_tags)   // column 7

        auto get_wires() { return RefArray{ w_l, w_r, w_o, w_4 }; };
        auto get_to_be_shifted() { return RefArray{ w_l, w_r, w_o, w_4, z_perm }; };

        MSGPACK_FIELDS(w_l, w_r, w_o, w_4, z_perm, lookup_inverses, lookup_read_counts, lookup_read_tags);
    };

    /**
     * @brief Class for ShitftedEntities, containing shifted witness polynomials.
     */
    template <typename DataType> class ShiftedEntities {
      public:
        DEFINE_FLAVOR_MEMBERS(DataType,
                              w_l_shift,    // column 0
                              w_r_shift,    // column 1
                              w_o_shift,    // column 2
                              w_4_shift,    // column 3
                              z_perm_shift) // column 4

        auto get_shifted() { return RefArray{ w_l_shift, w_r_shift, w_o_shift, w_4_shift, z_perm_shift }; };
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
    class AllEntities : public PrecomputedEntities<DataType>,
                        public WitnessEntities<DataType>,
                        public ShiftedEntities<DataType> {
      public:
        DEFINE_COMPOUND_GET_ALL(PrecomputedEntities<DataType>, WitnessEntities<DataType>, ShiftedEntities<DataType>)

        auto get_unshifted()
        {
            return concatenate(PrecomputedEntities<DataType>::get_all(), WitnessEntities<DataType>::get_all());
        };
        auto get_precomputed() { return PrecomputedEntities<DataType>::get_all(); }
        auto get_witness() { return WitnessEntities<DataType>::get_all(); };
    };

    /**
     * @brief A field element for each entity of the flavor. These entities represent the prover polynomials
     * evaluated at one point.
     */
    class AllValues : public AllEntities<FF> {
      public:
        using Base = AllEntities<FF>;
        using Base::Base;
    };

    /**
     * @brief A container for polynomials handles.
     */
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/966): use inheritance
    class ProverPolynomials : public AllEntities<Polynomial> {
      public:
        // Define all operations as default, except copy construction/assignment
        ProverPolynomials() = default;
        ProverPolynomials(size_t circuit_size)
        {

            PROFILE_THIS_NAME("creating empty prover polys");

            for (auto& poly : get_to_be_shifted()) {
                poly = Polynomial{ /*memory size*/ circuit_size - 1,
                                   /*largest possible index*/ circuit_size,
                                   /* offset */ 1 };
            }
            for (auto& poly : get_unshifted()) {
                if (poly.is_empty()) {
                    // Not set above
                    poly = Polynomial{ /*fully formed*/ circuit_size };
                }
            }
            set_shifted();
        }
        ProverPolynomials& operator=(const ProverPolynomials&) = delete;
        ProverPolynomials(const ProverPolynomials& o) = delete;
        ProverPolynomials(ProverPolynomials&& o) noexcept = default;
        ProverPolynomials& operator=(ProverPolynomials&& o) noexcept = default;
        ~ProverPolynomials() = default;
        [[nodiscard]] size_t get_polynomial_size() const { return q_c.size(); }
        [[nodiscard]] AllValues get_row(const size_t row_idx) const
        {
            PROFILE_THIS_NAME("UltraFlavor::get_row");
            AllValues result;
            for (auto [result_field, polynomial] : zip_view(result.get_all(), get_all())) {
                result_field = polynomial[row_idx];
            }
            return result;
        }

        [[nodiscard]] AllValues get_row_for_permutation_arg(size_t row_idx)
        {
            AllValues result;
            for (auto [result_field, polynomial] : zip_view(result.get_sigmas(), get_sigmas())) {
                result_field = polynomial[row_idx];
            }
            for (auto [result_field, polynomial] : zip_view(result.get_ids(), get_ids())) {
                result_field = polynomial[row_idx];
            }
            for (auto [result_field, polynomial] : zip_view(result.get_wires(), get_wires())) {
                result_field = polynomial[row_idx];
            }
            return result;
        }

        // Set all shifted polynomials based on their to-be-shifted counterpart
        void set_shifted()
        {
            for (auto [shifted, to_be_shifted] : zip_view(get_shifted(), get_to_be_shifted())) {
                shifted = to_be_shifted.shifted();
            }
        }

        void increase_polynomials_virtual_size(const size_t size_in)
        {
            for (auto& polynomial : this->get_all()) {
                polynomial.increase_virtual_size(size_in);
            }
        }
    };

    using PrecomputedData = PrecomputedData_<Polynomial, NUM_PRECOMPUTED_ENTITIES>;

    /**
     * @brief Derived class that defines proof structure for Ultra proofs, as well as supporting functions.
     *
     */
    template <typename Params> class Transcript_ : public BaseTranscript<Params> {
      public:
        using Base = BaseTranscript<Params>;

        // Transcript objects defined as public member variables for easy access and modification
        std::vector<FF> public_inputs;
        Commitment w_l_comm;
        Commitment w_r_comm;
        Commitment w_o_comm;
        Commitment lookup_read_counts_comm;
        Commitment lookup_read_tags_comm;
        Commitment w_4_comm;
        Commitment z_perm_comm;
        Commitment lookup_inverses_comm;
        std::vector<bb::Univariate<FF, BATCHED_RELATION_PARTIAL_LENGTH>> sumcheck_univariates;
        std::array<FF, NUM_ALL_ENTITIES> sumcheck_evaluations;
        std::vector<Commitment> gemini_fold_comms;
        std::vector<FF> gemini_fold_evals;
        Commitment shplonk_q_comm;
        Commitment kzg_w_comm;
        Transcript_() = default;

        static std::shared_ptr<Transcript_> prover_init_empty()
        {
            auto transcript = Base::prover_init_empty();
            return std::static_pointer_cast<Transcript_>(transcript);
        };

        static std::shared_ptr<Transcript_> verifier_init_empty(const std::shared_ptr<Transcript_>& transcript)
        {
            auto verifier_transcript = Base::verifier_init_empty(transcript);
            return std::static_pointer_cast<Transcript_>(verifier_transcript);
        };

        /**
         * @brief Takes a FULL Ultra proof and deserializes it into the public member variables
         * that compose the structure. Must be called in order to access the structure of the
         * proof.
         *
         */
        void deserialize_full_transcript(size_t public_input_size)
        {
            // take current proof and put them into the struct
            auto& proof_data = this->proof_data;
            size_t num_frs_read = 0;
            for (size_t i = 0; i < public_input_size; ++i) {
                public_inputs.push_back(Base::template deserialize_from_buffer<FF>(proof_data, num_frs_read));
            }
            w_l_comm = Base::template deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            w_r_comm = Base::template deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            w_o_comm = Base::template deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            lookup_read_counts_comm = Base::template deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            lookup_read_tags_comm = Base::template deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            w_4_comm = Base::template deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            lookup_inverses_comm = Base::template deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            z_perm_comm = Base::template deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            for (size_t i = 0; i < CONST_PROOF_SIZE_LOG_N; ++i) {
                sumcheck_univariates.push_back(
                    Base::template deserialize_from_buffer<bb::Univariate<FF, BATCHED_RELATION_PARTIAL_LENGTH>>(
                        proof_data, num_frs_read));
            }
            sumcheck_evaluations =
                Base::template deserialize_from_buffer<std::array<FF, NUM_ALL_ENTITIES>>(proof_data, num_frs_read);
            for (size_t i = 0; i < CONST_PROOF_SIZE_LOG_N - 1; ++i) {
                gemini_fold_comms.push_back(
                    Base::template deserialize_from_buffer<Commitment>(proof_data, num_frs_read));
            }
            for (size_t i = 0; i < CONST_PROOF_SIZE_LOG_N; ++i) {
                gemini_fold_evals.push_back(Base::template deserialize_from_buffer<FF>(proof_data, num_frs_read));
            }
            shplonk_q_comm = Base::template deserialize_from_buffer<Commitment>(proof_data, num_frs_read);

            kzg_w_comm = Base::template deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
        }

        /**
         * @brief Serializes the structure variables into a FULL Ultra proof. Should be called
         * only if deserialize_full_transcript() was called and some transcript variable was
         * modified.
         *
         */
        void serialize_full_transcript()
        {
            auto& proof_data = this->proof_data;
            size_t old_proof_length = proof_data.size();
            proof_data.clear(); // clear proof_data so the rest of the function can replace it
            for (const auto& public_input : public_inputs) {
                Base::template serialize_to_buffer(public_input, proof_data);
            }
            Base::template serialize_to_buffer(w_l_comm, proof_data);
            Base::template serialize_to_buffer(w_r_comm, proof_data);
            Base::template serialize_to_buffer(w_o_comm, proof_data);
            Base::template serialize_to_buffer(lookup_read_counts_comm, proof_data);
            Base::template serialize_to_buffer(lookup_read_tags_comm, proof_data);
            Base::template serialize_to_buffer(w_4_comm, proof_data);
            Base::template serialize_to_buffer(lookup_inverses_comm, proof_data);
            Base::template serialize_to_buffer(z_perm_comm, proof_data);
            for (size_t i = 0; i < CONST_PROOF_SIZE_LOG_N; ++i) {
                Base::template serialize_to_buffer(sumcheck_univariates[i], proof_data);
            }
            Base::template serialize_to_buffer(sumcheck_evaluations, proof_data);
            for (size_t i = 0; i < CONST_PROOF_SIZE_LOG_N - 1; ++i) {
                Base::template serialize_to_buffer(gemini_fold_comms[i], proof_data);
            }
            for (size_t i = 0; i < CONST_PROOF_SIZE_LOG_N; ++i) {
                Base::template serialize_to_buffer(gemini_fold_evals[i], proof_data);
            }
            Base::template serialize_to_buffer(shplonk_q_comm, proof_data);
            Base::template serialize_to_buffer(kzg_w_comm, proof_data);

            // sanity check to make sure we generate the same length of proof as before.
            BB_ASSERT_EQ(proof_data.size(), old_proof_length);
        }
    };

    using Transcript = Transcript_<NativeTranscriptParams>;

    /**
     * @brief The verification key is responsible for storing the commitments to the precomputed (non-witnessk)
     * polynomials used by the verifier.
     *
     * @note Note the discrepancy with what sort of data is stored here vs in the proving key. We may want to resolve
     * that, and split out separate PrecomputedPolynomials/Commitments data for clarity but also for portability of our
     * circuits.
     */
    class VerificationKey : public NativeVerificationKey_<PrecomputedEntities<Commitment>, Transcript> {
      public:
        // Serialized Verification Key length in fields
        static constexpr size_t VERIFICATION_KEY_LENGTH =
            /* 1. Metadata (log_circuit_size, num_public_inputs, pub_inputs_offset) */ (3 * num_frs_fr) +
            /* 2. NUM_PRECOMPUTED_ENTITIES commitments */ (NUM_PRECOMPUTED_ENTITIES * num_frs_comm);

        bool operator==(const VerificationKey&) const = default;
        VerificationKey() = default;
        VerificationKey(const size_t circuit_size, const size_t num_public_inputs)
            : NativeVerificationKey_(circuit_size, num_public_inputs)
        {}

        VerificationKey(const PrecomputedData& precomputed)
        {
            this->log_circuit_size = numeric::get_msb(precomputed.metadata.dyadic_size);
            this->num_public_inputs = precomputed.metadata.num_public_inputs;
            this->pub_inputs_offset = precomputed.metadata.pub_inputs_offset;

            CommitmentKey commitment_key{ precomputed.metadata.dyadic_size };
            for (auto [polynomial, commitment] : zip_view(precomputed.polynomials, this->get_all())) {
                commitment = commitment_key.commit(polynomial);
            }
        }

        // Don't statically check for object completeness.
        using MSGPACK_NO_STATIC_CHECK = std::true_type;

        // For serialising and deserialising data
        MSGPACK_FIELDS(log_circuit_size,
                       num_public_inputs,
                       pub_inputs_offset,
                       q_m,
                       q_c,
                       q_l,
                       q_r,
                       q_o,
                       q_4,
                       q_lookup,
                       q_arith,
                       q_delta_range,
                       q_elliptic,
                       q_memory,
                       q_nnf,
                       q_poseidon2_external,
                       q_poseidon2_internal,
                       sigma_1,
                       sigma_2,
                       sigma_3,
                       sigma_4,
                       id_1,
                       id_2,
                       id_3,
                       id_4,
                       table_1,
                       table_2,
                       table_3,
                       table_4,
                       lagrange_first,
                       lagrange_last);
    };

    /**
     * @brief A container for storing the partially evaluated multivariates produced by sumcheck.
     */
    class PartiallyEvaluatedMultivariates : public AllEntities<Polynomial> {
      public:
        PartiallyEvaluatedMultivariates() = default;
        PartiallyEvaluatedMultivariates(const size_t circuit_size)
        {
            PROFILE_THIS_NAME("PartiallyEvaluatedMultivariates constructor");

            // Storage is only needed after the first partial evaluation, hence polynomials of
            // size (n / 2)
            for (auto& poly : this->get_all()) {
                poly = Polynomial(circuit_size / 2);
            }
        }
        PartiallyEvaluatedMultivariates(const ProverPolynomials& full_polynomials, size_t circuit_size)
        {
            PROFILE_THIS_NAME("PartiallyEvaluatedMultivariates constructor");
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
     * @brief A container for univariates used during Protogalaxy folding and sumcheck.
     * @details During folding and sumcheck, the prover evaluates the relations on these univariates.
     */
    template <size_t LENGTH, size_t SKIP_COUNT>
    using ProverUnivariatesWithOptimisticSkipping = AllEntities<bb::Univariate<FF, LENGTH, 0, SKIP_COUNT>>;

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
            w_l = "W_L";
            w_r = "W_R";
            w_o = "W_O";
            w_4 = "W_4";
            z_perm = "Z_PERM";
            lookup_inverses = "LOOKUP_INVERSES";
            lookup_read_counts = "LOOKUP_READ_COUNTS";
            lookup_read_tags = "LOOKUP_READ_TAGS";

            q_c = "Q_C";
            q_l = "Q_L";
            q_r = "Q_R";
            q_o = "Q_O";
            q_4 = "Q_4";
            q_m = "Q_M";
            q_lookup = "Q_LOOKUP";
            q_arith = "Q_ARITH";
            q_delta_range = "Q_SORT";
            q_elliptic = "Q_ELLIPTIC";
            q_memory = "Q_MEMORY";
            q_nnf = "Q_NNF";
            q_poseidon2_external = "Q_POSEIDON2_EXTERNAL";
            q_poseidon2_internal = "Q_POSEIDON2_INTERNAL";
            sigma_1 = "SIGMA_1";
            sigma_2 = "SIGMA_2";
            sigma_3 = "SIGMA_3";
            sigma_4 = "SIGMA_4";
            id_1 = "ID_1";
            id_2 = "ID_2";
            id_3 = "ID_3";
            id_4 = "ID_4";
            table_1 = "TABLE_1";
            table_2 = "TABLE_2";
            table_3 = "TABLE_3";
            table_4 = "TABLE_4";
            lagrange_first = "LAGRANGE_FIRST";
            lagrange_last = "LAGRANGE_LAST";
        };
    };

    /**
     * @brief A container encapsulating all the commitments that the verifier receives (to precomputed polynomials and
     * witness polynomials).
     *
     */
    template <typename Commitment, typename VerificationKey>
    class VerifierCommitments_ : public AllEntities<Commitment> {
      public:
        VerifierCommitments_(const std::shared_ptr<VerificationKey>& verification_key,
                             const std::optional<WitnessEntities<Commitment>>& witness_commitments = std::nullopt)
        {
            this->q_m = verification_key->q_m;
            this->q_c = verification_key->q_c;
            this->q_l = verification_key->q_l;
            this->q_r = verification_key->q_r;
            this->q_o = verification_key->q_o;
            this->q_4 = verification_key->q_4;
            this->q_lookup = verification_key->q_lookup;
            this->q_arith = verification_key->q_arith;
            this->q_delta_range = verification_key->q_delta_range;
            this->q_elliptic = verification_key->q_elliptic;
            this->q_memory = verification_key->q_memory;
            this->q_nnf = verification_key->q_nnf;
            this->q_poseidon2_external = verification_key->q_poseidon2_external;
            this->q_poseidon2_internal = verification_key->q_poseidon2_internal;
            this->sigma_1 = verification_key->sigma_1;
            this->sigma_2 = verification_key->sigma_2;
            this->sigma_3 = verification_key->sigma_3;
            this->sigma_4 = verification_key->sigma_4;
            this->id_1 = verification_key->id_1;
            this->id_2 = verification_key->id_2;
            this->id_3 = verification_key->id_3;
            this->id_4 = verification_key->id_4;
            this->table_1 = verification_key->table_1;
            this->table_2 = verification_key->table_2;
            this->table_3 = verification_key->table_3;
            this->table_4 = verification_key->table_4;
            this->lagrange_first = verification_key->lagrange_first;
            this->lagrange_last = verification_key->lagrange_last;

            if (witness_commitments.has_value()) {
                auto commitments = witness_commitments.value();
                this->w_l = commitments.w_l;
                this->w_r = commitments.w_r;
                this->w_o = commitments.w_o;
                this->lookup_inverses = commitments.lookup_inverses;
                this->lookup_read_counts = commitments.lookup_read_counts;
                this->lookup_read_tags = commitments.lookup_read_tags;
                this->w_4 = commitments.w_4;
                this->z_perm = commitments.z_perm;
            }
        }
    }; // namespace bb
    // Specialize for Ultra (general case used in UltraRecursive).
    using VerifierCommitments = VerifierCommitments_<Commitment, VerificationKey>;
};

} // namespace bb

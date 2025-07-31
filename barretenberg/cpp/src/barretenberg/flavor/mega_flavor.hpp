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
#include "barretenberg/flavor/repeated_commitments_data.hpp"
#include "barretenberg/polynomials/univariate.hpp"
#include "barretenberg/relations/databus_lookup_relation.hpp"
#include "barretenberg/relations/delta_range_constraint_relation.hpp"
#include "barretenberg/relations/ecc_op_queue_relation.hpp"
#include "barretenberg/relations/elliptic_relation.hpp"
#include "barretenberg/relations/logderiv_lookup_relation.hpp"
#include "barretenberg/relations/memory_relation.hpp"
#include "barretenberg/relations/non_native_field_relation.hpp"
#include "barretenberg/relations/permutation_relation.hpp"
#include "barretenberg/relations/poseidon2_external_relation.hpp"
#include "barretenberg/relations/poseidon2_internal_relation.hpp"
#include "barretenberg/relations/ultra_arithmetic_relation.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"
#include "barretenberg/transcript/transcript.hpp"

namespace bb {

class MegaFlavor {
  public:
    using CircuitBuilder = MegaCircuitBuilder;
    using Curve = curve::BN254;
    using FF = Curve::ScalarField;
    using GroupElement = Curve::Element;
    using Commitment = Curve::AffineElement;
    using PCS = KZG<Curve>;
    using Polynomial = bb::Polynomial<FF>;
    using CommitmentKey = bb::CommitmentKey<Curve>;
    using VerifierCommitmentKey = bb::VerifierCommitmentKey<Curve>;
    using TraceBlocks = MegaExecutionTraceBlocks;
    using Transcript = NativeTranscript;

    // indicates when evaluating sumcheck, edges can be left as degree-1 monomials
    static constexpr bool USE_SHORT_MONOMIALS = true;
    // Indicates that this flavor runs with non-ZK Sumcheck.
    static constexpr bool HasZK = false;
    // To achieve fixed proof size and that the recursive verifier circuit is constant, we are using padding in Sumcheck
    // and Shplemini
    static constexpr bool USE_PADDING = true;
    static constexpr size_t NUM_WIRES = CircuitBuilder::NUM_WIRES;
    // The number of multivariate polynomials on which a sumcheck prover sumcheck operates (including shifts). We often
    // need containers of this size to hold related data, so we choose a name more agnostic than `NUM_POLYNOMIALS`.
    static constexpr size_t NUM_ALL_ENTITIES = 60;
    // The number of polynomials precomputed to describe a circuit and to aid a prover in constructing a satisfying
    // assignment of witnesses. We again choose a neutral name.
    static constexpr size_t NUM_PRECOMPUTED_ENTITIES = 31;
    // The total number of witness entities not including shifts.
    static constexpr size_t NUM_WITNESS_ENTITIES = 24;
    // Total number of folded polynomials, which is just all polynomials except the shifts
    static constexpr size_t NUM_FOLDED_ENTITIES = NUM_PRECOMPUTED_ENTITIES + NUM_WITNESS_ENTITIES;
    // The number of shifted witness entities including derived witness entities
    static constexpr size_t NUM_SHIFTED_WITNESSES = 5;

    static constexpr RepeatedCommitmentsData REPEATED_COMMITMENTS = RepeatedCommitmentsData(
        NUM_PRECOMPUTED_ENTITIES, NUM_PRECOMPUTED_ENTITIES + NUM_WITNESS_ENTITIES, NUM_SHIFTED_WITNESSES);

    // define the tuple of Relations that comprise the Sumcheck relation
    // Note: made generic for use in MegaRecursive.
    template <typename FF>
    using Relations_ = std::tuple<bb::UltraArithmeticRelation<FF>,
                                  bb::UltraPermutationRelation<FF>,
                                  bb::LogDerivLookupRelation<FF>,
                                  bb::DeltaRangeConstraintRelation<FF>,
                                  bb::EllipticRelation<FF>,
                                  bb::MemoryRelation<FF>,
                                  bb::NonNativeFieldRelation<FF>,
                                  bb::EccOpQueueRelation<FF>,
                                  bb::DatabusLookupRelation<FF>,
                                  bb::Poseidon2ExternalRelation<FF>,
                                  bb::Poseidon2InternalRelation<FF>>;
    using Relations = Relations_<FF>;

    static constexpr size_t MAX_PARTIAL_RELATION_LENGTH = compute_max_partial_relation_length<Relations>();
    static constexpr size_t MAX_TOTAL_RELATION_LENGTH = compute_max_total_relation_length<Relations>();
    static_assert(MAX_TOTAL_RELATION_LENGTH == 11);
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

    // For instances of this flavour, used in folding, we need a unique sumcheck batching challenges for each
    // subrelation. This is because using powers of alpha would increase the degree of Protogalaxy polynomial $G$ (the
    // combiner) too much.
    static constexpr size_t NUM_SUBRELATIONS = compute_number_of_subrelations<Relations>();
    using SubrelationSeparators = std::array<FF, NUM_SUBRELATIONS - 1>;

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
                              q_busread,            // column 6
                              q_lookup,             // column 7
                              q_arith,              // column 8
                              q_delta_range,        // column 9
                              q_elliptic,           // column 10
                              q_memory,             // column 11
                              q_nnf,                // column 12
                              q_poseidon2_external, // column 13
                              q_poseidon2_internal, // column 14
                              sigma_1,              // column 15
                              sigma_2,              // column 16
                              sigma_3,              // column 17
                              sigma_4,              // column 18
                              id_1,                 // column 19
                              id_2,                 // column 20
                              id_3,                 // column 21
                              id_4,                 // column 22
                              table_1,              // column 23
                              table_2,              // column 24
                              table_3,              // column 25
                              table_4,              // column 26
                              lagrange_first,       // column 27
                              lagrange_last,        // column 28
                              lagrange_ecc_op,      // column 29 // indicator poly for ecc op gates
                              databus_id            // column 30 // id polynomial, i.e. id_i = i
        )

        static constexpr CircuitType CIRCUIT_TYPE = CircuitBuilder::CIRCUIT_TYPE;

        auto get_non_gate_selectors() { return RefArray{ q_m, q_c, q_l, q_r, q_o, q_4 }; };
        auto get_gate_selectors()
        {
            return RefArray{
                q_busread,
                q_lookup,
                q_arith,
                q_delta_range,
                q_elliptic,
                q_memory,
                q_nnf,
                q_poseidon2_external,
                q_poseidon2_internal,
            };
        }
        auto get_selectors() { return concatenate(get_non_gate_selectors(), get_gate_selectors()); }

        auto get_sigmas() { return RefArray{ sigma_1, sigma_2, sigma_3, sigma_4 }; };
        auto get_ids() { return RefArray{ id_1, id_2, id_3, id_4 }; };
        auto get_tables() { return RefArray{ table_1, table_2, table_3, table_4 }; };
    };

    // Mega needs to expose more public classes than most flavors due to MegaRecursive reuse, but these
    // are internal:

    // WireEntities for basic witness entities
    template <typename DataType> class WireEntities {
      public:
        DEFINE_FLAVOR_MEMBERS(DataType,
                              w_l,  // column 0
                              w_r,  // column 1
                              w_o,  // column 2
                              w_4); // column 3
    };

    // DerivedEntities for derived witness entities
    template <typename DataType> class DerivedEntities {
      public:
        DEFINE_FLAVOR_MEMBERS(DataType,
                              z_perm,                         // column 4
                              lookup_inverses,                // column 5
                              lookup_read_counts,             // column 6
                              lookup_read_tags,               // column 7
                              ecc_op_wire_1,                  // column 8
                              ecc_op_wire_2,                  // column 9
                              ecc_op_wire_3,                  // column 10
                              ecc_op_wire_4,                  // column 11
                              calldata,                       // column 12
                              calldata_read_counts,           // column 13
                              calldata_read_tags,             // column 14
                              calldata_inverses,              // column 15
                              secondary_calldata,             // column 16
                              secondary_calldata_read_counts, // column 17
                              secondary_calldata_read_tags,   // column 18
                              secondary_calldata_inverses,    // column 19
                              return_data,                    // column 20
                              return_data_read_counts,        // column 21
                              return_data_read_tags,          // column 22
                              return_data_inverses);          // column 23
        auto get_to_be_shifted() { return RefArray{ z_perm }; };
    };

    /**
     * @brief Container for all witness polynomials used/constructed by the prover.
     * @details Shifts are not included here since they do not occupy their own memory.
     * Combines WireEntities + DerivedEntities.
     */
    template <typename DataType>
    class WitnessEntities : public WireEntities<DataType>, public DerivedEntities<DataType> {
      public:
        DEFINE_COMPOUND_GET_ALL(WireEntities<DataType>, DerivedEntities<DataType>)

        auto get_wires() { return WireEntities<DataType>::get_all(); };
        auto get_ecc_op_wires()
        {
            return RefArray{ this->ecc_op_wire_1, this->ecc_op_wire_2, this->ecc_op_wire_3, this->ecc_op_wire_4 };
        }
        auto get_databus_entities() // Excludes the derived inverse polynomials
        {
            return RefArray{
                this->calldata,           this->calldata_read_counts,           this->calldata_read_tags,
                this->secondary_calldata, this->secondary_calldata_read_counts, this->secondary_calldata_read_tags,
                this->return_data,        this->return_data_read_counts,        this->return_data_read_tags
            };
        }

        auto get_databus_inverses()
        {
            return RefArray{
                this->calldata_inverses,
                this->secondary_calldata_inverses,
                this->return_data_inverses,
            };
        }
        auto get_to_be_shifted()
        {
            return concatenate(WireEntities<DataType>::get_all(), DerivedEntities<DataType>::get_to_be_shifted());
        }

        MSGPACK_FIELDS(this->w_l,
                       this->w_r,
                       this->w_o,
                       this->w_4,
                       this->z_perm,
                       this->lookup_inverses,
                       this->lookup_read_counts,
                       this->lookup_read_tags,
                       this->ecc_op_wire_1,
                       this->ecc_op_wire_2,
                       this->ecc_op_wire_3,
                       this->ecc_op_wire_4,
                       this->calldata,
                       this->calldata_read_counts,
                       this->calldata_read_tags,
                       this->calldata_inverses,
                       this->secondary_calldata,
                       this->secondary_calldata_read_counts,
                       this->secondary_calldata_read_tags,
                       this->secondary_calldata_inverses,
                       this->return_data,
                       this->return_data_read_counts,
                       this->return_data_read_tags,
                       this->return_data_inverses);
    };

    /**
     * @brief Class for ShiftedEntities, containing the shifted witness polynomials.
     */
    template <typename DataType> class ShiftedEntities {
      public:
        DEFINE_FLAVOR_MEMBERS(DataType,
                              w_l_shift,    // column 0
                              w_r_shift,    // column 1
                              w_o_shift,    // column 2
                              w_4_shift,    // column 3
                              z_perm_shift) // column 4
    };

  public:
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
            PROFILE_THIS_NAME("ProverPolynomials(size_t)");

            for (auto& poly : get_to_be_shifted()) {
                poly = Polynomial{ /*memory size*/ circuit_size - 1,
                                   /*largest possible index*/ circuit_size,
                                   /* offset */ 1 };
            }
            // catch-all with fully formed polynomials
            for (auto& poly : get_unshifted()) {
                if (poly.is_empty()) {
                    // Not set above
                    poly = Polynomial{ /*memory size*/ circuit_size, /*largest possible index*/ circuit_size };
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
        [[nodiscard]] AllValues get_row(size_t row_idx) const
        {
            PROFILE_THIS_NAME("MegaFlavor::get_row");
            AllValues result;
            for (auto [result_field, polynomial] : zip_view(result.get_all(), this->get_all())) {
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
     * @brief The verification key is responsible for storing the commitments to the precomputed (non-witness)
     * polynomials used by the verifier.
     *
     * @note Note the discrepancy with what sort of data is stored here vs in the proving key. We may want to resolve
     * that, and split out separate PrecomputedPolynomials/Commitments data for clarity but also for portability of our
     * circuits.
     * @todo TODO(https://github.com/AztecProtocol/barretenberg/issues/876)
     */
    class VerificationKey : public NativeVerificationKey_<PrecomputedEntities<Commitment>, Transcript> {
      public:
        // Serialized Verification Key length in fields
        static constexpr size_t VERIFICATION_KEY_LENGTH =
            /* 1. Metadata (log_circuit_size, num_public_inputs, pub_inputs_offset) */ (3 * num_frs_fr) +
            /* 2. NUM_PRECOMPUTED_ENTITIES commitments */ (NUM_PRECOMPUTED_ENTITIES * num_frs_comm);

        VerificationKey() = default;
        VerificationKey(const size_t circuit_size, const size_t num_public_inputs)
            : NativeVerificationKey_(circuit_size, num_public_inputs)
        {}

        VerificationKey(const VerificationKey& vk) = default;

        void set_metadata(const MetaData& metadata)
        {
            this->log_circuit_size = numeric::get_msb(metadata.dyadic_size);
            this->num_public_inputs = metadata.num_public_inputs;
            this->pub_inputs_offset = metadata.pub_inputs_offset;
        }

        VerificationKey(const PrecomputedData& precomputed)
        {
            set_metadata(precomputed.metadata);

            CommitmentKey commitment_key{ precomputed.metadata.dyadic_size };
            for (auto [polynomial, commitment] : zip_view(precomputed.polynomials, this->get_all())) {
                commitment = commitment_key.commit(polynomial);
            }
        }

        // Don't statically check for object completeness.
        using MSGPACK_NO_STATIC_CHECK = std::true_type;
        MSGPACK_FIELDS(log_circuit_size,
                       num_public_inputs,
                       pub_inputs_offset,
                       q_m,
                       q_c,
                       q_l,
                       q_r,
                       q_o,
                       q_4,
                       q_busread,
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
                       lagrange_last,
                       lagrange_ecc_op,
                       databus_id);
    };
    /**
     * @brief A container for storing the partially evaluated multivariates produced by sumcheck.
     */
    class PartiallyEvaluatedMultivariates : public AllEntities<Polynomial> {

      public:
        PartiallyEvaluatedMultivariates() = default;
        PartiallyEvaluatedMultivariates(const size_t circuit_size)
        {
            // Storage is only needed after the first partial evaluation, hence polynomials of size (n / 2)
            for (auto& poly : this->get_all()) {
                poly = Polynomial(circuit_size / 2);
            }
        }
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
     * @brief A container for univariates used during Protogalaxy folding and sumcheck with some of the computation
     * optmistically ignored.
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
            ecc_op_wire_1 = "ECC_OP_WIRE_1";
            ecc_op_wire_2 = "ECC_OP_WIRE_2";
            ecc_op_wire_3 = "ECC_OP_WIRE_3";
            ecc_op_wire_4 = "ECC_OP_WIRE_4";
            calldata = "CALLDATA";
            calldata_read_counts = "CALLDATA_READ_COUNTS";
            calldata_read_tags = "CALLDATA_READ_TAGS";
            calldata_inverses = "CALLDATA_INVERSES";
            secondary_calldata = "SECONDARY_CALLDATA";
            secondary_calldata_read_counts = "SECONDARY_CALLDATA_READ_COUNTS";
            secondary_calldata_read_tags = "SECONDARY_CALLDATA_READ_TAGS";
            secondary_calldata_inverses = "SECONDARY_CALLDATA_INVERSES";
            return_data = "RETURN_DATA";
            return_data_read_counts = "RETURN_DATA_READ_COUNTS";
            return_data_read_tags = "RETURN_DATA_READ_TAGS";
            return_data_inverses = "RETURN_DATA_INVERSES";

            q_c = "Q_C";
            q_l = "Q_L";
            q_r = "Q_R";
            q_o = "Q_O";
            q_4 = "Q_4";
            q_m = "Q_M";
            q_busread = "Q_BUSREAD";
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
            lagrange_ecc_op = "Q_ECC_OP_QUEUE";
        };
    };

    /**
     * Note: Made generic for use in MegaRecursive.
     **/
    template <typename Commitment, typename VerificationKey>
    class VerifierCommitments_ : public AllEntities<Commitment> {
      public:
        VerifierCommitments_(const std::shared_ptr<VerificationKey>& verification_key,
                             const std::optional<WitnessEntities<Commitment>>& witness_commitments = std::nullopt)
        {
            // Copy the precomputed polynomial commitments into this
            for (auto [precomputed, precomputed_in] : zip_view(this->get_precomputed(), verification_key->get_all())) {
                precomputed = precomputed_in;
            }

            // If provided, copy the witness polynomial commitments into this
            if (witness_commitments.has_value()) {
                for (auto [witness, witness_in] :
                     zip_view(this->get_witness(), witness_commitments.value().get_all())) {
                    witness = witness_in;
                }
            }
        }
    };
    // Specialize for Mega (general case used in MegaRecursive).
    using VerifierCommitments = VerifierCommitments_<Commitment, VerificationKey>;
};

} // namespace bb

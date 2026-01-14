// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/commitment_schemes/kzg/kzg.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/ecc/curves/bn254/g1.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/flavor/flavor_macros.hpp"
#include "barretenberg/flavor/partially_evaluated_multivariates.hpp"
#include "barretenberg/flavor/repeated_commitments_data.hpp"
#include "barretenberg/honk/library/grand_product_delta.hpp"
#include "barretenberg/honk/library/grand_product_library.hpp"
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
    using Codec = FrCodec;
    using HashFunction = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>;
    using Transcript = BaseTranscript<Codec, HashFunction>;

    static constexpr size_t VIRTUAL_LOG_N = CONST_PROOF_SIZE_LOG_N;
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
    // The number of shifted witness entities including derived witness entities
    static constexpr size_t NUM_SHIFTED_ENTITIES = 5;
    // The number of unshifted witness entities
    static constexpr size_t NUM_UNSHIFTED_ENTITIES = NUM_PRECOMPUTED_ENTITIES + NUM_WITNESS_ENTITIES;

    // A container to be fed to ShpleminiVerifier to avoid redundant scalar muls
    static constexpr RepeatedCommitmentsData REPEATED_COMMITMENTS = RepeatedCommitmentsData(
        NUM_PRECOMPUTED_ENTITIES, NUM_PRECOMPUTED_ENTITIES + NUM_WITNESS_ENTITIES, NUM_SHIFTED_ENTITIES);

    // Size of the final PCS MSM after KZG adds quotient commitment:
    // 1 (Shplonk Q) + NUM_UNSHIFTED + (log_n - 1) Gemini folds + 1 (G1 identity) + 1 (KZG W)
    // (shifted commitments are removed as duplicates)
    static constexpr size_t FINAL_PCS_MSM_SIZE(size_t log_n = VIRTUAL_LOG_N)
    {
        return NUM_UNSHIFTED_ENTITIES + log_n + 2;
    }

    // define the tuple of Relations that comprise the Sumcheck relation
    // Note: made generic for use in MegaRecursive.
    template <typename FF>

    // List of relations reflecting the Ultra arithmetisation. WARNING: As UltraKeccak flavor inherits from
    // Ultra flavor any change of ordering in this tuple needs to be reflected in the smart contract, otherwise
    // relation accumulation will not match.
    using Relations_ = std::tuple<bb::ArithmeticRelation<FF>,
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
    static constexpr size_t NUM_SUBRELATIONS = compute_number_of_subrelations<Relations>();
    // A challenge whose powers are used to batch subrelation contributions during Sumcheck
    using SubrelationSeparator = FF;

    // BATCHED_RELATION_PARTIAL_LENGTH = algebraic degree of sumcheck relation *after* multiplying by the `pow_zeta`
    // random polynomial e.g. For \sum(x) [A(x) * B(x) + C(x)] * PowZeta(X), relation length = 2 and random relation
    // length = 3
    static constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = MAX_PARTIAL_RELATION_LENGTH + 1;
    static constexpr size_t NUM_RELATIONS = std::tuple_size_v<Relations>;

    static constexpr size_t num_frs_comm = FrCodec::calc_num_fields<Commitment>();
    static constexpr size_t num_frs_fr = FrCodec::calc_num_fields<FF>();

    // Proof length formula methods
    static constexpr size_t OINK_PROOF_LENGTH_WITHOUT_PUB_INPUTS =
        /* 1. NUM_WITNESS_ENTITIES commitments */ (NUM_WITNESS_ENTITIES * num_frs_comm);

    static constexpr size_t DECIDER_PROOF_LENGTH(size_t virtual_log_n = VIRTUAL_LOG_N)
    {
        return /* 2. virtual_log_n sumcheck univariates */
            (virtual_log_n * BATCHED_RELATION_PARTIAL_LENGTH * num_frs_fr) +
            /* 3. NUM_ALL_ENTITIES sumcheck evaluations */ (NUM_ALL_ENTITIES * num_frs_fr) +
            /* 4. virtual_log_n - 1 Gemini Fold commitments */ ((virtual_log_n - 1) * num_frs_comm) +
            /* 5. virtual_log_n Gemini a evaluations */ (virtual_log_n * num_frs_fr) +
            /* 6. Shplonk Q commitment */ (num_frs_comm) +
            /* 7. KZG W commitment */ (num_frs_comm);
    }

    static constexpr size_t PROOF_LENGTH_WITHOUT_PUB_INPUTS(size_t virtual_log_n = VIRTUAL_LOG_N)
    {
        return OINK_PROOF_LENGTH_WITHOUT_PUB_INPUTS + DECIDER_PROOF_LENGTH(virtual_log_n);
    }

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
     * @brief ZK-specific entities (only used when HasZK = true)
     * @details Contains the Gemini masking polynomial used for zero-knowledge
     */
    template <typename DataType, bool HasZK_ = HasZK> class MaskingEntities {
      public:
        // When ZK is disabled, this class is empty
        auto get_all() { return RefArray<DataType, 0>{}; }
        auto get_all() const { return RefArray<const DataType, 0>{}; }
        static auto get_labels() { return std::vector<std::string>{}; }
    };

    // Specialization for when ZK is enabled
    template <typename DataType> class MaskingEntities<DataType, true> {
      public:
        DEFINE_FLAVOR_MEMBERS(DataType, gemini_masking_poly)
    };

    /**
     * @brief Base witness entities
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
    template <typename DataType, bool HasZK_ = HasZK>
    class AllEntities_ : public MaskingEntities<DataType, HasZK_>,
                         public PrecomputedEntities<DataType>,
                         public WitnessEntities<DataType>,
                         public ShiftedEntities<DataType> {
      public:
        DEFINE_COMPOUND_GET_ALL(MaskingEntities<DataType, HasZK_>,
                                PrecomputedEntities<DataType>,
                                WitnessEntities<DataType>,
                                ShiftedEntities<DataType>)

        auto get_unshifted()
        {
            return concatenate(MaskingEntities<DataType, HasZK_>::get_all(),
                               PrecomputedEntities<DataType>::get_all(),
                               WitnessEntities<DataType>::get_all());
        };
        auto get_precomputed() { return PrecomputedEntities<DataType>::get_all(); }
        auto get_witness() { return WitnessEntities<DataType>::get_all(); };
        auto get_witness() const { return WitnessEntities<DataType>::get_all(); };
    };

    // Default AllEntities alias (no ZK)
    template <typename DataType> using AllEntities = AllEntities_<DataType, HasZK>;

    /**
     * @brief A field element for each entity of the flavor. These entities represent the prover polynomials
     * evaluated at one point.
     */
    template <bool HasZK_ = HasZK> class AllValues_ : public AllEntities_<FF, HasZK_> {
      public:
        using Base = AllEntities_<FF, HasZK_>;
        using Base::Base;
    };

    using AllValues = AllValues_<HasZK>;

    /**
     * @brief A container for polynomials handles.
     */
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/966): use inheritance
    template <bool HasZK_ = HasZK> class ProverPolynomials_ : public AllEntities_<Polynomial, HasZK_> {
      public:
        // Define all operations as default, except copy construction/assignment
        ProverPolynomials_() = default;
        ProverPolynomials_(size_t circuit_size)
        {

            BB_BENCH_NAME("creating empty prover polys");

            for (auto& poly : this->get_to_be_shifted()) {
                poly = Polynomial{ /*memory size*/ circuit_size - 1,
                                   /*largest possible index*/ circuit_size,
                                   /* offset */ 1 };
            }
            for (auto& poly : this->get_unshifted()) {
                if (poly.is_empty()) {
                    // Not set above
                    poly = Polynomial{ /*fully formed*/ circuit_size };
                }
            }
            set_shifted();
        }
        ProverPolynomials_& operator=(const ProverPolynomials_&) = delete;
        ProverPolynomials_(const ProverPolynomials_& o) = delete;
        ProverPolynomials_(ProverPolynomials_&& o) noexcept = default;
        ProverPolynomials_& operator=(ProverPolynomials_&& o) noexcept = default;
        ~ProverPolynomials_() = default;
        [[nodiscard]] size_t get_polynomial_size() const { return this->q_c.size(); }
        [[nodiscard]] AllValues_<HasZK_> get_row(const size_t row_idx) const
        {
            AllValues_<HasZK_> result;
            for (auto [result_field, polynomial] : zip_view(result.get_all(), this->get_all())) {
                result_field = polynomial[row_idx];
            }
            return result;
        }

        [[nodiscard]] AllValues_<HasZK_> get_row_for_permutation_arg(size_t row_idx)
        {
            AllValues_<HasZK_> result;
            for (auto [result_field, polynomial] : zip_view(result.get_sigmas(), this->get_sigmas())) {
                result_field = polynomial[row_idx];
            }
            for (auto [result_field, polynomial] : zip_view(result.get_ids(), this->get_ids())) {
                result_field = polynomial[row_idx];
            }
            for (auto [result_field, polynomial] : zip_view(result.get_wires(), this->get_wires())) {
                result_field = polynomial[row_idx];
            }
            return result;
        }

        // Set all shifted polynomials based on their to-be-shifted counterpart
        void set_shifted()
        {
            for (auto [shifted, to_be_shifted] : zip_view(this->get_shifted(), this->get_to_be_shifted())) {
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

    using ProverPolynomials = ProverPolynomials_<HasZK>;

    using PrecomputedData = PrecomputedData_<Polynomial, NUM_PRECOMPUTED_ENTITIES>;

    /**
     * @brief The verification key is responsible for storing the commitments to the precomputed (non-witnessk)
     * polynomials used by the verifier.
     *
     * @note Note the discrepancy with what sort of data is stored here vs in the proving key. We may want to resolve
     * that, and split out separate PrecomputedPolynomials/Commitments data for clarity but also for portability of our
     * circuits.
     */
    using VerificationKey = NativeVerificationKey_<PrecomputedEntities<Commitment>, Codec, HashFunction, CommitmentKey>;

    using VKAndHash = VKAndHash_<FF, VerificationKey>;

    /**
     * @brief A container for storing the partially evaluated multivariates produced by sumcheck.
     */
    template <bool HasZK_ = HasZK>
    using PartiallyEvaluatedMultivariates_ =
        PartiallyEvaluatedMultivariatesBase<AllEntities_<Polynomial, HasZK_>, ProverPolynomials_<HasZK_>, Polynomial>;

    using PartiallyEvaluatedMultivariates = PartiallyEvaluatedMultivariates_<HasZK>;

    /**
     * @brief A container for univariates used in sumcheck.
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
    template <typename Commitment, typename VerificationKey, bool HasZK_ = HasZK>
    class VerifierCommitments_ : public AllEntities_<Commitment, HasZK_> {
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

                // Set shifted commitments
                this->w_l_shift = witness_commitments->w_l;
                this->w_r_shift = witness_commitments->w_r;
                this->w_o_shift = witness_commitments->w_o;
                this->w_4_shift = witness_commitments->w_4;
                this->z_perm_shift = witness_commitments->z_perm;
            }
        }
    }; // namespace bb
    // Specialize for Ultra (general case used in UltraRecursive).
    using VerifierCommitments = VerifierCommitments_<Commitment, VerificationKey, HasZK>;
};

} // namespace bb

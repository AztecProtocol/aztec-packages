// === AUDIT STATUS ===
// internal:    { status: Completed, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/commitment_schemes/kzg/kzg.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/flavor/flavor_macros.hpp"
#include "barretenberg/flavor/mega_interleaving_entities.hpp"
#include "barretenberg/flavor/partially_evaluated_multivariates.hpp"
#include "barretenberg/flavor/prover_polynomials.hpp"
#include "barretenberg/flavor/repeated_commitments_data.hpp"
#include "barretenberg/flavor/ultra_interleaving_entities.hpp"
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
#include "barretenberg/relations/relation_tuple_helpers.hpp"
#include "barretenberg/relations/ultra_arithmetic_relation.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include "barretenberg/transcript/transcript.hpp"

namespace bb {

/**
 * @brief The Ultra proving system flavor, parameterized on interleaving batch size.
 *
 * @details UltraFlavor_<1> (aliased as UltraFlavor) commits polynomials individually.
 *          UltraFlavor_<2> (aliased as DualUltraFlavor) batches 2 polynomials per interleaved
 *          commitment, reducing witness commitments from 8 to 5.
 *
 * @tparam BATCH_SIZE_ The number of polynomials interleaved per commitment (1 or 2).
 */
template <size_t BATCH_SIZE_ = 1> class UltraFlavor_ {
  public:
    using CircuitBuilder = UltraCircuitBuilder;
    using Curve = curve::BN254;
    using FF = Curve::ScalarField;
    using GroupElement = Curve::Element;
    using Commitment = Curve::AffineElement;
    using PCS = KZG<Curve>;
    using Polynomial = bb::Polynomial<FF>;
    using CommitmentKey = bb::CommitmentKey<Curve>;
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

    // Interleaving parameters
    static constexpr size_t INTERLEAVING_BATCH_SIZE = BATCH_SIZE_;
    static constexpr size_t INTERLEAVING_LOG_K = (BATCH_SIZE_ <= 1) ? 0 : (BATCH_SIZE_ <= 2) ? 1 : 2;

    static constexpr size_t NUM_WIRES = CircuitBuilder::NUM_WIRES;

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

    static constexpr size_t SHPLEMINI_OFFSET = 1; // Shplonk:Q

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
        auto get_to_be_shifted() const { return RefArray{ w_l, w_r, w_o, w_4, z_perm }; };
        auto get_shiftable() { return get_to_be_shifted(); }
        auto get_shiftable() const { return get_to_be_shifted(); }
        // All witness entities are masked in ZK mode
        auto get_masked() { return get_all(); }
        auto get_masked() const { return get_all(); }
    };

    /**
     * @brief Class for ShiftedEntities, containing shifted witness polynomials.
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
        auto get_shifted() const { return RefArray{ w_l_shift, w_r_shift, w_o_shift, w_4_shift, z_perm_shift }; };
    };

    /**
     * @brief A base class labelling all entities (for instance, all of the polynomials used by the prover during
     * sumcheck) in this Honk variant along with particular subsets of interest
     * @details Used to build containers for: the prover's polynomial during sumcheck; the sumcheck's folded
     * polynomials; the univariates constructed during sumcheck; the evaluations produced by sumcheck.
     *
     * Symbolically we have: AllEntities = MaskingEntities + PrecomputedEntities + WitnessEntities + ShiftedEntities.
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
        auto get_unshifted() const
        {
            return concatenate(MaskingEntities<DataType, HasZK_>::get_all(),
                               PrecomputedEntities<DataType>::get_all(),
                               WitnessEntities<DataType>::get_all());
        };
        auto get_precomputed() { return PrecomputedEntities<DataType>::get_all(); }
        auto get_witness() { return WitnessEntities<DataType>::get_all(); };
        auto get_witness() const { return WitnessEntities<DataType>::get_all(); };
        auto get_shifted() { return ShiftedEntities<DataType>::get_all(); };
        auto get_shifted() const { return ShiftedEntities<DataType>::get_all(); };
        auto get_to_be_shifted() { return WitnessEntities<DataType>::get_to_be_shifted(); }
        auto get_to_be_shifted() const { return WitnessEntities<DataType>::get_to_be_shifted(); }
    };

    // Default AllEntities alias (no ZK)
    template <typename DataType> using AllEntities = AllEntities_<DataType, HasZK>;

    // Derive entity counts from the actual struct definitions
    static constexpr size_t NUM_PRECOMPUTED_ENTITIES = PrecomputedEntities<FF>::_members_size;
    static constexpr size_t NUM_WITNESS_ENTITIES = WitnessEntities<FF>::_members_size;
    static constexpr size_t NUM_SHIFTED_ENTITIES = ShiftedEntities<FF>::_members_size;
    static constexpr size_t NUM_UNSHIFTED_ENTITIES = NUM_PRECOMPUTED_ENTITIES + NUM_WITNESS_ENTITIES;
    static constexpr size_t NUM_ALL_ENTITIES = NUM_UNSHIFTED_ENTITIES + NUM_SHIFTED_ENTITIES;

    // ================================================================
    // Interleaving group accessors (Ultra-specific, BS-dependent)
    // ================================================================

    template <typename FF_> static auto compute_lagrange_basis(std::span<const FF_> interleaving_challenges)
    {
        return compute_lagrange_basis_impl<BATCH_SIZE_>(interleaving_challenges);
    }

    template <typename Entities> static auto get_unshifted_groups(Entities& e)
    {
        return UltraGroupAccessors_<BATCH_SIZE_>::template get_unshifted_groups<true>(e);
    }

    template <typename Entities> static auto get_unshifted_groups_mut(Entities& e)
    {
        return UltraGroupAccessors_<BATCH_SIZE_>::template get_unshifted_groups<false>(e);
    }

    template <typename Entities> static auto get_to_be_shifted_groups(Entities& e)
    {
        return UltraGroupAccessors_<BATCH_SIZE_>::get_to_be_shifted_groups(e);
    }

    template <typename Entities> static auto get_shifted_groups(Entities& e)
    {
        return UltraGroupAccessors_<BATCH_SIZE_>::get_shifted_groups(e);
    }

    // Oink round group descriptors (Ultra-specific, BS-dependent)
    using OinkRounds = UltraOinkWitnessRounds_<BATCH_SIZE_>;

    // ================================================================
    // BATCH_SIZE-dependent constants (via UltraInterleavingConstants_)
    // ================================================================

    using IC = UltraInterleavingConstants_<BATCH_SIZE_>;

    static constexpr size_t NUM_INTERLEAVED_PRECOMPUTED_COMMITMENTS = IC::NUM_INTERLEAVED_PRECOMPUTED_COMMITMENTS;
    static constexpr size_t NUM_INTERLEAVED_WITNESS_COMMITMENTS = IC::NUM_INTERLEAVED_WITNESS_COMMITMENTS;
    static constexpr size_t NUM_ALL_INTERLEAVED_COMMITMENTS = IC::NUM_ALL_INTERLEAVED_COMMITMENTS;
    static constexpr size_t NUM_SHIFTABLE_INTERLEAVED_COMMITMENTS = IC::NUM_SHIFTABLE_INTERLEAVED_COMMITMENTS;

    static constexpr RepeatedCommitmentsData REPEATED_COMMITMENTS =
        IC::make_repeated_commitments(NUM_PRECOMPUTED_ENTITIES, NUM_UNSHIFTED_ENTITIES, NUM_SHIFTED_ENTITIES);

    static constexpr size_t FINAL_PCS_MSM_SIZE(size_t log_n = VIRTUAL_LOG_N)
    {
        return IC::final_pcs_msm_size(NUM_UNSHIFTED_ENTITIES, log_n);
    }

    // ================================================================
    // Interleaved entity type aliases (from ultra_interleaving_entities.hpp)
    // ================================================================

    template <typename DataType>
    using InterleavedWitnessCommitments_ = UltraInterleavedWitnessCommitments_<DataType, BATCH_SIZE_>;
    template <typename DataType> using InterleavedWitnessCommitments = InterleavedWitnessCommitments_<DataType>;
    using InterleavedCommitments = InterleavedWitnessCommitments<Commitment>;

    template <typename DataType_>
    using InterleavedPrecomputedCommitments = UltraInterleavedPrecomputedCommitments_<DataType_, BATCH_SIZE_>;
    using InterleavedPrecomputed = InterleavedPrecomputedCommitments<Commitment>;

    using InterleavedCommitmentLabels = UltraInterleavedCommitmentLabels_<BATCH_SIZE_>;
    using InterleavedPrecomputedLabels = UltraInterleavedPrecomputedLabels_<BATCH_SIZE_>;

    // ================================================================
    // AllValues, ProverPolynomials
    // ================================================================

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
    template <bool HasZK_ = HasZK>
    using ProverPolynomials_ = ProverPolynomialsBase<AllEntities_<Polynomial, HasZK_>, AllValues_<HasZK_>, Polynomial>;

    using ProverPolynomials = ProverPolynomials_<HasZK>;

    using PrecomputedData = PrecomputedData_<Polynomial, NUM_PRECOMPUTED_ENTITIES>;

    // ================================================================
    // Verification Key
    // ================================================================

    using VKPrecomputedType =
        typename UltraVKPrecomputedType_<BATCH_SIZE_, Commitment, PrecomputedEntities<Commitment>>::type;

    using VerificationKey = NativeVerificationKey_<VKPrecomputedType, Codec, HashFunction, CommitmentKey, BATCH_SIZE_>;

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
            this->w_l = "W_L";
            this->w_r = "W_R";
            this->w_o = "W_O";
            this->w_4 = "W_4";
            this->z_perm = "Z_PERM";
            this->lookup_inverses = "LOOKUP_INVERSES";
            this->lookup_read_counts = "LOOKUP_READ_COUNTS";
            this->lookup_read_tags = "LOOKUP_READ_TAGS";

            this->q_c = "Q_C";
            this->q_l = "Q_L";
            this->q_r = "Q_R";
            this->q_o = "Q_O";
            this->q_4 = "Q_4";
            this->q_m = "Q_M";
            this->q_lookup = "Q_LOOKUP";
            this->q_arith = "Q_ARITH";
            this->q_delta_range = "Q_SORT";
            this->q_elliptic = "Q_ELLIPTIC";
            this->q_memory = "Q_MEMORY";
            this->q_nnf = "Q_NNF";
            this->q_poseidon2_external = "Q_POSEIDON2_EXTERNAL";
            this->q_poseidon2_internal = "Q_POSEIDON2_INTERNAL";
            this->sigma_1 = "SIGMA_1";
            this->sigma_2 = "SIGMA_2";
            this->sigma_3 = "SIGMA_3";
            this->sigma_4 = "SIGMA_4";
            this->id_1 = "ID_1";
            this->id_2 = "ID_2";
            this->id_3 = "ID_3";
            this->id_4 = "ID_4";
            this->table_1 = "TABLE_1";
            this->table_2 = "TABLE_2";
            this->table_3 = "TABLE_3";
            this->table_4 = "TABLE_4";
            this->lagrange_first = "LAGRANGE_FIRST";
            this->lagrange_last = "LAGRANGE_LAST";
        };
    };

    // ================================================================
    // VerifierCommitments_
    // ================================================================

    template <typename Commitment_, typename VerificationKey_, bool HasZK_ = HasZK>
    class VerifierCommitments_ : public AllEntities_<Commitment_, HasZK_> {
      public:
        VerifierCommitments_(const std::shared_ptr<VerificationKey_>& verification_key,
                             const std::optional<WitnessEntities<Commitment_>>& witness_commitments = std::nullopt)
        {
            UltraVerifierCommitmentsInit_<BATCH_SIZE_>::init(*this, verification_key, witness_commitments);
        }
    };
    // Specialize for Ultra (general case used in UltraRecursive).
    using VerifierCommitments = VerifierCommitments_<Commitment, VerificationKey, HasZK>;
};

// ============================================================
// Type aliases
// ============================================================

using UltraFlavor = UltraFlavor_<1>;
using DualUltraFlavor = UltraFlavor_<2>;

} // namespace bb

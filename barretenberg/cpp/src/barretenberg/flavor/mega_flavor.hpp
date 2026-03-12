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
#include "barretenberg/relations/relation_tuple_helpers.hpp"
#include "barretenberg/relations/ultra_arithmetic_relation.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"
#include "barretenberg/transcript/transcript.hpp"

namespace bb {

// ============================================================
// MegaFlavor_ template class
// ============================================================

/**
 * @brief The Mega proving system flavor, parameterized on interleaving batch size.
 *
 * @details MegaFlavor_<1> (aliased as MegaFlavor) commits polynomials individually.
 *          MegaFlavor_<4> (aliased as MultiMegaFlavor) batches 4 polynomials per interleaved
 *          commitment, reducing witness commitments from 24 to 11.
 *
 * @tparam BATCH_SIZE_ The number of polynomials interleaved per commitment (1 or 4).
 */
template <size_t BATCH_SIZE_ = 1> class MegaFlavor_ {
  public:
    using CircuitBuilder = MegaCircuitBuilder;
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

    // An upper bound on the size of the Mega-circuits. `CONST_FOLDING_LOG_N` bounds the log circuit sizes in the Chonk
    // context.
    static constexpr size_t VIRTUAL_LOG_N = CONST_FOLDING_LOG_N;
    // indicates when evaluating sumcheck, edges can be left as degree-1 monomials
    static constexpr bool USE_SHORT_MONOMIALS = true;
    // Indicates that this flavor runs with non-ZK Sumcheck.
    static constexpr bool HasZK = false;
    // To achieve fixed proof size and that the recursive verifier circuit is constant, we are using padding in Sumcheck
    // and Shplemini
    static constexpr bool USE_PADDING = true;

    // Interleaving parameters
    static constexpr size_t INTERLEAVING_BATCH_SIZE = BATCH_SIZE_;
    // log2(BATCH_SIZE): number of extra Gemini rounds for interleaving
    static constexpr size_t INTERLEAVING_LOG_K = (BATCH_SIZE_ <= 1)   ? 0
                                                 : (BATCH_SIZE_ <= 2) ? 1
                                                 : (BATCH_SIZE_ <= 4) ? 2
                                                                      : 3;

    static constexpr size_t NUM_WIRES = CircuitBuilder::NUM_WIRES;

    // define the tuple of Relations that comprise the Sumcheck relation
    // Note: made generic for use in MegaRecursive.
    template <typename FF>
    using Relations_ = std::tuple<bb::ArithmeticRelation<FF>,
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
    // BATCHED_RELATION_PARTIAL_LENGTH = algebraic degree of sumcheck relation *after* multiplying by the `pow_zeta`
    // random polynomial e.g. For \sum(x) [A(x) * B(x) + C(x)] * PowZeta(X), relation length = 2 and random relation
    // length = 3
    static constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = MAX_PARTIAL_RELATION_LENGTH + 1;
    static constexpr size_t NUM_RELATIONS = std::tuple_size_v<Relations>;

    static constexpr size_t num_frs_comm = FrCodec::calc_num_fields<Commitment>();
    static constexpr size_t num_frs_fr = FrCodec::calc_num_fields<FF>();

    // A challenge whose powers are used to batch subrelation contributions during Sumcheck
    static constexpr size_t NUM_SUBRELATIONS = compute_number_of_subrelations<Relations>();
    using SubrelationSeparator = FF;

    // ================================================================
    // Entity classes (same for all BATCH_SIZE values)
    // ================================================================

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
     * Combines WireEntities + DerivedEntities. ZK entities are added separately in AllEntities_.
     */
    template <typename DataType>
    class WitnessEntities_ : public WireEntities<DataType>, public DerivedEntities<DataType> {
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
    };

    // Default WitnessEntities alias
    template <typename DataType> using WitnessEntities = WitnessEntities_<DataType>;

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

    // ================================================================
    // Masking entities (BATCH_SIZE-dependent via external specialization)
    // ================================================================

    template <typename DataType, bool HasZK_ = HasZK>
    using MaskingEntities = MegaMaskingEntities_<DataType, BATCH_SIZE_, HasZK_>;

    // ================================================================
    // AllEntities_ (uniform structure, uses BATCH_SIZE-aware masking)
    // ================================================================

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
                         public WitnessEntities_<DataType>,
                         public ShiftedEntities<DataType> {
      public:
        DEFINE_COMPOUND_GET_ALL(MaskingEntities<DataType, HasZK_>,
                                PrecomputedEntities<DataType>,
                                WitnessEntities_<DataType>,
                                ShiftedEntities<DataType>)

        auto get_unshifted()
        {
            return concatenate(MaskingEntities<DataType, HasZK_>::get_all(),
                               PrecomputedEntities<DataType>::get_all(),
                               WitnessEntities_<DataType>::get_all());
        };
        auto get_unshifted() const
        {
            return concatenate(MaskingEntities<DataType, HasZK_>::get_all(),
                               PrecomputedEntities<DataType>::get_all(),
                               WitnessEntities_<DataType>::get_all());
        };
        auto get_precomputed() { return PrecomputedEntities<DataType>::get_all(); }
        auto get_witness() { return WitnessEntities_<DataType>::get_all(); };
        auto get_witness() const { return WitnessEntities_<DataType>::get_all(); };
        auto get_shifted() { return ShiftedEntities<DataType>::get_all(); };
    };

    // Default AllEntities alias (no ZK)
    template <typename DataType> using AllEntities = AllEntities_<DataType, HasZK>;

    // ================================================================
    // Entity counts
    // ================================================================

    // Derive entity counts from the actual struct definitions
    static constexpr size_t NUM_PRECOMPUTED_ENTITIES = PrecomputedEntities<FF>::_members_size;
    static constexpr size_t NUM_WITNESS_ENTITIES = WireEntities<FF>::_members_size + DerivedEntities<FF>::_members_size;
    static constexpr size_t NUM_SHIFTED_ENTITIES = ShiftedEntities<FF>::_members_size;
    static constexpr size_t NUM_UNSHIFTED_ENTITIES = NUM_PRECOMPUTED_ENTITIES + NUM_WITNESS_ENTITIES;
    static constexpr size_t NUM_ALL_ENTITIES = NUM_UNSHIFTED_ENTITIES + NUM_SHIFTED_ENTITIES;

    // ================================================================
    // BATCH_SIZE-dependent constants
    // ================================================================

    static constexpr size_t SHPLEMINI_OFFSET = 1; // Shplonk:Q

    // ================================================================
    // AllValues, ProverPolynomials
    // ================================================================

    /**
     * @brief A field element for each entity of the flavor. These entities represent the prover polynomials evaluated
     * at one point.
     */
    template <bool HasZK_ = HasZK> class AllValues_ : public AllEntities_<FF, HasZK_> {
      public:
        using Base = AllEntities_<FF, HasZK_>;
        using Base::Base;
    };

    using AllValues = AllValues_<HasZK>;

    template <bool HasZK_ = HasZK>
    using ProverPolynomials_ = ProverPolynomialsBase<AllEntities_<Polynomial, HasZK_>, AllValues_<HasZK_>, Polynomial>;

    using ProverPolynomials = ProverPolynomials_<HasZK>;

    using PrecomputedData = PrecomputedData_<Polynomial, NUM_PRECOMPUTED_ENTITIES>;

    // ================================================================
    // Verification Key
    // ================================================================

    // VK precomputed commitment type depends on BATCH_SIZE:
    // BS=1: 31 individual precomputed commitments
    // BS>1: ceil(31/BS) interleaved precomputed commitments
    using VKPrecomputedType = std::conditional_t<BATCH_SIZE_ == 1,
                                                 PrecomputedEntities<Commitment>,
                                                 MegaInterleavedPrecomputedCommitments_<Commitment, BATCH_SIZE_>>;

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

    // ================================================================
    // CommitmentLabels (individual polynomial labels, same for all BS)
    // ================================================================

    /**
     * @brief A container for commitment labels.
     * @note It's debatable whether this should inherit from AllEntities. since most entries are not strictly needed. It
     * has, however, been useful during debugging to have these labels available.
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
            this->ecc_op_wire_1 = "ECC_OP_WIRE_1";
            this->ecc_op_wire_2 = "ECC_OP_WIRE_2";
            this->ecc_op_wire_3 = "ECC_OP_WIRE_3";
            this->ecc_op_wire_4 = "ECC_OP_WIRE_4";
            this->calldata = "CALLDATA";
            this->calldata_read_counts = "CALLDATA_READ_COUNTS";
            this->calldata_read_tags = "CALLDATA_READ_TAGS";
            this->calldata_inverses = "CALLDATA_INVERSES";
            this->secondary_calldata = "SECONDARY_CALLDATA";
            this->secondary_calldata_read_counts = "SECONDARY_CALLDATA_READ_COUNTS";
            this->secondary_calldata_read_tags = "SECONDARY_CALLDATA_READ_TAGS";
            this->secondary_calldata_inverses = "SECONDARY_CALLDATA_INVERSES";
            this->return_data = "RETURN_DATA";
            this->return_data_read_counts = "RETURN_DATA_READ_COUNTS";
            this->return_data_read_tags = "RETURN_DATA_READ_TAGS";
            this->return_data_inverses = "RETURN_DATA_INVERSES";

            this->q_c = "Q_C";
            this->q_l = "Q_L";
            this->q_r = "Q_R";
            this->q_o = "Q_O";
            this->q_4 = "Q_4";
            this->q_m = "Q_M";
            this->q_busread = "Q_BUSREAD";
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
            this->lagrange_ecc_op = "Q_ECC_OP_QUEUE";
        };
    };

    // ================================================================
    // VerifierCommitments_
    // ================================================================

    /**
     * Note: Made generic for use in MegaRecursive.
     **/
    template <typename Commitment_, typename VerificationKey_, bool HasZK_ = HasZK>
    class VerifierCommitments_ : public AllEntities_<Commitment_, HasZK_> {
      public:
        VerifierCommitments_() = default;

        VerifierCommitments_(const std::shared_ptr<VerificationKey_>& verification_key,
                             const std::optional<WitnessEntities<Commitment_>>& witness_commitments = std::nullopt)
        {
            if constexpr (BATCH_SIZE_ == 1) {
                // Copy the precomputed polynomial commitments into this
                for (auto [precomputed, precomputed_in] :
                     zip_view(this->get_precomputed(), verification_key->get_all())) {
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
            // For BATCH_SIZE > 1: individual precomputed slots are not populated from the VK
            // because the VK stores interleaved commitments. The verifier uses interleaved
            // commitments directly for PCS verification.
        }
    };
    // Specialize for Mega (general case used in MegaRecursive).
    using VerifierCommitments = VerifierCommitments_<Commitment, VerificationKey, HasZK>;

    // ================================================================
    // Interleaved entity type aliases (from external specializations)
    // ================================================================

    template <typename DataType, bool HasZK_ = HasZK>
    using InterleavedWitnessCommitments_ = MegaInterleavedWitnessCommitments_<DataType, BATCH_SIZE_, HasZK_>;

    template <typename DataType> using InterleavedWitnessCommitments = InterleavedWitnessCommitments_<DataType, HasZK>;
    using InterleavedCommitments = InterleavedWitnessCommitments<Commitment>;

    template <typename DataType_>
    using InterleavedPrecomputedCommitments = MegaInterleavedPrecomputedCommitments_<DataType_, BATCH_SIZE_>;
    using InterleavedPrecomputed = InterleavedPrecomputedCommitments<Commitment>;

    // ================================================================
    // Interleaved commitment labels (from mega_interleaving_entities.hpp)
    // ================================================================

    template <bool HasZK_ = HasZK>
    using InterleavedCommitmentLabels_ = MegaInterleavedCommitmentLabels_<BATCH_SIZE_, HasZK_>;
    using InterleavedCommitmentLabels = InterleavedCommitmentLabels_<HasZK>;

    using InterleavedPrecomputedLabels = MegaInterleavedPrecomputedLabels_<BATCH_SIZE_>;

    // ================================================================
    // Interleaved constants (from MegaInterleavingConstants)
    // ================================================================

    static constexpr size_t NUM_INTERLEAVED_PRECOMPUTED_COMMITMENTS =
        MegaInterleavingConstants<BATCH_SIZE_>::NUM_INTERLEAVED_PRECOMPUTED_COMMITMENTS;
    static constexpr size_t NUM_INTERLEAVED_WITNESS_COMMITMENTS =
        MegaInterleavingConstants<BATCH_SIZE_>::NUM_INTERLEAVED_WITNESS_COMMITMENTS;
    static constexpr size_t NUM_ALL_INTERLEAVED_COMMITMENTS =
        MegaInterleavingConstants<BATCH_SIZE_>::NUM_ALL_INTERLEAVED_COMMITMENTS;
    static constexpr size_t NUM_SHIFTABLE_INTERLEAVED_COMMITMENTS =
        MegaInterleavingConstants<BATCH_SIZE_>::NUM_SHIFTABLE_INTERLEAVED_COMMITMENTS;

    // ================================================================
    // Group accessors (delegate to free functions in mega_interleaving_entities.hpp)
    // ================================================================

    // Lagrange basis for interleaving: BS=1 → {1}, BS=4 → {L₀,L₁,L₂,L₃}
    template <typename FF_>
    static auto compute_lagrange_basis([[maybe_unused]] std::span<const FF_> interleaving_challenges)
    {
        if constexpr (BATCH_SIZE_ == 1) {
            return std::array<FF_, 1>{ FF_(1) };
        } else {
            return compute_mega_lagrange_basis<BATCH_SIZE_>(interleaving_challenges[0], interleaving_challenges[1]);
        }
    }

    template <typename Entities>
    static auto get_unshifted_groups(Entities& e)
        requires(BATCH_SIZE_ > 1)
    {
        return get_mega_unshifted_groups<true>(e);
    }

    template <typename Entities>
    static auto get_unshifted_groups_mut(Entities& e)
        requires(BATCH_SIZE_ > 1)
    {
        return get_mega_unshifted_groups<false>(e);
    }

    template <typename Entities>
    static auto get_to_be_shifted_groups(Entities& e)
        requires(BATCH_SIZE_ > 1)
    {
        return get_mega_to_be_shifted_groups(e);
    }

    template <typename Entities>
    static auto get_shifted_groups(Entities& e)
        requires(BATCH_SIZE_ > 1)
    {
        return get_mega_shifted_groups(e);
    }

    // ================================================================
    // REPEATED_COMMITMENTS and FINAL_PCS_MSM_SIZE
    // (defined here because they depend on interleaved constants above)
    // ================================================================

    static constexpr RepeatedCommitmentsData REPEATED_COMMITMENTS =
        (BATCH_SIZE_ == 1)
            ? RepeatedCommitmentsData(
                  NUM_PRECOMPUTED_ENTITIES, NUM_PRECOMPUTED_ENTITIES + NUM_WITNESS_ENTITIES, NUM_SHIFTED_ENTITIES)
            : RepeatedCommitmentsData(NUM_ALL_INTERLEAVED_COMMITMENTS - NUM_SHIFTABLE_INTERLEAVED_COMMITMENTS,
                                      NUM_ALL_INTERLEAVED_COMMITMENTS,
                                      NUM_SHIFTABLE_INTERLEAVED_COMMITMENTS);

    // Size of the final PCS MSM after KZG adds quotient commitment
    // = 1 (Shplonk Q) + NUM_COMMITMENTS (after dedup) + (pcs_log_n - 1) Gemini folds + 1 (G1 identity) + 1 (KZG W)
    static constexpr size_t FINAL_PCS_MSM_SIZE(size_t log_n = VIRTUAL_LOG_N)
    {
        if constexpr (BATCH_SIZE_ == 1) {
            return NUM_UNSHIFTED_ENTITIES + log_n + 2;
        } else {
            const size_t pcs_log_n = log_n + INTERLEAVING_LOG_K;
            return NUM_ALL_INTERLEAVED_COMMITMENTS + pcs_log_n + 2;
        }
    }
};

// ============================================================
// Type aliases
// ============================================================

using MegaFlavor = MegaFlavor_<1>;
using MultiMegaFlavor = MegaFlavor_<4>;

} // namespace bb

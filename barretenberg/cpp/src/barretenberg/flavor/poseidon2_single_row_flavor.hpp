#pragma once
#include "barretenberg/flavor/mega_flavor.hpp"
#include "barretenberg/relations/poseidon2_single_row.hpp"

namespace bb {

/**
 * @brief A variant of MegaFlavor that adds support for evaluating the entire Poseidon2
 * permutation in a single row.
 *
 * @details Extends MegaFlavor with:
 *   - 1 new selector: q_poseidon2_single_row
 *   - 352 new witness columns: poseidon2_input[4], poseidon2_state[260], poseidon2_sq[88]
 *   - 1 new relation: Poseidon2SingleRowRelation
 */
class Poseidon2SingleRowFlavor {
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

    static constexpr size_t VIRTUAL_LOG_N = CONST_FOLDING_LOG_N;
    static constexpr bool USE_SHORT_MONOMIALS = true;
    static constexpr bool HasZK = false;
    static constexpr bool USE_PADDING = true;
    static constexpr size_t NUM_WIRES = CircuitBuilder::NUM_WIRES;

    // ==================== Helper for const RefArray from std::array ====================
    template <typename T, size_t N>
    static RefArray<const T, N> make_const_ref_array(const std::array<T, N>& arr)
    {
        std::array<const T*, N> ptrs;
        for (size_t i = 0; i < N; i++) {
            ptrs[i] = &arr[i];
        }
        return RefArray<const T, N>(ptrs);
    }

    // ==================== Relations ====================
    // MegaFlavor relations + Poseidon2SingleRowRelation
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
                                  bb::Poseidon2SingleRowRelation<FF>>;
    using Relations = Relations_<FF>;

    static constexpr size_t MAX_PARTIAL_RELATION_LENGTH = compute_max_partial_relation_length<Relations>();
    static constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = MAX_PARTIAL_RELATION_LENGTH + 1;
    static constexpr size_t NUM_RELATIONS = std::tuple_size_v<Relations>;

    static constexpr size_t num_frs_comm = FrCodec::calc_num_fields<Commitment>();
    static constexpr size_t num_frs_fr = FrCodec::calc_num_fields<FF>();

    static constexpr size_t NUM_SUBRELATIONS = compute_number_of_subrelations<Relations>();
    using SubrelationSeparator = FF;

    // ==================== Precomputed Entities ====================
    // MegaFlavor precomputed + q_poseidon2_single_row
    template <typename DataType> class Poseidon2SingleRowSelectorEntity {
      public:
        DEFINE_FLAVOR_MEMBERS(DataType, q_poseidon2_single_row)
    };

    template <typename DataType_>
    class PrecomputedEntities : public MegaFlavor::PrecomputedEntities<DataType_>,
                                public Poseidon2SingleRowSelectorEntity<DataType_> {
      public:
        using DataType = DataType_;
        DEFINE_COMPOUND_GET_ALL(MegaFlavor::PrecomputedEntities<DataType_>,
                                Poseidon2SingleRowSelectorEntity<DataType_>)

        auto get_non_gate_selectors()
        {
            return MegaFlavor::PrecomputedEntities<DataType_>::get_non_gate_selectors();
        }
        auto get_gate_selectors()
        {
            // q_poseidon2_single_row is NOT included here because the MegaCircuitBuilder
            // only populates 9 gate selectors. The new selector is in get_all() but managed
            // separately from the builder's execution trace blocks.
            return MegaFlavor::PrecomputedEntities<DataType_>::get_gate_selectors();
        }
        auto get_selectors() { return concatenate(get_non_gate_selectors(), get_gate_selectors()); }
        auto get_sigmas() { return MegaFlavor::PrecomputedEntities<DataType_>::get_sigmas(); }
        auto get_ids() { return MegaFlavor::PrecomputedEntities<DataType_>::get_ids(); }
        auto get_tables() { return MegaFlavor::PrecomputedEntities<DataType_>::get_tables(); }
    };

    // ==================== Witness Entities ====================
    // WireEntities: same as Mega (w_l, w_r, w_o, w_4)
    template <typename DataType> using WireEntities = MegaFlavor::WireEntities<DataType>;

    // DerivedEntities: same as Mega
    template <typename DataType> using DerivedEntities = MegaFlavor::DerivedEntities<DataType>;

    // New: Poseidon2 single-row witness columns (348 columns)
    // Inputs come from w_l, w_r, w_o, w_4 (the standard wire entities)
    template <typename DataType> class Poseidon2SingleRowWitnessEntities {
      public:
        std::array<DataType, 260> poseidon2_state; // 65 stages x 4 elements
        std::array<DataType, 88> poseidon2_sq;     // S-box x^2 intermediates

        static constexpr size_t _members_size = 348;

        auto get_all()
        {
            return concatenate(RefArray<DataType, 260>(poseidon2_state),
                               RefArray<DataType, 88>(poseidon2_sq));
        }
        auto get_all() const
        {
            return concatenate(make_const_ref_array(poseidon2_state),
                               make_const_ref_array(poseidon2_sq));
        }
        static constexpr size_t size() { return _members_size; }
        static const std::vector<std::string>& get_labels()
        {
            static std::vector<std::string> labels = [] {
                std::vector<std::string> l;
                l.reserve(_members_size);
                for (size_t i = 0; i < 260; i++) {
                    l.push_back("poseidon2_state_" + std::to_string(i));
                }
                for (size_t i = 0; i < 88; i++) {
                    l.push_back("poseidon2_sq_" + std::to_string(i));
                }
                return l;
            }();
            return labels;
        }
    };

    // Combined witness entities: Mega wires + derived + Poseidon2 single-row
    template <typename DataType>
    class WitnessEntities_ : public WireEntities<DataType>,
                              public DerivedEntities<DataType>,
                              public Poseidon2SingleRowWitnessEntities<DataType> {
      public:
        DEFINE_COMPOUND_GET_ALL(WireEntities<DataType>,
                                DerivedEntities<DataType>,
                                Poseidon2SingleRowWitnessEntities<DataType>)

        auto get_wires() { return WireEntities<DataType>::get_all(); }
        auto get_ecc_op_wires()
        {
            return RefArray{ this->ecc_op_wire_1, this->ecc_op_wire_2, this->ecc_op_wire_3, this->ecc_op_wire_4 };
        }
        auto get_databus_entities()
        {
            return RefArray{ this->calldata,           this->calldata_read_counts,
                             this->calldata_read_tags, this->secondary_calldata,
                             this->secondary_calldata_read_counts,
                             this->secondary_calldata_read_tags,
                             this->return_data,        this->return_data_read_counts,
                             this->return_data_read_tags };
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

    template <typename DataType> using WitnessEntities = WitnessEntities_<DataType>;

    // MaskingEntities: same as Mega
    template <typename DataType, bool HasZK_ = false> using MaskingEntities = MegaFlavor::MaskingEntities<DataType, HasZK_>;

    // ShiftedEntities: same as Mega (our single-row relation doesn't use shifts)
    template <typename DataType> using ShiftedEntities = MegaFlavor::ShiftedEntities<DataType>;

    // ==================== AllEntities ====================
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
        }
        auto get_precomputed() { return PrecomputedEntities<DataType>::get_all(); }
        auto get_witness() { return WitnessEntities_<DataType>::get_all(); }
        auto get_witness() const { return WitnessEntities_<DataType>::get_all(); }
        auto get_shifted() { return ShiftedEntities<DataType>::get_all(); }
    };

    template <typename DataType> using AllEntities = AllEntities_<DataType, HasZK>;

    // ==================== Derived counts ====================
    static constexpr size_t NUM_PRECOMPUTED_ENTITIES =
        MegaFlavor::PrecomputedEntities<FF>::_members_size +
        Poseidon2SingleRowSelectorEntity<FF>::_members_size; // Mega's 31 + 1
    static constexpr size_t NUM_WITNESS_ENTITIES =
        MegaFlavor::WireEntities<FF>::_members_size +
        MegaFlavor::DerivedEntities<FF>::_members_size +
        Poseidon2SingleRowWitnessEntities<FF>::_members_size; // 4 + 20 + 348 = 372
    static constexpr size_t NUM_SHIFTED_ENTITIES = ShiftedEntities<FF>::_members_size;
    static constexpr size_t NUM_UNSHIFTED_ENTITIES = NUM_PRECOMPUTED_ENTITIES + NUM_WITNESS_ENTITIES;
    static constexpr size_t NUM_ALL_ENTITIES = NUM_UNSHIFTED_ENTITIES + NUM_SHIFTED_ENTITIES;

    static constexpr RepeatedCommitmentsData REPEATED_COMMITMENTS = RepeatedCommitmentsData(
        NUM_PRECOMPUTED_ENTITIES, NUM_PRECOMPUTED_ENTITIES + NUM_WITNESS_ENTITIES, NUM_SHIFTED_ENTITIES);

    static constexpr size_t FINAL_PCS_MSM_SIZE(size_t log_n = VIRTUAL_LOG_N)
    {
        return NUM_UNSHIFTED_ENTITIES + log_n + 2;
    }

    // ==================== Standard flavor types ====================
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

    using VerificationKey = NativeVerificationKey_<PrecomputedEntities<Commitment>, Codec, HashFunction, CommitmentKey>;
    using VKAndHash = VKAndHash_<FF, VerificationKey>;

    template <bool HasZK_ = HasZK>
    using PartiallyEvaluatedMultivariates_ =
        PartiallyEvaluatedMultivariatesBase<AllEntities_<Polynomial, HasZK_>, ProverPolynomials_<HasZK_>, Polynomial>;

    using PartiallyEvaluatedMultivariates = PartiallyEvaluatedMultivariates_<HasZK>;

    template <size_t LENGTH> using ProverUnivariates = AllEntities<bb::Univariate<FF, LENGTH>>;
    using ExtendedEdges = ProverUnivariates<MAX_PARTIAL_RELATION_LENGTH>;

    using WitnessCommitments = WitnessEntities<Commitment>;

    class CommitmentLabels : public AllEntities<std::string> {
      public:
        CommitmentLabels()
        {
            // Mega labels
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
            this->q_poseidon2_single_row = "Q_POSEIDON2_SINGLE_ROW";
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
            // Poseidon2 single-row labels are auto-generated via get_labels()
        }
    };

    template <typename Commitment_, typename VerificationKey_, bool HasZK_ = HasZK>
    class VerifierCommitments_ : public AllEntities_<Commitment_, HasZK_> {
      public:
        VerifierCommitments_(
            const std::shared_ptr<VerificationKey_>& verification_key,
            const std::optional<WitnessEntities<Commitment_>>& witness_commitments = std::nullopt)
        {
            for (auto [precomputed, precomputed_in] : zip_view(this->get_precomputed(), verification_key->get_all())) {
                precomputed = precomputed_in;
            }
            if (witness_commitments.has_value()) {
                for (auto [witness, witness_in] :
                     zip_view(this->get_witness(), witness_commitments.value().get_all())) {
                    witness = witness_in;
                }
                this->w_l_shift = witness_commitments->w_l;
                this->w_r_shift = witness_commitments->w_r;
                this->w_o_shift = witness_commitments->w_o;
                this->w_4_shift = witness_commitments->w_4;
                this->z_perm_shift = witness_commitments->z_perm;
            }
        }
    };
    using VerifierCommitments = VerifierCommitments_<Commitment, VerificationKey, HasZK>;
};

} // namespace bb

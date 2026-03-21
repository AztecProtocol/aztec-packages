#pragma once
#include "barretenberg/flavor/mega_flavor.hpp"
#include "barretenberg/relations/poseidon2_op_queue_relation.hpp"

namespace bb {

/**
 * @brief MegaV2Flavor: A variant of MegaFlavor with deferred Poseidon2 evaluation.
 *
 * @details Replaces the per-round Poseidon2 relations (External/Internal) with an op queue
 * approach. Poseidon2 hashes are NOT evaluated in-circuit; instead, the 4 sponge state values
 * and the hash output are copied into dedicated poseidon2_op_wire columns (2 rows per hash).
 *
 * These op wire commitments are accumulated across IVC iterations via the Poseidon2 merge
 * protocol. At the end of the IVC chain, a single Poseidon2SingleRowFlavor proof verifies
 * all accumulated hashes.
 *
 * Changes from MegaFlavor:
 *   - Adds 4 witness columns: poseidon2_op_wire_1..4
 *   - Adds 1 precomputed column: lagrange_poseidon2_op (binary indicator)
 *   - Adds Poseidon2OpQueueRelation (copy constraint for op wires)
 *   - Removes Poseidon2ExternalRelation, Poseidon2InternalRelation
 */
class MegaV2Flavor {
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

    // ==================== Relations ====================
    // Same as Mega but: remove Poseidon2External/Internal, add Poseidon2OpQueue
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
                                  bb::Poseidon2OpQueueRelation<FF>>;
    using Relations = Relations_<FF>;

    static constexpr size_t MAX_PARTIAL_RELATION_LENGTH = compute_max_partial_relation_length<Relations>();
    static constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = MAX_PARTIAL_RELATION_LENGTH + 1;
    static constexpr size_t NUM_RELATIONS = std::tuple_size_v<Relations>;

    static constexpr size_t num_frs_comm = FrCodec::calc_num_fields<Commitment>();
    static constexpr size_t num_frs_fr = FrCodec::calc_num_fields<FF>();

    static constexpr size_t NUM_SUBRELATIONS = compute_number_of_subrelations<Relations>();
    using SubrelationSeparator = FF;

    // ==================== Precomputed Entities ====================
    // Same as Mega + lagrange_poseidon2_op indicator
    template <typename DataType_> class PrecomputedEntities : public MegaFlavor::PrecomputedEntities<DataType_> {
      public:
        using DataType = DataType_;
        DataType lagrange_poseidon2_op; // binary indicator for poseidon2 op rows

        // Override get_all to include the new column
        auto get_all()
        {
            return concatenate(MegaFlavor::PrecomputedEntities<DataType_>::get_all(),
                               RefArray{ lagrange_poseidon2_op });
        }
        auto get_all() const
        {
            return concatenate(MegaFlavor::PrecomputedEntities<DataType_>::get_all(),
                               RefArray<const DataType, 1>{ lagrange_poseidon2_op });
        }
        static constexpr size_t size()
        {
            return MegaFlavor::PrecomputedEntities<DataType_>::_members_size + 1;
        }
        static const std::vector<std::string>& get_labels()
        {
            static auto labels = [] {
                auto base = MegaFlavor::PrecomputedEntities<DataType_>::get_labels();
                base.push_back("lagrange_poseidon2_op");
                return base;
            }();
            return labels;
        }

        // Delegate to Mega for selector accessors (gate selectors unchanged)
        auto get_non_gate_selectors()
        {
            return MegaFlavor::PrecomputedEntities<DataType_>::get_non_gate_selectors();
        }
        auto get_gate_selectors()
        {
            return MegaFlavor::PrecomputedEntities<DataType_>::get_gate_selectors();
        }
        auto get_selectors()
        {
            return MegaFlavor::PrecomputedEntities<DataType_>::get_selectors();
        }
        auto get_sigmas() { return MegaFlavor::PrecomputedEntities<DataType_>::get_sigmas(); }
        auto get_ids() { return MegaFlavor::PrecomputedEntities<DataType_>::get_ids(); }
        auto get_tables() { return MegaFlavor::PrecomputedEntities<DataType_>::get_tables(); }
    };

    // ==================== Witness Entities ====================
    template <typename DataType> using WireEntities = MegaFlavor::WireEntities<DataType>;

    // DerivedEntities: Mega's derived + 4 poseidon2 op wires
    template <typename DataType> class DerivedEntities : public MegaFlavor::DerivedEntities<DataType> {
      public:
        DataType poseidon2_op_wire_1;
        DataType poseidon2_op_wire_2;
        DataType poseidon2_op_wire_3;
        DataType poseidon2_op_wire_4;

        auto get_all()
        {
            return concatenate(MegaFlavor::DerivedEntities<DataType>::get_all(),
                               RefArray{ poseidon2_op_wire_1, poseidon2_op_wire_2, poseidon2_op_wire_3,
                                         poseidon2_op_wire_4 });
        }
        auto get_all() const
        {
            return concatenate(
                MegaFlavor::DerivedEntities<DataType>::get_all(),
                RefArray<const DataType, 4>{ poseidon2_op_wire_1, poseidon2_op_wire_2, poseidon2_op_wire_3,
                                             poseidon2_op_wire_4 });
        }
        static constexpr size_t size()
        {
            return MegaFlavor::DerivedEntities<DataType>::_members_size + 4;
        }
        static const std::vector<std::string>& get_labels()
        {
            static auto labels = [] {
                auto base = MegaFlavor::DerivedEntities<DataType>::get_labels();
                base.push_back("poseidon2_op_wire_1");
                base.push_back("poseidon2_op_wire_2");
                base.push_back("poseidon2_op_wire_3");
                base.push_back("poseidon2_op_wire_4");
                return base;
            }();
            return labels;
        }

        auto get_to_be_shifted()
        {
            return MegaFlavor::DerivedEntities<DataType>::get_to_be_shifted();
        }

        auto get_poseidon2_op_wires()
        {
            return RefArray{ poseidon2_op_wire_1, poseidon2_op_wire_2, poseidon2_op_wire_3, poseidon2_op_wire_4 };
        }
    };

    template <typename DataType>
    class WitnessEntities_ : public WireEntities<DataType>, public DerivedEntities<DataType> {
      public:
        DEFINE_COMPOUND_GET_ALL(WireEntities<DataType>, DerivedEntities<DataType>)

        auto get_wires() { return WireEntities<DataType>::get_all(); }
        auto get_ecc_op_wires()
        {
            return RefArray{ this->ecc_op_wire_1, this->ecc_op_wire_2, this->ecc_op_wire_3, this->ecc_op_wire_4 };
        }
        auto get_poseidon2_op_wires()
        {
            return RefArray{ this->poseidon2_op_wire_1, this->poseidon2_op_wire_2, this->poseidon2_op_wire_3,
                             this->poseidon2_op_wire_4 };
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
    template <typename DataType, bool HasZK_ = false> using MaskingEntities = MegaFlavor::MaskingEntities<DataType, HasZK_>;
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
        MegaFlavor::PrecomputedEntities<FF>::_members_size + 1; // + lagrange_poseidon2_op
    static constexpr size_t NUM_WITNESS_ENTITIES =
        MegaFlavor::WireEntities<FF>::_members_size +
        MegaFlavor::DerivedEntities<FF>::_members_size + 4; // + 4 poseidon2 op wires
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
            this->poseidon2_op_wire_1 = "POSEIDON2_OP_WIRE_1";
            this->poseidon2_op_wire_2 = "POSEIDON2_OP_WIRE_2";
            this->poseidon2_op_wire_3 = "POSEIDON2_OP_WIRE_3";
            this->poseidon2_op_wire_4 = "POSEIDON2_OP_WIRE_4";
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
            this->lagrange_poseidon2_op = "Q_POSEIDON2_OP_QUEUE";
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

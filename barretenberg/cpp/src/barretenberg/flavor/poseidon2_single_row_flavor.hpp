#pragma once
#include "barretenberg/flavor/mega_flavor.hpp"
#include "barretenberg/relations/poseidon2_single_row.hpp"
#include "barretenberg/relations/poseidon2_single_row_wire_zero.hpp"

namespace bb {

/**
 * @brief Minimal flavor for proving Poseidon2 permutations via the single-row relation.
 *
 * @details Uses the standard UltraProver_/ProverInstance_/OinkProver pipeline but strips out
 * all Mega-specific baggage (ECC op wires, databus, their relations). Only contains:
 *   - Standard Ultra infrastructure (wires, selectors, permutation arg, lookups, lagrange)
 *   - The Poseidon2SingleRowRelation (88 subrelations)
 *   - 88 extra witness columns (poseidon2_state[88])
 *   - 1 extra selector (q_poseidon2_single_row)
 *
 * This flavor is NOT IsMegaFlavor — it skips ECC op wire allocation, databus allocation,
 * and all Mega-only code paths in ProverInstance/OinkProver/TraceToPolynomials.
 *
 * Uses MegaCircuitBuilder (which has 9 gate blocks), so the 9 gate selectors from
 * MegaFlavor::PrecomputedEntities are kept (most will be zero/empty).
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
    // Only Poseidon2SingleRowRelation — no arithmetic, permutation, lookups, ECC, databus.
    // The standard Ultra relations (ArithmeticRelation, UltraPermutationRelation, etc.) are
    // still needed for the UltraProver pipeline to function (permutation arg, lookups), but
    // they produce zero contributions since the circuit has no arithmetic/lookup gates.
    template <typename FF>
    using Relations_ = std::tuple<bb::ArithmeticRelation<FF>,
                                  bb::UltraPermutationRelation<FF>,
                                  bb::LogDerivLookupRelation<FF>,
                                  bb::DeltaRangeConstraintRelation<FF>,
                                  bb::EllipticRelation<FF>,
                                  bb::MemoryRelation<FF>,
                                  bb::NonNativeFieldRelation<FF>,
                                  bb::Poseidon2SingleRowRelation<FF>,
                                  bb::Poseidon2SingleRowWireZeroRelation<FF>>;
    using Relations = Relations_<FF>;

    static constexpr size_t MAX_PARTIAL_RELATION_LENGTH = compute_max_partial_relation_length<Relations>();
    static constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = MAX_PARTIAL_RELATION_LENGTH + 1;
    static constexpr size_t NUM_RELATIONS = std::tuple_size_v<Relations>;

    static constexpr size_t num_frs_comm = FrCodec::calc_num_fields<Commitment>();
    static constexpr size_t num_frs_fr = FrCodec::calc_num_fields<FF>();

    static constexpr size_t NUM_SUBRELATIONS = compute_number_of_subrelations<Relations>();
    using SubrelationSeparator = FF;

    // ==================== Precomputed Entities ====================
    // Mega's precomputed (31 polys: selectors, sigmas, ids, tables, lagrange) + q_poseidon2_single_row
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
            // Must return exactly 9 selectors to match MegaCircuitBuilder's 9 gate blocks
            return MegaFlavor::PrecomputedEntities<DataType_>::get_gate_selectors();
        }
        auto get_selectors() { return concatenate(get_non_gate_selectors(), get_gate_selectors()); }
        auto get_sigmas() { return MegaFlavor::PrecomputedEntities<DataType_>::get_sigmas(); }
        auto get_ids() { return MegaFlavor::PrecomputedEntities<DataType_>::get_ids(); }
        auto get_tables() { return MegaFlavor::PrecomputedEntities<DataType_>::get_tables(); }
    };

    // ==================== Wire Entities ====================
    template <typename DataType> using WireEntities = MegaFlavor::WireEntities<DataType>;

    // ==================== Derived Entities (minimal — NO ECC ops, NO databus) ====================
    template <typename DataType> class DerivedEntities {
      public:
        DEFINE_FLAVOR_MEMBERS(DataType,
                              z_perm,
                              lookup_inverses,
                              lookup_read_counts,
                              lookup_read_tags);

        auto get_to_be_shifted() { return RefArray{ z_perm }; }
    };

    // ==================== Poseidon2 Witness Entities (88 columns) ====================
    template <typename DataType> class Poseidon2SingleRowWitnessEntities {
      public:
        std::array<DataType, 88> poseidon2_state;

        static constexpr size_t _members_size = 88;

        auto get_all() { return RefArray<DataType, 88>(poseidon2_state); }
        auto get_all() const { return make_const_ref_array(poseidon2_state); }
        static constexpr size_t size() { return _members_size; }
        static const std::vector<std::string>& get_labels()
        {
            static std::vector<std::string> labels = [] {
                std::vector<std::string> l;
                l.reserve(_members_size);
                for (size_t i = 0; i < 88; i++) {
                    l.push_back("poseidon2_state_" + std::to_string(i));
                }
                return l;
            }();
            return labels;
        }
    };

    // ==================== Combined Witness ====================
    template <typename DataType>
    class WitnessEntities_ : public WireEntities<DataType>,
                              public DerivedEntities<DataType>,
                              public Poseidon2SingleRowWitnessEntities<DataType> {
      public:
        DEFINE_COMPOUND_GET_ALL(WireEntities<DataType>,
                                DerivedEntities<DataType>,
                                Poseidon2SingleRowWitnessEntities<DataType>)

        auto get_wires() { return WireEntities<DataType>::get_all(); }
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

    // ==================== Counts ====================
    static constexpr size_t NUM_PRECOMPUTED_ENTITIES =
        MegaFlavor::PrecomputedEntities<FF>::_members_size + 1; // 31 + 1 = 32
    static constexpr size_t NUM_WITNESS_ENTITIES =
        WireEntities<FF>::_members_size +
        DerivedEntities<FF>::_members_size +
        Poseidon2SingleRowWitnessEntities<FF>::_members_size; // 4 + 4 + 88 = 96
    static constexpr size_t NUM_SHIFTED_ENTITIES = ShiftedEntities<FF>::_members_size; // 5
    static constexpr size_t NUM_UNSHIFTED_ENTITIES = NUM_PRECOMPUTED_ENTITIES + NUM_WITNESS_ENTITIES; // 128
    static constexpr size_t NUM_ALL_ENTITIES = NUM_UNSHIFTED_ENTITIES + NUM_SHIFTED_ENTITIES; // 133

    static constexpr RepeatedCommitmentsData REPEATED_COMMITMENTS = RepeatedCommitmentsData(
        NUM_PRECOMPUTED_ENTITIES, NUM_PRECOMPUTED_ENTITIES + NUM_WITNESS_ENTITIES, NUM_SHIFTED_ENTITIES);

    static constexpr size_t FINAL_PCS_MSM_SIZE(size_t log_n = VIRTUAL_LOG_N)
    {
        return NUM_UNSHIFTED_ENTITIES + log_n + 2;
    }

    // ==================== Standard types ====================
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

            // Poseidon2 witness columns (88 total)
            for (size_t i = 0; i < 88; i++) {
                this->poseidon2_state[i] = "POSEIDON2_STATE_" + std::to_string(i);
            }
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

#pragma once
#include "barretenberg/commitment_schemes/kzg/kzg.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/flavor/flavor_macros.hpp"
#include "barretenberg/flavor/partially_evaluated_multivariates.hpp"
#include "barretenberg/flavor/prover_polynomials.hpp"
#include "barretenberg/flavor/relation_definitions.hpp"
#include "barretenberg/flavor/repeated_commitments_data.hpp"
#include "barretenberg/polynomials/univariate.hpp"
#include "barretenberg/relations/poseidon2_single_row.hpp"
#include "barretenberg/relations/relation_tuple_helpers.hpp"
#include "barretenberg/transcript/transcript.hpp"

namespace bb {

/**
 * @brief Minimal flavor for verifying deferred Poseidon2 hashes at the end of an IVC chain.
 *
 * @details Contains ONLY the Poseidon2SingleRowRelation — no arithmetic, permutation, lookups,
 * ECC ops, or databus. This is the "ECCVM equivalent" for Poseidon2: a dedicated circuit that
 * verifies all accumulated Poseidon2 operations from the IVC chain.
 *
 * Uses a standalone prover (Poseidon2FinalProver) modeled after TranslatorProver, bypassing
 * the standard ProverInstance/OinkProver/UltraProver pipeline entirely.
 *
 * Columns:
 *   Precomputed: q_poseidon2_single_row (1 selector)
 *   Witness:     w_l, w_r, w_o, w_4 (4 wires = permutation inputs)
 *                poseidon2_state[260], poseidon2_sq[88] (348 intermediate columns)
 *   Total:       1 precomputed + 352 witness = 353 columns (no shifts)
 */
class Poseidon2FinalFlavor {
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
    static constexpr bool USE_PADDING = false;
    static constexpr size_t NUM_WIRES = 4;

    // ==================== Helper ====================
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
    template <typename FF> using Relations_ = std::tuple<bb::Poseidon2SingleRowRelation<FF>>;
    using Relations = Relations_<FF>;

    static constexpr size_t MAX_PARTIAL_RELATION_LENGTH = compute_max_partial_relation_length<Relations>();
    static constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = MAX_PARTIAL_RELATION_LENGTH + 1;
    static constexpr size_t NUM_RELATIONS = std::tuple_size_v<Relations>;
    static constexpr size_t NUM_SUBRELATIONS = compute_number_of_subrelations<Relations>();
    using SubrelationSeparator = FF;

    // ==================== Precomputed Entities ====================
    template <typename DataType_> class PrecomputedEntities {
      public:
        using DataType = DataType_;
        DEFINE_FLAVOR_MEMBERS(DataType, q_poseidon2_single_row)
    };

    // ==================== Wire Entities ====================
    template <typename DataType> class WireEntities {
      public:
        DEFINE_FLAVOR_MEMBERS(DataType, w_l, w_r, w_o, w_4)
    };

    // ==================== Poseidon2 Witness Entities ====================
    template <typename DataType> class Poseidon2WitnessEntities {
      public:
        std::array<DataType, 260> poseidon2_state;
        std::array<DataType, 88> poseidon2_sq;

        static constexpr size_t _members_size = 348;

        auto get_all()
        {
            return concatenate(RefArray<DataType, 260>(poseidon2_state), RefArray<DataType, 88>(poseidon2_sq));
        }
        auto get_all() const
        {
            return concatenate(make_const_ref_array(poseidon2_state), make_const_ref_array(poseidon2_sq));
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

    // ==================== Combined Witness ====================
    template <typename DataType>
    class WitnessEntities_ : public WireEntities<DataType>, public Poseidon2WitnessEntities<DataType> {
      public:
        DEFINE_COMPOUND_GET_ALL(WireEntities<DataType>, Poseidon2WitnessEntities<DataType>)
        auto get_wires() { return WireEntities<DataType>::get_all(); }
    };
    template <typename DataType> using WitnessEntities = WitnessEntities_<DataType>;

    // No masking (no ZK), no shifted entities
    template <typename DataType, bool = false> class MaskingEntities {
      public:
        static constexpr size_t _members_size = 0;
        auto get_all() { return RefArray<DataType, 0>{}; }
        auto get_all() const { return RefArray<const DataType, 0>{}; }
        static constexpr size_t size() { return 0; }
        static auto get_labels() { return std::vector<std::string>{}; }
    };

    template <typename DataType> class ShiftedEntities {
      public:
        static constexpr size_t _members_size = 0;
        auto get_all() { return RefArray<DataType, 0>{}; }
        auto get_all() const { return RefArray<const DataType, 0>{}; }
        static constexpr size_t size() { return 0; }
        static auto get_labels() { return std::vector<std::string>{}; }
    };

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
    static constexpr size_t NUM_PRECOMPUTED_ENTITIES = 1;
    static constexpr size_t NUM_WITNESS_ENTITIES = 4 + 348;
    static constexpr size_t NUM_SHIFTED_ENTITIES = 0;
    static constexpr size_t NUM_UNSHIFTED_ENTITIES = NUM_PRECOMPUTED_ENTITIES + NUM_WITNESS_ENTITIES;
    static constexpr size_t NUM_ALL_ENTITIES = NUM_UNSHIFTED_ENTITIES + NUM_SHIFTED_ENTITIES;

    static constexpr RepeatedCommitmentsData REPEATED_COMMITMENTS =
        RepeatedCommitmentsData(NUM_PRECOMPUTED_ENTITIES, NUM_PRECOMPUTED_ENTITIES + NUM_WITNESS_ENTITIES, 0);

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

    // Custom ProverPolynomials: override get_polynomial_size() since this flavor has no q_c
    template <bool HasZK_ = HasZK>
    class ProverPolynomials_
        : public ProverPolynomialsBase<AllEntities_<Polynomial, HasZK_>, AllValues_<HasZK_>, Polynomial> {
      public:
        [[nodiscard]] size_t get_polynomial_size() const { return this->q_poseidon2_single_row.virtual_size(); }
    };
    using ProverPolynomials = ProverPolynomials_<HasZK>;

    template <bool HasZK_ = HasZK>
    using PartiallyEvaluatedMultivariates_ =
        PartiallyEvaluatedMultivariatesBase<AllEntities_<Polynomial, HasZK_>, ProverPolynomials_<HasZK_>, Polynomial>;
    using PartiallyEvaluatedMultivariates = PartiallyEvaluatedMultivariates_<HasZK>;

    template <size_t LENGTH> using ProverUnivariates = AllEntities<bb::Univariate<FF, LENGTH>>;
    using ExtendedEdges = ProverUnivariates<MAX_PARTIAL_RELATION_LENGTH>;

    using WitnessCommitments = WitnessEntities<Commitment>;

    // ==================== Standalone ProvingKey (like Translator) ====================
    class ProvingKey {
      public:
        size_t circuit_size;
        size_t log_circuit_size;
        ProverPolynomials polynomials;
        CommitmentKey commitment_key;

        ProvingKey() = default;
        ProvingKey(size_t num_hashes)
            : circuit_size(numeric::round_up_power_2(num_hashes + 1)) // +1 for zero row
            , log_circuit_size(numeric::get_msb(circuit_size))
        {}
    };

    class CommitmentLabels : public AllEntities<std::string> {
      public:
        CommitmentLabels()
        {
            this->w_l = "W_L";
            this->w_r = "W_R";
            this->w_o = "W_O";
            this->w_4 = "W_4";
            this->q_poseidon2_single_row = "Q_POSEIDON2_SINGLE_ROW";
        }
    };
};

} // namespace bb

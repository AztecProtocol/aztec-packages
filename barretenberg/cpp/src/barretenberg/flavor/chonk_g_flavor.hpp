#pragma once
#include "barretenberg/commitment_schemes/ipa/ipa.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/flavor/flavor_macros.hpp"
#include "barretenberg/flavor/partially_evaluated_multivariates.hpp"
#include "barretenberg/flavor/prover_polynomials.hpp"
#include "barretenberg/flavor/repeated_commitments_data.hpp"
#include "barretenberg/honk/library/grand_product_delta.hpp"
#include "barretenberg/honk/library/grand_product_library.hpp"
#include "barretenberg/relations/relation_tuple_helpers.hpp"
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

/**
 * @brief Flavor for Chonk_G circuit: UltraHonk over Grumpkin (IPA-based, ZK).
 * @details This flavor uses Grumpkin curve with IPA polynomial commitment scheme and standard Ultra
 * relations. It is used as one half of the split-chonk verification circuit, handling EC group
 * operations that are native over Grumpkin (BN254 point arithmetic) and field operations native
 * to Grumpkin.Fr (= BN254.Fq).
 */
class ChonkGFlavor {
  public:
    using CircuitBuilder = GrumpkinUltraCircuitBuilder;
    using Curve = curve::Grumpkin;
    using FF = Curve::ScalarField;  // grumpkin::fr = bb::fq
    using GroupElement = Curve::Element;
    using Commitment = Curve::AffineElement;
    using PCS = IPA<Curve>;
    using Polynomial = bb::Polynomial<FF>;
    using CommitmentKey = bb::CommitmentKey<Curve>;
    using VerifierCommitmentKey = bb::VerifierCommitmentKey<Curve>;
    // Transcript uses FrCodec (BN254.Fr-based serialization) and Poseidon2 over BN254.Fr,
    // same pattern as ECCVMFlavor.
    using Codec = FrCodec;
    using HashFunction = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>;
    using Transcript = BaseTranscript<Codec, HashFunction>;

    static constexpr size_t VIRTUAL_LOG_N = CONST_PROOF_SIZE_LOG_N;
    static constexpr bool USE_SHORT_MONOMIALS = true;
    static constexpr bool HasZK = true;
    static constexpr bool USE_PADDING = true;
    static constexpr size_t NUM_WIRES = CircuitBuilder::NUM_WIRES;

    static constexpr size_t NUM_MASKING_POLYNOMIALS = 1;

    template <typename FF>
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
    using SubrelationSeparator = FF;

    // +1 for pow_zeta, +1 for Row Disabling Polynomial (ZK)
    static constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = MAX_PARTIAL_RELATION_LENGTH + 2;
    static constexpr size_t NUM_RELATIONS = std::tuple_size_v<Relations>;

    static constexpr size_t num_frs_comm = FrCodec::calc_num_fields<Commitment>();
    static constexpr size_t num_frs_ff = FrCodec::calc_num_fields<FF>();

    // Proof length for Grumpkin ZK with committed sumcheck and IPA
    static constexpr size_t PROOF_LENGTH_WITHOUT_PUB_INPUTS(size_t virtual_log_n = VIRTUAL_LOG_N)
    {
        return /* 1. NUM_WITNESS_ENTITIES commitments */ (NUM_WITNESS_ENTITIES * num_frs_comm) +
               /* 2. Libra concatenation commitment */ (num_frs_comm) +
               /* 3. Libra sum */ (num_frs_ff) +
               /* 4. virtual_log_n sumcheck univariate commitments (committed sumcheck) */
               (virtual_log_n * num_frs_comm) +
               /* 5. 2 * virtual_log_n sumcheck univariate evaluations */
               (2 * virtual_log_n * num_frs_ff) +
               /* 6. NUM_ALL_ENTITIES sumcheck evaluations */ (NUM_ALL_ENTITIES * num_frs_ff) +
               /* 7. Libra claimed evaluation */ (num_frs_ff) +
               /* 8. Libra grand sum commitment */ (num_frs_comm) +
               /* 9. Libra quotient commitment */ (num_frs_comm) +
               /* 10. virtual_log_n - 1 Gemini Fold commitments */
               ((virtual_log_n - 1) * num_frs_comm) +
               /* 11. virtual_log_n Gemini a evaluations */
               (virtual_log_n * num_frs_ff) +
               /* 12. NUM_SMALL_IPA_EVALUATIONS libra evals */ (NUM_SMALL_IPA_EVALUATIONS * num_frs_ff) +
               /* 13. Shplonk Q commitment */ (num_frs_comm);
        // Note: IPA proof data (L_i, R_i, a_zero) is appended by the IPA prover
    }

    static constexpr size_t FINAL_PCS_MSM_SIZE(size_t log_n = VIRTUAL_LOG_N)
    {
        return NUM_UNSHIFTED_ENTITIES + log_n + 2 + NUM_LIBRA_COMMITMENTS;
    }

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

    template <typename DataType, bool HasZK_ = HasZK> class MaskingEntities {
      public:
        auto get_all() { return RefArray<DataType, 0>{}; }
        auto get_all() const { return RefArray<const DataType, 0>{}; }
        static auto get_labels() { return std::vector<std::string>{}; }
    };

    template <typename DataType> class MaskingEntities<DataType, true> {
      public:
        DEFINE_FLAVOR_MEMBERS(DataType, gemini_masking_poly)
    };

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
        // All witness entities are masked in ZK mode
        auto get_masked() { return get_all(); }
        auto get_masked() const { return get_all(); }
    };

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

    template <typename DataType> using AllEntities = AllEntities_<DataType, HasZK>;

    // Derive entity counts from the actual struct definitions
    static constexpr size_t NUM_PRECOMPUTED_ENTITIES = PrecomputedEntities<FF>::_members_size;
    static constexpr size_t NUM_WITNESS_ENTITIES = WitnessEntities<FF>::_members_size + NUM_MASKING_POLYNOMIALS;
    static constexpr size_t NUM_SHIFTED_ENTITIES = ShiftedEntities<FF>::_members_size;
    static constexpr size_t NUM_UNSHIFTED_ENTITIES = NUM_PRECOMPUTED_ENTITIES + NUM_WITNESS_ENTITIES;
    static constexpr size_t NUM_ALL_ENTITIES = NUM_UNSHIFTED_ENTITIES + NUM_SHIFTED_ENTITIES;

    // Note: offset=2 (HasZK) accounts for Q + gemini_masking_poly, so shifted_start must NOT include masking poly
    static constexpr RepeatedCommitmentsData REPEATED_COMMITMENTS = RepeatedCommitmentsData(
        NUM_PRECOMPUTED_ENTITIES, NUM_PRECOMPUTED_ENTITIES + NUM_WITNESS_ENTITIES - NUM_MASKING_POLYNOMIALS,
        NUM_SHIFTED_ENTITIES);

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

    // VK hash lives in transcript DataType space (bb::fr from Poseidon2), not FF space (bb::fq)
    using VKAndHash = VKAndHash_<typename Codec::DataType, VerificationKey>;

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

    template <typename Commitment_, typename VerificationKey_, bool HasZK_ = HasZK>
    class VerifierCommitments_ : public AllEntities_<Commitment_, HasZK_> {
      public:
        VerifierCommitments_(const std::shared_ptr<VerificationKey_>& verification_key,
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

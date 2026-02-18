// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/flavor/mega_flavor.hpp"
#include "barretenberg/flavor/repeated_commitments_data.hpp"

namespace bb {

/**
 * @brief MultiMegaFlavor batches 4 polynomials per interleaved commitment, reducing witness commitments from 24 to 11.
 *
 * @details Key constraint: All polynomials in a batch must have the same shift property (all shiftable OR all
 * unshiftable). Databus polynomials needed for consistency checks (calldata, secondary_calldata, return_data)
 * are placed in their own padded groups so their interleaved commitments can be used directly.
 *
 * Batching layout (11 interleaved witness commits):
 *
 * ROUND 1 (before eta) - 7 commits:
 *   W₁  (shiftable):   [w_l, w_r, w_o, ZERO]
 *   W₂  (unshiftable): [ecc_op_wire_1, ecc_op_wire_2, ecc_op_wire_3, ecc_op_wire_4]
 *   W₃  (unshiftable): [calldata, ZERO, ZERO, ZERO]
 *   W₄  (unshiftable): [secondary_calldata, ZERO, ZERO, ZERO]
 *   W₅  (unshiftable): [calldata_read_counts, calldata_read_tags, secondary_calldata_read_counts,
 *                        secondary_calldata_read_tags]
 *   W₆  (unshiftable): [return_data_read_tags, return_data_read_counts, ZERO, ZERO]
 *   W₇  (unshiftable): [return_data, ZERO, ZERO, ZERO]
 *
 * ROUND 2 (after eta) - 2 commits:
 *   W₈  (shiftable):   [w_4, ZERO, ZERO, ZERO]
 *   W₉  (unshiftable): [lookup_read_counts, lookup_read_tags, ZERO, ZERO]
 *
 * ROUND 3 (after beta/gamma) - 1 commit:
 *   W₁₀ (unshiftable): [lookup_inverses, calldata_inverses, secondary_calldata_inverses, return_data_inverses]
 *
 * ROUND 4 - 1 commit:
 *   W₁₁ (shiftable):   [z_perm, ZERO, ZERO, ZERO]
 *
 * For ZK (HasZK=true), an additional commit:
 *   W₁₂ (unshiftable): [masking_chunk_0, masking_chunk_1, masking_chunk_2, masking_chunk_3]
 *
 * Total: 11 (non-ZK) or 12 (ZK) interleaved witness commits
 */
class MultiMegaFlavor : public MegaFlavor {
  public:
    // Interleaving batch size
    static constexpr size_t INTERLEAVING_BATCH_SIZE = 4;

    // Number of interleaved witness commitments (non-ZK)
    static constexpr size_t NUM_INTERLEAVED_WITNESS_COMMITMENTS = 11;

    // +2 Gemini rounds for k=2 (batch size 4 = 2^2)
    static constexpr size_t INTERLEAVING_LOG_K = 2;

    // ========================================================================
    // HasZK-templated masking entities (mirrors MegaFlavor::MaskingEntities pattern)
    // ========================================================================

    /**
     * @brief MultiMega-specific ZK masking entities.
     * @details When HasZK=false, this class is empty.
     *          When HasZK=true, contains 4 masking chunk polynomials that are committed
     *          as an interleaved group (W₁₀) and participate in sumcheck naturally.
     */
    template <typename DataType, bool HasZK_ = false> class MultiMegaMaskingEntities {
      public:
        auto get_all() { return RefArray<DataType, 0>{}; }
        auto get_all() const { return RefArray<const DataType, 0>{}; }
        static auto get_labels() { return std::vector<std::string>{}; }
    };

    template <typename DataType> class MultiMegaMaskingEntities<DataType, true> {
      public:
        DEFINE_FLAVOR_MEMBERS(DataType, masking_chunk_0, masking_chunk_1, masking_chunk_2, masking_chunk_3)
    };

    // ========================================================================
    // HasZK-templated AllEntities (mirrors MegaFlavor::AllEntities_ pattern)
    // ========================================================================

    template <typename DataType, bool HasZK_ = HasZK>
    class AllEntities_ : public MultiMegaMaskingEntities<DataType, HasZK_>,
                         public PrecomputedEntities<DataType>,
                         public WitnessEntities_<DataType>,
                         public ShiftedEntities<DataType> {
      public:
        DEFINE_COMPOUND_GET_ALL(MultiMegaMaskingEntities<DataType, HasZK_>,
                                PrecomputedEntities<DataType>,
                                WitnessEntities_<DataType>,
                                ShiftedEntities<DataType>)

        auto get_unshifted()
        {
            return concatenate(MultiMegaMaskingEntities<DataType, HasZK_>::get_all(),
                               PrecomputedEntities<DataType>::get_all(),
                               WitnessEntities_<DataType>::get_all());
        };
        auto get_precomputed() { return PrecomputedEntities<DataType>::get_all(); }
        auto get_witness() { return WitnessEntities_<DataType>::get_all(); };
        auto get_witness() const { return WitnessEntities_<DataType>::get_all(); };
        auto get_shifted() { return ShiftedEntities<DataType>::get_all(); };
    };

    template <typename DataType> using AllEntities = AllEntities_<DataType, HasZK>;

    // ========================================================================
    // HasZK-templated AllValues, ProverPolynomials, etc.
    // ========================================================================

    template <bool HasZK_ = HasZK> class AllValues_ : public AllEntities_<FF, HasZK_> {
      public:
        using Base = AllEntities_<FF, HasZK_>;
        using Base::Base;
    };

    using AllValues = AllValues_<HasZK>;

    template <bool HasZK_ = HasZK> class ProverPolynomials_ : public AllEntities_<Polynomial, HasZK_> {
      public:
        ProverPolynomials_() = default;
        ProverPolynomials_(size_t circuit_size)
        {
            for (auto& poly : this->get_to_be_shifted()) {
                poly = Polynomial{ /*memory size*/ circuit_size - 1,
                                   /*largest possible index*/ circuit_size,
                                   /* offset */ 1 };
            }
            for (auto& poly : this->get_unshifted()) {
                if (poly.is_empty()) {
                    poly = Polynomial{ /*memory size*/ circuit_size, /*largest possible index*/ circuit_size };
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
        [[nodiscard]] AllValues_<HasZK_> get_row(size_t row_idx) const
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

    template <bool HasZK_ = HasZK>
    using PartiallyEvaluatedMultivariates_ =
        PartiallyEvaluatedMultivariatesBase<AllEntities_<Polynomial, HasZK_>, ProverPolynomials_<HasZK_>, Polynomial>;

    using PartiallyEvaluatedMultivariates = PartiallyEvaluatedMultivariates_<HasZK>;

    template <typename Commitment_, typename VerificationKey_, bool HasZK_ = HasZK>
    class VerifierCommitments_ : public AllEntities_<Commitment_, HasZK_> {
      public:
        // Default constructor: all commitments zero (for benchmarking with interleaved VK)
        VerifierCommitments_() = default;
        // Single-arg constructor from interleaved VK (benchmarking only - not sound)
        explicit VerifierCommitments_(const std::shared_ptr<VerificationKey_>& verification_key)
        {
            (void)verification_key; // Interleaved VK can't be directly mapped to individual slots
        }
    };

    using VerifierCommitments = VerifierCommitments_<Commitment, VerificationKey, HasZK>;

    template <size_t LENGTH> using ProverUnivariates = AllEntities<bb::Univariate<FF, LENGTH>>;
    using ExtendedEdges = ProverUnivariates<MAX_PARTIAL_RELATION_LENGTH>;

    // ========================================================================
    // HasZK-templated interleaved witness commitments
    // ========================================================================

    /**
     * @brief Container for interleaved witness commitments, templated on HasZK.
     * @details Non-ZK: 11 commitments (W₁-W₁₁). ZK: 12 commitments (W₁-W₁₂ including masking).
     */
    template <typename DataType, bool HasZK_> class InterleavedWitnessCommitments_;

    // Non-ZK: 11 interleaved witness commitments
    // Ordered: unshiftable first, then shiftable at end (enables REPEATED_COMMITMENTS optimization)
    template <typename DataType> class InterleavedWitnessCommitments_<DataType, false> {
      public:
        DEFINE_FLAVOR_MEMBERS(
            DataType,
            interleaved_ecc_op_wires,       // W₂:  [ecc_op_wire_1..4] - unshiftable
            interleaved_calldata,           // W₃:  [calldata, 0, 0, 0] - unshiftable
            interleaved_secondary_calldata, // W₄:  [secondary_calldata, 0, 0, 0] - unshiftable
            interleaved_databus_tags,       // W₅:  [cd_read_counts, cd_read_tags, scd_read_counts, scd_read_tags]
            interleaved_return_data_tags,   // W₆:  [rd_read_tags, rd_read_counts, 0, 0] - unshiftable
            interleaved_return_data,        // W₇:  [return_data, 0, 0, 0] - unshiftable
            interleaved_lookup,             // W₉:  [lookup_read_counts, lookup_read_tags, 0, 0]
            interleaved_inverses,           // W₁₀: all inverses - unshiftable
            interleaved_wires,              // W₁:  [w_l, w_r, w_o, 0] - shiftable
            interleaved_w_4,                // W₈:  [w_4, 0, 0, 0] - shiftable
            interleaved_z_perm)             // W₁₁: [z_perm, 0, 0, 0] - shiftable

        auto get_shiftable() { return RefArray{ interleaved_wires, interleaved_w_4, interleaved_z_perm }; }
        auto get_shiftable() const { return RefArray{ interleaved_wires, interleaved_w_4, interleaved_z_perm }; }
    };

    // ZK: 12 interleaved witness commitments (11 base + masking)
    // Ordered: unshiftable first (including masking), then shiftable at end
    template <typename DataType> class InterleavedWitnessCommitments_<DataType, true> {
      public:
        DEFINE_FLAVOR_MEMBERS(
            DataType,
            interleaved_ecc_op_wires,       // W₂:  [ecc_op_wire_1..4] - unshiftable
            interleaved_calldata,           // W₃:  [calldata, 0, 0, 0] - unshiftable
            interleaved_secondary_calldata, // W₄:  [secondary_calldata, 0, 0, 0] - unshiftable
            interleaved_databus_tags,       // W₅:  [cd_read_counts, cd_read_tags, scd_read_counts, scd_read_tags]
            interleaved_return_data_tags,   // W₆:  [rd_read_tags, rd_read_counts, 0, 0] - unshiftable
            interleaved_return_data,        // W₇:  [return_data, 0, 0, 0] - unshiftable
            interleaved_lookup,             // W₉:  [lookup_read_counts, lookup_read_tags, 0, 0]
            interleaved_inverses,           // W₁₀: all inverses - unshiftable
            interleaved_masking,            // W₁₂: masking chunks - unshiftable
            interleaved_wires,              // W₁:  [w_l, w_r, w_o, 0] - shiftable
            interleaved_w_4,                // W₈:  [w_4, 0, 0, 0] - shiftable
            interleaved_z_perm)             // W₁₁: [z_perm, 0, 0, 0] - shiftable

        auto get_shiftable() { return RefArray{ interleaved_wires, interleaved_w_4, interleaved_z_perm }; }
    };

    // Default alias: non-ZK uses InterleavedWitnessCommitments_<DataType, false> (9 commits)
    template <typename DataType> using InterleavedWitnessCommitments = InterleavedWitnessCommitments_<DataType, HasZK>;
    using InterleavedCommitments = InterleavedWitnessCommitments<Commitment>;

    // ========================================================================
    // HasZK-templated interleaved commitment labels
    // ========================================================================

    template <bool HasZK_>
    class InterleavedCommitmentLabels_ : public InterleavedWitnessCommitments_<std::string, HasZK_> {
      public:
        InterleavedCommitmentLabels_()
        {
            this->interleaved_wires = "INTERLEAVED_WIRES";
            this->interleaved_ecc_op_wires = "INTERLEAVED_ECC_OP_WIRES";
            this->interleaved_calldata = "INTERLEAVED_CALLDATA";
            this->interleaved_secondary_calldata = "INTERLEAVED_SECONDARY_CALLDATA";
            this->interleaved_databus_tags = "INTERLEAVED_DATABUS_TAGS";
            this->interleaved_return_data_tags = "INTERLEAVED_RETURN_DATA_TAGS";
            this->interleaved_return_data = "INTERLEAVED_RETURN_DATA";
            this->interleaved_w_4 = "INTERLEAVED_W_4";
            this->interleaved_lookup = "INTERLEAVED_LOOKUP";
            this->interleaved_inverses = "INTERLEAVED_INVERSES";
            this->interleaved_z_perm = "INTERLEAVED_Z_PERM";
            if constexpr (HasZK_) {
                this->interleaved_masking = "INTERLEAVED_MASKING";
            }
        }
    };

    using InterleavedCommitmentLabels = InterleavedCommitmentLabels_<HasZK>;

    // ========================================================================
    // Interleaved precomputed commitments (same for ZK and non-ZK)
    // ========================================================================

    /**
     * @brief Container for interleaved precomputed commitments (8 total, down from 31).
     *
     * @details Groups are formed by sequential chunking of PrecomputedEntities (batch_size=4).
     * With 31 entities, groups cross semantic boundaries; the last group has only 3 polynomials.
     *
     * Batching layout:
     *   P₁: [q_m, q_c, q_l, q_r]
     *   P₂: [q_o, q_4, q_busread, q_lookup]
     *   P₃: [q_arith, q_delta_range, q_elliptic, q_memory]
     *   P₄: [q_nnf, q_poseidon2_external, q_poseidon2_internal, sigma_1]
     *   P₅: [sigma_2, sigma_3, sigma_4, id_1]
     *   P₆: [id_2, id_3, id_4, table_1]
     *   P₇: [table_2, table_3, table_4, lagrange_first]
     *   P₈: [lagrange_last, lagrange_ecc_op, databus_id] (3 polys, zero-padded)
     */
    template <typename DataType_> class InterleavedPrecomputedCommitments {
      public:
        using DataType = DataType_;
        DEFINE_FLAVOR_MEMBERS(
            DataType,
            interleaved_precomputed_0, // P₁: [q_m, q_c, q_l, q_r]
            interleaved_precomputed_1, // P₂: [q_o, q_4, q_busread, q_lookup]
            interleaved_precomputed_2, // P₃: [q_arith, q_delta_range, q_elliptic, q_memory]
            interleaved_precomputed_3, // P₄: [q_nnf, q_poseidon2_external, q_poseidon2_internal, sigma_1]
            interleaved_precomputed_4, // P₅: [sigma_2, sigma_3, sigma_4, id_1]
            interleaved_precomputed_5, // P₆: [id_2, id_3, id_4, table_1]
            interleaved_precomputed_6, // P₇: [table_2, table_3, table_4, lagrange_first]
            interleaved_precomputed_7) // P₈: [lagrange_last, lagrange_ecc_op, databus_id] (3 polys)
        bool operator==(const InterleavedPrecomputedCommitments&) const = default;
    };

    // Number of interleaved precomputed commitments
    static constexpr size_t NUM_INTERLEAVED_PRECOMPUTED_COMMITMENTS = 8;

    // Total number of interleaved commitments (precomputed + witness)
    static constexpr size_t NUM_ALL_INTERLEAVED_COMMITMENTS =
        NUM_INTERLEAVED_PRECOMPUTED_COMMITMENTS + NUM_INTERLEAVED_WITNESS_COMMITMENTS;

    // Number of shiftable interleaved witness commitments (W₁, W₈, W₁₁)
    static constexpr size_t NUM_SHIFTABLE_INTERLEAVED_COMMITMENTS = 3;

    using InterleavedPrecomputed = InterleavedPrecomputedCommitments<Commitment>;

    /**
     * @brief Labels for interleaved precomputed commitments.
     */
    class InterleavedPrecomputedLabels : public InterleavedPrecomputedCommitments<std::string> {
      public:
        InterleavedPrecomputedLabels()
        {
            interleaved_precomputed_0 = "INTERLEAVED_PRECOMPUTED_0";
            interleaved_precomputed_1 = "INTERLEAVED_PRECOMPUTED_1";
            interleaved_precomputed_2 = "INTERLEAVED_PRECOMPUTED_2";
            interleaved_precomputed_3 = "INTERLEAVED_PRECOMPUTED_3";
            interleaved_precomputed_4 = "INTERLEAVED_PRECOMPUTED_4";
            interleaved_precomputed_5 = "INTERLEAVED_PRECOMPUTED_5";
            interleaved_precomputed_6 = "INTERLEAVED_PRECOMPUTED_6";
            interleaved_precomputed_7 = "INTERLEAVED_PRECOMPUTED_7";
        }
    };

    // FINAL_PCS_MSM_SIZE for interleaved commitments (with REPEATED_COMMITMENTS optimization):
    // 19 unshifted (shifted merged via REPEATED_COMMITMENTS) + 1 (Shplonk Q) + (pcs_log_n - 1) Gemini folds
    // + 1 (G1 identity) + 1 (KZG W)
    // Note: PCS uses pcs_log_n = log_n + INTERLEAVING_LOG_K since Gemini operates on interleaved polynomials
    static constexpr size_t FINAL_PCS_MSM_SIZE(size_t log_n = VIRTUAL_LOG_N)
    {
        const size_t pcs_log_n = log_n + INTERLEAVING_LOG_K;
        // Unshifted commitments: NUM_ALL_INTERLEAVED_COMMITMENTS (19)
        // Shifted commitments: 0 (merged with unshifted via REPEATED_COMMITMENTS)
        // Shplonk Q: 1
        // Gemini folds: pcs_log_n - 1
        // G1 identity: 1
        // KZG W: 1
        return NUM_ALL_INTERLEAVED_COMMITMENTS + 2 + pcs_log_n;
    }

    // VerificationKey stores 8 interleaved precomputed commitments instead of 31 individual ones.
    // The NativeVerificationKey_ base class handles construction (grouping polys in chunks of INTERLEAVING_BATCH_SIZE
    // and calling commit_interleaved), hashing, and serialization.
    using VerificationKey = NativeVerificationKey_<InterleavedPrecomputedCommitments<Commitment>,
                                                   Codec,
                                                   HashFunction,
                                                   CommitmentKey,
                                                   INTERLEAVING_BATCH_SIZE>;

    using VKAndHash = VKAndHash_<FF, VerificationKey>;

    // With the reordered InterleavedWitnessCommitments (unshiftable first, shiftable at end),
    // the shiftable commitments are now contiguous, enabling the REPEATED_COMMITMENTS optimization.
    // This saves NUM_SHIFTABLE_INTERLEAVED_COMMITMENTS (3) points from the final PCS MSM.
    static constexpr size_t SHPLEMINI_OFFSET = 1; // Shplonk:Q
    static constexpr RepeatedCommitmentsData REPEATED_COMMITMENTS =
        RepeatedCommitmentsData(NUM_INTERLEAVED_PRECOMPUTED_COMMITMENTS +
                                    (NUM_INTERLEAVED_WITNESS_COMMITMENTS - NUM_SHIFTABLE_INTERLEAVED_COMMITMENTS),
                                NUM_ALL_INTERLEAVED_COMMITMENTS,
                                NUM_SHIFTABLE_INTERLEAVED_COMMITMENTS);

    /**
     * @brief Interleaving group accessors, templated on AllEntities<DataType>.
     * @details These define the mapping from individual polynomials/evaluations to interleaved groups.
     *          Works for both ProverPolynomials (DataType=Polynomial) and AllValues (DataType=FF).
     *          Returns pointer groups; prover passes directly to PolynomialBatcher,
     *          verifier dereferences to reconstruct batched evaluations via Lagrange basis.
     *          Order: 8 precomputed groups (P₁-P₈) + 11 witness groups (W₁-W₁₁).
     */
    template <typename Entities> static auto get_unshifted_groups(Entities& e)
    {
        using T = std::decay_t<decltype(e.w_l)>;
        using Group = std::vector<T const*>;
        return std::vector<Group>{
            // P₁-P₈: precomputed (sequential chunks of PrecomputedEntities)
            { &e.q_m, &e.q_c, &e.q_l, &e.q_r },
            { &e.q_o, &e.q_4, &e.q_busread, &e.q_lookup },
            { &e.q_arith, &e.q_delta_range, &e.q_elliptic, &e.q_memory },
            { &e.q_nnf, &e.q_poseidon2_external, &e.q_poseidon2_internal, &e.sigma_1 },
            { &e.sigma_2, &e.sigma_3, &e.sigma_4, &e.id_1 },
            { &e.id_2, &e.id_3, &e.id_4, &e.table_1 },
            { &e.table_2, &e.table_3, &e.table_4, &e.lagrange_first },
            { &e.lagrange_last, &e.lagrange_ecc_op, &e.databus_id, nullptr },
            // W₂-W₁₀: unshiftable witness groups first
            { &e.ecc_op_wire_1, &e.ecc_op_wire_2, &e.ecc_op_wire_3, &e.ecc_op_wire_4 },
            { &e.calldata, nullptr, nullptr, nullptr },
            { &e.secondary_calldata, nullptr, nullptr, nullptr },
            { &e.calldata_read_counts,
              &e.calldata_read_tags,
              &e.secondary_calldata_read_counts,
              &e.secondary_calldata_read_tags },
            { &e.return_data_read_tags, &e.return_data_read_counts, nullptr, nullptr },
            { &e.return_data, nullptr, nullptr, nullptr },
            { &e.lookup_read_counts, &e.lookup_read_tags, nullptr, nullptr },
            { &e.lookup_inverses, &e.calldata_inverses, &e.secondary_calldata_inverses, &e.return_data_inverses },
            // W₁, W₈, W₁₁: shiftable witness groups at end (contiguous for REPEATED_COMMITMENTS)
            { &e.w_l, &e.w_r, &e.w_o, nullptr },
            { &e.w_4, nullptr, nullptr, nullptr },
            { &e.z_perm, nullptr, nullptr, nullptr },
        };
    }

    template <typename Entities> static auto get_to_be_shifted_groups(Entities& e)
    {
        using T = std::decay_t<decltype(e.w_l)>;
        using Group = std::vector<T const*>;
        return std::vector<Group>{
            { &e.w_l, &e.w_r, &e.w_o, nullptr },
            { &e.w_4, nullptr, nullptr, nullptr },
            { &e.z_perm, nullptr, nullptr, nullptr },
        };
    }

    template <typename Entities> static auto get_shifted_groups(Entities& e)
    {
        using T = std::decay_t<decltype(e.w_l)>;
        using Group = std::vector<T const*>;
        return std::vector<Group>{
            { &e.w_l_shift, &e.w_r_shift, &e.w_o_shift, nullptr },
            { &e.w_4_shift, nullptr, nullptr, nullptr },
            { &e.z_perm_shift, nullptr, nullptr, nullptr },
        };
    }
};

} // namespace bb

// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/flavor/flavor_macros.hpp"
#include "barretenberg/flavor/mega_interleaving_entities.hpp"
#include "barretenberg/flavor/repeated_commitments_data.hpp"
#include <cstddef>
#include <string>
#include <vector>

namespace bb {

// ============================================================
// Ultra-specific interleaving entity specializations (BS=2)
// ============================================================
// These structs define interleaving-dependent data for UltraFlavor_<BS>.
// BS=1 reuses the generic GroupAccessors_<1>, InterleavingConstants_<1>,
// and OinkGroupDescriptor from mega_interleaving_entities.hpp.
// BS=2 specializations provide Ultra-specific groupings (different entities from Mega).

// ============================================================
// Interleaved witness commitments (Ultra-specific)
// ============================================================

template <typename DataType, size_t BS> class UltraInterleavedWitnessCommitments_;

// BS=1: empty
template <typename DataType> class UltraInterleavedWitnessCommitments_<DataType, 1> {
  public:
    auto get_all() { return RefArray<DataType, 0>{}; }
    auto get_all() const { return RefArray<const DataType, 0>{}; }
    static auto get_labels() { return std::vector<std::string>{}; }
    auto get_shiftable() { return RefArray<DataType, 0>{}; }
    auto get_shiftable() const { return RefArray<const DataType, 0>{}; }
};

// BS=2: 5 interleaved witness commitments (2 unshiftable + 3 shiftable)
template <typename DataType> class UltraInterleavedWitnessCommitments_<DataType, 2> {
  public:
    DEFINE_FLAVOR_MEMBERS(DataType,
                          interleaved_lookup,          // [lookup_read_counts, lookup_read_tags] - unshiftable
                          interleaved_lookup_inverses, // [lookup_inverses, 0] - unshiftable
                          interleaved_wires,           // [w_l, w_r] - shiftable
                          interleaved_w_o_w_4,         // [w_o, w_4] - shiftable
                          interleaved_z_perm)          // [z_perm, 0] - shiftable

    auto get_shiftable() { return RefArray{ interleaved_wires, interleaved_w_o_w_4, interleaved_z_perm }; }
    auto get_shiftable() const { return RefArray{ interleaved_wires, interleaved_w_o_w_4, interleaved_z_perm }; }
};

// ============================================================
// Interleaved precomputed commitments (Ultra-specific)
// ============================================================

template <typename DataType_, size_t BS> class UltraInterleavedPrecomputedCommitments_;

// BS=1: empty
template <typename DataType_> class UltraInterleavedPrecomputedCommitments_<DataType_, 1> {
  public:
    using DataType = DataType_;
    auto get_all() { return RefArray<DataType, 0>{}; }
    auto get_all() const { return RefArray<const DataType, 0>{}; }
    static auto get_labels() { return std::vector<std::string>{}; }
    bool operator==(const UltraInterleavedPrecomputedCommitments_&) const = default;
};

// BS=2: 14 interleaved precomputed commitments (28 entities / 2)
template <typename DataType_> class UltraInterleavedPrecomputedCommitments_<DataType_, 2> {
  public:
    using DataType = DataType_;
    DEFINE_FLAVOR_MEMBERS(DataType,
                          interleaved_precomputed_0,  // P₁:  [q_m, q_c]
                          interleaved_precomputed_1,  // P₂:  [q_l, q_r]
                          interleaved_precomputed_2,  // P₃:  [q_o, q_4]
                          interleaved_precomputed_3,  // P₄:  [q_lookup, q_arith]
                          interleaved_precomputed_4,  // P₅:  [q_delta_range, q_elliptic]
                          interleaved_precomputed_5,  // P₆:  [q_memory, q_nnf]
                          interleaved_precomputed_6,  // P₇:  [q_poseidon2_external, q_poseidon2_internal]
                          interleaved_precomputed_7,  // P₈:  [sigma_1, sigma_2]
                          interleaved_precomputed_8,  // P₉:  [sigma_3, sigma_4]
                          interleaved_precomputed_9,  // P₁₀: [id_1, id_2]
                          interleaved_precomputed_10, // P₁₁: [id_3, id_4]
                          interleaved_precomputed_11, // P₁₂: [table_1, table_2]
                          interleaved_precomputed_12, // P₁₃: [table_3, table_4]
                          interleaved_precomputed_13) // P₁₄: [lagrange_first, lagrange_last]
    bool operator==(const UltraInterleavedPrecomputedCommitments_&) const = default;
};

// ============================================================
// VK precomputed type selector (Ultra-specific)
// ============================================================

template <size_t BS, typename Commitment, typename PrecomputedEntitiesCommitment> struct UltraVKPrecomputedType_ {
    using type = PrecomputedEntitiesCommitment; // BS=1 default
};
template <typename Commitment, typename PrecomputedEntitiesCommitment>
struct UltraVKPrecomputedType_<2, Commitment, PrecomputedEntitiesCommitment> {
    using type = UltraInterleavedPrecomputedCommitments_<Commitment, 2>;
};

// ============================================================
// VerifierCommitments initialization (Ultra-specific, BS-dependent)
// ============================================================

template <size_t BS> struct UltraVerifierCommitmentsInit_;

template <> struct UltraVerifierCommitmentsInit_<1> {
    template <typename Self, typename VK, typename WC>
    static void init(Self& self, const std::shared_ptr<VK>& verification_key, const std::optional<WC>& witness_comms)
    {
        for (auto [dest, src] : zip_view(self.get_precomputed(), verification_key->get_all())) {
            dest = src;
        }
        if (witness_comms.has_value()) {
            for (auto [dest, src] : zip_view(self.get_witness(), witness_comms->get_all())) {
                dest = src;
            }
            // Set shifted commitments
            self.w_l_shift = witness_comms->w_l;
            self.w_r_shift = witness_comms->w_r;
            self.w_o_shift = witness_comms->w_o;
            self.w_4_shift = witness_comms->w_4;
            self.z_perm_shift = witness_comms->z_perm;
        }
    }
};

template <> struct UltraVerifierCommitmentsInit_<2> {
    template <typename Self, typename VK, typename WC>
    static void init(Self&, const std::shared_ptr<VK>&, const std::optional<WC>&)
    {
        // For BS > 1: verifier uses interleaved commitments directly for PCS verification.
    }
};

// ============================================================
// Interleaving constants (Ultra-specific)
// ============================================================

template <size_t BS> struct UltraInterleavingConstants_;

template <> struct UltraInterleavingConstants_<1> {
    static constexpr size_t NUM_INTERLEAVED_PRECOMPUTED_COMMITMENTS = 0;
    static constexpr size_t NUM_INTERLEAVED_WITNESS_COMMITMENTS = 0;
    static constexpr size_t NUM_ALL_INTERLEAVED_COMMITMENTS = 0;
    static constexpr size_t NUM_SHIFTABLE_INTERLEAVED_COMMITMENTS = 0;

    static constexpr RepeatedCommitmentsData make_repeated_commitments(size_t num_precomputed,
                                                                       size_t num_unshifted,
                                                                       size_t num_shifted)
    {
        return RepeatedCommitmentsData(num_precomputed, num_unshifted, num_shifted);
    }

    static constexpr size_t final_pcs_msm_size(size_t num_unshifted, size_t log_n) { return num_unshifted + log_n + 2; }
};

template <> struct UltraInterleavingConstants_<2> {
    static constexpr size_t NUM_INTERLEAVED_PRECOMPUTED_COMMITMENTS = 14;
    static constexpr size_t NUM_INTERLEAVED_WITNESS_COMMITMENTS = 5;
    static constexpr size_t NUM_ALL_INTERLEAVED_COMMITMENTS =
        NUM_INTERLEAVED_PRECOMPUTED_COMMITMENTS + NUM_INTERLEAVED_WITNESS_COMMITMENTS;
    static constexpr size_t NUM_SHIFTABLE_INTERLEAVED_COMMITMENTS = 3;

    static constexpr RepeatedCommitmentsData make_repeated_commitments(size_t /*num_precomputed*/,
                                                                       size_t /*num_unshifted*/,
                                                                       size_t /*num_shifted*/)
    {
        return RepeatedCommitmentsData(NUM_ALL_INTERLEAVED_COMMITMENTS - NUM_SHIFTABLE_INTERLEAVED_COMMITMENTS,
                                       NUM_ALL_INTERLEAVED_COMMITMENTS,
                                       NUM_SHIFTABLE_INTERLEAVED_COMMITMENTS);
    }

    static constexpr size_t final_pcs_msm_size(size_t /*num_unshifted*/, size_t log_n)
    {
        constexpr size_t LOG_K = 1; // log2(2)
        return NUM_ALL_INTERLEAVED_COMMITMENTS + log_n + LOG_K + 2;
    }
};

// ============================================================
// Interleaved commitment labels (Ultra-specific)
// ============================================================

template <size_t BS>
class UltraInterleavedCommitmentLabels_ : public UltraInterleavedWitnessCommitments_<std::string, BS> {
  public:
    UltraInterleavedCommitmentLabels_() = default;
};

template <> class UltraInterleavedCommitmentLabels_<2> : public UltraInterleavedWitnessCommitments_<std::string, 2> {
  public:
    UltraInterleavedCommitmentLabels_()
    {
        interleaved_wires = "INTERLEAVED_WIRES";
        interleaved_lookup = "INTERLEAVED_LOOKUP";
        interleaved_lookup_inverses = "INTERLEAVED_LOOKUP_INVERSES";
        interleaved_w_o_w_4 = "INTERLEAVED_W_O_W_4";
        interleaved_z_perm = "INTERLEAVED_Z_PERM";
    }
};

template <size_t BS>
class UltraInterleavedPrecomputedLabels_ : public UltraInterleavedPrecomputedCommitments_<std::string, BS> {
  public:
    UltraInterleavedPrecomputedLabels_() = default;
};

template <>
class UltraInterleavedPrecomputedLabels_<2> : public UltraInterleavedPrecomputedCommitments_<std::string, 2> {
  public:
    UltraInterleavedPrecomputedLabels_()
    {
        interleaved_precomputed_0 = "INTERLEAVED_PRECOMPUTED_0";
        interleaved_precomputed_1 = "INTERLEAVED_PRECOMPUTED_1";
        interleaved_precomputed_2 = "INTERLEAVED_PRECOMPUTED_2";
        interleaved_precomputed_3 = "INTERLEAVED_PRECOMPUTED_3";
        interleaved_precomputed_4 = "INTERLEAVED_PRECOMPUTED_4";
        interleaved_precomputed_5 = "INTERLEAVED_PRECOMPUTED_5";
        interleaved_precomputed_6 = "INTERLEAVED_PRECOMPUTED_6";
        interleaved_precomputed_7 = "INTERLEAVED_PRECOMPUTED_7";
        interleaved_precomputed_8 = "INTERLEAVED_PRECOMPUTED_8";
        interleaved_precomputed_9 = "INTERLEAVED_PRECOMPUTED_9";
        interleaved_precomputed_10 = "INTERLEAVED_PRECOMPUTED_10";
        interleaved_precomputed_11 = "INTERLEAVED_PRECOMPUTED_11";
        interleaved_precomputed_12 = "INTERLEAVED_PRECOMPUTED_12";
        interleaved_precomputed_13 = "INTERLEAVED_PRECOMPUTED_13";
    }
};

// ============================================================
// Group accessors (Ultra-specific, BS=2)
// ============================================================

template <size_t BS> struct UltraGroupAccessors_;

// BS=1: delegate to generic GroupAccessors_<1>
template <> struct UltraGroupAccessors_<1> {
    template <bool IsConst, typename Entities> static auto get_unshifted_groups(Entities& e)
    {
        return GroupAccessors_<1>::template get_unshifted_groups<IsConst>(e);
    }
    template <typename Entities> static auto get_to_be_shifted_groups(Entities& e)
    {
        return GroupAccessors_<1>::get_to_be_shifted_groups(e);
    }
    template <typename Entities> static auto get_shifted_groups(Entities& e)
    {
        return GroupAccessors_<1>::get_shifted_groups(e);
    }
};

// BS=2: explicit interleaved groups for Ultra entities
template <> struct UltraGroupAccessors_<2> {
    template <bool IsConst, typename Entities> static auto get_unshifted_groups(Entities& e)
    {
        using T = std::decay_t<decltype(e.w_l)>;
        using Ptr = std::conditional_t<IsConst, T const*, T*>;
        using Group = std::vector<Ptr>;
        return std::vector<Group>{
            // P₁-P₁₄: precomputed (sequential pairs)
            { &e.q_m, &e.q_c },
            { &e.q_l, &e.q_r },
            { &e.q_o, &e.q_4 },
            { &e.q_lookup, &e.q_arith },
            { &e.q_delta_range, &e.q_elliptic },
            { &e.q_memory, &e.q_nnf },
            { &e.q_poseidon2_external, &e.q_poseidon2_internal },
            { &e.sigma_1, &e.sigma_2 },
            { &e.sigma_3, &e.sigma_4 },
            { &e.id_1, &e.id_2 },
            { &e.id_3, &e.id_4 },
            { &e.table_1, &e.table_2 },
            { &e.table_3, &e.table_4 },
            { &e.lagrange_first, &e.lagrange_last },
            // Unshiftable witness groups
            { &e.lookup_read_counts, &e.lookup_read_tags },
            { &e.lookup_inverses, nullptr },
            // Shiftable witness groups at end
            { &e.w_l, &e.w_r },
            { &e.w_o, &e.w_4 },
            { &e.z_perm, nullptr },
        };
    }

    template <typename Entities> static auto get_to_be_shifted_groups(Entities& e)
    {
        using T = std::decay_t<decltype(e.w_l)>;
        using Group = std::vector<T const*>;
        return std::vector<Group>{
            { &e.w_l, &e.w_r },
            { &e.w_o, &e.w_4 },
            { &e.z_perm, nullptr },
        };
    }

    template <typename Entities> static auto get_shifted_groups(Entities& e)
    {
        using T = std::decay_t<decltype(e.w_l)>;
        using Group = std::vector<T const*>;
        return std::vector<Group>{
            { &e.w_l_shift, &e.w_r_shift },
            { &e.w_o_shift, &e.w_4_shift },
            { &e.z_perm_shift, nullptr },
        };
    }
};

// ============================================================
// Oink round group descriptors (Ultra-specific, BS-dependent)
// ============================================================

template <size_t BS> struct UltraOinkWitnessRounds_;

// BS=1: individual polynomial descriptors
template <> struct UltraOinkWitnessRounds_<1> {
    template <typename Entities> static auto wires(Entities& e)
    {
        using T = std::decay_t<decltype(e.w_l)>;
        using Ptr = std::conditional_t<std::is_const_v<Entities>, T const*, T*>;
        using D = OinkGroupDescriptor<Ptr>;
        return std::vector<D>{
            { { &e.w_l }, "W_L" },
            { { &e.w_r }, "W_R" },
            { { &e.w_o }, "W_O" },
        };
    }
    template <typename Entities> static auto lookup_and_w4(Entities& e)
    {
        using T = std::decay_t<decltype(e.w_l)>;
        using Ptr = std::conditional_t<std::is_const_v<Entities>, T const*, T*>;
        using D = OinkGroupDescriptor<Ptr>;
        return std::vector<D>{
            { { &e.lookup_read_counts }, "LOOKUP_READ_COUNTS" },
            { { &e.lookup_read_tags }, "LOOKUP_READ_TAGS" },
            { { &e.w_4 }, "W_4" },
        };
    }
    template <typename Entities> static auto inverses(Entities& e)
    {
        using T = std::decay_t<decltype(e.w_l)>;
        using Ptr = std::conditional_t<std::is_const_v<Entities>, T const*, T*>;
        using D = OinkGroupDescriptor<Ptr>;
        return std::vector<D>{
            { { &e.lookup_inverses }, "LOOKUP_INVERSES" },
        };
    }
    template <typename Entities> static auto z_perm(Entities& e)
    {
        using T = std::decay_t<decltype(e.w_l)>;
        using Ptr = std::conditional_t<std::is_const_v<Entities>, T const*, T*>;
        using D = OinkGroupDescriptor<Ptr>;
        return std::vector<D>{
            { { &e.z_perm }, "Z_PERM" },
        };
    }
};

// BS=2: interleaved group descriptors
template <> struct UltraOinkWitnessRounds_<2> {
  private:
    template <typename E>
    using Ptr = std::conditional_t<std::is_const_v<E>,
                                   std::decay_t<decltype(std::declval<E&>().get_all()[0])> const*,
                                   std::decay_t<decltype(std::declval<E&>().get_all()[0])>*>;
    template <typename E> using D = OinkGroupDescriptor<Ptr<E>>;

  public:
    // Entity-level overloads
    template <typename E>
        requires requires(E& e) { e.w_l; }
    static auto wires(E& e)
    {
        return std::vector<D<E>>{
            { { &e.w_l, &e.w_r }, "INTERLEAVED_WIRES" },
        };
    }

    template <typename E>
        requires requires(E& e) { e.w_l; }
    static auto lookup_and_w4(E& e)
    {
        return std::vector<D<E>>{
            { { &e.lookup_read_counts, &e.lookup_read_tags }, "INTERLEAVED_LOOKUP" },
            { { &e.w_o, &e.w_4 }, "INTERLEAVED_W_O_W_4" },
        };
    }

    template <typename E>
        requires requires(E& e) { e.w_l; }
    static auto inverses(E& e)
    {
        return std::vector<D<E>>{
            { { &e.lookup_inverses, nullptr }, "INTERLEAVED_LOOKUP_INVERSES" },
        };
    }

    template <typename E>
        requires requires(E& e) { e.w_l; }
    static auto z_perm(E& e)
    {
        return std::vector<D<E>>{
            { { &e.z_perm, nullptr }, "INTERLEAVED_Z_PERM" },
        };
    }

    // Commitment-level overloads
    template <typename E>
        requires requires(E& e) { e.interleaved_wires; }
    static auto wires(E& e)
    {
        return std::vector<D<E>>{
            { { &e.interleaved_wires }, "INTERLEAVED_WIRES" },
        };
    }

    template <typename E>
        requires requires(E& e) { e.interleaved_w_o_w_4; }
    static auto lookup_and_w4(E& e)
    {
        return std::vector<D<E>>{
            { { &e.interleaved_lookup }, "INTERLEAVED_LOOKUP" },
            { { &e.interleaved_w_o_w_4 }, "INTERLEAVED_W_O_W_4" },
        };
    }

    template <typename E>
        requires requires(E& e) { e.interleaved_lookup_inverses; }
    static auto inverses(E& e)
    {
        return std::vector<D<E>>{
            { { &e.interleaved_lookup_inverses }, "INTERLEAVED_LOOKUP_INVERSES" },
        };
    }

    template <typename E>
        requires requires(E& e) { e.interleaved_z_perm; }
    static auto z_perm(E& e)
    {
        return std::vector<D<E>>{
            { { &e.interleaved_z_perm }, "INTERLEAVED_Z_PERM" },
        };
    }
};

} // namespace bb

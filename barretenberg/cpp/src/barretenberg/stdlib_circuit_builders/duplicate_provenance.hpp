#pragma once
#include <cstddef>
#include <cstdint>
#include <functional>
#include <initializer_list>
#include <optional>
#include <utility>
#include <vector>

namespace bb {

inline constexpr uint64_t DUPLICATE_PROVENANCE_RAW_IDENTITY_TAG = 0;
inline constexpr uint64_t DUPLICATE_PROVENANCE_NESTED_PROVENANCE_TAG = 1;
inline constexpr uint64_t DUPLICATE_PROVENANCE_INTERNED_ID_TAG = 2;
inline constexpr size_t DUPLICATE_PROVENANCE_HASH_COMBINE_CONSTANT = 0x9e3779b9;

/**
 * @brief Categories for the analyzer-only witness-duplicate provenance channel.
 * @details BOOMERANG_DUPLICATE_PROVENANCE: See
 * barretenberg/cpp/src/barretenberg/boomerang_value_detection/WITNESS_DUPLICATE_DETECTION.md.
 * @details Producers (bigfield, MSM, Poseidon2, databus, ecc-op, lookup reads, range decompositions) tag the witnesses
 * they deterministically derive so the boomerang static analyzer can soundly suppress their duplicate values. A
 * category plus a producer-scoped local identity form a provenance group key. Two witnesses may share a key ONLY IF the
 * circuit constraints force them equal on every satisfying assignment. This channel is not part of the proving path or
 * serialization.
 */
enum class DuplicateProvenanceCategory : uint8_t {
    NONE = 0,
    BIGFIELD_REDUCTION,
    MSM_TABLE,
    POSEIDON2_PERMUTATION,
    DATABUS_READ,
    ECC_OP_TABLE,
    LOOKUP_TABLE,
    RANGE_DECOMPOSITION,
    POSEIDON2_CRYPTOGRAPHIC_BINDING,
};

enum class DuplicateCryptographicBindingKind : uint64_t {
    BATCH_MERGE_ECC_OP_HASH = 0,
};

enum class DuplicateCryptographicBindingRole : uint64_t {
    RUNNING_HASH = 0,
    TRANSCRIPT_HASH = 1,
};

inline constexpr size_t DUPLICATE_CRYPTOGRAPHIC_BINDING_KIND_INDEX = 0;
inline constexpr size_t DUPLICATE_CRYPTOGRAPHIC_BINDING_ROLE_INDEX = 1;
inline constexpr size_t DUPLICATE_CRYPTOGRAPHIC_BINDING_SCOPE_SIZE = 2;

using DuplicateProvenanceLocalId = std::vector<uint64_t>;

struct DuplicateProvenance {
    DuplicateProvenanceCategory category = DuplicateProvenanceCategory::NONE;
    DuplicateProvenanceLocalId local_id;

    bool operator==(const DuplicateProvenance& other) const = default;
};

inline DuplicateProvenanceCategory duplicate_provenance_category(const DuplicateProvenance& group_key)
{
    return group_key.category;
}

inline DuplicateProvenanceLocalId duplicate_provenance_local_id(std::initializer_list<uint64_t> identities)
{
    return DuplicateProvenanceLocalId(identities);
}

inline DuplicateProvenanceLocalId batch_merge_ecc_op_hash_binding_local_id(DuplicateCryptographicBindingRole role,
                                                                           std::initializer_list<uint64_t> suffix = {})
{
    DuplicateProvenanceLocalId identities;
    identities.reserve(DUPLICATE_CRYPTOGRAPHIC_BINDING_SCOPE_SIZE + suffix.size());
    identities.emplace_back(static_cast<uint64_t>(DuplicateCryptographicBindingKind::BATCH_MERGE_ECC_OP_HASH));
    identities.emplace_back(static_cast<uint64_t>(role));
    identities.insert(identities.end(), suffix.begin(), suffix.end());
    return identities;
}

inline std::optional<DuplicateCryptographicBindingRole> get_duplicate_cryptographic_binding_role(
    const DuplicateProvenanceLocalId& identities)
{
    if (identities.size() <= DUPLICATE_CRYPTOGRAPHIC_BINDING_ROLE_INDEX) {
        return std::nullopt;
    }

    const auto role =
        static_cast<DuplicateCryptographicBindingRole>(identities[DUPLICATE_CRYPTOGRAPHIC_BINDING_ROLE_INDEX]);
    switch (role) {
    case DuplicateCryptographicBindingRole::RUNNING_HASH:
    case DuplicateCryptographicBindingRole::TRANSCRIPT_HASH:
        return role;
    }

    return std::nullopt;
}

inline void append_duplicate_provenance_identity(DuplicateProvenanceLocalId& identities, uint64_t identity)
{
    identities.emplace_back(identity);
}

inline void append_duplicate_provenance_identity(DuplicateProvenanceLocalId& identities,
                                                 const DuplicateProvenanceLocalId& suffix)
{
    identities.insert(identities.end(), suffix.begin(), suffix.end());
}

inline DuplicateProvenanceLocalId duplicate_provenance_nested_identity(const DuplicateProvenance& provenance)
{
    DuplicateProvenanceLocalId identities{ DUPLICATE_PROVENANCE_NESTED_PROVENANCE_TAG,
                                           static_cast<uint64_t>(provenance.category) };
    append_duplicate_provenance_identity(identities, provenance.local_id);
    return identities;
}

inline DuplicateProvenanceLocalId duplicate_provenance_interned_identity(uint64_t interned_id)
{
    return DuplicateProvenanceLocalId{ DUPLICATE_PROVENANCE_INTERNED_ID_TAG, interned_id };
}

struct DuplicateProvenanceHasher {
    size_t operator()(const DuplicateProvenance& provenance) const
    {
        size_t seed = std::hash<uint8_t>()(static_cast<uint8_t>(provenance.category));
        for (const uint64_t identity : provenance.local_id) {
            seed ^= std::hash<uint64_t>()(identity) + DUPLICATE_PROVENANCE_HASH_COMBINE_CONSTANT + (seed << 6) +
                    (seed >> 2);
        }
        return seed;
    }
};

} // namespace bb

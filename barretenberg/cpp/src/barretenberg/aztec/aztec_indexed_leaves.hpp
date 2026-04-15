// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/aztec/aztec_constants.hpp"
#include "barretenberg/common/utils.hpp"
#include "barretenberg/crypto/merkle_tree/types.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/serialize/msgpack.hpp"

namespace bb::aztec {

using bb::fr;
using bb::crypto::merkle_tree::index_t;

struct NullifierLeafValue {
    fr nullifier;

    SERIALIZATION_FIELDS(nullifier)

    NullifierLeafValue() = default;
    NullifierLeafValue(const fr& n)
        : nullifier(n)
    {}
    NullifierLeafValue(const NullifierLeafValue& other) = default;
    NullifierLeafValue(NullifierLeafValue&& other) = default;
    NullifierLeafValue& operator=(const NullifierLeafValue& other)
    {
        if (this != &other) {
            nullifier = other.nullifier;
        }
        return *this;
    }

    NullifierLeafValue& operator=(NullifierLeafValue&& other) noexcept
    {
        if (this != &other) {
            nullifier = other.nullifier;
        }
        return *this;
    }
    ~NullifierLeafValue() = default;

    static bool is_updateable() { return false; }

    bool operator==(NullifierLeafValue const& other) const { return nullifier == other.nullifier; }

    friend std::ostream& operator<<(std::ostream& os, const NullifierLeafValue& v)
    {
        os << "nullifier = " << v.nullifier;
        return os;
    }

    fr get_key() const { return nullifier; }

    bool is_empty() const { return nullifier.is_zero(); }

    std::vector<fr> get_hash_inputs(fr nextKey, fr nextIndex) const
    {
        return std::vector<fr>({ fr(DOM_SEP__NULLIFIER_LEAF), nullifier, nextKey, nextIndex });
    }

    operator uint256_t() const { return get_key(); }

    static NullifierLeafValue empty() { return { fr::zero() }; }

    static NullifierLeafValue padding(index_t i) { return { i }; }

    size_t hash() const noexcept { return std::hash<fr>{}(nullifier); }

    static std::string name() { return "NullifierLeafValue"; };
};

struct PublicDataLeafValue {
    fr slot;
    fr value;

    SERIALIZATION_FIELDS(slot, value)

    PublicDataLeafValue() = default;
    PublicDataLeafValue(const fr& s, const fr& v)
        : slot(s)
        , value(v)
    {}
    PublicDataLeafValue(const PublicDataLeafValue& other) = default;
    PublicDataLeafValue(PublicDataLeafValue&& other) = default;
    PublicDataLeafValue& operator=(const PublicDataLeafValue& other)
    {
        if (this != &other) {
            value = other.value;
            slot = other.slot;
        }
        return *this;
    }

    PublicDataLeafValue& operator=(PublicDataLeafValue&& other) noexcept
    {
        if (this != &other) {
            value = other.value;
            slot = other.slot;
        }
        return *this;
    }
    ~PublicDataLeafValue() = default;

    static bool is_updateable() { return true; }

    bool operator==(PublicDataLeafValue const& other) const { return value == other.value && slot == other.slot; }

    friend std::ostream& operator<<(std::ostream& os, const PublicDataLeafValue& v)
    {
        os << "slot = " << v.slot << " : value = " << v.value;
        return os;
    }

    fr get_key() const { return slot; }

    bool is_empty() const { return slot == fr::zero() && value == fr::zero(); }

    std::vector<fr> get_hash_inputs(fr nextSlot, fr nextIndex) const
    {
        return std::vector<fr>({ fr(DOM_SEP__PUBLIC_DATA_LEAF), slot, value, nextSlot, nextIndex });
    }

    operator uint256_t() const { return get_key(); }

    static PublicDataLeafValue empty() { return { fr::zero(), fr::zero() }; }

    static PublicDataLeafValue padding(index_t i) { return { i, fr::zero() }; }

    size_t hash() const noexcept { return utils::hash_as_tuple(value, slot); }

    static std::string name() { return "PublicDataLeafValue"; };
};

} // namespace bb::aztec

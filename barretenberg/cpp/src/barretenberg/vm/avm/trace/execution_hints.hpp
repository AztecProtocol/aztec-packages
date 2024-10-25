#pragma once

#include "barretenberg/ecc/groups/affine_element.hpp"
#include "barretenberg/vm/avm/generated/flavor_settings.hpp"

namespace bb::avm_trace {

using FF = AvmFlavorSettings::FF;
using AffinePoint = grumpkin::g1::affine_element;

struct ExternalCallHint {
    FF success;
    std::vector<FF> return_data;
    uint32_t l2_gas_used;
    uint32_t da_gas_used;
    FF end_side_effect_counter;
    std::vector<uint8_t> bytecode;
};

// Add support for deserialization of ExternalCallHint. This is implicitly used by serialize::read
// when trying to read std::vector<ExternalCallHint>.
inline void read(uint8_t const*& it, ExternalCallHint& hint)
{
    using serialize::read;
    read(it, hint.success);
    read(it, hint.return_data);
    read(it, hint.da_gas_used);
    read(it, hint.l2_gas_used);
    read(it, hint.end_side_effect_counter);
    read(it, hint.bytecode);
}

struct PublicKeysHint {
    AffinePoint nullifier_key;
    /** Incoming viewing public key */
    AffinePoint incoming_viewing_key;
    /** Outgoing viewing public key */
    AffinePoint outgoing_viewing_key;
    /** Tagging viewing public key */
    AffinePoint tagging_key;

    std::vector<FF> to_fields() const
    {
        return { nullifier_key.x,        nullifier_key.y,        incoming_viewing_key.x, incoming_viewing_key.y,
                 outgoing_viewing_key.x, outgoing_viewing_key.y, tagging_key.x,          tagging_key.y };
    }
};

struct ContractInstanceHint {
    FF address;
    FF instance_found_in_address;
    FF salt;
    FF deployer_addr;
    FF contract_class_id;
    FF initialisation_hash;
    PublicKeysHint public_keys;
};

inline void read(uint8_t const*& it, PublicKeysHint& hint)
{
    using serialize::read;
    // CAREFUL: We assume we never receive a point at infinity here
    // TS does not serialize the infinity flag when converting to buffer
    read(it, hint.nullifier_key);
    read(it, hint.incoming_viewing_key);
    read(it, hint.outgoing_viewing_key);
    read(it, hint.tagging_key);
}
// Add support for deserialization of ContractInstanceHint.
inline void read(uint8_t const*& it, ContractInstanceHint& hint)
{
    using serialize::read;
    read(it, hint.address);
    read(it, hint.instance_found_in_address);
    read(it, hint.salt);
    read(it, hint.deployer_addr);
    read(it, hint.contract_class_id);
    read(it, hint.initialisation_hash);
    read(it, hint.public_keys);
}

struct ExecutionHints {
    std::vector<std::pair<FF, FF>> storage_value_hints;
    std::vector<std::pair<FF, FF>> note_hash_exists_hints;
    std::vector<std::pair<FF, FF>> nullifier_exists_hints;
    std::vector<std::pair<FF, FF>> l1_to_l2_message_exists_hints;
    std::vector<ExternalCallHint> externalcall_hints;
    std::map<FF, ContractInstanceHint> contract_instance_hints;

    ExecutionHints() = default;

    // Builder.
    ExecutionHints& with_storage_value_hints(std::vector<std::pair<FF, FF>> storage_value_hints)
    {
        this->storage_value_hints = std::move(storage_value_hints);
        return *this;
    }
    ExecutionHints& with_note_hash_exists_hints(std::vector<std::pair<FF, FF>> note_hash_exists_hints)
    {
        this->note_hash_exists_hints = std::move(note_hash_exists_hints);
        return *this;
    }
    ExecutionHints& with_nullifier_exists_hints(std::vector<std::pair<FF, FF>> nullifier_exists_hints)
    {
        this->nullifier_exists_hints = std::move(nullifier_exists_hints);
        return *this;
    }
    ExecutionHints& with_l1_to_l2_message_exists_hints(std::vector<std::pair<FF, FF>> l1_to_l2_message_exists_hints)
    {
        this->l1_to_l2_message_exists_hints = std::move(l1_to_l2_message_exists_hints);
        return *this;
    }
    ExecutionHints& with_externalcall_hints(std::vector<ExternalCallHint> externalcall_hints)
    {
        this->externalcall_hints = std::move(externalcall_hints);
        return *this;
    }
    ExecutionHints& with_contract_instance_hints(std::map<FF, ContractInstanceHint> contract_instance_hints)
    {
        this->contract_instance_hints = std::move(contract_instance_hints);
        return *this;
    }

    static void push_vec_into_map(std::unordered_map<uint32_t, FF>& into_map,
                                  const std::vector<std::pair<FF, FF>>& from_pair_vec)
    {
        for (const auto& pair : from_pair_vec) {
            into_map[static_cast<uint32_t>(pair.first)] = pair.second;
        }
    }

    // TODO: Cache.
    // Side effect counter -> value
    std::unordered_map<uint32_t, FF> get_side_effect_hints() const
    {
        std::unordered_map<uint32_t, FF> hints_map;
        push_vec_into_map(hints_map, storage_value_hints);
        push_vec_into_map(hints_map, nullifier_exists_hints);
        return hints_map;
    }

    // Leaf index -> exists
    std::unordered_map<uint32_t, FF> get_leaf_index_hints() const
    {
        std::unordered_map<uint32_t, FF> hints_map;
        push_vec_into_map(hints_map, note_hash_exists_hints);
        push_vec_into_map(hints_map, l1_to_l2_message_exists_hints);
        return hints_map;
    }

    static ExecutionHints from(const std::vector<uint8_t>& data)
    {
        std::vector<std::pair<FF, FF>> storage_value_hints;
        std::vector<std::pair<FF, FF>> note_hash_exists_hints;
        std::vector<std::pair<FF, FF>> nullifier_exists_hints;
        std::vector<std::pair<FF, FF>> l1_to_l2_message_exists_hints;

        using serialize::read;
        const auto* it = data.data();
        read(it, storage_value_hints);
        read(it, note_hash_exists_hints);
        read(it, nullifier_exists_hints);
        read(it, l1_to_l2_message_exists_hints);

        std::vector<ExternalCallHint> externalcall_hints;
        read(it, externalcall_hints);

        std::vector<ContractInstanceHint> contract_instance_hints_vec;
        read(it, contract_instance_hints_vec);
        std::map<FF, ContractInstanceHint> contract_instance_hints;
        for (const auto& instance : contract_instance_hints_vec) {
            contract_instance_hints[instance.address] = instance;
        }

        if (it != data.data() + data.size()) {
            throw_or_abort("Failed to deserialize ExecutionHints: only read" + std::to_string(it - data.data()) +
                           " bytes out of " + std::to_string(data.size()) + " bytes");
        }

        return { std::move(storage_value_hints),    std::move(note_hash_exists_hints),
                 std::move(nullifier_exists_hints), std::move(l1_to_l2_message_exists_hints),
                 std::move(externalcall_hints),     std::move(contract_instance_hints) };
    }

  private:
    ExecutionHints(std::vector<std::pair<FF, FF>> storage_value_hints,
                   std::vector<std::pair<FF, FF>> note_hash_exists_hints,
                   std::vector<std::pair<FF, FF>> nullifier_exists_hints,
                   std::vector<std::pair<FF, FF>> l1_to_l2_message_exists_hints,
                   std::vector<ExternalCallHint> externalcall_hints,
                   std::map<FF, ContractInstanceHint> contract_instance_hints)
        : storage_value_hints(std::move(storage_value_hints))
        , note_hash_exists_hints(std::move(note_hash_exists_hints))
        , nullifier_exists_hints(std::move(nullifier_exists_hints))
        , l1_to_l2_message_exists_hints(std::move(l1_to_l2_message_exists_hints))
        , externalcall_hints(std::move(externalcall_hints))
        , contract_instance_hints(std::move(contract_instance_hints))
    {}
};

} // namespace bb::avm_trace

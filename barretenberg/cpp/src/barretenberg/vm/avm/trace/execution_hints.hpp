#pragma once

#include "barretenberg/vm/avm/generated/flavor_settings.hpp"

namespace bb::avm_trace {

using FF = AvmFlavorSettings::FF;

struct ExternalCallHint {
    FF success;
    std::vector<FF> return_data;
    uint32_t l2_gas_used;
    uint32_t da_gas_used;
    FF end_side_effect_counter;
    FF contract_address;
};

// Add support for deserialization of ExternalCallHint. This is implicitly used by serialize::read
// when trying to read std::vector<ExternalCallHint>.
inline void read(uint8_t const*& it, ExternalCallHint& hint)
{
    using serialize::read;
    read(it, hint.success);
    read(it, hint.return_data);
    read(it, hint.l2_gas_used);
    read(it, hint.da_gas_used);
    read(it, hint.end_side_effect_counter);
    read(it, hint.contract_address);
}

struct ContractClassIdHint {
    FF artifact_hash;
    FF private_fn_root;
    FF public_bytecode_commitment;
};

inline void read(uint8_t const*& it, ContractClassIdHint& preimage)
{
    using serialize::read;
    read(it, preimage.artifact_hash);
    read(it, preimage.private_fn_root);
    read(it, preimage.public_bytecode_commitment);
}

struct ContractInstanceHint {
    FF address;
    bool exists; // Useful for membership checks
    FF salt;
    FF deployer_addr;
    FF contract_class_id;
    FF initialisation_hash;
    FF public_key_hash;
};

// Add support for deserialization of ContractInstanceHint.
inline void read(uint8_t const*& it, ContractInstanceHint& hint)
{
    using serialize::read;
    read(it, hint.address);
    read(it, hint.exists);
    read(it, hint.salt);
    read(it, hint.deployer_addr);
    read(it, hint.contract_class_id);
    read(it, hint.initialisation_hash);
    read(it, hint.public_key_hash);
}

struct AvmContractBytecode {
    std::vector<uint8_t> bytecode;
    ContractInstanceHint contract_instance{};
    ContractClassIdHint contract_class_id_preimage{};

    AvmContractBytecode() = default;
    AvmContractBytecode(std::vector<uint8_t> bytecode,
                        ContractInstanceHint contract_instance,
                        ContractClassIdHint contract_class_id_preimage)
        : bytecode(std::move(bytecode))
        , contract_instance(contract_instance)
        , contract_class_id_preimage(contract_class_id_preimage)
    {}
    AvmContractBytecode(std::vector<uint8_t> bytecode)
        : bytecode(std::move(bytecode))
    {}
};

inline void read(uint8_t const*& it, AvmContractBytecode& bytecode)
{
    using serialize::read;
    read(it, bytecode.bytecode);
    read(it, bytecode.contract_instance);
    read(it, bytecode.contract_class_id_preimage);
}

struct ExecutionHints {
    std::vector<std::pair<FF, FF>> storage_value_hints;
    std::vector<std::pair<FF, FF>> note_hash_exists_hints;
    std::vector<std::pair<FF, FF>> nullifier_exists_hints;
    std::vector<std::pair<FF, FF>> l1_to_l2_message_exists_hints;
    std::vector<ExternalCallHint> externalcall_hints;
    std::map<FF, ContractInstanceHint> contract_instance_hints;
    // We could make this address-indexed
    std::vector<AvmContractBytecode> all_contract_bytecode;

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
    ExecutionHints& with_avm_contract_bytecode(std::vector<AvmContractBytecode> all_contract_bytecode)
    {
        this->all_contract_bytecode = std::move(all_contract_bytecode);
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

        std::vector<AvmContractBytecode> all_contract_bytecode;
        read(it, all_contract_bytecode);

        if (it != data.data() + data.size()) {
            throw_or_abort("Failed to deserialize ExecutionHints: only read " + std::to_string(it - data.data()) +
                           " bytes out of " + std::to_string(data.size()) + " bytes");
        }

        return { std::move(storage_value_hints),    std::move(note_hash_exists_hints),
                 std::move(nullifier_exists_hints), std::move(l1_to_l2_message_exists_hints),
                 std::move(externalcall_hints),     std::move(contract_instance_hints),
                 std::move(all_contract_bytecode) };
    }

  private:
    ExecutionHints(std::vector<std::pair<FF, FF>> storage_value_hints,
                   std::vector<std::pair<FF, FF>> note_hash_exists_hints,
                   std::vector<std::pair<FF, FF>> nullifier_exists_hints,
                   std::vector<std::pair<FF, FF>> l1_to_l2_message_exists_hints,
                   std::vector<ExternalCallHint> externalcall_hints,
                   std::map<FF, ContractInstanceHint> contract_instance_hints,
                   std::vector<AvmContractBytecode> all_contract_bytecode)
        : storage_value_hints(std::move(storage_value_hints))
        , note_hash_exists_hints(std::move(note_hash_exists_hints))
        , nullifier_exists_hints(std::move(nullifier_exists_hints))
        , l1_to_l2_message_exists_hints(std::move(l1_to_l2_message_exists_hints))
        , externalcall_hints(std::move(externalcall_hints))
        , contract_instance_hints(std::move(contract_instance_hints))
        , all_contract_bytecode(std::move(all_contract_bytecode))
    {}
};

} // namespace bb::avm_trace

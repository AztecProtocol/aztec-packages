#pragma once

#include "barretenberg/ecc/groups/affine_element.hpp"
#include "barretenberg/vm/avm/generated/flavor_settings.hpp"

namespace bb::avm_trace {

using FF = bb::avm::AvmFlavorSettings::FF;
using AffinePoint = grumpkin::g1::affine_element;

struct PublicDataTreeLeafPreimage {
    FF slot;
    FF value;
    FF next_index;
    FF next_slot;
};

inline void read(uint8_t const*& it, PublicDataTreeLeafPreimage& hint)
{
    using serialize::read;
    read(it, hint.slot);
    read(it, hint.value);
    read(it, hint.next_index);
    read(it, hint.next_slot);
}

struct PublicDataReadTreeHint {
    PublicDataTreeLeafPreimage leaf_preimage;
    FF leaf_index;
    std::vector<FF> sibling_path;
};

inline void read(uint8_t const*& it, PublicDataReadTreeHint& hint)
{
    using serialize::read;
    read(it, hint.leaf_preimage);
    read(it, hint.leaf_index);
    read(it, hint.sibling_path);
}

struct PublicDataWriteTreeHint {
    PublicDataReadTreeHint low_leaf_membership;
    PublicDataTreeLeafPreimage new_leaf_preimage;
    std::vector<FF> insertion_path;
};

inline void read(uint8_t const*& it, PublicDataWriteTreeHint& hint)
{
    using serialize::read;
    read(it, hint.low_leaf_membership);
    read(it, hint.new_leaf_preimage);
    read(it, hint.insertion_path);
}

struct NullifierLeafPreimage {
    FF nullifier;
    FF next_nullifier;
    FF next_index;
};

inline void read(uint8_t const*& it, NullifierLeafPreimage& hint)
{
    using serialize::read;
    read(it, hint.nullifier);
    read(it, hint.next_nullifier);
    read(it, hint.next_index);
}

struct NullifierReadTreeHint {
    NullifierLeafPreimage low_leaf_preimage;
    FF low_leaf_index;
    std::vector<FF> low_leaf_sibling_path;
};

inline void read(uint8_t const*& it, NullifierReadTreeHint& hint)
{
    using serialize::read;
    read(it, hint.low_leaf_preimage);
    read(it, hint.low_leaf_index);
    read(it, hint.low_leaf_sibling_path);
}

struct NullifierWriteTreeHint {
    NullifierReadTreeHint low_leaf_membership;
    std::vector<FF> insertion_path;
};

inline void read(uint8_t const*& it, NullifierWriteTreeHint& hint)
{
    using serialize::read;
    read(it, hint.low_leaf_membership);
    read(it, hint.insertion_path);
}

struct AppendTreeHint {
    FF leaf_index;
    FF leaf_value;
    std::vector<FF> sibling_path;
};

inline void read(uint8_t const*& it, AppendTreeHint& hint)
{
    using serialize::read;
    read(it, hint.leaf_index);
    read(it, hint.leaf_value);
    read(it, hint.sibling_path);
}

struct ExternalCallHint {
    FF success{};
    std::vector<FF> return_data;
    uint32_t l2_gas_used;
    uint32_t da_gas_used;
    FF end_side_effect_counter{};
    FF contract_address{};
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
    read(it, hint.contract_address);
}

struct ContractClassIdHint {
    FF artifact_hash{};
    FF private_fn_root{};
    FF public_bytecode_commitment{};
};

inline void read(uint8_t const*& it, ContractClassIdHint& preimage)
{
    using serialize::read;
    read(it, preimage.artifact_hash);
    read(it, preimage.private_fn_root);
    read(it, preimage.public_bytecode_commitment);
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
    FF address{};
    bool exists; // Useful for membership checks
    FF salt{};
    FF deployer_addr{};
    FF contract_class_id{};
    FF initialisation_hash{};
    PublicKeysHint public_keys;
    NullifierReadTreeHint membership_hint;
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
    read(it, hint.exists);
    read(it, hint.salt);
    read(it, hint.deployer_addr);
    read(it, hint.contract_class_id);
    read(it, hint.initialisation_hash);
    read(it, hint.public_keys);
    read(it, hint.membership_hint);
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
        , contract_instance(std::move(contract_instance))
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

struct AvmEnqueuedCallHint {
    FF contract_address;
    std::vector<FF> calldata;
};

inline void read(uint8_t const*& it, AvmEnqueuedCallHint& hint)
{
    using serialize::read;
    read(it, hint.contract_address);
    read(it, hint.calldata);
}

struct ExecutionHints {
    std::vector<AvmEnqueuedCallHint> enqueued_call_hints;
    std::map<FF, ContractInstanceHint> contract_instance_hints;
    // We could make this address-indexed
    std::vector<AvmContractBytecode> all_contract_bytecode;
    std::vector<PublicDataReadTreeHint> storage_read_hints;
    std::vector<PublicDataWriteTreeHint> storage_write_hints;
    std::vector<NullifierReadTreeHint> nullifier_read_hints;
    std::vector<NullifierWriteTreeHint> nullifier_write_hints;
    std::vector<AppendTreeHint> note_hash_read_hints;
    std::vector<AppendTreeHint> note_hash_write_hints;
    std::vector<AppendTreeHint> l1_to_l2_message_read_hints;

    ExecutionHints() = default;

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

    static ExecutionHints from(const std::vector<uint8_t>& data)
    {
        using serialize::read;
        const auto* it = data.data();
        std::vector<AvmEnqueuedCallHint> enqueued_call_hints;
        read(it, enqueued_call_hints);

        std::vector<ContractInstanceHint> contract_instance_hints_vec;
        read(it, contract_instance_hints_vec);
        std::map<FF, ContractInstanceHint> contract_instance_hints;
        for (const auto& instance : contract_instance_hints_vec) {
            contract_instance_hints[instance.address] = instance;
        }

        std::vector<AvmContractBytecode> all_contract_bytecode;
        read(it, all_contract_bytecode);

        std::vector<PublicDataReadTreeHint> storage_read_hints;
        read(it, storage_read_hints);

        std::vector<PublicDataWriteTreeHint> storage_write_hints;
        read(it, storage_write_hints);

        std::vector<NullifierReadTreeHint> nullifier_read_hints;
        read(it, nullifier_read_hints);

        std::vector<NullifierWriteTreeHint> nullifier_write_hints;
        read(it, nullifier_write_hints);

        std::vector<AppendTreeHint> note_hash_read_hints;
        read(it, note_hash_read_hints);

        std::vector<AppendTreeHint> note_hash_write_hints;
        read(it, note_hash_write_hints);

        std::vector<AppendTreeHint> l1_to_l2_message_read_hints;
        read(it, l1_to_l2_message_read_hints);

        if (it != data.data() + data.size()) {
            throw_or_abort("Failed to deserialize ExecutionHints: only read " + std::to_string(it - data.data()) +
                           " bytes out of " + std::to_string(data.size()) + " bytes");
        }

        return { std::move(enqueued_call_hints),   std::move(contract_instance_hints),
                 std::move(all_contract_bytecode), std::move(storage_read_hints),
                 std::move(storage_write_hints),   std::move(nullifier_read_hints),
                 std::move(nullifier_write_hints), std::move(note_hash_read_hints),
                 std::move(note_hash_write_hints), std::move(l1_to_l2_message_read_hints)

        };
    }

  private:
    ExecutionHints(std::vector<AvmEnqueuedCallHint> enqueued_call_hints,
                   std::map<FF, ContractInstanceHint> contract_instance_hints,
                   std::vector<AvmContractBytecode> all_contract_bytecode,
                   std::vector<PublicDataReadTreeHint> storage_read_hints,
                   std::vector<PublicDataWriteTreeHint> storage_write_hints,
                   std::vector<NullifierReadTreeHint> nullifier_read_hints,
                   std::vector<NullifierWriteTreeHint> nullifier_write_hints,
                   std::vector<AppendTreeHint> note_hash_read_hints,
                   std::vector<AppendTreeHint> note_hash_write_hints,
                   std::vector<AppendTreeHint> l1_to_l2_message_read_hints)

        : enqueued_call_hints(std::move(enqueued_call_hints))
        , contract_instance_hints(std::move(contract_instance_hints))
        , all_contract_bytecode(std::move(all_contract_bytecode))
        , storage_read_hints(std::move(storage_read_hints))
        , storage_write_hints(std::move(storage_write_hints))
        , nullifier_read_hints(std::move(nullifier_read_hints))
        , nullifier_write_hints(std::move(nullifier_write_hints))
        , note_hash_read_hints(std::move(note_hash_read_hints))
        , note_hash_write_hints(std::move(note_hash_write_hints))
        , l1_to_l2_message_read_hints(std::move(l1_to_l2_message_read_hints))
    {}
};

} // namespace bb::avm_trace

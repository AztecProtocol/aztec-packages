#pragma once

#include "aztec3/circuits/abis/append_only_tree_snapshot.hpp"
#include "aztec3/circuits/abis/global_variables.hpp"
#include "aztec3/circuits/hash.hpp"
#include "aztec3/utils/types/circuit_types.hpp"
#include "aztec3/utils/types/convert.hpp"
#include "aztec3/utils/types/native_types.hpp"

#include <barretenberg/barretenberg.hpp>

#include <array>

namespace aztec3::circuits::abis {

using aztec3::utils::types::CircuitTypes;
using aztec3::utils::types::NativeTypes;
using std::is_same;

template <typename NCT> struct BlockHeader {
    using fr = typename NCT::fr;
    using boolean = typename NCT::boolean;

    // Private data
    fr note_hash_tree_root = 0;
    fr nullifier_tree_root = 0;
    fr contract_tree_root = 0;
    fr l1_to_l2_message_tree_root = 0;
    fr archive_root = 0;
    fr private_kernel_vk_tree_root = 0;  // TODO: future enhancement

    // Public data
    fr public_data_tree_root = 0;
    fr global_variables_hash = 0;

    // for serialization, update with new fields
    MSGPACK_FIELDS(note_hash_tree_root,
                   nullifier_tree_root,
                   contract_tree_root,
                   l1_to_l2_message_tree_root,
                   archive_root,
                   private_kernel_vk_tree_root,
                   public_data_tree_root,
                   global_variables_hash);

    boolean operator==(BlockHeader<NCT> const& other) const
    {
        return note_hash_tree_root == other.note_hash_tree_root && nullifier_tree_root == other.nullifier_tree_root &&
               contract_tree_root == other.contract_tree_root &&
               l1_to_l2_message_tree_root == other.l1_to_l2_message_tree_root && archive_root == other.archive_root &&
               private_kernel_vk_tree_root == other.private_kernel_vk_tree_root &&
               public_data_tree_root == other.public_data_tree_root &&
               global_variables_hash == other.global_variables_hash;
    };

    template <typename Builder> void assert_is_zero()
    {
        static_assert((std::is_same<CircuitTypes<Builder>, NCT>::value));

        note_hash_tree_root.assert_is_zero();
        nullifier_tree_root.assert_is_zero();
        contract_tree_root.assert_is_zero();
        l1_to_l2_message_tree_root.assert_is_zero();
        archive_root.assert_is_zero();
        private_kernel_vk_tree_root.assert_is_zero();
        public_data_tree_root.assert_is_zero();
        global_variables_hash.assert_is_zero();
    }

    template <typename Builder> BlockHeader<CircuitTypes<Builder>> to_circuit_type(Builder& builder) const
    {
        static_assert((std::is_same<NativeTypes, NCT>::value));

        // Capture the circuit builder:
        auto to_ct = [&](auto& e) { return aztec3::utils::types::to_ct(builder, e); };

        BlockHeader<CircuitTypes<Builder>> data = {
            to_ct(note_hash_tree_root),        to_ct(nullifier_tree_root),   to_ct(contract_tree_root),
            to_ct(l1_to_l2_message_tree_root), to_ct(archive_root),          to_ct(private_kernel_vk_tree_root),
            to_ct(public_data_tree_root),      to_ct(global_variables_hash),
        };

        return data;
    };

    template <typename Builder> BlockHeader<NativeTypes> to_native_type() const
    {
        static_assert(std::is_same<CircuitTypes<Builder>, NCT>::value);
        auto to_nt = [&](auto& e) { return aztec3::utils::types::to_nt<Builder>(e); };

        BlockHeader<NativeTypes> data = {
            to_nt(note_hash_tree_root),        to_nt(nullifier_tree_root),   to_nt(contract_tree_root),
            to_nt(l1_to_l2_message_tree_root), to_nt(archive_root),          to_nt(private_kernel_vk_tree_root),
            to_nt(public_data_tree_root),      to_nt(global_variables_hash),
        };

        return data;
    };

    void set_public()
    {
        static_assert(!(std::is_same<NativeTypes, NCT>::value));

        note_hash_tree_root.set_public();
        nullifier_tree_root.set_public();
        contract_tree_root.set_public();
        l1_to_l2_message_tree_root.set_public();
        archive_root.set_public();
        private_kernel_vk_tree_root.set_public();
        public_data_tree_root.set_public();
        global_variables_hash.set_public();
    }

    std::array<fr, 7> to_array() const
    {
        return { note_hash_tree_root,
                 nullifier_tree_root,
                 contract_tree_root,
                 l1_to_l2_message_tree_root,
                 archive_root,  // TODO(#3441) Note private_kernel_vk_tree_root, is not included yet as
                                // it is not present in noir,
                 public_data_tree_root,
                 global_variables_hash };
    }


    fr hash()
    {
        return compute_block_hash(global_variables_hash,
                                  note_hash_tree_root,
                                  nullifier_tree_root,
                                  contract_tree_root,
                                  l1_to_l2_message_tree_root,
                                  public_data_tree_root);
    }
};

}  // namespace aztec3::circuits::abis

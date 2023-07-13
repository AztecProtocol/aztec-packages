#pragma once
#include "msgpack/v3/adaptor/detail/cpp11_define_map_decl.hpp"

#include "aztec3/constants.hpp"

#include "barretenberg/serialize/msgpack_impl/name_value_pair_macro.hpp"

namespace aztec3::circuits::abis {

// Represents constants during serialization (only)
struct ConstantsPacker {
    template <typename Packer> void msgpack_pack(Packer& packer) const
    {
        auto pack = [&](auto&... args) {
            msgpack::type::define_map<decltype(args)...>{ args... }.msgpack_pack(packer);
        };
        // Noter: NVP macro can handle up to 20 arguments so we call it multiple times here. If adding a new constant
        // add it to the last call or introduce a new one if the last call is already "full".
        pack(NVP(ARGS_LENGTH,
                 RETURN_VALUES_LENGTH,
                 READ_REQUESTS_LENGTH,
                 MAX_NEW_COMMITMENTS_PER_CALL,
                 MAX_NEW_NULLIFIERS_PER_CALL,
                 MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL,
                 MAX_PUBLIC_CALL_STACK_LENGTH_PER_CALL,
                 MAX_NEW_L2_TO_L1_MSGS_PER_CALL,
                 MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_CALL,
                 MAX_PUBLIC_DATA_READS_PER_CALL,
                 MAX_NEW_COMMITMENTS_PER_TX,
                 MAX_NEW_NULLIFIERS_PER_TX,
                 MAX_PRIVATE_CALL_STACK_LENGTH_PER_TX,
                 MAX_PUBLIC_CALL_STACK_LENGTH_PER_TX,
                 MAX_NEW_L2_TO_L1_MSGS_PER_TX,
                 MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
                 MAX_PUBLIC_DATA_READS_PER_TX,
                 MAX_NEW_CONTRACTS_PER_TX,
                 MAX_OPTIONALLY_REVEALED_DATA_LENGTH_PER_TX,
                 NUM_ENCRYPTED_LOGS_HASHES_PER_TX),
             NVP(NUM_UNENCRYPTED_LOGS_HASHES_PER_TX,
                 NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP,
                 KERNELS_PER_ROLLUP,
                 VK_TREE_HEIGHT,
                 FUNCTION_TREE_HEIGHT,
                 CONTRACT_TREE_HEIGHT,
                 PRIVATE_DATA_TREE_HEIGHT,
                 PUBLIC_DATA_TREE_HEIGHT,
                 NULLIFIER_TREE_HEIGHT,
                 L1_TO_L2_MSG_TREE_HEIGHT,
                 PRIVATE_DATA_TREE_ROOTS_TREE_HEIGHT,
                 CONTRACT_TREE_ROOTS_TREE_HEIGHT,
                 L1_TO_L2_MSG_TREE_ROOTS_TREE_HEIGHT,
                 ROLLUP_VK_TREE_HEIGHT,
                 CONTRACT_SUBTREE_HEIGHT,
                 CONTRACT_SUBTREE_SIBLING_PATH_LENGTH,
                 PRIVATE_DATA_SUBTREE_HEIGHT,
                 PRIVATE_DATA_SUBTREE_SIBLING_PATH_LENGTH,
                 NULLIFIER_SUBTREE_HEIGHT,
                 NULLIFIER_SUBTREE_SIBLING_PATH_LENGTH),
             NVP(L1_TO_L2_MSG_SUBTREE_HEIGHT,
                 L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH,
                 FUNCTION_SELECTOR_NUM_BYTES,
                 MAPPING_SLOT_PEDERSEN_SEPARATOR,
                 NUM_FIELDS_PER_SHA256));  // <-- Add names of new constants here
    }
};

}  // namespace aztec3::circuits::abis
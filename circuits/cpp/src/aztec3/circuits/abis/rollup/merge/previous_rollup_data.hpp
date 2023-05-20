#pragma once
#include "aztec3/circuits/abis/append_only_tree_snapshot.hpp"
#include "aztec3/circuits/abis/membership_witness.hpp"
#include "aztec3/circuits/abis/rollup/base/base_or_merge_rollup_public_inputs.hpp"
#include "aztec3/constants.hpp"
#include <aztec3/utils/msgpack_derived_output.hpp>
#include <aztec3/utils/types/circuit_types.hpp>
#include <aztec3/utils/types/convert.hpp>
#include <aztec3/utils/types/native_types.hpp>

#include <barretenberg/serialize/msgpack.hpp>

#include <type_traits>

namespace aztec3::circuits::abis {

using aztec3::utils::types::CircuitTypes;
using aztec3::utils::types::NativeTypes;
using std::is_same;

template <typename NCT> struct PreviousRollupData {
    BaseOrMergeRollupPublicInputs<NCT> base_or_merge_rollup_public_inputs;

    NativeTypes::Proof proof;
    std::shared_ptr<NativeTypes::VK> vk;
    NativeTypes::uint32 vk_index;
    MembershipWitness<NCT, ROLLUP_VK_TREE_HEIGHT> vk_sibling_path;

    // for serialization, update with new fields
    MSGPACK_FIELDS(base_or_merge_rollup_public_inputs, proof, vk, vk_index, vk_sibling_path);
    bool operator==(PreviousRollupData<NCT> const&) const = default;
};
template <typename NCT> std::ostream& operator<<(std::ostream& os, PreviousRollupData<NCT> const& obj)
{
    utils::msgpack_derived_output(os, obj);
    return os;
};

}  // namespace aztec3::circuits::abis
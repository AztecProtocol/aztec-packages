#pragma once
#include "aztec3/circuits/abis/append_only_tree_snapshot.hpp"
#include "aztec3/circuits/abis/rollup/merge/previous_rollup_data.hpp"

#include <barretenberg/serialize/msgpack.hpp>

#include <type_traits>

namespace aztec3::circuits::abis {

template <typename NCT> struct MergeRollupInputs {
    std::array<PreviousRollupData<NCT>, 2> previous_rollup_data;

    MSGPACK_FIELDS(previous_rollup_data);
    bool operator==(MergeRollupInputs<NCT> const&) const = default;
};

template <typename NCT> std::ostream& operator<<(std::ostream& os, MergeRollupInputs<NCT> const& obj)
{
    return os << "previous_rollup_data: " << obj.previous_rollup_data << "\n";
};

}  // namespace aztec3::circuits::abis

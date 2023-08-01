#pragma once
#include "private_historic_tree_roots.hpp"

#include "aztec3/circuits/abis/append_only_tree_snapshot.hpp"
#include "aztec3/circuits/abis/global_variables.hpp"
#include "aztec3/utils/types/circuit_types.hpp"
#include "aztec3/utils/types/convert.hpp"
#include "aztec3/utils/types/native_types.hpp"

#include <barretenberg/barretenberg.hpp>

namespace aztec3::circuits::abis {

using aztec3::circuits::abis::PrivateHistoricTreeRoots;
using aztec3::utils::types::CircuitTypes;
using aztec3::utils::types::NativeTypes;
using std::is_same;

template <typename NCT> struct CombinedHistoricTreeRoots {
    using fr = typename NCT::fr;
    using boolean = typename NCT::boolean;

    PrivateHistoricTreeRoots<NCT> private_historic_tree_roots{};

    // TODO(Maddiaa) Experiment adding the rest of the block hash data here.
    fr public_data_tree_root = 0;
    fr prev_global_variables_hash = 0;

    // for serialization, update with new fields
    MSGPACK_FIELDS(private_historic_tree_roots, public_data_tree_root, prev_global_variables_hash);

    boolean operator==(CombinedHistoricTreeRoots<NCT> const& other) const
    {
        return private_historic_tree_roots == other.private_historic_tree_roots &&
               public_data_tree_root == other.public_data_tree_root &&
               prev_global_variables_hash == other.prev_global_variables_hash;
    };

    template <typename Builder> CombinedHistoricTreeRoots<CircuitTypes<Builder>> to_circuit_type(Builder& builder) const
    {
        static_assert((std::is_same<NativeTypes, NCT>::value));

        // Capture the circuit builder:
        auto to_circuit_type = [&](auto& e) { return e.to_circuit_type(builder); };
        auto to_ct = [&](auto& e) { return aztec3::utils::types::to_ct(builder, e); };

        CombinedHistoricTreeRoots<CircuitTypes<Builder>> data = {
            to_circuit_type(private_historic_tree_roots),
            to_ct(public_data_tree_root),
            to_ct(prev_global_variables_hash),
        };

        return data;
    };

    template <typename Builder> CombinedHistoricTreeRoots<NativeTypes> to_native_type() const
    {
        static_assert(std::is_same<CircuitTypes<Builder>, NCT>::value);
        auto to_native_type = [&]<typename T>(T& e) { return e.template to_native_type<Builder>(); };
        auto to_nt = [&](auto& e) { return aztec3::utils::types::to_nt<Builder>(e); };

        CombinedHistoricTreeRoots<NativeTypes> data = {
            to_native_type(private_historic_tree_roots),
            to_nt(public_data_tree_root),
            to_nt(prev_global_variables_hash),
        };

        return data;
    };

    void set_public()
    {
        static_assert(!(std::is_same<NativeTypes, NCT>::value));

        private_historic_tree_roots.set_public();
        public_data_tree_root.set_public();
        prev_global_variables_hash.set_public();
    }
};

template <typename NCT>
std::ostream& operator<<(std::ostream& os, CombinedHistoricTreeRoots<NCT> const& historic_tree_roots)
{
    return os << "private_historic_tree_roots: " << historic_tree_roots.private_historic_tree_roots << "\n"
              << "public_data_tree_root: " << historic_tree_roots.public_data_tree_root << "\n"
              << "prev_global_variables_hash: " << historic_tree_roots.prev_global_variables_hash << "\n";
}

}  // namespace aztec3::circuits::abis

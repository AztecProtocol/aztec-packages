#pragma once
#include <barretenberg/stdlib/primitives/witness/witness.hpp>
#include <aztec3/utils/types/native_types.hpp>
#include <aztec3/utils/types/circuit_types.hpp>
#include <aztec3/utils/types/convert.hpp>
#include "private_old_tree_roots.hpp"

namespace aztec3::circuits::abis {

using aztec3::utils::types::CircuitTypes;
using aztec3::utils::types::NativeTypes;
using plonk::stdlib::witness_t;
using std::is_same;

template <typename NCT> struct CombinedOldTreeRoots {
    typedef typename NCT::fr fr;
    typedef typename NCT::boolean boolean;

    PrivateOldTreeRoots<NCT> private_old_tree_roots;
    fr public_data_tree_root = 0;

    boolean operator==(CombinedOldTreeRoots<NCT> const& other) const
    {
        return private_old_tree_roots == other.private_old_tree_roots &&
               public_data_tree_root == other.public_data_tree_root;
    };

    template <typename Composer> CombinedOldTreeRoots<CircuitTypes<Composer>> to_circuit_type(Composer& composer) const
    {
        static_assert((std::is_same<NativeTypes, NCT>::value));

        // Capture the composer:
        auto to_ct = [&](auto& e) { return aztec3::utils::types::to_ct(composer, e); };
        auto to_circuit_type = [&](auto& e) { return e.to_circuit_type(composer); };

        CombinedOldTreeRoots<CircuitTypes<Composer>> data = {
            to_circuit_type(private_old_tree_roots),
            to_ct(public_data_tree_root),
        };

        return data;
    };

    template <typename Composer> CombinedOldTreeRoots<NativeTypes> to_native_type() const
    {
        static_assert(std::is_same<CircuitTypes<Composer>, NCT>::value);
        auto to_nt = [&](auto& e) { return aztec3::utils::types::to_nt<Composer>(e); };
        auto to_native_type = [&]<typename T>(T& e) { return e.template to_native_type<Composer>(); };

        CombinedOldTreeRoots<NativeTypes> data = {
            to_native_type(private_old_tree_roots),
            to_nt(public_data_tree_root),
        };

        return data;
    };

    void set_public()
    {
        static_assert(!(std::is_same<NativeTypes, NCT>::value));

        private_old_tree_roots.set_public();
        public_data_tree_root.set_public();
    }
};

template <typename NCT> void read(uint8_t const*& it, CombinedOldTreeRoots<NCT>& old_tree_roots)
{
    using serialize::read;

    read(it, old_tree_roots.private_old_tree_roots);
    read(it, old_tree_roots.public_data_tree_root);
};

template <typename NCT> void write(std::vector<uint8_t>& buf, CombinedOldTreeRoots<NCT> const& old_tree_roots)
{
    using serialize::write;

    write(buf, old_tree_roots.private_old_tree_roots);
    write(buf, old_tree_roots.public_data_tree_root);
};

template <typename NCT> std::ostream& operator<<(std::ostream& os, CombinedOldTreeRoots<NCT> const& old_tree_roots)
{
    return os << "private_old_tree_roots: " << old_tree_roots.private_old_tree_roots << "\n"
              << "public_data_tree_root: " << old_tree_roots.public_data_tree_root << "\n";
}

} // namespace aztec3::circuits::abis
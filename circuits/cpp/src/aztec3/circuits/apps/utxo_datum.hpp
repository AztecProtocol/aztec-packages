#pragma once

#include <barretenberg/stdlib/primitives/witness/witness.hpp>
#include <aztec3/utils/types/native_types.hpp>
#include <aztec3/utils/types/circuit_types.hpp>

namespace aztec3::circuits::apps {

using aztec3::utils::types::CircuitTypes;
using aztec3::utils::types::NativeTypes;
using plonk::stdlib::witness_t;

/**
 * @tparam NCT - NativeTypes or CircuitTypes<Composer>
 * @tparam NotePreimage
 */
template <typename NCT, typename NotePreimage> struct UTXOSLoadDatum {
    typedef typename NCT::fr fr;
    typedef typename NCT::address address;
    typedef typename NCT::uint32 uint32;

    fr commitment = 0;
    address contract_address = 0;
    NotePreimage preimage{};

    std::vector<fr> sibling_path;
    uint32 leaf_index;
    fr historic_private_data_tree_root = 0;

    template <typename Composer> auto to_circuit_type(Composer& composer) const
    {
        static_assert(std::is_same<NativeTypes, NCT>::value);

        // Capture the composer:
        auto to_ct = [&](auto& e) { return aztec3::utils::types::to_ct(composer, e); };

        auto preimage_ct = preimage.to_circuit_type(composer);

        UTXOSLoadDatum<CircuitTypes<Composer>, decltype(preimage_ct)> datum = {
            to_ct(commitment),   to_ct(contract_address), preimage_ct,
            to_ct(sibling_path), to_ct(leaf_index),       to_ct(historic_private_data_tree_root),
        };

        return datum;
    };
};

} // namespace aztec3::circuits::apps

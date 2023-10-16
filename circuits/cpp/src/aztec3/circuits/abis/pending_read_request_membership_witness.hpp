#pragma once

#include "aztec3/circuits/abis/membership_witness.hpp"
#include "aztec3/utils/types/circuit_types.hpp"
#include "aztec3/utils/types/convert.hpp"

namespace aztec3::circuits::abis {

using aztec3::utils::types::CircuitTypes;
using aztec3::utils::types::NativeTypes;
using std::is_same;

/**
 * A PendingReadRequestMembershipWitness is similar to a ReadRequestMembershipWitness but
 * handles case of a read request of a note that is not yet committed to the tree, because it is the
 * output of a transaction that has run previously in the same block.
 */
template <typename NCT, unsigned int N> struct PendingReadRequestMembershipWitness {
    using fr = typename NCT::fr;
    using boolean = typename NCT::boolean;

    fr leaf_index = 0;
    std::array<fr, N> sibling_path{};
    fr hint_to_commitment = 0;  // hint to point kernel to the commitment this rr corresponds to

    // For serialization, update with new fields
    MSGPACK_FIELDS(leaf_index, sibling_path, hint_to_commitment);

    boolean operator==(PendingReadRequestMembershipWitness<NCT, N> const& other) const
    {
        return leaf_index == other.leaf_index && sibling_path == other.sibling_path &&
               hint_to_commitment == other.hint_to_commitment;
    };

    template <typename Builder>
    PendingReadRequestMembershipWitness<CircuitTypes<Builder>, N> to_circuit_type(Builder& builder) const
    {
        static_assert((std::is_same<NativeTypes, NCT>::value));

        // Capture the circuit builder:
        auto to_ct = [&](auto& e) { return aztec3::utils::types::to_ct(builder, e); };

        PendingReadRequestMembershipWitness<CircuitTypes<Builder>, N> witness = { to_ct(leaf_index),
                                                                                  to_ct(sibling_path),
                                                                                  to_ct(hint_to_commitment) };

        return witness;
    }

    template <typename Builder> PendingReadRequestMembershipWitness<NativeTypes, N> to_native_type() const
    {
        static_assert((std::is_same<CircuitTypes<Builder>, NCT>::value));

        auto to_nt = [&](auto& e) { return aztec3::utils::types::to_nt<Builder>(e); };

        PendingReadRequestMembershipWitness<NativeTypes, N> witness = { to_nt(leaf_index),
                                                                        map(sibling_path, to_nt),
                                                                        to_nt(hint_to_commitment) };

        return witness;
    }


    void set_public()
    {
        static_assert(!(std::is_same<NativeTypes, NCT>::value));

        leaf_index.set_public();
        for (fr const& e : sibling_path) {
            e.set_public();
        }

        fr(is_transient).set_public();
        hint_to_commitment.set_public();
    }

    boolean is_empty() const
    {
        return aztec3::utils::is_empty(leaf_index) && is_array_empty(sibling_path) &&
               aztec3::utils::is_empty(hint_to_commitment);
    }
};

}  // namespace aztec3::circuits::abis

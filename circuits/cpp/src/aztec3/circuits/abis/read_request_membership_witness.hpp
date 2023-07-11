#pragma once

#include "aztec3/circuits/abis/membership_witness.hpp"
#include "aztec3/utils/types/circuit_types.hpp"
#include "aztec3/utils/types/convert.hpp"

namespace aztec3::circuits::abis {

using aztec3::utils::types::CircuitTypes;
using aztec3::utils::types::NativeTypes;
using std::is_same;

/**
 * A ReadRequestMembershipWitness is similar to a MembershipWitness but includes
 * some additional fields used to direct the kernel regarding whether a read is transient
 * and if so which commitment it corresponds to.
 */
template <typename NCT, unsigned int N> struct ReadRequestMembershipWitness {
    using fr = typename NCT::fr;
    using boolean = typename NCT::boolean;

    fr leaf_index = 0;
    std::array<fr, N> sibling_path{};
    boolean is_transient = false;   // whether or not the read request corresponds to a pending commitment
    fr commitment_index = 0;        // the index of the commitment in its kernel iter's new_commitments private input
    fr commitment_kernel_iter = 0;  // the kernel iter that the rr's commitment is created in

    MSGPACK_FIELDS(leaf_index, sibling_path, is_transient, commitment_index, commitment_kernel_iter);

    boolean operator==(ReadRequestMembershipWitness<NCT, N> const& other) const
    {
        return leaf_index == other.leaf_index && sibling_path == other.sibling_path &&
               is_transient == other.is_transient && commitment_index == other.commitment_index &&
               commitment_kernel_iter == other.commitment_kernel_iter;
    };

    template <typename Builder>
    ReadRequestMembershipWitness<CircuitTypes<Builder>, N> to_circuit_type(Builder& builder) const
    {
        static_assert((std::is_same<NativeTypes, NCT>::value));

        // Capture the circuit builder:
        auto to_ct = [&](auto& e) { return aztec3::utils::types::to_ct(builder, e); };

        ReadRequestMembershipWitness<CircuitTypes<Builder>, N> witness = {
            to_ct(leaf_index),       to_ct(sibling_path),           to_ct(is_transient),
            to_ct(commitment_index), to_ct(commitment_kernel_iter),
        };

        return witness;
    }
};

template <typename NCT, unsigned int N> void read(uint8_t const*& it, ReadRequestMembershipWitness<NCT, N>& obj)
{
    using serialize::read;

    read(it, obj.leaf_index);
    read(it, obj.sibling_path);
    read(it, obj.is_transient);
    read(it, obj.commitment_index);
    read(it, obj.commitment_kernel_iter);
};

template <typename NCT, unsigned int N>
void write(std::vector<uint8_t>& buf, ReadRequestMembershipWitness<NCT, N> const& obj)
{
    using serialize::write;

    write(buf, obj.leaf_index);
    write(buf, obj.sibling_path);
    write(buf, obj.is_transient);
    write(buf, obj.commitment_index);
    write(buf, obj.commitment_kernel_iter);
};

template <typename NCT, unsigned int N>
std::ostream& operator<<(std::ostream& os, ReadRequestMembershipWitness<NCT, N> const& obj)
{
    return os << "leaf_index: " << obj.leaf_index << "\n"
              << "sibling_path: " << obj.sibling_path << "\n"
              << "is_transient: " << obj.is_transient << "\n"
              << "commitment_index: " << obj.commitment_index << "\n"
              << "commitment_kernel_iter: " << obj.commitment_kernel_iter << "\n";
}

}  // namespace aztec3::circuits::abis
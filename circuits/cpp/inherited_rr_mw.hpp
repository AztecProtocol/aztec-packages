#pragma once

#include "aztec3/circuits/abis/membership_witness.hpp"
#include "aztec3/utils/types/circuit_types.hpp"
#include "aztec3/utils/types/convert.hpp"

namespace aztec3::circuits::abis {

using aztec3::utils::types::CircuitTypes;
using aztec3::utils::types::NativeTypes;
using std::is_same;

/**
 * A ReadRequestMembershipWitness hass a MembershipWitness, a commitment_index field (TS->kernel hint),
 * commitment_kernel_iter (TS->kernel hint)
 * and a flag `is_transient` indicating whether or not the read corresponds to
 * a pending commitment.
 *
 * The app circuit has no concept of reading pending/transient commitments specificially.
 * It relies on TS oracle calls to get notes and generate read requests, and it can create
 * new commitments and output them. We can modify the app circuit to output sideeffect_counter
 * alongside each new commitment, new nullifier, and read requests in public inputs.
 *
 * We can also modify the Simulator to compute and store `commitment_index` and `commitment_kernel_iter` alongside
 * each note upon creation (`notifyCreatedNote`).
 *
 * When TS Simulator matches a read request to a pending note, it will construct a ReadRequestMembershipWitness,
 * set `is_transient` to true, and assign `commitment_index` and `commitment_kernel_iter` based on the pending note.
 * The Simulator has fully initialized the ReadRequestMembershipWitness for a transient read here.
 *
 * Reads that are not transient (reads that reference a commitment in the private data tree)
 * will be flagged with `is_transient: false` by the Simulator. The KernelProver will see
 * these non-transient read requests and will compute their MembershipWitnesses while leaving
 * `commitment_index` and `commitment_kernel_iter` as 0.
 *
 * When the kernel sees a transient read request, it knows to skip its merkle membership check.
 * If the current kernel iteration does not match that of the read request's membershipwitness,
 * it will forward the read request to the next kernel iteration via its public inputs.
 * If the current kernel iteration DOES match that of the read request's membershipwitness,
 * it will assert that the read request matches the corresponding new commitment from the app circuit:
 *     `assert(read_request[i] == private_inputs.app_circuit_public_inputs.new_commitments[commitment_index])`
 * it will also assert that the `read_request`'s `sideeffect_counter` is greater than that of the new commitment.
 *
 * How does the simulator tell the KernelProver which `read_requests` are transient, real+non-transient, and
 * dummy+non-transient?
 *
 * Does the kernel even need to see dummy notes? I don't think so.... Dummy notes are there only to
 * ensure that the app circuit always has the same number of notes in its inputs for a given `get` call.
 * But as long as the app-circuit filters them out before pushing them to `read_requests`, the Simulator
 * should filter them out before pushing them to `readRequestMembershipWitnesses`. In fact there is no
 * "filtering" necessary.... The Simulator will generate a static-length array of notes to give to the
 * app circuit, but as long as we can rely on the app-circuit to filter out dummy ones, the Simulator
 * can separately ONLY generate ReadRequestMembershipWitnesses for all non-dummy notes
 * (transient and non-transient).
 */
template <typename NCT, unsigned int N> struct ReadRequestMembershipWitness : MembershipWitness<NCT, N> {
    using fr = typename NCT::fr;
    using boolean = typename NCT::boolean;
    using BaseMW = MembershipWitness<NCT, N>;

    fr commitment_index = 0;        // the index of the commitment in its kernel iter's new_commitments private input
    fr commitment_kernel_iter = 0;  // the kernel iter that the rr's commitment is created in

    // TODO(dbanks12): can we avoid calling out parent's fields explicitly here?
    // MSGPACK_FIELDS(commitment_index,
    //               commitment_kernel_iter,
    //               MembershipWitness<NCT, N>::leaf_index,
    //               MembershipWitness<NCT, N>::sibling_path);
    void msgpack(auto ar)
    {
        // rename things for msgpack
        fr leaf_index = BaseMW::leaf_index;
        std::array<fr, N> sibling_path = BaseMW::sibling_path;

        ar(NVP(commitment_index, commitment_kernel_iter, leaf_index, sibling_path));
    }

    boolean operator==(ReadRequestMembershipWitness<NCT, N> const& other) const
    {
        return BaseMW::operator==(other) && commitment_index == other.commitment_index &&
               commitment_kernel_iter == other.commitment_kernel_iter;
    };

    template <typename Builder>
    ReadRequestMembershipWitness<CircuitTypes<Builder>, N> to_circuit_type(Builder& builder) const
    {
        static_assert((std::is_same<NativeTypes, NCT>::value));

        // Capture the circuit builder:
        auto to_ct = [&](auto& e) { return aztec3::utils::types::to_ct(builder, e); };
        auto to_circuit_type = [&](auto& e) { return e.to_circuit_type(builder); };

        ReadRequestMembershipWitness<CircuitTypes<Builder>, N> witness = BaseMW::to_circuit_type(builder);
        witness.commitment_index = to_ct(commitment_index);
        witness.commitment_kernel_iter = to_ct(commitment_kernel_iter);

        // ReadRequestMembershipWitness<CircuitTypes<Builder>, N> witness = {
        //     to_ct(commitment_index),
        //     to_ct(commitment_kernel_iter),
        //     // TODO(dbanks12): How can we use BaseMW to_circuit_type and then add to it?
        //     to_circuit_type(membership_witness),
        // };

        return witness;
    }
};

template <typename NCT, unsigned int N> void read(uint8_t const*& it, ReadRequestMembershipWitness<NCT, N>& obj)
{
    using serialize::read;

    write(it, static_cast<MembershipWitness<NCT, N>&>(obj));
    read(it, obj.commitment_index);
    read(it, obj.commitment_kernel_iter);
};

template <typename NCT, unsigned int N>
void write(std::vector<uint8_t>& buf, ReadRequestMembershipWitness<NCT, N> const& obj)
{
    using serialize::write;

    write(buf, static_cast<MembershipWitness<NCT, N>&>(obj));
    write(buf, obj.commitment_index);
    write(buf, obj.commitment_kernel_iter);
};

template <typename NCT, unsigned int N>
std::ostream& operator<<(std::ostream& os, ReadRequestMembershipWitness<NCT, N> const& obj)
{
    return os << static_cast<MembershipWitness<NCT, N>&>(obj) << "commitment_index: " << obj.commitment_index << "\n"
              << "commitment_kernel_iter: " << obj.commitment_kernel_iter << "\n";
}

}  // namespace aztec3::circuits::abis
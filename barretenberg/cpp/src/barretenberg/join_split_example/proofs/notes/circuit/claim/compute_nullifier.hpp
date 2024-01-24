#pragma once

#include "../../constants.hpp"
#include "barretenberg/join_split_example/types.hpp"
#include "barretenberg/stdlib/hash/pedersen/pedersen.hpp"

namespace bb::join_split_example::proofs::notes::circuit::claim {

inline field_ct compute_nullifier(field_ct const& note_commitment)
{
    return pedersen_hash::hash(std::vector<field_ct>{ note_commitment }, GeneratorIndex::CLAIM_NOTE_NULLIFIER);

    // Note: unlike for value note nullifiers, we don't need to then Blake2-hash this result (which would provide a
    // psuedorandom-looking nullifier) because the contents of a claim note commitment are public anyway.

    // Note also: nullifying a claim note with a nullifier derived this way _does_ leak _which_ claim note is being
    // nullified. That, in turn, leaks the values contained in the two _output_ value commitments of the claim
    // circuit (identities (publc keys) are NOT leaked though). However, when those value notes are
    // later spent, the value note nullifiers will not reveal that it is those notes being spent.
}

} // namespace bb::join_split_example::proofs::notes::circuit::claim

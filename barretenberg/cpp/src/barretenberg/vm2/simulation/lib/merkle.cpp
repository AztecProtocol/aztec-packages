#include <cstdint>

#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"

namespace bb::avm2::simulation {

using Poseidon2 = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>;

FF root_from_path(const FF& leaf_value, const uint64_t leaf_index, std::span<const FF> path)
{
    FF curr_value = leaf_value;
    uint64_t curr_index = leaf_index;
    for (const auto& i : path) {
        bool index_is_even = (curr_index % 2 == 0);

        curr_value = index_is_even ? Poseidon2::hash({ curr_value, i }) : Poseidon2::hash({ i, curr_value });
        // Halve the index (to get the parent index) as we move up the tree
        curr_index >>= 1;
    }
    return curr_value;
}

FF silo_note_hash(const AztecAddress& contract_address, const FF& note_hash)
{
    return Poseidon2::hash({ GENERATOR_INDEX__SILOED_NOTE_HASH, contract_address, note_hash });
}

FF make_unique_note_hash(const FF& siloed_note_hash, const FF& first_nullifier, uint64_t note_hash_counter)
{
    FF nonce = Poseidon2::hash({ GENERATOR_INDEX__NOTE_HASH_NONCE, first_nullifier, note_hash_counter });
    return Poseidon2::hash({ GENERATOR_INDEX__UNIQUE_NOTE_HASH, nonce, siloed_note_hash });
}

} // namespace bb::avm2::simulation

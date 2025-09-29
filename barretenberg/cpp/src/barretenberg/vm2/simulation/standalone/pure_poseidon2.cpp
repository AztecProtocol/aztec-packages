#include "barretenberg/vm2/simulation/standalone/pure_poseidon2.hpp"

#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/vm2/simulation/interfaces/memory.hpp"

namespace bb::avm2::simulation {

using Poseidon2Hash = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>;
using Poseidon2Perm = crypto::Poseidon2Permutation<crypto::Poseidon2Bn254ScalarFieldParams>;

std::array<FF, 4> PurePoseidon2::permutation(const std::array<FF, 4>& input)
{
    return Poseidon2Perm::permutation(input);
}

FF PurePoseidon2::hash(const std::vector<FF>& input)
{
    return Poseidon2Hash::hash(input);
}

void PurePoseidon2::permutation(MemoryInterface& memory, MemoryAddress src_address, MemoryAddress dst_address)
{
    // TODO: Validate inputs (type, range)
    const std::array<FF, 4> input = {
        memory.get(src_address).as_ff(),
        memory.get(src_address + 1).as_ff(),
        memory.get(src_address + 2).as_ff(),
        memory.get(src_address + 3).as_ff(),
    };
    const std::array<FF, 4> output = Poseidon2Perm::permutation(input);
    for (uint32_t i = 0; i < 4; i++) {
        memory.set(dst_address + i, MemoryValue::from<FF>(output[i]));
    }
}

} // namespace bb::avm2::simulation

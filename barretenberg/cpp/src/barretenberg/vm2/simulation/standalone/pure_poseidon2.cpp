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
    uint64_t max_read_address = static_cast<uint64_t>(src_address) + 3;
    if (max_read_address > AVM_HIGHEST_MEM_ADDRESS) {
        throw Poseidon2Exception("Read address out of range");
    }
    uint64_t max_write_address = static_cast<uint64_t>(dst_address) + 3;
    if (max_write_address > AVM_HIGHEST_MEM_ADDRESS) {
        throw Poseidon2Exception("Write address out of range");
    }

    std::array<FF, 4> input = { 0, 0, 0, 0 };

    // Read 4 elements from memory starting at src_address
    for (uint32_t i = 0; i < 4; i++) {
        const auto& item = memory.get(src_address + i);
        if (item.get_tag() != MemoryTag::FF) {
            throw Poseidon2Exception("An input tag is not FF");
        }
        input[i] = item.as_ff();
    }

    const std::array<FF, 4> output = Poseidon2Perm::permutation(input);
    for (uint32_t i = 0; i < 4; i++) {
        memory.set(dst_address + i, MemoryValue::from<FF>(output[i]));
    }
}

} // namespace bb::avm2::simulation

#include "barretenberg/vm2/simulation/standalone/pure_poseidon2.hpp"

#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/vm2/simulation/events/poseidon2_event.hpp"
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
    try {
        auto zero = MemoryValue::from<FF>(0);
        std::array<MemoryValue, 4> input = { zero, zero, zero, zero };

        // Read 4 elements from memory starting at src_address
        for (uint32_t i = 0; i < 4; i++) {
            input[i] = memory.get(src_address + i);
        }

        // If any of the memory values are not tagged as FF, we throw an error. This is only tested after all elements
        // are loaded as the circuit expects reading and tagging checking to be different temporality groups
        if (std::ranges::any_of(
                input.begin(), input.end(), [](const MemoryValue& val) { return val.get_tag() != MemoryTag::FF; })) {
            throw std::runtime_error("An input tag is not FF");
        }

        const std::array<FF, 4> output = Poseidon2Perm::permutation({
            input[0].as_ff(),
            input[1].as_ff(),
            input[2].as_ff(),
            input[3].as_ff(),
        });
        for (uint32_t i = 0; i < 4; i++) {
            memory.set(dst_address + i, MemoryValue::from<FF>(output[i]));
        }
    } catch (const std::exception& e) {
        throw Poseidon2Exception("Permutation failed, " + std::string(e.what()));
    }
}

} // namespace bb::avm2::simulation

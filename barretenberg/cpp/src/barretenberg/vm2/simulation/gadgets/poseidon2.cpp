#include "barretenberg/vm2/simulation/gadgets/poseidon2.hpp"

#include <algorithm>
#include <array>
#include <cstdint>

#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2_permutation.hpp"
#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/simulation/gadgets/memory.hpp"

using bb::crypto::Poseidon2Bn254ScalarFieldParams;
using bb::crypto::Poseidon2Permutation;

namespace bb::avm2::simulation {

FF Poseidon2::hash(const std::vector<FF>& input)
{
    size_t input_size = input.size();
    // The number of permutation events required to process the input
    auto num_perm_events = (input_size / 3) + static_cast<size_t>(input_size % 3 != 0);
    std::vector<std::array<FF, 4>> intermediate_states;
    // We reserve space for the intermediate permutation states and 1 additional space for the initial state
    intermediate_states.reserve(num_perm_events + 1);

    // The unpadded length of the input is set as the IV
    // The initial permutation state is seeded with the iv at the last input index
    const uint256_t iv = static_cast<uint256_t>(input_size) << 64;
    std::array<FF, 4> perm_state = { 0, 0, 0, iv };
    intermediate_states.push_back(perm_state);

    // Also referred to as cache but is the inputs that will be passed to the permutation function
    std::vector<std::array<FF, 4>> perm_inputs;

    for (size_t i = 0; i < num_perm_events; i++) {
        // We can at most absorb a chunk of 3 elements
        size_t chunk_size = std::min(input_size, static_cast<size_t>(3));
        // Mix the input chunk into the previous permutation output state
        for (size_t j = 0; j < chunk_size; j++) {
            perm_state[j] += input[(i * 3) + j];
        }
        perm_state = permutation(perm_state);
        intermediate_states.push_back(perm_state);

        input_size -= chunk_size;
    }

    hash_events.emit(
        { .inputs = input, .intermediate_states = std::move(intermediate_states), .output = perm_state[0] });
    return perm_state[0];
}

std::array<FF, 4> Poseidon2::permutation(const std::array<FF, 4>& input)
{
    std::array<FF, 4> output = Poseidon2Permutation<Poseidon2Bn254ScalarFieldParams>::permutation(input);
    perm_events.emit({ .input = input, .output = output });
    return output;
}

void Poseidon2::permutation(MemoryInterface& memory, MemoryAddress src_address, MemoryAddress dst_address)
{
    uint32_t execution_clk = execution_id_manager.get_execution_id();
    uint16_t space_id = memory.get_space_id();

    auto zero = MemoryValue::from<FF>(0);
    std::array<MemoryValue, 4> input = { zero, zero, zero, zero };

    // Poseidon2Perm reads and writes 4 sequential elements each. We need to ensure that these memory addresses are
    // within the memory address bounds.
    // Read Addressess: { src_address, src_address + 1, src_address + 2, src_address + 3 }
    // Write Addresses: { dst_address, dst_address + 1, dst_address + 2, dst_address + 3 }
    // So we check that src_address + 3 and dst_address + 3 are within the bounds
    uint64_t max_read_address = static_cast<uint64_t>(src_address) + 3;
    uint64_t max_write_address = static_cast<uint64_t>(dst_address) + 3;
    bool read_out_of_range = gt.gt(max_read_address, AVM_HIGHEST_MEM_ADDRESS);
    bool write_out_of_range = gt.gt(max_write_address, AVM_HIGHEST_MEM_ADDRESS);

    try {
        if (read_out_of_range || write_out_of_range) {
            throw std::runtime_error("src or dst address out of range");
        }

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

        // This calls the Poseidon2 gadget permutation function and so generates events
        std::array<FF, 4> output = permutation({
            input[0].as_ff(),
            input[1].as_ff(),
            input[2].as_ff(),
            input[3].as_ff(),
        });

        // Write the output back to memory starting at dst_address
        for (uint32_t i = 0; i < 4; i++) {
            memory.set(dst_address + i, MemoryValue::from_tag(MemoryTag::FF, output[i]));
        }
        perm_mem_events.emit({ .space_id = space_id,
                               .execution_clk = execution_clk,
                               .src_address = src_address,
                               .dst_address = dst_address,
                               .input = input,
                               .output = output });

    } catch (const std::exception& e) {
        perm_mem_events.emit({ .space_id = space_id,
                               .execution_clk = execution_clk,
                               .src_address = src_address,
                               .dst_address = dst_address,
                               .input = input,
                               .output = { 0, 0, 0, 0 } });
        throw Poseidon2Exception("Permutation failed, " + std::string(e.what()));
    }
}

} // namespace bb::avm2::simulation

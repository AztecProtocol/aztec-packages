#include "barretenberg/vm2/simulation/gadgets/sha256.hpp"

#include <algorithm>
#include <array>
#include <cstdint>
#include <memory>
#include <stdexcept>

#include "barretenberg/vm2/simulation/lib/sha256_compression.hpp"

namespace bb::avm2::simulation {

namespace {

// constants come from barretenberg/cpp/src/barretenberg/crypto/sha256/sha256.cpp
constexpr std::array<uint32_t, 64> round_constants{
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
};

} // namespace

// Don't worry about any weird edge cases since we have fixed non-zero shifts
MemoryValue Sha256::ror(const MemoryValue& x, uint8_t shift)
{
    auto val = x.as<uint32_t>();
    // In a rotation, we decompose into a lhs and rhs (or hi and lo) part.
    uint32_t lo = val & ((static_cast<uint32_t>(1) << shift) - 1);
    uint32_t hi = val >> shift;
    uint32_t result = lo << (32U - (shift & 31U)) | hi;

    // Do this outside of an assert, in case this gets built without assert
    bool lo_in_range = gt.gt(static_cast<uint32_t>(1) << shift, lo); // Ensure the lower bits are in range
    (void)lo_in_range;                                               // To please GCC.
    assert(lo_in_range && "Low Value in ROR out of range");
    return MemoryValue::from<uint32_t>(result);
}

// Don't need to worry about edge cases with shifts since we know we only shift by 3 and 10 for sha256
MemoryValue Sha256::shr(const MemoryValue& x, uint8_t shift)
{
    uint32_t input = x.as<uint32_t>();
    // Get the lower shift bits
    uint32_t lo = input & ((static_cast<uint32_t>(1) << shift) - 1);
    uint32_t hi = input >> shift;

    // Do this outside of an assert, in case this gets built without assert
    bool lo_in_range = gt.gt(static_cast<uint32_t>(1) << shift, lo); // Ensure the lower bits are in range
    (void)lo_in_range;                                               // To please GCC.
    assert(lo_in_range && "Low Value in SHR out of range");

    return MemoryValue::from<uint32_t>(hi);
}

// This function is used to sum the values in the vector and return the result modulo 2^32.
MemoryValue Sha256::modulo_sum(std::span<const MemoryValue> values)
{
    uint64_t sum = 0;
    for (const auto& value : values) {
        // This is safe, since we've already checked that the values are of tag U32
        sum += value.as<uint32_t>();
    }
    uint32_t lo = static_cast<uint32_t>(sum);
    uint32_t hi = sum >> 32;

    // Do these outside of an assert, in case this gets built without assert
    bool lo_in_range =
        gt.gt(static_cast<uint64_t>(1) << 32, static_cast<uint64_t>(lo)); // Ensure the lower bits are in range
    bool hi_in_range =
        gt.gt(static_cast<uint64_t>(1) << 32, static_cast<uint64_t>(hi)); // Ensure the upper bits are in range
    (void)lo_in_range;                                                    // To please GCC.
    (void)hi_in_range;                                                    // To please GCC.
    assert(lo_in_range && hi_in_range && "Sum in MODULO_SUM out of range");
    return MemoryValue::from<uint32_t>(lo);
}

void Sha256::compression(MemoryInterface& memory,
                         MemoryAddress state_addr,
                         MemoryAddress input_addr,
                         MemoryAddress output_addr)
{
    uint32_t execution_clk = execution_id_manager.get_execution_id();
    uint16_t space_id = memory.get_space_id();

    // Default values are FF(0) as that is what the circuit would expect
    std::array<MemoryValue, 8> state;
    state.fill(MemoryValue::from<FF>(0));

    std::vector<MemoryValue> input;
    input.reserve(16);

    // Check that the maximum addresss for the state, input, and output addresses are within the valid range.
    // (1) Read the 8 element hash state from { state_addr, state_addr + 1, ..., state_addr + 7 }
    // (2) Read the 16 element input from { input_addr, input_addr + 1, ..., input_addr + 15 }
    // (3) Write the 8 element output to { output_addr, output_addr + 1, ..., output_addr + 7 }
    bool state_addr_out_of_range = gt.gt(static_cast<uint64_t>(state_addr) + 7, AVM_HIGHEST_MEM_ADDRESS);
    bool input_addr_out_of_range = gt.gt(static_cast<uint64_t>(input_addr) + 15, AVM_HIGHEST_MEM_ADDRESS);
    bool output_addr_out_of_range = gt.gt(static_cast<uint64_t>(output_addr) + 7, AVM_HIGHEST_MEM_ADDRESS);

    try {
        if (state_addr_out_of_range || input_addr_out_of_range || output_addr_out_of_range) {
            throw std::runtime_error("Memory address out of range for sha256 compression.");
        }

        // Read the hash state from memory. The state needs to be loaded atomically from memory (i.e. all 8 elements are
        // read regardless of errors)
        for (uint32_t i = 0; i < 8; ++i) {
            state[i] = memory.get(state_addr + i);
        }

        // If any of the state values are not of tag U32, we throw an error.
        if (std::ranges::any_of(state, [](const MemoryValue& val) { return val.get_tag() != MemoryTag::U32; })) {
            throw std::runtime_error("Invalid tag for sha256 state values.");
        }

        // Load 16 elements representing the hash input from memory.
        // Since the circuit loads this per row, we throw on the first error we find.
        for (uint32_t i = 0; i < 16; ++i) {
            input.emplace_back(memory.get(input_addr + i));
            if (input[i].get_tag() != MemoryTag::U32) {
                throw std::runtime_error("Invalid tag for sha256 input values.");
            }
        }

        // Perform sha256 compression. Taken from `vm2/simulation/lib/sha256_compression.cpp` but using
        // the bitwise operations and MemoryValues
        std::array<MemoryValue, 64> w;

        // Fill first 16 words with the inputs
        for (size_t i = 0; i < 16; ++i) {
            w[i] = input[i];
        }

        // Extend the input data into the remaining 48 words
        for (size_t i = 16; i < 64; ++i) {
            MemoryValue s0 = bitwise.xor_op(bitwise.xor_op(ror(w[i - 15], 7), ror(w[i - 15], 18)), shr(w[i - 15], 3));
            MemoryValue s1 = bitwise.xor_op(bitwise.xor_op(ror(w[i - 2], 17), ror(w[i - 2], 19)), shr(w[i - 2], 10));
            // Could be explicit with an std::initializer_list<uint32_t> here, the array overload is more readable imo.
            // std::spans are annoying to construct from literals
            // (https://www.open-std.org/jtc1/sc22/wg21/docs/papers/2022/p2447r2.html)
            w[i] = modulo_sum({ { w[i - 16], w[i - 7], s0, s1 } });
        }

        // Initialize round variables with previous block output
        MemoryValue a = state[0];
        MemoryValue b = state[1];
        MemoryValue c = state[2];
        MemoryValue d = state[3];
        MemoryValue e = state[4];
        MemoryValue f = state[5];
        MemoryValue g = state[6];
        MemoryValue h = state[7];

        // Apply SHA-256 compression function to the message schedule
        for (size_t i = 0; i < 64; ++i) {
            MemoryValue S1 = bitwise.xor_op(bitwise.xor_op(ror(e, 6U), ror(e, 11U)), ror(e, 25U));
            MemoryValue ch = bitwise.xor_op(bitwise.and_op(e, f), bitwise.and_op(~e, g));
            MemoryValue S0 = bitwise.xor_op(bitwise.xor_op(ror(a, 2U), ror(a, 13U)), ror(a, 22U));
            MemoryValue maj =
                bitwise.xor_op(bitwise.xor_op(bitwise.and_op(a, b), bitwise.and_op(a, c)), bitwise.and_op(b, c));

            auto prev_h = h; // Need to store the previous h value before updating it so we can use it in the modulo sum
            h = g;
            g = f;
            f = e;
            // e = d + temp1;
            e = modulo_sum({ { d, prev_h, S1, ch, MemoryValue::from<uint32_t>(round_constants[i]), w[i] } });
            d = c;
            c = b;
            b = a;
            // a = temp1 + temp2;
            a = modulo_sum({ { prev_h, S1, ch, MemoryValue::from<uint32_t>(round_constants[i]), w[i], S0, maj } });
        }

        // Add into previous block output and return
        std::array<MemoryValue, 8> output = {
            modulo_sum({ { a, state[0] } }), modulo_sum({ { b, state[1] } }), modulo_sum({ { c, state[2] } }),
            modulo_sum({ { d, state[3] } }), modulo_sum({ { e, state[4] } }), modulo_sum({ { f, state[5] } }),
            modulo_sum({ { g, state[6] } }), modulo_sum({ { h, state[7] } }),
        };

        // Write the output back to memory.
        for (uint32_t i = 0; i < 8; ++i) {
            memory.set(output_addr + i, output[i]);
        }

        events.emit({ .execution_clk = execution_clk,
                      .space_id = space_id,
                      .state_addr = state_addr,
                      .input_addr = input_addr,
                      .output_addr = output_addr,
                      .state = state,
                      .input = input,
                      .output = output });
    } catch (const std::exception& e) {
        // If any error occurs, we emit an event with the error message.
        std::array<MemoryValue, 8> output;
        output.fill(MemoryValue::from<FF>(0)); // Default output in case of error
        events.emit({ .execution_clk = execution_clk,
                      .space_id = space_id,
                      .state_addr = state_addr,
                      .input_addr = input_addr,
                      .output_addr = output_addr,
                      .state = state,
                      .input = input,
                      .output = output });
        throw; // Re-throw the exception after emitting the event
    }
}

} // namespace bb::avm2::simulation

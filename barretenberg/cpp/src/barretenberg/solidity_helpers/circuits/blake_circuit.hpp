#pragma once
#include "barretenberg/stdlib/hash/blake2s/blake2s.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include "barretenberg/stdlib/primitives/witness/witness.hpp"

class BlakeCircuit {
  public:
    using Builder = bb::UltraCircuitBuilder;
    using field_ct = bb::stdlib::field_t<Builder>;
    using public_witness_ct = bb::stdlib::public_witness_t<Builder>;
    using byte_array_ct = bb::stdlib::byte_array<Builder>;

    static constexpr size_t NUM_PUBLIC_INPUTS = 4;

    static Builder generate(uint256_t public_inputs[])
    {
        Builder builder;

        // Build byte array from field elements with proper constraints using write() pattern
        byte_array_ct input_buffer(&builder, std::vector<uint8_t>());
        for (size_t i = 0; i < NUM_PUBLIC_INPUTS; ++i) {
            field_ct field_element = public_witness_ct(&builder, public_inputs[i]);
            // byte_array_ct(field_t) constructor adds range constraints for each byte
            byte_array_ct field_bytes(field_element);
            input_buffer.write(field_bytes);
        }

        bb::stdlib::Blake2s<Builder>::hash(input_buffer);

        return builder;
    }
};

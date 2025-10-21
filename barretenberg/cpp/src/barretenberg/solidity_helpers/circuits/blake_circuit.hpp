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

        // Build byte array from field elements with proper constraints
        std::vector<field_ct> all_bytes;
        all_bytes.reserve(NUM_PUBLIC_INPUTS * 32);
        for (size_t i = 0; i < NUM_PUBLIC_INPUTS; ++i) {
            field_ct field_element = public_witness_ct(&builder, public_inputs[i]);
            // byte_array_ct(field_t) constructor adds range constraints for each byte
            byte_array_ct field_bytes(field_element);
            // Extract the constrained bytes
            const auto& bytes = field_bytes.bytes();
            all_bytes.insert(all_bytes.end(), bytes.begin(), bytes.end());
        }
        // Create byte_array from the constrained bytes
        byte_array_ct input_buffer = byte_array_ct::from_field_elements_unconstrained(&builder, all_bytes);

        bb::stdlib::Blake2s<Builder>::hash(input_buffer);

        return builder;
    }
};

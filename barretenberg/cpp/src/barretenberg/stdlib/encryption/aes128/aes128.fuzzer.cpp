#include "aes128.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/crypto/aes128/aes128.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include <cassert>
#include <cstdint>
#include <vector>

using namespace bb;
using namespace bb::stdlib;

// Helper function to create field element as either constant or witness
field_t<UltraCircuitBuilder> create_field_element(UltraCircuitBuilder& builder, const uint256_t& value, bool as_witness)
{
    if (as_witness) {
        return field_t<UltraCircuitBuilder>(witness_t(&builder, fr(value)));
    } else {
        return field_t<UltraCircuitBuilder>(value);
    }
}

extern "C" int LLVMFuzzerTestOneInput(const uint8_t* Data, size_t Size)
{
    if (Size < 33) // Need at least 16 bytes for key + 16 bytes for IV + 1 byte for config
        return 0;

    UltraCircuitBuilder builder;

    // Use first byte to determine configuration for key/IV
    uint8_t config = Data[0];
    bool key_as_witness = (config & 0x01) != 0;
    bool iv_as_witness = (config & 0x02) != 0;

    // Extract key (bytes 1-16)
    std::vector<uint8_t> key_vec(Data + 1, Data + 17);

    // Extract IV (bytes 17-32)
    std::vector<uint8_t> iv_vec(Data + 17, Data + 33);

    // Remaining data: per-block config + input data
    size_t data_offset = 33;
    size_t num_blocks = (Size > data_offset) ? (Size - data_offset) / 17 : 1;
    if (num_blocks == 0)
        num_blocks = 1;
    // Per-block config (num_blocks bytes)
    std::vector<uint8_t> block_config;
    for (size_t i = 0; i < num_blocks; ++i) {
        if (data_offset + i < Size) {
            block_config.push_back(Data[data_offset + i]);
        } else {
            block_config.push_back(0); // Default to constant
        }
    }
    // Input data (after per-block config)
    std::vector<uint8_t> input_vec;
    size_t input_start = data_offset + num_blocks;
    for (size_t i = 0; i < num_blocks * 16; ++i) {
        if (input_start + i < Size) {
            input_vec.push_back(Data[input_start + i]);
        } else {
            input_vec.push_back(0);
        }
    }
    // Convert bytes to field elements for circuit with per-block config
    const auto convert_bytes = [](const std::vector<uint8_t>& data) {
        uint256_t converted(0);
        for (uint64_t i = 0; i < 16; ++i) {
            uint256_t to_add = uint256_t((uint64_t)(data[i])) << uint256_t((15 - i) * 8);
            converted += to_add;
        }
        return converted;
    };
    std::vector<field_t<UltraCircuitBuilder>> input_field;
    for (size_t i = 0; i < num_blocks; ++i) {
        auto block_start = std::next(input_vec.begin(), static_cast<ptrdiff_t>(i * 16));
        auto block_end = std::next(input_vec.begin(), static_cast<ptrdiff_t>((i + 1) * 16));
        std::vector<uint8_t> block(block_start, block_end);
        bool as_witness = (block_config[i] & 0x01) != 0;
        input_field.push_back(create_field_element(builder, convert_bytes(block), as_witness));
    }
    field_t<UltraCircuitBuilder> key_field = create_field_element(builder, convert_bytes(key_vec), key_as_witness);
    field_t<UltraCircuitBuilder> iv_field = create_field_element(builder, convert_bytes(iv_vec), iv_as_witness);

    // Run circuit
    auto circuit_output = stdlib::aes128::encrypt_buffer_cbc(input_field, iv_field, key_field);

    // Convert circuit output to bytes
    std::vector<uint8_t> circuit_bytes;
    for (const auto& field_elem : circuit_output) {
        uint256_t value = field_elem.get_value();
        std::vector<uint8_t> block_bytes;
        for (uint64_t i = 15; i != static_cast<uint64_t>(-1); --i) {
            block_bytes.push_back(static_cast<uint8_t>((value >> (i * 8)) & 0xFF));
        }
        circuit_bytes.insert(circuit_bytes.end(), block_bytes.begin(), block_bytes.end());
    }

    // Run reference implementation
    std::vector<uint8_t> ref_input = input_vec;
    std::vector<uint8_t> ref_iv = iv_vec;
    crypto::aes128_encrypt_buffer_cbc(ref_input.data(), ref_iv.data(), key_vec.data(), ref_input.size());

    // Compare outputs - ref_input now contains the encrypted data
    if (circuit_bytes.size() != ref_input.size()) {
        // This should never happen if our padding logic is correct
        assert(false && "Circuit and reference output sizes don't match");
        return 1;
    }

    for (size_t i = 0; i < circuit_bytes.size(); ++i) {
        if (circuit_bytes[i] != ref_input[i]) {
            // This should never happen if our circuit is correct
            assert(false && "Circuit output doesn't match reference implementation");
            return 1;
        }
    }

    // Verify circuit is valid
    assert(bb::CircuitChecker::check(builder));

    return 0;
}
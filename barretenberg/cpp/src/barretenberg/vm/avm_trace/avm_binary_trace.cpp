
#include "avm_binary_trace.hpp"
#include "barretenberg/numeric/uint128/uint128.hpp"
#include "barretenberg/vm/avm_trace/avm_common.hpp"
#include <algorithm>
#include <array>
#include <cmath>
#include <cstddef>
#include <cstdint>

namespace bb::avm_trace {

AvmBinaryTraceBuilder::AvmBinaryTraceBuilder()
{
    // lookup_table = std::make_unique<BinaryLookupTable>();
    binary_trace.reserve(AVM_TRACE_SIZE);
}

std::vector<AvmBinaryTraceBuilder::BinaryTraceEntry> AvmBinaryTraceBuilder::finalize()
{
    return std::move(binary_trace);
}

void AvmBinaryTraceBuilder::reset()
{
    binary_trace.clear();
}

/**
 * @brief Helper function to correctly decompose and pad inputs
 * @param val The constant to be written upcasted to u128
 * @return LE encoded bytes with an extra zero padding.
 */
std::vector<uint8_t> bytes_decompose(uint128_t const& val)
{
    // This uses a Network Byte Order (Big-Endian) and since a uint128_t is used
    // this is guaranteed to be of length 16 (zero-padded if necessary).
    std::vector<uint8_t> bytes = to_buffer(val);

    // We convert it back to Little-Endian.
    std::reverse(bytes.begin(), bytes.end());
    // To simplify the loop in witness generation we add a zero at the MSB
    // as the last accumulated value has a zero in the bytes column
    bytes.push_back(0);
    return bytes;
}

/**
 * @brief Build and Insert and entry into the binary trace table depending on op_id
 * @param a Left operand of the bitwise operation
 * @param b Right operand of the bitwise operation
 * @param in_tag Instruction tag
 * @param clk Clock referring to the operation in the main trace.
 * @param op_id which bitwise operation {0: And, 1: Or, 2: Xor } this entry corresponds to.
 */
void AvmBinaryTraceBuilder::entry_builder(
    uint128_t const& a, uint128_t const& b, uint128_t const& c, AvmMemoryTag instr_tag, uint32_t clk, uint8_t op_id)
{
    // Given the instruction tag, calculate the number of bytes to decompose values into
    // The number of rows for this entry will be number of bytes + 1
    size_t num_bytes = 1 << (static_cast<uint8_t>(instr_tag) - 1);

    // Big Endian encoded
    std::vector<uint8_t> a_bytes = bytes_decompose(a);
    std::vector<uint8_t> b_bytes = bytes_decompose(b);
    std::vector<uint8_t> c_bytes = bytes_decompose(c);

    uint128_t acc_ia = 0;
    uint128_t acc_ib = 0;
    uint128_t acc_ic = 0;
    // Factor set to 256bit. In the last row of accumulation the factor will be 2**num_bytes.
    // This causes it to overflow the cpp type when we are working with U128.
    uint256_t factor = 1;

    // We have num_bytes + 1 rows to add to the binary trace;
    for (size_t i = 0; i <= num_bytes; i++) {
        binary_trace.push_back(AvmBinaryTraceBuilder::BinaryTraceEntry{
            .binary_clk = clk,
            .op_id = op_id,
            .instr_tag = static_cast<uint8_t>(instr_tag),
            .mem_tag_ctr = static_cast<uint8_t>(i),
            .factor = factor,
            .latch = i == num_bytes,
            .acc_ia = FF(uint256_t::from_uint128(acc_ia)),
            .acc_ib = FF(uint256_t::from_uint128(acc_ib)),
            .acc_ic = FF(uint256_t::from_uint128(acc_ic)),
            .bin_ia_bytes = a_bytes[i],
            .bin_ib_bytes = b_bytes[i],
            .bin_ic_bytes = c_bytes[i],
        });
        auto lookup_index = static_cast<uint32_t>((op_id << 16) + (a_bytes[i] << 8) + b_bytes[i]);
        byte_operation_counter[lookup_index]++;
        factor *= 256;

        acc_ia += a_bytes[i] * static_cast<uint128_t>(std::pow(2, 8 * i));
        acc_ib += b_bytes[i] * static_cast<uint128_t>(std::pow(2, 8 * i));
        acc_ic += c_bytes[i] * static_cast<uint128_t>(std::pow(2, 8 * i));
    }
    // There is 1 latch per call, therefore byte_length check increments
    byte_length_counter[static_cast<uint8_t>(instr_tag)]++;
}

/**
 * @brief Build Binary trace and return the result of bitwise And operation.
 *
 * @param a Left operand of the And
 * @param b Right operand of the And
 * @param in_tag Instruction tag defining the number of bits for And
 * @param clk Clock referring to the operation in the main trace.
 *
 * @return FF The result of bitwise And casted to a Field element.
 */
FF AvmBinaryTraceBuilder::op_and(FF const& a, FF const& b, AvmMemoryTag instr_tag, uint32_t clk)
{
    if (instr_tag == AvmMemoryTag::FF || instr_tag == AvmMemoryTag::U0) {
        return FF::zero();
    }
    // Cast to bits and perform And operation
    auto a_uint128 = static_cast<uint128_t>(a);
    auto b_uint128 = static_cast<uint128_t>(b);
    uint128_t c_uint128 = a_uint128 & b_uint128;

    this->entry_builder(a_uint128, b_uint128, c_uint128, instr_tag, clk, 0);
    return uint256_t::from_uint128(c_uint128);
}

/**
 * @brief Build Binary trace and return the result of bitwise Or operation.
 *
 * @param a Left operand of the Or
 * @param b Right operand of the Or
 * @param in_tag Instruction tag defining the number of bits for Or
 * @param clk Clock referring to the operation in the main trace.
 *
 * @return FF The result of bitwise Or casted to a Field element.
 */
FF AvmBinaryTraceBuilder::op_or(FF const& a, FF const& b, AvmMemoryTag instr_tag, uint32_t clk)
{
    if (instr_tag == AvmMemoryTag::FF || instr_tag == AvmMemoryTag::U0) {
        return FF::zero();
    }
    // Cast to bits and perform Or operation
    auto a_uint128 = static_cast<uint128_t>(a);
    auto b_uint128 = static_cast<uint128_t>(b);
    uint128_t c_uint128 = a_uint128 | b_uint128;

    this->entry_builder(a_uint128, b_uint128, c_uint128, instr_tag, clk, 1);
    return uint256_t::from_uint128(c_uint128);
}

/**
 * @brief Build Binary trace and return the result of bitwise Xor operation.
 *
 * @param a Left operand of the Xor
 * @param b Right operand of the Xor
 * @param in_tag Instruction tag defining the number of bits for Xor
 * @param clk Clock referring to the operation in the main trace.
 *
 * @return FF The result of bitwise Xor casted to a Field element.
 */
FF AvmBinaryTraceBuilder::op_xor(FF const& a, FF const& b, AvmMemoryTag instr_tag, uint32_t clk)
{
    if (instr_tag == AvmMemoryTag::FF || instr_tag == AvmMemoryTag::U0) {
        return FF::zero();
    }
    // Cast to bits and perform Xor operation
    auto a_uint128 = static_cast<uint128_t>(a);
    auto b_uint128 = static_cast<uint128_t>(b);
    uint128_t c_uint128 = a_uint128 ^ b_uint128;

    this->entry_builder(a_uint128, b_uint128, c_uint128, instr_tag, clk, 2);
    return uint256_t::from_uint128(c_uint128);
}

} // namespace bb::avm_trace

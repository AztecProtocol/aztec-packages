
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
 * @param val The value to decompose
 * @param num_bytes The number of bytes given the instr_tag.
 * @return BE encoded bytes with an extra zero padding (final length is num_bytes + 1).
 */
std::vector<uint8_t> bytes_decompose_be(uint128_t const& val, size_t num_bytes)
{
    // This uses a Network Byte Order (Big-Endian) and since a uint128_t is used
    // this is guaranteed to be of length 16 (zero-padded if necessary).
    std::vector<uint8_t> val_bytes = to_buffer(val);
    // Since the trace expects BE, we take only the portion that corresponds to the bytes we need (given the instr_tag)
    std::vector<uint8_t> bytes(val_bytes.end() - static_cast<int>(num_bytes), val_bytes.end());

    // To simplify the loop in witness generation we add a zero at the end since it's a "free input"
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
    std::vector<uint8_t> a_bytes = bytes_decompose_be(a, num_bytes);
    std::vector<uint8_t> b_bytes = bytes_decompose_be(b, num_bytes);
    std::vector<uint8_t> c_bytes = bytes_decompose_be(c, num_bytes);

    uint128_t acc_ia = 0;
    uint128_t acc_ib = 0;
    uint128_t acc_ic = 0;

    // We have num_bytes + 1 rows to add to the binary trace;
    for (size_t i = 0; i <= num_bytes; i++) {
        binary_trace.push_back(AvmBinaryTraceBuilder::BinaryTraceEntry{
            .binary_clk = clk,
            .op_id = op_id,
            .instr_tag = static_cast<uint8_t>(instr_tag),
            .mem_tag_ctr = static_cast<uint8_t>(i),
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
        acc_ia = acc_ia * 256 + a_bytes[i];
        acc_ib = acc_ib * 256 + b_bytes[i];
        acc_ic = acc_ic * 256 + c_bytes[i];
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

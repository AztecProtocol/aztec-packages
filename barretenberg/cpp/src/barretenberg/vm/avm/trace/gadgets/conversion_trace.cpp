#include "barretenberg/vm/avm/trace/gadgets/conversion_trace.hpp"

namespace bb::avm_trace {

std::vector<AvmConversionTraceBuilder::ConversionTraceEntry> AvmConversionTraceBuilder::finalize()
{
    return std::move(conversion_trace);
}

void AvmConversionTraceBuilder::reset()
{
    conversion_trace.clear();
}

/**
 * @brief Build conversion trace and compute the result of a TO_RADIX_LE operation.
 *        This operation is only valid for the FF instr_tag and always returns a byte array
 *
 * @param a First operand of the TO_RADIX_LE, the value to be converted
 * @param radix The upper bound for each limbm 0 <= limb < radix
 * @param num_limbs The number of limbs to the value into.
 * @param output_bits Should the output be U1s instead of U8s?
 * @param clk Clock referring to the operation in the main trace.
 *
 * @return std::vector<uint8_t> The LE converted values stored as bytes or bits.
 */
std::vector<uint8_t> AvmConversionTraceBuilder::op_to_radix_le(
    FF const& a, uint32_t radix, uint32_t num_limbs, uint8_t output_bits, uint32_t clk)
{
    ASSERT(radix <= 256); // should never reach here because main trace won't call with bad radix

    auto a_uint256 = uint256_t(a);
    auto radix_uint256 = uint256_t(radix);

    std::vector<uint8_t> bytes_or_bits;
    for (uint32_t i = 0; i < num_limbs; i++) {
        auto limb = a_uint256 % radix_uint256;
        if (output_bits > 0) {
            bytes_or_bits.emplace_back(static_cast<uint8_t>(limb == 0 ? 0 : 1));
        } else {
            bytes_or_bits.emplace_back(static_cast<uint8_t>(limb));
        }
        a_uint256 /= radix_uint256;
    }

    conversion_trace.emplace_back(ConversionTraceEntry{
        .conversion_clk = clk,
        .to_radix_le_sel = true,
        .input = a,
        .radix = radix,
        .num_limbs = num_limbs,
        .output_bits = output_bits,
        .limbs = bytes_or_bits,
    });

    return bytes_or_bits;
}

} // namespace bb::avm_trace

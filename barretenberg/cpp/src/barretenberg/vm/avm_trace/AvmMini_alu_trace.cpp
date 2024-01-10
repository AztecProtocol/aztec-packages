#include "AvmMini_alu_trace.hpp"

namespace avm_trace {

/**
 * @brief Constructor of Alu trace builder of AVM. Only serves to set the capacity of the
 *        underlying trace.
 */
AvmMiniAluTraceBuilder::AvmMiniAluTraceBuilder()
{
    alu_trace.reserve(AVM_TRACE_SIZE);
}

/**
 * @brief Resetting the internal state so that a new Alu trace can be rebuilt using the same object.
 *
 */
void AvmMiniAluTraceBuilder::reset()
{
    alu_trace.clear();
}

/**
 * @brief Prepare the Alu trace to be incorporated into the main trace.
 *
 * @return The Alu trace (which is moved).
 */
std::vector<AvmMiniAluTraceBuilder::AluTraceEntry> AvmMiniAluTraceBuilder::finalize()
{
    return std::move(alu_trace);
}

/**
 * @brief Build Alu trace and compute the result of an addition of type defined by in_tag.
 *
 * @param a Left operand of the additon
 * @param b Right operand of the addition
 * @param in_tag Instruction tag defining the number of bits on which the addition applies.
 *               It is assumed that the caller never uses the type u0.
 * @param clk Clock referring to the operation in the main trace.
 *
 * @return FF The result of the addition casted in a finite field element
 */
FF AvmMiniAluTraceBuilder::add(FF const& a, FF const& b, AvmMemoryTag in_tag, uint32_t const clk)
{
    FF c{};
    bool carry = false;
    uint8_t alu_u8_r0{};
    std::array<uint16_t, 8> alu_u16_reg{};

    switch (in_tag) {
    case AvmMemoryTag::ff:
        c = a + b;
    case AvmMemoryTag::u8: {
        uint8_t a_u8 = static_cast<uint8_t>(uint256_t(a).data[0]);
        uint8_t b_u8 = static_cast<uint8_t>(uint256_t(b).data[0]);
        uint8_t c_u8 = a_u8 + b_u8;
        c = FF{ uint256_t{ c_u8 } };

        // a_u8 + b_u8 >= 2^8  <==> c_u8 < a_u8
        if (c_u8 < a_u8) {
            carry = true;
        }

        alu_u8_r0 = c_u8;
        break;
    }
    case AvmMemoryTag::u16: {
        uint16_t a_u16 = static_cast<uint16_t>(uint256_t(a).data[0]);
        uint16_t b_u16 = static_cast<uint16_t>(uint256_t(b).data[0]);
        uint16_t c_u16 = a_u16 + b_u16;
        c = FF{ uint256_t{ c_u16 } };

        // a_u16 + b_u16 >= 2^16  <==> c_u16 < a_u16
        if (c_u16 < a_u16) {
            carry = true;
        }

        alu_u16_reg.at(0) = c_u16;
        break;
    }
    case AvmMemoryTag::u32: {
        uint32_t a_u32 = static_cast<uint32_t>(uint256_t(a).data[0]);
        uint32_t b_u32 = static_cast<uint32_t>(uint256_t(b).data[0]);
        uint32_t c_u32 = a_u32 + b_u32;
        c = FF{ uint256_t{ c_u32 } };

        // a_u32 + b_u32 >= 2^32  <==> c_u32 < a_u32
        if (c_u32 < a_u32) {
            carry = true;
        }

        alu_u16_reg.at(0) = static_cast<uint16_t>(c_u32);
        alu_u16_reg.at(1) = static_cast<uint16_t>(c_u32 >> 16);
        break;
    }
    case AvmMemoryTag::u64: {
        uint64_t a_u64 = static_cast<uint64_t>(uint256_t(a).data[0]);
        uint64_t b_u64 = static_cast<uint64_t>(uint256_t(b).data[0]);
        uint64_t c_u64 = a_u64 + b_u64;
        c = FF{ uint256_t{ c_u64 } };

        // a_u64 + b_u64 >= 2^64  <==> c_u64 < a_u64
        if (c_u64 < a_u64) {
            carry = true;
        }

        uint64_t c_trunc_64 = c_u64;
        for (size_t i = 0; i < 4; i++) {
            alu_u16_reg.at(i) = static_cast<uint16_t>(c_trunc_64);
            c_trunc_64 >>= 16;
        }
        break;
    }
    case AvmMemoryTag::u128: {
        auto a_u128 = uint128_t(a);
        auto b_u128 = uint128_t(b);
        uint128_t c_u128 = a_u128 + b_u128;
        c = FF{ uint256_t::from_uint128(c_u128) };

        // a_u128 + b_u128 >= 2^128  <==> c_u128 < a_u128
        if (c_u128 < a_u128) {
            carry = true;
        }

        uint128_t c_trunc_128 = c_u128;
        for (size_t i = 0; i < 8; i++) {
            alu_u16_reg.at(i) = static_cast<uint16_t>(c_trunc_128);
            c_trunc_128 >>= 16;
        }
        break;
    }
    case AvmMemoryTag::u0: // Unsupported as instruction tag
        return FF{ 0 };
    }

    alu_trace.push_back(AvmMiniAluTraceBuilder::AluTraceEntry{
        .alu_clk = clk,
        .alu_op_add = true,
        .alu_ff_tag = in_tag == AvmMemoryTag::ff,
        .alu_u8_tag = in_tag == AvmMemoryTag::u8,
        .alu_u16_tag = in_tag == AvmMemoryTag::u16,
        .alu_u32_tag = in_tag == AvmMemoryTag::u32,
        .alu_u64_tag = in_tag == AvmMemoryTag::u64,
        .alu_u128_tag = in_tag == AvmMemoryTag::u128,
        .alu_ia = a,
        .alu_ib = b,
        .alu_ic = c,
        .alu_cf = carry,
        .alu_u8_r0 = alu_u8_r0,
        .alu_u16_reg = alu_u16_reg,
    });

    return c;
}

/**
 * @brief Build Alu trace and compute the result of a subtraction of type defined by in_tag.
 *
 * @param a Left operand of the subtraction
 * @param b Right operand of the subtraction
 * @param in_tag Instruction tag defining the number of bits on which the subtracttion applies.
 *               It is assumed that the caller never uses the type u0.
 * @param clk Clock referring to the operation in the main trace.
 *
 * @return FF The result of the subtraction casted in a finite field element
 */
FF AvmMiniAluTraceBuilder::sub(FF const& a, FF const& b, AvmMemoryTag in_tag, uint32_t const clk)
{
    FF c{};
    bool carry = false;
    uint8_t alu_u8_r0{};
    std::array<uint16_t, 8> alu_u16_reg{};

    switch (in_tag) {
    case AvmMemoryTag::ff:
        c = a - b;
    case AvmMemoryTag::u8: {
        uint8_t a_u8 = static_cast<uint8_t>(uint256_t(a).data[0]);
        uint8_t b_u8 = static_cast<uint8_t>(uint256_t(b).data[0]);
        uint8_t c_u8 = a_u8 - b_u8;
        c = FF{ uint256_t{ c_u8 } };

        // We show that c_u8 + b_u8 == a_u8 and use "addition relation"
        // where we swap a_u8 and c_u8.
        // c_u8 + b_u8 >= 2^8 <==> a_u8 < c_u8
        if (a_u8 < c_u8) {
            carry = true;
        }

        alu_u8_r0 = a_u8;
        break;
    }
    case AvmMemoryTag::u16: {
        uint16_t a_u16 = static_cast<uint16_t>(uint256_t(a).data[0]);
        uint16_t b_u16 = static_cast<uint16_t>(uint256_t(b).data[0]);
        uint16_t c_u16 = a_u16 - b_u16;
        c = FF{ uint256_t{ c_u16 } };

        // We show that c_u16 + b_u16 == a_u16 and use "addition relation"
        // where we swap a_u16 and c_u16.
        // c_u16 + b_u16 >= 2^16  <==> a_u16 < c_u16
        if (a_u16 < c_u16) {
            carry = true;
        }

        alu_u16_reg.at(0) = a_u16;
        break;
    }
    case AvmMemoryTag::u32: {
        uint32_t a_u32 = static_cast<uint32_t>(uint256_t(a).data[0]);
        uint32_t b_u32 = static_cast<uint32_t>(uint256_t(b).data[0]);
        uint32_t c_u32 = a_u32 - b_u32;
        c = FF{ uint256_t{ c_u32 } };

        // We show that c_u32 + b_u32 == a_u32 and use "addition relation"
        // where we swap a_u32 and c_u32.
        // c_u32 + b_u32 >= 2^32  <==> a_u32 < c_u32
        if (a_u32 < c_u32) {
            carry = true;
        }

        alu_u16_reg.at(0) = static_cast<uint16_t>(a_u32);
        alu_u16_reg.at(1) = static_cast<uint16_t>(a_u32 >> 16);
        break;
    }
    case AvmMemoryTag::u64: {
        uint64_t a_u64 = static_cast<uint64_t>(uint256_t(a).data[0]);
        uint64_t b_u64 = static_cast<uint64_t>(uint256_t(b).data[0]);
        uint64_t c_u64 = a_u64 - b_u64;
        c = FF{ uint256_t{ c_u64 } };

        // We show that c_u64 + b_u64 == a_u64 and use "addition relation"
        // where we swap a_u64 and c_u64.
        // c_u64 + b_u64 >= 2^64  <==> a_u64 < c_u64
        if (a_u64 < c_u64) {
            carry = true;
        }

        uint64_t a_trunc_64 = a_u64;
        for (size_t i = 0; i < 4; i++) {
            alu_u16_reg.at(i) = static_cast<uint16_t>(a_trunc_64);
            a_trunc_64 >>= 16;
        }
        break;
    }
    case AvmMemoryTag::u128: {
        auto a_u128 = uint128_t(a);
        auto b_u128 = uint128_t(b);
        uint128_t c_u128 = a_u128 - b_u128;
        c = FF{ uint256_t::from_uint128(c_u128) };

        // We show that c_u128 + b_u128 == a_u128 and use "addition relation"
        // where we swap a_u128 and c_u128.
        // c_u128 + b_u128 >= 2^128  <==> a_u128 < c_u128
        if (a_u128 < c_u128) {
            carry = true;
        }

        uint128_t a_trunc_128 = a_u128;
        for (size_t i = 0; i < 8; i++) {
            alu_u16_reg.at(i) = static_cast<uint16_t>(a_trunc_128);
            a_trunc_128 >>= 16;
        }
        break;
    }
    case AvmMemoryTag::u0: // Unsupported as instruction tag
        return FF{ 0 };
    }

    alu_trace.push_back(AvmMiniAluTraceBuilder::AluTraceEntry{
        .alu_clk = clk,
        .alu_op_sub = true,
        .alu_ff_tag = in_tag == AvmMemoryTag::ff,
        .alu_u8_tag = in_tag == AvmMemoryTag::u8,
        .alu_u16_tag = in_tag == AvmMemoryTag::u16,
        .alu_u32_tag = in_tag == AvmMemoryTag::u32,
        .alu_u64_tag = in_tag == AvmMemoryTag::u64,
        .alu_u128_tag = in_tag == AvmMemoryTag::u128,
        .alu_ia = a,
        .alu_ib = b,
        .alu_ic = c,
        .alu_cf = carry,
        .alu_u8_r0 = alu_u8_r0,
        .alu_u16_reg = alu_u16_reg,
    });

    return c;
}

} // namespace avm_trace

#pragma once

#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/numeric/uintx/uintx.hpp"
#include <array>
#include <cstddef>
#include <vector>

namespace bb {

const size_t INTERNAL_STATE_SIZE = 32;

// Settings structure to control which operations are enabled
struct VMSettings {
    bool enable_set_value : 1;
    bool enable_add : 1;
    bool enable_add_assign : 1;
    bool enable_increment : 1;
    bool enable_mul : 1;
    bool enable_mul_assign : 1;
    bool enable_sub : 1;
    bool enable_sub_assign : 1;
    bool enable_div : 1;
    bool enable_div_assign : 1;
    bool enable_inv : 1;
    bool enable_neg : 1;
    bool enable_sqr : 1;
    bool enable_sqr_assign : 1;
    bool enable_pow : 1;
    bool enable_sqrt : 1;
    bool enable_is_zero : 1;
    bool enable_equal : 1;
    bool enable_not_equal : 1;
    bool enable_to_montgomery : 1;
    bool enable_from_montgomery : 1;
    bool enable_reduce_once : 1;
    bool enable_self_reduce : 1;
    bool enable_batch_invert : 1;
    uint8_t reserved : 8; // Reserved for future use
};

static_assert(sizeof(VMSettings) == 4, "VMSettings must be exactly 4 bytes");

const size_t SETTINGS_SIZE = sizeof(VMSettings);

enum class Instruction {
    SET_VALUE,
    ADD,
    ADD_ASSIGN,
    INCREMENT,
    MUL,
    MUL_ASSIGN,
    SUB,
    SUB_ASSIGN,
    DIV,
    DIV_ASSIGN,
    INV,
    NEG,
    SQR,
    SQR_ASSIGN,
    POW,
    SQRT,
    IS_ZERO,
    EQUAL,
    NOT_EQUAL,
    TO_MONTGOMERY,
    FROM_MONTGOMERY,
    REDUCE_ONCE,
    SELF_REDUCE,
    BATCH_INVERT,
};
const size_t INSTRUCTION_HEADER_SIZE = 1;
const size_t INDEX_SIZE = 1;

static_assert(1 << (8 * INDEX_SIZE) > INTERNAL_STATE_SIZE, "INDEX_SIZE is too small");
const size_t SET_VALUE_SIZE = INSTRUCTION_HEADER_SIZE + INDEX_SIZE + sizeof(numeric::uint256_t);
const size_t ADD_SIZE = INSTRUCTION_HEADER_SIZE + INDEX_SIZE * 3;
const size_t ADD_ASSIGN_SIZE = INSTRUCTION_HEADER_SIZE + INDEX_SIZE * 2;
const size_t INCREMENT_SIZE = INSTRUCTION_HEADER_SIZE + INDEX_SIZE;
const size_t MUL_SIZE = INSTRUCTION_HEADER_SIZE + INDEX_SIZE * 3;
const size_t MUL_ASSIGN_SIZE = INSTRUCTION_HEADER_SIZE + INDEX_SIZE * 2;
const size_t SUB_SIZE = INSTRUCTION_HEADER_SIZE + INDEX_SIZE * 3;
const size_t SUB_ASSIGN_SIZE = INSTRUCTION_HEADER_SIZE + INDEX_SIZE * 2;
const size_t DIV_SIZE = INSTRUCTION_HEADER_SIZE + INDEX_SIZE * 3;
const size_t DIV_ASSIGN_SIZE = INSTRUCTION_HEADER_SIZE + INDEX_SIZE * 2;
const size_t INV_SIZE = INSTRUCTION_HEADER_SIZE + INDEX_SIZE * 2;
const size_t NEG_SIZE = INSTRUCTION_HEADER_SIZE + INDEX_SIZE * 2;
const size_t SQR_SIZE = INSTRUCTION_HEADER_SIZE + INDEX_SIZE * 2;
const size_t SQR_ASSIGN_SIZE = INSTRUCTION_HEADER_SIZE + INDEX_SIZE;
const size_t POW_SIZE = INSTRUCTION_HEADER_SIZE + INDEX_SIZE * 2 + sizeof(uint64_t);
const size_t SQRT_SIZE = INSTRUCTION_HEADER_SIZE + INDEX_SIZE * 2;
const size_t IS_ZERO_SIZE = INSTRUCTION_HEADER_SIZE + INDEX_SIZE;
const size_t EQUAL_SIZE = INSTRUCTION_HEADER_SIZE + INDEX_SIZE * 2;
const size_t NOT_EQUAL_SIZE = INSTRUCTION_HEADER_SIZE + INDEX_SIZE * 2;
const size_t TO_MONTGOMERY_SIZE = INSTRUCTION_HEADER_SIZE + INDEX_SIZE * 2;
const size_t FROM_MONTGOMERY_SIZE = INSTRUCTION_HEADER_SIZE + INDEX_SIZE * 2;
const size_t REDUCE_ONCE_SIZE = INSTRUCTION_HEADER_SIZE + INDEX_SIZE * 2;
const size_t SELF_REDUCE_SIZE = INSTRUCTION_HEADER_SIZE + INDEX_SIZE;
const size_t BATCH_INVERT_SIZE = INSTRUCTION_HEADER_SIZE + INDEX_SIZE * 2 + sizeof(uint8_t);

template <typename Field> struct FieldVM {
    static constexpr bool LARGE_MODULUS = (Field::modulus.data[3] >= 0x4000000000000000ULL);
    std::array<Field, INTERNAL_STATE_SIZE> field_internal_state;
    std::array<numeric::uint256_t, INTERNAL_STATE_SIZE> uint_internal_state;
    bool with_debug;
    VMSettings settings;
    size_t max_steps;
    size_t step_count;

    FieldVM(bool with_debug = false, size_t max_steps = SIZE_MAX)
        : with_debug(with_debug)
        , max_steps(max_steps)
        , step_count(0)
    {
        // Initialize with all operations enabled by default
        settings.enable_set_value = true;
        settings.enable_add = true;
        settings.enable_add_assign = true;
        settings.enable_increment = true;
        settings.enable_mul = true;
        settings.enable_mul_assign = true;
        settings.enable_sub = true;
        settings.enable_sub_assign = true;
        settings.enable_div = true;
        settings.enable_div_assign = true;
        settings.enable_inv = true;
        settings.enable_neg = true;
        settings.enable_sqr = true;
        settings.enable_sqr_assign = true;
        settings.enable_pow = true;
        settings.enable_sqrt = true;
        settings.enable_is_zero = true;
        settings.enable_equal = true;
        settings.enable_not_equal = true;
        settings.enable_to_montgomery = true;
        settings.enable_from_montgomery = true;
        settings.enable_reduce_once = true;
        settings.enable_self_reduce = true;
        settings.enable_batch_invert = true;
        settings.reserved = 0;

        for (size_t i = 0; i < INTERNAL_STATE_SIZE; i++) {
            field_internal_state[i] = Field::zero();
            uint_internal_state[i] = numeric::uint256_t(0);
        }
    }

    size_t execute_instruction(const unsigned char* data_ptr, size_t size_left)
    {
        auto get_index = [&](const unsigned char* data_ptr_index, size_t offset) -> size_t {
            return static_cast<size_t>(data_ptr_index[offset]) % INTERNAL_STATE_SIZE;
        };
        auto get_value = [&](const unsigned char* data_ptr_value, size_t offset) -> numeric::uint256_t {
            std::array<uint64_t, 4> limbs;
            for (size_t i = 0; i < 4; i++) {
                limbs[i] = *reinterpret_cast<const uint64_t*>(data_ptr_value + offset + i * 8);
            }
            return numeric::uint256_t(limbs[0], limbs[1], limbs[2], limbs[3]);
        };
        auto get_uint64 = [&](const unsigned char* data_ptr_value, size_t offset) -> uint64_t {
            return *reinterpret_cast<const uint64_t*>(data_ptr_value + offset);
        };
        // Read the instruction
        Instruction instruction = static_cast<Instruction>(*data_ptr);
        switch (instruction) {
        case Instruction::SET_VALUE:
            if (size_left < SET_VALUE_SIZE) {
                return size_left;
            }
            if (!settings.enable_set_value) {
                return SET_VALUE_SIZE; // Skip disabled operation but return correct size
            }
            // Read the value
            {
                size_t index = get_index(data_ptr, INSTRUCTION_HEADER_SIZE);
                auto value = get_value(data_ptr, INSTRUCTION_HEADER_SIZE + INDEX_SIZE);
                field_internal_state[index] = Field(value);
                uint_internal_state[index] = value % Field::modulus;
                if (with_debug) {
                    info("SET_VALUE: index: ", index, " value: ", value);
                }
            }
            return SET_VALUE_SIZE;
        case Instruction::ADD:
            if (size_left < ADD_SIZE) {
                return size_left;
            }
            if (!settings.enable_add) {
                return ADD_SIZE; // Skip disabled operation but return correct size
            }
            // Read the two operands
            {
                size_t index1 = get_index(data_ptr, INSTRUCTION_HEADER_SIZE);
                size_t index2 = get_index(data_ptr, INSTRUCTION_HEADER_SIZE + INDEX_SIZE);
                size_t index3 = get_index(data_ptr, INSTRUCTION_HEADER_SIZE + INDEX_SIZE * 2);
                field_internal_state[index3] = field_internal_state[index1] + field_internal_state[index2];
                if constexpr (LARGE_MODULUS) {
                    uint_internal_state[index3] =
                        ((uint512_t(uint_internal_state[index1]) + uint512_t(uint_internal_state[index2])) %
                         uint512_t(Field::modulus))
                            .lo;
                } else {
                    uint_internal_state[index3] =
                        (uint_internal_state[index1] + uint_internal_state[index2]) % Field::modulus;
                }
                if (with_debug) {
                    info("ADD: index1: ",
                         index1,
                         " index2: ",
                         index2,
                         " index3: ",
                         index3,
                         " value: ",
                         field_internal_state[index3]);
                }
            }
            return ADD_SIZE;
        case Instruction::ADD_ASSIGN:
            if (size_left < ADD_ASSIGN_SIZE) {
                return size_left;
            }
            if (!settings.enable_add_assign) {
                return ADD_ASSIGN_SIZE; // Skip disabled operation but return correct size
            }
            // Read the two operands
            {
                size_t index1 = get_index(data_ptr, INSTRUCTION_HEADER_SIZE);
                size_t index2 = get_index(data_ptr, INSTRUCTION_HEADER_SIZE + INDEX_SIZE);
                field_internal_state[index1] += field_internal_state[index2];
                if constexpr (LARGE_MODULUS) {
                    uint_internal_state[index1] =
                        ((uint512_t(uint_internal_state[index1]) + uint512_t(uint_internal_state[index2])) %
                         uint512_t(Field::modulus))
                            .lo;
                } else {
                    uint_internal_state[index1] =
                        (uint_internal_state[index1] + uint_internal_state[index2]) % Field::modulus;
                }
                if (with_debug) {
                    info("ADD_ASSIGN: index1: ", index1, " index2: ", index2, " value: ", field_internal_state[index1]);
                }
            }
            return ADD_ASSIGN_SIZE;
        case Instruction::INCREMENT:
            if (size_left < INCREMENT_SIZE) {
                return size_left;
            }
            if (!settings.enable_increment) {
                return INCREMENT_SIZE; // Skip disabled operation but return correct size
            }
            // Read the operand
            {
                size_t index = get_index(data_ptr, INSTRUCTION_HEADER_SIZE);
                field_internal_state[index]++;
                if constexpr (LARGE_MODULUS) {
                    uint_internal_state[index] =
                        ((uint512_t(uint_internal_state[index]) + uint512_t(1)) % uint512_t(Field::modulus)).lo;
                } else {
                    uint_internal_state[index] = (uint_internal_state[index] + 1) % Field::modulus;
                }
                if (with_debug) {
                    info("INCREMENT: index: ", index, " value: ", field_internal_state[index]);
                }
            }
            return INCREMENT_SIZE;
        case Instruction::MUL:
            if (size_left < MUL_SIZE) {
                return size_left;
            }
            if (!settings.enable_mul) {
                return MUL_SIZE; // Skip disabled operation but return correct size
            }
            // Read the two operands
            {
                size_t index1 = get_index(data_ptr, INSTRUCTION_HEADER_SIZE);
                size_t index2 = get_index(data_ptr, INSTRUCTION_HEADER_SIZE + INDEX_SIZE);
                size_t index3 = get_index(data_ptr, INSTRUCTION_HEADER_SIZE + INDEX_SIZE * 2);
                field_internal_state[index3] = field_internal_state[index1] * field_internal_state[index2];
                uint_internal_state[index3] =
                    ((uint512_t(uint_internal_state[index1]) * uint512_t(uint_internal_state[index2])) % Field::modulus)
                        .lo;
                if (with_debug) {
                    info("MUL: index1: ",
                         index1,
                         " index2: ",
                         index2,
                         " index3: ",
                         index3,
                         " value: ",
                         field_internal_state[index3]);
                }
            }
            return MUL_SIZE;
        case Instruction::MUL_ASSIGN:
            if (size_left < MUL_ASSIGN_SIZE) {
                return size_left;
            }
            if (!settings.enable_mul_assign) {
                return MUL_ASSIGN_SIZE; // Skip disabled operation but return correct size
            }
            // Read the two operands
            {
                size_t index1 = get_index(data_ptr, INSTRUCTION_HEADER_SIZE);
                size_t index2 = get_index(data_ptr, INSTRUCTION_HEADER_SIZE + INDEX_SIZE);
                field_internal_state[index1] *= field_internal_state[index2];
                uint_internal_state[index1] =
                    ((uint512_t(uint_internal_state[index1]) * uint512_t(uint_internal_state[index2])) % Field::modulus)
                        .lo;
                if (with_debug) {
                    info("MUL_ASSIGN: index1: ", index1, " index2: ", index2, " value: ", field_internal_state[index1]);
                }
            }
            return MUL_ASSIGN_SIZE;
        case Instruction::SUB:
            if (size_left < SUB_SIZE) {
                return size_left;
            }
            if (!settings.enable_sub) {
                return SUB_SIZE; // Skip disabled operation but return correct size
            }
            // Read the two operands
            {
                size_t index1 = get_index(data_ptr, INSTRUCTION_HEADER_SIZE);
                size_t index2 = get_index(data_ptr, INSTRUCTION_HEADER_SIZE + INDEX_SIZE);
                size_t index3 = get_index(data_ptr, INSTRUCTION_HEADER_SIZE + INDEX_SIZE * 2);
                field_internal_state[index3] = field_internal_state[index1] - field_internal_state[index2];
                if constexpr (LARGE_MODULUS) {
                    uint_internal_state[index3] = ((uint512_t(Field::modulus) + uint512_t(uint_internal_state[index1]) -
                                                    uint512_t(uint_internal_state[index2])) %
                                                   uint512_t(Field::modulus))
                                                      .lo;
                } else {
                    uint_internal_state[index3] =
                        (Field::modulus + uint_internal_state[index1] - uint_internal_state[index2]) % Field::modulus;
                }
                if (with_debug) {
                    info("SUB: index1: ",
                         index1,
                         " index2: ",
                         index2,
                         " index3: ",
                         index3,
                         " value: ",
                         field_internal_state[index3]);
                }
            }
            return SUB_SIZE;
        case Instruction::SUB_ASSIGN:
            if (size_left < SUB_ASSIGN_SIZE) {
                return size_left;
            }
            if (!settings.enable_sub_assign) {
                return SUB_ASSIGN_SIZE; // Skip disabled operation but return correct size
            }
            // Read the two operands
            {
                size_t index1 = get_index(data_ptr, INSTRUCTION_HEADER_SIZE);
                size_t index2 = get_index(data_ptr, INSTRUCTION_HEADER_SIZE + INDEX_SIZE);
                field_internal_state[index1] -= field_internal_state[index2];
                if constexpr (LARGE_MODULUS) {
                    uint_internal_state[index1] = ((uint512_t(Field::modulus) + uint512_t(uint_internal_state[index1]) -
                                                    uint512_t(uint_internal_state[index2])) %
                                                   uint512_t(Field::modulus))
                                                      .lo;
                } else {
                    uint_internal_state[index1] =
                        (Field::modulus + uint_internal_state[index1] - uint_internal_state[index2]) % Field::modulus;
                }
                if (with_debug) {
                    info("SUB_ASSIGN: index1: ", index1, " index2: ", index2, " value: ", field_internal_state[index1]);
                }
            }
            return SUB_ASSIGN_SIZE;
        case Instruction::DIV:
            if (size_left < DIV_SIZE) {
                return size_left;
            }
            if (!settings.enable_div) {
                return DIV_SIZE; // Skip disabled operation but return correct size
            }
            // Read the two operands
            {
                size_t index1 = get_index(data_ptr, INSTRUCTION_HEADER_SIZE);
                size_t index2 = get_index(data_ptr, INSTRUCTION_HEADER_SIZE + INDEX_SIZE);
                size_t index3 = get_index(data_ptr, INSTRUCTION_HEADER_SIZE + INDEX_SIZE * 2);
                // Skip division if divisor is zero
                if (!field_internal_state[index2].is_zero()) {
                    field_internal_state[index3] = field_internal_state[index1] / field_internal_state[index2];
                    // For uint256_t, we'll compute division using the field result
                    assert((uint512_t(static_cast<numeric::uint256_t>(field_internal_state[index3])) *
                            uint512_t(uint_internal_state[index2])) %
                               uint512_t(Field::modulus) ==
                           uint512_t(uint_internal_state[index1]));
                    uint_internal_state[index3] = static_cast<numeric::uint256_t>(field_internal_state[index3]);
                }
                if (with_debug) {
                    info("DIV: index1: ",
                         index1,
                         " index2: ",
                         index2,
                         " index3: ",
                         index3,
                         " value: ",
                         field_internal_state[index3]);
                }
            }
            return DIV_SIZE;
        case Instruction::DIV_ASSIGN:
            if (size_left < DIV_ASSIGN_SIZE) {
                return size_left;
            }
            if (!settings.enable_div_assign) {
                return DIV_ASSIGN_SIZE; // Skip disabled operation but return correct size
            }
            // Read the two operands
            {
                size_t index1 = get_index(data_ptr, INSTRUCTION_HEADER_SIZE);
                size_t index2 = get_index(data_ptr, INSTRUCTION_HEADER_SIZE + INDEX_SIZE);
                auto original_value = uint_internal_state[index1];
                // Skip division if divisor is zero
                if (!field_internal_state[index2].is_zero()) {
                    field_internal_state[index1] /= field_internal_state[index2];
                    // For uint256_t, we'll compute division using the field result
                    if (!((uint512_t(static_cast<numeric::uint256_t>(field_internal_state[index1])) *
                           uint512_t(uint_internal_state[index2])) %
                              uint512_t(Field::modulus) ==
                          uint512_t(uint_internal_state[index1]))) {
                        // Deliberately set to different value
                        uint_internal_state[index1] = uint256_t(field_internal_state[index1]) + 1;
                    }
                    uint_internal_state[index1] = static_cast<numeric::uint256_t>(field_internal_state[index1]);
                }
                if (with_debug) {
                    info("DIV_ASSIGN: index1: ",
                         index1,
                         " index2: ",
                         index2,
                         " value: ",
                         field_internal_state[index1],
                         " original_value: ",
                         original_value);
                }
            }
            return DIV_ASSIGN_SIZE;
        case Instruction::INV:
            if (size_left < INV_SIZE) {
                return size_left;
            }
            if (!settings.enable_inv) {
                return INV_SIZE; // Skip disabled operation but return correct size
            }
            // Read the operand
            {
                size_t index1 = get_index(data_ptr, INSTRUCTION_HEADER_SIZE);
                size_t index2 = get_index(data_ptr, INSTRUCTION_HEADER_SIZE + INDEX_SIZE);
                auto original_value = uint_internal_state[index2];
                // Skip inversion if operand is zero
                if (!field_internal_state[index1].is_zero()) {
                    field_internal_state[index2] = field_internal_state[index1].invert();
                    // For uint256_t, we'll compute inversion using the field result
                    if (!((uint512_t(static_cast<numeric::uint256_t>(field_internal_state[index2])) *
                           uint512_t(uint_internal_state[index1])) %
                              uint512_t(Field::modulus) ==
                          uint512_t(1))) {
                        // Deliberately set to different value
                        uint_internal_state[index2] = uint256_t(field_internal_state[index2]) + 1;
                    } else {
                        uint_internal_state[index2] = static_cast<numeric::uint256_t>(field_internal_state[index2]);
                    }
                }
                if (with_debug) {
                    info("INV: index1: ",
                         index1,
                         " index2: ",
                         index2,
                         " value: ",
                         field_internal_state[index2],
                         " original_value: ",
                         original_value);
                }
            }
            return INV_SIZE;
        case Instruction::NEG:
            if (size_left < NEG_SIZE) {
                return size_left;
            }
            if (!settings.enable_neg) {
                return NEG_SIZE; // Skip disabled operation but return correct size
            }
            // Read the operand
            {
                size_t index1 = get_index(data_ptr, INSTRUCTION_HEADER_SIZE);
                size_t index2 = get_index(data_ptr, INSTRUCTION_HEADER_SIZE + INDEX_SIZE);
                field_internal_state[index2] = -field_internal_state[index1];
                if constexpr (LARGE_MODULUS) {
                    uint_internal_state[index2] =
                        ((uint512_t(Field::modulus) - uint512_t(uint_internal_state[index1])) %
                         uint512_t(Field::modulus))
                            .lo;
                } else {
                    uint_internal_state[index2] = (Field::modulus - uint_internal_state[index1]) % Field::modulus;
                }
                if (with_debug) {
                    info("NEG: index1: ", index1, " index2: ", index2, " value: ", field_internal_state[index2]);
                }
            }
            return NEG_SIZE;
        case Instruction::SQR:
            if (size_left < SQR_SIZE) {
                return size_left;
            }
            if (!settings.enable_sqr) {
                return SQR_SIZE; // Skip disabled operation but return correct size
            }
            // Read the operand
            {
                size_t index1 = get_index(data_ptr, INSTRUCTION_HEADER_SIZE);
                size_t index2 = get_index(data_ptr, INSTRUCTION_HEADER_SIZE + INDEX_SIZE);
                field_internal_state[index2] = field_internal_state[index1].sqr();
                if constexpr (LARGE_MODULUS) {
                    uint_internal_state[index2] =
                        ((uint512_t(uint_internal_state[index1]) * uint512_t(uint_internal_state[index1])) %
                         uint512_t(Field::modulus))
                            .lo;
                } else {
                    uint_internal_state[index2] =
                        ((uint512_t(uint_internal_state[index1]) * uint512_t(uint_internal_state[index1])) %
                         Field::modulus)
                            .lo;
                }
                if (with_debug) {
                    info("SQR: index1: ", index1, " index2: ", index2, " value: ", field_internal_state[index2]);
                }
            }
            return SQR_SIZE;
        case Instruction::SQR_ASSIGN:
            if (size_left < SQR_ASSIGN_SIZE) {
                return size_left;
            }
            if (!settings.enable_sqr_assign) {
                return SQR_ASSIGN_SIZE; // Skip disabled operation but return correct size
            }
            // Read the operand
            {
                size_t index = get_index(data_ptr, INSTRUCTION_HEADER_SIZE);
                field_internal_state[index].self_sqr();
                if constexpr (LARGE_MODULUS) {
                    uint_internal_state[index] =
                        ((uint512_t(uint_internal_state[index]) * uint512_t(uint_internal_state[index])) %
                         uint512_t(Field::modulus))
                            .lo;
                } else {
                    uint_internal_state[index] =
                        ((uint512_t(uint_internal_state[index]) * uint512_t(uint_internal_state[index])) %
                         Field::modulus)
                            .lo;
                }
                if (with_debug) {
                    info("SQR_ASSIGN: index: ", index, " value: ", field_internal_state[index]);
                }
            }
            return SQR_ASSIGN_SIZE;
        case Instruction::POW:
            if (size_left < POW_SIZE) {
                return size_left;
            }
            if (!settings.enable_pow) {
                return POW_SIZE; // Skip disabled operation but return correct size
            }
            // Read the operand and exponent
            {
                size_t index1 = get_index(data_ptr, INSTRUCTION_HEADER_SIZE);
                size_t index2 = get_index(data_ptr, INSTRUCTION_HEADER_SIZE + INDEX_SIZE);
                uint64_t exponent = get_uint64(data_ptr, INSTRUCTION_HEADER_SIZE + INDEX_SIZE * 2);
                field_internal_state[index2] = field_internal_state[index1].pow(exponent);
                auto multiplicand = uint512_t(uint_internal_state[index1]);
                auto current = uint512_t(1);
                while (exponent > 0) {
                    if (exponent & 1) {
                        current = (current * multiplicand) % uint512_t(Field::modulus);
                    }
                    multiplicand = (multiplicand * multiplicand) % uint512_t(Field::modulus);
                    exponent >>= 1;
                }
                uint_internal_state[index2] = current.lo;
                if (with_debug) {
                    info("POW: index1: ",
                         index1,
                         " index2: ",
                         index2,
                         " exponent: ",
                         exponent,
                         " value: ",
                         field_internal_state[index2]);
                }
            }
            return POW_SIZE;
        case Instruction::SQRT:
            if (size_left < SQRT_SIZE) {
                return size_left;
            }
            if (!settings.enable_sqrt) {
                return SQRT_SIZE; // Skip disabled operation but return correct size
            }
            // Read the operand
            {
                size_t index1 = get_index(data_ptr, INSTRUCTION_HEADER_SIZE);
                size_t index2 = get_index(data_ptr, INSTRUCTION_HEADER_SIZE + INDEX_SIZE);
                auto [found, root] = field_internal_state[index1].sqrt();
                if (found) {
                    field_internal_state[index2] = root;
                    assert((uint512_t(static_cast<numeric::uint256_t>(field_internal_state[index2])) *
                            uint512_t(static_cast<numeric::uint256_t>(field_internal_state[index2]))) %
                               uint512_t(Field::modulus) ==
                           uint512_t(uint_internal_state[index1]));
                    uint_internal_state[index2] = static_cast<numeric::uint256_t>(root);
                }
                if (with_debug) {
                    info("SQRT: index1: ",
                         index1,
                         " index2: ",
                         index2,
                         " found: ",
                         found,
                         " value: ",
                         field_internal_state[index2]);
                }
            }
            return SQRT_SIZE;
        case Instruction::IS_ZERO:
            if (size_left < IS_ZERO_SIZE) {
                return size_left;
            }
            if (!settings.enable_is_zero) {
                return IS_ZERO_SIZE; // Skip disabled operation but return correct size
            }
            // Read the operand
            {
                size_t index1 = get_index(data_ptr, INSTRUCTION_HEADER_SIZE);
                assert((uint_internal_state[index1] == 0) == field_internal_state[index1].is_zero());
                if (with_debug) {
                    info("IS_ZERO: index1: ", index1, " result: ", field_internal_state[index1].is_zero());
                }
            }
            return IS_ZERO_SIZE;
        case Instruction::EQUAL:
            if (size_left < EQUAL_SIZE) {
                return size_left;
            }
            if (!settings.enable_equal) {
                return EQUAL_SIZE; // Skip disabled operation but return correct size
            }
            // Read the operands
            {
                size_t index1 = get_index(data_ptr, INSTRUCTION_HEADER_SIZE);
                size_t index2 = get_index(data_ptr, INSTRUCTION_HEADER_SIZE + INDEX_SIZE);
                assert((field_internal_state[index1] == field_internal_state[index2]) ==
                       (uint_internal_state[index1] == uint_internal_state[index2]));
                if (with_debug) {
                    info("EQUAL: index1: ",
                         index1,
                         " index2: ",
                         index2,
                         " result: ",
                         field_internal_state[index1] == field_internal_state[index2]);
                }
            }
            return EQUAL_SIZE;
        case Instruction::NOT_EQUAL:
            if (size_left < NOT_EQUAL_SIZE) {
                return size_left;
            }
            if (!settings.enable_not_equal) {
                return NOT_EQUAL_SIZE; // Skip disabled operation but return correct size
            }
            // Read the operands
            {
                size_t index1 = get_index(data_ptr, INSTRUCTION_HEADER_SIZE);
                size_t index2 = get_index(data_ptr, INSTRUCTION_HEADER_SIZE + INDEX_SIZE);
                assert((field_internal_state[index1] != field_internal_state[index2]) ==
                       (uint_internal_state[index1] != uint_internal_state[index2]));
                if (with_debug) {
                    info("NOT_EQUAL: index1: ",
                         index1,
                         " index2: ",
                         index2,
                         " result: ",
                         field_internal_state[index1] != field_internal_state[index2]);
                }
            }
            return NOT_EQUAL_SIZE;
        case Instruction::TO_MONTGOMERY:
            if (size_left < TO_MONTGOMERY_SIZE) {
                return size_left;
            }
            if (!settings.enable_to_montgomery) {
                return TO_MONTGOMERY_SIZE; // Skip disabled operation but return correct size
            }
            // Read the operand
            {
                size_t index1 = get_index(data_ptr, INSTRUCTION_HEADER_SIZE);
                size_t index2 = get_index(data_ptr, INSTRUCTION_HEADER_SIZE + INDEX_SIZE);
                field_internal_state[index2] = field_internal_state[index1].to_montgomery_form();
                uint_internal_state[index2] =
                    ((uint512_t(uint_internal_state[index1]) << 256) % uint512_t(Field::modulus)).lo;
                // Note: uint_internal_state doesn't track Montgomery form
                if (with_debug) {
                    info("TO_MONTGOMERY: index1: ",
                         index1,
                         " index2: ",
                         index2,
                         " value: ",
                         field_internal_state[index2]);
                }
            }
            return TO_MONTGOMERY_SIZE;
        case Instruction::FROM_MONTGOMERY:
            if (size_left < FROM_MONTGOMERY_SIZE) {
                return size_left;
            }
            if (!settings.enable_from_montgomery) {
                return FROM_MONTGOMERY_SIZE; // Skip disabled operation but return correct size
            }
            // Read the operand
            {
                size_t index1 = get_index(data_ptr, INSTRUCTION_HEADER_SIZE);
                size_t index2 = get_index(data_ptr, INSTRUCTION_HEADER_SIZE + INDEX_SIZE);
                field_internal_state[index2] = field_internal_state[index1].from_montgomery_form();
                uint_internal_state[index2] = uint_internal_state[index1];
                for (size_t i = 0; i < 256; i++) {
                    if (uint_internal_state[index2] & 1) {
                        uint_internal_state[index2] += Field::modulus;
                    }
                    uint_internal_state[index2] >>= 1;
                }
                if (with_debug) {
                    info("FROM_MONTGOMERY: index1: ",
                         index1,
                         " index2: ",
                         index2,
                         " value: ",
                         field_internal_state[index2]);
                }
            }
            return FROM_MONTGOMERY_SIZE;
        case Instruction::REDUCE_ONCE:
            if (size_left < REDUCE_ONCE_SIZE) {
                return size_left;
            }
            if (!settings.enable_reduce_once) {
                return REDUCE_ONCE_SIZE; // Skip disabled operation but return correct size
            }
            // Read the operand
            {
                size_t index1 = get_index(data_ptr, INSTRUCTION_HEADER_SIZE);
                size_t index2 = get_index(data_ptr, INSTRUCTION_HEADER_SIZE + INDEX_SIZE);
                field_internal_state[index2] = field_internal_state[index1].reduce_once();
                uint_internal_state[index2] = uint_internal_state[index1];
                if (with_debug) {
                    info(
                        "REDUCE_ONCE: index1: ", index1, " index2: ", index2, " value: ", field_internal_state[index2]);
                }
            }
            return REDUCE_ONCE_SIZE;
        case Instruction::SELF_REDUCE:
            if (size_left < SELF_REDUCE_SIZE) {
                return size_left;
            }
            if (!settings.enable_self_reduce) {
                return SELF_REDUCE_SIZE; // Skip disabled operation but return correct size
            }
            // Read the operand
            {
                size_t index = get_index(data_ptr, INSTRUCTION_HEADER_SIZE);
                field_internal_state[index].self_reduce_once();
                if (with_debug) {
                    info("SELF_REDUCE: index: ", index, " value: ", field_internal_state[index]);
                }
            }
            return SELF_REDUCE_SIZE;
        case Instruction::BATCH_INVERT:
            if (size_left < BATCH_INVERT_SIZE) {
                return size_left;
            }
            if (!settings.enable_batch_invert) {
                return BATCH_INVERT_SIZE; // Skip disabled operation but return correct size
            }
            // Read the operands and count
            {
                size_t start_index = get_index(data_ptr, INSTRUCTION_HEADER_SIZE);
                size_t count =
                    static_cast<size_t>(data_ptr[INSTRUCTION_HEADER_SIZE + INDEX_SIZE]) % (INTERNAL_STATE_SIZE / 2);
                if (count == 0)
                    count = 1; // Ensure at least one element
                if (start_index + count > INTERNAL_STATE_SIZE) {
                    count = INTERNAL_STATE_SIZE - start_index;
                }

                // Store original values for comparison
                std::vector<Field> original_elements;
                std::vector<numeric::uint256_t> original_uint_elements;
                std::vector<size_t> valid_indices;

                for (size_t i = 0; i < count; i++) {
                    size_t idx = start_index + i;
                    original_elements.push_back(field_internal_state[idx]);
                    original_uint_elements.push_back(uint_internal_state[idx]);
                    valid_indices.push_back(idx);
                }

                // Perform individual inversions for comparison
                std::vector<Field> individual_inverses;
                std::vector<numeric::uint256_t> individual_uint_inverses;
                for (size_t i = 0; i < valid_indices.size(); i++) {
                    size_t idx = valid_indices[i];
                    if (!field_internal_state[idx].is_zero()) {
                        Field inv = field_internal_state[idx].invert();
                        individual_inverses.push_back(inv);
                        individual_uint_inverses.push_back(static_cast<numeric::uint256_t>(inv));
                    } else {
                        individual_inverses.push_back(Field::zero());
                        individual_uint_inverses.push_back(numeric::uint256_t(0));
                    }
                }

                // Collect non-zero elements for batch inversion
                std::vector<Field> non_zero_elements;
                std::vector<size_t> non_zero_indices;
                for (size_t i = 0; i < count; i++) {
                    size_t idx = start_index + i;
                    if (!field_internal_state[idx].is_zero()) {
                        non_zero_elements.push_back(field_internal_state[idx]);
                        non_zero_indices.push_back(idx);
                    }
                }

                if (!non_zero_elements.empty()) {
                    // Perform batch inversion (modifies non_zero_elements in-place)
                    Field::batch_invert(non_zero_elements);

                    // Store batch results back
                    for (size_t i = 0; i < non_zero_indices.size(); i++) {
                        size_t idx = non_zero_indices[i];
                        field_internal_state[idx] = non_zero_elements[i];
                        uint_internal_state[idx] = static_cast<numeric::uint256_t>(non_zero_elements[i]);
                    }
                }

                // Verify that batch inversion produces the same results as individual inversions
                for (size_t i = 0; i < valid_indices.size(); i++) {
                    size_t idx = valid_indices[i];
                    if (!original_elements[i].is_zero()) {
                        // Check that batch and individual inversions match
                        assert(field_internal_state[idx] == individual_inverses[i]);
                        assert(uint_internal_state[idx] == individual_uint_inverses[i]);

                        // Verify the inverse property: a * a^(-1) = 1
                        Field product = original_elements[i] * field_internal_state[idx];
                        assert(product == Field::one());

                        // Verify uint arithmetic consistency
                        uint512_t uint_product =
                            (uint512_t(original_uint_elements[i]) * uint512_t(uint_internal_state[idx])) %
                            uint512_t(Field::modulus);
                        assert(uint_product == uint512_t(1));
                    } else {
                        // Zero elements should remain zero
                        assert(field_internal_state[idx] == Field::zero());
                        assert(uint_internal_state[idx] == numeric::uint256_t(0));
                    }
                }

                if (with_debug) {
                    info("BATCH_INVERT: start_index: ",
                         start_index,
                         " count: ",
                         count,
                         " non_zero_count: ",
                         non_zero_elements.size());
                }
            }
            return BATCH_INVERT_SIZE;
        default:
            // Move the pointer forward by 1
            return 1;
        }
    }

    /**
     * @brief Run the VM
     * @param Data The data to run the VM on
     * @param Size The size of the data
     * @param reset_steps Whether to reset the step counter (default: true)
     *
     */
    void run(const unsigned char* Data, size_t Size, bool reset_steps = true)
    {
        if (Size < SETTINGS_SIZE) {
            return; // Not enough data for settings
        }

        // Read settings from the beginning of the buffer
        const VMSettings* settings_ptr = reinterpret_cast<const VMSettings*>(Data);
        settings = *settings_ptr;

        size_t size_left = Size - SETTINGS_SIZE;
        const unsigned char* data_ptr = Data + SETTINGS_SIZE;

        if (reset_steps) {
            step_count = 0;
        }

        while (size_left > 0 && step_count < max_steps) {
            size_t shift = this->execute_instruction(data_ptr, size_left);
            size_left -= shift;
            data_ptr += shift;
            step_count++;
        }
    }
    bool check_internal_state() const
    {
        for (size_t i = 0; i < INTERNAL_STATE_SIZE; i++) {
            if (field_internal_state[i] != Field(uint_internal_state[i])) {
                if (with_debug) {
                    info("check_internal_state: index: ",
                         i,
                         " field: ",
                         field_internal_state[i],
                         " uint: ",
                         uint_internal_state[i]);
                }
                return false;
            }
        }
        return true;
    }

    /**
     * @brief Export the final uint state as a vector of uint256_t values
     * @return std::vector<numeric::uint256_t> The final uint state
     */
    std::vector<numeric::uint256_t> export_uint_state() const
    {
        std::vector<numeric::uint256_t> result;
        result.reserve(INTERNAL_STATE_SIZE);
        for (size_t i = 0; i < INTERNAL_STATE_SIZE; i++) {
            result.push_back(uint_internal_state[i]);
        }
        return result;
    }

    /**
     * @brief Get the number of steps executed
     * @return size_t The number of steps executed
     */
    size_t get_step_count() const { return step_count; }

    /**
     * @brief Check if the VM was stopped due to reaching max steps
     * @return bool True if the VM was stopped due to max steps
     */
    bool was_stopped_by_max_steps() const { return step_count >= max_steps; }

    /**
     * @brief Set a new step limit for the VM
     * @param new_max_steps The new maximum number of steps
     */
    void set_max_steps(size_t new_max_steps) { max_steps = new_max_steps; }

    /**
     * @brief Reset the step counter to 0
     */
    void reset_step_count() { step_count = 0; }

    /**
     * @brief Get the current step limit
     * @return size_t The current maximum number of steps
     */
    size_t get_max_steps() const { return max_steps; }

    /**
     * @brief Check if there are remaining steps available
     * @return bool True if more steps can be executed
     */
    bool has_remaining_steps() const { return step_count < max_steps; }
};

} // namespace bb

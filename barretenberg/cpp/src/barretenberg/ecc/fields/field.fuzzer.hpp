/**
 * @file field.fuzzer.hpp
 * @brief Field arithmetic fuzzer for testing cryptographic field operations
 *
 * @details This header provides a virtual machine for fuzzing field arithmetic operations
 * across different elliptic curve fields. The VM supports various field operations including
 * addition, multiplication, division, inversion, and more complex operations like batch
 * inversion and Montgomery form conversions.
 *
 * @author Barretenberg Team
 * @date 2024
 */
#pragma once

#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/numeric/uintx/uintx.hpp"
#include <algorithm>
#include <array>
#include <cstddef>
#include <cstring>
#include <vector>

namespace bb {

/**
 * @brief Constant defining the number of elements in the VM's internal state
 */
const size_t INTERNAL_STATE_SIZE = 32;

/**
 * @brief Settings structure to control which operations are enabled in the VM
 *
 * @details This structure uses bit fields to efficiently control which field operations
 * are enabled during fuzzing. Each bit corresponds to a specific operation type.
 */
struct VMSettings {
    bool enable_set_value : 1;       ///< Enable SET_VALUE operations
    bool enable_add : 1;             ///< Enable ADD operations
    bool enable_add_assign : 1;      ///< Enable ADD_ASSIGN operations
    bool enable_increment : 1;       ///< Enable INCREMENT operations
    bool enable_mul : 1;             ///< Enable MUL operations
    bool enable_mul_assign : 1;      ///< Enable MUL_ASSIGN operations
    bool enable_sub : 1;             ///< Enable SUB operations
    bool enable_sub_assign : 1;      ///< Enable SUB_ASSIGN operations
    bool enable_div : 1;             ///< Enable DIV operations
    bool enable_div_assign : 1;      ///< Enable DIV_ASSIGN operations
    bool enable_inv : 1;             ///< Enable INV operations
    bool enable_neg : 1;             ///< Enable NEG operations
    bool enable_sqr : 1;             ///< Enable SQR operations
    bool enable_sqr_assign : 1;      ///< Enable SQR_ASSIGN operations
    bool enable_pow : 1;             ///< Enable POW operations
    bool enable_sqrt : 1;            ///< Enable SQRT operations
    bool enable_is_zero : 1;         ///< Enable IS_ZERO operations
    bool enable_equal : 1;           ///< Enable EQUAL operations
    bool enable_not_equal : 1;       ///< Enable NOT_EQUAL operations
    bool enable_to_montgomery : 1;   ///< Enable TO_MONTGOMERY operations
    bool enable_from_montgomery : 1; ///< Enable FROM_MONTGOMERY operations
    bool enable_reduce_once : 1;     ///< Enable REDUCE_ONCE operations
    bool enable_self_reduce : 1;     ///< Enable SELF_REDUCE operations
    bool enable_batch_invert : 1;    ///< Enable BATCH_INVERT operations
    uint8_t reserved : 8;            ///< Reserved for future use
};

static_assert(sizeof(VMSettings) == 4, "VMSettings must be exactly 4 bytes");

const size_t SETTINGS_SIZE = sizeof(VMSettings);

/**
 * @brief Enumeration of VM instructions that can be executed
 *
 * @details Each instruction corresponds to a specific field arithmetic operation.
 * The VM parses these instructions from input data and executes them sequentially.
 */
enum class Instruction {
    SET_VALUE,       ///< Set a field element to a specific value
    ADD,             ///< Add two field elements
    ADD_ASSIGN,      ///< Add-assign operation
    INCREMENT,       ///< Increment a field element by 1
    MUL,             ///< Multiply two field elements
    MUL_ASSIGN,      ///< Multiply-assign operation
    SUB,             ///< Subtract two field elements
    SUB_ASSIGN,      ///< Subtract-assign operation
    DIV,             ///< Divide two field elements
    DIV_ASSIGN,      ///< Divide-assign operation
    INV,             ///< Invert a field element
    NEG,             ///< Negate a field element
    SQR,             ///< Square a field element
    SQR_ASSIGN,      ///< Square-assign operation
    POW,             ///< Raise a field element to a power
    SQRT,            ///< Compute square root of a field element
    IS_ZERO,         ///< Check if a field element is zero
    EQUAL,           ///< Check if two field elements are equal
    NOT_EQUAL,       ///< Check if two field elements are not equal
    TO_MONTGOMERY,   ///< Convert to Montgomery form
    FROM_MONTGOMERY, ///< Convert from Montgomery form
    REDUCE_ONCE,     ///< Reduce a field element once
    SELF_REDUCE,     ///< Self-reduce a field element
    BATCH_INVERT,    ///< Batch invert multiple field elements
};

const size_t INSTRUCTION_HEADER_SIZE = 1; ///< Size of instruction header in bytes
const size_t INDEX_SIZE = 1;              ///< Size of index field in bytes

static_assert(1 << (8 * INDEX_SIZE) > INTERNAL_STATE_SIZE, "INDEX_SIZE is too small");

// Instruction size constants
const size_t SET_VALUE_SIZE =
    INSTRUCTION_HEADER_SIZE + INDEX_SIZE + sizeof(numeric::uint256_t);               ///< Size of SET_VALUE instruction
const size_t ADD_SIZE = INSTRUCTION_HEADER_SIZE + INDEX_SIZE * 3;                    ///< Size of ADD instruction
const size_t ADD_ASSIGN_SIZE = INSTRUCTION_HEADER_SIZE + INDEX_SIZE * 2;             ///< Size of ADD_ASSIGN instruction
const size_t INCREMENT_SIZE = INSTRUCTION_HEADER_SIZE + INDEX_SIZE;                  ///< Size of INCREMENT instruction
const size_t MUL_SIZE = INSTRUCTION_HEADER_SIZE + INDEX_SIZE * 3;                    ///< Size of MUL instruction
const size_t MUL_ASSIGN_SIZE = INSTRUCTION_HEADER_SIZE + INDEX_SIZE * 2;             ///< Size of MUL_ASSIGN instruction
const size_t SUB_SIZE = INSTRUCTION_HEADER_SIZE + INDEX_SIZE * 3;                    ///< Size of SUB instruction
const size_t SUB_ASSIGN_SIZE = INSTRUCTION_HEADER_SIZE + INDEX_SIZE * 2;             ///< Size of SUB_ASSIGN instruction
const size_t DIV_SIZE = INSTRUCTION_HEADER_SIZE + INDEX_SIZE * 3;                    ///< Size of DIV instruction
const size_t DIV_ASSIGN_SIZE = INSTRUCTION_HEADER_SIZE + INDEX_SIZE * 2;             ///< Size of DIV_ASSIGN instruction
const size_t INV_SIZE = INSTRUCTION_HEADER_SIZE + INDEX_SIZE * 2;                    ///< Size of INV instruction
const size_t NEG_SIZE = INSTRUCTION_HEADER_SIZE + INDEX_SIZE * 2;                    ///< Size of NEG instruction
const size_t SQR_SIZE = INSTRUCTION_HEADER_SIZE + INDEX_SIZE * 2;                    ///< Size of SQR instruction
const size_t SQR_ASSIGN_SIZE = INSTRUCTION_HEADER_SIZE + INDEX_SIZE;                 ///< Size of SQR_ASSIGN instruction
const size_t POW_SIZE = INSTRUCTION_HEADER_SIZE + INDEX_SIZE * 3 + sizeof(uint64_t); ///< Size of POW instruction
const size_t SQRT_SIZE = INSTRUCTION_HEADER_SIZE + INDEX_SIZE * 2;                   ///< Size of SQRT instruction
const size_t IS_ZERO_SIZE = INSTRUCTION_HEADER_SIZE + INDEX_SIZE;                    ///< Size of IS_ZERO instruction
const size_t EQUAL_SIZE = INSTRUCTION_HEADER_SIZE + INDEX_SIZE * 2;                  ///< Size of EQUAL instruction
const size_t NOT_EQUAL_SIZE = INSTRUCTION_HEADER_SIZE + INDEX_SIZE * 2;              ///< Size of NOT_EQUAL instruction
const size_t TO_MONTGOMERY_SIZE = INSTRUCTION_HEADER_SIZE + INDEX_SIZE * 2;   ///< Size of TO_MONTGOMERY instruction
const size_t FROM_MONTGOMERY_SIZE = INSTRUCTION_HEADER_SIZE + INDEX_SIZE * 2; ///< Size of FROM_MONTGOMERY instruction
const size_t REDUCE_ONCE_SIZE = INSTRUCTION_HEADER_SIZE + INDEX_SIZE * 2;     ///< Size of REDUCE_ONCE instruction
const size_t SELF_REDUCE_SIZE = INSTRUCTION_HEADER_SIZE + INDEX_SIZE;         ///< Size of SELF_REDUCE instruction
const size_t BATCH_INVERT_SIZE =
    INSTRUCTION_HEADER_SIZE + INDEX_SIZE + sizeof(uint8_t); ///< Size of BATCH_INVERT instruction

/**
 * @brief Virtual machine for field arithmetic operations
 *
 * @tparam Field The field type to operate on
 *
 * @details This template class implements a virtual machine that can execute
 * field arithmetic operations. It maintains both field elements and uint256_t
 * representations for verification purposes. The VM supports various field
 * operations and includes comprehensive error checking and debugging capabilities.
 */
template <typename Field> struct FieldVM {
    /**
     * @brief Flag indicating if the field has a large modulus requiring uint512_t for arithmetic
     *
     * @details Fields with moduli >= 2^254 require uint512_t for safe addition/subtraction
     */
    static constexpr bool LARGE_MODULUS = (Field::modulus.data[3] >= 0x4000000000000000ULL);

    /**
     * @brief Flag indicating if the field supports square root operations
     *
     * @details Fields with very small 2-adicity (like secp256r1) have issues with Tonelli-Shanks
     */
    static constexpr bool SUPPORTS_SQRT = []() {
        if constexpr (requires { Field::primitive_root_log_size(); }) {
            // For fields that define primitive_root_log_size, check if it's large enough
            return Field::primitive_root_log_size() >= 6;
        } else {
            // For other fields, assume they support sqrt
            return true;
        }
    }();

    /**
     * @brief Internal state array of field elements
     *
     * @details Used for actual field arithmetic operations
     */
    std::array<Field, INTERNAL_STATE_SIZE> field_internal_state;

    /**
     * @brief Internal state array of uint256_t values
     *
     * @details Used as oracles for checking the correctness of field operations
     */
    std::array<numeric::uint256_t, INTERNAL_STATE_SIZE> uint_internal_state;

    /**
     * @brief Flag to enable debug output
     */
    bool with_debug;

    /**
     * @brief VM settings controlling which operations are enabled
     */
    VMSettings settings;

    /**
     * @brief Maximum number of steps the VM can execute
     */
    size_t max_steps;

    /**
     * @brief Number of steps executed so far
     */
    size_t step_count{};

    /**
     * @brief Constructor for FieldVM
     *
     * @param with_debug Whether to enable debug output
     * @param max_steps Maximum number of steps to execute
     *
     * @details Initializes the VM with default settings and zero-initialized state
     */
    FieldVM(bool with_debug = false, size_t max_steps = SIZE_MAX)
        : with_debug(with_debug)
        , max_steps(max_steps)
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
        settings.enable_sqrt = SUPPORTS_SQRT;
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

    /**
     * @brief Execute a single VM instruction
     *
     * @param data_ptr Pointer to the instruction data
     * @return size_t Number of bytes consumed by the instruction
     *
     * @details This method parses and executes a single VM instruction. It handles
     * all supported field operations and maintains consistency between field and uint256_t
     * representations. The method returns the number of bytes consumed.
     */
    size_t execute_instruction(const unsigned char* data_ptr)
    {
        /**
         * @brief Helper function to get an index from data with wraparound
         *
         * @param data_ptr_index Pointer to the data containing the index
         * @param offset Offset into the data
         * @return size_t The index value wrapped around INTERNAL_STATE_SIZE
         */
        auto get_index = [&](const unsigned char* data_ptr_index, size_t offset) -> size_t {
            return static_cast<size_t>(data_ptr_index[offset]) % INTERNAL_STATE_SIZE;
        };

        // Read the instruction and map it to a valid instruction by taking modulo
        constexpr size_t NUM_INSTRUCTIONS =
            static_cast<size_t>(Instruction::BATCH_INVERT) + 1; ///< Total number of instructions
        uint8_t original_instruction = *data_ptr;
        Instruction instruction = static_cast<Instruction>(original_instruction % NUM_INSTRUCTIONS);
        if (with_debug) {
            const char* instruction_names[] = { "SET_VALUE",   "ADD",           "ADD_ASSIGN",
                                                "INCREMENT",   "MUL",           "MUL_ASSIGN",
                                                "SUB",         "SUB_ASSIGN",    "DIV",
                                                "DIV_ASSIGN",  "INV",           "NEG",
                                                "SQR",         "SQR_ASSIGN",    "POW",
                                                "SQRT",        "IS_ZERO",       "EQUAL",
                                                "NOT_EQUAL",   "TO_MONTGOMERY", "FROM_MONTGOMERY",
                                                "REDUCE_ONCE", "SELF_REDUCE",   "BATCH_INVERT" };
            const char* instruction_name =
                (static_cast<int>(instruction) >= 0 &&
                 static_cast<int>(instruction) <
                     static_cast<int>(sizeof(instruction_names) / sizeof(instruction_names[0])))
                    ? instruction_names[static_cast<int>(instruction)]
                    : "UNKNOWN";
            std::cout << "Executing instruction: " << instruction_name << " (" << static_cast<int>(instruction)
                      << ") at step: " << step_count << std::endl;
        }

        /**
         * @brief Helper function to get a uint256_t value from data
         *
         * @param data_ptr_value Pointer to the data containing the value
         * @param offset Offset into the data
         * @return numeric::uint256_t The uint256_t value read from data
         */
        auto get_value = [&](const unsigned char* data_ptr_value, size_t offset) -> numeric::uint256_t {
            std::array<uint64_t, 4> limbs;
            for (size_t i = 0; i < 4; i++) {
                limbs[i] = *reinterpret_cast<const uint64_t*>(data_ptr_value + offset + i * 8);
            }
            return numeric::uint256_t(limbs[0], limbs[1], limbs[2], limbs[3]);
        };

        /**
         * @brief Helper function to get a uint64_t value from data
         *
         * @param data_ptr_value Pointer to the data containing the value
         * @param offset Offset into the data
         * @return uint64_t The uint64_t value read from data
         */
        auto get_uint64 = [&](const unsigned char* data_ptr_value, size_t offset) -> uint64_t {
            return *reinterpret_cast<const uint64_t*>(data_ptr_value + offset);
        };
        // Execute the instruction
        switch (instruction) {
        case Instruction::SET_VALUE:
            if (!settings.enable_set_value) {
                return SET_VALUE_SIZE; // Skip disabled operation but return correct size
            }
            // Read the value and set the field and uint256_t values
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
            if (!settings.enable_add) {
                return ADD_SIZE; // Skip disabled operation but return correct size
            }
            {
                size_t index1 = get_index(data_ptr, INSTRUCTION_HEADER_SIZE);
                size_t index2 = get_index(data_ptr, INSTRUCTION_HEADER_SIZE + INDEX_SIZE);
                size_t index3 = get_index(data_ptr, INSTRUCTION_HEADER_SIZE + INDEX_SIZE * 2);
                field_internal_state[index3] = field_internal_state[index1] + field_internal_state[index2];
                if constexpr (LARGE_MODULUS) {
                    uint_internal_state[index3] = ((static_cast<uint512_t>(uint_internal_state[index1]) +
                                                    static_cast<uint512_t>(uint_internal_state[index2])) %
                                                   static_cast<uint512_t>(Field::modulus))
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
            if (!settings.enable_add_assign) {
                return ADD_ASSIGN_SIZE; // Skip disabled operation but return correct size
            }
            // Read the two operands
            {
                size_t index1 = get_index(data_ptr, INSTRUCTION_HEADER_SIZE);
                size_t index2 = get_index(data_ptr, INSTRUCTION_HEADER_SIZE + INDEX_SIZE);
                field_internal_state[index1] += field_internal_state[index2];
                if constexpr (LARGE_MODULUS) {
                    uint_internal_state[index1] = ((static_cast<uint512_t>(uint_internal_state[index1]) +
                                                    static_cast<uint512_t>(uint_internal_state[index2])) %
                                                   static_cast<uint512_t>(Field::modulus))
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
            if (!settings.enable_increment) {
                return INCREMENT_SIZE; // Skip disabled operation but return correct size
            }
            // Read the operand
            {
                size_t index = get_index(data_ptr, INSTRUCTION_HEADER_SIZE);
                field_internal_state[index]++;
                if constexpr (LARGE_MODULUS) {
                    uint_internal_state[index] =
                        ((static_cast<uint512_t>(uint_internal_state[index]) + static_cast<uint512_t>(1)) %
                         static_cast<uint512_t>(Field::modulus))
                            .lo;
                } else {
                    uint_internal_state[index] = (uint_internal_state[index] + 1) % Field::modulus;
                }
                if (with_debug) {
                    info("INCREMENT: index: ", index, " value: ", field_internal_state[index]);
                }
            }
            return INCREMENT_SIZE;
        case Instruction::MUL:
            if (!settings.enable_mul) {
                return MUL_SIZE; // Skip disabled operation but return correct size
            }
            // Read the two operands
            {
                size_t index1 = get_index(data_ptr, INSTRUCTION_HEADER_SIZE);
                size_t index2 = get_index(data_ptr, INSTRUCTION_HEADER_SIZE + INDEX_SIZE);
                size_t index3 = get_index(data_ptr, INSTRUCTION_HEADER_SIZE + INDEX_SIZE * 2);
                field_internal_state[index3] = field_internal_state[index1] * field_internal_state[index2];
                uint_internal_state[index3] = ((static_cast<uint512_t>(uint_internal_state[index1]) *
                                                static_cast<uint512_t>(uint_internal_state[index2])) %
                                               static_cast<uint512_t>(Field::modulus))
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
            if (!settings.enable_mul_assign) {
                return MUL_ASSIGN_SIZE; // Skip disabled operation but return correct size
            }
            // Read the two operands
            {
                size_t index1 = get_index(data_ptr, INSTRUCTION_HEADER_SIZE);
                size_t index2 = get_index(data_ptr, INSTRUCTION_HEADER_SIZE + INDEX_SIZE);
                field_internal_state[index1] *= field_internal_state[index2];
                uint_internal_state[index1] = ((static_cast<uint512_t>(uint_internal_state[index1]) *
                                                static_cast<uint512_t>(uint_internal_state[index2])) %
                                               static_cast<uint512_t>(Field::modulus))
                                                  .lo;
                if (with_debug) {
                    info("MUL_ASSIGN: index1: ", index1, " index2: ", index2, " value: ", field_internal_state[index1]);
                }
            }
            return MUL_ASSIGN_SIZE;
        case Instruction::SUB:
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
                    uint_internal_state[index3] =
                        ((static_cast<uint512_t>(Field::modulus) + static_cast<uint512_t>(uint_internal_state[index1]) -
                          static_cast<uint512_t>(uint_internal_state[index2])) %
                         static_cast<uint512_t>(Field::modulus))
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
            if (!settings.enable_sub_assign) {
                return SUB_ASSIGN_SIZE; // Skip disabled operation but return correct size
            }
            // Read the two operands
            {
                size_t index1 = get_index(data_ptr, INSTRUCTION_HEADER_SIZE);
                size_t index2 = get_index(data_ptr, INSTRUCTION_HEADER_SIZE + INDEX_SIZE);
                field_internal_state[index1] -= field_internal_state[index2];
                if constexpr (LARGE_MODULUS) {
                    uint_internal_state[index1] =
                        ((static_cast<uint512_t>(Field::modulus) + static_cast<uint512_t>(uint_internal_state[index1]) -
                          static_cast<uint512_t>(uint_internal_state[index2])) %
                         static_cast<uint512_t>(Field::modulus))
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
                           static_cast<uint512_t>(uint_internal_state[index2])) %
                              static_cast<uint512_t>(Field::modulus) ==
                          static_cast<uint512_t>(uint_internal_state[index1]))) {
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
                           static_cast<uint512_t>(uint_internal_state[index1])) %
                              static_cast<uint512_t>(Field::modulus) ==
                          static_cast<uint512_t>(1))) {
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
            if (!settings.enable_neg) {
                return NEG_SIZE; // Skip disabled operation but return correct size
            }
            // Read the operand
            {
                size_t index1 = get_index(data_ptr, INSTRUCTION_HEADER_SIZE);
                size_t index2 = get_index(data_ptr, INSTRUCTION_HEADER_SIZE + INDEX_SIZE);
                field_internal_state[index2] = -field_internal_state[index1];
                if constexpr (LARGE_MODULUS) {
                    uint_internal_state[index2] = ((static_cast<uint512_t>(Field::modulus) -
                                                    static_cast<uint512_t>(uint_internal_state[index1])) %
                                                   static_cast<uint512_t>(Field::modulus))
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
            if (!settings.enable_sqr) {
                return SQR_SIZE; // Skip disabled operation but return correct size
            }
            // Read the operand
            {
                size_t index1 = get_index(data_ptr, INSTRUCTION_HEADER_SIZE);
                size_t index2 = get_index(data_ptr, INSTRUCTION_HEADER_SIZE + INDEX_SIZE);
                field_internal_state[index2] = field_internal_state[index1].sqr();
                if constexpr (LARGE_MODULUS) {
                    uint_internal_state[index2] = ((static_cast<uint512_t>(uint_internal_state[index1]) *
                                                    static_cast<uint512_t>(uint_internal_state[index1])) %
                                                   static_cast<uint512_t>(Field::modulus))
                                                      .lo;
                } else {
                    uint_internal_state[index2] = ((static_cast<uint512_t>(uint_internal_state[index1]) *
                                                    static_cast<uint512_t>(uint_internal_state[index1])) %
                                                   static_cast<uint512_t>(Field::modulus))
                                                      .lo;
                }
                if (with_debug) {
                    info("SQR: index1: ", index1, " index2: ", index2, " value: ", field_internal_state[index2]);
                }
            }
            return SQR_SIZE;
        case Instruction::SQR_ASSIGN:
            if (!settings.enable_sqr_assign) {
                return SQR_ASSIGN_SIZE; // Skip disabled operation but return correct size
            }
            // Read the operand
            {
                size_t index = get_index(data_ptr, INSTRUCTION_HEADER_SIZE);
                field_internal_state[index].self_sqr();
                if constexpr (LARGE_MODULUS) {
                    uint_internal_state[index] = ((static_cast<uint512_t>(uint_internal_state[index]) *
                                                   static_cast<uint512_t>(uint_internal_state[index])) %
                                                  static_cast<uint512_t>(Field::modulus))
                                                     .lo;
                } else {
                    uint_internal_state[index] = ((static_cast<uint512_t>(uint_internal_state[index]) *
                                                   static_cast<uint512_t>(uint_internal_state[index])) %
                                                  static_cast<uint512_t>(Field::modulus))
                                                     .lo;
                }
                if (with_debug) {
                    info("SQR_ASSIGN: index: ", index, " value: ", field_internal_state[index]);
                }
            }
            return SQR_ASSIGN_SIZE;
        case Instruction::POW:
            if (!settings.enable_pow) {
                return POW_SIZE; // Skip disabled operation but return correct size
            }
            // Read the operand and exponent
            {
                size_t index1 = get_index(data_ptr, INSTRUCTION_HEADER_SIZE);
                size_t index2 = get_index(data_ptr, INSTRUCTION_HEADER_SIZE + INDEX_SIZE);
                uint64_t exponent = get_uint64(data_ptr, INSTRUCTION_HEADER_SIZE + INDEX_SIZE * 2);
                field_internal_state[index2] = field_internal_state[index1].pow(exponent);
                auto multiplicand = static_cast<uint512_t>(uint_internal_state[index1]);
                auto current = static_cast<uint512_t>(1);
                while (exponent > 0) {
                    if (exponent & 1) {
                        current = (current * multiplicand) % static_cast<uint512_t>(Field::modulus);
                    }
                    multiplicand = (multiplicand * multiplicand) % static_cast<uint512_t>(Field::modulus);
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
            if (!settings.enable_sqrt || !SUPPORTS_SQRT) {
                return SQRT_SIZE; // Skip disabled/unsupported operation but return correct size
            }
            // Read the operand
            {
                size_t index1 = get_index(data_ptr, INSTRUCTION_HEADER_SIZE);
                size_t index2 = get_index(data_ptr, INSTRUCTION_HEADER_SIZE + INDEX_SIZE);
                if constexpr (SUPPORTS_SQRT) {
                    auto [found, root] = field_internal_state[index1].sqrt();
                    if (found) {
                        field_internal_state[index2] = root;
                        assert(
                            ((static_cast<uint512_t>(static_cast<numeric::uint256_t>(field_internal_state[index2])) *
                              static_cast<uint512_t>(static_cast<numeric::uint256_t>(field_internal_state[index2]))) %
                             static_cast<uint512_t>(Field::modulus)) ==
                            static_cast<uint512_t>(uint_internal_state[index1]));
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
            }
            return SQRT_SIZE;
        case Instruction::IS_ZERO:
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
            if (!settings.enable_to_montgomery) {
                return TO_MONTGOMERY_SIZE; // Skip disabled operation but return correct size
            }
            // Read the operand
            {
                size_t index1 = get_index(data_ptr, INSTRUCTION_HEADER_SIZE);
                size_t index2 = get_index(data_ptr, INSTRUCTION_HEADER_SIZE + INDEX_SIZE);
                field_internal_state[index2] = field_internal_state[index1].to_montgomery_form();
                uint_internal_state[index2] = ((static_cast<uint512_t>(uint_internal_state[index1]) << 256) %
                                               static_cast<uint512_t>(Field::modulus))
                                                  .lo;
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
            if (!settings.enable_from_montgomery) {
                return FROM_MONTGOMERY_SIZE; // Skip disabled operation but return correct size
            }
            // Read the operand
            {
                size_t index1 = get_index(data_ptr, INSTRUCTION_HEADER_SIZE);
                size_t index2 = get_index(data_ptr, INSTRUCTION_HEADER_SIZE + INDEX_SIZE);
                field_internal_state[index2] = field_internal_state[index1].from_montgomery_form();
                if constexpr (LARGE_MODULUS) {
                    // For large modulus fields, use uint512_t to prevent overflow
                    auto value = static_cast<uint512_t>(uint_internal_state[index1]);
                    for (size_t i = 0; i < 256; i++) {
                        if (value & 1) {
                            value += static_cast<uint512_t>(Field::modulus);
                        }
                        value >>= 1;
                    }
                    uint_internal_state[index2] = value.lo;
                } else {
                    // For small modulus fields, use uint256_t
                    uint_internal_state[index2] = uint_internal_state[index1];
                    for (size_t i = 0; i < 256; i++) {
                        if (uint_internal_state[index2] & 1) {
                            uint_internal_state[index2] += Field::modulus;
                        }
                        uint_internal_state[index2] >>= 1;
                    }
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
            if (!settings.enable_batch_invert) {
                return BATCH_INVERT_SIZE; // Skip disabled operation but return correct size
            }
            // Read the operands and count
            {
                size_t start_index = get_index(data_ptr, INSTRUCTION_HEADER_SIZE);
                size_t count =
                    static_cast<size_t>(data_ptr[INSTRUCTION_HEADER_SIZE + INDEX_SIZE]) % (INTERNAL_STATE_SIZE / 2);
                if (count == 0) {
                    count = 1; // Ensure at least one element
                }
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
                for (size_t idx : valid_indices) {
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
                        auto uint_product = (static_cast<uint512_t>(original_uint_elements[i]) *
                                             static_cast<uint512_t>(uint_internal_state[idx])) %
                                            static_cast<uint512_t>(Field::modulus);
                        assert(uint_product == static_cast<uint512_t>(1));
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
        }
    }

    /**
     * @brief Structure to hold parsed instruction data
     *
     * @details This structure contains the parsed instruction type and associated data
     * for efficient instruction execution without repeated parsing.
     */
    struct ParsedInstruction {
        Instruction instruction;   ///< The instruction type
        std::vector<uint8_t> data; ///< The instruction data
        size_t size;               ///< The size of the instruction data
    };

    /**
     * @brief Parse instructions from data buffer into a vector
     *
     * @param Data Pointer to the data buffer
     * @param Size Size of the data buffer
     * @param max_steps Maximum number of instructions to parse
     * @return std::pair<std::vector<ParsedInstruction>, size_t> Vector of parsed instructions and bytes consumed
     *
     * @details This method parses the input data into a sequence of instructions.
     * It handles settings parsing and instruction size calculation. The method returns
     * both the parsed instructions and the number of bytes consumed during parsing.
     */
    std::pair<std::vector<ParsedInstruction>, size_t> parse_instructions(const unsigned char* Data,
                                                                         size_t Size,
                                                                         size_t max_steps)
    {
        std::vector<ParsedInstruction> instructions;
        size_t data_offset = 0;
        size_t steps_parsed = 0;

        // Skip settings if present
        if (Size >= SETTINGS_SIZE) {
            const VMSettings* settings_ptr = reinterpret_cast<const VMSettings*>(Data);
            settings = *settings_ptr;
            data_offset += SETTINGS_SIZE;
        }

        while (data_offset < Size && steps_parsed < max_steps) {
            if (data_offset >= Size) {
                break;
            }

            Instruction instruction = static_cast<Instruction>(Data[data_offset]);
            size_t instruction_size = 0;

            // Map the instruction to a valid instruction by taking modulo
            constexpr size_t NUM_INSTRUCTIONS =
                static_cast<size_t>(Instruction::BATCH_INVERT) + 1; ///< Total number of instructions
            uint8_t original_instruction = Data[data_offset];
            instruction = static_cast<Instruction>(original_instruction % NUM_INSTRUCTIONS);

            // Determine instruction size based on type
            switch (instruction) {
            case Instruction::SET_VALUE:
                instruction_size = SET_VALUE_SIZE;
                break;
            case Instruction::ADD:
                instruction_size = ADD_SIZE;
                break;
            case Instruction::ADD_ASSIGN:
                instruction_size = ADD_ASSIGN_SIZE;
                break;
            case Instruction::INCREMENT:
                instruction_size = INCREMENT_SIZE;
                break;
            case Instruction::MUL:
                instruction_size = MUL_SIZE;
                break;
            case Instruction::MUL_ASSIGN:
                instruction_size = MUL_ASSIGN_SIZE;
                break;
            case Instruction::SUB:
                instruction_size = SUB_SIZE;
                break;
            case Instruction::SUB_ASSIGN:
                instruction_size = SUB_ASSIGN_SIZE;
                break;
            case Instruction::DIV:
                instruction_size = DIV_SIZE;
                break;
            case Instruction::DIV_ASSIGN:
                instruction_size = DIV_ASSIGN_SIZE;
                break;
            case Instruction::INV:
                instruction_size = INV_SIZE;
                break;
            case Instruction::NEG:
                instruction_size = NEG_SIZE;
                break;
            case Instruction::SQR:
                instruction_size = SQR_SIZE;
                break;
            case Instruction::SQR_ASSIGN:
                instruction_size = SQR_ASSIGN_SIZE;
                break;
            case Instruction::POW:
                instruction_size = POW_SIZE;
                break;
            case Instruction::SQRT:
                instruction_size = SQRT_SIZE;
                break;
            case Instruction::IS_ZERO:
                instruction_size = IS_ZERO_SIZE;
                break;
            case Instruction::EQUAL:
                instruction_size = EQUAL_SIZE;
                break;
            case Instruction::NOT_EQUAL:
                instruction_size = NOT_EQUAL_SIZE;
                break;
            case Instruction::TO_MONTGOMERY:
                instruction_size = TO_MONTGOMERY_SIZE;
                break;
            case Instruction::FROM_MONTGOMERY:
                instruction_size = FROM_MONTGOMERY_SIZE;
                break;
            case Instruction::REDUCE_ONCE:
                instruction_size = REDUCE_ONCE_SIZE;
                break;
            case Instruction::SELF_REDUCE:
                instruction_size = SELF_REDUCE_SIZE;
                break;
            case Instruction::BATCH_INVERT:
                instruction_size = BATCH_INVERT_SIZE;
                break;
            }

            // Check if we have enough data for this instruction
            if (data_offset + instruction_size > Size) {
                break;
            }

            // Create parsed instruction
            ParsedInstruction parsed;
            parsed.instruction = instruction;
            parsed.size = instruction_size;
            parsed.data.resize(instruction_size);

            // Only copy the data that's actually available
            size_t data_to_copy = std::min(instruction_size, Size - data_offset);
            std::memcpy(parsed.data.data(), Data + data_offset, data_to_copy);

            // If we couldn't copy all the data, pad with zeros
            if (data_to_copy < instruction_size) {
                std::memset(parsed.data.data() + data_to_copy, 0, instruction_size - data_to_copy);
            }

            instructions.push_back(parsed);

            data_offset += instruction_size;
            steps_parsed++;
        }

        return { instructions, data_offset };
    }

    /**
     * @brief Execute a parsed instruction
     *
     * @param parsed The parsed instruction to execute
     * @return bool True if execution should continue, false if should stop
     *
     * @details This method executes a previously parsed instruction. It provides
     * debug output if enabled and returns whether execution should continue.
     */
    bool execute_parsed_instruction(const ParsedInstruction& parsed)
    {
        if (with_debug) {
            const char* instruction_names[] = { "SET_VALUE",   "ADD",           "ADD_ASSIGN",
                                                "INCREMENT",   "MUL",           "MUL_ASSIGN",
                                                "SUB",         "SUB_ASSIGN",    "DIV",
                                                "DIV_ASSIGN",  "INV",           "NEG",
                                                "SQR",         "SQR_ASSIGN",    "POW",
                                                "SQRT",        "IS_ZERO",       "EQUAL",
                                                "NOT_EQUAL",   "TO_MONTGOMERY", "FROM_MONTGOMERY",
                                                "REDUCE_ONCE", "SELF_REDUCE",   "BATCH_INVERT" };
            const char* instruction_name =
                (static_cast<int>(parsed.instruction) >= 0 &&
                 static_cast<int>(parsed.instruction) <
                     static_cast<int>(sizeof(instruction_names) / sizeof(instruction_names[0])))
                    ? instruction_names[static_cast<int>(parsed.instruction)]
                    : "UNKNOWN";
            std::cout << "Executing instruction: " << instruction_name << " (" << static_cast<int>(parsed.instruction)
                      << ") at step: " << step_count << std::endl;
        }

        // Execute the instruction using the existing logic
        size_t consumed = execute_instruction(parsed.data.data());
        return consumed > 0;
    }

    /**
     * @brief Run the VM on input data
     *
     * @param Data The data to run the VM on
     * @param Size The size of the data
     * @param reset_steps Whether to reset the step counter (default: true)
     * @return size_t The number of bytes consumed, or 0 if not enough data for settings
     *
     * @details This method is the main entry point for VM execution. It parses
     * all instructions from the input data and executes them sequentially. The method
     * handles step counting, debug output, and returns the number of bytes consumed.
     */
    size_t run(const unsigned char* Data, size_t Size, bool reset_steps = true)
    {
        if (reset_steps) {
            step_count = 0;
        }

        if (with_debug) {
            std::cout << "Starting VM run with " << Size << " bytes of data, max_steps: " << max_steps << std::endl;
        }

        // First parse all instructions into a vector
        auto [instructions, bytes_consumed] = parse_instructions(Data, Size, max_steps);

        if (with_debug) {
            std::cout << "Parsed " << instructions.size() << " instructions, consumed " << bytes_consumed << " bytes"
                      << std::endl;
        }

        // Then execute the parsed instructions
        for (const auto& instruction : instructions) {
            if (step_count >= max_steps) {
                break;
            }

            bool success = execute_parsed_instruction(instruction);
            if (!success) {
                break;
            }
            step_count++;
        }

        return bytes_consumed; // Return the number of bytes consumed during parsing
    }

    /**
     * @brief Check internal state consistency between field and uint256_t representations
     *
     * @return bool True if all state elements are consistent, false otherwise
     *
     * @details This method verifies that the field_internal_state and uint_internal_state
     * arrays are consistent with each other. Any discrepancy indicates a potential bug
     * in the field arithmetic implementation.
     */
    bool check_internal_state() const
    {
        for (size_t i = 0; i < INTERNAL_STATE_SIZE; i++) {
            if (field_internal_state[i] != Field(uint_internal_state[i])) {
                if (with_debug) {
                    std::cout << "check_internal_state: index: " << i << " field: " << field_internal_state[i]
                              << " uint: " << uint_internal_state[i] << std::endl;
                }
                return false;
            }
        }
        return true;
    }

    /**
     * @brief Export the final uint state as a vector of uint256_t values
     *
     * @return std::vector<numeric::uint256_t> The final uint state
     *
     * @details This method creates a copy of the uint_internal_state array
     * for external use, typically for state transfer between VM phases.
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
     * @brief Export the final field state as a vector of Field elements
     *
     * @return std::vector<Field> The final field state
     *
     * @details This method creates a copy of the field_internal_state array for external use,
     * typically for state transfer between VM phases.
     */
    std::vector<Field> export_fr_state() const
    {
        std::vector<Field> result;
        result.reserve(INTERNAL_STATE_SIZE);
        for (size_t i = 0; i < INTERNAL_STATE_SIZE; i++) {
            result.push_back(Field(uint_internal_state[i]));
        }
        return result;
    }
    /**
     * @brief Get the number of steps executed
     *
     * @return size_t The number of steps executed
     */
    size_t get_step_count() const { return step_count; }

    /**
     * @brief Check if the VM was stopped due to reaching max steps
     *
     * @return bool True if the VM was stopped due to max steps
     */
    bool was_stopped_by_max_steps() const { return step_count >= max_steps; }

    /**
     * @brief Set a new step limit for the VM
     *
     * @param new_max_steps The new maximum number of steps
     */
    void set_max_steps(size_t new_max_steps) { max_steps = new_max_steps; }

    /**
     * @brief Reset the step counter to 0
     */
    void reset_step_count() { step_count = 0; }

    /**
     * @brief Get the current step limit
     *
     * @return size_t The current maximum number of steps
     */
    size_t get_max_steps() const { return max_steps; }

    /**
     * @brief Check if there are remaining steps available
     *
     * @return bool True if more steps can be executed
     */
    bool has_remaining_steps() const { return step_count < max_steps; }

    /**
     * @brief Reduce a uint256_t value to the field's modulus
     *
     * @param value The value to reduce
     * @return numeric::uint256_t The reduced value
     *
     * @details This method handles modulus reduction for both large and small modulus fields.
     * For large modulus fields, it uses uint512_t to prevent overflow.
     */
    static numeric::uint256_t reduce_to_modulus(const numeric::uint256_t& value)
    {
        if constexpr (LARGE_MODULUS) {
            return (uint512_t(value) % uint512_t(Field::modulus)).lo;
        } else {
            return value % Field::modulus;
        }
    }

    /**
     * @brief Verify that the initial state is correctly loaded
     *
     * @param state The state vector to verify against
     * @return bool True if the state is correctly loaded
     *
     * @details This method verifies that the imported state matches the current
     * internal state after proper modulus reduction and field conversion.
     */
    bool verify_initial_state(const std::vector<numeric::uint256_t>& state) const
    {
        for (size_t i = 0; i < std::min(state.size(), size_t(INTERNAL_STATE_SIZE)); i++) {
            // Check that uint_internal_state matches the reduced state
            if (uint_internal_state[i] != reduce_to_modulus(state[i])) {
                return false;
            }
            // Check that field_internal_state is consistent with uint_internal_state
            if (field_internal_state[i] != Field(uint_internal_state[i])) {
                return false;
            }
        }
        return true;
    }
};

} // namespace bb

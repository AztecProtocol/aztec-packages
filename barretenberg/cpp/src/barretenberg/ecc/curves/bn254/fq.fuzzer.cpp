#include "barretenberg/ecc/curves/bn254/fq.hpp"
#include <cstddef>
using namespace bb;
const size_t INTERNAL_STATE_SIZE = 10;
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

struct FieldVM {
    std::array<fq, INTERNAL_STATE_SIZE> field_internal_state;
    std::array<numeric::uint256_t, INTERNAL_STATE_SIZE> uint_internal_state;
    bool with_debug;
    FieldVM(bool with_debug = false)
        : with_debug(with_debug)
    {
        for (size_t i = 0; i < INTERNAL_STATE_SIZE; i++) {
            field_internal_state[i] = fq::zero();
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
            // Read the value
            {
                size_t index = get_index(data_ptr, INSTRUCTION_HEADER_SIZE);
                auto value = get_value(data_ptr, INSTRUCTION_HEADER_SIZE + INDEX_SIZE);
                field_internal_state[index] = fq(value);
                uint_internal_state[index] = value % fq::modulus;
                if (with_debug) {
                    info("SET_VALUE: index: ", index, " value: ", value);
                }
            }
            return SET_VALUE_SIZE;
        case Instruction::ADD:
            if (size_left < ADD_SIZE) {
                return size_left;
            }
            // Read the two operands
            {
                size_t index1 = get_index(data_ptr, INSTRUCTION_HEADER_SIZE);
                size_t index2 = get_index(data_ptr, INSTRUCTION_HEADER_SIZE + INDEX_SIZE);
                size_t index3 = get_index(data_ptr, INSTRUCTION_HEADER_SIZE + INDEX_SIZE * 2);
                field_internal_state[index3] = field_internal_state[index1] + field_internal_state[index2];
                uint_internal_state[index3] = (uint_internal_state[index1] + uint_internal_state[index2]) % fq::modulus;
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
            // Read the two operands
            {
                size_t index1 = get_index(data_ptr, INSTRUCTION_HEADER_SIZE);
                size_t index2 = get_index(data_ptr, INSTRUCTION_HEADER_SIZE + INDEX_SIZE);
                field_internal_state[index1] += field_internal_state[index2];
                uint_internal_state[index1] = (uint_internal_state[index1] + uint_internal_state[index2]) % fq::modulus;
                if (with_debug) {
                    info("ADD_ASSIGN: index1: ", index1, " index2: ", index2, " value: ", field_internal_state[index1]);
                }
            }
            return ADD_ASSIGN_SIZE;
        case Instruction::INCREMENT:
            if (size_left < INCREMENT_SIZE) {
                return size_left;
            }
            // Read the operand
            {
                size_t index = get_index(data_ptr, INSTRUCTION_HEADER_SIZE);
                field_internal_state[index]++;
                uint_internal_state[index] = (uint_internal_state[index] + 1) % fq::modulus;
                if (with_debug) {
                    info("INCREMENT: index: ", index, " value: ", field_internal_state[index]);
                }
            }
            return INCREMENT_SIZE;
        case Instruction::MUL:
            if (size_left < MUL_SIZE) {
                return size_left;
            }
            // Read the two operands
            {
                size_t index1 = get_index(data_ptr, INSTRUCTION_HEADER_SIZE);
                size_t index2 = get_index(data_ptr, INSTRUCTION_HEADER_SIZE + INDEX_SIZE);
                size_t index3 = get_index(data_ptr, INSTRUCTION_HEADER_SIZE + INDEX_SIZE * 2);
                field_internal_state[index3] = field_internal_state[index1] * field_internal_state[index2];
                uint_internal_state[index3] =
                    ((uint512_t(uint_internal_state[index1]) * uint512_t(uint_internal_state[index2])) % fq::modulus)
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
            // Read the two operands
            {
                size_t index1 = get_index(data_ptr, INSTRUCTION_HEADER_SIZE);
                size_t index2 = get_index(data_ptr, INSTRUCTION_HEADER_SIZE + INDEX_SIZE);
                field_internal_state[index1] *= field_internal_state[index2];
                uint_internal_state[index1] =
                    ((uint512_t(uint_internal_state[index1]) * uint512_t(uint_internal_state[index2])) % fq::modulus)
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
            // Read the two operands
            {
                size_t index1 = get_index(data_ptr, INSTRUCTION_HEADER_SIZE);
                size_t index2 = get_index(data_ptr, INSTRUCTION_HEADER_SIZE + INDEX_SIZE);
                size_t index3 = get_index(data_ptr, INSTRUCTION_HEADER_SIZE + INDEX_SIZE * 2);
                field_internal_state[index3] = field_internal_state[index1] - field_internal_state[index2];
                uint_internal_state[index3] =
                    (fq::modulus + uint_internal_state[index1] - uint_internal_state[index2]) % fq::modulus;
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
            // Read the two operands
            {
                size_t index1 = get_index(data_ptr, INSTRUCTION_HEADER_SIZE);
                size_t index2 = get_index(data_ptr, INSTRUCTION_HEADER_SIZE + INDEX_SIZE);
                field_internal_state[index1] -= field_internal_state[index2];
                uint_internal_state[index1] =
                    (fq::modulus + uint_internal_state[index1] - uint_internal_state[index2]) % fq::modulus;
                if (with_debug) {
                    info("SUB_ASSIGN: index1: ", index1, " index2: ", index2, " value: ", field_internal_state[index1]);
                }
            }
            return SUB_ASSIGN_SIZE;
        case Instruction::DIV:
            if (size_left < DIV_SIZE) {
                return size_left;
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
                               uint512_t(fq::modulus) ==
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
                              uint512_t(fq::modulus) ==
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
                              uint512_t(fq::modulus) ==
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
            // Read the operand
            {
                size_t index1 = get_index(data_ptr, INSTRUCTION_HEADER_SIZE);
                size_t index2 = get_index(data_ptr, INSTRUCTION_HEADER_SIZE + INDEX_SIZE);
                field_internal_state[index2] = -field_internal_state[index1];
                uint_internal_state[index2] = (fq::modulus - uint_internal_state[index1]) % fq::modulus;
                if (with_debug) {
                    info("NEG: index1: ", index1, " index2: ", index2, " value: ", field_internal_state[index2]);
                }
            }
            return NEG_SIZE;
        case Instruction::SQR:
            if (size_left < SQR_SIZE) {
                return size_left;
            }
            // Read the operand
            {
                size_t index1 = get_index(data_ptr, INSTRUCTION_HEADER_SIZE);
                size_t index2 = get_index(data_ptr, INSTRUCTION_HEADER_SIZE + INDEX_SIZE);
                field_internal_state[index2] = field_internal_state[index1].sqr();
                uint_internal_state[index2] =
                    ((uint512_t(uint_internal_state[index1]) * uint512_t(uint_internal_state[index1])) % fq::modulus)
                        .lo;
                if (with_debug) {
                    info("SQR: index1: ", index1, " index2: ", index2, " value: ", field_internal_state[index2]);
                }
            }
            return SQR_SIZE;
        case Instruction::SQR_ASSIGN:
            if (size_left < SQR_ASSIGN_SIZE) {
                return size_left;
            }
            // Read the operand
            {
                size_t index = get_index(data_ptr, INSTRUCTION_HEADER_SIZE);
                field_internal_state[index].self_sqr();
                uint_internal_state[index] =
                    ((uint512_t(uint_internal_state[index]) * uint512_t(uint_internal_state[index])) % fq::modulus).lo;
                if (with_debug) {
                    info("SQR_ASSIGN: index: ", index, " value: ", field_internal_state[index]);
                }
            }
            return SQR_ASSIGN_SIZE;
        case Instruction::POW:
            if (size_left < POW_SIZE) {
                return size_left;
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
                        current = (current * multiplicand) % uint512_t(fq::modulus);
                    }
                    multiplicand = (multiplicand * multiplicand) % uint512_t(fq::modulus);
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
            // Read the operand
            {
                size_t index1 = get_index(data_ptr, INSTRUCTION_HEADER_SIZE);
                size_t index2 = get_index(data_ptr, INSTRUCTION_HEADER_SIZE + INDEX_SIZE);
                auto [found, root] = field_internal_state[index1].sqrt();
                if (found) {
                    field_internal_state[index2] = root;
                    assert((uint512_t(static_cast<numeric::uint256_t>(field_internal_state[index2])) *
                            uint512_t(static_cast<numeric::uint256_t>(field_internal_state[index2]))) %
                               uint512_t(fq::modulus) ==
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
            // Read the operand
            {
                size_t index1 = get_index(data_ptr, INSTRUCTION_HEADER_SIZE);
                size_t index2 = get_index(data_ptr, INSTRUCTION_HEADER_SIZE + INDEX_SIZE);
                field_internal_state[index2] = field_internal_state[index1].to_montgomery_form();
                uint_internal_state[index2] =
                    ((uint512_t(uint_internal_state[index1]) << 256) % uint512_t(fq::modulus)).lo;
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
            // Read the operand
            {
                size_t index1 = get_index(data_ptr, INSTRUCTION_HEADER_SIZE);
                size_t index2 = get_index(data_ptr, INSTRUCTION_HEADER_SIZE + INDEX_SIZE);
                field_internal_state[index2] = field_internal_state[index1].from_montgomery_form();
                uint_internal_state[index2] = uint_internal_state[index1];
                for (size_t i = 0; i < 256; i++) {
                    if (uint_internal_state[index2] & 1) {
                        uint_internal_state[index2] += fq::modulus;
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
            // Read the operand
            {
                size_t index = get_index(data_ptr, INSTRUCTION_HEADER_SIZE);
                field_internal_state[index].self_reduce_once();
                if (with_debug) {
                    info("SELF_REDUCE: index: ", index, " value: ", field_internal_state[index]);
                }
            }
            return SELF_REDUCE_SIZE;
        default:
            // Move the pointer forward by 1
            return 1;
        }
    }

    /**
     * @brief Run the VM
     * @param Data The data to run the VM on
     * @param Size The size of the data
     *
     */
    void run(const unsigned char* Data, size_t Size)
    {
        size_t size_left = Size;
        const unsigned char* data_ptr = Data;
        while (size_left > 0) {
            size_t shift = this->execute_instruction(data_ptr, size_left);
            size_left -= shift;
            data_ptr += shift;
        }
    }
    bool check_internal_state() const
    {
        for (size_t i = 0; i < INTERNAL_STATE_SIZE; i++) {
            if (field_internal_state[i] != fq(uint_internal_state[i])) {
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
};
extern "C" int LLVMFuzzerTestOneInput(const unsigned char* Data, size_t Size)
{
    FieldVM vm;
    vm.run(Data, Size);
    if (!vm.check_internal_state()) {
        FieldVM vm_debug(true);
        vm_debug.run(Data, Size);
        assert(false);
        return 1;
    }
    return 0;
}
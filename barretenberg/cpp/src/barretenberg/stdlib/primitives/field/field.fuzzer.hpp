// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/stdlib/primitives/bool/bool.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include "cstring"
#pragma clang diagnostic push
// -Wc99-designator prevents us from using designators and nested designators
// in struct initializations
// such as {.in.first = a, .out = b}, since it's not a part of c++17 standard
// However the use of them in this particular file heavily increases
// the readability and conciseness of the Instruction initializations
#pragma clang diagnostic ignored "-Wc99-designator"

// This is a global variable, so that the execution handling class could alter it and signal to the input tester
// that the input should fail
bool circuit_should_fail = false;

#define HAVOC_TESTING
// #define HAVOC_CALIBRATION

#include "barretenberg/common/fuzzer.hpp"
FastRandom VarianceRNG(0);

enum class SpecialFrValue : uint8_t {
    One = 0,
    MinusOne,
    SquareRootOfOne,
    InverseSquareRootOfOne,
    RootOfUnity8,
    Two,
    HalfModulus,
    Zero,
    COUNT
};

constexpr uint8_t SPECIAL_FR_VALUE_COUNT_NO_ZERO = static_cast<uint8_t>(SpecialFrValue::Zero);
constexpr uint8_t SPECIAL_FR_VALUE_COUNT = static_cast<uint8_t>(SpecialFrValue::COUNT);

inline bb::fr get_special_fr_value(SpecialFrValue type)
{
    switch (type) {
    case SpecialFrValue::One:
        return bb::fr::one();
    case SpecialFrValue::MinusOne:
        return -bb::fr::one();
    case SpecialFrValue::SquareRootOfOne:
        return bb::fr::one().sqrt().second;
    case SpecialFrValue::InverseSquareRootOfOne:
        return bb::fr::one().sqrt().second.invert();
    case SpecialFrValue::RootOfUnity8:
        return bb::fr::get_root_of_unity(8);
    case SpecialFrValue::Two:
        return bb::fr(2);
    case SpecialFrValue::HalfModulus:
        return bb::fr((bb::fr::modulus - 1) / 2);
    case SpecialFrValue::Zero:
        return bb::fr::zero();
    case SpecialFrValue::COUNT:
    default:
        abort();
    }
}

// #define DISABLE_DIVISION
//  Enable this definition, when you want to find out the instructions that caused a failure
// #define FUZZING_SHOW_INFORMATION 1

#define OPERATION_TYPE_SIZE 1

#define ELEMENT_SIZE (sizeof(bb::fr) + 1)
#define TWO_IN_ONE_OUT 3
#define THREE_IN_ONE_OUT 4

#define MSUB_DIV_MINIMUM_MUL_PAIRS 1
#define MSUB_DIV_MAXIMUM_MUL_PAIRS 8
#define MSUB_DIV_MINIMUM_SUBTRACTED_ELEMENTS 0
#define MSUB_DIV_MAXIMUM_SUBTRACTED_ELEMENTS 8
#define MULT_MADD_MINIMUM_MUL_PAIRS 1
#define MULT_MADD_MAXIMUM_MUL_PAIRS 8
#define MULT_MADD_MINIMUM_ADDED_ELEMENTS 0
#define MULT_MADD_MAXIMUM_ADDED_ELEMENTS 8
#define SQR_ADD_MINIMUM_ADDED_ELEMENTS 0
#define SQR_ADD_MAXIMUM_ADDED_ELEMENTS 8
#define ACCUMULATE_MAXIMUM_ELEMENTS 8
/**
 * @brief The class parametrizing Field fuzzing instructions, execution, etc
 *
 */
template <typename Builder> class FieldBase {
  private:
    typedef bb::stdlib::bool_t<Builder> bool_t;
    typedef bb::stdlib::field_t<Builder> field_t;
    typedef bb::stdlib::witness_t<Builder> witness_t;
    typedef bb::stdlib::public_witness_t<Builder> public_witness_t;

  public:
    /**
     * @brief A class representing a single fuzzing instruction
     *
     */
    class Instruction {
      public:
        enum OPCODE {
            CONSTANT,
            WITNESS,
            CONSTANT_WITNESS,
            ADD,
            SUBTRACT,
            MULTIPLY,
#ifndef DISABLE_DIVISION
            DIVIDE,
#endif
            ADD_TWO,
            MADD,
            SQR,
            ASSERT_EQUAL,
            ASSERT_NOT_EQUAL,
            ASSERT_ZERO,
            ASSERT_NOT_ZERO,
            POW,
            ACCUMULATE,
            RANGE_CONSTRAINT,
            RANDOMSEED,
            COND_NEGATE,
            COND_SELECT,
            SELECT_IF_ZERO,
            SELECT_IF_EQ,
            SET,
            INVERT,
            _LAST
        };

        typedef bb::fr Element;
        struct SingleArg {
            uint8_t in;
        };
        struct TwoArgs {
            uint8_t in;
            uint8_t out;
        };
        struct ThreeArgs {
            uint8_t in1;
            uint8_t in2;
            uint8_t out;
        };
        struct FourArgs {
            uint8_t in1;
            uint8_t in2;
            uint8_t in3;
            uint8_t out;
        };
        struct FiveArgs {
            uint8_t in1;
            uint8_t in2;
            uint8_t qbs;
            uint8_t rbs;
            uint8_t out;
        };
        struct MultAddArgs {
            uint8_t input_index;
            uint8_t output_index;
        };
        struct MultOpArgs {
            uint8_t divisor_index;
            uint8_t output_index;
        };

        struct PowArgs {
            uint8_t in;
            uint8_t out;
            uint32_t exponent;
        };
        struct SliceArgs {
            uint8_t in1;
            uint8_t lsb;
            uint8_t msb;
            uint8_t out1;
            uint8_t out2;
            uint8_t out3;
        };
        union ArgumentContents {
            uint32_t randomseed;
            Element element;
            SingleArg singleArg;
            TwoArgs twoArgs;
            ThreeArgs threeArgs;
            FourArgs fourArgs;
            FiveArgs fiveArgs;
            PowArgs powArgs;
            SliceArgs sliceArgs;
            MultOpArgs multOpArgs;
            MultAddArgs multAddArgs;
        };
        // The type of instruction
        OPCODE id;
        // Instruction arguments
        ArgumentContents arguments;

        /**
         * @brief Generate a random instruction
         *
         * @tparam T PRNG class type
         * @param rng PRNG used
         * @return A random instruction
         */
        template <typename T>
        inline static Instruction generateRandom(T& rng)
            requires SimpleRng<T>
        {
            // Choose which instruction we are going to generate
            OPCODE instruction_opcode = static_cast<OPCODE>(rng.next() % (OPCODE::_LAST));
            uint8_t in1, in2, in3, out;

            // Depending on instruction
            switch (instruction_opcode) {
            case OPCODE::CONSTANT:
            case OPCODE::WITNESS:
            case OPCODE::CONSTANT_WITNESS:
                // If it's a constant or witness, it just pushes data onto the stack to be acted upon
                return { .id = instruction_opcode, .arguments.element = Element(fast_log_distributed_uint256(rng)) };
                break;
            case OPCODE::ASSERT_ZERO:
            case OPCODE::ASSERT_NOT_ZERO:
                in1 = static_cast<uint8_t>(rng.next() & 0xff);
                return { .id = instruction_opcode, .arguments.singleArg = { .in = in1 } };
                break;
            case OPCODE::SQR:
            case OPCODE::ASSERT_EQUAL:
            case OPCODE::ASSERT_NOT_EQUAL:
            case OPCODE::SET:
            case OPCODE::INVERT:
            case OPCODE::ACCUMULATE:
            case OPCODE::RANGE_CONSTRAINT:
                in1 = static_cast<uint8_t>(rng.next() & 0xff);
                out = static_cast<uint8_t>(rng.next() & 0xff);
                return { .id = instruction_opcode, .arguments.twoArgs = { .in = in1, .out = out } };
                break;
            case OPCODE::POW:
                in1 = static_cast<uint8_t>(rng.next() & 0xff);
                out = static_cast<uint8_t>(rng.next() & 0xff);
                return { .id = instruction_opcode,
                         .arguments.powArgs = { .in = in1, .out = out, .exponent = rng.next() } };
                break;
            case OPCODE::ADD:
            case OPCODE::SUBTRACT:
            case OPCODE::MULTIPLY:
#ifndef DISABLE_DIVISION
            case OPCODE::DIVIDE:
#endif
            case OPCODE::COND_NEGATE:
                // For two-input-one-output instructions we just randomly pick each argument and generate an instruction
                // accordingly
                in1 = static_cast<uint8_t>(rng.next() & 0xff);
                in2 = static_cast<uint8_t>(rng.next() & 0xff);
                out = static_cast<uint8_t>(rng.next() & 0xff);
                return { .id = instruction_opcode, .arguments.threeArgs = { .in1 = in1, .in2 = in2, .out = out } };
                break;
            case OPCODE::ADD_TWO:
            case OPCODE::MADD:
            case OPCODE::COND_SELECT:
            case OPCODE::SELECT_IF_ZERO:
            case OPCODE::SELECT_IF_EQ:
                // For three-input-one-output instructions we just randomly pick each argument and generate an
                // instruction accordingly
                in1 = static_cast<uint8_t>(rng.next() & 0xff);
                in2 = static_cast<uint8_t>(rng.next() & 0xff);
                in3 = static_cast<uint8_t>(rng.next() & 0xff);
                out = static_cast<uint8_t>(rng.next() & 0xff);
                return { .id = instruction_opcode,
                         .arguments.fourArgs{ .in1 = in1, .in2 = in2, .in3 = in3, .out = out } };
                break;
            case OPCODE::RANDOMSEED:
                return { .id = instruction_opcode, .arguments.randomseed = rng.next() };
                break;
            default:
                abort(); // We have missed some instructions, it seems
                break;
            }
        }

        /**
         * @brief Mutate the value of a field element
         *
         * @tparam T PRNG class
         * @param e Initial element value
         * @param rng PRNG
         * @param havoc_config Mutation configuration
         * @return Mutated element
         */
        template <typename T>
        inline static bb::fr mutateFieldElement(bb::fr e, T& rng, HavocSettings& havoc_config)
            requires SimpleRng<T>
        {
            // With a certain probability, we apply changes to the Montgomery form, rather than the plain form. This
            // has merit, since the computation is performed in montgomery form and comparisons are often performed
            // in it, too. Libfuzzer comparison tracing logic can then be enabled in Montgomery form
            bool convert_to_montgomery = (rng.next() % (havoc_config.VAL_MUT_MONTGOMERY_PROBABILITY +
                                                        havoc_config.VAL_MUT_NON_MONTGOMERY_PROBABILITY)) <
                                         havoc_config.VAL_MUT_MONTGOMERY_PROBABILITY;
            uint256_t value_data;
            // Conversion at the start
#define MONT_CONVERSION                                                                                                \
    if (convert_to_montgomery) {                                                                                       \
        value_data = uint256_t(e.to_montgomery_form());                                                                \
    } else {                                                                                                           \
        value_data = uint256_t(e);                                                                                     \
    }
            // Inverse conversion at the end
#define INV_MONT_CONVERSION                                                                                            \
    if (convert_to_montgomery) {                                                                                       \
        e = bb::fr(value_data).from_montgomery_form();                                                                 \
    } else {                                                                                                           \
        e = bb::fr(value_data);                                                                                        \
    }

            // Pick the last value from the mutation distrivution vector
            const size_t mutation_type_count = havoc_config.value_mutation_distribution.size();
            // Choose mutation
            const size_t choice = rng.next() % havoc_config.value_mutation_distribution[mutation_type_count - 1];
            if (choice < havoc_config.value_mutation_distribution[0]) {
                // Delegate mutation to libfuzzer (bit/byte mutations, autodictionary, etc)
                MONT_CONVERSION
                LLVMFuzzerMutate((uint8_t*)&value_data, sizeof(uint256_t), sizeof(uint256_t));
                INV_MONT_CONVERSION
            } else if (choice < havoc_config.value_mutation_distribution[1]) {
                // Small addition/subtraction
                if (convert_to_montgomery) {
                    e = e.to_montgomery_form();
                }
                if (rng.next() & 1) {
                    e += bb::fr(rng.next() & 0xff);
                } else {
                    e -= bb::fr(rng.next() & 0xff);
                }
                if (convert_to_montgomery) {
                    e = e.from_montgomery_form();
                }
            } else {
                auto special_value = static_cast<SpecialFrValue>(rng.next() % SPECIAL_FR_VALUE_COUNT);
                e = get_special_fr_value(special_value);
                if (convert_to_montgomery) {
                    e = e.from_montgomery_form();
                }
            }
            // Return instruction
            return e;
        }
        /**
         * @brief Mutate a single instruction
         *
         * @tparam T PRNG class
         * @param instruction The instruction
         * @param rng PRNG
         * @param havoc_config Mutation configuration
         * @return Mutated instruction
         */
        template <typename T>
        inline static Instruction mutateInstruction(Instruction instruction, T& rng, HavocSettings& havoc_config)
            requires SimpleRng<T>
        {
#define PUT_RANDOM_BYTE_IF_LUCKY(variable)                                                                             \
    if (rng.next() & 1) {                                                                                              \
        variable = rng.next() & 0xff;                                                                                  \
    }
            // Depending on instruction type...
            switch (instruction.id) {
            case OPCODE::CONSTANT:
            case OPCODE::WITNESS:
            case OPCODE::CONSTANT_WITNESS:
                // If it represents pushing a value on the stack with a 50% probability randomly sample a bit_range
                // Maybe mutate the value
                if (rng.next() & 1) {
                    instruction.arguments.element =
                        mutateFieldElement(instruction.arguments.element, rng, havoc_config);
                }
                break;
            case OPCODE::ASSERT_ZERO:
            case OPCODE::ASSERT_NOT_ZERO:
                PUT_RANDOM_BYTE_IF_LUCKY(instruction.arguments.singleArg.in)
                break;
            case OPCODE::SQR:
            case OPCODE::ASSERT_EQUAL:
            case OPCODE::ASSERT_NOT_EQUAL:
            case OPCODE::SET:
            case OPCODE::INVERT:
            case OPCODE::ACCUMULATE:
            case OPCODE::RANGE_CONSTRAINT:
                PUT_RANDOM_BYTE_IF_LUCKY(instruction.arguments.twoArgs.in)
                PUT_RANDOM_BYTE_IF_LUCKY(instruction.arguments.twoArgs.out)
                break;
            case OPCODE::POW:
                PUT_RANDOM_BYTE_IF_LUCKY(instruction.arguments.powArgs.in)
                PUT_RANDOM_BYTE_IF_LUCKY(instruction.arguments.powArgs.out)
                if (rng.next() & 1) {
                    instruction.arguments.powArgs.exponent = rng.next();
                }
                break;
            case OPCODE::ADD:
#ifndef DISABLE_DIVISION
            case OPCODE::DIVIDE:
#endif
            case OPCODE::MULTIPLY:
            case OPCODE::SUBTRACT:
            case OPCODE::COND_NEGATE:
                // Randomly sample each of the arguments with 50% probability
                PUT_RANDOM_BYTE_IF_LUCKY(instruction.arguments.threeArgs.in1)
                PUT_RANDOM_BYTE_IF_LUCKY(instruction.arguments.threeArgs.in2)
                PUT_RANDOM_BYTE_IF_LUCKY(instruction.arguments.threeArgs.out)
                break;
            case OPCODE::ADD_TWO:
            case OPCODE::MADD:
            case OPCODE::COND_SELECT:
            case OPCODE::SELECT_IF_ZERO:
            case OPCODE::SELECT_IF_EQ:
                // Randomly sample each of the arguments with 50% probability
                PUT_RANDOM_BYTE_IF_LUCKY(instruction.arguments.fourArgs.in1)
                PUT_RANDOM_BYTE_IF_LUCKY(instruction.arguments.fourArgs.in2)
                PUT_RANDOM_BYTE_IF_LUCKY(instruction.arguments.fourArgs.in3)
                PUT_RANDOM_BYTE_IF_LUCKY(instruction.arguments.fourArgs.out)
                break;
            case OPCODE::RANDOMSEED:
                instruction.arguments.randomseed = rng.next();
                break;
            default:
                abort(); // New instruction encountered
                break;
            }
            // Return mutated instruction
            return instruction;
        }
    };
    // We use argsizes to both specify the size of data needed to parse the instruction and to signal that the
    // instruction is enabled (if it is -1,it's disabled )
    class ArgSizes {
      public:
        static constexpr size_t CONSTANT = sizeof(bb::fr);
        static constexpr size_t WITNESS = sizeof(bb::fr);
        static constexpr size_t CONSTANT_WITNESS = sizeof(bb::fr);
        static constexpr size_t SQR = 2;
        static constexpr size_t ASSERT_EQUAL = 2;
        static constexpr size_t ASSERT_NOT_EQUAL = 2;
        static constexpr size_t ASSERT_ZERO = 1;
        static constexpr size_t ASSERT_NOT_ZERO = 1;
        static constexpr size_t ADD = 3;
        static constexpr size_t SUBTRACT = 3;
        static constexpr size_t MULTIPLY = 3;
        static constexpr size_t ADD_TWO = 4;
#ifndef DISABLE_DIVISION
        static constexpr size_t DIVIDE = 3;
#else
        static constexpr size_t DIVIDE = static_cast<size_t>(-1);
#endif
        static constexpr size_t MADD = 4;
        static constexpr size_t POW = sizeof(typename Instruction::PowArgs);
        static constexpr size_t ACCUMULATE = 2;
        static constexpr size_t RANGE_CONSTRAINT = 2;
        static constexpr size_t RANDOMSEED = sizeof(uint32_t);
        static constexpr size_t COND_NEGATE = 3;
        static constexpr size_t COND_SELECT = 4;
        static constexpr size_t SELECT_IF_ZERO = 4;
        static constexpr size_t SELECT_IF_EQ = 4;
        static constexpr size_t SET = 2;
        static constexpr size_t INVERT = 2;
    };

    /**
     * @brief Optional subclass that governs limits on the use of certain instructions, since some of them can be too
     * slow
     *
     */
    class InstructionWeights {
      public:
        static constexpr size_t CONSTANT = 1;
        static constexpr size_t WITNESS = 1;
        static constexpr size_t CONSTANT_WITNESS = 1;
        static constexpr size_t ADD = 1;
        static constexpr size_t SUBTRACT = 1;
        static constexpr size_t MULTIPLY = 2;
        static constexpr size_t SQR = 2;
        static constexpr size_t ASSERT_EQUAL = 2;
        static constexpr size_t ASSERT_NOT_EQUAL = 2;
        static constexpr size_t ASSERT_ZERO = 2;
        static constexpr size_t ASSERT_NOT_ZERO = 2;
        static constexpr size_t ADD_TWO = 1;
#ifndef DISABLE_DIVISION
        static constexpr size_t DIVIDE = 2;
#endif
        static constexpr size_t MADD = 2;
        static constexpr size_t POW = 8;
        static constexpr size_t ACCUMULATE = 1;
        static constexpr size_t RANGE_CONSTRAINT = 10;
        static constexpr size_t RANDOMSEED = 0;
        static constexpr size_t COND_NEGATE = 2;
        static constexpr size_t COND_SELECT = 2;
        static constexpr size_t SELECT_IF_ZERO = 2;
        static constexpr size_t SELECT_IF_EQ = 2;
        static constexpr size_t SET = 2;
        static constexpr size_t INVERT = 2;
        static constexpr size_t _LIMIT = 64;
    };
    /**
     * @brief Parser class handles the parsing and writing the instructions back to data buffer
     *
     */
    class Parser {
      public:
        /**
         * @brief Parse a single instruction from data
         *
         * @tparam opcode The opcode we are parsing
         * @param Data Pointer to arguments in buffer
         * @return Parsed instructiong
         */
        template <typename Instruction::OPCODE opcode> inline static Instruction parseInstructionArgs(uint8_t* Data)
        {
            if constexpr (opcode == Instruction::OPCODE::CONSTANT || opcode == Instruction::OPCODE::WITNESS ||
                          opcode == Instruction::OPCODE::CONSTANT_WITNESS) {
                Instruction instr;
                instr.id = static_cast<typename Instruction::OPCODE>(opcode);
                // instr.arguments.element = fr::serialize_from_buffer(Data+1);
                instr.arguments.element = bb::fr::serialize_from_buffer(Data);
                return instr;
            };
            if constexpr (opcode == Instruction::OPCODE::ASSERT_ZERO ||
                          opcode == Instruction::OPCODE::ASSERT_NOT_ZERO) {
                return { .id = static_cast<typename Instruction::OPCODE>(opcode),
                         .arguments.singleArg = { .in = *Data } };
            }
            if constexpr (opcode == Instruction::OPCODE::SQR || opcode == Instruction::OPCODE::ASSERT_EQUAL ||
                          opcode == Instruction::OPCODE::ASSERT_NOT_EQUAL || opcode == Instruction::OPCODE::SET ||
                          opcode == Instruction::OPCODE::INVERT || opcode == Instruction::OPCODE::ACCUMULATE ||
                          opcode == Instruction::OPCODE::RANGE_CONSTRAINT) {
                return { .id = static_cast<typename Instruction::OPCODE>(opcode),
                         .arguments.twoArgs = { .in = *Data, .out = *(Data + 1) } };
            }
            if constexpr (opcode == Instruction::OPCODE::POW) {
                Instruction instr;
                instr.id = static_cast<typename Instruction::OPCODE>(opcode);
                instr.arguments.powArgs.in = *Data;
                instr.arguments.powArgs.out = *(Data + 1);
                memcpy(&instr.arguments.powArgs.exponent, Data + 2, sizeof(uint32_t));
                return instr;
            }
            if constexpr (opcode == Instruction::OPCODE::ADD || opcode == Instruction::OPCODE::MULTIPLY ||
#ifndef DISABLE_DIVISION
                          opcode == Instruction::OPCODE::DIVIDE ||
#endif
                          opcode == Instruction::OPCODE::SUBTRACT || opcode == Instruction::OPCODE::COND_NEGATE) {
                return { .id = static_cast<typename Instruction::OPCODE>(opcode),
                         .arguments.threeArgs = { .in1 = *Data, .in2 = *(Data + 1), .out = *(Data + 2) } };
            }
            if constexpr (opcode == Instruction::OPCODE::MADD || opcode == Instruction::OPCODE::ADD_TWO ||
                          opcode == Instruction::OPCODE::COND_SELECT || opcode == Instruction::OPCODE::SELECT_IF_ZERO ||
                          opcode == Instruction::OPCODE::SELECT_IF_EQ) {

                return { .id = static_cast<typename Instruction::OPCODE>(opcode),
                         .arguments.fourArgs = {
                             .in1 = *Data, .in2 = *(Data + 1), .in3 = *(Data + 2), .out = *(Data + 3) } };
            }
            if constexpr (opcode == Instruction::OPCODE::RANDOMSEED) {
                uint32_t randomseed;
                memcpy(&randomseed, Data, sizeof(uint32_t));
                return Instruction{ .id = static_cast<typename Instruction::OPCODE>(opcode),
                                    .arguments.randomseed = randomseed };
            };
        }
        /**
         * @brief Write a single instruction to buffer
         *
         * @tparam instruction_opcode Instruction type
         * @param instruction instruction
         * @param Data Pointer to the data buffer (needs to have enough space for the instruction)
         */
        template <typename Instruction::OPCODE instruction_opcode>
        inline static void writeInstruction(Instruction& instruction, uint8_t* Data)
        {
            if constexpr (instruction_opcode == Instruction::OPCODE::CONSTANT ||
                          instruction_opcode == Instruction::OPCODE::WITNESS ||
                          instruction_opcode == Instruction::OPCODE::CONSTANT_WITNESS) {
                *Data = instruction.id;
                bb::fr::serialize_to_buffer(instruction.arguments.element, Data + 1);
            }

            if constexpr (instruction_opcode == Instruction::OPCODE::ASSERT_ZERO ||
                          instruction_opcode == Instruction::OPCODE::ASSERT_NOT_ZERO) {
                *Data = instruction.id;
                *(Data + 1) = instruction.arguments.singleArg.in;
            }
            if constexpr (instruction_opcode == Instruction::OPCODE::SQR ||
                          instruction_opcode == Instruction::OPCODE::ASSERT_EQUAL ||
                          instruction_opcode == Instruction::OPCODE::ASSERT_NOT_EQUAL ||
                          instruction_opcode == Instruction::OPCODE::SET ||
                          instruction_opcode == Instruction::OPCODE::INVERT ||
                          instruction_opcode == Instruction::OPCODE::ACCUMULATE ||
                          instruction_opcode == Instruction::OPCODE::RANGE_CONSTRAINT) {
                *Data = instruction.id;
                *(Data + 1) = instruction.arguments.twoArgs.in;
                *(Data + 2) = instruction.arguments.twoArgs.out;
            }
            if constexpr (instruction_opcode == Instruction::OPCODE::POW) {
                *Data = instruction.id;
                *(Data + 1) = instruction.arguments.powArgs.in;
                *(Data + 2) = instruction.arguments.powArgs.out;
                memcpy(Data + 3, &instruction.arguments.powArgs.exponent, sizeof(uint32_t));
            }
            if constexpr (instruction_opcode == Instruction::OPCODE::ADD ||
#ifndef DISABLE_DIVISION
                          instruction_opcode == Instruction::OPCODE::DIVIDE ||
#endif
                          instruction_opcode == Instruction::OPCODE::MULTIPLY ||
                          instruction_opcode == Instruction::OPCODE::SUBTRACT ||
                          instruction_opcode == Instruction::OPCODE::COND_NEGATE) {
                *Data = instruction.id;
                *(Data + 1) = instruction.arguments.threeArgs.in1;
                *(Data + 2) = instruction.arguments.threeArgs.in2;
                *(Data + 3) = instruction.arguments.threeArgs.out;
            }
            if constexpr (instruction_opcode == Instruction::OPCODE::ADD_TWO ||
                          instruction_opcode == Instruction::OPCODE::MADD ||
                          instruction_opcode == Instruction::OPCODE::COND_SELECT ||
                          instruction_opcode == Instruction::OPCODE::SELECT_IF_ZERO ||
                          instruction_opcode == Instruction::OPCODE::SELECT_IF_EQ) {
                *Data = instruction.id;
                *(Data + 1) = instruction.arguments.fourArgs.in1;
                *(Data + 2) = instruction.arguments.fourArgs.in2;
                *(Data + 3) = instruction.arguments.fourArgs.in3;
                *(Data + 4) = instruction.arguments.fourArgs.out;
            }
            if constexpr (instruction_opcode == Instruction::OPCODE::RANDOMSEED) {

                *Data = instruction.id;
                memcpy(Data + 1, &instruction.arguments.randomseed, sizeof(uint32_t));
            }
        }
    };
    /**
     * @brief This class implements the execution of safeuint with an oracle to detect discrepancies
     *
     */
    class ExecutionHandler {
      private:
        template <class T>
        ExecutionHandler construct_via_cast(const std::optional<uint256_t> max = std::nullopt,
                                            const std::optional<T> value = std::nullopt) const
        {
            const auto base_u256 = static_cast<uint256_t>(this->base);

            if (max != std::nullopt && base_u256 > *max) {
                return ExecutionHandler(this->base, field_t(this->field));
            }

            field_t new_field;

            if (value == std::nullopt) {
                /* Construct via casting to uint256_t, then T */
                new_field = field_t(static_cast<T>(static_cast<uint256_t>(this->base)));
                new_field.context = this->field.context;
            } else {
                new_field = field_t(*value);
            }

            const auto& ref = new_field;
            return ExecutionHandler(this->base, ref);
        }
        static bool_t construct_predicate(Builder* builder, const bool predicate)
        {
            /* The context field of a predicate can be nullptr;
             * in that case, the function that handles the predicate
             * will use the context of another input parameter
             */
            const bool predicate_is_const = static_cast<bool>(VarianceRNG.next() & 1);
            if (predicate_is_const) {
                const bool predicate_has_ctx = static_cast<bool>(VarianceRNG.next() % 2);
                debug_log("bool_t(", (predicate_has_ctx ? "&builder," : "nullptr,"), (predicate ? "true)" : "false)"));
                return bool_t(predicate_has_ctx ? builder : nullptr, predicate);
            }
            debug_log("bool_t(witness_t(&builder, ", (predicate ? "true));" : "false))"));
            return bool_t(witness_t(builder, predicate));
        }
        field_t f() const
        {
            const bool reconstruct = static_cast<bool>(VarianceRNG.next() % 2);

            if (!reconstruct) {
                return this->field;
            }

            return field_t(this->field);
        }
        void assert_equal(field_t f) const
        {
            switch (VarianceRNG.next() % 2) {
            case 0:
                debug_log("  via assert_equal\n");
                this->f().assert_equal(f);
                break;
            case 1:
                debug_log("  via assert_is_in_set\n");
                this->f().assert_is_in_set({ f });
                break;
            default:
                abort();
            }
        }

      public:
        bb::fr base;
        field_t field;
        ExecutionHandler() = default;
        ExecutionHandler(bb::fr a, field_t b)
            : base(a)
            , field(b)
        {}
        ExecutionHandler(bb::fr a, field_t& b)
            : base(a)
            , field(b)
        {}
        ExecutionHandler(bb::fr& a, field_t& b)
            : base(a)
            , field(b)
        {}
        bool is_circuit_constant() const { return field.is_constant(); }
        ExecutionHandler operator+(const ExecutionHandler& other)
        {
            const auto b = this->base + other.base;

            switch (VarianceRNG.next() % 3) {
            case 0:
                /* Invoke the + operator */
                return ExecutionHandler(b, this->f() + other.f());
            case 1:
                /* Invoke the += operator */
                {
                    auto f = this->f();
                    return ExecutionHandler(b, f += other.f());
                }
                break;
            case 2:
                /* Use accumulate() to compute the sum */
                return ExecutionHandler(b, field_t::accumulate({ this->f(), other.f() }));
            default:
                abort();
            }
        }
        ExecutionHandler operator-(const ExecutionHandler& other)
        {
            const auto b = this->base - other.base;

            switch (VarianceRNG.next() % 2) {
            case 0:
                /* Invoke the - operator */
                return ExecutionHandler(b, this->f() - other.f());
            case 1:
                /* Invoke the -= operator */
                {
                    auto f = this->f();
                    return ExecutionHandler(b, f -= other.f());
                }
                break;
            default:
                abort();
            }
        }
        ExecutionHandler operator*(const ExecutionHandler& other)
        {
            const auto b = this->base * other.base;

            switch (VarianceRNG.next() % 2) {
            case 0:
                /* Invoke the * operator */
                return ExecutionHandler(b, this->f() * other.f());
            case 1:
                /* Invoke the *= operator */
                {
                    auto f = this->f();
                    return ExecutionHandler(b, f *= other.f());
                }
                break;
            default:
                abort();
            }
        }
        ExecutionHandler sqr() { return ExecutionHandler(this->base.sqr(), this->f().sqr()); }
        ExecutionHandler operator/(const ExecutionHandler& other)
        {
            if (other.f().get_value() == 0) {
                circuit_should_fail = true;
            }

            const auto b = this->base / other.base;

            switch (VarianceRNG.next() % 2) {
            case 0:
                /* Invoke the / operator */
                return ExecutionHandler(b, this->f() / other.f());
            case 1:
                /* Invoke the /= operator */
                {
                    auto f = this->f();
                    return ExecutionHandler(b, f /= other.f());
                }
                break;
            default:
                abort();
            }
        }
        ExecutionHandler add_two(const ExecutionHandler& other1, const ExecutionHandler& other2)
        {
            switch (VarianceRNG.next() % 2) {
            case 0:
                return ExecutionHandler(this->base + other1.base + other2.base,
                                        this->f().add_two(other1.f(), other2.f()));
            case 1:
                return ExecutionHandler(this->base + other1.base + other2.base,
                                        field_t::accumulate({ this->f(), other1.f(), other2.f() }));
            default:
                abort();
            }
        }

        ExecutionHandler madd(const ExecutionHandler& other1, const ExecutionHandler& other2)
        {

            return ExecutionHandler(this->base * other1.base + other2.base, this->f().madd(other1.f(), { other2.f() }));
        }
        void assert_equal(ExecutionHandler& other)
        {
            if (other.f().is_constant()) {
                if (this->f().is_constant()) {
                    // Assert equal does nothing in this case
                    return;
                } else {
                    auto to_add = field_t(this->f().context, uint256_t(this->base - other.base));
                    this->assert_equal(other.f() + to_add);
                }
            } else {
                if (this->f().is_constant()) {
                    auto to_add = field_t(this->f().context, uint256_t(this->base - other.base));
                    auto new_el = other.f() + to_add;
                    this->assert_equal(new_el);

                } else {
                    auto to_add = field_t(this->f().context, uint256_t(this->base - other.base));
                    this->assert_equal(other.f() + to_add);
                }
            }
        }

        void assert_not_equal(ExecutionHandler& other)
        {
            if (this->base == other.base) {
                debug_log("  skipped (equal values)\n");
                return;
            } else {
                debug_log("  via assert_not_equal\n");
                this->f().assert_not_equal(other.f());
            }
        }

        void assert_zero()
        {
            if (!this->base.is_zero()) {
                debug_log("  circuit_should_fail (non-zero value)\n");
                circuit_should_fail = true;
            }
            debug_log("  assert_is_zero()\n");
            this->f().assert_is_zero();
        }
        void assert_not_zero()
        {
            if (this->base.is_zero()) {
                debug_log("  circuit_should_fail (zero value)\n");
                circuit_should_fail = true;
            }
            debug_log("  assert_is_not_zero()\n");
            this->f().assert_is_not_zero();
        }

        ExecutionHandler conditional_negate(Builder* builder, const bool predicate)
        {
            return ExecutionHandler(predicate ? -(this->base) : this->base,
                                    this->f().conditional_negate(construct_predicate(builder, predicate)));
        }

        ExecutionHandler conditional_select(Builder* builder, ExecutionHandler& other, const bool predicate)
        {
            return ExecutionHandler(
                predicate ? other.base : this->base,
                field_t(builder).conditional_assign(construct_predicate(builder, predicate), other.f(), this->f()));
        }

        ExecutionHandler select_if_zero(Builder* builder, ExecutionHandler& other1, ExecutionHandler& other2)
        {
            return ExecutionHandler(other2.base.is_zero() ? other1.base : this->base,
                                    field_t(builder).conditional_assign(other2.f().is_zero(), other1.f(), this->f()));
        }

        ExecutionHandler select_if_eq(Builder* builder, ExecutionHandler& other1, ExecutionHandler& other2)
        {
            return ExecutionHandler(
                other1.base == other2.base ? other1.base : this->base,
                field_t(builder).conditional_assign(other1.f() == other2.f(), other1.f(), this->f()));
        }
        /* Explicit re-instantiation using the various constructors */
        ExecutionHandler set(Builder* builder)
        {
            (void)builder;

            switch (VarianceRNG.next() % 8) {
            case 0:
                if constexpr (SHOW_FUZZING_INFO) {
                    debug_log("Construct via field_t\n");
                }
                return ExecutionHandler(this->base, field_t(this->field));
            case 1:
                if constexpr (SHOW_FUZZING_INFO) {
                    debug_log("Construct via int\n");
                }
                return construct_via_cast<int>(std::numeric_limits<int>::max());
            case 2:
                if constexpr (SHOW_FUZZING_INFO) {
                    debug_log("Construct via unsigned int\n");
                }
                return construct_via_cast<unsigned int>(std::numeric_limits<unsigned int>::max());
            case 3:
                if constexpr (SHOW_FUZZING_INFO) {
                    debug_log("Construct via unsigned long\n");
                }
                return construct_via_cast<unsigned long>(std::numeric_limits<unsigned long>::max());
            case 4:
                if constexpr (SHOW_FUZZING_INFO) {
                    debug_log("Construct via uint256_t\n");
                }
                return construct_via_cast<uint256_t>();
            case 5:
                if constexpr (SHOW_FUZZING_INFO) {
                    debug_log("Construct via fr\n");
                }
                return construct_via_cast<bb::fr>(bb::fr::modulus - 1);
            case 6:
#if 1
                /* Disabled because casting to bool_t can fail.
                 * Test for this issue:
                 *
                 * TEST(stdlib_field, test_construct_via_bool_t)
                 * {
                 *     bb::StandardCircuitBuilder builder =
                 * bb::StandardCircuitBuilder(); field_t a(witness_t(&builder,
                 * fr(uint256_t{0xf396b678452ebf15, 0x82ae10893982638b, 0xdf185a29c65fbf80, 0x1d18b2de99e48308})));
                 * field_t b = a - a; field_t c(static_cast<bool_t>(b)); std::cout << c.get_value() << std::endl;
                 * }
                 *
                 * According to Rumata this is because the input value needs to be normalized
                 * first.
                 *
                 * Enable this again once this is resolved.
                 */
                return ExecutionHandler(this->base, field_t(this->field));
#else
                if (static_cast<uint256_t>(this->base) > 1) {
                    return ExecutionHandler(this->base, field_t(this->field));
                } else {
                    if constexpr (SHOW_FUZZING_INFO) {
                        debug_log("Construct via bool_t\n");
                    }
                    /* Construct via bool_t */
                    return ExecutionHandler(this->base, field_t(static_cast<bool_t>(this->field)));
                }
#endif
            case 7:
                if constexpr (SHOW_FUZZING_INFO) {
                    debug_log("Reproduce via accumulate()\n");
                }
                return ExecutionHandler(this->base, field_t::accumulate({ this->f() }));
            default:
                abort();
            }
        }
        ExecutionHandler invert(void) const
        {
            if (this->base == 0) {
                return ExecutionHandler(this->base, this->f());
            } else {
                return ExecutionHandler(bb::fr(1) / this->base, this->f().invert());
            }
        }

        ExecutionHandler pow(uint32_t exponent)
        {
            return ExecutionHandler(this->base.pow(exponent), this->f().pow(exponent));
        }

        /**
         * @brief Execute the constant instruction (push constant safeuint to the stack)
         *
         * @param builder
         * @param stack
         * @param instruction
         * @return 0 if everything is ok, 1 if we should stop execution, since an expected error was encountered
         */
        static inline size_t execute_CONSTANT(Builder* builder,
                                              std::vector<ExecutionHandler>& stack,
                                              Instruction& instruction)
        {
            (void)builder;
            stack.push_back(
                ExecutionHandler(instruction.arguments.element, field_t(builder, instruction.arguments.element)));
            if constexpr (SHOW_FUZZING_INFO) {
                debug_log(
                    "Pushed constant value ", instruction.arguments.element, " to position ", stack.size() - 1, "\n");
            }
            return 0;
        }

        /**
         * @brief Execute the witness instruction (push witness safeuit to the stack)
         *
         * @param builder
         * @param stack
         * @param instruction
         * @return if everything is ok, 1 if we should stop execution, since an expected error was encountered
         */
        static inline size_t execute_WITNESS(Builder* builder,
                                             std::vector<ExecutionHandler>& stack,
                                             Instruction& instruction)
        {

            // THis is strange
            stack.push_back(
                ExecutionHandler(instruction.arguments.element, witness_t(builder, instruction.arguments.element)));

            if constexpr (SHOW_FUZZING_INFO) {
                debug_log(
                    "Pushed witness value ", instruction.arguments.element, " to position ", stack.size() - 1, "\n");
            }
            return 0;
        }

        /**
         * @brief Execute the constant_witness instruction (push a safeuint witness equal to the constant to the
         * stack)
         *
         * @param builder
         * @param stack
         * @param instruction
         * @return 0 if everything is ok, 1 if we should stop execution, since an expected error was encountered
         */
        static inline size_t execute_CONSTANT_WITNESS(Builder* builder,
                                                      std::vector<ExecutionHandler>& stack,
                                                      Instruction& instruction)
        {

            auto v = field_t(instruction.arguments.element);
            v.convert_constant_to_fixed_witness(builder);
            stack.push_back(ExecutionHandler(instruction.arguments.element, std::move(v)));
            if constexpr (SHOW_FUZZING_INFO) {
                debug_log("Pushed constant witness value ",
                          instruction.arguments.element,
                          " to position ",
                          stack.size() - 1,
                          "\n");
            }
            return 0;
        }
        /**
         * @brief Execute the multiply instruction
         *
         * @param builder
         * @param stack
         * @param instruction
         * @return if everything is ok, 1 if we should stop execution, since an expected error was encountered
         */
        static inline size_t execute_MULTIPLY(Builder* builder,
                                              std::vector<ExecutionHandler>& stack,
                                              Instruction& instruction)
        {

            (void)builder;
            if (stack.size() == 0) {
                return 1;
            }
            size_t first_index = instruction.arguments.threeArgs.in1 % stack.size();
            size_t second_index = instruction.arguments.threeArgs.in2 % stack.size();
            size_t output_index = instruction.arguments.threeArgs.out;

            if constexpr (SHOW_FUZZING_INFO) {
                auto args = format_two_arg(stack, first_index, second_index, output_index);
                debug_log(args.out, " = ", args.lhs, " * ", args.rhs, ";\n");
            }

            ExecutionHandler result;
            result = stack[first_index] * stack[second_index];
            // If the output index is larger than the number of elements in stack, append
            if (output_index >= stack.size()) {
                stack.push_back(result);
            } else {
                stack[output_index] = result;
            }
            return 0;
        };
        /**
         * @brief Execute the addition operator instruction
         *
         * @param builder
         * @param stack
         * @param instruction
         * @return if everything is ok, 1 if we should stop execution, since an expected error was encountered
         */
        static inline size_t execute_ADD(Builder* builder,
                                         std::vector<ExecutionHandler>& stack,
                                         Instruction& instruction)
        {
            (void)builder;
            if (stack.size() == 0) {
                return 1;
            }
            size_t first_index = instruction.arguments.threeArgs.in1 % stack.size();
            size_t second_index = instruction.arguments.threeArgs.in2 % stack.size();
            size_t output_index = instruction.arguments.threeArgs.out;

            if constexpr (SHOW_FUZZING_INFO) {
                auto args = format_two_arg(stack, first_index, second_index, output_index);
                debug_log(args.out, " = ", args.lhs, " + ", args.rhs, ";\n");
            }

            ExecutionHandler result;
            result = stack[first_index] + stack[second_index];
            // If the output index is larger than the number of elements in stack, append
            if (output_index >= stack.size()) {
                stack.push_back(result);
            } else {
                stack[output_index] = result;
            }
            return 0;
        };

        /**
         * @brief Execute the SQR  instruction
         *
         * @param builder
         * @param stack
         * @param instruction
         * @return if everything is ok, 1 if we should stop execution, since an expected error was encountered
         */
        static inline size_t execute_SQR(Builder* builder,
                                         std::vector<ExecutionHandler>& stack,
                                         Instruction& instruction)
        {
            (void)builder;
            if (stack.size() == 0) {
                return 1;
            }
            size_t first_index = instruction.arguments.twoArgs.in % stack.size();
            size_t output_index = instruction.arguments.twoArgs.out;

            if constexpr (SHOW_FUZZING_INFO) {
                auto args = format_single_arg(stack, first_index, output_index);
                debug_log(args.out, " = ", args.rhs, ".sqr();\n");
            }

            ExecutionHandler result;
            result = stack[first_index].sqr();
            // If the output index is larger than the number of elements in stack, append
            if (output_index >= stack.size()) {
                stack.push_back(result);
            } else {
                stack[output_index] = result;
            }
            return 0;
        };

        /**
         * @brief Execute the ASSERT_EQUAL  instruction
         *
         * @param builder
         * @param stack
         * @param instruction
         * @return if everything is ok, 1 if we should stop execution, since an expected error was encountered
         */
        static inline size_t execute_ASSERT_EQUAL(Builder* builder,
                                                  std::vector<ExecutionHandler>& stack,
                                                  Instruction& instruction)
        {
            (void)builder;
            if (stack.size() == 0) {
                return 1;
            }
            size_t first_index = instruction.arguments.twoArgs.in % stack.size();
            size_t second_index = instruction.arguments.twoArgs.out % stack.size();

            if constexpr (SHOW_FUZZING_INFO) {
                auto args = format_two_arg(stack, first_index, second_index, second_index);
                debug_log("assert_equal(", args.lhs, ", ", args.rhs, ");\n");
            }

            stack[first_index].assert_equal(stack[second_index]);
            return 0;
        };

        /**
         * @brief Execute the ASSERT_NOT_EQUAL  instruction
         *
         * @param builder
         * @param stack
         * @param instruction
         * @return if everything is ok, 1 if we should stop execution, since an expected error was encountered
         */
        static inline size_t execute_ASSERT_NOT_EQUAL(Builder* builder,
                                                      std::vector<ExecutionHandler>& stack,
                                                      Instruction& instruction)
        {
            (void)builder;
            if (stack.size() == 0) {
                return 1;
            }
            size_t first_index = instruction.arguments.twoArgs.in % stack.size();
            size_t second_index = instruction.arguments.twoArgs.out % stack.size();

            if constexpr (SHOW_FUZZING_INFO) {
                auto args = format_two_arg(stack, first_index, second_index, second_index);
                debug_log("assert_not_equal(", args.lhs, ", ", args.rhs, ");\n");
            }

            stack[first_index].assert_not_equal(stack[second_index]);
            return 0;
        };

        /**
         * @brief Execute the ASSERT_ZERO  instruction
         *
         * @param builder
         * @param stack
         * @param instruction
         * @return if everything is ok, 1 if we should stop execution, since an expected error was encountered
         */
        static inline size_t execute_ASSERT_ZERO(Builder* builder,
                                                 std::vector<ExecutionHandler>& stack,
                                                 Instruction& instruction)
        {
            (void)builder;
            if (stack.size() == 0) {
                return 1;
            }
            size_t index = instruction.arguments.singleArg.in % stack.size();

            // Handler for the case that should be discovered through an ASSERT
            if (stack[index].f().is_constant() && !stack[index].base.is_zero()) {
                return 0;
            }
            if constexpr (SHOW_FUZZING_INFO) {
                auto args = format_self_arg(stack, index);
                debug_log("assert_zero(", args.out, ");\n");
            }

            stack[index].assert_zero();
            return 0;
        };

        /**
         * @brief Execute the ASSERT_NOT_ZERO  instruction
         *
         * @param builder
         * @param stack
         * @param instruction
         * @return if everything is ok, 1 if we should stop execution, since an expected error was encountered
         */
        static inline size_t execute_ASSERT_NOT_ZERO(Builder* builder,
                                                     std::vector<ExecutionHandler>& stack,
                                                     Instruction& instruction)
        {
            (void)builder;
            if (stack.size() == 0) {
                return 1;
            }
            size_t index = instruction.arguments.singleArg.in % stack.size();
            // Handler for the case that should be discovered through an ASSERT
            if (stack[index].f().is_constant() && stack[index].base.is_zero()) {
                return 0;
            }

            if constexpr (SHOW_FUZZING_INFO) {
                auto args = format_self_arg(stack, index);
                debug_log("assert_not_zero(", args.out, ");\n");
            }
            stack[index].assert_not_zero();
            return 0;
        };

        /**
         * @brief Execute the subtraction operator instruction
         *
         * @param builder
         * @param stack
         * @param instruction
         * @return if everything is ok, 1 if we should stop execution, since an expected error was encountered
         */
        static inline size_t execute_SUBTRACT(Builder* builder,
                                              std::vector<ExecutionHandler>& stack,
                                              Instruction& instruction)
        {
            (void)builder;
            if (stack.size() == 0) {
                return 1;
            }
            size_t first_index = instruction.arguments.threeArgs.in1 % stack.size();
            size_t second_index = instruction.arguments.threeArgs.in2 % stack.size();
            size_t output_index = instruction.arguments.threeArgs.out;

            if constexpr (SHOW_FUZZING_INFO) {
                auto args = format_two_arg(stack, first_index, second_index, output_index);
                debug_log(args.out, " = ", args.lhs, " - ", args.rhs, ";\n");
            }

            ExecutionHandler result;
            result = stack[first_index] - stack[second_index];
            // If the output index is larger than the number of elements in stack, append
            if (output_index >= stack.size()) {
                stack.push_back(result);
            } else {
                stack[output_index] = result;
            }
            return 0;
        };
        /**
         * @brief Execute the division operator instruction
         *
         * @param builder
         * @param stack
         * @param instruction
         * @return if everything is ok, 1 if we should stop execution, since an expected error was encountered
         */
        static inline size_t execute_DIVIDE(Builder* builder,
                                            std::vector<ExecutionHandler>& stack,
                                            Instruction& instruction)
        {
            (void)builder;
            if (stack.size() == 0) {
                return 1;
            }
            size_t first_index = instruction.arguments.threeArgs.in1 % stack.size();
            size_t second_index = instruction.arguments.threeArgs.in2 % stack.size();
            size_t output_index = instruction.arguments.threeArgs.out;

            if constexpr (SHOW_FUZZING_INFO) {
                auto args = format_two_arg(stack, first_index, second_index, output_index);
                debug_log(args.out, " = ", args.lhs, " / ", args.rhs, ";\n");
            }

            ExecutionHandler result;
            if (bb::fr((uint256_t(stack[second_index].f().get_value()) % bb::fr::modulus)) == 0) {
                return 0; // This is not handled by field
            }
            // TODO: FIX THIS. I can't think of an elegant fix for this field issue right now
            // if (fr((stack[first_index].field.get_value() % fr::modulus).lo) == 0) {
            //     return 0;
            // }
            result = stack[first_index] / stack[second_index];
            // If the output index is larger than the number of elements .in stack, append
            if (output_index >= stack.size()) {
                stack.push_back(result);
            } else {
                stack[output_index] = result;
            }
            return 0;
        };
        /**
         * @brief Execute the ADD_TWO instruction
         *
         * @param builder
         * @param stack
         * @param instruction
         * @return if everything is ok, 1 if we should stop execution, since an expected error was encountered
        size_t
         */
        static inline size_t execute_ADD_TWO(Builder* builder,
                                             std::vector<ExecutionHandler>& stack,
                                             Instruction& instruction)
        {
            (void)builder;
            if (stack.size() == 0) {
                return 1;
            }
            size_t first_index = instruction.arguments.fourArgs.in1 % stack.size();
            size_t second_index = instruction.arguments.fourArgs.in2 % stack.size();
            size_t third_index = instruction.arguments.fourArgs.in3 % stack.size();
            size_t output_index = instruction.arguments.fourArgs.out;

            if constexpr (SHOW_FUZZING_INFO) {
                auto args = format_args(stack, output_index, { first_index, second_index, third_index });
                debug_log(args.out, " = ", args.inputs[0], ".add_two(", args.inputs[1], ", ", args.inputs[2], ");\n");
            }

            ExecutionHandler result;
            result = stack[first_index].add_two(stack[second_index], stack[third_index]);
            // If the output index is larger than the number of elements in stack, append
            if (output_index >= stack.size()) {
                stack.push_back(result);
            } else {
                stack[output_index] = result;
            }
            return 0;
        };
        /**
         * @brief Execute the MADD instruction
         *
         * @param builder
         * @param stack
         * @param instruction
         * @return if everything is ok, 1 if we should stop execution, since an expected error was encountered
        size_t
         */
        static inline size_t execute_MADD(Builder* builder,
                                          std::vector<ExecutionHandler>& stack,
                                          Instruction& instruction)
        {
            (void)builder;
            if (stack.size() == 0) {
                return 1;
            }
            size_t first_index = instruction.arguments.fourArgs.in1 % stack.size();
            size_t second_index = instruction.arguments.fourArgs.in2 % stack.size();
            size_t third_index = instruction.arguments.fourArgs.in3 % stack.size();
            size_t output_index = instruction.arguments.fourArgs.out;

            if constexpr (SHOW_FUZZING_INFO) {
                auto args = format_args(stack, output_index, { first_index, second_index, third_index });
                debug_log(args.out, " = ", args.inputs[0], ".madd(", args.inputs[1], ", ", args.inputs[2], ");\n");
            }

            ExecutionHandler result;
            result = stack[first_index].madd(stack[second_index], stack[third_index]);
            // If the output index is larger than the number of elements in stack, append
            if (output_index >= stack.size()) {
                stack.push_back(result);
            } else {
                stack[output_index] = result;
            }
            return 0;
        };

        /**
         * @brief Execute the RANDOMSEED instruction
         *
         * @param builder
         * @param stack
         * @param instruction
         * @return if everything is ok, 1 if we should stop execution, since an expected error was encountered
         */
        static inline size_t execute_RANDOMSEED(Builder* builder,
                                                std::vector<ExecutionHandler>& stack,
                                                Instruction& instruction)
        {
            (void)builder;
            (void)stack;

            VarianceRNG.reseed(instruction.arguments.randomseed);
            return 0;
        };
        /**
         * @brief Execute the COND_NEGATE instruction
         *
         * @param builder
         * @param stack
         * @param instruction
         * @return if everything is ok, 1 if we should stop execution, since an expected error was encountered
         */
        static inline size_t execute_COND_NEGATE(Builder* builder,
                                                 std::vector<ExecutionHandler>& stack,
                                                 Instruction& instruction)
        {
            (void)builder;
            if (stack.size() == 0) {
                return 1;
            }
            size_t first_index = instruction.arguments.threeArgs.in1 % stack.size();
            size_t output_index = instruction.arguments.threeArgs.out % stack.size();
            bool predicate = instruction.arguments.threeArgs.in2 % 2;

            if constexpr (SHOW_FUZZING_INFO) {
                auto args = format_single_arg(stack, first_index, output_index);
                debug_log(args.out, " = ", args.rhs, ".conditional_negate(", predicate ? "true" : "false", ");\n");
            }
            ExecutionHandler result;
            result = stack[first_index].conditional_negate(builder, predicate);
            // If the output index is larger than the number of elements in stack, append
            if (output_index >= stack.size()) {
                stack.push_back(result);
            } else {
                stack[output_index] = result;
            }
            return 0;
        };

        /**
         * @brief Execute the COND_SELECT instruction
         *
         * @param builder
         * @param stack
         * @param instruction
         * @return if everything is ok, 1 if we should stop execution, since an expected error was encountered
         */
        static inline size_t execute_COND_SELECT(Builder* builder,
                                                 std::vector<ExecutionHandler>& stack,
                                                 Instruction& instruction)
        {
            (void)builder;
            if (stack.size() == 0) {
                return 1;
            }
            size_t first_index = instruction.arguments.fourArgs.in1 % stack.size();
            size_t second_index = instruction.arguments.fourArgs.in2 % stack.size();
            size_t output_index = instruction.arguments.fourArgs.out % stack.size();
            bool predicate = instruction.arguments.fourArgs.in3 % 2;

            if constexpr (SHOW_FUZZING_INFO) {
                auto args = format_two_arg(stack, first_index, second_index, output_index);
                debug_log(args.out,
                          " = conditional_select(",
                          args.lhs,
                          ", ",
                          args.rhs,
                          ", ",
                          predicate ? "true" : "false",
                          ");\n");
            }
            ExecutionHandler result;
            result = stack[first_index].conditional_select(builder, stack[second_index], predicate);
            // If the output index is larger than the number of elements in stack, append
            if (output_index >= stack.size()) {
                stack.push_back(result);
            } else {
                stack[output_index] = result;
            }
            return 0;
        };
        /**
         * @brief Execute the SELECT_IF_ZERO instruction
         *
         * @param builder
         * @param stack
         * @param instruction
         * @return if everything is ok, 1 if we should stop execution, since an expected error was encountered
         */
        static inline size_t execute_SELECT_IF_ZERO(Builder* builder,
                                                    std::vector<ExecutionHandler>& stack,
                                                    Instruction& instruction)
        {
            (void)builder;
            if (stack.size() == 0) {
                return 1;
            }
            size_t first_index = instruction.arguments.fourArgs.in1 % stack.size();
            size_t second_index = instruction.arguments.fourArgs.in2 % stack.size();
            size_t third_index = instruction.arguments.fourArgs.in3 % stack.size();
            size_t output_index = instruction.arguments.fourArgs.out % stack.size();

            if constexpr (SHOW_FUZZING_INFO) {
                auto args = format_args(stack, output_index, { first_index, second_index, third_index });
                debug_log(
                    args.out, " = select_if_zero(", args.inputs[0], ", ", args.inputs[1], ", ", args.inputs[2], ");\n");
            }
            ExecutionHandler result;
            result = stack[first_index].select_if_zero(builder, stack[second_index], stack[third_index]);
            // If the output index is larger than the number of elements in stack, append
            if (output_index >= stack.size()) {
                stack.push_back(result);
            } else {
                stack[output_index] = result;
            }
            return 0;
        };
        /**
         * @brief Execute the SELECT_IF_EQ instruction
         *
         * @param builder
         * @param stack
         * @param instruction
         * @return if everything is ok, 1 if we should stop execution, since an expected error was encountered
         */
        static inline size_t execute_SELECT_IF_EQ(Builder* builder,
                                                  std::vector<ExecutionHandler>& stack,
                                                  Instruction& instruction)
        {
            (void)builder;
            if (stack.size() == 0) {
                return 1;
            }
            size_t first_index = instruction.arguments.fourArgs.in1 % stack.size();
            size_t second_index = instruction.arguments.fourArgs.in2 % stack.size();
            size_t third_index = instruction.arguments.fourArgs.in3 % stack.size();
            size_t output_index = instruction.arguments.fourArgs.out % stack.size();

            if constexpr (SHOW_FUZZING_INFO) {
                auto args = format_args(stack, output_index, { first_index, second_index, third_index });
                debug_log(
                    args.out, " = select_if_eq(", args.inputs[0], ", ", args.inputs[1], ", ", args.inputs[2], ");\n");
            }
            ExecutionHandler result;
            result = stack[first_index].select_if_eq(builder, stack[second_index], stack[third_index]);
            // If the output index is larger than the number of elements in stack, append
            if (output_index >= stack.size()) {
                stack.push_back(result);
            } else {
                stack[output_index] = result;
            }
            return 0;
        };
        /**
         * @brief Execute the SET instruction
         *
         * @param builder
         * @param stack
         * @param instruction
         * @return if everything is ok, 1 if we should stop execution, since an expected error was encountered
         */
        static inline size_t execute_SET(Builder* builder,
                                         std::vector<ExecutionHandler>& stack,
                                         Instruction& instruction)
        {
            (void)builder;
            if (stack.size() == 0) {
                return 1;
            }
            size_t first_index = instruction.arguments.twoArgs.in % stack.size();
            size_t output_index = instruction.arguments.twoArgs.out;

            if constexpr (SHOW_FUZZING_INFO) {
                auto args = format_single_arg(stack, first_index, output_index);
                debug_log(args.out, " = ", args.rhs, ".set();\n");
            }

            ExecutionHandler result;
            result = stack[first_index].set(builder);
            // If the output index is larger than the number of elements in stack, append
            if (output_index >= stack.size()) {
                stack.push_back(result);
            } else {
                stack[output_index] = result;
            }
            return 0;
        };
        /**
         * @brief Execute the INVERT instruction
         *
         * @param builder
         * @param stack
         * @param instruction
         * @return if everything is ok, 1 if we should stop execution, since an expected error was encountered
         */
        static inline size_t execute_INVERT(Builder* builder,
                                            std::vector<ExecutionHandler>& stack,
                                            Instruction& instruction)
        {
            (void)builder;
            if (stack.size() == 0) {
                return 1;
            }
            size_t first_index = instruction.arguments.twoArgs.in % stack.size();
            size_t output_index = instruction.arguments.twoArgs.out;

            if constexpr (SHOW_FUZZING_INFO) {
                auto args = format_single_arg(stack, first_index, output_index);
                debug_log(args.out, " = ", args.rhs, ".invert();\n");
            }

            ExecutionHandler result;
            result = stack[first_index].invert();
            // If the output index is larger than the number of elements in stack, append
            if (output_index >= stack.size()) {
                stack.push_back(result);
            } else {
                stack[output_index] = result;
            }
            return 0;
        };

        /**
         * @brief Execute the POW instruction
         *
         * @param builder
         * @param stack
         * @param instruction
         * @return if everything is ok, 1 if we should stop execution, since an expected error was encountered
         */
        static inline size_t execute_POW(Builder* builder,
                                         std::vector<ExecutionHandler>& stack,
                                         Instruction& instruction)
        {
            (void)builder;
            if (stack.size() == 0) {
                return 1;
            }
            size_t first_index = instruction.arguments.powArgs.in % stack.size();
            size_t output_index = instruction.arguments.powArgs.out;
            uint32_t exponent = instruction.arguments.powArgs.exponent;

            if constexpr (SHOW_FUZZING_INFO) {
                auto args = format_single_arg(stack, first_index, output_index);
                debug_log(args.out, " = ", args.rhs, ".pow(", exponent, ");\n");
            }
            ExecutionHandler result = stack[first_index].pow(exponent);
            if (output_index >= stack.size()) {
                stack.push_back(result);
            } else {
                stack[output_index] = result;
            }
            return 0;
        };

        /**
         * @brief Execute the ACCUMULATE instruction
         *
         * @param builder
         * @param stack
         * @param instruction
         * @return if everything is ok, 1 if we should stop execution, since an expected error was encountered
         */
        static inline size_t execute_ACCUMULATE(Builder* builder,
                                                std::vector<ExecutionHandler>& stack,
                                                Instruction& instruction)
        {
            (void)builder;
            if (stack.size() == 0) {
                return 1;
            }
            size_t first_index = instruction.arguments.twoArgs.in % stack.size();
            size_t count =
                (instruction.arguments.twoArgs.out % std::min(stack.size(), size_t(ACCUMULATE_MAXIMUM_ELEMENTS))) + 1;

            std::vector<field_t> to_accumulate;
            bb::fr native_acc = bb::fr::zero();
            if constexpr (SHOW_FUZZING_INFO) {
                debug_log("auto w", stack.size(), " = field_t::accumulate({");
            }
            for (size_t i = 0; i < count; i++) {
                size_t idx = (first_index + i) % stack.size();
                to_accumulate.push_back(stack[idx].field);
                native_acc += stack[idx].base;
                if constexpr (SHOW_FUZZING_INFO) {
                    debug_log(format_element(stack, idx), (i < count - 1 ? ", " : ""));
                }
            }
            if constexpr (SHOW_FUZZING_INFO) {
                debug_log("});\n");
            }
            auto result_field = field_t::accumulate(to_accumulate);
            bb::fr result_base = native_acc;
            stack.push_back(ExecutionHandler(std::move(result_base), std::move(result_field)));
            return 0;
        };

        /**
         * @brief Execute the RANGE_CONSTRAINT instruction
         * @details Constrains the element to fit within num_bits bits. The bit count is derived
         * from the raw instruction byte, capped to the element's actual bit width (so the constraint
         * always passes). Skips elements wider than 253 bits (MAX_NUM_BITS_RANGE_CONSTRAINT).
         */
        static inline size_t execute_RANGE_CONSTRAINT(Builder* builder,
                                                      std::vector<ExecutionHandler>& stack,
                                                      Instruction& instruction)
        {
            (void)builder;
            if (stack.size() == 0) {
                return 1;
            }
            size_t first_index = instruction.arguments.twoArgs.in % stack.size();
            uint8_t raw_bits = instruction.arguments.twoArgs.out;

            auto value = uint256_t(stack[first_index].field.get_value());
            size_t value_bits = (value == 0) ? 0 : static_cast<size_t>(value.get_msb()) + 1;

            if (value_bits > 253) {
                return 0;
            }
            size_t num_bits = static_cast<size_t>(raw_bits);
            if (num_bits < value_bits) {
                num_bits = value_bits;
            }
            if (num_bits > 253) {
                num_bits = 253;
            }
            if (num_bits == 0) {
                num_bits = 1;
            }

            if constexpr (SHOW_FUZZING_INFO) {
                auto args = format_self_arg(stack, first_index);
                debug_log(args.out, ".create_range_constraint(", num_bits, ");\n");
            }
            stack[first_index].f().create_range_constraint(num_bits);
            return 0;
        };
    };

    /** For field execution state is just a vector of ExecutionHandler objects
     *
     * */
    typedef std::vector<ExecutionHandler> ExecutionState;
    /**
     * @brief Check that the resulting values are equal to expected
     *
     * @tparam Builder
     * @param builder
     * @param stack
     * @return true
     * @return false
     */
    inline static bool postProcess(Builder* builder, std::vector<FieldBase::ExecutionHandler>& stack)
    {
        (void)builder;
        for (size_t i = 0; i < stack.size(); i++) {
            auto element = stack[i];
            if (bb::fr((uint256_t(element.field.get_value()) % bb::fr::modulus)) != element.base) {
                std::cerr << "Failed at " << i << " with actual value " << element.base << " and value in field "
                          << element.field.get_value() << std::endl;
                return false;
            }
        }
        return true;
    }
};

#ifdef HAVOC_TESTING

extern "C" int LLVMFuzzerInitialize(int* argc, char*** argv)
{
    (void)argc;
    (void)argv;
#ifdef HAVOC_CALIBRATION
    std::random_device rd;
    std::uniform_int_distribution<uint64_t> dist(0, ~(uint64_t)(0));
    srandom(static_cast<unsigned int>(dist(rd)));

    fuzzer_havoc_settings =
        HavocSettings{ .GEN_LLVM_POST_MUTATION_PROB = static_cast<size_t>(((random() % 20) + 1) * 10),
                       .GEN_MUTATION_COUNT_LOG = static_cast<size_t>((random() % 6) + 2),
                       .GEN_STRUCTURAL_MUTATION_PROBABILITY = static_cast<size_t>((random() % 900) + 100),
                       .GEN_VALUE_MUTATION_PROBABILITY = static_cast<size_t>((random() % 900) + 100),
                       .ST_MUT_DELETION_PROBABILITY = static_cast<size_t>((random() % 100) + 1),
                       .ST_MUT_DUPLICATION_PROBABILITY = static_cast<size_t>((random() % 100) + 1),
                       .ST_MUT_INSERTION_PROBABILITY = static_cast<size_t>((random() % 100) + 1),
                       .ST_MUT_MAXIMUM_DELETION_LOG = static_cast<size_t>((random() % 6) + 1),
                       .ST_MUT_MAXIMUM_DUPLICATION_LOG = static_cast<size_t>((random() % 4) + 1),
                       .ST_MUT_SWAP_PROBABILITY = static_cast<size_t>((random() % 100) + 1),
                       .VAL_MUT_LLVM_MUTATE_PROBABILITY = static_cast<size_t>((random() % 500) + 1),
                       .VAL_MUT_MONTGOMERY_PROBABILITY = static_cast<size_t>((random() % 200) + 1),
                       .VAL_MUT_NON_MONTGOMERY_PROBABILITY = static_cast<size_t>((random() % 200) + 1),
                       .VAL_MUT_SMALL_ADDITION_PROBABILITY = static_cast<size_t>((random() % 200) + 1),
                       .VAL_MUT_SPECIAL_VALUE_PROBABILITY = static_cast<size_t>((random() % 200) + 1),
                       .structural_mutation_distribution = {},
                       .value_mutation_distribution = {} };

    std::cerr << "SETTINGS:"
              << " GEN_LLVM_POST_MUTATION_PROB=" << fuzzer_havoc_settings.GEN_LLVM_POST_MUTATION_PROB
              << " GEN_MUTATION_COUNT_LOG=" << fuzzer_havoc_settings.GEN_MUTATION_COUNT_LOG
              << " GEN_STRUCTURAL_MUTATION_PROBABILITY=" << fuzzer_havoc_settings.GEN_STRUCTURAL_MUTATION_PROBABILITY
              << " GEN_VALUE_MUTATION_PROBABILITY=" << fuzzer_havoc_settings.GEN_VALUE_MUTATION_PROBABILITY
              << " ST_MUT_DELETION_PROBABILITY=" << fuzzer_havoc_settings.ST_MUT_DELETION_PROBABILITY
              << " ST_MUT_DUPLICATION_PROBABILITY=" << fuzzer_havoc_settings.ST_MUT_DUPLICATION_PROBABILITY
              << " ST_MUT_INSERTION_PROBABILITY=" << fuzzer_havoc_settings.ST_MUT_INSERTION_PROBABILITY
              << " ST_MUT_MAXIMUM_DELETION_LOG=" << fuzzer_havoc_settings.ST_MUT_MAXIMUM_DELETION_LOG
              << " ST_MUT_MAXIMUM_DUPLICATION_LOG=" << fuzzer_havoc_settings.ST_MUT_MAXIMUM_DUPLICATION_LOG
              << " ST_MUT_SWAP_PROBABILITY=" << fuzzer_havoc_settings.ST_MUT_SWAP_PROBABILITY
              << " VAL_MUT_LLVM_MUTATE_PROBABILITY=" << fuzzer_havoc_settings.VAL_MUT_LLVM_MUTATE_PROBABILITY
              << " VAL_MUT_MONTGOMERY_PROBABILITY=" << fuzzer_havoc_settings.VAL_MUT_MONTGOMERY_PROBABILITY
              << " VAL_MUT_NON_MONTGOMERY_PROBABILITY=" << fuzzer_havoc_settings.VAL_MUT_NON_MONTGOMERY_PROBABILITY
              << " VAL_MUT_SMALL_ADDITION_PROBABILITY=" << fuzzer_havoc_settings.VAL_MUT_SMALL_ADDITION_PROBABILITY
              << " VAL_MUT_SPECIAL_VALUE_PROBABILITY=" << fuzzer_havoc_settings.VAL_MUT_SPECIAL_VALUE_PROBABILITY
              << std::endl;
#else
    // Calibrated 2026-05-14: 200 runs * 1200s, 20 parallel, scored by ft * new_units / 1000
    fuzzer_havoc_settings = HavocSettings{
        .GEN_LLVM_POST_MUTATION_PROB = 160,
        .GEN_MUTATION_COUNT_LOG = 4,
        .GEN_STRUCTURAL_MUTATION_PROBABILITY = 877,
        .GEN_VALUE_MUTATION_PROBABILITY = 248,
        .ST_MUT_DELETION_PROBABILITY = 24,
        .ST_MUT_DUPLICATION_PROBABILITY = 94,
        .ST_MUT_INSERTION_PROBABILITY = 35,
        .ST_MUT_MAXIMUM_DELETION_LOG = 2,
        .ST_MUT_MAXIMUM_DUPLICATION_LOG = 2,
        .ST_MUT_SWAP_PROBABILITY = 92,
        .VAL_MUT_LLVM_MUTATE_PROBABILITY = 277,
        .VAL_MUT_MONTGOMERY_PROBABILITY = 186,
        .VAL_MUT_NON_MONTGOMERY_PROBABILITY = 159,
        .VAL_MUT_SMALL_ADDITION_PROBABILITY = 76,
        .VAL_MUT_SPECIAL_VALUE_PROBABILITY = 193,
        .structural_mutation_distribution = {},
        .value_mutation_distribution = {},
    };
#endif
    std::vector<size_t> structural_mutation_distribution;
    std::vector<size_t> value_mutation_distribution;
    size_t temp = 0;
    temp += fuzzer_havoc_settings.ST_MUT_DELETION_PROBABILITY;
    structural_mutation_distribution.push_back(temp);
    temp += fuzzer_havoc_settings.ST_MUT_DUPLICATION_PROBABILITY;
    structural_mutation_distribution.push_back(temp);
    temp += fuzzer_havoc_settings.ST_MUT_INSERTION_PROBABILITY;
    structural_mutation_distribution.push_back(temp);
    temp += fuzzer_havoc_settings.ST_MUT_SWAP_PROBABILITY;
    structural_mutation_distribution.push_back(temp);
    fuzzer_havoc_settings.structural_mutation_distribution = structural_mutation_distribution;

    temp = 0;
    temp += fuzzer_havoc_settings.VAL_MUT_LLVM_MUTATE_PROBABILITY;
    value_mutation_distribution.push_back(temp);
    temp += fuzzer_havoc_settings.VAL_MUT_SMALL_ADDITION_PROBABILITY;
    value_mutation_distribution.push_back(temp);

    temp += fuzzer_havoc_settings.VAL_MUT_SPECIAL_VALUE_PROBABILITY;
    value_mutation_distribution.push_back(temp);
    fuzzer_havoc_settings.value_mutation_distribution = value_mutation_distribution;
    return 0;
}
#endif

/**
 * @brief Fuzzer entry function
 *
 */
extern "C" size_t LLVMFuzzerTestOneInput(const uint8_t* Data, size_t Size)
{
    RunWithBuilders<FieldBase, FuzzerCircuitTypes>(Data, Size, VarianceRNG);
    return 0;
}

#pragma clang diagnostic pop

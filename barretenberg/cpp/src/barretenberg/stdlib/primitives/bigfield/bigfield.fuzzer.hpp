// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/common/assert.hpp"
#include "barretenberg/ecc/curves/bn254/fq.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/stdlib/primitives/bigfield/bigfield.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders_fwd.hpp"
#pragma clang diagnostic push
// TODO(luke/kesha): Add a comment explaining why we need this ignore and what the solution is.
#pragma clang diagnostic ignored "-Wc99-designator"
// This is a global variable, so that the execution handling class could alter it and signal to the input tester
// that the input should fail
bool circuit_should_fail = false;

#define HAVOC_TESTING
// #define DISABLE_DIVISION 1
#include "barretenberg/common/fuzzer.hpp"

FastRandom VarianceRNG(0);
// #define DISABLE_DIVISION
//  Enable this definition, when you want to find out the instructions that caused a failure
// #define FUZZING_SHOW_INFORMATION 1

#ifdef FUZZING_SHOW_INFORMATION
#define PRINT_SINGLE_ARG_INSTRUCTION(first_index, vector, operation_name, preposition)                                 \
    {                                                                                                                  \
        std::cout << operation_name << " " << (vector[first_index].bigfield.is_constant() ? "constant(" : "witness(")  \
                  << vector[first_index].bigfield.get_value() << ") at " << first_index << " " << preposition          \
                  << std::flush;                                                                                       \
    }

#define PRINT_TWO_ARG_INSTRUCTION(first_index, second_index, vector, operation_name, preposition)                      \
    {                                                                                                                  \
        std::cout << operation_name << " " << (vector[first_index].bigfield.is_constant() ? "constant(" : "witness(")  \
                  << vector[first_index].bigfield.get_value() << ") at " << first_index << " " << preposition << " "   \
                  << (vector[second_index].bigfield.is_constant() ? "constant(" : "witness(")                          \
                  << vector[second_index].bigfield.get_value() << ") at " << second_index << std::flush;               \
    }

#define PRINT_THREE_ARG_INSTRUCTION(                                                                                   \
    first_index, second_index, third_index, vector, operation_name, preposition1, preposition2)                        \
    {                                                                                                                  \
        std::cout << operation_name << " " << (vector[first_index].bigfield.is_constant() ? "constant(" : "witness(")  \
                  << vector[first_index].bigfield.get_value() << ") at " << first_index << " " << preposition1 << " "  \
                  << (vector[second_index].bigfield.is_constant() ? "constant(" : "witness(")                          \
                  << vector[second_index].bigfield.get_value() << ") at " << second_index << " " << preposition2       \
                  << " " << (vector[third_index].bigfield.is_constant() ? "constant(" : "witness(")                    \
                  << vector[third_index].bigfield.get_value() << ") at " << third_index << std::flush;                 \
    }
#define PRINT_TWO_ARG_ONE_VALUE_INSTRUCTION(                                                                           \
    first_index, second_index, third_index, vector, operation_name, preposition1, preposition2)                        \
    {                                                                                                                  \
        std::cout << operation_name << " " << (vector[first_index].bigfield.is_constant() ? "constant(" : "witness(")  \
                  << vector[first_index].bigfield.get_value() << ":" << vector[first_index].suint.current_max          \
                  << ") at " << first_index << " " << preposition1 << " "                                              \
                  << (vector[second_index].bigfield.is_constant() ? "constant(" : "witness(")                          \
                  << vector[second_index].bigfield.get_value() << ":" << vector[second_index].suint.current_max        \
                  << ") at " << second_index << " " << preposition2 << " " << third_index << std::flush;               \
    }

#define PRINT_TWO_ARG_TWO_VALUES_INSTRUCTION(                                                                          \
    first_index, second_index, value1, value2, vector, operation_name, preposition1, preposition2, preposition3)       \
    {                                                                                                                  \
        std::cout << operation_name << " " << (vector[first_index].bigfield.is_constant() ? "constant(" : "witness(")  \
                  << vector[first_index].bigfield.get_value() << ") at " << first_index << " " << preposition1 << " "  \
                  << (vector[second_index].bigfield.is_constant() ? "constant(" : "witness(")                          \
                  << vector[second_index].bigfield.get_value() << ") at " << second_index << " " << preposition2       \
                  << " " << value1 << preposition3 << value2 << std::flush;                                            \
    }

#define PRINT_SLICE(first_index, lsb, msb, vector)                                                                     \
    {                                                                                                                  \
        std::cout << "Slice:"                                                                                          \
                  << " " << (vector[first_index].bigfield.is_constant() ? "constant(" : "witness(")                    \
                  << vector[first_index].bigfield.get_value() << ":" << vector[first_index].suint.current_max          \
                  << ") at " << first_index << " "                                                                     \
                  << "(" << (size_t)lsb << ":" << (size_t)msb << ")" << std::flush;                                    \
    }

#define PRINT_RESULT(prefix, action, index, value)                                                                     \
    {                                                                                                                  \
        std::cout << "  result(" << value.bigfield.get_value() << ")" << action << index << std::endl << std::flush;   \
    }

#else

#define PRINT_SINGLE_ARG_INSTRUCTION(first_index, vector, operation_name, preposition)
#define PRINT_TWO_ARG_INSTRUCTION(first_index, second_index, vector, operation_name, preposition)

#define PRINT_TWO_ARG_ONE_VALUE_INSTRUCTION(                                                                           \
    first_index, second_index, third_index, vector, operation_name, preposition1, preposition2)
#define PRINT_TWO_ARG_TWO_VALUES_INSTRUCTION(                                                                          \
    first_index, second_index, value1, value2, vector, operation_name, preposition1, preposition2, preposition3)

#define PRINT_THREE_ARG_INSTRUCTION(                                                                                   \
    first_index, second_index, third_index, vector, operation_name, preposition1, preposition2)
#define PRINT_RESULT(prefix, action, index, value)

#define PRINT_SLICE(first_index, lsb, msb, vector)
#endif

#define OPERATION_TYPE_SIZE 1

#define ELEMENT_SIZE (sizeof(fq) + 1)
#define TWO_IN_ONE_OUT 3
#define THREE_IN_ONE_OUT 4
#define SLICE_ARGS_SIZE 6

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
/**
 * @brief The class parametrizing Bigfield fuzzing instructions, execution, etc
 *
 */
template <typename Builder> class BigFieldBase {
  private:
    typedef bb::stdlib::bool_t<Builder> bool_t;
    typedef bb::stdlib::field_t<Builder> field_t;
    typedef bb::stdlib::witness_t<Builder> witness_t;
    typedef bb::stdlib::public_witness_t<Builder> public_witness_t;
    typedef bb::stdlib::bigfield<Builder, bb::Bn254FqParams> bigfield_t;

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
            MULT_MADD,
            SQR,
            SQR_ADD,
            ASSERT_EQUAL,
            ASSERT_NOT_EQUAL,
            MSUB_DIV,
            COND_NEGATE,
            COND_SELECT,
            SET,
            RANDOMSEED,
            _LAST
        };

        struct Element {
            Element(uint64_t v)
                : value(v)
            {}
            bb::fq value;
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
            uint8_t add_elements[MULT_MADD_MAXIMUM_ADDED_ELEMENTS];
            uint8_t add_elements_count = 0;
            uint8_t input_index;
            uint8_t output_index;
        };
        struct MultOpArgs {
            uint8_t mult_pairs[MULT_MADD_MAXIMUM_MUL_PAIRS * 2];
            uint8_t add_elements[MULT_MADD_MAXIMUM_ADDED_ELEMENTS];
            uint8_t mult_pairs_count = 1;
            uint8_t add_elements_count = 0;
            uint8_t divisor_index;
            uint8_t output_index;
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
            ArgumentContents()
                : randomseed(0)
            {}
            uint32_t randomseed;
            Element element;
            TwoArgs twoArgs;
            ThreeArgs threeArgs;
            FourArgs fourArgs;
            FiveArgs fiveArgs;
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
            uint8_t in1, in2, in3, out, mult_size, add_size;
            Instruction instr;
            uint8_t mult_pairs[MULT_MADD_MAXIMUM_MUL_PAIRS * 2] = { 0 };
            uint8_t add_elements[MULT_MADD_MAXIMUM_ADDED_ELEMENTS > SQR_ADD_MAXIMUM_ADDED_ELEMENTS
                                     ? MULT_MADD_MAXIMUM_ADDED_ELEMENTS
                                     : SQR_ADD_MAXIMUM_ADDED_ELEMENTS] = { 0 };

            // Depending on instruction
            switch (instruction_opcode) {
            case OPCODE::CONSTANT:
            case OPCODE::WITNESS:
            case OPCODE::CONSTANT_WITNESS: {
                auto value = static_cast<uint64_t>(fast_log_distributed_uint256(rng));
                return { .id = instruction_opcode, .arguments.element = Element(value) };
                break;
            }
            case OPCODE::RANDOMSEED:
                return { .id = instruction_opcode, .arguments.randomseed = rng.next() };
                break;
            case OPCODE::SQR:
            case OPCODE::ASSERT_EQUAL:
            case OPCODE::ASSERT_NOT_EQUAL:
            case OPCODE::SET:
                in1 = static_cast<uint8_t>(rng.next() & 0xff);
                out = static_cast<uint8_t>(rng.next() & 0xff);
                return { .id = instruction_opcode, .arguments.twoArgs = { .in = in1, .out = out } };
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
                // For three-input-one-output instructions we just randomly pick each argument and generate an
                // instruction accordingly
                in1 = static_cast<uint8_t>(rng.next() & 0xff);
                in2 = static_cast<uint8_t>(rng.next() & 0xff);
                in3 = static_cast<uint8_t>(rng.next() & 0xff);
                out = static_cast<uint8_t>(rng.next() & 0xff);
                return { .id = instruction_opcode,
                         .arguments.fourArgs{ .in1 = in1, .in2 = in2, .in3 = in3, .out = out } };
                break;
            case OPCODE::MSUB_DIV:
                instr.arguments.multOpArgs.divisor_index = static_cast<uint8_t>(rng.next() & 0xff);
            case OPCODE::MULT_MADD:
                mult_size =
                    MULT_MADD_MINIMUM_MUL_PAIRS +
                    static_cast<uint8_t>(rng.next() % (MULT_MADD_MAXIMUM_MUL_PAIRS - MULT_MADD_MINIMUM_MUL_PAIRS));
                add_size = MULT_MADD_MINIMUM_ADDED_ELEMENTS +
                           static_cast<uint8_t>(rng.next() %
                                                (MULT_MADD_MAXIMUM_ADDED_ELEMENTS - MULT_MADD_MINIMUM_ADDED_ELEMENTS));

                for (size_t i = 0; i < mult_size; i++) {
                    mult_pairs[i * 2] = static_cast<uint8_t>(rng.next() & 0xff);
                    mult_pairs[i * 2 + 1] = static_cast<uint8_t>(rng.next() & 0xff);
                }
                for (size_t i = 0; i < add_size; i++) {
                    add_elements[i] = static_cast<uint8_t>(rng.next() & 0xff);
                }
                instr.id = instruction_opcode;
                memcpy(instr.arguments.multOpArgs.mult_pairs, mult_pairs, 2 * MULT_MADD_MAXIMUM_MUL_PAIRS);
                memcpy(instr.arguments.multOpArgs.add_elements, add_elements, MULT_MADD_MAXIMUM_ADDED_ELEMENTS);
                instr.arguments.multOpArgs.add_elements_count = add_size;
                instr.arguments.multOpArgs.mult_pairs_count = mult_size;

                instr.arguments.multOpArgs.output_index = static_cast<uint8_t>(rng.next() & 0xff);
                return instr;
                break;
            case OPCODE::SQR_ADD:
                add_size = SQR_ADD_MINIMUM_ADDED_ELEMENTS +
                           static_cast<uint8_t>(rng.next() %
                                                (SQR_ADD_MAXIMUM_ADDED_ELEMENTS - SQR_ADD_MINIMUM_ADDED_ELEMENTS));

                for (size_t i = 0; i < add_size; i++) {
                    add_elements[i] = static_cast<uint8_t>(rng.next() & 0xff);
                }
                instr.id = instruction_opcode;
                memcpy(instr.arguments.multAddArgs.add_elements, add_elements, SQR_ADD_MAXIMUM_ADDED_ELEMENTS);
                instr.arguments.multAddArgs.add_elements_count = add_size;

                instr.arguments.multAddArgs.input_index = static_cast<uint8_t>(rng.next() & 0xff);
                instr.arguments.multAddArgs.output_index = static_cast<uint8_t>(rng.next() & 0xff);
                return instr;
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
        inline static bb::fq mutateFieldElement(bb::fq e, T& rng, HavocSettings& havoc_config)
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
        e = bb::fq(value_data).from_montgomery_form();                                                                 \
    } else {                                                                                                           \
        e = bb::fq(value_data);                                                                                        \
    }

            // Pick the last value from the mutation distribution vector
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
                    e += bb::fq(rng.next() & 0xff);
                } else {
                    e -= bb::fq(rng.next() & 0xff);
                }
                if (convert_to_montgomery) {
                    e = e.from_montgomery_form();
                }
            } else {
                // Substitute field element with a special value
                switch (rng.next() % 9) {
                case 0:
                    e = bb::fq::zero();
                    break;
                case 1:
                    e = bb::fq::one();
                    break;
                case 2:
                    e = -bb::fq::one();
                    break;
                case 3:
                    e = bb::fq::one().sqrt().second;
                    break;
                case 4:
                    e = bb::fq::one().sqrt().second.invert();
                    break;
                case 5:
                    e = bb::fq::get_root_of_unity(8);
                    break;
                case 6:
                    e = bb::fq(2);
                    break;
                case 7:
                    e = bb::fq((bb::fq::modulus - 1) / 2);
                    break;
                case 8:
                    e = bb::fq((bb::fr::modulus));
                    break;
                default:
                    abort();
                    break;
                }
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
                    instruction.arguments.element.value =
                        mutateFieldElement(instruction.arguments.element.value, rng, havoc_config);
                }
                break;
            case OPCODE::SQR:
            case OPCODE::ASSERT_EQUAL:
            case OPCODE::ASSERT_NOT_EQUAL:
            case OPCODE::SET:
                PUT_RANDOM_BYTE_IF_LUCKY(instruction.arguments.twoArgs.in)
                PUT_RANDOM_BYTE_IF_LUCKY(instruction.arguments.twoArgs.out)
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
                // Randomly sample each of the arguments with 50% probability
                PUT_RANDOM_BYTE_IF_LUCKY(instruction.arguments.fourArgs.in1)
                PUT_RANDOM_BYTE_IF_LUCKY(instruction.arguments.fourArgs.in2)
                PUT_RANDOM_BYTE_IF_LUCKY(instruction.arguments.fourArgs.in3)
                PUT_RANDOM_BYTE_IF_LUCKY(instruction.arguments.fourArgs.out)
                break;
            case OPCODE::MSUB_DIV:
                PUT_RANDOM_BYTE_IF_LUCKY(instruction.arguments.multOpArgs.divisor_index)
            case OPCODE::MULT_MADD:
                if (rng.next() & 1) {
                    // Mutate pair count
                    instruction.arguments.multOpArgs.mult_pairs_count =
                        MULT_MADD_MINIMUM_MUL_PAIRS +
                        static_cast<uint8_t>(rng.next() % (MULT_MADD_MAXIMUM_MUL_PAIRS - MULT_MADD_MINIMUM_MUL_PAIRS));
                }
                if (rng.next() & 1) {
                    // Mutate added element count
                    instruction.arguments.multOpArgs.add_elements_count =
                        MULT_MADD_MINIMUM_ADDED_ELEMENTS +
                        static_cast<uint8_t>(rng.next() %
                                             (MULT_MADD_MAXIMUM_ADDED_ELEMENTS - MULT_MADD_MINIMUM_ADDED_ELEMENTS));
                }
                if (instruction.arguments.multOpArgs.mult_pairs_count && rng.next() & 1) {
                    // Mutate multiplication pairs
                    size_t mut_count = static_cast<uint8_t>(
                        rng.next() % (2 * (size_t)instruction.arguments.multOpArgs.mult_pairs_count));

                    for (size_t i = 0; i < mut_count; i++) {
                        auto ind = rng.next() % (2 * (size_t)instruction.arguments.multOpArgs.mult_pairs_count);
                        instruction.arguments.multOpArgs.mult_pairs[ind] = static_cast<uint8_t>(rng.next() & 0xff);
                    }
                }
                if (instruction.arguments.multOpArgs.add_elements_count && rng.next() & 1) {
                    // Mutate additions
                    size_t add_mut_count = static_cast<uint8_t>(
                        rng.next() % ((size_t)instruction.arguments.multOpArgs.add_elements_count));

                    for (size_t i = 0; i < add_mut_count; i++) {
                        instruction.arguments.multOpArgs
                            .add_elements[rng.next() % ((size_t)instruction.arguments.multOpArgs.add_elements_count)] =
                            static_cast<uint8_t>(rng.next() & 0xff);
                    }
                }
                PUT_RANDOM_BYTE_IF_LUCKY(instruction.arguments.multOpArgs.output_index)
                break;
            case OPCODE::SQR_ADD:
                if (rng.next() & 1) {
                    // Mutate added element count
                    instruction.arguments.multAddArgs.add_elements_count =
                        SQR_ADD_MINIMUM_ADDED_ELEMENTS +
                        static_cast<uint8_t>(rng.next() %
                                             (SQR_ADD_MAXIMUM_ADDED_ELEMENTS - SQR_ADD_MINIMUM_ADDED_ELEMENTS));
                }

                if (instruction.arguments.multAddArgs.add_elements_count && rng.next() & 1) {
                    // Mutate additions
                    size_t add_mut_count = static_cast<uint8_t>(
                        rng.next() % ((size_t)instruction.arguments.multAddArgs.add_elements_count));

                    for (size_t i = 0; i < add_mut_count; i++) {
                        instruction.arguments.multAddArgs
                            .add_elements[rng.next() % ((size_t)instruction.arguments.multAddArgs.add_elements_count)] =
                            static_cast<uint8_t>(rng.next() & 0xff);
                    }
                }
                PUT_RANDOM_BYTE_IF_LUCKY(instruction.arguments.multAddArgs.input_index)
                PUT_RANDOM_BYTE_IF_LUCKY(instruction.arguments.multAddArgs.output_index)
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
        static constexpr size_t CONSTANT = sizeof(bb::fq);
        static constexpr size_t WITNESS = sizeof(bb::fq);
        static constexpr size_t CONSTANT_WITNESS = sizeof(bb::fq);
        static constexpr size_t SQR = 2;
        static constexpr size_t ASSERT_EQUAL = 2;
        static constexpr size_t ASSERT_NOT_EQUAL = 2;
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
        static constexpr size_t MULT_MADD = sizeof(typename Instruction::MultOpArgs);
        static constexpr size_t MSUB_DIV = sizeof(typename Instruction::MultOpArgs);
        static constexpr size_t SQR_ADD = sizeof(typename Instruction::MultAddArgs);
        static constexpr size_t SUBTRACT_WITH_CONSTRAINT = static_cast<size_t>(-1);
        static constexpr size_t DIVIDE_WITH_CONSTRAINTS = static_cast<size_t>(-1);
        static constexpr size_t SLICE = static_cast<size_t>(-1);
        static constexpr size_t COND_NEGATE = 3;
        static constexpr size_t COND_SELECT = 4;
        static constexpr size_t SET = 2;
        static constexpr size_t RANDOMSEED = sizeof(uint32_t);
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
        static constexpr size_t ADD_TWO = 1;
#ifndef DISABLE_DIVISION
        static constexpr size_t DIVIDE = 16;
#endif
        static constexpr size_t MADD = 2;
        static constexpr size_t MULT_MADD = 3;
        static constexpr size_t MSUB_DIV = 3;
        static constexpr size_t SQR_ADD = 2;
        static constexpr size_t SUBTRACT_WITH_CONSTRAINT = 0;
        static constexpr size_t DIVIDE_WITH_CONSTRAINTS = 0;
        static constexpr size_t SLICE = 0;
        static constexpr size_t COND_NEGATE = 0;
        static constexpr size_t COND_SELECT = 0;
        static constexpr size_t SET = 0;
        static constexpr size_t RANDOMSEED = 0;
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
                instr.arguments.element.value = bb::fq::serialize_from_buffer(Data);
                return instr;
            };
            if constexpr (opcode == Instruction::OPCODE::RANDOMSEED) {
                Instruction instr;
                instr.id = static_cast<typename Instruction::OPCODE>(opcode);
                memcpy(&instr.arguments.randomseed, Data, sizeof(uint32_t));
                return instr;
            };
            if constexpr (opcode == Instruction::OPCODE::SQR || opcode == Instruction::OPCODE::ASSERT_EQUAL ||
                          opcode == Instruction::OPCODE::ASSERT_NOT_EQUAL || opcode == Instruction::OPCODE::SET) {
                return { .id = static_cast<typename Instruction::OPCODE>(opcode),
                         .arguments.twoArgs = { .in = *Data, .out = *(Data + 1) } };
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
                          opcode == Instruction::OPCODE::COND_SELECT) {

                return { .id = static_cast<typename Instruction::OPCODE>(opcode),
                         .arguments.fourArgs = {
                             .in1 = *Data, .in2 = *(Data + 1), .in3 = *(Data + 2), .out = *(Data + 3) } };
            }
            if constexpr (opcode == Instruction::OPCODE::MULT_MADD || opcode == Instruction::OPCODE::MSUB_DIV) {
                Instruction mult_madd_or_div;
                mult_madd_or_div.id = static_cast<typename Instruction::OPCODE>(opcode);
                memcpy(&mult_madd_or_div.arguments.multOpArgs, Data, sizeof(typename Instruction::MultOpArgs));
                mult_madd_or_div.arguments.multOpArgs.add_elements_count =
                    mult_madd_or_div.arguments.multOpArgs.add_elements_count % MULT_MADD_MAXIMUM_ADDED_ELEMENTS;

                if (mult_madd_or_div.arguments.multOpArgs.add_elements_count < MULT_MADD_MINIMUM_ADDED_ELEMENTS) {
                    mult_madd_or_div.arguments.multOpArgs.add_elements_count = MULT_MADD_MINIMUM_ADDED_ELEMENTS;
                }
                mult_madd_or_div.arguments.multOpArgs.mult_pairs_count =
                    mult_madd_or_div.arguments.multOpArgs.mult_pairs_count % MULT_MADD_MAXIMUM_MUL_PAIRS;

                if (mult_madd_or_div.arguments.multOpArgs.mult_pairs_count < MULT_MADD_MINIMUM_MUL_PAIRS) {
                    mult_madd_or_div.arguments.multOpArgs.mult_pairs_count = MULT_MADD_MINIMUM_MUL_PAIRS;
                }
                return mult_madd_or_div;
            }
            if constexpr (opcode == Instruction::OPCODE::SQR_ADD) {
                Instruction sqr_add;
                sqr_add.id = static_cast<typename Instruction::OPCODE>(opcode);
                memcpy(&sqr_add.arguments.multAddArgs, Data, sizeof(typename Instruction::MultAddArgs));
                sqr_add.arguments.multAddArgs.add_elements_count =
                    sqr_add.arguments.multAddArgs.add_elements_count % SQR_ADD_MAXIMUM_ADDED_ELEMENTS;

                if (sqr_add.arguments.multOpArgs.add_elements_count < SQR_ADD_MINIMUM_ADDED_ELEMENTS) {

                    sqr_add.arguments.multOpArgs.add_elements_count = SQR_ADD_MINIMUM_ADDED_ELEMENTS;
                }
                return sqr_add;
            }
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
                bb::fq::serialize_to_buffer(instruction.arguments.element.value, Data + 1);
            }

            if constexpr (instruction_opcode == Instruction::OPCODE::SQR ||
                          instruction_opcode == Instruction::OPCODE::ASSERT_EQUAL ||
                          instruction_opcode == Instruction::OPCODE::ASSERT_NOT_EQUAL ||
                          instruction_opcode == Instruction::OPCODE::SET) {
                *Data = instruction.id;
                *(Data + 1) = instruction.arguments.twoArgs.in;
                *(Data + 2) = instruction.arguments.twoArgs.out;
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
                          instruction_opcode == Instruction::OPCODE::COND_SELECT) {
                *Data = instruction.id;
                *(Data + 1) = instruction.arguments.fourArgs.in1;
                *(Data + 2) = instruction.arguments.fourArgs.in2;
                *(Data + 3) = instruction.arguments.fourArgs.in3;
                *(Data + 4) = instruction.arguments.fourArgs.out;
            }
            if constexpr (instruction_opcode == Instruction::OPCODE::MULT_MADD ||
                          instruction_opcode == Instruction::OPCODE::MSUB_DIV) {

                *Data = instruction.id;
                memcpy(Data + 1, &instruction.arguments.multOpArgs, sizeof(typename Instruction::MultOpArgs));
            }
            if constexpr (instruction_opcode == Instruction::OPCODE::SQR_ADD) {

                *Data = instruction.id;
                memcpy(Data + 1, &instruction.arguments.multAddArgs, sizeof(typename Instruction::MultAddArgs));
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
        static bool_t construct_predicate(Builder* builder, const bool predicate)
        {
            /* The context field of a predicate can be nullptr;
             * in that case, the function that handles the predicate
             * will use the context of another input parameter
             */
            const bool predicate_has_ctx = static_cast<bool>(VarianceRNG.next() % 2);

            return bool_t(predicate_has_ctx ? builder : nullptr, predicate);
        }
        bigfield_t bf() const
        {
            const bool reconstruct = static_cast<bool>(VarianceRNG.next() % 2);

#ifdef FUZZING_SHOW_INFORMATION
            std::cout << " reconstruction? " << reconstruct << std::endl;
#endif

            if (!reconstruct) {
                return this->bigfield;
            }

            return bigfield_t(this->bigfield);
        }
        uint256_t bf_u256(void) const
        {
            return static_cast<uint256_t>((this->bigfield.get_value() % uint512_t(bb::fq::modulus)).lo);
        }

      public:
        bb::fq base;
        bigfield_t bigfield;
        ExecutionHandler() = default;
        ExecutionHandler(bb::fq a, bigfield_t b)
            : base(a)
            , bigfield(b)
        {
            if (b.get_context() == nullptr) {
                abort();
            }
            if (b.get_value() > b.get_maximum_value()) {
                abort();
            }
            for (size_t i = 0; i < 4; i++) {
                auto limb = b.binary_basis_limbs[i];
                if (limb.maximum_value < limb.element.get_value()) {
                    info("LIMB ", i, " VALUE IS NOT PROPERLY RESTRICTED");
                    info(limb);
                    abort();
                }
            }
        }
        ExecutionHandler(bb::fq a, bigfield_t& b)
            : base(a)
            , bigfield(b)
        {
            if (b.get_context() == nullptr) {
                abort();
            }
            if (b.get_value() > b.get_maximum_value()) {
                abort();
            }
            for (auto& limb : b.binary_basis_limbs) {
                if (limb.maximum_value < limb.element.get_value()) {
                    abort();
                }
            }
        }
        ExecutionHandler(bb::fq& a, bigfield_t& b)
            : base(a)
            , bigfield(b)
        {
            if (b.get_context() == nullptr) {
                abort();
            }
            if (b.get_value() > b.get_maximum_value()) {
                abort();
            }
            for (auto& limb : b.binary_basis_limbs) {
                if (limb.maximum_value < limb.element.get_value()) {
                    abort();
                }
            }
        }
        ExecutionHandler operator+(const ExecutionHandler& other)
        {
            return ExecutionHandler(this->base + other.base, this->bf() + other.bf());
        }
        ExecutionHandler operator-(const ExecutionHandler& other)
        {
            return ExecutionHandler(this->base - other.base, this->bf() - other.bf());
        }
        ExecutionHandler operator*(const ExecutionHandler& other)
        {
            return ExecutionHandler(this->base * other.base, this->bf() * other.bf());
        }
        ExecutionHandler sqr() { return ExecutionHandler(this->base.sqr(), this->bf().sqr()); }
        ExecutionHandler operator/(const ExecutionHandler& other)
        {
            if (other.bf().get_value() == 0) {
                circuit_should_fail = true;
            }
            /* Avoid division by zero of the reference variable */
            const auto divisor = other.base != 0 ? other.base : 1;
            switch (VarianceRNG.next() % 3) {
            case 0:
                return ExecutionHandler(this->base / divisor, this->bf() / other.bf());
            case 1:
                return ExecutionHandler(this->base / divisor,
                                        bigfield_t::div_check_denominator_nonzero({ this->bf() }, other.bf()));
            case 2: {
                /* Construct 'numerators' such that its sum equals this->base */

                bb::fq v = 0;
                std::vector<bigfield_t> numerators;

                size_t numerators_size = std::max(bigfield_t::MAXIMUM_SUMMAND_COUNT / 2,
                                                  VarianceRNG.next() % bigfield_t::MAXIMUM_SUMMAND_COUNT);
                for (size_t i = 0; i < numerators_size && v != this->base; i++) {
                    uint256_t add;
                    if (i == numerators_size - 1) {
                        add = this->base - v;
                    } else {
                        add = fast_log_distributed_uint256(VarianceRNG) % (static_cast<uint256_t>(this->base - v) + 1);
                    }
                    numerators.push_back(bigfield_t(this->bigfield.context, bb::fq(add)));
                    v += add;
                }
                BB_ASSERT_EQ(v, this->base);

                return ExecutionHandler(this->base / divisor,
                                        /* Multi-numerator division */
                                        bigfield_t::div_check_denominator_nonzero(numerators, other.bf()));
            }
            default:
                abort();
            }
        }
        ExecutionHandler add_two(const ExecutionHandler& other1, const ExecutionHandler& other2)
        {
            return ExecutionHandler(this->base + other1.base + other2.base,
                                    this->bf().add_two(other1.bigfield, other2.bigfield));
        }
        ExecutionHandler madd(const ExecutionHandler& other1, const ExecutionHandler& other2)
        {

            return ExecutionHandler(this->base * other1.base + other2.base,
                                    this->bf().madd(other1.bigfield, { other2.bigfield }));
        }
        ExecutionHandler sqr_add(const std::vector<ExecutionHandler>& to_add)
        {
            std::vector<bigfield_t> to_add_bf;
            bb::fq accumulator = this->base.sqr();
            for (size_t i = 0; i < to_add.size(); i++) {
                to_add_bf.push_back(to_add[i].bigfield);
                accumulator += to_add[i].base;
            }
            return ExecutionHandler(accumulator, this->bf().sqradd(to_add_bf));
        }

        static ExecutionHandler mult_madd(const std::vector<ExecutionHandler>& input_left,
                                          const std::vector<ExecutionHandler>& input_right,
                                          const std::vector<ExecutionHandler>& to_add)
        {
            std::vector<bigfield_t> input_left_bf;
            std::vector<bigfield_t> input_right_bf;
            std::vector<bigfield_t> to_add_bf;
            bb::fq accumulator = bb::fq::zero();
            for (size_t i = 0; i < input_left.size(); i++) {
                input_left_bf.push_back(input_left[i].bigfield);
                input_right_bf.push_back(input_right[i].bigfield);
                accumulator += input_left[i].base * input_right[i].base;
            }
            for (size_t i = 0; i < to_add.size(); i++) {
                to_add_bf.push_back(to_add[i].bigfield);
                accumulator += to_add[i].base;
            }
            return ExecutionHandler(accumulator, bigfield_t::mult_madd(input_left_bf, input_right_bf, to_add_bf));
        }
        static ExecutionHandler msub_div(const std::vector<ExecutionHandler>& input_left,
                                         const std::vector<ExecutionHandler>& input_right,
                                         const ExecutionHandler& divisor,
                                         const std::vector<ExecutionHandler>& to_sub)
        {
            std::vector<bigfield_t> input_left_bf;
            std::vector<bigfield_t> input_right_bf;
            std::vector<bigfield_t> to_sub_bf;
            bb::fq accumulator = bb::fq::zero();
            for (size_t i = 0; i < input_left.size(); i++) {
                input_left_bf.push_back(input_left[i].bigfield);
                input_right_bf.push_back(input_right[i].bigfield);
                accumulator -= input_left[i].base * input_right[i].base;
            }
            for (size_t i = 0; i < to_sub.size(); i++) {
                to_sub_bf.push_back(to_sub[i].bigfield);
                accumulator -= to_sub[i].base;
            }
            /* Avoid division by zero of the reference variable */
            if (divisor.base != 0) {
                accumulator /= divisor.base;
            }
            const bool enable_divisor_nz_check = static_cast<bool>(VarianceRNG.next() % 2);
            return ExecutionHandler(
                accumulator,
                bigfield_t::msub_div(
                    input_left_bf, input_right_bf, divisor.bigfield, to_sub_bf, enable_divisor_nz_check));
        }
        // assert_equal uses assert_is_in_field in some cases, so we don't need to check that separately
        void assert_equal(ExecutionHandler& other)
        {
            if (other.bf().is_constant()) {
                if (this->bf().is_constant()) {
                    // Assert equal does nothing in this case
                    return;
                } else {
                    /* Operate on this->bigfield rather than this->bf() to prevent
                     * that assert_is_in_field is called on a different object than
                     * assert_equal.
                     *
                     * See also: https://github.com/AztecProtocol/aztec2-internal/issues/1242
                     */
                    this->bigfield.assert_is_in_field();
                    auto to_add = bigfield_t(this->bigfield.context, uint256_t(this->base - other.base));
                    this->bigfield.assert_equal(other.bf() + to_add);
                }
            } else {
                if (this->bf().is_constant()) {
                    auto to_add = bigfield_t(this->bf().context, uint256_t(this->base - other.base));
                    auto new_el = other.bf() + to_add;
                    new_el.assert_is_in_field();
                    this->bf().assert_equal(new_el);
                } else {
                    auto to_add = bigfield_t(this->bf().context, uint256_t(this->base - other.base));
                    this->bf().assert_equal(other.bf() + to_add);
                }
            }
        }

        void assert_not_equal(ExecutionHandler& other)
        {
            if (this->base == other.base) {
                return;
            } else {
                this->bf().assert_is_not_equal(other.bf());
            }
        }

        ExecutionHandler conditional_negate(Builder* builder, const bool predicate)
        {
            return ExecutionHandler(predicate ? -(this->base) : this->base,
                                    this->bf().conditional_negate(construct_predicate(builder, predicate)));
        }

        ExecutionHandler conditional_select(Builder* builder, ExecutionHandler& other, const bool predicate)
        {
            return ExecutionHandler(predicate ? other.base : this->base,
                                    this->bf().conditional_select(other.bf(), construct_predicate(builder, predicate)));
        }
        /* Explicit re-instantiation using the various bigfield_t constructors */
        ExecutionHandler set(Builder* builder)
        {
            /* Invariant check */
            if (this->bigfield.get_value() > this->bigfield.get_maximum_value()) {
                std::cerr << "bigfield value is larger than its maximum" << std::endl;
                abort();
            }

            uint32_t switch_case = VarianceRNG.next() % 5;

#ifdef FUZZING_SHOW_INFORMATION
            std::cout << " using " << switch_case << " constructor" << std::endl;
#endif
            switch (switch_case) {
            case 0:
                /* Construct via bigfield_t */
                return ExecutionHandler(this->base, bigfield_t(this->bigfield));
            case 1:
                /* Construct via uint256_t */
                return ExecutionHandler(this->base, bigfield_t(builder, bf_u256()));
            // case 2: // TODO(alex): Uncomment once fixed
            //     /* Construct via byte_array */
            //     /*
            //      * Bug: https://github.com/AztecProtocol/aztec2-internal/issues/1496
            //      *
            //      * Remove of change this invocation if that issue is a false positive */
            //     return ExecutionHandler(this->base, bigfield_t(this->bigfield.to_byte_array()));
            case 2: {
                const uint256_t u256 = bf_u256();
                const uint256_t u256_lo = u256.slice(0, bigfield_t::NUM_LIMB_BITS * 2);
                const uint256_t u256_hi = u256.slice(bigfield_t::NUM_LIMB_BITS * 2, bigfield_t::NUM_LIMB_BITS * 4);
                const field_t field_lo(builder, u256_lo);
                const field_t field_hi(builder, u256_hi);

                /* Construct via two field_t's */
                return ExecutionHandler(this->base, bigfield_t(field_lo, field_hi));
            }
            case 3: {
                /* Invoke assignment operator */

                bigfield_t bf_new(builder);
                bf_new = bf();

                return ExecutionHandler(this->base, bigfield_t(bf_new));
            }
            case 4: {
                /* Invoke move constructor */
                auto bf_copy = bf();

                return ExecutionHandler(this->base, bigfield_t(std::move(bf_copy)));
            }
            default:
                abort();
            }
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
            stack.push_back(ExecutionHandler(instruction.arguments.element.value,
                                             bigfield_t(builder, instruction.arguments.element.value)));
#ifdef FUZZING_SHOW_INFORMATION
            std::cout << "Pushed constant value " << instruction.arguments.element.value << " to position "
                      << stack.size() - 1 << std::endl;
#endif
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
                ExecutionHandler(instruction.arguments.element.value,
                                 bigfield_t::from_witness(builder, bb::fq(instruction.arguments.element.value))));
            // stack.push_back(
            //    bigfield_t::create_from_u512_as_witness(builder,
            //    uint256_t(instruction.arguments.element.value)));

#ifdef FUZZING_SHOW_INFORMATION
            std::cout << "Pushed witness value " << instruction.arguments.element.value << " to position "
                      << stack.size() - 1 << std::endl;
#endif
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
            stack.push_back(ExecutionHandler(
                instruction.arguments.element.value,
                bigfield_t::create_from_u512_as_witness(builder, uint256_t(instruction.arguments.element.value))));
#ifdef FUZZING_SHOW_INFORMATION
            std::cout << "Pushed constant witness value " << instruction.arguments.element.value << " to position "
                      << stack.size() - 1 << std::endl;
#endif
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

            PRINT_TWO_ARG_INSTRUCTION(first_index, second_index, stack, "Multiplying", "*")

            ExecutionHandler result;
            result = stack[first_index] * stack[second_index];
            // If the output index is larger than the number of elements in stack, append
            if (output_index >= stack.size()) {
                PRINT_RESULT("", "pushed to ", stack.size(), result)
                stack.push_back(result);
            } else {

                PRINT_RESULT("", "saved to ", output_index, result)
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

            PRINT_TWO_ARG_INSTRUCTION(first_index, second_index, stack, "Adding", "+")

            ExecutionHandler result;
            result = stack[first_index] + stack[second_index];
            // If the output index is larger than the number of elements in stack, append
            if (output_index >= stack.size()) {
                PRINT_RESULT("", "pushed to ", stack.size(), result)
                stack.push_back(result);
            } else {

                PRINT_RESULT("", "saved to ", output_index, result)
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

            PRINT_SINGLE_ARG_INSTRUCTION(first_index, stack, "Squaring", "squared")

            ExecutionHandler result;
            result = stack[first_index].sqr();
            // If the output index is larger than the number of elements in stack, append
            if (output_index >= stack.size()) {
                PRINT_RESULT("", "pushed to ", stack.size(), result)
                stack.push_back(result);
            } else {

                PRINT_RESULT("", "saved to ", output_index, result)
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

            PRINT_TWO_ARG_INSTRUCTION(first_index, second_index, stack, "ASSERT_EQUAL", "== something + ")
#ifdef FUZZING_SHOW_INFORMATION
            std::cout << std::endl;
#endif

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

            PRINT_TWO_ARG_INSTRUCTION(first_index, second_index, stack, "ASSERT_NOT_EQUAL", "!=")
#ifdef FUZZING_SHOW_INFORMATION
            std::cout << std::endl;
#endif

            // We have an assert that is triggered for this case
            if (stack[first_index].bigfield.is_constant() && stack[second_index].bigfield.is_constant()) {
                return 0;
            }
            stack[first_index].assert_not_equal(stack[second_index]);
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

            PRINT_TWO_ARG_INSTRUCTION(first_index, second_index, stack, "Subtracting", "-")

            ExecutionHandler result;
            result = stack[first_index] - stack[second_index];
            // If the output index is larger than the number of elements in stack, append
            if (output_index >= stack.size()) {
                PRINT_RESULT("", "pushed to ", stack.size(), result)
                stack.push_back(result);
            } else {

                PRINT_RESULT("", "saved to ", output_index, result)
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

            PRINT_TWO_ARG_INSTRUCTION(first_index, second_index, stack, "Dividing", "/")

            ExecutionHandler result;
            if (bb::fq((stack[second_index].bigfield.get_value() % bb::fq::modulus).lo) == 0) {
                return 0; // This is not handled by bigfield
            }
            // TODO: FIX THIS. I can't think of an elegant fix for this bigfield issue right now
            // if (bb::fq((stack[first_index].bigfield.get_value() % bb::fq::modulus).lo) == 0) {
            //     return 0;
            // }
            result = stack[first_index] / stack[second_index];
            // If the output index is larger than the number of elements .in stack, append
            if (output_index >= stack.size()) {
                PRINT_RESULT("", "pushed to ", stack.size(), result)
                stack.push_back(result);
            } else {

                PRINT_RESULT("", "saved to ", output_index, result)
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
            PRINT_THREE_ARG_INSTRUCTION(first_index, second_index, third_index, stack, "ADD_TWO:", "+", "+")

            ExecutionHandler result;
            result = stack[first_index].add_two(stack[second_index], stack[third_index]);
            // If the output index is larger than the number of elements in stack, append
            if (output_index >= stack.size()) {
                PRINT_RESULT("", "pushed to ", stack.size(), result)
                stack.push_back(result);
            } else {
                PRINT_RESULT("", "saved to ", output_index, result)
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
            PRINT_THREE_ARG_INSTRUCTION(first_index, second_index, third_index, stack, "MADD:", "*", "+")

            ExecutionHandler result;
            result = stack[first_index].madd(stack[second_index], stack[third_index]);
            // If the output index is larger than the number of elements in stack, append
            if (output_index >= stack.size()) {
                PRINT_RESULT("", "pushed to ", stack.size(), result)
                stack.push_back(result);
            } else {

                PRINT_RESULT("", "saved to ", output_index, result)
                stack[output_index] = result;
            }
            return 0;
        };
        /**
         * @brief Execute the MULT_MADD instruction
         *
         * @param builder
         * @param stack
         * @param instruction
         * @return if everything is ok, 1 if we should stop execution, since an expected error was encountered
        size_t
         */
        static inline size_t execute_MULT_MADD(Builder* builder,
                                               std::vector<ExecutionHandler>& stack,
                                               Instruction& instruction)
        {
            (void)builder;
            if (stack.size() == 0) {
                return 1;
            }
            std::vector<ExecutionHandler> input_left;
            std::vector<ExecutionHandler> input_right;
            std::vector<ExecutionHandler> to_add;
#ifdef FUZZING_SHOW_INFORMATION
            std::cout << "MULT_MADD:" << std::endl;
            for (size_t i = 0; i < instruction.arguments.multOpArgs.mult_pairs_count; i++) {
                size_t index_left = (size_t)instruction.arguments.multOpArgs.mult_pairs[2 * i] % stack.size();
                size_t index_right = (size_t)instruction.arguments.multOpArgs.mult_pairs[2 * i + 1] % stack.size();
                std::cout << (stack[index_left].bigfield.is_constant() ? "Constant( " : "Witness( ")
                          << stack[index_left].bigfield.get_value() << ") at " << index_left << " * ";
                std::cout << (stack[index_right].bigfield.is_constant() ? "Constant( " : "Witness( ")
                          << stack[index_right].bigfield.get_value() << ") at " << index_right;
                if (i == (instruction.arguments.multOpArgs.mult_pairs_count - 1) &&
                    instruction.arguments.multOpArgs.add_elements_count == 0) {
                    std::cout << std::endl;
                } else {
                    std::cout << " + " << std::endl;
                }
            }
            for (size_t i = 0; i < instruction.arguments.multOpArgs.add_elements_count; i++) {
                size_t add_index = (size_t)instruction.arguments.multOpArgs.add_elements[i] % stack.size();
                std::cout << (stack[add_index].bigfield.is_constant() ? "Constant( " : "Witness( ")
                          << stack[add_index].bigfield.get_value() << ") at " << add_index;
                if (i == (instruction.arguments.multOpArgs.add_elements_count - 1)) {
                    std::cout << std::endl;
                } else {
                    std::cout << " + " << std::endl;
                }
            }
#endif
            for (size_t i = 0; i < instruction.arguments.multOpArgs.mult_pairs_count; i++) {
                input_left.push_back(stack[(size_t)instruction.arguments.multOpArgs.mult_pairs[2 * i] % stack.size()]);
                input_right.push_back(
                    stack[(size_t)instruction.arguments.multOpArgs.mult_pairs[2 * i + 1] % stack.size()]);
            }

            for (size_t i = 0; i < instruction.arguments.multOpArgs.add_elements_count; i++) {
                auto element_index = (size_t)instruction.arguments.multOpArgs.add_elements[i] % stack.size();
                to_add.push_back(stack[element_index]);
            }
            size_t output_index = (size_t)instruction.arguments.multOpArgs.output_index;

            ExecutionHandler result;
            result = ExecutionHandler::mult_madd(input_left, input_right, to_add);
            // If the output index is larger than the number of elements in stack, append
            if (output_index >= stack.size()) {
                PRINT_RESULT("", "pushed to ", stack.size(), result)
                stack.push_back(result);
            } else {

                PRINT_RESULT("", "saved to ", output_index, result)
                stack[output_index] = result;
            }
            return 0;
        };

        /**
         * @brief Execute the MSUB_DIV instruction
         *
         * @param builder
         * @param stack
         * @param instruction
         * @return if everything is ok, 1 if we should stop execution, since an expected error was encountered
        size_t
         */
        static inline size_t execute_MSUB_DIV(Builder* builder,
                                              std::vector<ExecutionHandler>& stack,
                                              Instruction& instruction)
        {
            (void)builder;
            if (stack.size() == 0) {
                return 1;
            }
            std::vector<ExecutionHandler> input_left;
            std::vector<ExecutionHandler> input_right;
            std::vector<ExecutionHandler> to_sub;
            size_t divisor_index = instruction.arguments.multOpArgs.divisor_index % stack.size();
#ifdef FUZZING_SHOW_INFORMATION

            std::cout << "MSUB_DIV:" << std::endl;
            std::cout << "- (";
            for (size_t i = 0; i < instruction.arguments.multOpArgs.mult_pairs_count; i++) {
                size_t index_left = (size_t)instruction.arguments.multOpArgs.mult_pairs[2 * i] % stack.size();
                size_t index_right = (size_t)instruction.arguments.multOpArgs.mult_pairs[2 * i + 1] % stack.size();
                std::cout << (stack[index_left].bigfield.is_constant() ? "Constant( " : "Witness( ")
                          << stack[index_left].bigfield.get_value() << ") at " << index_left << " * ";
                std::cout << (stack[index_right].bigfield.is_constant() ? "Constant( " : "Witness( ")
                          << stack[index_right].bigfield.get_value() << ") at " << index_right;
                if (i == (instruction.arguments.multOpArgs.mult_pairs_count - 1) &&
                    instruction.arguments.multOpArgs.add_elements_count == 0) {
                    std::cout << std::endl;
                } else {
                    std::cout << " + " << std::endl;
                }
            }
            for (size_t i = 0; i < instruction.arguments.multOpArgs.add_elements_count; i++) {
                size_t add_index = (size_t)instruction.arguments.multOpArgs.add_elements[i] % stack.size();
                std::cout << (stack[add_index].bigfield.is_constant() ? "Constant( " : "Witness( ")
                          << stack[add_index].bigfield.get_value() << ") at " << add_index;
                if (i == (instruction.arguments.multOpArgs.add_elements_count - 1)) {
                    std::cout << std::endl;
                } else {
                    std::cout << " + " << std::endl;
                }
            }
            std::cout << ") / " << std::endl;
            std::cout << (stack[divisor_index].bigfield.is_constant() ? "Constant( " : "Witness( ")
                      << stack[divisor_index].bigfield.get_value() << ") at " << divisor_index << std::endl;

#endif
            if (bb::fq((stack[divisor_index].bigfield.get_value() % bb::fq::modulus).lo) == 0) {
                return 0; // This is not handled by bigfield by default, need to enable check
            }
            for (size_t i = 0; i < instruction.arguments.multOpArgs.mult_pairs_count; i++) {
                input_left.push_back(stack[(size_t)instruction.arguments.multOpArgs.mult_pairs[2 * i] % stack.size()]);
                input_right.push_back(
                    stack[(size_t)instruction.arguments.multOpArgs.mult_pairs[2 * i + 1] % stack.size()]);
            }

            for (size_t i = 0; i < instruction.arguments.multOpArgs.add_elements_count; i++) {
                auto element_index = (size_t)instruction.arguments.multOpArgs.add_elements[i] % stack.size();
                to_sub.push_back(stack[element_index]);
            }
            size_t output_index = (size_t)instruction.arguments.multOpArgs.output_index;

            ExecutionHandler result;
            result = ExecutionHandler::msub_div(input_left, input_right, stack[divisor_index], to_sub);
            // If the output index is larger than the number of elements in stack, append
            if (output_index >= stack.size()) {
                PRINT_RESULT("", "pushed to ", stack.size(), result)
                stack.push_back(result);
            } else {

                PRINT_RESULT("", "saved to ", output_index, result)
                stack[output_index] = result;
            }
            return 0;
        };

        /**
         * @brief Execute the SQR_ADD instruction
         *
         * @param builder
         * @param stack
         * @param instruction
         * @return if everything is ok, 1 if we should stop execution, since an expected error was encountered
        size_t
         */
        static inline size_t execute_SQR_ADD(Builder* builder,
                                             std::vector<ExecutionHandler>& stack,
                                             Instruction& instruction)
        {
            (void)builder;
            if (stack.size() == 0) {
                return 1;
            }
            std::vector<ExecutionHandler> to_add;

            size_t input_index = (size_t)instruction.arguments.multAddArgs.input_index % stack.size();
#ifdef FUZZING_SHOW_INFORMATION
            std::cout << "SQR_ADD:" << std::endl;
            std::cout << (stack[input_index].bigfield.is_constant() ? "Constant( " : "Witness( ")
                      << stack[input_index].bigfield.get_value() << ") at " << input_index << " squared ";
            if (instruction.arguments.multAddArgs.add_elements_count == 0) {
                std::cout << std::endl;
            } else {
                std::cout << "+" << std::endl;
            }

            for (size_t i = 0; i < instruction.arguments.multAddArgs.add_elements_count; i++) {
                size_t add_index = (size_t)instruction.arguments.multAddArgs.add_elements[i] % stack.size();
                std::cout << (stack[add_index].bigfield.is_constant() ? "Constant( " : "Witness( ")
                          << stack[add_index].bigfield.get_value() << ") at " << add_index;
                if (i == (instruction.arguments.multOpArgs.add_elements_count - 1)) {
                    std::cout << std::endl;
                } else {
                    std::cout << " + " << std::endl;
                }
            }
#endif

            for (size_t i = 0; i < instruction.arguments.multAddArgs.add_elements_count; i++) {
                auto element_index = (size_t)instruction.arguments.multAddArgs.add_elements[i] % stack.size();
                to_add.push_back(stack[element_index]);
            }
            size_t output_index = (size_t)instruction.arguments.multAddArgs.output_index;

            ExecutionHandler result;
            result = stack[input_index].sqr_add(to_add);
            // If the output index is larger than the number of elements in stack, append
            if (output_index >= stack.size()) {
                PRINT_RESULT("", "pushed to ", stack.size(), result)
                stack.push_back(result);
            } else {

                PRINT_RESULT("", "saved to ", output_index, result)
                stack[output_index] = result;
            }
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

            PRINT_SINGLE_ARG_INSTRUCTION(first_index, stack, "Negating", "is negated " + std::to_string(predicate))

            ExecutionHandler result;
            result = stack[first_index].conditional_negate(builder, predicate);
            // If the output index is larger than the number of elements in stack, append
            if (output_index >= stack.size()) {
                PRINT_RESULT("", "pushed to ", stack.size(), result)
                stack.push_back(result);
            } else {

                PRINT_RESULT("", "saved to ", output_index, result)
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

            ExecutionHandler result;

            PRINT_TWO_ARG_INSTRUCTION(
                first_index, second_index, stack, "Selecting #" + std::to_string(predicate) + " from", ", ")

            result = stack[first_index].conditional_select(builder, stack[second_index], predicate);
            // If the output index is larger than the number of elements in stack, append
            if (output_index >= stack.size()) {
                PRINT_RESULT("", "pushed to ", stack.size(), result)
                stack.push_back(result);
            } else {

                PRINT_RESULT("", "saved to ", output_index, result)
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
            ExecutionHandler result;

            PRINT_SINGLE_ARG_INSTRUCTION(first_index, stack, "Setting value", "")

            result = stack[first_index].set(builder);
            // If the output index is larger than the number of elements in stack, append
            if (output_index >= stack.size()) {
                PRINT_RESULT("", "pushed to ", stack.size(), result)
                stack.push_back(result);
            } else {
                PRINT_RESULT("", "saved to ", stack.size(), result)
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
    };

    /** For bigfield execution state is just a vector of ExecutionHandler objects
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
    inline static bool postProcess(Builder* builder, std::vector<BigFieldBase::ExecutionHandler>& stack)
    {
        (void)builder;
        for (size_t i = 0; i < stack.size(); i++) {
            auto element = stack[i];
            if (bb::fq((element.bigfield.get_value() % uint512_t(bb::fq::modulus)).lo) != element.base) {
                std::cerr << "Failed at " << i << " with actual value " << element.base << " and value in bigfield "
                          << element.bigfield.get_value() << std::endl;
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
    // These are the settings, optimized for the safeuint class (under them, fuzzer reaches maximum expected
    // coverage in 40 seconds)
    fuzzer_havoc_settings = HavocSettings{ .GEN_LLVM_POST_MUTATION_PROB = 30,          // Out of 200
                                           .GEN_MUTATION_COUNT_LOG = 5,                // -Fully checked
                                           .GEN_STRUCTURAL_MUTATION_PROBABILITY = 300, // Fully  checked
                                           .GEN_VALUE_MUTATION_PROBABILITY = 700,      // Fully checked
                                           .ST_MUT_DELETION_PROBABILITY = 100,         // Fully checked
                                           .ST_MUT_DUPLICATION_PROBABILITY = 80,       // Fully checked
                                           .ST_MUT_INSERTION_PROBABILITY = 120,        // Fully checked
                                           .ST_MUT_MAXIMUM_DELETION_LOG = 6,           // 2 because of limit
                                           .ST_MUT_MAXIMUM_DUPLICATION_LOG = 2,        // -Fully checked
                                           .ST_MUT_SWAP_PROBABILITY = 50,              // Fully checked
                                           .VAL_MUT_LLVM_MUTATE_PROBABILITY = 250,     // Fully checked
                                           .VAL_MUT_MONTGOMERY_PROBABILITY = 130,      // Fully checked
                                           .VAL_MUT_NON_MONTGOMERY_PROBABILITY = 50,   // Fully checked
                                           .VAL_MUT_SMALL_ADDITION_PROBABILITY = 110,  // Fully checked
                                           .VAL_MUT_SPECIAL_VALUE_PROBABILITY = 130,   // Fully checked
                                           .structural_mutation_distribution = {},
                                           .value_mutation_distribution = {} };
    /**
     * @brief This is used, when we need to determine the probabilities of various mutations. Left here for
     * posterity
     *
     */
    /*
    std::random_device rd;
    std::uniform_int_distribution<uint64_t> dist(0, ~(uint64_t)(0));
    srandom(static_cast<unsigned int>(dist(rd)));

    fuzzer_havoc_settings =
        HavocSettings{ .GEN_MUTATION_COUNT_LOG = static_cast<size_t>((random() % 8) + 1),
                       .GEN_STRUCTURAL_MUTATION_PROBABILITY = static_cast<size_t>(random() % 100),
                       .GEN_VALUE_MUTATION_PROBABILITY = static_cast<size_t>(random() % 100),
                       .ST_MUT_DELETION_PROBABILITY = static_cast<size_t>(random() % 100),
                       .ST_MUT_DUPLICATION_PROBABILITY = static_cast<size_t>(random() % 100),
                       .ST_MUT_INSERTION_PROBABILITY = static_cast<size_t>((random() % 99) + 1),
                       .ST_MUT_MAXIMUM_DELETION_LOG = static_cast<size_t>((random() % 8) + 1),
                       .ST_MUT_MAXIMUM_DUPLICATION_LOG = static_cast<size_t>((random() % 8) + 1),
                       .ST_MUT_SWAP_PROBABILITY = static_cast<size_t>(random() % 100),
                       .VAL_MUT_LLVM_MUTATE_PROBABILITY = static_cast<size_t>(random() % 100),
                       .VAL_MUT_MONTGOMERY_PROBABILITY = static_cast<size_t>(random() % 100),
                       .VAL_MUT_NON_MONTGOMERY_PROBABILITY = static_cast<size_t>(random() % 100),
                       .VAL_MUT_SMALL_ADDITION_PROBABILITY = static_cast<size_t>(random() % 100),
                       .VAL_MUT_SPECIAL_VALUE_PROBABILITY = static_cast<size_t>(random() % 100)

        };
    while (fuzzer_havoc_settings.GEN_STRUCTURAL_MUTATION_PROBABILITY == 0 &&
           fuzzer_havoc_settings.GEN_VALUE_MUTATION_PROBABILITY == 0) {
        fuzzer_havoc_settings.GEN_STRUCTURAL_MUTATION_PROBABILITY = static_cast<size_t>(random() % 8);
        fuzzer_havoc_settings.GEN_VALUE_MUTATION_PROBABILITY = static_cast<size_t>(random() % 8);
    }
    */

    // fuzzer_havoc_settings.GEN_LLVM_POST_MUTATION_PROB = static_cast<size_t>(((random() % (20 - 1)) + 1) * 10);
    /**
     * @brief Write mutation settings to log
     *
     */
    /*
    std::cerr << "CUSTOM MUTATOR SETTINGS:" << std::endl
              << "################################################################" << std::endl
              << "GEN_LLVM_POST_MUTATION_PROB: " << fuzzer_havoc_settings.GEN_LLVM_POST_MUTATION_PROB << std::endl
              << "GEN_MUTATION_COUNT_LOG: " << fuzzer_havoc_settings.GEN_MUTATION_COUNT_LOG << std::endl
              << "GEN_STRUCTURAL_MUTATION_PROBABILITY: " <<
    fuzzer_havoc_settings.GEN_STRUCTURAL_MUTATION_PROBABILITY
              << std::endl
              << "GEN_VALUE_MUTATION_PROBABILITY: " << fuzzer_havoc_settings.GEN_VALUE_MUTATION_PROBABILITY <<
    std::endl
              << "ST_MUT_DELETION_PROBABILITY: " << fuzzer_havoc_settings.ST_MUT_DELETION_PROBABILITY << std::endl
              << "ST_MUT_DUPLICATION_PROBABILITY: " << fuzzer_havoc_settings.ST_MUT_DUPLICATION_PROBABILITY <<
    std::endl
              << "ST_MUT_INSERTION_PROBABILITY: " << fuzzer_havoc_settings.ST_MUT_INSERTION_PROBABILITY << std::endl
              << "ST_MUT_MAXIMUM_DELETION_LOG: " << fuzzer_havoc_settings.ST_MUT_MAXIMUM_DELETION_LOG << std::endl
              << "ST_MUT_MAXIMUM_DUPLICATION_LOG: " << fuzzer_havoc_settings.ST_MUT_MAXIMUM_DUPLICATION_LOG <<
    std::endl
              << "ST_MUT_SWAP_PROBABILITY: " << fuzzer_havoc_settings.ST_MUT_SWAP_PROBABILITY << std::endl
              << "VAL_MUT_LLVM_MUTATE_PROBABILITY: " << fuzzer_havoc_settings.VAL_MUT_LLVM_MUTATE_PROBABILITY
              << std::endl
              << "VAL_MUT_MONTGOMERY_PROBABILITY: " << fuzzer_havoc_settings.VAL_MUT_MONTGOMERY_PROBABILITY <<
    std::endl
              << "VAL_MUT_NON_MONTGOMERY_PROBABILITY: " << fuzzer_havoc_settings.VAL_MUT_NON_MONTGOMERY_PROBABILITY
              << std::endl
              << "VAL_MUT_SMALL_ADDITION_PROBABILITY: " << fuzzer_havoc_settings.VAL_MUT_SMALL_ADDITION_PROBABILITY
              << std::endl
              << "VAL_MUT_SMALL_MULTIPLICATION_PROBABILITY: "
              << fuzzer_havoc_settings.VAL_MUT_SMALL_MULTIPLICATION_PROBABILITY << std::endl
              << "VAL_MUT_SPECIAL_VALUE_PROBABILITY: " << fuzzer_havoc_settings.VAL_MUT_SPECIAL_VALUE_PROBABILITY
              << std::endl;
    */
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
    RunWithBuilders<BigFieldBase, FuzzerCircuitTypes>(Data, Size, VarianceRNG);
    return 0;
}

#pragma clang diagnostic pop

// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/stdlib/primitives/group/cycle_group.hpp"
#pragma clang diagnostic push

// -Wc99-designator prevents us from using designators and nested designators
// in struct intializations
// such as {.in.first = a, .out = b}, since it's not a part of c++17 standard
// However the use of them in this particular file heavily increases
// the readability and conciseness of the CycleGroupBase::Instruction initializations
#pragma clang diagnostic ignored "-Wc99-designator"

#define HAVOC_TESTING

// This is a global variable, so that the execution handling class could alter it and signal to the input tester
// that the input should fail
bool circuit_should_fail = false;

#include "barretenberg/common/fuzzer.hpp"

// #define FUZZING_SHOW_INFORMATION

// #define DISABLE_MULTIPLICATION
// #define DISABLE_BATCH_MUL

#ifdef FUZZING_SHOW_INFORMATION
#define PREP_SINGLE_ARG(stack, first_index, output_index)                                                              \
    std::string rhs = stack[first_index].cycle_group.is_constant() ? "c" : "w";                                        \
    std::string out = rhs;                                                                                             \
    rhs += std::to_string(first_index);                                                                                \
    out += std::to_string(output_index >= stack.size() ? stack.size() : output_index);                                 \
    out = (output_index >= stack.size() ? "auto " : "") + out;

#define PREP_TWO_ARG(stack, first_index, second_index, output_index)                                                   \
    std::string lhs = stack[first_index].cycle_group.is_constant() ? "c" : "w";                                        \
    std::string rhs = stack[second_index].cycle_group.is_constant() ? "c" : "w";                                       \
    std::string out =                                                                                                  \
        (stack[first_index].cycle_group.is_constant() && stack[second_index].cycle_group.is_constant()) ? "c" : "w";   \
    lhs += std::to_string(first_index);                                                                                \
    rhs += std::to_string(second_index);                                                                               \
    out += std::to_string(output_index >= stack.size() ? stack.size() : output_index);                                 \
    out = (output_index >= stack.size() ? "auto " : "") + out;

#endif

FastRandom VarianceRNG(0);

constexpr size_t MINIMUM_MUL_ELEMENTS = 0;
constexpr size_t MAXIMUM_MUL_ELEMENTS = 8;

// This is an external function in Libfuzzer used internally by custom mutators
extern "C" size_t LLVMFuzzerMutate(uint8_t* Data, size_t Size, size_t MaxSize);

/**
 * @brief The class parametrizing CycleGroup fuzzing instructions, execution, etc
 */
template <typename Builder> class CycleGroupBase {
  private:
    using bool_t = typename bb::stdlib::bool_t<Builder>;
    using field_t = typename bb::stdlib::field_t<Builder>;
    using witness_t = typename bb::stdlib::witness_t<Builder>;
    using public_witness_t = typename bb::stdlib::public_witness_t<Builder>;
    using cycle_group_t = typename bb::stdlib::cycle_group<Builder>;
    using cycle_scalar_t = typename cycle_group_t::cycle_scalar;
    using Curve = typename bb::stdlib::cycle_group<Builder>::Curve;
    using GroupElement = typename Curve::Element;
    using AffineElement = typename Curve::AffineElement;
    using ScalarField = typename Curve::ScalarField;
    using BaseField = typename Curve::BaseField;

  public:
    class Instruction {
      public:
        enum OPCODE {
            CONSTANT,
            WITNESS,
            CONSTANT_WITNESS,
            ASSERT_EQUAL,
            COND_ASSIGN,
            SET,
            SET_INF,
            ADD,
            SUBTRACT,
            NEG,
            DBL,
#ifndef DISABLE_MULTIPLICATION
            MULTIPLY,
#endif
#ifndef DISABLE_BATCH_MUL
            BATCH_MUL,
#endif
            RANDOMSEED,
            _LAST
        };

        struct Element {
            Element(ScalarField s = ScalarField::one(), GroupElement g = GroupElement::one())
                : scalar(s)
                , value(g){};
            ScalarField scalar;
            GroupElement value;
        };

        struct TwoArgs {
            uint8_t in;
            uint8_t out;
        };

        struct MulArgs {
            uint8_t in;
            uint8_t out;
            ScalarField scalar;
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

        struct BatchMulArgs {
            uint8_t inputs[MAXIMUM_MUL_ELEMENTS];
            ScalarField scalars[MAXIMUM_MUL_ELEMENTS];
            uint8_t add_elements_count = 0;
            uint8_t output_index;
        };

        struct ArgumentContents {
            ArgumentContents()
                : randomseed(0){};
            uint32_t randomseed;
            Element element;
            TwoArgs twoArgs;
            MulArgs mulArgs;
            ThreeArgs threeArgs;
            BatchMulArgs batchMulArgs;
            FourArgs fourArgs;
        };

        // The type of the instruction
        OPCODE id;

        // Instruction arguments
        ArgumentContents arguments;

        // Sample a uint256_t value from log distribution
        // That is we first sample the bit count in [0..255]
        // And then shrink the random [0..2^255] value
        // This helps to get smaller values more frequently
        template <typename T> static inline uint256_t fast_log_distributed_uint256(T& rng)
        {
            uint256_t temp;
            // Generate a random mask_size-bit value
            // We want to sample from log distribution instead of uniform
            uint16_t* p = (uint16_t*)&temp;
            uint8_t mask_size = static_cast<uint8_t>(rng.next() & 0xff);
            for (size_t i = 0; i < 16; i++) {
                *(p + i) = static_cast<uint16_t>(rng.next() & 0xffff);
            }
            uint256_t mask = (uint256_t(1) << mask_size) - 1;
            temp &= mask;
            temp += 1; // I believe we want to avoid lots of infs
            return temp;
        }

        /**
         * @brief Generates a random instruction
         *
         * @tparam T PRNG class type
         * @param rng PRNG used
         * @return Instruction
         */
        template <typename T>
        inline static Instruction generateRandom(T& rng)
            requires SimpleRng<T>
        {
            OPCODE instruction_opcode = static_cast<OPCODE>(rng.next() % (OPCODE::_LAST));
            uint8_t in, in1, in2, in3, out;
            Instruction instr;

            switch (instruction_opcode) {
            case OPCODE::CONSTANT:
            case OPCODE::WITNESS:
            case OPCODE::CONSTANT_WITNESS: {
                auto scalar = ScalarField(static_cast<uint64_t>(Instruction::fast_log_distributed_uint256(rng)));
                auto el = GroupElement::one() * scalar;
                return { .id = instruction_opcode, .arguments.element = Element(scalar, el) };
            }
            case OPCODE::DBL:
            case OPCODE::NEG:
            case OPCODE::ASSERT_EQUAL:
            case OPCODE::SET:
            case OPCODE::SET_INF:
                in = static_cast<uint8_t>(rng.next() & 0xff);
                out = static_cast<uint8_t>(rng.next() & 0xff);
                return { .id = instruction_opcode, .arguments.twoArgs = { .in = in, .out = out } };
            case OPCODE::ADD:
            case OPCODE::SUBTRACT:
                in1 = static_cast<uint8_t>(rng.next() & 0xff);
                in2 = static_cast<uint8_t>(rng.next() & 0xff);
                out = static_cast<uint8_t>(rng.next() & 0xff);
                return { .id = instruction_opcode,
                         .arguments.threeArgs.in1 = in1,
                         .arguments.threeArgs.in2 = in2,
                         .arguments.threeArgs.out = out };
            case OPCODE::COND_ASSIGN:
                in1 = static_cast<uint8_t>(rng.next() & 0xff);
                in2 = static_cast<uint8_t>(rng.next() & 0xff);
                in3 = static_cast<uint8_t>(rng.next() & 0xff);
                out = static_cast<uint8_t>(rng.next() & 0xff);
                return { .id = instruction_opcode,
                         .arguments.fourArgs.in1 = in1,
                         .arguments.fourArgs.in2 = in2,
                         .arguments.fourArgs.in3 = in3,
                         .arguments.fourArgs.out = out };
#ifndef DISABLE_MULTIPLICATION
            case OPCODE::MULTIPLY:
                in = static_cast<uint8_t>(rng.next() & 0xff);
                out = static_cast<uint8_t>(rng.next() & 0xff);
                return { .id = instruction_opcode,
                         .arguments.mulArgs.scalar = ScalarField(Instruction::fast_log_distributed_uint256(rng)),
                         .arguments.mulArgs.in = in,
                         .arguments.mulArgs.out = out };
#endif
#ifndef DISABLE_BATCH_MUL
            case OPCODE::BATCH_MUL: {
                uint8_t mult_size0 =
                    MINIMUM_MUL_ELEMENTS +
                    static_cast<uint8_t>(rng.next() % ((MAXIMUM_MUL_ELEMENTS - MINIMUM_MUL_ELEMENTS) / 2));
                uint8_t mult_size1 =
                    MINIMUM_MUL_ELEMENTS +
                    static_cast<uint8_t>(rng.next() % ((MAXIMUM_MUL_ELEMENTS - MINIMUM_MUL_ELEMENTS) / 2));
                uint8_t mult_size =
                    mult_size0 +
                    mult_size1; // Sample the amount of batch mul participants from the binomial distribution
                instr.id = instruction_opcode;
                instr.arguments.batchMulArgs.add_elements_count = mult_size;
                for (size_t i = 0; i < mult_size; i++) {
                    instr.arguments.batchMulArgs.inputs[i] = static_cast<uint8_t>(rng.next() & 0xff);
                }
                for (size_t i = 0; i < mult_size; i++) {
                    instr.arguments.batchMulArgs.scalars[i] =
                        ScalarField(Instruction::fast_log_distributed_uint256(rng));
                }
                instr.arguments.batchMulArgs.output_index = static_cast<uint8_t>(rng.next() & 0xff);
                return instr;
            }
#endif
            case OPCODE::RANDOMSEED:
                return { .id = instruction_opcode, .arguments.randomseed = rng.next() * rng.next() };

            default:
                abort(); // We missed some instructions in switch
            }
        }

        /**
         * @brief Mutate the value of a group element
         *
         * @tparam T PRNG class
         * @param e Initial element value
         * @param rng PRNG
         * @param havoc_config Mutation configuration
         * @return Mutated element
         */
        template <typename T>
        inline static Element mutateGroupElement(Element e, T& rng, HavocSettings& havoc_config)
            requires SimpleRng<T>
        {
            // We can't just randomely modify a point on a curve
            // But we can modify it's scalar
            // With a certain probability, we apply changes to the Montgomery form, rather than the plain form. This
            // has merit, since the computation is performed in montgomery form and comparisons are often performed
            // in it, too.
            // By the same logic we can switch between Jacobian and Affine coordinates.
            // Libfuzzer comparison tracing logic can then be enabled in Montgomery form
            bool convert_to_montgomery = (rng.next() % (havoc_config.VAL_MUT_MONTGOMERY_PROBABILITY +
                                                        havoc_config.VAL_MUT_NON_MONTGOMERY_PROBABILITY)) <
                                         havoc_config.VAL_MUT_MONTGOMERY_PROBABILITY;
            bool normalize = (rng.next() % (havoc_config.VAL_MUT_MONTGOMERY_PROBABILITY +
                                            havoc_config.VAL_MUT_NON_MONTGOMERY_PROBABILITY)) <
                             havoc_config.VAL_MUT_MONTGOMERY_PROBABILITY;
            uint256_t value_data;
            // Conversion at the start
#define MONT_CONVERSION                                                                                                \
    if (convert_to_montgomery) {                                                                                       \
        value_data = uint256_t(e.scalar.to_montgomery_form());                                                         \
    } else {                                                                                                           \
        value_data = uint256_t(e.scalar);                                                                              \
    }
            // Inverse conversion at the end
#define INV_MONT_CONVERSION                                                                                            \
    if (convert_to_montgomery) {                                                                                       \
        e.scalar = ScalarField(value_data).from_montgomery_form();                                                     \
    } else {                                                                                                           \
        e.scalar = ScalarField(value_data);                                                                            \
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
                e.value = GroupElement::one() * e.scalar;
            } else if (choice < havoc_config.value_mutation_distribution[1]) {
                // Small addition/subtraction
                if (convert_to_montgomery) {
                    e.scalar = e.scalar.to_montgomery_form();
                }
                auto extra = ScalarField(rng.next() & 0xff);

                // With 50% probability we add/sub a small value
                if (rng.next() & 1) {
                    auto switch_sign = static_cast<bool>(rng.next() & 1);
                    if (!switch_sign) {
                        e.scalar += extra;
                        e.value += GroupElement::one() * extra;
                    } else {
                        e.scalar -= extra;
                        e.value -= GroupElement::one() * extra;
                    }
                } else {
                    // otherwise we multiply by a small value
                    e.scalar *= extra;
                    e.value *= extra;
                }
                if (normalize) {
                    e.value = e.value.normalize();
                }
                if (convert_to_montgomery) {
                    e.scalar = e.scalar.from_montgomery_form();
                }
            } else if (choice < havoc_config.value_mutation_distribution[2]) {
                if (convert_to_montgomery) {
                    e.scalar = e.scalar.to_montgomery_form();
                }
                // Substitute scalar element with a special value
                switch (rng.next() % 8) {
                case 0:
                    e.scalar = ScalarField::zero();
                    break;
                case 1:
                    e.scalar = ScalarField::one();
                    break;
                case 2:
                    e.scalar = -ScalarField::one();
                    break;
                case 3:
                    e.scalar = ScalarField::one().sqrt().second;
                    break;
                case 4:
                    e.scalar = ScalarField::one().sqrt().second.invert();
                    break;
                case 5:
                    e.scalar = ScalarField::get_root_of_unity(13);
                    break;
                case 6:
                    e.scalar = ScalarField(2);
                    break;
                case 7:
                    e.scalar = ScalarField((ScalarField::modulus - 1) / 2);
                    break;
                default:
                    abort();
                    break;
                }
                if (convert_to_montgomery) {
                    e.scalar = e.scalar.to_montgomery_form();
                }
                e.value = GroupElement::one() * e.scalar;
            }
            // Return value
            return e;
        }
        /**
         * @brief Mutate the value of a scalar element
         *
         * @tparam T PRNG class
         * @param e Initial scalar value
         * @param rng PRNG
         * @param havoc_config Mutation configuration
         * @return Mutated element
         */
        template <typename T>
        inline static ScalarField mutateScalarElement(ScalarField e, T& rng, HavocSettings& havoc_config)
            requires SimpleRng<T>
        {
            // With a certain probability, we apply changes to the Montgomery form, rather than the plain form. This
            // has merit, since the computation is performed in montgomery form and comparisons are often performed
            // in it, too.
            // Libfuzzer comparison tracing logic can then be enabled in Montgomery form
            bool convert_to_montgomery = (rng.next() % (havoc_config.VAL_MUT_MONTGOMERY_PROBABILITY +
                                                        havoc_config.VAL_MUT_NON_MONTGOMERY_PROBABILITY)) <
                                         havoc_config.VAL_MUT_MONTGOMERY_PROBABILITY;
            uint256_t value_data;
            // Conversion at the start
#define MONT_CONVERSION_SCALAR                                                                                         \
    if (convert_to_montgomery) {                                                                                       \
        value_data = uint256_t(e.to_montgomery_form());                                                                \
    } else {                                                                                                           \
        value_data = uint256_t(e);                                                                                     \
    }
            // Inverse conversion at the end
#define INV_MONT_CONVERSION_SCALAR                                                                                     \
    if (convert_to_montgomery) {                                                                                       \
        e = ScalarField(value_data).from_montgomery_form();                                                            \
    } else {                                                                                                           \
        e = ScalarField(value_data);                                                                                   \
    }

            // Pick the last value from the mutation distrivution vector
            const size_t mutation_type_count = havoc_config.value_mutation_distribution.size();
            // Choose mutation
            const size_t choice = rng.next() % havoc_config.value_mutation_distribution[mutation_type_count - 1];
            if (choice < havoc_config.value_mutation_distribution[0]) {
                // Delegate mutation to libfuzzer (bit/byte mutations, autodictionary, etc)
                MONT_CONVERSION_SCALAR
                LLVMFuzzerMutate((uint8_t*)&value_data, sizeof(uint256_t), sizeof(uint256_t));
                INV_MONT_CONVERSION_SCALAR
            } else if (choice < havoc_config.value_mutation_distribution[1]) {
                // Small addition/subtraction
                if (convert_to_montgomery) {
                    e = e.to_montgomery_form();
                }
                auto extra = ScalarField(rng.next() & 0xff);

                // With 50% probability we add/sub a small value
                if (rng.next() & 1) {
                    auto switch_sign = static_cast<bool>(rng.next() & 1);
                    if (!switch_sign) {
                        e += extra;
                    } else {
                        e -= extra;
                    }
                } else {
                    // otherwise we multiply by a small value
                    e *= extra;
                }
                if (convert_to_montgomery) {
                    e = e.from_montgomery_form();
                }
            } else if (choice < havoc_config.value_mutation_distribution[2]) {
                if (convert_to_montgomery) {
                    e = e.to_montgomery_form();
                }
                // Substitute scalar element with a special value
                // I think that zeros from mutateGroupElement are enough zeros produced
                switch (rng.next() % 7) {
                case 0:
                    e = ScalarField::one();
                    break;
                case 1:
                    e = -ScalarField::one();
                    break;
                case 2:
                    e = ScalarField::one().sqrt().second;
                    break;
                case 3:
                    e = ScalarField::one().sqrt().second.invert();
                    break;
                case 4:
                    e = ScalarField::get_root_of_unity(13);
                    break;
                case 5:
                    e = ScalarField(2);
                    break;
                case 6:
                    e = ScalarField((ScalarField::modulus - 1) / 2);
                    break;
                default:
                    abort();
                    break;
                }
                if (convert_to_montgomery) {
                    e = e.to_montgomery_form();
                }
            }
            // Return value
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
                        mutateGroupElement(instruction.arguments.element, rng, havoc_config);
                }
                break;

            case OPCODE::DBL:
            case OPCODE::NEG:
            case OPCODE::ASSERT_EQUAL:
            case OPCODE::SET:
            case OPCODE::SET_INF:
                PUT_RANDOM_BYTE_IF_LUCKY(instruction.arguments.twoArgs.in);
                PUT_RANDOM_BYTE_IF_LUCKY(instruction.arguments.twoArgs.out);
                break;
#ifndef DISABLE_MULTIPLICATION
            case OPCODE::MULTIPLY:
                PUT_RANDOM_BYTE_IF_LUCKY(instruction.arguments.mulArgs.in);
                PUT_RANDOM_BYTE_IF_LUCKY(instruction.arguments.mulArgs.out);
                if (rng.next() & 1) {
                    instruction.arguments.mulArgs.scalar =
                        mutateScalarElement(instruction.arguments.mulArgs.scalar, rng, havoc_config);
                }
                break;
#endif
            case OPCODE::ADD:
            case OPCODE::SUBTRACT:
                PUT_RANDOM_BYTE_IF_LUCKY(instruction.arguments.threeArgs.in1);
                PUT_RANDOM_BYTE_IF_LUCKY(instruction.arguments.threeArgs.in2);
                PUT_RANDOM_BYTE_IF_LUCKY(instruction.arguments.threeArgs.out);
                break;
            case OPCODE::COND_ASSIGN:
                PUT_RANDOM_BYTE_IF_LUCKY(instruction.arguments.fourArgs.in1);
                PUT_RANDOM_BYTE_IF_LUCKY(instruction.arguments.fourArgs.in2);
                PUT_RANDOM_BYTE_IF_LUCKY(instruction.arguments.fourArgs.in3);
                PUT_RANDOM_BYTE_IF_LUCKY(instruction.arguments.fourArgs.out);
                break;
#ifndef DISABLE_BATCH_MUL
            case OPCODE::BATCH_MUL:
                if (rng.next() & 1) {
                    uint8_t mult_size0 =
                        MINIMUM_MUL_ELEMENTS +
                        static_cast<uint8_t>(rng.next() % ((MAXIMUM_MUL_ELEMENTS - MINIMUM_MUL_ELEMENTS) / 2));
                    uint8_t mult_size1 =
                        MINIMUM_MUL_ELEMENTS +
                        static_cast<uint8_t>(rng.next() % ((MAXIMUM_MUL_ELEMENTS - MINIMUM_MUL_ELEMENTS) / 2));
                    uint8_t mult_size =
                        mult_size0 +
                        mult_size1; // Sample the amount of batch mul participants from the binomial distribution
                    instruction.arguments.batchMulArgs.add_elements_count = mult_size;
                }
                if (instruction.arguments.batchMulArgs.add_elements_count && (rng.next() & 1)) {
                    size_t mut_count =
                        static_cast<uint8_t>(rng.next() % (instruction.arguments.batchMulArgs.add_elements_count));
                    for (size_t i = 0; i < mut_count; i++) {
                        size_t ind =
                            rng.next() % static_cast<size_t>(instruction.arguments.batchMulArgs.add_elements_count);
                        PUT_RANDOM_BYTE_IF_LUCKY(instruction.arguments.batchMulArgs.inputs[ind]);
                    }
                }
                if (instruction.arguments.batchMulArgs.add_elements_count && (rng.next() & 1)) {
                    size_t mut_count =
                        static_cast<uint8_t>(rng.next() % (instruction.arguments.batchMulArgs.add_elements_count));
                    for (size_t i = 0; i < mut_count; i++) {
                        size_t ind =
                            rng.next() % static_cast<size_t>(instruction.arguments.batchMulArgs.add_elements_count);
                        instruction.arguments.batchMulArgs.scalars[ind] =
                            mutateScalarElement(instruction.arguments.batchMulArgs.scalars[ind], rng, havoc_config);
                    }
                }
                PUT_RANDOM_BYTE_IF_LUCKY(instruction.arguments.batchMulArgs.output_index);
                break;
#endif
            case OPCODE::RANDOMSEED:
                instruction.arguments.randomseed = rng.next();
                break;
            default:
                abort(); // We missed some instructions in switch
                return instruction;
            }
            return instruction;
        }
    };
    // We use argsizes to both specify the size of data needed to parse the instruction and to signal that the
    // instruction is enabled (if it is -1,it's disabled )
    class ArgSizes {
      public:
        static constexpr size_t CONSTANT = sizeof(typename Instruction::Element);
        static constexpr size_t WITNESS = sizeof(typename Instruction::Element);
        static constexpr size_t CONSTANT_WITNESS = sizeof(typename Instruction::Element);
        static constexpr size_t DBL = 2;
        static constexpr size_t NEG = 2;
        static constexpr size_t ASSERT_EQUAL = 2;
        static constexpr size_t SET = 2;
        static constexpr size_t SET_INF = 2;
        static constexpr size_t ADD = 3;
        static constexpr size_t SUBTRACT = 3;
        static constexpr size_t COND_ASSIGN = 4;
#ifndef DISABLE_MULTIPLICATION
        static constexpr size_t MULTIPLY = sizeof(typename Instruction::MulArgs);
#endif
#ifndef DISABLE_BATCH_MUL
        static constexpr size_t BATCH_MUL = sizeof(typename Instruction::BatchMulArgs);
#endif
        static constexpr size_t RANDOMSEED = sizeof(uint32_t);
    };

    /**
     * @brief Optional subclass that governs limits on the use of certain instructions, since some of them can be
     * too slow
     *
     */
    class InstructionWeights {
      public:
        static constexpr size_t SET = 0;
        static constexpr size_t RANDOMSEED = 0;

        static constexpr size_t CONSTANT = 1;
        static constexpr size_t WITNESS = 1;
        static constexpr size_t CONSTANT_WITNESS = 1;
        static constexpr size_t ADD = 1;
        static constexpr size_t SUBTRACT = 1;
        static constexpr size_t DBL = 1;
        static constexpr size_t NEG = 1;
        static constexpr size_t COND_ASSIGN = 1;

#ifndef DISABLE_MULTIPLICATION
        static constexpr size_t MULTIPLY = 2;
#endif
        static constexpr size_t ASSERT_EQUAL = 2;
        static constexpr size_t SET_INF = 2;

#ifndef DISABLE_BATCH_MUL
        static constexpr size_t BATCH_MUL = 4;
#endif
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
            Instruction instr;
            instr.id = static_cast<typename Instruction::OPCODE>(opcode);
            switch (opcode) {
            case Instruction::OPCODE::CONSTANT:
            case Instruction::OPCODE::WITNESS:
            case Instruction::OPCODE::CONSTANT_WITNESS: {
                auto scalar = ScalarField::serialize_from_buffer(Data);
                auto el = GroupElement::one() * scalar;
                instr.arguments.element = typename Instruction::Element(scalar, el);
                break;
            }
            case Instruction::OPCODE::DBL:
            case Instruction::OPCODE::NEG:
            case Instruction::OPCODE::ASSERT_EQUAL:
            case Instruction::OPCODE::SET:
            case Instruction::OPCODE::SET_INF:
                instr.arguments.twoArgs = { .in = *Data, .out = *(Data + 1) };
                break;
            case Instruction::OPCODE::ADD:
            case Instruction::OPCODE::SUBTRACT:
                instr.arguments.threeArgs = { .in1 = *Data, .in2 = *(Data + 1), .out = *(Data + 2) };
                break;
            case Instruction::OPCODE::COND_ASSIGN:
                instr.arguments.fourArgs = { .in1 = *Data, .in2 = *(Data + 1), .in3 = *(Data + 2), .out = *(Data + 3) };
                break;

#ifndef DISABLE_MULTIPLICATION
            case Instruction::OPCODE::MULTIPLY:
                instr.arguments.mulArgs.in = *Data;
                instr.arguments.mulArgs.out = *(Data + 1);
                instr.arguments.mulArgs.scalar = ScalarField::serialize_from_buffer(Data + 2);
                break;
#endif
#ifndef DISABLE_BATCH_MUL
            case Instruction::OPCODE::BATCH_MUL: {
                // In case of LLVM native instruction mutator
                instr.arguments.batchMulArgs.add_elements_count = *Data % MAXIMUM_MUL_ELEMENTS;
                if (instr.arguments.batchMulArgs.add_elements_count < MINIMUM_MUL_ELEMENTS) {
                    instr.arguments.batchMulArgs.add_elements_count = MINIMUM_MUL_ELEMENTS;
                }
                instr.arguments.batchMulArgs.output_index = *(Data + 1);

                size_t n = instr.arguments.batchMulArgs.add_elements_count;
                memcpy(instr.arguments.batchMulArgs.inputs, Data + 2, n);

                size_t offset = n + 2;
                for (size_t i = 0; i < n; i++) {
                    instr.arguments.batchMulArgs.scalars[i] = ScalarField::serialize_from_buffer(Data + offset);
                    offset += sizeof(ScalarField);
                }
            }
#endif
            case Instruction::OPCODE::RANDOMSEED:
                memcpy(&instr.arguments.randomseed, Data, sizeof(uint32_t));
                break;
            default:
                abort(); // We missed some instructions in switch
            }
            return instr;
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
            *Data = instruction.id;
            switch (instruction_opcode) {
            case Instruction::OPCODE::CONSTANT:
            case Instruction::OPCODE::WITNESS:
            case Instruction::OPCODE::CONSTANT_WITNESS:
                ScalarField::serialize_to_buffer(instruction.arguments.element.scalar, Data + 1);
                break;
            case Instruction::OPCODE::DBL:
            case Instruction::OPCODE::NEG:
            case Instruction::OPCODE::ASSERT_EQUAL:
            case Instruction::OPCODE::SET:
            case Instruction::OPCODE::SET_INF:
                *(Data + 1) = instruction.arguments.twoArgs.in;
                *(Data + 2) = instruction.arguments.twoArgs.out;
                break;
            case Instruction::OPCODE::ADD:
            case Instruction::OPCODE::SUBTRACT:
                *(Data + 1) = instruction.arguments.threeArgs.in1;
                *(Data + 2) = instruction.arguments.threeArgs.in2;
                *(Data + 3) = instruction.arguments.threeArgs.out;
                break;
            case Instruction::OPCODE::COND_ASSIGN:
                *(Data + 1) = instruction.arguments.fourArgs.in1;
                *(Data + 2) = instruction.arguments.fourArgs.in2;
                *(Data + 3) = instruction.arguments.fourArgs.in3;
                *(Data + 4) = instruction.arguments.fourArgs.out;
                break;
#ifndef DISABLE_MULTIPLICATION
            case Instruction::OPCODE::MULTIPLY:
                *(Data + 1) = instruction.arguments.mulArgs.in;
                *(Data + 2) = instruction.arguments.mulArgs.out;
                ScalarField::serialize_to_buffer(instruction.arguments.mulArgs.scalar, Data + 3);
                break;
#endif
#ifndef DISABLE_BATCH_MUL
            case Instruction::OPCODE::BATCH_MUL: {
                *(Data + 1) = instruction.arguments.batchMulArgs.add_elements_count;
                *(Data + 2) = instruction.arguments.batchMulArgs.output_index;

                size_t n = instruction.arguments.batchMulArgs.add_elements_count;

                memcpy(Data + 3, instruction.arguments.batchMulArgs.inputs, n);
                size_t offset = n + 3;
                for (size_t i = 0; i < n; i++) {
                    ScalarField::serialize_to_buffer(instruction.arguments.batchMulArgs.scalars[i], Data + offset);
                    offset += sizeof(ScalarField);
                }
                break;
            }
#endif
            case Instruction::OPCODE::RANDOMSEED:
                memcpy(Data + 1, &instruction.arguments.randomseed, sizeof(uint32_t));
                break;
            default:
                abort(); // We missed some instructions in switch
            }
            return;
        };
    };
    /**
     * @brief This class implements the execution of cycle group with an oracle to detect discrepancies
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
            const bool predicate_is_const = static_cast<bool>(VarianceRNG.next() & 1);
            if (predicate_is_const) {
                const bool predicate_has_ctx = static_cast<bool>(VarianceRNG.next() % 2);
#ifdef FUZZING_SHOW_INFORMATION
                std::cout << "bool_t(" << (predicate_has_ctx ? "&builder," : "nullptr,")
                          << (predicate ? "true)" : "false)");
#endif
                return bool_t(predicate_has_ctx ? builder : nullptr, predicate);
            }
#ifdef FUZZING_SHOW_INFORMATION
            std::cout << "bool_t(witness_t(&builder, " << (predicate ? "true));" : "false))");
#endif
            return bool_t(witness_t(builder, predicate));
        }

        cycle_group_t cg() const
        {
            const bool reconstruct = static_cast<bool>(VarianceRNG.next() % 2);
            if (!reconstruct) {
                return this->cycle_group;
            }
            return cycle_group_t(this->cycle_group);
        }

      public:
        ScalarField base_scalar;
        GroupElement base;
        cycle_group_t cycle_group;

        ExecutionHandler() = default;
        ExecutionHandler(ScalarField s, GroupElement g, cycle_group_t w_g)
            : base_scalar(s)
            , base(g)
            , cycle_group(w_g)
        {}

        ExecutionHandler operator_add(Builder* builder, const ExecutionHandler& other)
        {
            ScalarField base_scalar_res = this->base_scalar + other.base_scalar;
            GroupElement base_res = this->base + other.base;

            if (other.cg().get_value() == this->cg().get_value()) {
                uint8_t dbl_path = VarianceRNG.next() % 4;
                switch (dbl_path) {
                case 0:
#ifdef FUZZING_SHOW_INFORMATION
                    std::cout << "left.dbl" << std::endl;
#endif
                    return ExecutionHandler(base_scalar_res, base_res, this->cg().dbl());
                case 1:
#ifdef FUZZING_SHOW_INFORMATION
                    std::cout << "right.dbl" << std::endl;
#endif
                    return ExecutionHandler(base_scalar_res, base_res, other.cg().dbl());
                case 2:
                    return ExecutionHandler(base_scalar_res, base_res, this->cg() + other.cg());
                case 3:
                    return ExecutionHandler(base_scalar_res, base_res, other.cg() + this->cg());
                }
            } else if (other.cg().get_value() == -this->cg().get_value()) {
                uint8_t inf_path = VarianceRNG.next() % 4;
                cycle_group_t res;
                switch (inf_path) {
                case 0:
#ifdef FUZZING_SHOW_INFORMATION
                    std::cout << "left.set_point_at_infinity(";
#endif
                    res = this->cg();
                    res.set_point_at_infinity(this->construct_predicate(builder, true));
#ifdef FUZZING_SHOW_INFORMATION
                    std::cout << ");" << std::endl;
#endif
                    return ExecutionHandler(base_scalar_res, base_res, res);
                case 1:
#ifdef FUZZING_SHOW_INFORMATION
                    std::cout << "right.set_point_at_infinity(";
#endif
                    res = other.cg();
                    res.set_point_at_infinity(this->construct_predicate(builder, true));
#ifdef FUZZING_SHOW_INFORMATION
                    std::cout << ");" << std::endl;
#endif
                    return ExecutionHandler(base_scalar_res, base_res, res);
                case 2:
                    return ExecutionHandler(base_scalar_res, base_res, this->cg() + other.cg());
                case 3:
                    return ExecutionHandler(base_scalar_res, base_res, other.cg() + this->cg());
                }
            }
            bool smth_inf = this->cycle_group.is_point_at_infinity().get_value() ||
                            other.cycle_group.is_point_at_infinity().get_value();
            uint8_t add_option = smth_inf ? 4 + (VarianceRNG.next() % 2) : VarianceRNG.next() % 6;

            switch (add_option) {
            case 0:
#ifdef FUZZING_SHOW_INFORMATION
                std::cout << "left.unconditional_add(right);" << std::endl;
#endif
                return ExecutionHandler(base_scalar_res, base_res, this->cg().unconditional_add(other.cg()));
            case 1:
#ifdef FUZZING_SHOW_INFORMATION
                std::cout << "right.unconditional_add(left);" << std::endl;
#endif
                return ExecutionHandler(base_scalar_res, base_res, other.cg().unconditional_add(this->cg()));
            case 2:
#ifdef FUZZING_SHOW_INFORMATION
                std::cout << "left.checked_unconditional_add(right);" << std::endl;
#endif
                return ExecutionHandler(base_scalar_res, base_res, this->cg().checked_unconditional_add(other.cg()));
            case 3:
#ifdef FUZZING_SHOW_INFORMATION
                std::cout << "right.checked_unconditional_add(left);" << std::endl;
#endif
                return ExecutionHandler(base_scalar_res, base_res, other.cg().checked_unconditional_add(this->cg()));
            case 4:
                return ExecutionHandler(base_scalar_res, base_res, this->cg() + other.cg());
            case 5:
                return ExecutionHandler(base_scalar_res, base_res, other.cg() + this->cg());
            }
            return {};
        }

        ExecutionHandler operator_sub(Builder* builder, const ExecutionHandler& other)
        {
            ScalarField base_scalar_res = this->base_scalar - other.base_scalar;
            GroupElement base_res = this->base - other.base;

            if (other.cg().get_value() == -this->cg().get_value()) {
                uint8_t dbl_path = VarianceRNG.next() % 3;

                switch (dbl_path) {
                case 0:
#ifdef FUZZING_SHOW_INFORMATION
                    std::cout << "left.dbl();" << std::endl;
#endif
                    return ExecutionHandler(base_scalar_res, base_res, this->cg().dbl());
                case 1:
#ifdef FUZZING_SHOW_INFORMATION
                    std::cout << "-right.dbl();" << std::endl;
#endif
                    return ExecutionHandler(base_scalar_res, base_res, -other.cg().dbl());
                case 2:
                    return ExecutionHandler(base_scalar_res, base_res, this->cg() - other.cg());
                }
            } else if (other.cg().get_value() == this->cg().get_value()) {
                uint8_t inf_path = VarianceRNG.next() % 3;
                cycle_group_t res;

                switch (inf_path) {
                case 0:
#ifdef FUZZING_SHOW_INFORMATION
                    std::cout << "left.set_point_at_infinity(";
#endif
                    res = this->cg();
                    res.set_point_at_infinity(this->construct_predicate(builder, true));
#ifdef FUZZING_SHOW_INFORMATION
                    std::cout << ");" << std::endl;
#endif
                    return ExecutionHandler(base_scalar_res, base_res, res);
                case 1:
#ifdef FUZZING_SHOW_INFORMATION
                    std::cout << "right.set_point_at_infinity(";
#endif
                    res = other.cg();
                    res.set_point_at_infinity(this->construct_predicate(builder, true));
#ifdef FUZZING_SHOW_INFORMATION
                    std::cout << ");" << std::endl;
#endif
                    return ExecutionHandler(base_scalar_res, base_res, res);
                case 2:
                    return ExecutionHandler(base_scalar_res, base_res, this->cg() - other.cg());
                }
            }
            bool smth_inf = this->cycle_group.is_point_at_infinity().get_value() ||
                            other.cycle_group.is_point_at_infinity().get_value();
            uint8_t add_option = smth_inf ? 2 : VarianceRNG.next() % 3;

            switch (add_option) {
            case 0:
#ifdef FUZZING_SHOW_INFORMATION
                std::cout << "left.unconditional_subtract(right);" << std::endl;
#endif
                return ExecutionHandler(base_scalar_res, base_res, this->cg().unconditional_subtract(other.cg()));
            case 1:
#ifdef FUZZING_SHOW_INFORMATION
                std::cout << "left.checked_unconditional_subtract(right);" << std::endl;
#endif
                return ExecutionHandler(
                    base_scalar_res, base_res, this->cg().checked_unconditional_subtract(other.cg()));
            case 2:
                return ExecutionHandler(base_scalar_res, base_res, this->cg() - other.cg());
            }
            return {};
        }

        ExecutionHandler mul(Builder* builder, const ScalarField& multiplier)
        {
            bool is_witness = VarianceRNG.next() & 1;
#ifdef FUZZING_SHOW_INFORMATION
            std::cout << " * cycle_scalar_t" << (is_witness ? "::from_witness(&builder, " : "(") << "ScalarField(\""
                      << multiplier << "\"));";
#endif
            auto scalar = is_witness ? cycle_scalar_t::from_witness(builder, multiplier) : cycle_scalar_t(multiplier);
            return ExecutionHandler(this->base_scalar * multiplier, this->base * multiplier, this->cg() * scalar);
        }

        static ExecutionHandler batch_mul(Builder* builder,
                                          const std::vector<ExecutionHandler>& to_add,
                                          const std::vector<ScalarField>& to_mul)
        {
            std::vector<cycle_group_t> to_add_cg;
            to_add_cg.reserve(to_add.size());
            std::vector<cycle_scalar_t> to_mul_cs;
            to_mul_cs.reserve(to_mul.size());

            GroupElement accumulator_cg = GroupElement::one();
            ScalarField accumulator_cs = ScalarField::zero();

            for (size_t i = 0; i < to_add.size(); i++) {
                to_add_cg.push_back(to_add[i].cycle_group);

                bool is_witness = VarianceRNG.next() & 1;
#ifdef FUZZING_SHOW_INFORMATION
                std::cout << "cycle_scalar_t" << (is_witness ? "::from_witness(&builder, " : "(") << "ScalarField(\""
                          << to_mul[i] << "\")), ";
#endif
                auto scalar = is_witness ? cycle_scalar_t(to_mul[i]) : cycle_scalar_t::from_witness(builder, to_mul[i]);
                to_mul_cs.push_back(scalar);

                accumulator_cg += to_add[i].base * to_mul[i];
                accumulator_cs += to_add[i].base_scalar * to_mul[i];
            }
            accumulator_cg -= GroupElement::one();

            auto batch_mul_res = cycle_group_t::batch_mul(to_add_cg, to_mul_cs);
            return ExecutionHandler(accumulator_cs, accumulator_cg, batch_mul_res);
        }

        ExecutionHandler operator-()
        {
            this->base_scalar = -this->base_scalar;
            this->base = -this->base;
            this->cycle_group = -this->cycle_group;
        }

        ExecutionHandler dbl()
        {
            return ExecutionHandler(this->base_scalar + this->base_scalar, this->base.dbl(), this->cg().dbl());
        }

        ExecutionHandler conditional_assign(Builder* builder, ExecutionHandler& other, const bool predicate)
        {
            ScalarField new_base_scalar = predicate ? other.base_scalar : this->base_scalar;
            GroupElement new_base = predicate ? other.base : this->base;
            cycle_group_t new_cycle_group =
                cycle_group_t::conditional_assign(construct_predicate(builder, predicate), other.cg(), this->cg());
            return ExecutionHandler(new_base_scalar, new_base, new_cycle_group);
        }

        void assert_equal(Builder* builder, ExecutionHandler& other)
        {
            if (other.cg().is_constant()) {
                if (this->cg().is_constant()) {
                    // Assert equal does nothing in this case
                    return;
                }
            }
            auto to_add = cycle_group_t::from_witness(builder, AffineElement(this->base - other.base));
            auto to_ae = other.cg() + to_add;
            this->cg().assert_equal(to_ae);
        }

        /* Explicit re-instantiation using the various cycle_group_t constructors */
        ExecutionHandler set(Builder* builder)
        {
            uint32_t switch_case = VarianceRNG.next() % 4;
            switch (switch_case) {
            case 0:
#ifdef FUZZING_SHOW_INFORMATION
                std::cout << "cycle_group_t(" << std::endl;
#endif
                /* construct via cycle_group_t */
                return ExecutionHandler(this->base_scalar, this->base, cycle_group_t(this->cycle_group));
            case 1: {
#ifdef FUZZING_SHOW_INFORMATION
                std::cout << "cycle_group_t::from" << (this->cycle_group.is_constant() ? "" : "_constant")
                          << "_witness(&builder, e.get_value());";
#endif
                /* construct via AffineElement */
                AffineElement e = this->cycle_group.get_value();
                if (this->cycle_group.is_constant()) {
                    return ExecutionHandler(
                        this->base_scalar, this->base, cycle_group_t::from_constant_witness(builder, e));
                }
                return ExecutionHandler(this->base_scalar, this->base, cycle_group_t::from_witness(builder, e));
            }
            case 2: {
#ifdef FUZZING_SHOW_INFORMATION
                std::cout << "tmp = el;" << std::endl;
                std::cout << "res = cycle_group_t(tmp);" << std::endl;
#endif
                /* Invoke assigment operator */
                cycle_group_t cg_new(builder);
                cg_new = this->cg();
                return ExecutionHandler(this->base_scalar, this->base, cycle_group_t(cg_new));
            }
            case 3: {
#ifdef FUZZING_SHOW_INFORMATION
                std::cout << "tmp = el;" << std::endl;
                std::cout << "res = cycle_group_t(std::move(tmp));" << std::endl;
#endif
                /* Invoke move constructor */
                cycle_group_t cg_copy = this->cg();
                return ExecutionHandler(this->base_scalar, this->base, cycle_group_t(std::move(cg_copy)));
            }
            default:
                abort();
            }
        }
        /* Explicit re-instantiation using the various cycle_group_t constructors + set inf in the end*/
        ExecutionHandler set_inf(Builder* builder)
        {
            auto res = this->set(builder);
            const bool set_inf =
                res.cycle_group.is_point_at_infinity().get_value() ? true : static_cast<bool>(VarianceRNG.next() & 1);
#ifdef FUZZING_SHOW_INFORMATION
            std::cout << "el.set_point_at_infinty(";
#endif
            res.set_point_at_infinity(this->construct_predicate(builder, set_inf));
#ifdef FUZZING_SHOW_INFORMATION
            std::cout << ");" << std::endl;
#endif
            return res;
        }

        /**
         * @brief Execute the constant instruction (push constant cycle group to the stack)
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
                ExecutionHandler(instruction.arguments.element.scalar,
                                 instruction.arguments.element.value,
                                 cycle_group_t(static_cast<AffineElement>(instruction.arguments.element.value))));
#ifdef FUZZING_SHOW_INFORMATION
            std::cout << "auto c" << stack.size() - 1 << " = cycle_group_t(ae(\""
                      << instruction.arguments.element.scalar << "\"));" << std::endl;
#endif
            return 0;
        };

        /**
         * @brief Execute the witness instruction (push witness cycle group to the stack)
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
            stack.push_back(ExecutionHandler(
                instruction.arguments.element.scalar,
                instruction.arguments.element.value,
                cycle_group_t::from_witness(builder, static_cast<AffineElement>(instruction.arguments.element.value))));
#ifdef FUZZING_SHOW_INFORMATION
            std::cout << "auto w" << stack.size() - 1 << " = cycle_group_t::from_witness(&builder, ae(\""
                      << instruction.arguments.element.scalar << "\"));" << std::endl;
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
            stack.push_back(
                ExecutionHandler(instruction.arguments.element.scalar,
                                 instruction.arguments.element.value,
                                 cycle_group_t::from_constant_witness(
                                     builder, static_cast<AffineElement>(instruction.arguments.element.value))));
#ifdef FUZZING_SHOW_INFORMATION
            std::cout << "auto cw" << stack.size() - 1 << " = cycle_group_t::from_constant_witness(&builder, ae(\""
                      << instruction.arguments.element.scalar << "\"));" << std::endl;
#endif
            return 0;
        }

        /**
         * @brief Execute the DBL instruction
         *
         * @param builder
         * @param stack
         * @param instruction
         * @return if everything is ok, 1 if we should stop execution, since an expected error was encountered
         */
        static inline size_t execute_DBL(Builder* builder,
                                         std::vector<ExecutionHandler>& stack,
                                         Instruction& instruction)
        {
            (void)builder;
            if (stack.size() == 0) {
                return 1;
            }
            size_t first_index = instruction.arguments.twoArgs.in % stack.size();
            size_t output_index = instruction.arguments.twoArgs.out;

#ifdef FUZZING_SHOW_INFORMATION
            PREP_SINGLE_ARG(stack, first_index, output_index)
            std::cout << out << " = " << rhs << ".dbl();" << std::endl;
#endif
            ExecutionHandler result;
            result = stack[first_index].dbl();
            // If the output index is larger than the number of elements in stack, append
            if (output_index >= stack.size()) {
                stack.push_back(result);
            } else {
                stack[output_index] = result;
            }
            return 0;
        };

        /**
         * @brief Execute the NEG instruction
         *
         * @param builder
         * @param stack
         * @param instruction
         * @return if everything is ok, 1 if we should stop execution, since an expected error was encountered
         */
        static inline size_t execute_NEG(Builder* builder,
                                         std::vector<ExecutionHandler>& stack,
                                         Instruction& instruction)
        {
            (void)builder;
            if (stack.size() == 0) {
                return 1;
            }
            size_t first_index = instruction.arguments.twoArgs.in % stack.size();
            size_t output_index = instruction.arguments.twoArgs.out;

#ifdef FUZZING_SHOW_INFORMATION
            PREP_SINGLE_ARG(stack, first_index, output_index)
            std::cout << out << " = -" << rhs << ";" << std::endl;
#endif
            ExecutionHandler result;
            result = -stack[first_index];
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
            if (stack.size() == 0) {
                return 1;
            }
            size_t first_index = instruction.arguments.twoArgs.in % stack.size();
            size_t second_index = instruction.arguments.twoArgs.out % stack.size();

#ifdef FUZZING_SHOW_INFORMATION
            PREP_TWO_ARG(stack, first_index, second_index, 0)
            std::cout << "assert_equal(" << lhs << ", " << rhs << ", builder);" << std::endl;
#endif
            stack[first_index].assert_equal(builder, stack[second_index]);
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

#ifdef FUZZING_SHOW_INFORMATION
            PREP_SINGLE_ARG(stack, first_index, output_index)
            std::cout << out << " = ";
#endif
            result = stack[first_index].set(builder);
#ifdef FUZZING_SHOW_INFORMATION
            std::cout << rhs << ");" << std::endl;
#endif
            // If the output index is larger than the number of elements in stack, append
            if (output_index >= stack.size()) {
                stack.push_back(result);
            } else {
                stack[output_index] = result;
            }
            return 0;
        };

        /**
         * @brief Execute the SET_INF instruction
         *
         * @param builder
         * @param stack
         * @param instruction
         * @return if everything is ok, 1 if we should stop execution, since an expected error was encountered
         */
        static inline size_t execute_SET_INF(Builder* builder,
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

#ifdef FUZZING_SHOW_INFORMATION
            PREP_SINGLE_ARG(stack, first_index, output_index)
            std::cout << out << " = " << rhs << std::endl;
#endif
            result = stack[first_index].set_inf(builder);
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

#ifdef FUZZING_SHOW_INFORMATION
            PREP_TWO_ARG(stack, first_index, second_index, output_index)
            std::cout << out << " = " << lhs << " + " << rhs << ";" << std::endl;
#endif
            ExecutionHandler result;
            result = stack[first_index].operator_add(builder, stack[second_index]);
            // If the output index is larger than the number of elements in stack, append
            if (output_index >= stack.size()) {
                stack.push_back(result);
            } else {
                stack[output_index] = result;
            }
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

#ifdef FUZZING_SHOW_INFORMATION
            PREP_TWO_ARG(stack, first_index, second_index, output_index)
            std::cout << out << " = " << lhs << " - " << rhs << ";" << std::endl;
#endif
            ExecutionHandler result;
            result = stack[first_index].operator_sub(builder, stack[second_index]);
            // If the output index is larger than the number of elements in stack, append
            if (output_index >= stack.size()) {
                stack.push_back(result);
            } else {
                stack[output_index] = result;
            }
            return 0;
        };

        /**
         * @brief Execute the COND_ASSIGN instruction
         *
         * @param builder
         * @param stack
         * @param instruction
         * @return if everything is ok, 1 if we should stop execution, since an expected error was encountered
         */
        static inline size_t execute_COND_ASSIGN(Builder* builder,
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

#ifdef FUZZING_SHOW_INFORMATION
            PREP_TWO_ARG(stack, first_index, second_index, output_index)
            std::cout << out << " = cycle_group_t::conditional_assign(";
#endif
            result = stack[first_index].conditional_assign(builder, stack[second_index], predicate);
#ifdef FUZZING_SHOW_INFORMATION
            std::cout << rhs << ", " << lhs << ");" << std::endl;
#endif
            // If the output index is larger than the number of elements in stack, append
            if (output_index >= stack.size()) {
                stack.push_back(result);
            } else {
                stack[output_index] = result;
            }
            return 0;
        };

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

            if (stack.size() == 0) {
                return 1;
            }
            size_t first_index = instruction.arguments.mulArgs.in % stack.size();
            size_t output_index = instruction.arguments.mulArgs.out;
            ScalarField scalar = instruction.arguments.mulArgs.scalar;

#ifdef FUZZING_SHOW_INFORMATION
            PREP_SINGLE_ARG(stack, first_index, output_index)
            std::cout << out << " = " << rhs << std::endl;
#endif
            ExecutionHandler result;
            result = stack[first_index].mul(builder, scalar);
            // If the output index is larger than the number of elements in stack, append
            if (output_index >= stack.size()) {
                stack.push_back(result);
            } else {
                stack[output_index] = result;
            }
            return 0;
        };

        /**
         * @brief Execute the BATCH_MUL instruction
         *
         * @param builder
         * @param stack
         * @param instruction
         * @return if everything is ok, 1 if we should stop execution, since an expected error was encountered
         */
        static inline size_t execute_BATCH_MUL(Builder* builder,
                                               std::vector<ExecutionHandler>& stack,
                                               Instruction& instruction)
        {
            (void)builder;
            if (stack.size() == 0) {
                return 1;
            }
            std::vector<ExecutionHandler> to_add;
            std::vector<ScalarField> to_mul;
            for (size_t i = 0; i < instruction.arguments.batchMulArgs.add_elements_count; i++) {
                to_add.push_back(stack[(size_t)instruction.arguments.batchMulArgs.inputs[i] % stack.size()]);
                to_mul.push_back(instruction.arguments.batchMulArgs.scalars[i]);
            }
            size_t output_index = (size_t)instruction.arguments.batchMulArgs.output_index;

#ifdef FUZZING_SHOW_INFORMATION
            std::string res = "";
            bool is_const = true;
            for (size_t i = 0; i < instruction.arguments.batchMulArgs.add_elements_count; i++) {
                size_t idx = instruction.arguments.batchMulArgs.inputs[i] % stack.size();
                std::string el = stack[idx].cycle_group.is_constant() ? "c" : "w";
                el += std::to_string(idx);
                res += el + ", ";
                is_const &= stack[idx].cycle_group.is_constant();
            }
            std::string out = is_const ? "c" : "w";
            out = ((output_index >= stack.size()) ? "auto " : "") + out;
            out += std::to_string(output_index >= stack.size() ? stack.size() : output_index);
            std::cout << out << " = cycle_group_t::batch_mul({" << res << "}, {";
#endif
            auto result = ExecutionHandler::batch_mul(builder, to_add, to_mul);

#ifdef FUZZING_SHOW_INFORMATION
            std::cout << "});" << std::endl;
#endif
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
    };

    /** For cycle group execution state is just a vector of ExecutionHandler objects
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
    inline static bool postProcess(Builder* builder, std::vector<CycleGroupBase::ExecutionHandler>& stack)
    {
        (void)builder;
        for (size_t i = 0; i < stack.size(); i++) {
            auto element = stack[i];
            if (element.cycle_group.get_value() != AffineElement(element.base)) {
                std::cerr << "Failed at " << i << " with actual value " << AffineElement(element.base)
                          << " and value in CycleGroup " << element.cycle_group.get_value() << std::endl;
                return false;
            }
            if ((AffineElement::one() * element.base_scalar) != AffineElement(element.base)) {
                std::cerr << "Failed at " << i << " with actual mul value " << element.base
                          << " and value in scalar * CG " << element.cycle_group.get_value() * element.base_scalar
                          << std::endl;
                return false;
            }

            bool fake_standardized = element.cycle_group.is_standard();
            fake_standardized &= element.cycle_group.is_point_at_infinity().get_value();
            fake_standardized &= (element.cycle_group.x.get_value() != 0) || (element.cycle_group.y.get_value() != 0);
            if (fake_standardized) {
                std::cerr << "Failed at " << i << " with value claimed to be standard: (0, 0) but the actual value is ("
                          << element.cycle_group.x.get_value() << ", " << element.cycle_group.y.get_value() << ")"
                          << std::endl;
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
    RunWithBuilders<CycleGroupBase, FuzzerCircuitTypes>(Data, Size, VarianceRNG);
    return 0;
}

#pragma clang diagnostic pop

// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "barretenberg/numeric/random/engine.hpp"
#pragma clang diagnostic push
// -Wc99-designator prevents us from using designators and nested designators
// in struct initializations, since it's not a part of c++17 standard.
// However the use of them in this file heavily increases readability.
#pragma clang diagnostic ignored "-Wc99-designator"
// This is a global variable, so that the execution handling class could alter it and signal to the input tester that
// the input should fail
bool circuit_should_fail = false;

#define HAVOC_TESTING
// #define HAVOC_CALIBRATION

#include "barretenberg/common/fuzzer.hpp"
FastRandom VarianceRNG(0);

// Enable this definition, when you want to find out the instructions that caused a failure
// #define FUZZING_SHOW_INFORMATION 1

#define OPERATION_TYPE_SIZE 1

#define ELEMENT_SIZE (sizeof(fr) + 1)
#define TWO_IN_ONE_OUT 3
#define THREE_IN_ONE_OUT 4
#define SLICE_ARGS_SIZE 6

/**
 * @brief The class parametrizing ByteArray fuzzing instructions, execution, etc
 *
 */
template <typename Builder> class BoolFuzzBase {
  private:
    typedef bb::stdlib::bool_t<Builder> bool_t;
    typedef bb::stdlib::witness_t<Builder> witness_t;

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
            AND,
            OR,
            XOR,
            NOT,
            ASSERT_EQUAL,
            SELECT_IF_EQ,
            SET,
            IMPLIES,
            IMPLIES_BOTH_WAYS,
            BOOL_EQUAL,
            BOOL_NOT_EQUAL,
            RANDOMSEED,
            _LAST
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

        union ArgumentContents {
            uint32_t randomseed;
            bool element;
            TwoArgs twoArgs;
            ThreeArgs threeArgs;
            FourArgs fourArgs;
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
                // Return instruction
                return { .id = instruction_opcode, .arguments.element = static_cast<bool>(rng.next() % 2) };
                break;
            case OPCODE::AND:
            case OPCODE::OR:
            case OPCODE::XOR:
            case OPCODE::IMPLIES:
            case OPCODE::IMPLIES_BOTH_WAYS:
            case OPCODE::BOOL_EQUAL:
            case OPCODE::BOOL_NOT_EQUAL:
                // For two-input-one-output instructions we just randomly pick each argument and generate an instruction
                // accordingly
                in1 = static_cast<uint8_t>(rng.next() & 0xff);
                in2 = static_cast<uint8_t>(rng.next() & 0xff);
                out = static_cast<uint8_t>(rng.next() & 0xff);
                return { .id = instruction_opcode, .arguments.threeArgs = { .in1 = in1, .in2 = in2, .out = out } };
                break;
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
            case OPCODE::NOT:
            case OPCODE::ASSERT_EQUAL:
            case OPCODE::SET:
                in1 = static_cast<uint8_t>(rng.next() & 0xff);
                out = static_cast<uint8_t>(rng.next() & 0xff);
                return { .id = instruction_opcode, .arguments.twoArgs = { .in = in1, .out = out } };
            case OPCODE::RANDOMSEED:
                return { .id = instruction_opcode, .arguments.randomseed = rng.next() };
                break;
            default:
                abort(); // We have missed some instructions, it seems
                break;
            }
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
            (void)rng;
            (void)havoc_config;
#define PUT_RANDOM_BYTE_IF_LUCKY(variable)                                                                             \
    if (rng.next() & 1) {                                                                                              \
        variable = rng.next() & 0xff;                                                                                  \
    }
            // Depending on instruction type...
            switch (instruction.id) {
            case OPCODE::CONSTANT:
            case OPCODE::WITNESS:
                break;
            case OPCODE::AND:
            case OPCODE::OR:
            case OPCODE::XOR:
            case OPCODE::IMPLIES:
            case OPCODE::IMPLIES_BOTH_WAYS:
            case OPCODE::BOOL_EQUAL:
            case OPCODE::BOOL_NOT_EQUAL:
                // Randomly sample each of the arguments with 50% probability
                PUT_RANDOM_BYTE_IF_LUCKY(instruction.arguments.threeArgs.in1)
                PUT_RANDOM_BYTE_IF_LUCKY(instruction.arguments.threeArgs.in2)
                PUT_RANDOM_BYTE_IF_LUCKY(instruction.arguments.threeArgs.out)
                break;
            case OPCODE::SELECT_IF_EQ:
                // Randomly sample each of the arguments with 50% probability
                PUT_RANDOM_BYTE_IF_LUCKY(instruction.arguments.fourArgs.in1)
                PUT_RANDOM_BYTE_IF_LUCKY(instruction.arguments.fourArgs.in2)
                PUT_RANDOM_BYTE_IF_LUCKY(instruction.arguments.fourArgs.in3)
                PUT_RANDOM_BYTE_IF_LUCKY(instruction.arguments.fourArgs.out)
                break;
            case OPCODE::NOT:
            case OPCODE::ASSERT_EQUAL:
            case OPCODE::SET:
                PUT_RANDOM_BYTE_IF_LUCKY(instruction.arguments.twoArgs.in)
                PUT_RANDOM_BYTE_IF_LUCKY(instruction.arguments.twoArgs.out)
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
        static constexpr size_t CONSTANT = 1;
        static constexpr size_t WITNESS = 1;
        static constexpr size_t AND = 3;
        static constexpr size_t OR = 3;
        static constexpr size_t XOR = 3;
        static constexpr size_t SELECT_IF_EQ = 4;
        static constexpr size_t NOT = 2;
        static constexpr size_t ASSERT_EQUAL = 2;
        static constexpr size_t SET = 2;
        static constexpr size_t IMPLIES = 3;
        static constexpr size_t IMPLIES_BOTH_WAYS = 3;
        static constexpr size_t BOOL_EQUAL = 3;
        static constexpr size_t BOOL_NOT_EQUAL = 3;
        static constexpr size_t RANDOMSEED = sizeof(uint32_t);
    };
    class InstructionWeights {
      public:
        static constexpr size_t CONSTANT = 1;
        static constexpr size_t WITNESS = 1;
        static constexpr size_t AND = 2;
        static constexpr size_t OR = 2;
        static constexpr size_t XOR = 2;
        static constexpr size_t SELECT_IF_EQ = 3;
        static constexpr size_t NOT = 1;
        static constexpr size_t ASSERT_EQUAL = 2;
        static constexpr size_t SET = 1;
        static constexpr size_t IMPLIES = 3;
        static constexpr size_t IMPLIES_BOTH_WAYS = 1;
        static constexpr size_t BOOL_EQUAL = 1;
        static constexpr size_t BOOL_NOT_EQUAL = 1;
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
            if constexpr (opcode == Instruction::OPCODE::CONSTANT || opcode == Instruction::OPCODE::WITNESS) {
                return Instruction{ .id = static_cast<typename Instruction::OPCODE>(opcode),
                                    .arguments.element = static_cast<bool>(*Data) };
            }
            if constexpr (opcode == Instruction::OPCODE::AND || opcode == Instruction::OPCODE::OR ||
                          opcode == Instruction::OPCODE::XOR || opcode == Instruction::OPCODE::IMPLIES ||
                          opcode == Instruction::OPCODE::IMPLIES_BOTH_WAYS ||
                          opcode == Instruction::OPCODE::BOOL_EQUAL || opcode == Instruction::OPCODE::BOOL_NOT_EQUAL) {
                return { .id = static_cast<typename Instruction::OPCODE>(opcode),
                         .arguments.threeArgs = { .in1 = *Data, .in2 = *(Data + 1), .out = *(Data + 2) } };
            }
            if constexpr (opcode == Instruction::OPCODE::NOT || opcode == Instruction::OPCODE::ASSERT_EQUAL ||
                          opcode == Instruction::OPCODE::SET) {
                return Instruction{ .id = static_cast<typename Instruction::OPCODE>(opcode),
                                    .arguments.twoArgs = { .in = *Data, .out = *(Data + 1) } };
            }
            if constexpr (opcode == Instruction::OPCODE::SELECT_IF_EQ) {

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
                          instruction_opcode == Instruction::OPCODE::WITNESS) {
                *Data = instruction.id;
                *(Data + 1) = instruction.arguments.element ? 1 : 0;
            }
            if constexpr (instruction_opcode == Instruction::OPCODE::AND ||
                          instruction_opcode == Instruction::OPCODE::OR ||
                          instruction_opcode == Instruction::OPCODE::XOR ||
                          instruction_opcode == Instruction::OPCODE::IMPLIES ||
                          instruction_opcode == Instruction::OPCODE::IMPLIES_BOTH_WAYS ||
                          instruction_opcode == Instruction::OPCODE::BOOL_EQUAL ||
                          instruction_opcode == Instruction::OPCODE::BOOL_NOT_EQUAL) {
                *Data = instruction.id;
                *(Data + 1) = instruction.arguments.threeArgs.in1;
                *(Data + 2) = instruction.arguments.threeArgs.in2;
                *(Data + 3) = instruction.arguments.threeArgs.out;
            }
            if constexpr (instruction_opcode == Instruction::OPCODE::NOT ||
                          instruction_opcode == Instruction::OPCODE::ASSERT_EQUAL ||
                          instruction_opcode == Instruction::OPCODE::SET) {
                *Data = instruction.id;
                *(Data + 1) = instruction.arguments.twoArgs.in;
                *(Data + 2) = instruction.arguments.twoArgs.out;
            }
            if constexpr (instruction_opcode == Instruction::OPCODE::SELECT_IF_EQ) {
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
      public:
        bool reference_value;
        bool_t b;

        ExecutionHandler() = default;
        ExecutionHandler(bool r, bool_t b)
            : reference_value(r)
            , b(b)
        {}
        ExecutionHandler(bool_t b)
            : reference_value(b.get_value())
            , b(b)
        {}
        bool is_circuit_constant() const { return b.is_constant(); }

        ExecutionHandler operator&(const ExecutionHandler& other) const
        {
            const bool ref_result(this->reference_value & other.reference_value);

            switch (VarianceRNG.next() % 2) {
            case 0:
                /* ^ operator */
                return ExecutionHandler(ref_result, bool_t(this->b & other.b));
            case 1:
                /* ^= operator */
                {
                    bool_t b = this->b;
                    b &= other.b;
                    return ExecutionHandler(ref_result, b);
                }
            default:
                abort();
            }
        }
        ExecutionHandler operator|(const ExecutionHandler& other) const
        {
            const bool ref_result(this->reference_value | other.reference_value);

            switch (VarianceRNG.next() % 2) {
            case 0:
                /* | operator */
                return ExecutionHandler(ref_result, bool_t(this->b | other.b));
            case 1:
                /* |= operator */
                {
                    bool_t b = this->b;
                    b |= other.b;
                    return ExecutionHandler(ref_result, b);
                }
            default:
                abort();
            }
        }
        ExecutionHandler operator^(const ExecutionHandler& other) const
        {
            const bool ref_result(this->reference_value ^ other.reference_value);

            switch (VarianceRNG.next() % 2) {
            case 0:
                /* ^ operator */
                return ExecutionHandler(ref_result, bool_t(this->b ^ other.b));
            case 1:
                /* ^= operator */
                {
                    bool_t b = this->b;
                    b ^= other.b;
                    return ExecutionHandler(ref_result, b);
                }
            default:
                abort();
            }
        }

        ExecutionHandler not_() const { return ExecutionHandler(!this->reference_value, bool_t(!this->b)); }
        void assert_equal(ExecutionHandler& other) const
        {
            auto lhs = this->b ^ other.b;
            auto rhs = other.b ^ this->b;
            lhs.assert_equal(rhs);
        }
        ExecutionHandler select_if_eq(ExecutionHandler& other1, ExecutionHandler& other2)
        {
            return ExecutionHandler(other1.reference_value == other2.reference_value ? other1.reference_value
                                                                                     : this->reference_value,
                                    (other1.b == other2.b).get_value() ? other1.b : this->b);
        }

        ExecutionHandler set(Builder* builder)
        {
            (void)builder;
            switch (VarianceRNG.next() % 2) {
            case 0:
                return ExecutionHandler(this->reference_value, bool_t(this->reference_value));
            case 1:
                return ExecutionHandler(this->reference_value, bool_t(this->b));
            default:
                abort();
            }
        }

        ExecutionHandler implies(const ExecutionHandler& other) const
        {
            return ExecutionHandler(!this->reference_value || other.reference_value, this->b.implies(other.b));
        }

        ExecutionHandler implies_both_ways(const ExecutionHandler& other) const
        {
            return ExecutionHandler(this->reference_value == other.reference_value, this->b.implies_both_ways(other.b));
        }

        ExecutionHandler bool_equal(const ExecutionHandler& other) const
        {
            return ExecutionHandler(this->reference_value == other.reference_value, this->b == other.b);
        }

        ExecutionHandler bool_not_equal(const ExecutionHandler& other) const
        {
            return ExecutionHandler(this->reference_value != other.reference_value, this->b != other.b);
        }

        /**
         * @brief Execute the constant instruction (push constant bool_t to the stack)
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
            stack.push_back(bool_t(builder, instruction.arguments.element));
            if constexpr (SHOW_FUZZING_INFO) {
                debug_log("auto c", stack.size() - 1, " = bool_t(", instruction.arguments.element, ");\n");
            }
            return 0;
        }
        /**
         * @brief Execute the witness instruction (push witness bool_t to the stack)
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

            stack.push_back(
                ExecutionHandler(instruction.arguments.element, witness_t(builder, instruction.arguments.element)));
            if constexpr (SHOW_FUZZING_INFO) {
                debug_log("auto w", stack.size() - 1, " = witness_t(", instruction.arguments.element, ");\n");
            }
            return 0;
        }
        /**
         * @brief Execute the and operator instruction
         *
         * @param builder
         * @param stack
         * @param instruction
         * @return if everything is ok, 1 if we should stop execution, since an expected error was encountered
         */
        static inline size_t execute_AND(Builder* builder,
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
                debug_log(args.out, " = ", args.lhs, " & ", args.rhs, ";\n");
            }
            ExecutionHandler result;
            result = stack[first_index] & stack[second_index];
            // If the output index is larger than the number of elements in stack, append
            if (output_index >= stack.size()) {
                stack.push_back(result);
            } else {
                stack[output_index] = result;
            }
            return 0;
        };
        /**
         * @brief Execute the or operator instruction
         *
         * @param builder
         * @param stack
         * @param instruction
         * @return if everything is ok, 1 if we should stop execution, since an expected error was encountered
         */
        static inline size_t execute_OR(Builder* builder,
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
                debug_log(args.out, " = ", args.lhs, " | ", args.rhs, ";\n");
            }
            ExecutionHandler result;
            result = stack[first_index] | stack[second_index];
            // If the output index is larger than the number of elements in stack, append
            if (output_index >= stack.size()) {
                stack.push_back(result);
            } else {
                stack[output_index] = result;
            }
            return 0;
        };
        /**
         * @brief Execute the xor operator instruction
         *
         * @param builder
         * @param stack
         * @param instruction
         * @return if everything is ok, 1 if we should stop execution, since an expected error was encountered
         */
        static inline size_t execute_XOR(Builder* builder,
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
                debug_log(args.out, " = ", args.lhs, " ^ ", args.rhs, ";\n");
            }
            ExecutionHandler result;
            result = stack[first_index] ^ stack[second_index];
            // If the output index is larger than the number of elements in stack, append
            if (output_index >= stack.size()) {
                stack.push_back(result);
            } else {
                stack[output_index] = result;
            }
            return 0;
        };
        /**
         * @brief Execute the NOT instruction
         *
         * @param builder
         * @param stack
         * @param instruction
         * @return if everything is ok, 1 if we should stop execution, since an expected error was encountered
         */
        static inline size_t execute_NOT(Builder* builder,
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
                debug_log(args.out, " = !", args.rhs, ";\n");
            }
            ExecutionHandler result;
            result = stack[first_index].not_();
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
                auto args = format_two_arg(stack, second_index, third_index, output_index);
                debug_log(args.out, " = select_if_eq(", args.lhs, ", ", args.rhs, ");\n");
            }
            ExecutionHandler result;
            result = stack[first_index].select_if_eq(stack[second_index], stack[third_index]);
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
                auto args = format_two_arg(stack, first_index, second_index, 0);
                debug_log("assert_equal(", args.lhs, " ^ ", args.rhs, ", ", args.rhs, " ^ ", args.lhs, ");\n");
            }
            stack[first_index].assert_equal(stack[second_index]);
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
                debug_log(args.out, " = set(", args.rhs, ");\n");
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

        static inline size_t execute_IMPLIES(Builder* builder,
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
                debug_log(args.out, " = ", args.lhs, ".implies(", args.rhs, ");\n");
            }
            ExecutionHandler result = stack[first_index].implies(stack[second_index]);
            if (output_index >= stack.size()) {
                stack.push_back(result);
            } else {
                stack[output_index] = result;
            }
            return 0;
        };
        static inline size_t execute_IMPLIES_BOTH_WAYS(Builder* builder,
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
                debug_log(args.out, " = ", args.lhs, ".implies_both_ways(", args.rhs, ");\n");
            }
            ExecutionHandler result = stack[first_index].implies_both_ways(stack[second_index]);
            if (output_index >= stack.size()) {
                stack.push_back(result);
            } else {
                stack[output_index] = result;
            }
            return 0;
        };
        static inline size_t execute_BOOL_EQUAL(Builder* builder,
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
                debug_log(args.out, " = ", args.lhs, " == ", args.rhs, ";\n");
            }
            ExecutionHandler result = stack[first_index].bool_equal(stack[second_index]);
            if (output_index >= stack.size()) {
                stack.push_back(result);
            } else {
                stack[output_index] = result;
            }
            return 0;
        };
        static inline size_t execute_BOOL_NOT_EQUAL(Builder* builder,
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
                debug_log(args.out, " = ", args.lhs, " != ", args.rhs, ";\n");
            }
            ExecutionHandler result = stack[first_index].bool_not_equal(stack[second_index]);
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
    inline static bool postProcess(Builder* builder, std::vector<BoolFuzzBase::ExecutionHandler>& stack)
    {
        (void)builder;
        for (size_t i = 0; i < stack.size(); i++) {
            auto element = stack[i];
            if (element.b.get_value() != element.reference_value) {
                std::cerr << "Other: " << element.b.get_value() << std::endl;
                std::cerr << "Reference value: " << element.reference_value << std::endl;
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
        HavocSettings{ .GEN_LLVM_POST_MUTATION_PROB = static_cast<size_t>(((random() % (20 - 1)) + 1) * 10),
                       .GEN_MUTATION_COUNT_LOG = static_cast<size_t>((random() % 8) + 1),
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
                       .VAL_MUT_SPECIAL_VALUE_PROBABILITY = static_cast<size_t>(random() % 100) };
    while (fuzzer_havoc_settings.GEN_STRUCTURAL_MUTATION_PROBABILITY == 0 &&
           fuzzer_havoc_settings.GEN_VALUE_MUTATION_PROBABILITY == 0) {
        fuzzer_havoc_settings.GEN_STRUCTURAL_MUTATION_PROBABILITY = static_cast<size_t>(random() % 8);
        fuzzer_havoc_settings.GEN_VALUE_MUTATION_PROBABILITY = static_cast<size_t>(random() % 8);
    }
    std::cerr << "SETTINGS:" << fuzzer_havoc_settings.GEN_LLVM_POST_MUTATION_PROB << ":"
              << fuzzer_havoc_settings.GEN_MUTATION_COUNT_LOG << ":"
              << fuzzer_havoc_settings.GEN_STRUCTURAL_MUTATION_PROBABILITY << ":"
              << fuzzer_havoc_settings.GEN_VALUE_MUTATION_PROBABILITY << ":"
              << fuzzer_havoc_settings.ST_MUT_DELETION_PROBABILITY << ":"
              << fuzzer_havoc_settings.ST_MUT_DUPLICATION_PROBABILITY << ":"
              << fuzzer_havoc_settings.ST_MUT_INSERTION_PROBABILITY << ":"
              << fuzzer_havoc_settings.ST_MUT_MAXIMUM_DELETION_LOG << ":"
              << fuzzer_havoc_settings.ST_MUT_MAXIMUM_DUPLICATION_LOG << ":"
              << fuzzer_havoc_settings.ST_MUT_SWAP_PROBABILITY << ":"
              << fuzzer_havoc_settings.VAL_MUT_LLVM_MUTATE_PROBABILITY << ":"
              << fuzzer_havoc_settings.VAL_MUT_MONTGOMERY_PROBABILITY << ":"
              << fuzzer_havoc_settings.VAL_MUT_NON_MONTGOMERY_PROBABILITY << ":"
              << fuzzer_havoc_settings.VAL_MUT_SMALL_ADDITION_PROBABILITY << ":"
              << fuzzer_havoc_settings.VAL_MUT_SPECIAL_VALUE_PROBABILITY << std::endl;
#else
    // Calibrated 2026-05-14: 200 runs * 1200s, 20 parallel, scored by ft * new_units / 1000
    fuzzer_havoc_settings = HavocSettings{
        .GEN_LLVM_POST_MUTATION_PROB = 10,
        .GEN_MUTATION_COUNT_LOG = 7,
        .GEN_STRUCTURAL_MUTATION_PROBABILITY = 56,
        .GEN_VALUE_MUTATION_PROBABILITY = 52,
        .ST_MUT_DELETION_PROBABILITY = 28,
        .ST_MUT_DUPLICATION_PROBABILITY = 15,
        .ST_MUT_INSERTION_PROBABILITY = 41,
        .ST_MUT_MAXIMUM_DELETION_LOG = 4,
        .ST_MUT_MAXIMUM_DUPLICATION_LOG = 5,
        .ST_MUT_SWAP_PROBABILITY = 14,
        .VAL_MUT_LLVM_MUTATE_PROBABILITY = 98,
        .VAL_MUT_MONTGOMERY_PROBABILITY = 45,
        .VAL_MUT_NON_MONTGOMERY_PROBABILITY = 27,
        .VAL_MUT_SMALL_ADDITION_PROBABILITY = 15,
        .VAL_MUT_SPECIAL_VALUE_PROBABILITY = 13,
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
    RunWithBuilders<BoolFuzzBase, FuzzerCircuitTypes>(Data, Size, VarianceRNG);
    return 0;
}

#pragma clang diagnostic pop

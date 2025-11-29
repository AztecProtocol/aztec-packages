#include "block_constraint.hpp"
#include "acir_format.hpp"
#include "acir_format_mocks.hpp"
#include "barretenberg/flavor/mega_flavor.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"

#include "barretenberg/dsl/acir_format/block_constraint.hpp"
#include "barretenberg/dsl/acir_format/test_class.hpp"
#include "barretenberg/dsl/acir_format/utils.hpp"

#include <cstdint>
#include <gtest/gtest.h>
#include <vector>

using namespace acir_format;

namespace {
auto& engine = numeric::get_debug_randomness();
} // namespace

/**
 * @brief Utility method to add read/write operations with constant indices/values
 */
template <AccessType access_type>
void add_constant_ops(const size_t table_size,
                      const std::vector<bb::fr>& table_values,
                      WitnessVector& witness_values,
                      std::vector<MemOp>& trace)
{
    const size_t table_index = static_cast<size_t>(engine.get_random_uint32() % table_size);
    bb::fr value_fr =
        access_type == AccessType::Read ? table_values[table_index] : table_values[table_index] + bb::fr(1);

    // Index constant, value witness
    {
        WitnessOrConstant<bb::fr> index = WitnessOrConstant<bb::fr>::from_constant(table_index);
        WitnessOrConstant<bb::fr> value =
            WitnessOrConstant<bb::fr>::from_index(add_to_witness_and_track_indices(witness_values, value_fr));

        const MemOp read_op = { .access_type = access_type, .index = index, .value = value };

        trace.push_back(read_op);
    }
    // Index witness, value constant
    {
        WitnessOrConstant<bb::fr> index = WitnessOrConstant<bb::fr>::from_index(
            add_to_witness_and_track_indices(witness_values, bb::fr(table_index)));
        WitnessOrConstant<bb::fr> value = WitnessOrConstant<bb::fr>::from_constant(value_fr);

        const MemOp read_op = { .access_type = access_type, .index = index, .value = value };

        trace.push_back(read_op);
    }
    // Index constant, value constant
    {
        WitnessOrConstant<bb::fr> index = WitnessOrConstant<bb::fr>::from_constant(table_index);
        WitnessOrConstant<bb::fr> value = WitnessOrConstant<bb::fr>::from_constant(value_fr);

        const MemOp read_op = { .access_type = access_type, .index = index, .value = value };

        trace.push_back(read_op);
    }
}

template <typename Builder_, size_t TableSize_, size_t NumReads_, bool PerformConstantOps_> struct ROMTestParams {
    using Builder = Builder_;
    static constexpr size_t table_size = TableSize_;
    static constexpr size_t num_reads = NumReads_;
    static constexpr bool perform_constant_ops = PerformConstantOps_;
};

template <typename Builder_, size_t table_size, size_t num_reads, bool perform_constant_ops> class ROMTestingFunctions {
  public:
    using AcirConstraint = BlockConstraint;
    using Builder = Builder_;
    class InvalidWitness {
      public:
        enum class Target : uint8_t { None, ReadValueIncremented };
        static std::vector<Target> get_all()
        {
            std::vector<Target> targets = { Target::None };
            if constexpr (num_reads > 0 && table_size > 0) {
                targets.push_back(Target::ReadValueIncremented);
            }
            return targets;
        };
        static std::vector<std::string> get_labels()
        {
            std::vector<std::string> labels = { "None" };
            if constexpr (num_reads > 0 && table_size > 0) {
                labels.push_back("ReadValueIncremented");
            }
            return labels;
        };
    };

    static void generate_constraints(AcirConstraint& memory_constraint, WitnessVector& witness_values)
    {
        // Create initial memory values "natively"
        std::vector<bb::fr> table_values;
        table_values.reserve(table_size);
        for (size_t _i = 0; _i < table_size; _i++) {
            table_values.push_back(bb::fr::random_element());
        }

        // `init_poly` represents the _initial values_ of the circuit.
        std::vector<uint32_t> init_indices;
        for (const auto& val : table_values) {
            uint32_t value_index = add_to_witness_and_track_indices(witness_values, val);
            // push the circuit incarnation of the value in `init_indices`
            init_indices.push_back(value_index);
        }

        // Initialize and create memory operations
        std::vector<MemOp> trace;

        // Add index witness only if we have a non-empty table
        if constexpr (table_size > 0) {
            for (size_t _i = 0; _i < num_reads; ++_i) {
                const size_t rom_index_to_read = static_cast<size_t>(engine.get_random_uint32() % table_size);
                // Add value witness
                bb::fr read_value = table_values[rom_index_to_read];

                WitnessOrConstant<bb::fr> index_for_read = WitnessOrConstant<bb::fr>::from_index(
                    add_to_witness_and_track_indices(witness_values, bb::fr(rom_index_to_read)));
                WitnessOrConstant<bb::fr> value_for_read =
                    WitnessOrConstant<bb::fr>::from_index(add_to_witness_and_track_indices(witness_values, read_value));

                const MemOp read_op = { .access_type = AccessType::Read,
                                        .index = index_for_read,
                                        .value = value_for_read };

                trace.push_back(read_op);
            }
            if constexpr (perform_constant_ops) {
                add_constant_ops<AccessType::Read>(table_size, table_values, witness_values, trace);
            }
        }
        // Create the MemoryConstraint
        memory_constraint = AcirConstraint{ .init = init_indices, .trace = trace, .type = BlockType::ROM };
    }

    static void invalidate_witness([[maybe_unused]] AcirConstraint& memory_constraint,
                                   WitnessVector& witness_values,
                                   const InvalidWitness::Target& invalid_witness_target)
    {
        switch (invalid_witness_target) {
        case InvalidWitness::Target::None:
            break;
        case InvalidWitness::Target::ReadValueIncremented:
            if constexpr (num_reads > 0 && table_size > 0) {
                // Tamper with a random read value
                const size_t random_read = static_cast<size_t>(engine.get_random_uint32() % num_reads);
                // Each read has 2 witness values: index at offset 0, value at offset 1
                // The reads start after the table_size init values
                const size_t read_value_witness_index = table_size + (random_read * 2) + 1;
                witness_values[read_value_witness_index] += bb::fr(1);
            }
            break;
        }
    }
};
template <typename Params>
class ROMTest : public ::testing::Test,
                public TestClass<ROMTestingFunctions<typename Params::Builder,
                                                     Params::table_size,
                                                     Params::num_reads,
                                                     Params::perform_constant_ops>> {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

using ROMTestConfigs = testing::Types<ROMTestParams<UltraCircuitBuilder, 0, 0, false>,
                                      ROMTestParams<UltraCircuitBuilder, 10, 0, false>,
                                      ROMTestParams<UltraCircuitBuilder, 10, 0, true>, // Test the case in which there
                                                                                       // are only constant operations
                                      ROMTestParams<MegaCircuitBuilder, 10, 10, true>,
                                      ROMTestParams<MegaCircuitBuilder, 10, 20, true>>;

TYPED_TEST_SUITE(ROMTest, ROMTestConfigs);

TYPED_TEST(ROMTest, GenerateVKFromConstraints)
{
    using Flavor =
        std::conditional_t<std::is_same_v<typename TypeParam::Builder, UltraCircuitBuilder>, UltraFlavor, MegaFlavor>;
    TestFixture::template test_vk_independence<Flavor>();
}

TYPED_TEST(ROMTest, Tampering)
{
    TestFixture::test_tampering();
}

template <typename Builder_, size_t TableSize_, size_t NumReads_, size_t NumWrites_, bool PerformConstantOps_>
struct RAMTestParams {
    using Builder = Builder_;
    static constexpr size_t table_size = TableSize_;
    static constexpr size_t num_reads = NumReads_;
    static constexpr size_t num_writes = NumWrites_;
    static constexpr bool perform_constant_ops = PerformConstantOps_;
};

template <typename Builder_, size_t table_size, size_t num_reads, size_t num_writes, bool perform_constant_ops>
class RAMTestingFunctions {
  public:
    using AcirConstraint = BlockConstraint;
    using Builder = Builder_;

    // Track witness value and its index in witness_values
    struct WitnessValue {
        bb::fr value;
        uint32_t witness_index;
    };

    // Instance member to track reads for invalidating witnesses.
    std::vector<WitnessValue> read_values;

    class InvalidWitness {
      public:
        enum class Target : uint8_t { None, ReadValueIncremented };
        static std::vector<Target> get_all()
        {
            std::vector<Target> targets = { Target::None };
            if constexpr (num_reads > 0 && table_size > 0) {
                targets.push_back(Target::ReadValueIncremented);
            }
            return targets;
        };
        static std::vector<std::string> get_labels()
        {
            std::vector<std::string> labels = { "None" };
            if constexpr (num_reads > 0 && table_size > 0) {
                labels.push_back("ReadValueIncremented");
            }
            return labels;
        };
    };

    void generate_constraints(AcirConstraint& memory_constraint, WitnessVector& witness_values)
    {
        // Clear any previous state
        read_values.clear();

        // Create initial memory values "natively". RAM tables always start out initialized.
        std::vector<bb::fr> table_values;
        table_values.reserve(table_size);
        for (size_t _i = 0; _i < table_size; _i++) {
            table_values.push_back(bb::fr::random_element());
        }

        // `init_indices` contains the initial values of the circuit.
        std::vector<uint32_t> init_indices;
        for (size_t i = 0; i < table_size; ++i) {
            const auto val = table_values[i];
            uint32_t value_index = add_to_witness_and_track_indices(witness_values, val);
            init_indices.push_back(value_index);
        }
        // Initialize and create memory operations
        std::vector<MemOp> trace;
        size_t num_reads_remaining = num_reads;
        size_t num_writes_remaining = num_writes;

        // `read_write_sequence` is a _random_ list of read and write operations.
        std::vector<AccessType> read_write_sequence;
        while (num_reads_remaining + num_writes_remaining > 0) {
            bool try_read = (engine.get_random_uint32() & 1) != 0;
            if (try_read && (num_reads_remaining > 0)) {
                read_write_sequence.push_back(AccessType::Read);
                num_reads_remaining--;
            } else if (num_writes_remaining > 0) {
                read_write_sequence.push_back(AccessType::Write);
                num_writes_remaining--;
            } else {
                // writes exhausted, hence only reads left
                for (size_t _j = 0; _j < num_reads_remaining; _j++) {
                    read_write_sequence.push_back(AccessType::Read);
                }
                num_reads_remaining = 0;
            }
        }

        // Add read/writes only if we have a non-empty table
        if constexpr (table_size > 0) {
            for (auto& access_type : read_write_sequence) {
                MemOp mem_op;
                switch (access_type) {
                case AccessType::Read: {
                    const size_t ram_index_to_read = static_cast<size_t>(engine.get_random_uint32() % table_size);
                    const uint32_t index_for_read =
                        add_to_witness_and_track_indices(witness_values, bb::fr(ram_index_to_read));
                    bb::fr read_value = table_values[ram_index_to_read];
                    const uint32_t value_for_read = add_to_witness_and_track_indices(witness_values, read_value);

                    // Record this read value and its witness index
                    read_values.push_back({ .value = read_value, .witness_index = value_for_read });

                    mem_op = { .access_type = AccessType::Read,
                               .index = WitnessOrConstant<bb::fr>::from_index(index_for_read),
                               .value = WitnessOrConstant<bb::fr>::from_index(value_for_read) };
                    trace.push_back(mem_op);
                    break;
                }
                case AccessType::Write: {
                    const size_t ram_index_to_write = static_cast<size_t>(engine.get_random_uint32() % table_size);
                    const uint32_t index_to_write =
                        add_to_witness_and_track_indices(witness_values, bb::fr(ram_index_to_write));
                    bb::fr write_value = bb::fr::random_element();
                    const uint32_t value_to_write = add_to_witness_and_track_indices(witness_values, write_value);

                    // Update the table_values to reflect this write
                    table_values[ram_index_to_write] = write_value;

                    mem_op = { .access_type = AccessType::Write,
                               .index = WitnessOrConstant<bb::fr>::from_index(index_to_write),
                               .value = WitnessOrConstant<bb::fr>::from_index(value_to_write) };
                    trace.push_back(mem_op);
                    break;
                }
                }
            }
            if constexpr (perform_constant_ops) {
                add_constant_ops<AccessType::Read>(table_size, table_values, witness_values, trace);
                add_constant_ops<AccessType::Write>(table_size, table_values, witness_values, trace);
            }

            BB_ASSERT_EQ(read_values.size(), num_reads); // sanity check to make sure the number of reads is correct.
            // Create the MemoryConstraint
        }
        memory_constraint = AcirConstraint{ .init = init_indices, .trace = trace, .type = BlockType::RAM };
    }

    void invalidate_witness([[maybe_unused]] AcirConstraint& memory_constraint,
                            WitnessVector& witness_values,
                            const InvalidWitness::Target& invalid_witness_target)
    {
        switch (invalid_witness_target) {
        case InvalidWitness::Target::None:
            break;
        case InvalidWitness::Target::ReadValueIncremented:
            if constexpr (num_reads > 0 && table_size > 0) {
                // Tamper with a random read value using the recorded witness index
                if (!read_values.empty()) {
                    const size_t random_read_idx = static_cast<size_t>(engine.get_random_uint32() % read_values.size());
                    const uint32_t witness_idx = read_values[random_read_idx].witness_index;
                    witness_values[witness_idx] += bb::fr(1);
                }
            }
            break;
        }
    }
};

template <typename Params>
class RAMTest : public ::testing::Test,
                public TestClass<RAMTestingFunctions<typename Params::Builder,
                                                     Params::table_size,
                                                     Params::num_reads,
                                                     Params::num_writes,
                                                     Params::perform_constant_ops>> {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

// Failure tests are impossible in the scenario with only writes.
using RAMTestConfigs =
    testing::Types<RAMTestParams<UltraCircuitBuilder, 0, 0, 0, false>,
                   RAMTestParams<UltraCircuitBuilder, 10, 0, 0, false>,
                   RAMTestParams<UltraCircuitBuilder, 10, 0, 0, true>, // Test the case in which there are only
                                                                       // constant operations
                   RAMTestParams<UltraCircuitBuilder, 10, 0, 10, false>,
                   RAMTestParams<UltraCircuitBuilder, 10, 0, 10, true>,
                   RAMTestParams<UltraCircuitBuilder, 10, 10, 0, false>,
                   RAMTestParams<UltraCircuitBuilder, 10, 10, 0, true>,
                   RAMTestParams<UltraCircuitBuilder, 10, 20, 10, true>,
                   RAMTestParams<MegaCircuitBuilder, 0, 0, 0, false>,
                   RAMTestParams<MegaCircuitBuilder, 10, 0, 0, false>,
                   RAMTestParams<MegaCircuitBuilder, 10, 0, 0, true>, // Test the case in which there are only
                                                                      // constant operations
                   RAMTestParams<MegaCircuitBuilder, 10, 0, 10, false>,
                   RAMTestParams<MegaCircuitBuilder, 10, 0, 10, true>,
                   RAMTestParams<MegaCircuitBuilder, 10, 10, 0, false>,
                   RAMTestParams<MegaCircuitBuilder, 10, 10, 0, true>,
                   RAMTestParams<MegaCircuitBuilder, 10, 20, 10, true>>;

TYPED_TEST_SUITE(RAMTest, RAMTestConfigs);

TYPED_TEST(RAMTest, GenerateVKFromConstraints)
{
    using Flavor =
        std::conditional_t<std::is_same_v<typename TypeParam::Builder, UltraCircuitBuilder>, UltraFlavor, MegaFlavor>;
    TestFixture::template test_vk_independence<Flavor>();
}

TYPED_TEST(RAMTest, Tampering)
{
    TestFixture::test_tampering();
}

template <CallDataType CallDataType_, size_t CallDataSize_, size_t NumReads_, bool PerformConstantOps_>
struct CallDataTestParams {
    static constexpr CallDataType calldata_type = CallDataType_;
    static constexpr size_t calldata_size = CallDataSize_;
    static constexpr size_t num_reads = NumReads_;
    static constexpr bool perform_constant_ops = PerformConstantOps_;
};

template <CallDataType calldata_type, size_t calldata_size, size_t num_reads, bool perform_constant_ops>
class CallDataTestingFunctions {
  public:
    using AcirConstraint = BlockConstraint;
    using Builder = MegaCircuitBuilder;

    class InvalidWitness {
      public:
        enum class Target : uint8_t { None, ReadValueIncremented };

        static std::vector<Target> get_all() { return { Target::None, Target::ReadValueIncremented }; };

        static std::vector<std::string> get_labels() { return { "None", "ReadValueIncremented" }; };
    };

    void generate_constraints(AcirConstraint& memory_constraint, WitnessVector& witness_values)
    {

        // Create initial memory values "natively". Memory tables always start out initialized.
        std::vector<bb::fr> calldata_values;
        calldata_values.reserve(calldata_size);
        for (size_t _i = 0; _i < calldata_size; _i++) {
            calldata_values.push_back(bb::fr::random_element());
        }

        // `init_indices` contains the initial values of the circuit.
        std::vector<uint32_t> init_indices;
        for (size_t i = 0; i < calldata_size; ++i) {
            uint32_t value_index = add_to_witness_and_track_indices(witness_values, calldata_values[i]);
            init_indices.push_back(value_index);
        }
        // Initialize and create memory operations
        std::vector<MemOp> trace;

        // Add read operations
        for (size_t idx = 0; idx < num_reads; ++idx) {
            MemOp mem_op;
            const size_t calldata_idx_to_read = static_cast<size_t>(engine.get_random_uint32() % calldata_size);
            const uint32_t index_for_read =
                add_to_witness_and_track_indices(witness_values, bb::fr(calldata_idx_to_read));
            bb::fr read_value = calldata_values[calldata_idx_to_read];
            const uint32_t value_for_read = add_to_witness_and_track_indices(witness_values, read_value);

            mem_op = { .access_type = AccessType::Read,
                       .index = WitnessOrConstant<bb::fr>::from_index(index_for_read),
                       .value = WitnessOrConstant<bb::fr>::from_index(value_for_read) };
            trace.push_back(mem_op);
        }
        if constexpr (perform_constant_ops) {
            add_constant_ops<AccessType::Read>(calldata_size, calldata_values, witness_values, trace);
        }

        // Create the MemoryConstraint
        memory_constraint = AcirConstraint{
            .init = init_indices, .trace = trace, .type = BlockType::CallData, .calldata_id = calldata_type
        };
    }

    void invalidate_witness(AcirConstraint& memory_constraint,
                            WitnessVector& witness_values,
                            const InvalidWitness::Target& invalid_witness_target)
    {
        switch (invalid_witness_target) {
        case InvalidWitness::Target::None:
            break;
        case InvalidWitness::Target::ReadValueIncremented:
            // Tamper with a random read value using the recorded witness index
            const size_t random_read_idx = static_cast<size_t>(engine.get_random_uint32() % num_reads);
            const uint32_t witness_idx = memory_constraint.trace[random_read_idx].index.index;
            witness_values[witness_idx] += bb::fr(1);
            break;
        }
    }
};

using CallDataTestConfigs = testing::Types<CallDataTestParams<CallDataType::Primary, 10, 5, false>,
                                           CallDataTestParams<CallDataType::Primary, 10, 5, true>>;

template <typename Params>
class CallDataTests : public ::testing::Test,
                      public TestClass<CallDataTestingFunctions<Params::calldata_type,
                                                                Params::calldata_size,
                                                                Params::num_reads,
                                                                Params::perform_constant_ops>> {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

TYPED_TEST_SUITE(CallDataTests, CallDataTestConfigs);

TYPED_TEST(CallDataTests, GenerateVKFromConstraints)
{
    TestFixture::template test_vk_independence<MegaFlavor>();
}

TYPED_TEST(CallDataTests, Tampering)
{
    TestFixture::test_tampering();
}

template <size_t returndata_size>

class ReturnDataTestingFunctions {
  public:
    using AcirConstraint = BlockConstraint;
    using Builder = MegaCircuitBuilder;

    // There is no tampering that can be done for ReturnData as the only thing that a return data opcode does is
    // adding data to the return data bus vector and constraining such data to be equal to the data with which the
    // memory operation was initialized
    class InvalidWitness {
      public:
        enum class Target : uint8_t { None };

        static std::vector<Target> get_all() { return { Target::None }; };

        static std::vector<std::string> get_labels() { return { "None" }; };
    };

    void generate_constraints(AcirConstraint& memory_constraint, WitnessVector& witness_values)
    {
        // Create initial memory values "natively". Memory tables always start out initialized.
        std::vector<bb::fr> returndata_values;
        returndata_values.reserve(returndata_size);
        for (size_t _i = 0; _i < returndata_size; _i++) {
            returndata_values.push_back(bb::fr::random_element());
        }

        // `init_indices` contains the initial values of the circuit.
        std::vector<uint32_t> init_indices;
        for (size_t i = 0; i < returndata_size; ++i) {
            uint32_t value_index = add_to_witness_and_track_indices(witness_values, returndata_values[i]);
            init_indices.push_back(value_index);
        }

        // Create the MemoryConstraint
        memory_constraint = AcirConstraint{ .init = init_indices, .trace = {}, .type = BlockType::ReturnData };
    }

    void invalidate_witness([[maybe_unused]] AcirConstraint& memory_constraint,
                            [[maybe_unused]] WitnessVector& witness_values,
                            const InvalidWitness::Target& invalid_witness_target)
    {
        switch (invalid_witness_target) {
        case InvalidWitness::Target::None:
            break;
        }
    }
};

static constexpr size_t RETURNDATA_SIZE = 10;
class ReturnDataTests : public ::testing::Test, public TestClass<ReturnDataTestingFunctions<RETURNDATA_SIZE>> {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

TEST_F(ReturnDataTests, GenerateVKFromConstraints)
{
    test_vk_independence<MegaFlavor>();
}

template <typename Builder> class EmptyBlockConstraintTests : public ::testing::Test {};

using BuilderTypes = testing::Types<UltraCircuitBuilder, MegaCircuitBuilder>;
TYPED_TEST_SUITE(EmptyBlockConstraintTests, BuilderTypes);

// Test that all block constraint types handle empty initialization gracefully
TYPED_TEST(EmptyBlockConstraintTests, EmptyBlockConstraints)
{
    using Builder = TypeParam;

    std::vector<std::pair<BlockType, CallDataType>> types_to_test;

    // Test each block constraint type
    if constexpr (IsUltraBuilder<Builder>) {
        types_to_test = { { BlockType::ROM, CallDataType::None }, { BlockType::RAM, CallDataType::None } };
    } else {
        types_to_test = { { BlockType::ROM, CallDataType::None },
                          { BlockType::RAM, CallDataType::None },
                          { BlockType::CallData, CallDataType::Primary },
                          { BlockType::CallData, CallDataType::Secondary },
                          { BlockType::ReturnData, CallDataType::None } };
    }

    // Create empty block constraint
    for (auto type : types_to_test) {
        BlockConstraint block{
            .init = {},  // Empty initialization data
            .trace = {}, // Empty trace
            .type = type.first,
            .calldata_id = type.second,
        };

        AcirProgram program;
        program.constraints = {
            .varnum = 0, // No variables needed for empty block constraints
            .num_acir_opcodes = 1,
            .public_inputs = {},
            .block_constraints = { block },
            .original_opcode_indices = create_empty_original_opcode_indices(),
        };

        mock_opcode_indices(program.constraints);

        // Circuit construction should succeed without errors
        auto circuit = create_circuit<Builder>(program);
        EXPECT_TRUE(CircuitChecker::check(circuit));
    }
}

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
// returns a `poly_triple` from the value index corresponding to a witness.
[[maybe_unused]] poly_triple poly_triple_from_witness(uint32_t value_index)
{
    return poly_triple{ .a = value_index, .b = 0, .c = 0, .q_m = 0, .q_l = 1, .q_r = 0, .q_o = 0, .q_c = 0 };
}
// returns a `poly_triple` from a constant.
[[maybe_unused]] poly_triple poly_triple_from_constant(bb::fr constant_value)
{
    return poly_triple{ .a = 0, .b = 0, .c = 0, .q_m = 0, .q_l = 0, .q_r = 0, .q_o = 0, .q_c = constant_value };
}
} // namespace
template <typename Builder_, size_t TableSize_, size_t NumReads_> struct ROMTestParams {
    using Builder = Builder_;
    static constexpr size_t table_size = TableSize_;
    static constexpr size_t num_reads = NumReads_;
};
template <typename Builder_, size_t table_size, size_t num_reads> class ROMTestingFunctions {
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
        std::vector<poly_triple> init_polys;
        for (const auto& val : table_values) {
            uint32_t value_index = add_to_witness_and_track_indices(witness_values, val);
            // push the circuit incarnation of the value in `init_polys`
            init_polys.push_back(poly_triple_from_witness(value_index));
        }

        // Initialize and create memory operations
        std::vector<MemOp> trace;

        // Add index witness only if we have a non-empty table
        if constexpr (table_size > 0) {
            for (size_t _i = 0; _i < num_reads; ++_i) {
                const size_t rom_index_to_read = static_cast<size_t>(engine.get_random_uint32() % table_size);

                // Add index witness
                const uint32_t index_for_read =
                    add_to_witness_and_track_indices(witness_values, bb::fr(rom_index_to_read));
                // Add value witness
                bb::fr read_value = table_values[rom_index_to_read];
                const uint32_t value_for_read = add_to_witness_and_track_indices(witness_values, read_value);

                const MemOp read_op = { .access_type = 0, // READ
                                        .index = poly_triple_from_witness(index_for_read),
                                        .value = poly_triple_from_witness(value_for_read) };
                trace.push_back(read_op);
            }
        }
        // Create the MemoryConstraint
        memory_constraint = AcirConstraint{ .init = init_polys, .trace = trace, .type = BlockType::ROM };
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
                public TestClass<ROMTestingFunctions<typename Params::Builder, Params::table_size, Params::num_reads>> {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

using ROMTestConfigs = testing::Types<ROMTestParams<UltraCircuitBuilder, 0, 0>,
                                      ROMTestParams<UltraCircuitBuilder, 10, 0>,
                                      ROMTestParams<MegaCircuitBuilder, 10, 10>,
                                      ROMTestParams<MegaCircuitBuilder, 10, 20>>;

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

template <typename Builder_, size_t TableSize_, size_t NumReads_, size_t NumWrites_> struct RAMTestParams {
    using Builder = Builder_;
    static constexpr size_t table_size = TableSize_;
    static constexpr size_t num_reads = NumReads_;
    static constexpr size_t num_writes = NumWrites_;
};

template <typename Builder_, size_t table_size, size_t num_reads, size_t num_writes> class RAMTestingFunctions {
  public:
    using AcirConstraint = BlockConstraint;
    using Builder = Builder_;
    enum class AccessType : std::uint8_t { READ, WRITE };

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

        // `init_polys` contains the initial values of the circuit. we set half of them to be constants and half to be
        // witnesses.
        std::vector<poly_triple> init_polys;
        for (size_t i = 0; i < table_size; ++i) {
            const auto val = table_values[i];
            if (i % 2 == 0) {
                uint32_t value_index = add_to_witness_and_track_indices(witness_values, val);
                init_polys.push_back(poly_triple_from_witness(value_index));
            } else {
                init_polys.push_back(poly_triple_from_constant(val));
            }
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
                read_write_sequence.push_back(AccessType::READ);
                num_reads_remaining--;
            } else if (num_writes_remaining > 0) {
                read_write_sequence.push_back(AccessType::WRITE);
                num_writes_remaining--;
            } else {
                // writes exhausted, hence only reads left
                for (size_t _j = 0; _j < num_reads_remaining; _j++) {
                    read_write_sequence.push_back(AccessType::READ);
                }
                num_reads_remaining = 0;
            }
        }

        // Add read/writes only if we have a non-empty table
        if constexpr (table_size > 0) {
            for (auto& access_type : read_write_sequence) {
                MemOp mem_op;
                switch (access_type) {
                case AccessType::READ: {
                    const size_t ram_index_to_read = static_cast<size_t>(engine.get_random_uint32() % table_size);
                    const uint32_t index_for_read =
                        add_to_witness_and_track_indices(witness_values, bb::fr(ram_index_to_read));
                    bb::fr read_value = table_values[ram_index_to_read];
                    const uint32_t value_for_read = add_to_witness_and_track_indices(witness_values, read_value);

                    // Record this read value and its witness index
                    read_values.push_back({ .value = read_value, .witness_index = value_for_read });

                    mem_op = { .access_type = 0, // READ
                               .index = poly_triple_from_witness(index_for_read),
                               .value = poly_triple_from_witness(value_for_read) };
                    trace.push_back(mem_op);
                    break;
                }
                case AccessType::WRITE: {
                    const size_t ram_index_to_write = static_cast<size_t>(engine.get_random_uint32() % table_size);
                    const uint32_t index_to_write =
                        add_to_witness_and_track_indices(witness_values, bb::fr(ram_index_to_write));
                    bb::fr write_value = bb::fr::random_element();
                    const uint32_t value_to_write = add_to_witness_and_track_indices(witness_values, write_value);

                    // Update the table_values to reflect this write
                    table_values[ram_index_to_write] = write_value;

                    mem_op = { .access_type = 1, // WRITE
                               .index = poly_triple_from_witness(index_to_write),
                               .value = poly_triple_from_witness(value_to_write) };
                    trace.push_back(mem_op);
                    break;
                }
                }
            }
        }
        BB_ASSERT_EQ(read_values.size(), num_reads); // sanity check to make sure the number of reads is correct.
        // Create the MemoryConstraint
        memory_constraint = AcirConstraint{ .init = init_polys, .trace = trace, .type = BlockType::RAM };
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
class RAMTest
    : public ::testing::Test,
      public TestClass<
          RAMTestingFunctions<typename Params::Builder, Params::table_size, Params::num_reads, Params::num_writes>> {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

// Failure tests are impossible in the scenario with only writes.
using RAMTestConfigs = testing::Types<RAMTestParams<UltraCircuitBuilder, 0, 0, 0>,
                                      RAMTestParams<UltraCircuitBuilder, 10, 10, 0>,
                                      RAMTestParams<UltraCircuitBuilder, 10, 20, 10>,
                                      RAMTestParams<MegaCircuitBuilder, 0, 0, 0>,
                                      RAMTestParams<MegaCircuitBuilder, 10, 10, 0>,
                                      RAMTestParams<MegaCircuitBuilder, 10, 20, 10>>;

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

class MegaHonk : public ::testing::Test {
  public:
    using Flavor = MegaFlavor;
    using Builder = Flavor::CircuitBuilder;
    using Prover = UltraProver_<Flavor>;
    using Verifier = UltraVerifier_<Flavor>;
    using VerificationKey = Flavor::VerificationKey;

    // Construct and verify an MegaHonk proof for the provided circuit
    static bool prove_and_verify(Builder& circuit)
    {
        auto prover_instance = std::make_shared<ProverInstance_<Flavor>>(circuit);
        auto verification_key = std::make_shared<VerificationKey>(prover_instance->get_precomputed());
        Prover prover{ prover_instance, verification_key };
        auto proof = prover.construct_proof();

        Verifier verifier{ verification_key };

        bool result = verifier.template verify_proof<DefaultIO>(proof).result;
        return result;
    }

  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};
size_t generate_block_constraint(BlockConstraint& constraint, WitnessVector& witness_values)
{
    size_t witness_len = 0;
    witness_values.emplace_back(1);
    witness_len++;

    fr two = fr::one() + fr::one();
    poly_triple a0{
        .a = 0,
        .b = 0,
        .c = 0,
        .q_m = 0,
        .q_l = two,
        .q_r = 0,
        .q_o = 0,
        .q_c = 0,
    };
    fr three = fr::one() + two;
    poly_triple a1{
        .a = 0,
        .b = 0,
        .c = 0,
        .q_m = 0,
        .q_l = 0,
        .q_r = 0,
        .q_o = 0,
        .q_c = three,
    };
    poly_triple r1{
        .a = 0,
        .b = 0,
        .c = 0,
        .q_m = 0,
        .q_l = fr::one(),
        .q_r = 0,
        .q_o = 0,
        .q_c = fr::neg_one(),
    };
    poly_triple r2{
        .a = 0,
        .b = 0,
        .c = 0,
        .q_m = 0,
        .q_l = two,
        .q_r = 0,
        .q_o = 0,
        .q_c = fr::neg_one(),
    };
    poly_triple y{
        .a = 1,
        .b = 0,
        .c = 0,
        .q_m = 0,
        .q_l = fr::one(),
        .q_r = 0,
        .q_o = 0,
        .q_c = 0,
    };
    witness_values.emplace_back(2);
    witness_len++;
    poly_triple z{
        .a = 2,
        .b = 0,
        .c = 0,
        .q_m = 0,
        .q_l = fr::one(),
        .q_r = 0,
        .q_o = 0,
        .q_c = 0,
    };
    witness_values.emplace_back(3);
    witness_len++;
    MemOp op1{
        .access_type = 0,
        .index = r1,
        .value = y,
    };
    MemOp op2{
        .access_type = 0,
        .index = r2,
        .value = z,
    };
    constraint = BlockConstraint{
        .init = { a0, a1 },
        .trace = { op1, op2 },
        .type = BlockType::ROM,
    };

    return witness_len;
}

TEST_F(MegaHonk, Databus)
{
    BlockConstraint block;
    AcirProgram program;
    size_t num_variables = generate_block_constraint(block, program.witness);
    block.type = BlockType::CallData;

    program.constraints = {
        .varnum = static_cast<uint32_t>(num_variables),
        .num_acir_opcodes = 1,
        .public_inputs = {},
        .block_constraints = { block },
        .original_opcode_indices = create_empty_original_opcode_indices(),
    };

    mock_opcode_indices(program.constraints);

    // Construct a bberg circuit from the acir representation
    auto circuit = create_circuit<Builder>(program);

    EXPECT_TRUE(CircuitChecker::check(circuit));
}

TEST_F(MegaHonk, DatabusReturn)
{
    BlockConstraint block;
    AcirProgram program;
    size_t num_variables = generate_block_constraint(block, program.witness);
    block.type = BlockType::CallData;

    poly_triple rd_index{
        .a = static_cast<uint32_t>(num_variables),
        .b = 0,
        .c = 0,
        .q_m = 0,
        .q_l = 1,
        .q_r = 0,
        .q_o = 0,
        .q_c = 0,
    };
    program.witness.emplace_back(0);
    ++num_variables;
    auto fr_five = fr(5);
    poly_triple rd_read{
        .a = static_cast<uint32_t>(num_variables),
        .b = 0,
        .c = 0,
        .q_m = 0,
        .q_l = 1,
        .q_r = 0,
        .q_o = 0,
        .q_c = 0,
    };
    program.witness.emplace_back(fr_five);
    poly_triple five{
        .a = 0,
        .b = 0,
        .c = 0,
        .q_m = 0,
        .q_l = 0,
        .q_r = 0,
        .q_o = 0,
        .q_c = fr(fr_five),
    };
    ++num_variables;
    MemOp op_rd{
        .access_type = 0,
        .index = rd_index,
        .value = rd_read,
    };
    // Initialize the data_bus as [5] and read its value into rd_read
    auto return_data = BlockConstraint{
        .init = { five },
        .trace = { op_rd },
        .type = BlockType::ReturnData,
    };

    // Assert that call_data[0]+call_data[1] == return_data[0]
    poly_triple assert_equal{
        .a = 1,
        .b = 2,
        .c = rd_read.a,
        .q_m = 0,
        .q_l = 1,
        .q_r = 1,
        .q_o = fr::neg_one(),
        .q_c = 0,
    };

    program.constraints = {
        .varnum = static_cast<uint32_t>(num_variables),
        .num_acir_opcodes = 2,
        .public_inputs = {},
        .poly_triple_constraints = { assert_equal },
        .block_constraints = { block },
        .original_opcode_indices = create_empty_original_opcode_indices(),
    };
    mock_opcode_indices(program.constraints);

    // Construct a bberg circuit from the acir representation
    auto circuit = create_circuit<Builder>(program);

    EXPECT_TRUE(CircuitChecker::check(circuit));
}

// Test that all block constraint types handle empty initialization gracefully
TEST_F(MegaHonk, EmptyBlockConstraints)
{
    // Test each block constraint type
    std::vector<BlockType> types_to_test = {
        BlockType::ROM, BlockType::RAM, BlockType::CallData, BlockType::ReturnData
    };

    // Create empty block constraint
    for (auto block_type : types_to_test) {
        BlockConstraint block{
            .init = {},  // Empty initialization data
            .trace = {}, // Empty trace
            .type = block_type,
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

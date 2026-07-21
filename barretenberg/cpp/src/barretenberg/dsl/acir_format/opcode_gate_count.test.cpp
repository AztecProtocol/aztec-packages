#include <gtest/gtest.h>
#include <memory>
#include <vector>

#include "acir_format.hpp"
#include "acir_to_constraint_buf.hpp"
#include "barretenberg/common/streams.hpp"
#include "barretenberg/dsl/acir_format/gate_count_constants.hpp"
#include "barretenberg/dsl/acir_format/utils.hpp"
#include "barretenberg/op_queue/ecc_op_queue.hpp"
#include "test_class.hpp"

#include "barretenberg/serialize/test_helper.hpp"

using namespace bb;
using namespace bb::crypto;
using namespace acir_format;

// Gate count pinning test suite
template <typename Builder> class OpcodeGateCountTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

    // NOTE: Gate count constants are defined in gate_count_constants.hpp
    // All constants below reference the shared definitions from that file

    // NOTE: Recursion constraint gate counts are NOT included in this suite because they:
    // 1. Require proof generation which is expensive and slow
    // 2. Have different gate counts depending on the recursive flavor (Ultra vs UltraRollup vs ZK, etc.)
    //
    // Recursion constraint gate count tests are located in their respective test files:
    // - Honk recursion: honk_recursion_constraint.test.cpp::GateCountSingleHonkRecursion
    //
    // - Chonk recursion: chonk_recursion_constraints.test.cpp::GateCountChonkRecursion
    //
    // - Hypernova recursion: hypernova_recursion_constraint.test.cpp
    //
    // - AVM recursion: Not tested (AVM is not compiled in standard bb builds)
};

using BuilderTypes = testing::Types<UltraCircuitBuilder, MegaCircuitBuilder>;
TYPED_TEST_SUITE(OpcodeGateCountTests, BuilderTypes);

TYPED_TEST(OpcodeGateCountTests, BuilderOffsets)
{
    static constexpr size_t EXPECTED_RESULT = IsMegaBuilder<TypeParam> ? ZERO_GATE + MEGA_OFFSET<TypeParam> : ZERO_GATE;

    TypeParam builder;
    EXPECT_EQ(builder.num_gates(), EXPECTED_RESULT);
}

TYPED_TEST(OpcodeGateCountTests, Quad)
{
    bb::mul_quad_<fr> quad{
        .a = 0,
        .b = 1,
        .c = 2,
        .d = 3,
        .mul_scaling = fr::one(),
        .a_scaling = 0,
        .b_scaling = 0,
        .c_scaling = 0,
        .d_scaling = fr::neg_one(),
        .const_scaling = 0,
    };

    WitnessVector witness(4, 0);

    // Test that gate counting works for multiple constraints
    std::vector<bb::mul_quad_<fr>> constraints = { quad, quad };
    AcirFormat constraint_system = constraint_to_acir_format(constraints);

    AcirProgram program{ constraint_system, witness };
    const ProgramMetadata metadata{ .collect_gates_per_opcode = true };
    auto builder = create_circuit<TypeParam>(program, metadata);

    // The first gate count incorporates the zero gate and mega offset adjustments, while the second doesn't
    EXPECT_EQ(program.constraints.gates_per_opcode,
              std::vector<size_t>({ QUAD<TypeParam>, QUAD<TypeParam> - ZERO_GATE - MEGA_OFFSET<TypeParam> }));
}

TYPED_TEST(OpcodeGateCountTests, LogicXor32)
{
    LogicConstraint logic_constraint{
        .a = WitnessOrConstant<bb::fr>::from_index(0),
        .b = WitnessOrConstant<bb::fr>::from_index(1),
        .result = 2,
        .num_bits = 32,
        .is_xor_gate = true,
    };

    WitnessVector witness{ 5, 10, 15 };

    AcirFormat constraint_system = constraint_to_acir_format(logic_constraint);

    AcirProgram program{ constraint_system, witness };
    const ProgramMetadata metadata{ .collect_gates_per_opcode = true };
    auto builder = create_circuit<TypeParam>(program, metadata);

    // As of now, this is the only test we have for the XOR opcode, so we test that it works
    EXPECT_TRUE(CircuitChecker::check(builder));
    EXPECT_FALSE(builder.failed());

    EXPECT_EQ(program.constraints.gates_per_opcode, std::vector<size_t>({ LOGIC_XOR_32<TypeParam> }));
}

TYPED_TEST(OpcodeGateCountTests, LogicAnd32)
{
    LogicConstraint logic_constraint{
        .a = WitnessOrConstant<bb::fr>::from_index(0),
        .b = WitnessOrConstant<bb::fr>::from_index(1),
        .result = 2,
        .num_bits = 32,
        .is_xor_gate = false,
    };

    WitnessVector witness{ 5, 10, 0 };

    AcirFormat constraint_system = constraint_to_acir_format(logic_constraint);

    AcirProgram program{ constraint_system, witness };
    const ProgramMetadata metadata{ .collect_gates_per_opcode = true };
    auto builder = create_circuit<TypeParam>(program, metadata);

    // As of now, this is the only test we have for the AND opcode, so we test that it works
    EXPECT_TRUE(CircuitChecker::check(builder));
    EXPECT_FALSE(builder.failed());

    EXPECT_EQ(program.constraints.gates_per_opcode, std::vector<size_t>({ LOGIC_AND_32<TypeParam> }));
}

TYPED_TEST(OpcodeGateCountTests, Range32)
{
    RangeConstraint range_constraint{
        .witness = 0,
        .num_bits = 32,
    };

    WitnessVector witness{ 100 };

    AcirFormat constraint_system = constraint_to_acir_format(range_constraint);

    AcirProgram program{ constraint_system, witness };
    const ProgramMetadata metadata{ .collect_gates_per_opcode = true };
    auto builder = create_circuit<TypeParam>(program, metadata);

    EXPECT_EQ(program.constraints.gates_per_opcode, std::vector<size_t>({ RANGE_32<TypeParam> }));
}

TYPED_TEST(OpcodeGateCountTests, KeccakPermutation)
{
    Keccakf1600 keccak_permutation;

    for (size_t idx = 0; idx < 25; idx++) {
        keccak_permutation.state[idx] = WitnessOrConstant<bb::fr>::from_index(static_cast<uint32_t>(idx));
        keccak_permutation.result[idx] = static_cast<uint32_t>(idx) + 25;
    }

    // As of now, this is the only test for the Keccak permutation opcode, so we test that it works as expected
    std::array<uint64_t, 25> native_state = { 0 };
    std::array<uint64_t, 25> expected_state = native_state;
    ethash_keccakf1600(expected_state.data());

    WitnessVector witness(25, 0);
    for (const auto& state : expected_state) {
        witness.emplace_back(state);
    }

    AcirFormat constraint_system = constraint_to_acir_format(keccak_permutation);

    AcirProgram program{ constraint_system, witness };
    const ProgramMetadata metadata{ .collect_gates_per_opcode = true };
    auto builder = create_circuit<TypeParam>(program, metadata);

    EXPECT_TRUE(CircuitChecker::check(builder));
    EXPECT_FALSE(builder.failed());

    EXPECT_EQ(program.constraints.gates_per_opcode, std::vector<size_t>({ KECCAK_PERMUTATION<TypeParam> }));
}

TYPED_TEST(OpcodeGateCountTests, Poseidon2Permutation)
{
    Poseidon2Constraint poseidon2_constraint;

    for (size_t idx = 0; idx < 4; idx++) {
        poseidon2_constraint.state.emplace_back(WitnessOrConstant<bb::fr>::from_index(static_cast<uint32_t>(idx)));
        poseidon2_constraint.result.emplace_back(static_cast<uint32_t>(idx) + 4);
    }

    WitnessVector witness(8, 0);

    AcirFormat constraint_system = constraint_to_acir_format(poseidon2_constraint);

    AcirProgram program{ constraint_system, witness };
    const ProgramMetadata metadata{ .collect_gates_per_opcode = true };
    auto builder = create_circuit<TypeParam>(program, metadata);

    EXPECT_EQ(program.constraints.gates_per_opcode, std::vector<size_t>({ POSEIDON2_PERMUTATION<TypeParam> }));
}

TYPED_TEST(OpcodeGateCountTests, Sha256Compression)
{
    Sha256Compression sha256_compression;

    for (size_t i = 0; i < 16; ++i) {
        sha256_compression.inputs[i] = WitnessOrConstant<bb::fr>::from_index(static_cast<uint32_t>(i));
    }
    for (size_t i = 0; i < 8; ++i) {
        sha256_compression.hash_values[i] = WitnessOrConstant<bb::fr>::from_index(static_cast<uint32_t>(i));
    }
    for (size_t i = 0; i < 8; ++i) {
        sha256_compression.result[i] = static_cast<uint32_t>(i) + 24;
    }

    WitnessVector witness(32, 0);

    AcirFormat constraint_system = constraint_to_acir_format(sha256_compression);

    AcirProgram program{ constraint_system, witness };
    const ProgramMetadata metadata{ .collect_gates_per_opcode = true };
    auto builder = create_circuit<TypeParam>(program, metadata);

    EXPECT_EQ(program.constraints.gates_per_opcode, std::vector<size_t>({ SHA256_COMPRESSION<TypeParam> }));
}

TYPED_TEST(OpcodeGateCountTests, Aes128Encryption)
{
    AES128Constraint aes128_constraint;

    // Create a minimal AES128 constraint with 16 bytes of input
    for (size_t i = 0; i < 16; ++i) {
        aes128_constraint.inputs.push_back(WitnessOrConstant<bb::fr>::from_index(static_cast<uint32_t>(i)));
    }

    for (size_t i = 0; i < 16; ++i) {
        aes128_constraint.iv[i] = WitnessOrConstant<bb::fr>::from_index(static_cast<uint32_t>(i + 16));
    }

    for (size_t i = 0; i < 16; ++i) {
        aes128_constraint.key[i] = WitnessOrConstant<bb::fr>::from_index(static_cast<uint32_t>(i + 32));
    }

    for (size_t i = 0; i < 16; ++i) {
        aes128_constraint.outputs.push_back(static_cast<uint32_t>(i + 48));
    }

    WitnessVector witness(64, fr(0));

    AcirFormat constraint_system = constraint_to_acir_format(aes128_constraint);

    AcirProgram program{ constraint_system, witness };
    const ProgramMetadata metadata{ .collect_gates_per_opcode = true };
    auto builder = create_circuit<TypeParam>(program, metadata);

    EXPECT_EQ(program.constraints.gates_per_opcode, std::vector<size_t>({ AES128_ENCRYPTION<TypeParam> }));
}

TYPED_TEST(OpcodeGateCountTests, EcdsaSecp256k1)
{
    EcdsaConstraint ecdsa_constraint{ .type = bb::CurveType::SECP256K1 };
    for (size_t i = 0; i < 32; ++i) {
        ecdsa_constraint.hashed_message[i] = static_cast<uint32_t>(i);
    }

    for (size_t i = 0; i < 64; ++i) {
        ecdsa_constraint.signature[i] = static_cast<uint32_t>(i + 32);
    }

    for (size_t i = 0; i < 32; ++i) {
        ecdsa_constraint.pub_x_indices[i] = static_cast<uint32_t>(i + 96);
    }

    for (size_t i = 0; i < 32; ++i) {
        ecdsa_constraint.pub_y_indices[i] = static_cast<uint32_t>(i + 128);
    }

    ecdsa_constraint.predicate = WitnessOrConstant<bb::fr>::from_index(static_cast<uint32_t>(160));
    ecdsa_constraint.result = static_cast<uint32_t>(161);

    WitnessVector witness(162, fr(0));
    // Override public key values to avoid failures
    auto point = bb::curve::SECP256K1::AffineElement::one();
    auto x_buffer = point.x.to_buffer();
    auto y_buffer = point.y.to_buffer();
    for (size_t idx = 0; idx < 32; idx++) {
        witness[idx + 96] = x_buffer[idx];
        witness[idx + 128] = y_buffer[idx];
    }

    AcirFormat constraint_system = constraint_to_acir_format(ecdsa_constraint);

    AcirProgram program{ constraint_system, witness };
    const ProgramMetadata metadata{ .collect_gates_per_opcode = true };
    auto builder = create_circuit<TypeParam>(program, metadata);

    EXPECT_EQ(program.constraints.gates_per_opcode, std::vector<size_t>({ ECDSA_SECP256K1<TypeParam> }));
}

TYPED_TEST(OpcodeGateCountTests, EcdsaSecp256r1)
{
    EcdsaConstraint ecdsa_constraint{ .type = bb::CurveType::SECP256R1 };
    for (size_t i = 0; i < 32; ++i) {
        ecdsa_constraint.hashed_message[i] = static_cast<uint32_t>(i);
    }

    for (size_t i = 0; i < 64; ++i) {
        ecdsa_constraint.signature[i] = static_cast<uint32_t>(i + 32);
    }

    for (size_t i = 0; i < 32; ++i) {
        ecdsa_constraint.pub_x_indices[i] = static_cast<uint32_t>(i + 96);
    }

    for (size_t i = 0; i < 32; ++i) {
        ecdsa_constraint.pub_y_indices[i] = static_cast<uint32_t>(i + 128);
    }

    ecdsa_constraint.predicate = WitnessOrConstant<bb::fr>::from_index(static_cast<uint32_t>(160));
    ecdsa_constraint.result = static_cast<uint32_t>(161);

    WitnessVector witness(162, fr(0));
    // Override public key values to avoid failures
    auto point = bb::curve::SECP256K1::AffineElement::one();
    auto x_buffer = point.x.to_buffer();
    auto y_buffer = point.y.to_buffer();
    for (size_t idx = 0; idx < 32; idx++) {
        witness[idx + 96] = x_buffer[idx];
        witness[idx + 128] = y_buffer[idx];
    }

    AcirFormat constraint_system = constraint_to_acir_format(ecdsa_constraint);

    AcirProgram program{ constraint_system, witness };
    const ProgramMetadata metadata{ .collect_gates_per_opcode = true };
    auto builder = create_circuit<TypeParam>(program, metadata);

    EXPECT_EQ(program.constraints.gates_per_opcode, std::vector<size_t>({ ECDSA_SECP256R1<TypeParam> }));
}

TYPED_TEST(OpcodeGateCountTests, Blake2s)
{
    Blake2sConstraint blake2s_constraint;

    blake2s_constraint.inputs.push_back(WitnessOrConstant<bb::fr>::from_index(0));

    for (size_t i = 0; i < 32; ++i) {
        blake2s_constraint.result[i] = static_cast<uint32_t>(i + 1);
    }

    WitnessVector witness(33, fr(0));

    AcirFormat constraint_system = constraint_to_acir_format(blake2s_constraint);

    AcirProgram program{ constraint_system, witness };
    const ProgramMetadata metadata{ .collect_gates_per_opcode = true };
    auto builder = create_circuit<TypeParam>(program, metadata);

    EXPECT_EQ(program.constraints.gates_per_opcode, std::vector<size_t>({ BLAKE2S<TypeParam> }));
}

TYPED_TEST(OpcodeGateCountTests, Blake3)
{
    Blake3Constraint blake3_constraint;

    blake3_constraint.inputs.push_back(WitnessOrConstant<bb::fr>::from_index(0));

    for (size_t i = 0; i < 32; ++i) {
        blake3_constraint.result[i] = static_cast<uint32_t>(i + 1);
    }

    WitnessVector witness(33, fr(0));

    AcirFormat constraint_system = constraint_to_acir_format(blake3_constraint);

    AcirProgram program{ constraint_system, witness };
    const ProgramMetadata metadata{ .collect_gates_per_opcode = true };
    auto builder = create_circuit<TypeParam>(program, metadata);

    EXPECT_EQ(program.constraints.gates_per_opcode, std::vector<size_t>({ BLAKE3<TypeParam> }));
}

TYPED_TEST(OpcodeGateCountTests, MultiScalarMul)
{
    using GrumpkinPoint = bb::grumpkin::g1::affine_element;

    // Use a valid Grumpkin point (the generator)
    auto point = GrumpkinPoint::one();

    MultiScalarMul msm_constraint;

    // Create a minimal MSM with one point and one scalar
    msm_constraint.points.push_back(WitnessOrConstant<bb::fr>::from_index(0)); // x
    msm_constraint.points.push_back(WitnessOrConstant<bb::fr>::from_index(1)); // y

    msm_constraint.scalars.push_back(WitnessOrConstant<bb::fr>::from_index(2)); // scalar_lo
    msm_constraint.scalars.push_back(WitnessOrConstant<bb::fr>::from_index(3)); // scalar_hi

    msm_constraint.predicate = WitnessOrConstant<bb::fr>::from_index(4);

    msm_constraint.out_point_x = 5;
    msm_constraint.out_point_y = 6;

    WitnessVector witness(7, fr(0));
    // Set valid point coordinates
    witness[0] = point.x;
    witness[1] = point.y;
    witness[5] = point.x;
    witness[6] = point.y;

    AcirFormat constraint_system = constraint_to_acir_format(msm_constraint);

    AcirProgram program{ constraint_system, witness };
    const ProgramMetadata metadata{ .collect_gates_per_opcode = true };
    auto builder = create_circuit<TypeParam>(program, metadata);

    EXPECT_EQ(program.constraints.gates_per_opcode, std::vector<size_t>({ MULTI_SCALAR_MUL<TypeParam> }));
}

TYPED_TEST(OpcodeGateCountTests, EcAdd)
{
    using GrumpkinPoint = bb::grumpkin::g1::affine_element;

    // Use valid Grumpkin points (the generator)
    auto point1 = GrumpkinPoint::one();
    auto point2 = GrumpkinPoint::one();

    EcAdd ec_add_constraint{
        .input1_x = WitnessOrConstant<bb::fr>::from_index(0),
        .input1_y = WitnessOrConstant<bb::fr>::from_index(1),
        .input2_x = WitnessOrConstant<bb::fr>::from_index(2),
        .input2_y = WitnessOrConstant<bb::fr>::from_index(3),
        .predicate = WitnessOrConstant<bb::fr>::from_index(4),
        .result_x = 5,
        .result_y = 6,
    };

    WitnessVector witness(7, fr(0));
    // Set valid point1 coordinates
    witness[0] = point1.x;
    witness[1] = point1.y;
    // Set valid point2 coordinates
    witness[2] = point2.x;
    witness[3] = point2.y;
    // Set valid result coordinates
    witness[5] = point1.x;
    witness[6] = point1.y;

    AcirFormat constraint_system = constraint_to_acir_format(ec_add_constraint);

    AcirProgram program{ constraint_system, witness };
    const ProgramMetadata metadata{ .collect_gates_per_opcode = true };
    auto builder = create_circuit<TypeParam>(program, metadata);

    EXPECT_EQ(program.constraints.gates_per_opcode, std::vector<size_t>({ EC_ADD<TypeParam> }));
}

TYPED_TEST(OpcodeGateCountTests, BlockRomRead)
{
    WitnessVector witness{ 10, 20, 0, 10 };

    // Create a simple ROM block with 2 elements and 1 read
    std::vector<uint32_t> init;
    init.push_back(0); // 10
    init.push_back(1); // 20

    std::vector<MemOp> trace;
    trace.push_back(MemOp{
        .access_type = AccessType::Read,
        .index = 2, // 0
        .value = 3, // 10
    });

    BlockConstraint block_constraint{
        .init = init,
        .trace = trace,
        .type = BlockType::ROM,
        .calldata_id = CallDataType::None,
    };

    AcirFormat constraint_system = constraint_to_acir_format(block_constraint);
    // The block constraint creates 2 opcodes (MemoryInit + MemoryOp), but MemoryInit doesn't add gates, so we
    // adjust num_acir_opcodes to track only the MemoryOp gates
    constraint_system.num_acir_opcodes = 1;
    constraint_system.original_opcode_indices = AcirFormatOriginalOpcodeIndices{ .block_constraints = { { 0 } } };

    AcirProgram program{ constraint_system, witness };
    const ProgramMetadata metadata{ .collect_gates_per_opcode = true };
    auto builder = create_circuit<TypeParam>(program, metadata);

    EXPECT_EQ(program.constraints.gates_per_opcode, std::vector<size_t>({ BLOCK_ROM_READ<TypeParam> }));
}

TYPED_TEST(OpcodeGateCountTests, BlockRamRead)
{
    WitnessVector witness{ 10, 20, 0, 10 };

    // Create a simple RAM block with 2 elements and 1 read
    std::vector<uint32_t> init;
    init.push_back(0); // 10
    init.push_back(1); // 20

    std::vector<MemOp> trace;
    trace.push_back(MemOp{
        .access_type = AccessType::Read,
        .index = 2, // 0
        .value = 3, // 10
    });

    BlockConstraint block_constraint{
        .init = init,
        .trace = trace,
        .type = BlockType::RAM,
        .calldata_id = CallDataType::None,
    };

    AcirFormat constraint_system = constraint_to_acir_format(block_constraint);
    // The block constraint creates 2 opcodes (MemoryInit + MemoryOp), but MemoryInit doesn't add gates, so we
    // adjust num_acir_opcodes to track only the MemoryOp gates
    constraint_system.num_acir_opcodes = 1;
    constraint_system.original_opcode_indices = AcirFormatOriginalOpcodeIndices{ .block_constraints = { { 0 } } };

    AcirProgram program{ constraint_system, witness };
    const ProgramMetadata metadata{ .collect_gates_per_opcode = true };
    auto builder = create_circuit<TypeParam>(program, metadata);

    EXPECT_EQ(program.constraints.gates_per_opcode, std::vector<size_t>({ BLOCK_RAM_READ<TypeParam> }));
}

TYPED_TEST(OpcodeGateCountTests, BlockRamWrite)
{
    WitnessVector witness{ 10, 20, 0, 10 };

    // Create a simple RAM block with 2 elements and 1 read
    std::vector<uint32_t> init;
    init.push_back(0); // 10
    init.push_back(1); // 20

    std::vector<MemOp> trace;
    trace.push_back(MemOp{
        .access_type = AccessType::Write,
        .index = 2, // 0
        .value = 3, // 10
    });

    BlockConstraint block_constraint{
        .init = init,
        .trace = trace,
        .type = BlockType::RAM,
        .calldata_id = CallDataType::None,
    };

    AcirFormat constraint_system = constraint_to_acir_format(block_constraint);
    // The block constraint creates 2 opcodes (MemoryInit + MemoryOp), but MemoryInit doesn't add gates, so we
    // adjust num_acir_opcodes to track only the MemoryOp gates
    constraint_system.num_acir_opcodes = 1;
    constraint_system.original_opcode_indices = AcirFormatOriginalOpcodeIndices{ .block_constraints = { { 0 } } };

    AcirProgram program{ constraint_system, witness };
    const ProgramMetadata metadata{ .collect_gates_per_opcode = true };
    auto builder = create_circuit<TypeParam>(program, metadata);

    EXPECT_EQ(program.constraints.gates_per_opcode, std::vector<size_t>({ BLOCK_RAM_WRITE<TypeParam> }));
}

TYPED_TEST(OpcodeGateCountTests, BlockCallData)
{
    if constexpr (!IsMegaBuilder<TypeParam>) {
        GTEST_SKIP() << "CallData only supported on MegaCircuitBuilder";
    }

    WitnessVector witness{ 10, 20, 0, 10 };

    // Create a simple CallData block with 2 elements and 1 read
    std::vector<uint32_t> init;
    init.push_back(0); // 10
    init.push_back(1); // 20

    std::vector<MemOp> trace;
    trace.push_back(MemOp{
        .access_type = AccessType::Read,
        .index = 2, // 0
        .value = 3, // 10
    });

    // Kernel calldata
    {
        BlockConstraint block_constraint{
            .init = init,
            .trace = trace,
            .type = BlockType::CallData,
            .calldata_id = CallDataType::KernelCalldata,
        };

        AcirFormat constraint_system = constraint_to_acir_format(block_constraint);
        // The block constraint creates 2 opcodes (MemoryInit + MemoryOp), but MemoryInit doesn't add gates, so we
        // adjust num_acir_opcodes to track only the MemoryOp gates
        constraint_system.num_acir_opcodes = 1;
        constraint_system.original_opcode_indices = AcirFormatOriginalOpcodeIndices{ .block_constraints = { { 0 } } };

        AcirProgram program{ constraint_system, witness };
        const ProgramMetadata metadata{ .collect_gates_per_opcode = true };
        auto builder = create_circuit<TypeParam>(program, metadata);

        EXPECT_EQ(program.constraints.gates_per_opcode, std::vector<size_t>({ BLOCK_CALLDATA<TypeParam> }));
    }

    // App calldata
    {
        BlockConstraint block_constraint{
            .init = init,
            .trace = trace,
            .type = BlockType::CallData,
            .calldata_id = CallDataType::FirstAppCalldata,
        };

        AcirFormat constraint_system = constraint_to_acir_format(block_constraint);
        // The block constraint creates 2 opcodes (MemoryInit + MemoryOp), but MemoryInit doesn't add gates, so we
        // adjust num_acir_opcodes to track only the MemoryOp gates
        constraint_system.num_acir_opcodes = 1;
        constraint_system.original_opcode_indices = AcirFormatOriginalOpcodeIndices{ .block_constraints = { { 0 } } };

        AcirProgram program{ constraint_system, witness };
        const ProgramMetadata metadata{ .collect_gates_per_opcode = true };
        auto builder = create_circuit<TypeParam>(program, metadata);

        EXPECT_EQ(program.constraints.gates_per_opcode, std::vector<size_t>({ BLOCK_CALLDATA<TypeParam> }));
    }
}

TYPED_TEST(OpcodeGateCountTests, BlockReturnData)
{
    if constexpr (!IsMegaBuilder<TypeParam>) {
        GTEST_SKIP() << "ReturnData only supported on MegaCircuitBuilder";
    }

    WitnessVector witness{ 10, 20 };

    // Create a simple ReturnData block with 2 elements
    std::vector<uint32_t> init;
    init.push_back(0); // 10
    init.push_back(1); // 20

    BlockConstraint block_constraint{
        .init = init,
        .trace = {},
        .type = BlockType::ReturnData,
        .calldata_id = CallDataType::None,
    };

    AcirFormat constraint_system = constraint_to_acir_format(block_constraint);
    // The block constraint creates 2 opcodes (MemoryInit + MemoryOp), but MemoryInit doesn't add gates, so we
    // adjust num_acir_opcodes to track only the MemoryOp gates
    constraint_system.num_acir_opcodes = 1;
    constraint_system.original_opcode_indices = AcirFormatOriginalOpcodeIndices{ .block_constraints = { { 0 } } };

    AcirProgram program{ constraint_system, witness };
    const ProgramMetadata metadata{
        .collect_gates_per_opcode = false
    }; // We need to set it to false because ReturnData BlockConstraints do not have any trace, so we would be dividing
       // by zero, and this would throw an error.
    auto builder = create_circuit<TypeParam>(program, metadata);

    EXPECT_EQ(builder.get_num_finalized_gates_inefficient(), BLOCK_RETURNDATA<TypeParam>);
}

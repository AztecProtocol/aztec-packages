#include <gtest/gtest.h>
#include <memory>
#include <vector>

#include "acir_format.hpp"
#include "acir_format_mocks.hpp"
#include "acir_to_constraint_buf.hpp"
#include "barretenberg/common/streams.hpp"
#include "barretenberg/dsl/acir_format/gate_count_constants.hpp"
#include "barretenberg/op_queue/ecc_op_queue.hpp"

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

TYPED_TEST(OpcodeGateCountTests, Quad)
{
    bb::mul_quad_<fr> quad{
        .a = 0 + TypeParam::ACIR_OFFSET,
        .b = 1 + TypeParam::ACIR_OFFSET,
        .c = 2 + TypeParam::ACIR_OFFSET,
        .d = 3 + TypeParam::ACIR_OFFSET,
        .mul_scaling = fr::one(),
        .a_scaling = 0,
        .b_scaling = 0,
        .c_scaling = 0,
        .d_scaling = fr::neg_one(),
        .const_scaling = 0,
    };

    WitnessVector witness(4, 0);

    AcirFormat constraint_system{
        .max_witness_index = static_cast<uint32_t>(witness.size()) + TypeParam::ACIR_OFFSET - 1,
        .acir_gates_offset = TypeParam::ACIR_OFFSET,
        .num_acir_opcodes = 2,
        .public_inputs = {},
        .quad_constraints = { quad, quad }, // Test that gate counting works for multiple constraints
        .original_opcode_indices = create_empty_original_opcode_indices(),
    };
    mock_opcode_indices(constraint_system);

    AcirProgram program{ constraint_system, witness };
    const ProgramMetadata metadata{ .collect_gates_per_opcode = true };
    auto builder = create_circuit<TypeParam>(program, metadata);

    // The first gate count incorporates the zero gate and mega offset adjustments, while the second doesn't
    EXPECT_EQ(program.constraints.gates_per_opcode,
              std::vector<size_t>({ QUAD<TypeParam>, QUAD<TypeParam> - ZERO_GATE - MEGA_OFFSET<TypeParam> }));
}

TYPED_TEST(OpcodeGateCountTests, BigQuad)
{
    Acir::Expression expr{
        .mul_terms = { std::make_tuple(
                           bb::fr::one().to_buffer(), Acir::Witness{ .value = 0 }, Acir::Witness{ .value = 1 }),
                       std::make_tuple(
                           bb::fr::one().to_buffer(), Acir::Witness{ .value = 2 }, Acir::Witness{ .value = 3 }) },
        .linear_combinations = { std::make_tuple(bb::fr::one().to_buffer(), Acir::Witness{ .value = 2 }) },
        .q_c = bb::fr(-2).to_buffer(),
    };

    WitnessVector witness_values = { fr(1), fr(1), fr(1), fr(-1) };

    Acir::Opcode::AssertZero assert_zero{ .value = expr };

    // Create an ACIR circuit with this opcode
    Acir::Circuit circuit{
        .current_witness_index = 3,
        .opcodes = { Acir::Opcode{ .value = assert_zero } },
        .return_values = {},
    };

    Acir::Program acir_program{ .functions = { circuit } };

    // Serialize the program to bytes
    auto acir_program_bytes = acir_program.bincodeSerialize();

    // Process through circuit_buf_to_acir_format (this calls handle_arithmetic internally)
    AcirFormat constraint_system = circuit_buf_to_acir_format(std::move(acir_program_bytes), TypeParam::ACIR_OFFSET);

    AcirProgram program{ constraint_system, witness_values };
    const ProgramMetadata metadata{ .collect_gates_per_opcode = true };
    auto builder = create_circuit<TypeParam>(program, metadata);

    EXPECT_EQ(program.constraints.gates_per_opcode, std::vector<size_t>({ BIG_QUAD<TypeParam> }));
}

TYPED_TEST(OpcodeGateCountTests, LogicXor32)
{
    LogicConstraint logic_constraint{
        .a = WitnessOrConstant<bb::fr>::from_index(0 + TypeParam::ACIR_OFFSET),
        .b = WitnessOrConstant<bb::fr>::from_index(1 + TypeParam::ACIR_OFFSET),
        .result = 2 + TypeParam::ACIR_OFFSET,
        .num_bits = 32,
        .is_xor_gate = 1,
    };

    WitnessVector witness{ 5, 10, 15 };

    AcirFormat constraint_system{
        .max_witness_index = static_cast<uint32_t>(witness.size()) + TypeParam::ACIR_OFFSET - 1,
        .acir_gates_offset = TypeParam::ACIR_OFFSET,
        .num_acir_opcodes = 1,
        .public_inputs = {},
        .logic_constraints = { logic_constraint },
        .original_opcode_indices = create_empty_original_opcode_indices(),
    };
    mock_opcode_indices(constraint_system);

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
        .a = WitnessOrConstant<bb::fr>::from_index(0 + TypeParam::ACIR_OFFSET),
        .b = WitnessOrConstant<bb::fr>::from_index(1 + TypeParam::ACIR_OFFSET),
        .result = 2 + TypeParam::ACIR_OFFSET,
        .num_bits = 32,
        .is_xor_gate = 0,
    };

    WitnessVector witness{ 5, 10, 0 };

    AcirFormat constraint_system{
        .max_witness_index = static_cast<uint32_t>(witness.size()) + TypeParam::ACIR_OFFSET - 1,
        .acir_gates_offset = TypeParam::ACIR_OFFSET,
        .num_acir_opcodes = 1,
        .public_inputs = {},
        .logic_constraints = { logic_constraint },
        .original_opcode_indices = create_empty_original_opcode_indices(),
    };
    mock_opcode_indices(constraint_system);

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
        .witness = 0 + TypeParam::ACIR_OFFSET,
        .num_bits = 32,
    };

    WitnessVector witness{ 100 };

    AcirFormat constraint_system{
        .max_witness_index = static_cast<uint32_t>(witness.size()) + TypeParam::ACIR_OFFSET - 1,
        .acir_gates_offset = TypeParam::ACIR_OFFSET,
        .num_acir_opcodes = 1,
        .public_inputs = {},
        .range_constraints = { range_constraint },
        .original_opcode_indices = create_empty_original_opcode_indices(),
    };
    mock_opcode_indices(constraint_system);

    AcirProgram program{ constraint_system, witness };
    const ProgramMetadata metadata{ .collect_gates_per_opcode = true };
    auto builder = create_circuit<TypeParam>(program, metadata);

    EXPECT_EQ(program.constraints.gates_per_opcode, std::vector<size_t>({ RANGE_32<TypeParam> }));
}

TYPED_TEST(OpcodeGateCountTests, KeccakPermutation)
{
    Keccakf1600 keccak_permutation;

    for (size_t idx = 0; idx < 25; idx++) {
        keccak_permutation.state[idx] =
            WitnessOrConstant<bb::fr>::from_index(static_cast<uint32_t>(idx) + TypeParam::ACIR_OFFSET);
        keccak_permutation.result[idx] = static_cast<uint32_t>(idx) + 25 + TypeParam::ACIR_OFFSET;
    }

    // As of now, this is the only test for the Keccak permutation opcode, so we test that it works as expected
    std::array<uint64_t, 25> native_state = { 0 };
    std::array<uint64_t, 25> expected_state = native_state;
    ethash_keccakf1600(expected_state.data());

    WitnessVector witness(25, 0);
    for (const auto& state : expected_state) {
        witness.emplace_back(state);
    }

    AcirFormat constraint_system{
        .max_witness_index = static_cast<uint32_t>(witness.size()) + TypeParam::ACIR_OFFSET - 1,
        .acir_gates_offset = TypeParam::ACIR_OFFSET,
        .num_acir_opcodes = 1,
        .public_inputs = {},
        .keccak_permutations = { keccak_permutation },
        .original_opcode_indices = create_empty_original_opcode_indices(),
    };

    mock_opcode_indices(constraint_system);

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
        poseidon2_constraint.state.emplace_back(
            WitnessOrConstant<bb::fr>::from_index(static_cast<uint32_t>(idx) + TypeParam::ACIR_OFFSET));
        poseidon2_constraint.result.emplace_back(static_cast<uint32_t>(idx) + 5 + TypeParam::ACIR_OFFSET);
    }

    WitnessVector witness(8, 0);

    AcirFormat constraint_system{
        .max_witness_index = static_cast<uint32_t>(witness.size()) + TypeParam::ACIR_OFFSET - 1,
        .acir_gates_offset = TypeParam::ACIR_OFFSET,
        .num_acir_opcodes = 1,
        .public_inputs = {},
        .poseidon2_constraints = { poseidon2_constraint },
        .original_opcode_indices = create_empty_original_opcode_indices(),
    };

    mock_opcode_indices(constraint_system);

    AcirProgram program{ constraint_system, witness };
    const ProgramMetadata metadata{ .collect_gates_per_opcode = true };
    auto builder = create_circuit<TypeParam>(program, metadata);

    EXPECT_EQ(program.constraints.gates_per_opcode, std::vector<size_t>({ POSEIDON2_PERMUTATION<TypeParam> }));
}

TYPED_TEST(OpcodeGateCountTests, Sha256Compression)
{
    Sha256Compression sha256_compression;

    for (size_t i = 0; i < 16; ++i) {
        sha256_compression.inputs[i] =
            WitnessOrConstant<bb::fr>::from_index(static_cast<uint32_t>(i + TypeParam::ACIR_OFFSET));
    }
    for (size_t i = 0; i < 8; ++i) {
        sha256_compression.hash_values[i] =
            WitnessOrConstant<bb::fr>::from_index(static_cast<uint32_t>(i + TypeParam::ACIR_OFFSET));
    }
    for (size_t i = 0; i < 8; ++i) {
        sha256_compression.result[i] = static_cast<uint32_t>(i) + 24 + TypeParam::ACIR_OFFSET;
    }

    WitnessVector witness(32, 0);

    AcirFormat constraint_system{
        .max_witness_index = static_cast<uint32_t>(witness.size()) + TypeParam::ACIR_OFFSET - 1,
        .acir_gates_offset = TypeParam::ACIR_OFFSET,
        .num_acir_opcodes = 1,
        .public_inputs = {},
        .sha256_compression = { sha256_compression },
        .original_opcode_indices = create_empty_original_opcode_indices(),
    };
    mock_opcode_indices(constraint_system);

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
        aes128_constraint.inputs.push_back(
            WitnessOrConstant<bb::fr>::from_index(static_cast<uint32_t>(i + TypeParam::ACIR_OFFSET)));
    }

    for (size_t i = 0; i < 16; ++i) {
        aes128_constraint.iv[i] =
            WitnessOrConstant<bb::fr>::from_index(static_cast<uint32_t>(i + 16 + TypeParam::ACIR_OFFSET));
    }

    for (size_t i = 0; i < 16; ++i) {
        aes128_constraint.key[i] =
            WitnessOrConstant<bb::fr>::from_index(static_cast<uint32_t>(i + 32 + TypeParam::ACIR_OFFSET));
    }

    for (size_t i = 0; i < 16; ++i) {
        aes128_constraint.outputs.push_back(static_cast<uint32_t>(i + 48 + TypeParam::ACIR_OFFSET));
    }

    WitnessVector witness(64, fr(0));

    AcirFormat constraint_system{
        .max_witness_index = static_cast<uint32_t>(witness.size()) + TypeParam::ACIR_OFFSET - 1,
        .acir_gates_offset = TypeParam::ACIR_OFFSET,
        .num_acir_opcodes = 1,
        .public_inputs = {},
        .aes128_constraints = { aes128_constraint },
        .original_opcode_indices = create_empty_original_opcode_indices(),
    };
    mock_opcode_indices(constraint_system);

    AcirProgram program{ constraint_system, witness };
    const ProgramMetadata metadata{ .collect_gates_per_opcode = true };
    auto builder = create_circuit<TypeParam>(program, metadata);

    EXPECT_EQ(program.constraints.gates_per_opcode, std::vector<size_t>({ AES128_ENCRYPTION<TypeParam> }));
}

TYPED_TEST(OpcodeGateCountTests, EcdsaSecp256k1)
{
    EcdsaConstraint ecdsa_constraint{ .type = bb::CurveType::SECP256K1 };
    for (size_t i = 0; i < 32; ++i) {
        ecdsa_constraint.hashed_message[i] = static_cast<uint32_t>(i + TypeParam::ACIR_OFFSET);
    }

    for (size_t i = 0; i < 64; ++i) {
        ecdsa_constraint.signature[i] = static_cast<uint32_t>(i + 32 + TypeParam::ACIR_OFFSET);
    }

    for (size_t i = 0; i < 32; ++i) {
        ecdsa_constraint.pub_x_indices[i] = static_cast<uint32_t>(i + 96 + TypeParam::ACIR_OFFSET);
    }

    for (size_t i = 0; i < 32; ++i) {
        ecdsa_constraint.pub_y_indices[i] = static_cast<uint32_t>(i + 128 + TypeParam::ACIR_OFFSET);
    }

    ecdsa_constraint.predicate =
        WitnessOrConstant<bb::fr>::from_index(static_cast<uint32_t>(160 + TypeParam::ACIR_OFFSET));
    ecdsa_constraint.result = static_cast<uint32_t>(161 + TypeParam::ACIR_OFFSET);

    WitnessVector witness(163, fr(0));
    // Override public key values to avoid failures
    auto point = bb::curve::SECP256K1::AffineElement::one();
    auto x_buffer = point.x.to_buffer();
    auto y_buffer = point.y.to_buffer();
    for (size_t idx = 0; idx < 32; idx++) {
        witness[idx + 96] = x_buffer[idx];
        witness[idx + 128] = y_buffer[idx];
    }

    AcirFormat constraint_system{
        .max_witness_index = static_cast<uint32_t>(witness.size()) + TypeParam::ACIR_OFFSET - 1,
        .acir_gates_offset = TypeParam::ACIR_OFFSET,
        .num_acir_opcodes = 1,
        .public_inputs = {},
        .ecdsa_k1_constraints = { ecdsa_constraint },
        .original_opcode_indices = create_empty_original_opcode_indices(),
    };
    mock_opcode_indices(constraint_system);

    AcirProgram program{ constraint_system, witness };
    const ProgramMetadata metadata{ .collect_gates_per_opcode = true };
    auto builder = create_circuit<TypeParam>(program, metadata);

    EXPECT_EQ(program.constraints.gates_per_opcode, std::vector<size_t>({ ECDSA_SECP256K1<TypeParam> }));
}

TYPED_TEST(OpcodeGateCountTests, EcdsaSecp256r1)
{
    EcdsaConstraint ecdsa_constraint{ .type = bb::CurveType::SECP256R1 };
    for (size_t i = 0; i < 32; ++i) {
        ecdsa_constraint.hashed_message[i] = static_cast<uint32_t>(i + TypeParam::ACIR_OFFSET);
    }

    for (size_t i = 0; i < 64; ++i) {
        ecdsa_constraint.signature[i] = static_cast<uint32_t>(i + 32 + TypeParam::ACIR_OFFSET);
    }

    for (size_t i = 0; i < 32; ++i) {
        ecdsa_constraint.pub_x_indices[i] = static_cast<uint32_t>(i + 96 + TypeParam::ACIR_OFFSET);
    }

    for (size_t i = 0; i < 32; ++i) {
        ecdsa_constraint.pub_y_indices[i] = static_cast<uint32_t>(i + 128 + TypeParam::ACIR_OFFSET);
    }

    ecdsa_constraint.predicate =
        WitnessOrConstant<bb::fr>::from_index(static_cast<uint32_t>(160 + TypeParam::ACIR_OFFSET));
    ecdsa_constraint.result = static_cast<uint32_t>(161 + TypeParam::ACIR_OFFSET);

    WitnessVector witness(163, fr(0));
    // Override public key values to avoid failures
    auto point = bb::curve::SECP256K1::AffineElement::one();
    auto x_buffer = point.x.to_buffer();
    auto y_buffer = point.y.to_buffer();
    for (size_t idx = 0; idx < 32; idx++) {
        witness[idx + 96] = x_buffer[idx];
        witness[idx + 128] = y_buffer[idx];
    }

    AcirFormat constraint_system{
        .max_witness_index = static_cast<uint32_t>(witness.size()) + TypeParam::ACIR_OFFSET - 1,
        .acir_gates_offset = TypeParam::ACIR_OFFSET,
        .num_acir_opcodes = 1,
        .public_inputs = {},
        .ecdsa_r1_constraints = { ecdsa_constraint },
        .original_opcode_indices = create_empty_original_opcode_indices(),
    };
    mock_opcode_indices(constraint_system);

    AcirProgram program{ constraint_system, witness };
    const ProgramMetadata metadata{ .collect_gates_per_opcode = true };
    auto builder = create_circuit<TypeParam>(program, metadata);

    EXPECT_EQ(program.constraints.gates_per_opcode, std::vector<size_t>({ ECDSA_SECP256R1<TypeParam> }));
}

TYPED_TEST(OpcodeGateCountTests, Blake2s)
{
    Blake2sConstraint blake2s_constraint;

    blake2s_constraint.inputs.push_back(Blake2sInput{
        .blackbox_input = WitnessOrConstant<bb::fr>::from_index(TypeParam::ACIR_OFFSET),
        .num_bits = 32,
    });

    for (size_t i = 0; i < 32; ++i) {
        blake2s_constraint.result[i] = static_cast<uint32_t>(i + 1 + TypeParam::ACIR_OFFSET);
    }

    WitnessVector witness(33, fr(0));

    AcirFormat constraint_system{
        .max_witness_index = static_cast<uint32_t>(witness.size()) + TypeParam::ACIR_OFFSET - 1,
        .acir_gates_offset = TypeParam::ACIR_OFFSET,
        .num_acir_opcodes = 1,
        .public_inputs = {},
        .blake2s_constraints = { blake2s_constraint },
        .original_opcode_indices = create_empty_original_opcode_indices(),
    };
    mock_opcode_indices(constraint_system);

    AcirProgram program{ constraint_system, witness };
    const ProgramMetadata metadata{ .collect_gates_per_opcode = true };
    auto builder = create_circuit<TypeParam>(program, metadata);

    EXPECT_EQ(program.constraints.gates_per_opcode, std::vector<size_t>({ BLAKE2S<TypeParam> }));
}

TYPED_TEST(OpcodeGateCountTests, Blake3)
{
    Blake3Constraint blake3_constraint;

    blake3_constraint.inputs.push_back(Blake3Input{
        .blackbox_input = WitnessOrConstant<bb::fr>::from_index(TypeParam::ACIR_OFFSET),
        .num_bits = 32,
    });

    for (size_t i = 0; i < 32; ++i) {
        blake3_constraint.result[i] = static_cast<uint32_t>(i + 1 + TypeParam::ACIR_OFFSET);
    }

    WitnessVector witness(33, fr(0));

    AcirFormat constraint_system{
        .max_witness_index = static_cast<uint32_t>(witness.size()) + TypeParam::ACIR_OFFSET - 1,
        .acir_gates_offset = TypeParam::ACIR_OFFSET,
        .num_acir_opcodes = 1,
        .public_inputs = {},
        .blake3_constraints = { blake3_constraint },
        .original_opcode_indices = create_empty_original_opcode_indices(),
    };
    mock_opcode_indices(constraint_system);

    AcirProgram program{ constraint_system, witness };
    const ProgramMetadata metadata{ .collect_gates_per_opcode = true };
    auto builder = create_circuit<TypeParam>(program, metadata);

    EXPECT_EQ(program.constraints.gates_per_opcode, std::vector<size_t>({ BLAKE3<TypeParam> }));
}

TYPED_TEST(OpcodeGateCountTests, MultiScalarMul)
{
    using Builder = TypeParam;
    using GrumpkinPoint = bb::grumpkin::g1::affine_element;

    // Use a valid Grumpkin point (the generator)
    auto point = GrumpkinPoint::one();

    MultiScalarMul msm_constraint;

    // Create a minimal MSM with one point and one scalar
    msm_constraint.points.push_back(WitnessOrConstant<bb::fr>::from_index(Builder::ACIR_OFFSET)); // x
    msm_constraint.points.push_back(
        WitnessOrConstant<bb::fr>::from_index(static_cast<uint32_t>(1) + Builder::ACIR_OFFSET)); // y
    msm_constraint.points.push_back(
        WitnessOrConstant<bb::fr>::from_index(static_cast<uint32_t>(2) + Builder::ACIR_OFFSET)); // is_infinite

    msm_constraint.scalars.push_back(
        WitnessOrConstant<bb::fr>::from_index(static_cast<uint32_t>(3) + Builder::ACIR_OFFSET)); // scalar_lo
    msm_constraint.scalars.push_back(
        WitnessOrConstant<bb::fr>::from_index(static_cast<uint32_t>(4) + Builder::ACIR_OFFSET)); // scalar_hi

    msm_constraint.predicate = WitnessOrConstant<bb::fr>::from_index(static_cast<uint32_t>(5) + Builder::ACIR_OFFSET);

    msm_constraint.out_point_x = static_cast<uint32_t>(6 + Builder::ACIR_OFFSET);
    msm_constraint.out_point_y = static_cast<uint32_t>(7 + Builder::ACIR_OFFSET);
    msm_constraint.out_point_is_infinite = static_cast<uint32_t>(8 + Builder::ACIR_OFFSET);

    WitnessVector witness(9, fr(0));
    // Set valid point coordinates
    witness[0] = point.x;
    witness[1] = point.y;
    witness[2] = fr(0);
    witness[6] = point.x;
    witness[7] = point.y;
    witness[8] = fr(0);

    AcirFormat constraint_system{
        .max_witness_index = static_cast<uint32_t>(witness.size()) + TypeParam::ACIR_OFFSET - 1,
        .acir_gates_offset = TypeParam::ACIR_OFFSET,
        .num_acir_opcodes = 1,
        .public_inputs = {},
        .multi_scalar_mul_constraints = { msm_constraint },
        .original_opcode_indices = create_empty_original_opcode_indices(),
    };
    mock_opcode_indices(constraint_system);

    AcirProgram program{ constraint_system, witness };
    const ProgramMetadata metadata{ .collect_gates_per_opcode = true };
    auto builder = create_circuit<TypeParam>(program, metadata);

    EXPECT_EQ(program.constraints.gates_per_opcode, std::vector<size_t>({ MULTI_SCALAR_MUL<TypeParam> }));
}

TYPED_TEST(OpcodeGateCountTests, EcAdd)
{
    using Builder = TypeParam;
    using GrumpkinPoint = bb::grumpkin::g1::affine_element;

    // Use valid Grumpkin points (the generator)
    auto point1 = GrumpkinPoint::one();
    auto point2 = GrumpkinPoint::one();

    EcAdd ec_add_constraint{
        .input1_x = WitnessOrConstant<bb::fr>::from_index(static_cast<uint32_t>(0 + Builder::ACIR_OFFSET)),
        .input1_y = WitnessOrConstant<bb::fr>::from_index(static_cast<uint32_t>(1 + Builder::ACIR_OFFSET)),
        .input1_infinite = WitnessOrConstant<bb::fr>::from_index(static_cast<uint32_t>(2 + Builder::ACIR_OFFSET)),
        .input2_x = WitnessOrConstant<bb::fr>::from_index(static_cast<uint32_t>(3 + Builder::ACIR_OFFSET)),
        .input2_y = WitnessOrConstant<bb::fr>::from_index(static_cast<uint32_t>(4 + Builder::ACIR_OFFSET)),
        .input2_infinite = WitnessOrConstant<bb::fr>::from_index(static_cast<uint32_t>(5 + Builder::ACIR_OFFSET)),
        .predicate = WitnessOrConstant<bb::fr>::from_index(static_cast<uint32_t>(6 + Builder::ACIR_OFFSET)),
        .result_x = static_cast<uint32_t>(7 + Builder::ACIR_OFFSET),
        .result_y = static_cast<uint32_t>(8 + Builder::ACIR_OFFSET),
        .result_infinite = static_cast<uint32_t>(9 + Builder::ACIR_OFFSET),
    };

    WitnessVector witness(10, fr(0));
    // Set valid point1 coordinates
    witness[0] = point1.x;
    witness[1] = point1.y;
    witness[2] = fr(0);
    // Set valid point2 coordinates
    witness[3] = point2.x;
    witness[4] = point2.y;
    witness[5] = fr(0);
    // Set valid result coordinates
    witness[7] = point1.x;
    witness[8] = point1.y;
    witness[9] = fr(0);

    AcirFormat constraint_system{
        .max_witness_index = static_cast<uint32_t>(witness.size()) + TypeParam::ACIR_OFFSET - 1,
        .acir_gates_offset = TypeParam::ACIR_OFFSET,
        .num_acir_opcodes = 1,
        .public_inputs = {},
        .ec_add_constraints = { ec_add_constraint },
        .original_opcode_indices = create_empty_original_opcode_indices(),
    };
    mock_opcode_indices(constraint_system);

    AcirProgram program{ constraint_system, witness };
    const ProgramMetadata metadata{ .collect_gates_per_opcode = true };
    auto builder = create_circuit<TypeParam>(program, metadata);

    EXPECT_EQ(program.constraints.gates_per_opcode, std::vector<size_t>({ EC_ADD<TypeParam> }));
}

// TYPED_TEST(OpcodeGateCountTests, BlockRomRead)
// {
//     // Create a simple ROM block with 2 elements and 1 read
//     std::vector<arithmetic_triple> init;
//     init.push_back(arithmetic_triple{
//         .a = 1,
//         .b = 0,
//         .c = 0,
//         .q_m = 0,
//         .q_l = 1,
//         .q_r = 0,
//         .q_o = 0,
//         .q_c = 0,
//     });
//     init.push_back(arithmetic_triple{
//         .a = 2,
//         .b = 0,
//         .c = 0,
//         .q_m = 0,
//         .q_l = 1,
//         .q_r = 0,
//         .q_o = 0,
//         .q_c = 0,
//     });

//     std::vector<MemOp> trace;
//     trace.push_back(MemOp{
//         .access_type = 0, // READ
//         .index =
//             arithmetic_triple{
//                 .a = 3,
//                 .b = 0,
//                 .c = 0,
//                 .q_m = 0,
//                 .q_l = 1,
//                 .q_r = 0,
//                 .q_o = 0,
//                 .q_c = 0,
//             },
//         .value =
//             arithmetic_triple{
//                 .a = 4,
//                 .b = 0,
//                 .c = 0,
//                 .q_m = 0,
//                 .q_l = 1,
//                 .q_r = 0,
//                 .q_o = 0,
//                 .q_c = 0,
//             },
//     });

//     BlockConstraint block_constraint{
//         .init = init,
//         .trace = trace,
//         .type = BlockType::ROM,
//     };

//     AcirFormat constraint_system{

//         .num_acir_opcodes = 1,
//         .public_inputs = {},
//         .block_constraints = { block_constraint },
//         .original_opcode_indices = create_empty_original_opcode_indices(),
//     };
//     mock_opcode_indices(constraint_system);

//     WitnessVector witness{ 0, 10, 20, 0, 10 };

//     AcirProgram program{ constraint_system, witness };
//     const ProgramMetadata metadata{ .collect_gates_per_opcode = true };
//     auto builder = create_circuit<TypeParam>(program, metadata);

//     EXPECT_EQ(program.constraints.gates_per_opcode, std::vector<size_t>({ BLOCK_ROM_READ<TypeParam> }));
// }

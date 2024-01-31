#include "bigint_constraint.hpp"
#include "acir_format.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/plonk/proof_system/types/proof.hpp"
#include "barretenberg/plonk/proof_system/verification_key/verification_key.hpp"

#include <cstdint>
#include <gtest/gtest.h>
#include <vector>

namespace acir_format::tests {

class BigIntTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_crs_factory("../srs_db/ignition"); }
};

std::pair<BigIntOperation, BigIntToLeBytes> generate_big_int_op_constraint(BigIntOperationType op,
                                                                           uint8_t lhs,
                                                                           uint8_t rhs,
                                                                           WitnessVector& witness_values)
{
    uint32_t result = static_cast<uint32_t>(witness_values.size());
    BigIntOperation constraint{
        .lhs = lhs,
        .rhs = rhs,
        .result = result,
        .opcode = op,
    };
    BigIntToLeBytes to_bytes{
        .input = result,
        .result = { static_cast<uint32_t>(witness_values.size()) },
    };
    // overflow is NOT supported, you have to make sure there is no overflow.
    switch (op) {
    case Add:
        witness_values.push_back(witness_values[lhs] + witness_values[rhs]);
        break;
    case Neg:
        witness_values.push_back(witness_values[lhs] - witness_values[rhs]);
        break;
    case Mul:
        witness_values.push_back(witness_values[lhs] * witness_values[rhs]);
        break;
    case Div:
    default:
        ASSERT(false);
        break;
    }

    return std::pair<BigIntOperation, BigIntToLeBytes>(constraint, to_bytes);
}

TEST_F(BigIntTests, TestBigIntConstraintSimple)
{
    // 3 + 3 = 6
    // 3 = bigint(1) = from_bytes(w(1))
    // 6 = bigint(2) = to_bytes(w(2))
    BigIntOperation add_constraint{
        .lhs = 1,
        .rhs = 1,
        .result = 2,
        .opcode = BigIntOperationType::Add,
    };

    BigIntFromLeBytes from_le_bytes_constraint_bigint1{
        .inputs = { 1 },
        .modulus = { 0x47, 0xFD, 0x7C, 0xD8, 0x16, 0x8C, 0x20, 0x3C, 0x8d, 0xca, 0x71, 0x68, 0x91, 0x6a, 0x81, 0x97, 
  0x5d, 0x58, 0x81, 0x81, 0xb6, 0x45, 0x50, 0xb8, 0x29, 0xa0, 0x31, 0xe1, 0x72, 0x4e, 0x64, 0x30, },
        .result = 1,
    };

    BigIntToLeBytes result2_to_le_bytes{
        .input = 2, .result = { 2 }, // 3+3=6
    };

    AcirFormat constraint_system{
        .varnum = 5,
        .public_inputs = {},
        .logic_constraints = {},
        .range_constraints = {},
        .sha256_constraints = {},
        .schnorr_constraints = {},
        .ecdsa_k1_constraints = {},
        .ecdsa_r1_constraints = {},
        .blake2s_constraints = {},
        .blake3_constraints = {},
        .keccak_constraints = {},
        .keccak_var_constraints = {},
        .keccak_permutations = {},
        .pedersen_constraints = {},
        .pedersen_hash_constraints = {},
        .fixed_base_scalar_mul_constraints = {},
        .ec_add_constraints = {},
        .recursion_constraints = {},
        .bigint_from_le_bytes_constraints = { from_le_bytes_constraint_bigint1 },
        .bigint_to_le_bytes_constraints = { result2_to_le_bytes },
        .bigint_operations = { add_constraint },
        .constraints = {},
        .block_constraints = {},

    };

    WitnessVector witness{
        0, 3, 4, 3, 0,
    };
    auto builder = create_circuit(constraint_system, /*size_hint*/ 0, witness);
    // ASSERT(false);
    auto composer = Composer();
    auto prover = composer.create_ultra_with_keccak_prover(builder);
    auto proof = prover.construct_proof();
    EXPECT_TRUE(builder.check_circuit());
    auto verifier = composer.create_ultra_with_keccak_verifier(builder);
    EXPECT_EQ(verifier.verify_proof(proof), true);
}

TEST_F(BigIntTests, TestBigIntConstraintDummy)
{
    // 3 + 3 = 6
    // 3 = bigint(1) = from_bytes(w(1))
    // 6 = bigint(2) = to_bytes(w(2))
    BigIntOperation add_constraint{
        .lhs = 1,
        .rhs = 1,
        .result = 2,
        .opcode = BigIntOperationType::Add,
    };
    // 3 + 0 = 3 = bigint(4) = to_bytes(w(1))
    // 3 = bigint(1)
    // 0 = bigint(3) = from_bytes(w(4))
    BigIntOperation add_constraint2{
        .lhs = 1,
        .rhs = 3,
        .result = 4,
        .opcode = BigIntOperationType::Add,
    };
    // BigIntOperation neg_constraint{
    //     .lhs = 2,
    //     .rhs = 1,
    //     .result = 3,
    //     .opcode = BigIntOperationType::Neg,
    // };
    // BigIntOperation mul_constraint{
    //     .lhs = 1,
    //     .rhs = 4,
    //     .result = 5,
    //     .opcode = BigIntOperationType::Mul,
    // };
    // BigIntOperation div_constraint{
    //     .lhs = 1,
    //     .rhs = 2,
    //     .result = 3,
    //     .opcode = BigIntOperationType::Div,
    // };
    BigIntFromLeBytes from_le_bytes_constraint_bigint1{
        .inputs = { 1 },
        .modulus = { 0x47, 0xFD, 0x7C, 0xD8, 0x16, 0x8C, 0x20, 0x3C, 0x8d, 0xca, 0x71, 0x68, 0x91, 0x6a, 0x81, 0x97, 
  0x5d, 0x58, 0x81, 0x81, 0xb6, 0x45, 0x50, 0xb8, 0x29, 0xa0, 0x31, 0xe1, 0x72, 0x4e, 0x64, 0x30, },
        .result = 1,
    };
    //     BigIntFromLeBytes from_le_bytes_constraint_bigint2{
    //         .inputs = { 2 },
    //         .modulus = { 0x47, 0xFD, 0x7C, 0xD8, 0x16, 0x8C, 0x20, 0x3C, 0x8d, 0xca, 0x71, 0x68, 0x91, 0x6a, 0x81,
    //         0x97,
    //   0x5d, 0x58, 0x81, 0x81, 0xb6, 0x45, 0x50, 0xb8, 0x29, 0xa0, 0x31, 0xe1, 0x72, 0x4e, 0x64, 0x30, },
    //         .result = 2,
    //     };
    BigIntFromLeBytes from_le_bytes_constraint_bigint3{
            .inputs = { 4 },
            .modulus = { 0x47, 0xFD, 0x7C, 0xD8, 0x16, 0x8C, 0x20, 0x3C, 0x8d, 0xca, 0x71, 0x68, 0x91, 0x6a, 0x81,
            0x97,
      0x5d, 0x58, 0x81, 0x81, 0xb6, 0x45, 0x50, 0xb8, 0x29, 0xa0, 0x31, 0xe1, 0x72, 0x4e, 0x64, 0x30, },
            .result = 3,
        };
    BigIntToLeBytes result2_to_le_bytes{
        .input = 2, .result = { 2 }, // 3+3=6
    };
    BigIntToLeBytes result4_to_le_bytes{
        .input = 3,
        .result = { 1 },
    };
    //  poly_triple constrain_3_is_1{
    //     .a = 1,
    //     .b = 3,
    //     .c = 0,
    //     .q_m = 0,
    //     .q_l = 1,
    //     .q_r = -1,
    //     .q_o = 0,
    //     .q_c = 0,
    // };

    AcirFormat constraint_system{
        .varnum = 5,
        .public_inputs = {},
        .logic_constraints = {},
        .range_constraints = {},
        .sha256_constraints = {},
        .schnorr_constraints = {},
        .ecdsa_k1_constraints = {},
        .ecdsa_r1_constraints = {},
        .blake2s_constraints = {},
        .blake3_constraints = {},
        .keccak_constraints = {},
        .keccak_var_constraints = {},
        .keccak_permutations = {},
        .pedersen_constraints = {},
        .pedersen_hash_constraints = {},
        .fixed_base_scalar_mul_constraints = {},
        .ec_add_constraints = {},
        .recursion_constraints = {},
        .bigint_from_le_bytes_constraints = { from_le_bytes_constraint_bigint1,
                                              from_le_bytes_constraint_bigint3 }, // from_le_bytes_constraint_bigint2 },
        .bigint_to_le_bytes_constraints = { result2_to_le_bytes, result4_to_le_bytes }, // result_to_le_bytes_3 },
        .bigint_operations = { add_constraint, add_constraint2 }, // neg_constraint }, //, neg_constraint,
                                                                  // mul_constraint, div_constraint
                                                                  // },
        .constraints = {},
        .block_constraints = {},

    };

    WitnessVector witness{
        0, 3, 6, 3, 0,
    };
    auto builder = create_circuit(constraint_system, /*size_hint*/ 0, witness);
    // ASSERT(false);
    auto composer = Composer();
    auto prover = composer.create_ultra_with_keccak_prover(builder);
    auto proof = prover.construct_proof();
    EXPECT_TRUE(builder.check_circuit());
    auto verifier = composer.create_ultra_with_keccak_verifier(builder);

    EXPECT_EQ(verifier.verify_proof(proof), true);
}

} // namespace acir_format::tests
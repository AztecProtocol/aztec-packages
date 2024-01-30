#include "bigint_constraint.hpp"
#include "acir_format.hpp"
#include "barretenberg/plonk/proof_system/types/proof.hpp"
#include "barretenberg/plonk/proof_system/verification_key/verification_key.hpp"

#include <gtest/gtest.h>
#include <vector>

namespace acir_format::tests {

class BigIntTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_crs_factory("../srs_db/ignition"); }
};

TEST_F(BigIntTests, TestBigIntConstraintDummy)
{
    // Dummy Test: to be updated when big ints opcodes are implemented
    BigIntOperation add_constraint{
        .lhs = 1,
        .rhs = 1,
        .result = 2,
        .opcode = BigIntOperationType::Add,
    };
    // BigIntOperation neg_constraint{
    //     .lhs = 1,
    //     .rhs = 2,
    //     .result = 3,
    //     .opcode = BigIntOperationType::Neg,
    // };
    // BigIntOperation mul_constraint{
    //     .lhs = 1,
    //     .rhs = 2,
    //     .result = 3,
    //     .opcode = BigIntOperationType::Mul,
    // };
    // BigIntOperation div_constraint{
    //     .lhs = 1,
    //     .rhs = 2,
    //     .result = 3,
    //     .opcode = BigIntOperationType::Div,
    // };
    BigIntFromLeBytes from_le_bytes_constraint_bigint1{
        .inputs = { 0 },
        .modulus = { 0x47, 0xFD, 0x7C, 0xD8, 0x16, 0x8C, 0x20, 0x3C, 0x8d, 0xca, 0x71, 0x86, 0x91, 0x6a, 0x81, 0x97, 
  0x5d, 0x58, 0x81, 0x81, 0xb6, 0x45, 0x50, 0xb8, 0x29, 0xa0, 0x31, 0xe1, 0x72, 0x4e, 0x64, 0x30, },
        .result = 1,
    };
    BigIntFromLeBytes from_le_bytes_constraint_bigint2{
        .inputs = { 1 },
        .modulus = { 0x47, 0xFD, 0x7C, 0xD8, 0x16, 0x8C, 0x20, 0x3C, 0x8d, 0xca, 0x71, 0x86, 0x91, 0x6a, 0x81, 0x97, 
  0x5d, 0x58, 0x81, 0x81, 0xb6, 0x45, 0x50, 0xb8, 0x29, 0xa0, 0x31, 0xe1, 0x72, 0x4e, 0x64, 0x30, },
        .result = 1,
    };

    BigIntToLeBytes result_to_le_bytes{
        .input = 2,
        .result = { 1 },
    };
    //  poly_triple constrain_1_is_7{
    //     .a = 5,
    //     .b = 7,
    //     .c = 0,
    //     .q_m = 0,
    //     .q_l = 1,
    //     .q_r = -1,
    //     .q_o = 0,
    //     .q_c = 0,
    // };

    AcirFormat constraint_system{
        .varnum = 4,
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
        .bigint_from_le_bytes_constraints = { from_le_bytes_constraint_bigint1, from_le_bytes_constraint_bigint2 },
        .bigint_to_le_bytes_constraints = { result_to_le_bytes },
        .bigint_operations = { add_constraint }, //, neg_constraint, mul_constraint, div_constraint },
        .constraints = {},
        .block_constraints = {},

    };

    WitnessVector witness{
        3,
        6,
    }; // 3+3 =6
    auto builder = create_circuit(constraint_system, /*size_hint*/ 0, witness);

    auto composer = Composer();
    auto prover = composer.create_ultra_with_keccak_prover(builder);
    auto proof = prover.construct_proof();

    auto verifier = composer.create_ultra_with_keccak_verifier(builder);

    EXPECT_EQ(verifier.verify_proof(proof), true);
}

} // namespace acir_format::tests
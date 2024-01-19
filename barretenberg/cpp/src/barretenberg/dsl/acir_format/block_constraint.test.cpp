#include "block_constraint.hpp"
#include "acir_format.hpp"
#include "barretenberg/plonk/proof_system/types/proof.hpp"
#include "barretenberg/plonk/proof_system/verification_key/verification_key.hpp"

#include <gtest/gtest.h>
#include <vector>

class UltraPlonkRAM : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_crs_factory("../srs_db/ignition"); }
};
size_t generate_block_constraint(acir_format::BlockConstraint& constraint, acir_format::WitnessVector& witness_values)
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
    acir_format::MemOp op1{
        .access_type = 0,
        .index = r1,
        .value = y,
    };
    acir_format::MemOp op2{
        .access_type = 0,
        .index = r2,
        .value = z,
    };
    constraint = acir_format::BlockConstraint{
        .init = { a0, a1 },
        .trace = { op1, op2 },
        .type = acir_format::BlockType::ROM,
    };

    return witness_len;
}

TEST_F(UltraPlonkRAM, TestBlockConstraint)
{
    acir_format::BlockConstraint block;
    acir_format::WitnessVector witness_values;
    size_t num_variables = generate_block_constraint(block, witness_values);
    acir_format::acir_format constraint_system{
        .varnum = static_cast<uint32_t>(num_variables),
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
        .ec_double_constraints = {},
        .recursion_constraints = {},
        .constraints = {},
        .block_constraints = { block },
    };

    auto builder = create_circuit(constraint_system, /*size_hint*/ 0, witness_values);

    auto composer = acir_format::Composer();
    auto prover = composer.create_prover(builder);

    auto proof = prover.construct_proof();
    auto verifier = composer.create_verifier(builder);
    EXPECT_EQ(verifier.verify_proof(proof), true);
}

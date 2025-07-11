#include "ec_operations.hpp"
#include "acir_format.hpp"
#include "acir_format_mocks.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"

#include "barretenberg/stdlib/primitives/curves/secp256k1.hpp"
#include "barretenberg/stdlib/primitives/group/cycle_group.hpp"

#include <cstdint>
#include <gtest/gtest.h>
#include <vector>

namespace acir_format::tests {

using curve_ct = bb::stdlib::secp256k1<Builder>;

class EcOperations : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

size_t generate_ec_add_constraint(EcAdd& ec_add_constraint, WitnessVector& witness_values)
{
    witness_values.push_back(0);
    auto g1 = grumpkin::g1::affine_one;
    auto g2 = g1 + g1;
    auto affine_result = g1 + g2;

    // add: x,y,x2,y2
    witness_values.push_back(g1.x);
    witness_values.push_back(g1.y);
    witness_values.push_back(g2.x);
    witness_values.push_back(g2.y);
    witness_values.push_back(affine_result.x);
    witness_values.push_back(affine_result.y);

    auto is_infinite_false = WitnessOrConstant<bb::fr>{
        .index = 0,
        .value = bb::fr::zero(),
        .is_constant = true,
    };
    ec_add_constraint = EcAdd{
        .input1_x = WitnessOrConstant<bb::fr>::from_index(1),
        .input1_y = WitnessOrConstant<bb::fr>::from_index(2),
        .input1_infinite = is_infinite_false,
        .input2_x = WitnessOrConstant<bb::fr>::from_index(3),
        .input2_y = WitnessOrConstant<bb::fr>::from_index(4),
        .input2_infinite = is_infinite_false,
        .result_x = 5,
        .result_y = 6,
        .result_infinite = 8,
    };
    return witness_values.size();
}

TEST_F(EcOperations, TestECOperations)
{
    EcAdd ec_add_constraint;

    WitnessVector witness_values;
    size_t num_variables = generate_ec_add_constraint(ec_add_constraint, witness_values);

    AcirFormat constraint_system{
        .varnum = static_cast<uint32_t>(num_variables + 1),
        .num_acir_opcodes = 1,
        .public_inputs = {},
        .logic_constraints = {},
        .range_constraints = {},
        .aes128_constraints = {},
        .sha256_compression = {},

        .ecdsa_k1_constraints = {},
        .ecdsa_r1_constraints = {},
        .blake2s_constraints = {},
        .blake3_constraints = {},
        .keccak_permutations = {},
        .poseidon2_constraints = {},
        .multi_scalar_mul_constraints = {},
        .ec_add_constraints = { ec_add_constraint },
        .recursion_constraints = {},
        .honk_recursion_constraints = {},
        .avm_recursion_constraints = {},
        .ivc_recursion_constraints = {},
        .bigint_from_le_bytes_constraints = {},
        .bigint_to_le_bytes_constraints = {},
        .bigint_operations = {},
        .assert_equalities = {},
        .poly_triple_constraints = {},
        .quad_constraints = {},
        .big_quad_constraints = {},
        .block_constraints = {},
        .original_opcode_indices = create_empty_original_opcode_indices(),
    };
    mock_opcode_indices(constraint_system);

    AcirProgram program{ constraint_system, witness_values };
    auto builder = create_circuit(program);

    EXPECT_TRUE(CircuitChecker::check(builder));
}

TEST_F(EcOperations, TestECMultiScalarMul)
{
    MultiScalarMul msm_constrain;

    WitnessVector witness_values;
    witness_values.emplace_back(fr(0));

    witness_values = {
        // dummy
        fr(0),
        // g1: x,y,infinite
        fr(1),
        fr("0x0000000000000002cf135e7506a45d632d270d45f1181294833fc48d823f272c"),
        fr(0),
        // low, high scalars
        fr(1),
        fr(0),
        // result
        fr("0x06ce1b0827aafa85ddeb49cdaa36306d19a74caa311e13d46d8bc688cdbffffe"),
        fr("0x1c122f81a3a14964909ede0ba2a6855fc93faf6fa1a788bf467be7e7a43f80ac"),
        fr(0),
    };
    msm_constrain = MultiScalarMul{
        .points = { WitnessOrConstant<fr>{
                        .index = 1,
                        .value = fr(0),
                        .is_constant = false,
                    },
                    WitnessOrConstant<fr>{
                        .index = 2,
                        .value = fr(0),
                        .is_constant = false,
                    },
                    WitnessOrConstant<fr>{
                        .index = 3,
                        .value = fr(0),
                        .is_constant = false,
                    },
                    WitnessOrConstant<fr>{
                        .index = 1,
                        .value = fr(0),
                        .is_constant = false,
                    },
                    WitnessOrConstant<fr>{
                        .index = 2,
                        .value = fr(0),
                        .is_constant = false,
                    },
                    WitnessOrConstant<fr>{
                        .index = 3,
                        .value = fr(0),
                        .is_constant = false,
                    } },
        .scalars = { WitnessOrConstant<fr>{
                         .index = 4,
                         .value = fr(0),
                         .is_constant = false,
                     },
                     WitnessOrConstant<fr>{
                         .index = 5,
                         .value = fr(0),
                         .is_constant = false,
                     },
                     WitnessOrConstant<fr>{
                         .index = 4,
                         .value = fr(0),
                         .is_constant = false,
                     },
                     WitnessOrConstant<fr>{
                         .index = 5,
                         .value = fr(0),
                         .is_constant = false,
                     } },
        .out_point_x = 6,
        .out_point_y = 7,
        .out_point_is_infinite = 0,
    };
    auto res_x = fr("0x06ce1b0827aafa85ddeb49cdaa36306d19a74caa311e13d46d8bc688cdbffffe");
    auto assert_equal = poly_triple{
        .a = 6,
        .b = 0,
        .c = 0,
        .q_m = 0,
        .q_l = fr::neg_one(),
        .q_r = 0,
        .q_o = 0,
        .q_c = res_x,
    };

    size_t num_variables = witness_values.size();
    AcirFormat constraint_system{
        .varnum = static_cast<uint32_t>(num_variables + 1),
        .num_acir_opcodes = 1,
        .public_inputs = {},
        .logic_constraints = {},
        .range_constraints = {},
        .aes128_constraints = {},
        .sha256_compression = {},

        .ecdsa_k1_constraints = {},
        .ecdsa_r1_constraints = {},
        .blake2s_constraints = {},
        .blake3_constraints = {},
        .keccak_permutations = {},
        .poseidon2_constraints = {},
        .multi_scalar_mul_constraints = { msm_constrain },
        .ec_add_constraints = {},
        .recursion_constraints = {},
        .honk_recursion_constraints = {},
        .avm_recursion_constraints = {},
        .ivc_recursion_constraints = {},
        .bigint_from_le_bytes_constraints = {},
        .bigint_to_le_bytes_constraints = {},
        .bigint_operations = {},
        .assert_equalities = {},
        .poly_triple_constraints = { assert_equal },
        .quad_constraints = {},
        .big_quad_constraints = {},
        .block_constraints = {},
        .original_opcode_indices = create_empty_original_opcode_indices(),
    };
    mock_opcode_indices(constraint_system);

    AcirProgram program{ constraint_system, witness_values };
    auto builder = create_circuit(program);

    EXPECT_TRUE(CircuitChecker::check(builder));
}

// generates an EcAdd constraint, updating the witness values based on
// the desired outcome: constant or witness input, zero, or doubling.
size_t generate_more_ec_add_constraint(EcAdd& ec_add_constraint,
                                       WitnessVector& witness_values,
                                       bool lhs_is_zero,
                                       bool rhs_is_zero,
                                       bool lhs_is_constant,
                                       bool rhs_is_constant,
                                       bool doubling)
{
    witness_values.push_back(0);
    auto g1 = grumpkin::g1::affine_one;
    auto g2 = g1 + g1;
    if (lhs_is_zero) {
        g1 = grumpkin::g1::point_at_infinity;
    }
    if (rhs_is_zero) {
        g2 = grumpkin::g1::point_at_infinity;
    }
    if (doubling) {
        g2 = g1;
        rhs_is_constant = lhs_is_constant;
        rhs_is_zero = lhs_is_zero;
    }
    auto affine_result = g1 + g2;

    uint32_t witness_idx = static_cast<uint32_t>(witness_values.size());
    if (!lhs_is_constant) {
        witness_values.push_back(g1.x);
        witness_values.push_back(g1.y);
    }
    if (!rhs_is_constant && !doubling) {
        witness_values.push_back(g2.x);
        witness_values.push_back(g2.y);
    }
    if (affine_result.is_point_at_infinity()) {
        witness_values.push_back(bb::fr::zero());
        witness_values.push_back(bb::fr::zero());
        witness_values.push_back(bb::fr::one());
    } else {
        witness_values.push_back(affine_result.x);
        witness_values.push_back(affine_result.y);
        witness_values.push_back(bb::fr::zero());
    }

    auto is_infinite_false = WitnessOrConstant<bb::fr>{
        .index = 0,
        .value = bb::fr::zero(),
        .is_constant = true,
    };
    auto is_infinite_true = WitnessOrConstant<bb::fr>{
        .index = 0,
        .value = bb::fr::one(),
        .is_constant = true,
    };
    auto lhs_x = WitnessOrConstant<bb::fr>::from_index(witness_idx);
    auto lhs_y = WitnessOrConstant<bb::fr>::from_index(witness_idx + 1);
    if (lhs_is_constant) {
        lhs_x = WitnessOrConstant<bb::fr>{
            .index = 0,
            .value = lhs_is_zero ? bb::fr::zero() : g1.x,
            .is_constant = true,
        };
        lhs_y = WitnessOrConstant<bb::fr>{
            .index = 0,
            .value = rhs_is_zero ? bb::fr::zero() : g1.y,
            .is_constant = true,
        };
    } else if (!doubling) {
        witness_idx += 2;
    }
    auto rhs_x = WitnessOrConstant<bb::fr>::from_index(witness_idx);
    auto rhs_y = WitnessOrConstant<bb::fr>::from_index(witness_idx + 1);
    if (rhs_is_constant) {
        rhs_x = WitnessOrConstant<bb::fr>{
            .index = 0,
            .value = g2.x,
            .is_constant = true,
        };
        rhs_y = WitnessOrConstant<bb::fr>{
            .index = 0,
            .value = g2.y,
            .is_constant = true,
        };
    } else {
        witness_idx += 2;
    }
    ec_add_constraint = EcAdd{
        .input1_x = lhs_x,
        .input1_y = lhs_y,
        .input1_infinite = is_infinite_false,
        .input2_x = rhs_x,
        .input2_y = rhs_y,
        .input2_infinite = is_infinite_false,
        .result_x = witness_idx,
        .result_y = witness_idx + 1,
        .result_infinite = witness_idx + 2,
    };
    if (lhs_is_zero) {
        ec_add_constraint.input1_infinite = is_infinite_true;
    }
    if (rhs_is_zero) {
        ec_add_constraint.input2_infinite = is_infinite_true;
    }
    return witness_values.size();
}

// Test various scenarios, adding x + y, where x, y are: witness, constant, zero, or identical.
TEST_F(EcOperations, TestMoreECOperations)
{
    WitnessVector witness_values;
    size_t num_variables = 0;
    std::vector<EcAdd> constraints;
    for (int i = 0; i < 32; ++i) {
        bool lhs_is_zero = (i & 1) != 0;
        bool rhs_is_zero = (i & 2) != 0;
        bool lhs_is_constant = (i & 4) != 0;
        bool rhs_is_constant = (i & 8) != 0;
        bool doubling = (i & 16) != 0;
        EcAdd ec_add_constraint;
        num_variables = generate_more_ec_add_constraint(
            ec_add_constraint, witness_values, lhs_is_zero, rhs_is_zero, lhs_is_constant, rhs_is_constant, doubling);
        constraints.push_back(ec_add_constraint);
    }
    AcirFormat constraint_system{
        .varnum = static_cast<uint32_t>(num_variables + 1),
        .num_acir_opcodes = 1,
        .public_inputs = {},
        .logic_constraints = {},
        .range_constraints = {},
        .aes128_constraints = {},
        .sha256_compression = {},

        .ecdsa_k1_constraints = {},
        .ecdsa_r1_constraints = {},
        .blake2s_constraints = {},
        .blake3_constraints = {},
        .keccak_permutations = {},
        .poseidon2_constraints = {},
        .multi_scalar_mul_constraints = {},
        .ec_add_constraints = constraints,
        .recursion_constraints = {},
        .honk_recursion_constraints = {},
        .avm_recursion_constraints = {},
        .ivc_recursion_constraints = {},
        .bigint_from_le_bytes_constraints = {},
        .bigint_to_le_bytes_constraints = {},
        .bigint_operations = {},
        .assert_equalities = {},
        .poly_triple_constraints = {},
        .quad_constraints = {},
        .big_quad_constraints = {},
        .block_constraints = {},
        .original_opcode_indices = create_empty_original_opcode_indices(),
    };
    mock_opcode_indices(constraint_system);

    AcirProgram program{ constraint_system, witness_values };
    auto builder = create_circuit(program);

    EXPECT_TRUE(CircuitChecker::check(builder));
}

} // namespace acir_format::tests

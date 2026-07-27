// Phase 3: validate the pre-Oink VkDeserialize region for ROOT_ROLLUP_HONK opcodes.
//
// Algorithm under test (validate_vk_deserialize_region):
//   anchor on key[3] -> find its arithmetic gate -> locate region via FunctionFingerprint
//   (hash checked) -> assert key[4..] all land in that same region.

#include "barretenberg/boomerang_value_detection/graph.hpp"
#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_validation/ROLLUP_HONK/rollup_honk_recursion_test_helpers.hpp"
#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_validation/ROLLUP_HONK/rollup_honk_vk_deserialize_verification.hpp"

#include <gtest/gtest.h>

using namespace bb;
using namespace honk_recursion_test_helpers;
using namespace rollup_honk_test_helpers;
namespace VkDes = RollupHonkRecursionValidation::VkDeserialize;

class RootRollupVkDeserializeValidationTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

// Positive: both root-rollup opcodes pass on the real (full create_circuit) builder.
TEST_F(RootRollupVkDeserializeValidationTests, ValidatesBothOpcodeVkDeserializeRegions)
{
    auto ctx = setup_root_rollup_ipa_discovery(0, /*use_valid_proof=*/true);
    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer(ctx.builder(), false);

    for (size_t opcode_index = 0; opcode_index < 2; ++opcode_index) {
        const auto& constraint = ctx.program.constraints.honk_recursion_constraints[opcode_index];
        const auto result = VkDes::validate_vk_deserialize_region<bb::fr>(ctx.builder(), analyzer, constraint, opcode_index);

        SCOPED_TRACE("opcode_index=" + std::to_string(opcode_index) +
                     " region_start=" + std::to_string(result.arith_region_start) +
                     " checked=" + std::to_string(result.commitments_checked));
        EXPECT_TRUE(result.is_valid);
        EXPECT_NE(result.arith_region_start, SIZE_MAX);
        // key has 115 fields: key[0..2] metadata + key[3..114] commitments. Anchor is key[3],
        // so the validator checks the remaining 111 commitment witnesses.
        EXPECT_EQ(result.commitments_checked, constraint.key.size() - VkDes::FIRST_COMMITMENT_KEY_INDEX - 1);
    }
}

// The discovered region must be opcode-local: opcode 1's region starts strictly after opcode 0's.
TEST_F(RootRollupVkDeserializeValidationTests, OpcodeRegionsAreDistinctAndOrdered)
{
    auto ctx = setup_root_rollup_ipa_discovery(0, /*use_valid_proof=*/true);
    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer(ctx.builder(), false);

    const auto r0 = VkDes::validate_vk_deserialize_region<bb::fr>(
        ctx.builder(), analyzer, ctx.program.constraints.honk_recursion_constraints[0], 0);
    const auto r1 = VkDes::validate_vk_deserialize_region<bb::fr>(
        ctx.builder(), analyzer, ctx.program.constraints.honk_recursion_constraints[1], 1);

    ASSERT_TRUE(r0.is_valid);
    ASSERT_TRUE(r1.is_valid);
    EXPECT_GT(r1.arith_region_start, r0.arith_region_start);
}

// Negative: non-key witnesses (key_hash, proof[]) do NOT have a gate in the discovered region.
TEST_F(RootRollupVkDeserializeValidationTests, NonKeyWitnessesAreOutsideRegion)
{
    auto ctx = setup_root_rollup_ipa_discovery(0, /*use_valid_proof=*/true);
    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer(ctx.builder(), false);
    const auto& constraint = ctx.program.constraints.honk_recursion_constraints[0];

    const auto result = VkDes::validate_vk_deserialize_region<bb::fr>(ctx.builder(), analyzer, constraint, 0);
    ASSERT_TRUE(result.is_valid);
    const size_t lo = result.arith_region_start;
    const size_t hi = lo + VkDes::ARITH_OP0.gate_count;
    auto& arith = ctx.builder().blocks.arithmetic;

    const auto has_arith_gate_in_region = [&](uint32_t witness_idx) {
        const uint32_t real = ctx.builder().real_variable_index[witness_idx];
        for (const auto& [blk, gi] : analyzer.get_variable_gates(real)) {
            if (&ctx.builder().blocks.get()[blk] == &arith && gi >= lo && gi < hi) {
                return true;
            }
        }
        return false;
    };

    EXPECT_FALSE(has_arith_gate_in_region(constraint.key_hash));
    ASSERT_FALSE(constraint.proof.empty());
    EXPECT_FALSE(has_arith_gate_in_region(constraint.proof[0]));
    EXPECT_FALSE(has_arith_gate_in_region(constraint.proof[constraint.proof.size() / 2]));
}

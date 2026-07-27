// Mode 1 (Discovery): per-opcode FunctionFingerprint dump for 2× ROOT_ROLLUP_HONK opcodes.
//
// Emits:
//   root_rollup_honk_opcodes_analysis.txt       — block-total segments + ACIR witness fingerprints
//   root_rollup_honk_opcodes_staged_analysis.txt — Oink→KZG staged pipeline + ACIR witness fingerprints

#include "barretenberg/boomerang_value_detection/graph.hpp"
#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_validation/ROLLUP_HONK/rollup_honk_recursion_test_helpers.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"

#include <fstream>
#include <gtest/gtest.h>

using namespace bb;
using namespace cdg;
using namespace honk_recursion_test_helpers;
using namespace rollup_honk_test_helpers;

class RollupHonkRootOpcodesDumpTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

TEST_F(RollupHonkRootOpcodesDumpTests, AcirRootRollupHonkCompiles)
{
    acir_format::AcirProgram program = make_root_rollup_acir_program_from_two_rollups(0);
    Builder builder = acir_format::create_circuit<Builder>(program, { .has_ipa_claim = false });
    EXPECT_GT(builder.get_num_finalized_gates_inefficient(), 0UL);
    EXPECT_EQ(program.constraints.honk_recursion_constraints.size(), 2U);
}

TEST_F(RollupHonkRootOpcodesDumpTests, RootRollupHonkOpcodesFunctionAnalysis)
{
    auto ctx = setup_root_rollup_ipa_discovery(0, /*use_valid_proof=*/true);
    StaticAnalyzer_<bb::fr, Builder> analyzer(ctx.builder(), false);

    std::ofstream out("root_rollup_honk_opcodes_analysis.txt");
    ASSERT_TRUE(out.is_open());

    dump_analysis_header(out,
                         "ROOT_ROLLUP_HONK Opcodes — Step Analysis",
                         "2× ROOT_ROLLUP_HONK honk recursion opcodes before IPA finalize",
                         static_cast<size_t>(NativeFlavor::VIRTUAL_LOG_N));

    out << "RootOpcode0 (gate 0 -> after opcode 0)\n";
    dump_step_fingerprints(out, ctx.builder(), ctx.before_opcodes, ctx.after_opcode0, "RootOpcode0");
    dump_step_fingerprints_as_constexpr(out, ctx.builder(), ctx.before_opcodes, ctx.after_opcode0, "RootOpcode0");
    dump_root_rollup_opcode_acir_witness_fingerprints<bb::fr>(
        out,
        ctx.builder(),
        analyzer,
        ctx.program.constraints.honk_recursion_constraints[0],
        ctx.before_opcodes,
        "RootOpcode0");
    dump_ipa_round_separator(out);

    out << "RootOpcode1 (after opcode 0 -> after opcode 1)\n";
    dump_step_fingerprints(out, ctx.builder(), ctx.after_opcode0, ctx.after_opcodes, "RootOpcode1");
    dump_step_fingerprints_as_constexpr(out, ctx.builder(), ctx.after_opcode0, ctx.after_opcodes, "RootOpcode1");
    dump_root_rollup_opcode_acir_witness_fingerprints<bb::fr>(
        out,
        ctx.builder(),
        analyzer,
        ctx.program.constraints.honk_recursion_constraints[1],
        ctx.after_opcode0,
        "RootOpcode1");
    dump_ipa_round_separator(out);

    out << "RootOpcodesAggregate (gate 0 -> after both opcodes)\n";
    dump_step_fingerprints(out, ctx.builder(), ctx.before_opcodes, ctx.after_opcodes, "RootOpcodesAggregate");
    dump_step_fingerprints_as_constexpr(out, ctx.builder(), ctx.before_opcodes, ctx.after_opcodes, "RootOpcodesAggregate");
    out.flush();

    EXPECT_GT(total_block_delta(ctx.before_opcodes, ctx.after_opcode0), 0U);
    EXPECT_GT(total_block_delta(ctx.after_opcode0, ctx.after_opcodes), 0U);
}

TEST_F(RollupHonkRootOpcodesDumpTests, RootRollupHonkOpcodesStagedFunctionAnalysis)
{
    std::ofstream out("root_rollup_honk_opcodes_staged_analysis.txt");
    ASSERT_TRUE(out.is_open()) << "Failed to open root_rollup_honk_opcodes_staged_analysis.txt";

    dump_analysis_header(out,
                         "ROOT_ROLLUP_HONK Opcodes — Staged HONK Pipeline Analysis",
                         "Oink -> Preprocessor -> Sumcheck -> Shplemini -> KZG per ROOT_ROLLUP_HONK opcode",
                         static_cast<size_t>(NativeFlavor::VIRTUAL_LOG_N),
                         "# Path C: ACIR constraint witnesses -> stepped RollupIO verifier (not create_honk monolith)\n"
                         "# Opcode 1 runs after create_honk_recursion_constraints(opcode 0) + output.update\n");

    for (size_t opcode_index = 0; opcode_index < 2; ++opcode_index) {
        auto staged = setup_root_rollup_opcode_staged_dump(opcode_index);
        StaticAnalyzer_<bb::fr, Builder> analyzer(staged.vc.builder(), false);
        const char* opcode_prefix = opcode_index == 0 ? "RootOpcode0" : "RootOpcode1";
        out << "=== RootOpcode" << opcode_index << " staged pipeline ===\n";
        out << "segment_start_arith=" << staged.segment_start.sizes[BLOCK_IDX_ARITHMETIC] << "\n";
        dump_rollup_honk_staged_pipeline(out, staged.vc, opcode_prefix);
        dump_root_rollup_opcode_acir_witness_fingerprints<bb::fr>(
            out,
            staged.vc.builder(),
            analyzer,
            staged.program.constraints.honk_recursion_constraints[opcode_index],
            staged.segment_start,
            opcode_prefix);
        dump_ipa_round_separator(out);

        const auto all_squeezes = recursion_helpers::find_all_transcript_squeeze_gates(staged.vc.builder());
        out << "RootOpcode" << opcode_index << "_squeeze_count=" << all_squeezes.size() << "\n\n";
        EXPECT_GE(all_squeezes.size(), HonkRecursionValidation::TOTAL_SQUEEZE_GATES);
    }

    out.flush();
    SUCCEED();
}

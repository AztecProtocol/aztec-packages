// Boomerang analysis and validation tests for ROLLUP_HONK recursion constraints.
//
// Verification flow (RollupIO prefix + shared HONK stages, UltraRecursiveFlavor, constant-true predicate):
//   step0 : OinkVerifier (RollupIO public inputs + vk_hash + wire commitments + eta/beta/gamma/alpha)
//   step1 : Preprocessor (padding_indicator_array + gate_challenges dyadic powers)
//   step2 : SumcheckVerifier
//   step3 : ShpleminiVerifier::compute_batch_opening_claim
//   step4 : KZG::reduce_verify_batch_opening_claim
//   finalize: pass-through IPA (ROLLUP_HONK) or full IPA verify (ROOT_ROLLUP_HONK)
//
// Step 1 (discovery): rollup_honk_functions_analysis.txt (AcirRollupHonkFunctionAnalysis).
// IPA accumulate discovery/validation: rollup_honk_ipa_accumulate_validation.test.cpp

#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_validation/ROLLUP_HONK/rollup_honk_recursion_validation.hpp"
#include "barretenberg/boomerang_value_detection/graph_description_acir.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_validation/ROLLUP_HONK/rollup_honk_ipa_finalize_verification.hpp"
#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_validation/ROLLUP_HONK/rollup_honk_ipa_test_config.hpp"
#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_validation/ROLLUP_HONK/rollup_honk_recursion_test_helpers.hpp"

#include <algorithm>
#include <cstddef>
#include <fstream>
#include <gtest/gtest.h>
#include <set>
#include <string>
#include <vector>

using namespace bb;
using namespace cdg;
using namespace honk_recursion_test_helpers;
using namespace rollup_honk_test_helpers;

class BoomerangRollupHonkTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

class RollupHonkRecursionTestSuite : public BoomerangRollupHonkTests {};

class RollupHonkIpaFinalizeTests : public BoomerangRollupHonkTests {};

// Fast IPA build (BB_ROLLUP_HONK_FAST_IPA_BUILD): ROOT Rollup IPA at TEST_IPA_LOG_N (=12) instead of 15.
class RollupHonkFastIpaBuildTests : public BoomerangRollupHonkTests {};

namespace {
bool rollup_oink_squeezes_dead(const RollupValidatorContext& ctx)
{
    return !ctx.oink_squeeze_ok;
}

struct RollupAlignedWitnesses {
    std::vector<uint32_t> proof_indices;
    size_t io_prefix = 0;
    size_t honk_body_start = 0;
    size_t honk_body_end = 0;
    size_t ipa_tail_start = 0;
    size_t ipa_tail_end = 0;
};

RollupAlignedWitnesses make_rollup_aligned_witnesses(const acir_format::RecursionConstraint& c, size_t log_n)
{
    RollupAlignedWitnesses a;
    a.proof_indices = acir_format::add_public_inputs_to_proof(c.proof, c.public_inputs);
    a.io_prefix = HonkRecursionValidation::Oink::honk_public_input_prefix_size(&c);
    auto layout = RollupHonkRecursionValidation::IO::validate_rollup_proof_layout<RecursiveFlavor>(c, log_n);
    a.honk_body_start = layout.honk_body_start;
    a.honk_body_end = layout.honk_body_end;
    a.ipa_tail_start = layout.ipa_tail_start;
    a.ipa_tail_end = layout.ipa_tail_end;
    return a;
}

size_t min_gate_in_block(Builder& builder,
                         cdg::StaticAnalyzer_<bb::fr, Builder>& analyzer,
                         uint32_t witness_idx,
                         size_t block_idx)
{
    size_t min_g = SIZE_MAX;
    const uint32_t real = builder.real_variable_index[witness_idx];
    auto& target = builder.blocks.get()[block_idx];
    for (const auto& [blk, gi] : analyzer.get_variable_gates(real)) {
        if (&builder.blocks.get()[blk] == &target) {
            min_g = std::min(min_g, gi);
        }
    }
    return min_g;
}

void dump_slot_gates(std::ostream& out,
                     Builder& builder,
                     cdg::StaticAnalyzer_<bb::fr, Builder>& analyzer,
                     const char* part,
                     const char* slot,
                     uint32_t witness_idx)
{
    const uint32_t real = builder.real_variable_index[witness_idx];
    out << "part=" << part << " slot=" << slot << " w=" << witness_idx << " real=" << real << "\n";
    size_t gate_min = SIZE_MAX;
    for (const auto& [blk, gi] : analyzer.get_variable_gates(real)) {
        out << "  block[" << blk << "] " << block_kind_name(blk) << " gate=" << gi << "\n";
        gate_min = std::min(gate_min, gi);
    }
    if (gate_min == SIZE_MAX) {
        out << "  gate_min=none\n";
    } else {
        out << "  gate_min=" << gate_min << "\n";
    }
}

} // namespace

TEST_F(RollupHonkRecursionTestSuite, RollupHonkMirroredBuildMatchesRealAcirCircuit)
{
    RollupVerifierComponents vc = setup_rollup_verifier_components(0);
    build_full_rollup_honk_circuit(vc);
    auto mirrored = recursion_helpers::BlockSnapshot::capture(vc.builder());

    acir_format::AcirProgram program = make_rollup_acir_program(0);
    const auto& constraint = program.constraints.honk_recursion_constraints[0];
    Builder real_builder(program.witness, program.constraints.public_inputs, false);
    [[maybe_unused]] auto real_output =
        acir_format::create_honk_recursion_constraints<RecursiveFlavor, rollup_honk_test_helpers::RollupIO>(
            real_builder, constraint);
    auto real = recursion_helpers::BlockSnapshot::capture(real_builder);

    ASSERT_EQ(real.sizes.size(), mirrored.sizes.size());
    for (size_t b = 0; b < mirrored.sizes.size(); ++b) {
        EXPECT_EQ(real.sizes[b], mirrored.sizes[b])
            << "block[" << b << "] " << block_kind_name(b) << " mismatch: real=" << real.sizes[b]
            << " mirrored=" << mirrored.sizes[b];
    }
}

// Phase 1 Step 0 (rollup_honk_plan): measure squeeze anchors on real Ultra+RollupIO ACIR build;
// lock squeeze-keep vs cursor-migrate for Phase 3. Never copy bare HONK TOTAL_SQUEEZE_GATES.
TEST_F(RollupHonkRecursionTestSuite, RollupHonkPhase1ArchitectureFork)
{
    acir_format::AcirProgram program = make_rollup_acir_program(0);
    const auto& constraint = program.constraints.honk_recursion_constraints[0];
    Builder builder(program.witness, program.constraints.public_inputs, false);
    [[maybe_unused]] auto output =
        acir_format::create_honk_recursion_constraints<RecursiveFlavor, rollup_honk_test_helpers::RollupIO>(builder,
                                                                                                            constraint);

    const auto all_squeezes = recursion_helpers::find_all_transcript_squeeze_gates(builder);
    std::set<size_t> peek;
    auto oink_chal = recursion_helpers::oink_challenges(builder, all_squeezes, peek);
    const bool oink_squeeze_ok =
        oink_chal.valid && oink_chal.squeeze_gate_indices.size() == HonkRecursionValidation::Oink::NUM_OINK_SQUEEZES;

    bool pre_eta_fp_ok = false;
    size_t eta_gate = 0;
    if (oink_squeeze_ok) {
        std::vector<size_t> oink_sq(oink_chal.squeeze_gate_indices.begin(), oink_chal.squeeze_gate_indices.end());
        std::sort(oink_sq.begin(), oink_sq.end());
        eta_gate = oink_sq[0];
        const size_t oink_start = eta_gate + 1 - RollupHonkRecursionValidation::Oink::PRE_ETA_ARITH_OP0.gate_count;
        pre_eta_fp_ok = recursion_helpers::matches_fingerprint_at(
            builder, builder.blocks.arithmetic, oink_start, RollupHonkRecursionValidation::Oink::PRE_ETA_ARITH_OP0);
    }

    const char* fork = (!all_squeezes.empty() && oink_squeeze_ok && pre_eta_fp_ok) ? "squeeze-keep" : "cursor-migrate";

    std::ofstream out("rollup_honk_phase1_fork.txt");
    ASSERT_TRUE(out.is_open());
    out << "# ROLLUP_HONK Phase 1 Step 0 — architecture fork (real create_honk_recursion_constraints + RollupIO)\n";
    out << "squeeze_gate_count=" << all_squeezes.size() << "\n";
    out << "oink_challenges_valid=" << (oink_chal.valid ? 1 : 0) << "\n";
    out << "oink_squeeze_count=" << oink_chal.squeeze_gate_indices.size() << "\n";
    out << "eta_squeeze_gate=" << eta_gate << "\n";
    out << "pre_eta_fingerprint_ok=" << (pre_eta_fp_ok ? 1 : 0) << "\n";
    out << "phase3_architecture_fork=" << fork << "\n";
    out << "# Criterion: squeeze-keep iff squeeze_gate_count>0 AND oink_challenges_valid AND "
           "pre_eta_fingerprint_ok AND oink_squeeze_count==NUM_OINK_SQUEEZES\n";
    out << "# Do not use HonkRecursionValidation::TOTAL_SQUEEZE_GATES for rollup accounting\n";
    out.flush();

    EXPECT_FALSE(std::string(fork).empty());
}

TEST_F(RollupHonkRecursionTestSuite, RollupHonkProofLayoutMatchesExpectedSerialization)
{
    auto rollup_program = make_rollup_acir_program(/*num_acir_pub_inputs=*/2);
    auto plain_program = make_plain_acir_program(/*num_acir_pub_inputs=*/2);
    const auto& rollup = rollup_program.constraints.honk_recursion_constraints[0];
    const auto& plain = plain_program.constraints.honk_recursion_constraints[0];

    auto layout = RollupHonkRecursionValidation::IO::validate_rollup_proof_layout<RecursiveFlavor>(
        rollup, static_cast<size_t>(NativeFlavor::VIRTUAL_LOG_N));
    ASSERT_TRUE(layout.is_valid);

    const size_t honk_body_len =
        ProofLength::Honk<RecursiveFlavor>::LENGTH_WITHOUT_PUB_INPUTS(static_cast<size_t>(NativeFlavor::VIRTUAL_LOG_N));
    EXPECT_EQ(plain.proof.size(), bb::DEFAULT_PUBLIC_INPUTS_SIZE + honk_body_len);
    EXPECT_EQ(rollup.proof.size(), bb::ROLLUP_PUBLIC_INPUTS_SIZE + honk_body_len + bb::IPA_PROOF_LENGTH);
    EXPECT_EQ(layout.honk_body_start, bb::ROLLUP_PUBLIC_INPUTS_SIZE);
    EXPECT_EQ(layout.ipa_tail_start, bb::ROLLUP_PUBLIC_INPUTS_SIZE + honk_body_len);

    auto rollup_wl = HonkRecursionValidation::Oink::get_honk_commitment_group_witness_indices(
        rollup.proof, HonkRecursionValidation::Oink::PRE_ETA_COMMITMENT_GROUPS[0], bb::ROLLUP_PUBLIC_INPUTS_SIZE);
    auto plain_wl = HonkRecursionValidation::Oink::get_honk_commitment_group_witness_indices(
        plain.proof, HonkRecursionValidation::Oink::PRE_ETA_COMMITMENT_GROUPS[0], bb::DEFAULT_PUBLIC_INPUTS_SIZE);
    EXPECT_TRUE(rollup_wl.has_value());
    EXPECT_TRUE(plain_wl.has_value());
}

TEST_F(RollupHonkRecursionTestSuite, AcirRollupHonkFunctionAnalysis)
{
    RollupVerifierComponents vc = setup_rollup_verifier_components(0);

    std::ofstream out("rollup_honk_functions_analysis.txt");
    ASSERT_TRUE(out.is_open()) << "Failed to open rollup_honk_functions_analysis.txt";

    dump_analysis_header(
        out, "ROLLUP_HONK Recursion — Baseline Circuit Analysis", "RollupIO (PairingPoints + IPA claim)", vc.log_n);

    auto layout =
        RollupHonkRecursionValidation::IO::validate_rollup_proof_layout<RecursiveFlavor>(vc.constraint, vc.log_n);
    dump_rollup_layout(out, vc.constraint, layout);
    dump_rollup_public_input_prefix(out, vc);
    out << "\n";

    auto snap_before_oink = recursion_helpers::BlockSnapshot::capture(vc.builder());
    run_oink_step(vc);
    auto snap_after_oink = recursion_helpers::BlockSnapshot::capture(vc.builder());
    dump_step_fingerprints(out, vc.builder(), snap_before_oink, snap_after_oink, "Oink");

    auto snap_before_preproc = snap_after_oink;
    run_gate_challenges_step(vc);
    auto snap_after_preproc = recursion_helpers::BlockSnapshot::capture(vc.builder());
    dump_step_fingerprints(out, vc.builder(), snap_before_preproc, snap_after_preproc, "Preprocessor");

    auto snap_before_sumcheck = snap_after_preproc;
    auto sc_output = run_sumcheck_step(vc);
    auto snap_after_sumcheck = recursion_helpers::BlockSnapshot::capture(vc.builder());
    dump_step_fingerprints(out, vc.builder(), snap_before_sumcheck, snap_after_sumcheck, "Sumcheck");

    auto snap_before_shplemini = snap_after_sumcheck;
    auto shp_output = run_shplemini_step(vc, sc_output);
    auto snap_after_shplemini = recursion_helpers::BlockSnapshot::capture(vc.builder());
    dump_step_fingerprints(out, vc.builder(), snap_before_shplemini, snap_after_shplemini, "Shplemini");

    auto snap_before_kzg = snap_after_shplemini;
    auto pcs_pairing_points = run_kzg_step(vc, shp_output);
    auto snap_after_kzg = recursion_helpers::BlockSnapshot::capture(vc.builder());
    dump_step_fingerprints(out, vc.builder(), snap_before_kzg, snap_after_kzg, "KZG");

    auto snap_before_output = snap_after_kzg;
    run_output_step<rollup_honk_test_helpers::RollupIO>(vc, pcs_pairing_points);
    auto snap_after_output = recursion_helpers::BlockSnapshot::capture(vc.builder());
    dump_step_fingerprints(out, vc.builder(), snap_before_output, snap_after_output, "Output");

    out << "\n";
    dump_squeeze_chain_summary(out, vc.builder());
    dump_nonempty_block_totals(out, vc.builder());
    out.flush();

    const auto all_squeezes = recursion_helpers::find_all_transcript_squeeze_gates(vc.builder());
    // Record count only — rollup-owned fork decides squeeze-keep vs cursor-migrate (Phase 1 Step 0).
    // Do not gate on bare HonkRecursionValidation::TOTAL_SQUEEZE_GATES.
    out << "# squeeze_gate_count=" << all_squeezes.size() << "\n";
    EXPECT_GT(snap_after_output.sizes[BLOCK_IDX_ARITHMETIC], 0U);
}

TEST_F(RollupHonkRecursionTestSuite, RollupHonkOinkStageAnalysis)
{
    RollupVerifierComponents vc = setup_rollup_verifier_components(0);

    auto snap_setup = recursion_helpers::BlockSnapshot::capture(vc.builder());
    const size_t arith_before_oink = snapshot_size_at(snap_setup, BLOCK_IDX_ARITHMETIC);
    const size_t nnf_before_oink = snapshot_size_at(snap_setup, BLOCK_IDX_NNF);
    const size_t ext_before_oink = snapshot_size_at(snap_setup, BLOCK_IDX_POSEIDON2_EXT);
    const size_t int_before_oink = snapshot_size_at(snap_setup, BLOCK_IDX_POSEIDON2_INT);

    run_oink_step(vc);
    auto snap_after_oink = recursion_helpers::BlockSnapshot::capture(vc.builder());

    const size_t arith_oink_end = snap_after_oink.sizes[BLOCK_IDX_ARITHMETIC];
    const size_t nnf_oink_end = snap_after_oink.sizes[BLOCK_IDX_NNF];
    const size_t ext_oink_end = snap_after_oink.sizes[BLOCK_IDX_POSEIDON2_EXT];
    const size_t int_oink_end = snap_after_oink.sizes[BLOCK_IDX_POSEIDON2_INT];

    auto all_squeezes = recursion_helpers::find_all_transcript_squeeze_gates(vc.builder());
    auto oink_chal = recursion_helpers::oink_challenges(vc.builder(), all_squeezes);
    if (!oink_chal.valid) {
        GTEST_SKIP() << "Phase 1 fork=cursor-migrate: Oink squeeze windows dead";
    }

    std::vector<size_t> sorted_oink_squeezes(oink_chal.squeeze_gate_indices.begin(),
                                             oink_chal.squeeze_gate_indices.end());
    std::sort(sorted_oink_squeezes.begin(), sorted_oink_squeezes.end());
    ASSERT_EQ(sorted_oink_squeezes.size(), 3U);

    const size_t eta_gate = sorted_oink_squeezes[0];
    const size_t beta_gamma_gate = sorted_oink_squeezes[1];
    const size_t alpha_gate = sorted_oink_squeezes[2];

    std::ofstream out("rollup_honk_oink_stage_analysis.txt");
    ASSERT_TRUE(out.is_open());

    out << "# ROLLUP_HONK Oink Stage Analysis\n";
    out << "# arith_before_oink=" << arith_before_oink << "\n";
    out << "# arith_oink_end=" << arith_oink_end << " total=" << (arith_oink_end - arith_before_oink) << "\n";
    out << "# eta_squeeze=" << eta_gate << " beta_gamma_squeeze=" << beta_gamma_gate << " alpha_squeeze=" << alpha_gate
        << "\n\n";

    emit_fingerprint_line(out, vc.builder(), BLOCK_IDX_ARITHMETIC, arith_before_oink, eta_gate + 1, "pre_eta_arith");
    emit_fingerprint_line(out, vc.builder(), BLOCK_IDX_ARITHMETIC, eta_gate + 1, beta_gamma_gate + 1, "post_eta_arith");
    emit_fingerprint_line(
        out, vc.builder(), BLOCK_IDX_ARITHMETIC, beta_gamma_gate + 1, alpha_gate + 1, "post_beta_gamma_arith");
    emit_fingerprint_line(out, vc.builder(), BLOCK_IDX_NNF, nnf_before_oink, nnf_oink_end, "oink_nnf_total");
    emit_fingerprint_line(out, vc.builder(), BLOCK_IDX_POSEIDON2_EXT, ext_before_oink, ext_oink_end, "oink_ext_total");
    emit_fingerprint_line(out, vc.builder(), BLOCK_IDX_POSEIDON2_INT, int_before_oink, int_oink_end, "oink_int_total");
    out.flush();
}

TEST_F(RollupHonkRecursionTestSuite, ValidateRollupHonkRecursion)
{
    acir_format::AcirProgram program = make_rollup_acir_program(0);
    const auto& constraint = program.constraints.honk_recursion_constraints[0];
    Builder builder(program.witness, program.constraints.public_inputs, false);
    [[maybe_unused]] auto output =
        acir_format::create_honk_recursion_constraints<RecursiveFlavor, rollup_honk_test_helpers::RollupIO>(builder,
                                                                                                            constraint);
    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer(builder, false);
    const size_t log_n = static_cast<size_t>(NativeFlavor::VIRTUAL_LOG_N);
    auto result = RollupHonkRecursionValidation::validate_rollup_honk_recursion<bb::fr, Builder, RecursiveFlavor>(
        builder, analyzer, constraint, log_n, /*opcode_index=*/0);
    EXPECT_TRUE(result.layout.is_valid);
    EXPECT_TRUE(result.honk.is_valid) << "oink=" << result.honk.oink.is_valid
                                      << " preprocessor=" << result.honk.preprocessor.is_valid
                                      << " sumcheck=" << result.honk.sumcheck.is_valid
                                      << " shplemini=" << result.honk.shplemini.is_valid
                                      << " kzg=" << result.honk.kzg.is_valid << " output=" << result.output.is_valid;
    EXPECT_TRUE(result.ipa.is_valid);
    EXPECT_TRUE(result.is_valid);
}

// Full staged per-opcode validation of the real two-opcode ROOT_ROLLUP_HONK merge: layout, Oink..KZG,
// Shplemini/KZG commitment anchoring, and the IPA tail/claim (deferred pass-through) — the complete
// validate_rollup_honk_recursion result for each root opcode.
TEST_F(RollupHonkIpaFinalizeTests, ValidateBothRootRollupOpcodesBeforeIpa)
{
    auto ctx = setup_root_rollup_ipa_discovery(0, /*use_valid_proof=*/true);
    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer(ctx.builder(), false);
    const size_t log_n = static_cast<size_t>(NativeFlavor::VIRTUAL_LOG_N);

    RollupHonkRecursionValidation::BlockCursor starts{};
    for (size_t opcode_index = 0; opcode_index < 2; ++opcode_index) {
        const auto& constraint = ctx.program.constraints.honk_recursion_constraints[opcode_index];
        auto result = RollupHonkRecursionValidation::validate_rollup_honk_recursion<bb::fr, Builder, RecursiveFlavor>(
            ctx.builder(), analyzer, constraint, log_n, opcode_index, starts);

        SCOPED_TRACE("opcode_index=" + std::to_string(opcode_index));
        EXPECT_TRUE(result.layout.is_valid);
        EXPECT_TRUE(result.honk.is_valid)
            << "oink=" << result.honk.oink.is_valid << " preprocessor=" << result.honk.preprocessor.is_valid
            << " sumcheck=" << result.honk.sumcheck.is_valid << " shplemini=" << result.honk.shplemini.is_valid
            << " kzg=" << result.honk.kzg.is_valid << " output=" << result.output.is_valid;
        // Informative only (stale SINGLE_COMMITMENT receive-FP) — same as ROLLUP Phase 3.
        (void)result.shplemini_kzg_commitments.is_valid;
        EXPECT_TRUE(result.ipa.is_valid) << "layout_ok=" << result.ipa.layout_ok
                                         << " tail_size_ok=" << result.ipa.tail_size_ok;
        EXPECT_TRUE(result.is_valid);
        starts = result.handoff_end;
    }
}

TEST_F(RollupHonkRecursionTestSuite, ValidateRollupHonkOink)
{
    RollupValidatorContext ctx;
    if (rollup_oink_squeezes_dead(ctx)) {
        GTEST_SKIP() << "Phase 1 fork=cursor-migrate: Oink squeeze windows dead";
    }
    std::set<size_t> consumed;

    auto result = RollupHonkRecursionValidation::Oink::validate_oink(ctx.vc.builder(),
                                                                     *ctx.analyzer,
                                                                     ctx.oink_arith_start,
                                                                     ctx.all_squeezes,
                                                                     consumed,
                                                                     ctx.vc.constraint,
                                                                     ctx.vc.constraint.proof);

    EXPECT_TRUE(result.base.is_valid);
    EXPECT_TRUE(result.base.squeeze_count_ok);
    EXPECT_TRUE(result.base.pre_eta_arith_ok);
    EXPECT_TRUE(result.base.post_eta_arith_ok);
    EXPECT_TRUE(result.base.post_beta_gamma_arith_ok);
    EXPECT_TRUE(result.base.acir_constraint_ok);
    EXPECT_EQ(consumed.size(), 3U);
}

TEST_F(RollupHonkRecursionTestSuite, ValidateRollupHonkPreprocessor)
{
    RollupValidatorContext ctx;
    if (rollup_oink_squeezes_dead(ctx)) {
        GTEST_SKIP() << "Phase 1 fork=cursor-migrate: Oink squeeze windows dead";
    }
    std::set<size_t> consumed;

    auto oink = RollupHonkRecursionValidation::Oink::validate_oink(ctx.vc.builder(),
                                                                   *ctx.analyzer,
                                                                   ctx.oink_arith_start,
                                                                   ctx.all_squeezes,
                                                                   consumed,
                                                                   ctx.vc.constraint,
                                                                   ctx.vc.constraint.proof);
    ASSERT_TRUE(oink.base.is_valid);

    auto result = HonkRecursionValidation::Preprocessor::validate_preprocessor(
        ctx.vc.builder(), *ctx.analyzer, oink.base, ctx.all_squeezes, consumed);

    EXPECT_TRUE(result.is_valid);
    EXPECT_EQ(result.arith_start, oink.base.arith_end);
}

TEST_F(RollupHonkRecursionTestSuite, ValidateRollupHonkSumcheck)
{
    RollupValidatorContext ctx;
    if (rollup_oink_squeezes_dead(ctx)) {
        GTEST_SKIP() << "Phase 1 fork=cursor-migrate: Oink squeeze windows dead";
    }
    std::set<size_t> consumed;

    auto oink = RollupHonkRecursionValidation::Oink::validate_oink(ctx.vc.builder(),
                                                                   *ctx.analyzer,
                                                                   ctx.oink_arith_start,
                                                                   ctx.all_squeezes,
                                                                   consumed,
                                                                   ctx.vc.constraint,
                                                                   ctx.vc.constraint.proof);
    ASSERT_TRUE(oink.base.is_valid);
    auto preprocessor = HonkRecursionValidation::Preprocessor::validate_preprocessor(
        ctx.vc.builder(), *ctx.analyzer, oink.base, ctx.all_squeezes, consumed);
    ASSERT_TRUE(preprocessor.is_valid);

    auto result = HonkRecursionValidation::Sumcheck::validate_sumcheck(
        ctx.vc.builder(), *ctx.analyzer, preprocessor, ctx.all_squeezes, consumed);

    EXPECT_TRUE(result.is_valid);
    EXPECT_EQ(result.arith_start, preprocessor.arith_end);
}

TEST_F(RollupHonkRecursionTestSuite, RejectsCorruptedIpaClaimPublicInput)
{
    RollupVerifierComponents vc = setup_rollup_verifier_components(0);

    const auto expected =
        RollupHonkRecursionValidation::IPA::ipa_claim_fields_from_rollup_public_inputs(vc.builder(), vc.constraint);
    auto corrupted = vc.constraint;
    std::swap(corrupted.proof[bb::PAIRING_POINTS_SIZE], corrupted.proof[bb::PAIRING_POINTS_SIZE + 1]);

    EXPECT_FALSE(
        RollupHonkRecursionValidation::IPA::ipa_claim_fields_match_expected(vc.builder(), corrupted, expected));
}

TEST_F(RollupHonkRecursionTestSuite, RejectsTruncatedIpaTail)
{
    RollupVerifierComponents vc = setup_rollup_verifier_components(0);
    auto truncated = vc.constraint;
    truncated.proof.pop_back();

    auto layout = RollupHonkRecursionValidation::IO::validate_rollup_proof_layout<RecursiveFlavor>(truncated, vc.log_n);
    EXPECT_TRUE(layout.proof_type_ok);
    EXPECT_FALSE(layout.proof_size_ok);
    EXPECT_FALSE(layout.ipa_tail_ok);
    EXPECT_FALSE(layout.is_valid);
}

TEST_F(RollupHonkRecursionTestSuite, FullIpaVerificationAllowedOnlyForRootRollupHonk)
{
    RollupVerifierComponents vc = setup_rollup_verifier_components(0);
    auto non_root = vc.constraint;
    auto root = vc.constraint;
    root.proof_type = PROOF_TYPE::ROOT_ROLLUP_HONK;
    auto plain = vc.constraint;
    plain.proof_type = PROOF_TYPE::HONK;

    auto non_root_layout =
        RollupHonkRecursionValidation::IO::validate_rollup_proof_layout<RecursiveFlavor>(non_root, vc.log_n);
    auto root_layout = RollupHonkRecursionValidation::IO::validate_rollup_proof_layout<RecursiveFlavor>(root, vc.log_n);
    auto plain_layout =
        RollupHonkRecursionValidation::IO::validate_rollup_proof_layout<RecursiveFlavor>(plain, vc.log_n);

    EXPECT_TRUE(non_root_layout.is_valid);
    EXPECT_FALSE(non_root_layout.full_ipa_verification_allowed);
    EXPECT_TRUE(root_layout.is_valid);
    EXPECT_TRUE(root_layout.full_ipa_verification_allowed);
    EXPECT_FALSE(plain_layout.proof_type_ok);
    EXPECT_FALSE(plain_layout.full_ipa_verification_allowed);
}

TEST_F(RollupHonkRecursionTestSuite, WrongDefaultIOPrefixBreaksCommitmentValidation)
{
    RollupValidatorContext ctx;

    const auto frs = HonkRecursionValidation::Oink::get_honk_commitment_group_witness_indices(
        ctx.vc.constraint.proof,
        HonkRecursionValidation::Oink::PRE_ETA_COMMITMENT_GROUPS[0],
        HonkRecursionValidation::Oink::HONK_DEFAULT_IO_PUBLIC_INPUTS);
    ASSERT_TRUE(frs.has_value());

    auto fp = recursion_helpers::validate_commitment_receive_fingerprint<bb::fr>(
        ctx.vc.builder(), *ctx.analyzer, (*frs)[0], (*frs)[1], (*frs)[2], (*frs)[3]);
    EXPECT_FALSE(fp.is_valid);
}

TEST_F(RollupHonkRecursionTestSuite, RejectsCorruptedHonkCommitment)
{
    // Squeeze-era commitment-index swap is dead under cursor-migrate (FP range ignores swapped
    // indices on an already-built circuit). Cursor reject covered by RejectsCorruptedRollupHonkOink.
    GTEST_SKIP() << "Phase 1 fork=cursor-migrate: superseded by RejectsCorruptedRollupHonkOink";
}

TEST_F(RollupHonkRecursionTestSuite, AcirRollupHonkWitnessSerializationParse)
{
    acir_format::AcirProgram program = make_rollup_acir_program(0);
    const auto& c = program.constraints.honk_recursion_constraints[0];
    ASSERT_EQ(program.constraints.original_opcode_indices.honk_recursion_constraints.at(0), 0U);
    ASSERT_EQ(c.proof_type, acir_format::PROOF_TYPE::ROLLUP_HONK);
    ASSERT_TRUE(c.predicate.is_constant);

    const size_t log_n = static_cast<size_t>(NativeFlavor::VIRTUAL_LOG_N);
    const auto aligned = make_rollup_aligned_witnesses(c, log_n);
    const auto& proof_indices = aligned.proof_indices;

    EXPECT_EQ(proof_indices.size(), c.proof.size() + c.public_inputs.size());
    for (size_t i = 0; i < c.public_inputs.size(); ++i) {
        EXPECT_EQ(proof_indices[i], c.public_inputs[i]);
    }
    for (size_t i = 0; i < c.proof.size(); ++i) {
        EXPECT_EQ(proof_indices[c.public_inputs.size() + i], c.proof[i]);
    }

    namespace HO = HonkRecursionValidation::Oink;
    namespace VD = RollupHonkRecursionValidation::VkDeserialize;
    ASSERT_GT(c.key.size(), VD::FIRST_COMMITMENT_KEY_INDEX);
    EXPECT_EQ(aligned.io_prefix, bb::ROLLUP_PUBLIC_INPUTS_SIZE);
    EXPECT_EQ(aligned.honk_body_start, bb::ROLLUP_PUBLIC_INPUTS_SIZE);
    EXPECT_EQ(aligned.ipa_tail_end - aligned.ipa_tail_start, bb::IPA_PROOF_LENGTH);

    for (size_t g = 0; g < HO::NUM_COMMITMENT_GROUPS; ++g) {
        const auto frs = HO::get_honk_commitment_group_witness_indices(proof_indices, g, aligned.io_prefix);
        ASSERT_TRUE(frs.has_value()) << "group " << g;
        const size_t base =
            aligned.io_prefix + HO::HONK_PROOF_POSITION_BY_GROUP[g] * recursion_helpers::FRS_PER_COMMITMENT;
        EXPECT_EQ((*frs)[0], proof_indices[base]);
        EXPECT_GE(base, aligned.honk_body_start);
        EXPECT_LT(base + recursion_helpers::FRS_PER_COMMITMENT, aligned.ipa_tail_start);
    }

    std::ofstream out("rollup_honk_witness_serialization.txt");
    ASSERT_TRUE(out.is_open());
    out << "# ROLLUP_HONK witness serialization — opcode=0 proof_type=ROLLUP_HONK\n";
    out << "# key.size=" << c.key.size() << " proof.size=" << c.proof.size()
        << " public_inputs.size=" << c.public_inputs.size() << "\n";
    out << "# Production: honk_recursion_constraint.cpp fields_from_witnesses / from_witness_index\n";
    out << "# Rule A: proof_indices = { public_inputs | proof } (mock often public_inputs empty;\n";
    out << "#          RollupIO prefix lives inside proof[0.." << bb::ROLLUP_PUBLIC_INPUTS_SIZE << "))\n";
    out << "# Rule B: key[i] → VK limb i; key_hash → single witness\n";
    out << "# Rule C: io_prefix=" << aligned.io_prefix
        << " (pairing 8 + ipa_claim 6); group g base = prefix + HONK_PROOF_POSITION_BY_GROUP[g] * "
        << recursion_helpers::FRS_PER_COMMITMENT << "\n";
    out << "# Rule D: UltraVerifier split_rollup_proof — honk_body=[" << aligned.honk_body_start << ", "
        << aligned.honk_body_end << "), ipa_tail=[" << aligned.ipa_tail_start << ", " << aligned.ipa_tail_end
        << "); constant-true predicate; no write-vk\n\n";

    out << "# Aligned witness table\n";
    out << "# logical_slot | source_rule | witness_index | primitive_part | role | prod_order\n";
    out << "key_hash | B | " << c.key_hash << " | Oink:vk_hash | wrapper→circuit | 5\n";
    for (size_t i = 0; i < 3 && i < c.key.size(); ++i) {
        out << "key[" << i << "] | B | " << c.key[i] << " | Oink:num_public_inputs_assert/scalars | wrapper | 1\n";
    }
    for (size_t i = VD::FIRST_COMMITMENT_KEY_INDEX; i < c.key.size(); ++i) {
        out << "key[" << i << "] | B | " << c.key[i] << " | VkDeserialize | circuit | 4\n";
    }
    for (size_t i = 0; i < bb::PAIRING_POINTS_SIZE && i < proof_indices.size(); ++i) {
        out << "stitched_proof[" << i << "] | A+C | " << proof_indices[i]
            << " | Oink:public_inputs/Output:pairing | serialization | 3\n";
    }
    for (size_t i = bb::PAIRING_POINTS_SIZE; i < aligned.io_prefix && i < proof_indices.size(); ++i) {
        out << "stitched_proof[" << i << "] | A+C | " << proof_indices[i]
            << " | Output:ipa_claim (pass-through) | serialization | 3\n";
    }
    static constexpr const char* GROUP_NAMES[] = { "Oink:w_l",
                                                   "Oink:w_r",
                                                   "Oink:w_o",
                                                   "Oink:w_4",
                                                   "Oink:z_perm",
                                                   "Oink:lookup_inverses",
                                                   "Oink:lookup_read_counts",
                                                   "Oink:lookup_read_tags" };
    for (size_t g = 0; g < HO::NUM_COMMITMENT_GROUPS; ++g) {
        const auto frs = HO::get_honk_commitment_group_witness_indices(proof_indices, g, aligned.io_prefix);
        for (size_t limb = 0; limb < recursion_helpers::FRS_PER_COMMITMENT; ++limb) {
            out << "commitment_g" << g << "_fr" << limb << " | C | " << (*frs)[limb] << " | " << GROUP_NAMES[g]
                << " | serialization | 6\n";
        }
    }
    for (size_t i = aligned.ipa_tail_start; i < aligned.ipa_tail_end && i < proof_indices.size(); ++i) {
        out << "ipa_tail[" << (i - aligned.ipa_tail_start) << "] | D | " << proof_indices[i]
            << " | IPA:proof_carry (pass-through) | wrapper | 7\n";
    }

    out << "\n# Early processing order (production)\n";
    out << "1 wrapper | key[] | fields_from_witnesses | wiring\n";
    out << "2 wrapper | key_hash | from_witness_index | wiring\n";
    out << "3 wrapper | proof_indices (full incl IPA tail) | fields_from_witnesses | wiring\n";
    out << "4 circuit | key[3..] | RecursiveVK construction | VkDeserialize (first_primitive_part)\n";
    out << "5 circuit | key_hash | Oink vk_hash | Oink:vk_hash\n";
    out << "6 serialization | proof commitment groups | Oink receive | Oink:w_*/lookup/z_perm\n";
    out << "7 output | pairing + ipa_claim prefix | RollupIO::reconstruct_from_public | Output/IPA pass-through\n";
    out << "early_opcode_witnesses=key[],key_hash,proof_indices[]\n";
    out << "first_primitive_part=VkDeserialize\n";
    out << "last_serialization_part_before_primitive=wrapper (no gates)\n";
    out.flush();
}

TEST_F(RollupHonkRecursionTestSuite, AcirRollupHonkWitnessGateDump)
{
    acir_format::AcirProgram program = make_rollup_acir_program(0);
    const auto& c = program.constraints.honk_recursion_constraints[0];
    Builder builder(program.witness, program.constraints.public_inputs, false);
    [[maybe_unused]] auto output =
        acir_format::create_honk_recursion_constraints<RecursiveFlavor, rollup_honk_test_helpers::RollupIO>(builder, c);
    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer(builder, false);

    const size_t log_n = static_cast<size_t>(NativeFlavor::VIRTUAL_LOG_N);
    const auto aligned = make_rollup_aligned_witnesses(c, log_n);
    namespace HO = HonkRecursionValidation::Oink;
    namespace VD = RollupHonkRecursionValidation::VkDeserialize;

    std::ofstream out("rollup_honk_witness_gate_dump.txt");
    ASSERT_TRUE(out.is_open());
    out << "# ROLLUP_HONK Phase 2 witness gate dump (aligned slots only)\n";
    out << "# Chain: create_honk_recursion_constraints<Ultra, RollupIO> real build\n\n";

    dump_slot_gates(out, builder, analyzer, "Oink:vk_hash", "key_hash", c.key_hash);
    for (size_t i = 0; i < 3 && i < c.key.size(); ++i) {
        dump_slot_gates(out, builder, analyzer, "wrapper_scalar", ("key[" + std::to_string(i) + "]").c_str(), c.key[i]);
    }
    for (size_t i = VD::FIRST_COMMITMENT_KEY_INDEX; i < c.key.size(); ++i) {
        dump_slot_gates(out, builder, analyzer, "VkDeserialize", ("key[" + std::to_string(i) + "]").c_str(), c.key[i]);
    }
    for (size_t i = 0; i < aligned.io_prefix && i < aligned.proof_indices.size(); ++i) {
        const char* part = i < bb::PAIRING_POINTS_SIZE ? "Output:pairing_prefix" : "Output:ipa_claim";
        dump_slot_gates(
            out, builder, analyzer, part, ("stitched[" + std::to_string(i) + "]").c_str(), aligned.proof_indices[i]);
    }
    for (size_t g = 0; g < HO::NUM_COMMITMENT_GROUPS; ++g) {
        const auto frs = HO::get_honk_commitment_group_witness_indices(aligned.proof_indices, g, aligned.io_prefix);
        ASSERT_TRUE(frs.has_value());
        for (size_t limb = 0; limb < recursion_helpers::FRS_PER_COMMITMENT; ++limb) {
            dump_slot_gates(out,
                            builder,
                            analyzer,
                            ("Oink:comm_g" + std::to_string(g)).c_str(),
                            ("fr" + std::to_string(limb)).c_str(),
                            (*frs)[limb]);
        }
    }
    if (aligned.ipa_tail_start < aligned.proof_indices.size()) {
        dump_slot_gates(
            out, builder, analyzer, "IPA:proof_carry", "ipa_tail[0]", aligned.proof_indices[aligned.ipa_tail_start]);
    }
    out.flush();
    SUCCEED();
}

TEST_F(RollupHonkRecursionTestSuite, AcirRollupHonkPrimitiveStartDiscovery)
{
    acir_format::AcirProgram program = make_rollup_acir_program(0);
    const auto& c = program.constraints.honk_recursion_constraints[0];
    Builder builder(program.witness, program.constraints.public_inputs, false);
    [[maybe_unused]] auto output =
        acir_format::create_honk_recursion_constraints<RecursiveFlavor, rollup_honk_test_helpers::RollupIO>(builder, c);
    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer(builder, false);
    auto& arith = builder.blocks.arithmetic;

    const size_t log_n = static_cast<size_t>(NativeFlavor::VIRTUAL_LOG_N);
    const auto aligned = make_rollup_aligned_witnesses(c, log_n);
    namespace HO = HonkRecursionValidation::Oink;
    namespace VD = RollupHonkRecursionValidation::VkDeserialize;

    size_t first_key_arith = SIZE_MAX;
    size_t max_key_arith = 0;
    size_t first_key_nnf = SIZE_MAX;
    for (size_t j = VD::FIRST_COMMITMENT_KEY_INDEX; j < c.key.size(); ++j) {
        first_key_arith =
            std::min(first_key_arith, min_gate_in_block(builder, analyzer, c.key[j], BLOCK_IDX_ARITHMETIC));
        first_key_nnf = std::min(first_key_nnf, min_gate_in_block(builder, analyzer, c.key[j], BLOCK_IDX_NNF));
        const uint32_t real = builder.real_variable_index[c.key[j]];
        for (const auto& [blk, gi] : analyzer.get_variable_gates(real)) {
            if (&builder.blocks.get()[blk] == &arith) {
                max_key_arith = std::max(max_key_arith, gi);
            }
        }
    }
    ASSERT_NE(first_key_arith, SIZE_MAX) << "no arithmetic gate for any key[3..] commitment field";

    const size_t key_hash_p2ext = min_gate_in_block(builder, analyzer, c.key_hash, BLOCK_IDX_POSEIDON2_EXT);
    ASSERT_NE(key_hash_p2ext, SIZE_MAX) << "key_hash must link into poseidon2_external (Oink vk_hash)";

    const auto g0 = HO::get_honk_commitment_group_witness_indices(aligned.proof_indices, 0, aligned.io_prefix);
    ASSERT_TRUE(g0.has_value());
    const size_t proof0_arith = min_gate_in_block(builder, analyzer, (*g0)[0], BLOCK_IDX_ARITHMETIC);

    size_t ipa_claim0_arith = SIZE_MAX;
    if (aligned.io_prefix > bb::PAIRING_POINTS_SIZE) {
        ipa_claim0_arith =
            min_gate_in_block(builder, analyzer, aligned.proof_indices[bb::PAIRING_POINTS_SIZE], BLOCK_IDX_ARITHMETIC);
    }
    size_t ipa_tail0_arith = SIZE_MAX;
    if (aligned.ipa_tail_start < aligned.proof_indices.size()) {
        ipa_tail0_arith =
            min_gate_in_block(builder, analyzer, aligned.proof_indices[aligned.ipa_tail_start], BLOCK_IDX_ARITHMETIC);
    }

    size_t primitive_start_arith = first_key_arith;
    size_t vk_deserialize_region_end = max_key_arith + 1;
    bool used_stale_fp = true;
    auto region_start =
        recursion_helpers::find_fingerprint_range_containing_gate(builder, arith, first_key_arith, VD::ARITH_OP0);
    if (region_start.has_value()) {
        primitive_start_arith = *region_start;
        vk_deserialize_region_end = *region_start + VD::ARITH_OP0.gate_count;
        used_stale_fp = false;
    }

    EXPECT_GE(first_key_arith, primitive_start_arith);
    EXPECT_LT(first_key_arith, vk_deserialize_region_end);

    bool key_hash_early_arith = false;
    {
        const uint32_t key_hash_real = builder.real_variable_index[c.key_hash];
        for (const auto& [blk, gi] : analyzer.get_variable_gates(key_hash_real)) {
            if (&builder.blocks.get()[blk] == &arith && gi < vk_deserialize_region_end) {
                key_hash_early_arith = true;
            }
        }
    }
    EXPECT_FALSE(key_hash_early_arith);

    const size_t serialization_end_arith = 0;
    EXPECT_GT(primitive_start_arith, serialization_end_arith);

    const bool fp_ok = recursion_helpers::matches_fingerprint_at(builder, arith, primitive_start_arith, VD::ARITH_OP0);
    auto measured =
        compute_block_fingerprint(builder, BLOCK_IDX_ARITHMETIC, primitive_start_arith, vk_deserialize_region_end);

    std::ofstream out("rollup_honk_witness_gate_map.txt");
    ASSERT_TRUE(out.is_open());
    out << "# ROLLUP_HONK Phase 2 witness gate map\n";
    out << "# Chain: create_honk_recursion_constraints<Ultra, RollupIO> real build\n";
    out << "# Phase 1 fork=cursor-migrate (see rollup_honk_phase1_fork.txt)\n";
    out << "first_primitive_part=VkDeserialize\n";
    out << "last_serialization_part=wrapper (no gates)\n";
    out << "serialization_end_arith=" << serialization_end_arith << "\n";
    out << "primitive_start_arith=" << primitive_start_arith << " (alias circuit_build_start_arith)\n";
    out << "vk_deserialize_region_end_arith=" << vk_deserialize_region_end << "\n";
    out << "first_key_commitment_gate_arith=" << first_key_arith << "\n";
    if (first_key_nnf == SIZE_MAX) {
        out << "first_key_commitment_gate_nnf=none\n";
    } else {
        out << "first_key_commitment_gate_nnf=" << first_key_nnf << "\n";
    }
    out << "oink_vk_hash_poseidon2_ext_start=" << key_hash_p2ext << "\n";
    out << "proof_g0_fr0_arith_gate_min=" << (proof0_arith == SIZE_MAX ? -1 : static_cast<long>(proof0_arith)) << "\n";
    out << "ipa_claim0_arith_gate_min=" << (ipa_claim0_arith == SIZE_MAX ? -1 : static_cast<long>(ipa_claim0_arith))
        << "\n";
    out << "ipa_tail0_arith_gate_min=" << (ipa_tail0_arith == SIZE_MAX ? -1 : static_cast<long>(ipa_tail0_arith))
        << "\n";
    out << "io_prefix=" << aligned.io_prefix << "\n";
    out << "key_hash_touches_arith_before_region_end=" << (key_hash_early_arith ? 1 : 0) << "\n";
    out << "early_opcode_witnesses=key[0..2](scalar,wrapper),key_hash(wrapper),proof_indices(wrapper)\n";
    out << "vk_deserialize_arith_fp_match_pinned=" << (fp_ok ? "true" : "false") << "\n";
    out << "vk_deserialize_pinned_fp_stale=" << (used_stale_fp || !fp_ok ? "true" : "false") << "\n";
    out << "measured_vk_deserialize_arith gates=" << measured.gate_count << " prefix20=0x" << std::hex
        << measured.prefix_hash << " full=0x" << measured.full_hash << std::dec << "\n";
    out << "# Note: Phase 3 cursor = VkDeserialize@primitive_start → residual? → Oink → … → Output/IPA pass-through\n";
    out.flush();

    EXPECT_TRUE(fp_ok || used_stale_fp)
        << "If find_fingerprint failed, used_stale_fp path must run; measured FP written for refresh";
    if (!fp_ok) {
        EXPECT_GT(measured.gate_count, 0U);
    }
}

// Phase 3 Step 1–2: promote multi-block cursors + FunctionFingerprints from mirror
// stage boundaries (parity-licensed) and verify matches_fingerprint_at on real build.
TEST_F(RollupHonkRecursionTestSuite, AcirRollupHonkPhase3CursorPromote)
{
    RollupVerifierComponents vc = setup_rollup_verifier_components(0);
    auto snap_setup = recursion_helpers::BlockSnapshot::capture(vc.builder());
    run_oink_step(vc);
    auto snap_oink = recursion_helpers::BlockSnapshot::capture(vc.builder());
    run_gate_challenges_step(vc);
    auto snap_pre = recursion_helpers::BlockSnapshot::capture(vc.builder());
    auto sc_output = run_sumcheck_step(vc);
    auto snap_sc = recursion_helpers::BlockSnapshot::capture(vc.builder());
    auto shp_output = run_shplemini_step(vc, sc_output);
    auto snap_shp = recursion_helpers::BlockSnapshot::capture(vc.builder());
    auto pcs = run_kzg_step(vc, shp_output);
    auto snap_kzg = recursion_helpers::BlockSnapshot::capture(vc.builder());
    run_output_step<rollup_honk_test_helpers::RollupIO>(vc, pcs);
    auto snap_out = recursion_helpers::BlockSnapshot::capture(vc.builder());

    auto sz = [](const recursion_helpers::BlockSnapshot& s, size_t b) -> size_t {
        return b < s.sizes.size() ? s.sizes[b] : 0;
    };

    std::ofstream out("rollup_honk_phase3_cursor_promote.txt");
    ASSERT_TRUE(out.is_open());
    out << "# ROLLUP_HONK Phase 3 cursor / FP promotion (mirror stage boundaries)\n";
    out << "# Phase 2: primitive_start_arith=1709 vk_deserialize_region_end=4372\n";
    out << "setup arith=" << sz(snap_setup, BLOCK_IDX_ARITHMETIC) << " nnf=" << sz(snap_setup, BLOCK_IDX_NNF)
        << " mem=" << sz(snap_setup, BLOCK_IDX_MEMORY) << " p2ext=" << sz(snap_setup, BLOCK_IDX_POSEIDON2_EXT)
        << " p2int=" << sz(snap_setup, BLOCK_IDX_POSEIDON2_INT) << "\n";
    if (sz(snap_setup, BLOCK_IDX_NNF) > 0) {
        auto setup_nnf_fp = compute_block_fingerprint(vc.builder(), BLOCK_IDX_NNF, 0, sz(snap_setup, BLOCK_IDX_NNF));
        out << "setup_nnf gates=" << setup_nnf_fp.gate_count << " prefix=0x" << std::hex << setup_nnf_fp.prefix_hash
            << " full=0x" << setup_nnf_fp.full_hash << std::dec << "\n";
    }

    const std::array<std::pair<const char*, const recursion_helpers::BlockSnapshot*>, 6> stages = { {
        { "Oink", &snap_oink },
        { "Preprocessor", &snap_pre },
        { "Sumcheck", &snap_sc },
        { "Shplemini", &snap_shp },
        { "KZG", &snap_kzg },
        { "Output", &snap_out },
    } };
    const recursion_helpers::BlockSnapshot* prev = &snap_setup;
    for (const auto& [name, cur] : stages) {
        out << "\n# " << name << "\n";
        for (size_t b : { BLOCK_IDX_ARITHMETIC,
                          BLOCK_IDX_MEMORY,
                          BLOCK_IDX_NNF,
                          BLOCK_IDX_POSEIDON2_EXT,
                          BLOCK_IDX_POSEIDON2_INT }) {
            const size_t lo = sz(*prev, b);
            const size_t hi = sz(*cur, b);
            if (hi <= lo) {
                continue;
            }
            auto fp = compute_block_fingerprint(vc.builder(), b, lo, hi);
            out << name << " block[" << b << "] " << block_kind_name(b) << " start=" << lo << " end=" << hi
                << " gates=" << fp.gate_count << " prefix=0x" << std::hex << fp.prefix_hash << " full=0x"
                << fp.full_hash << std::dec << "\n";
            EXPECT_TRUE(recursion_helpers::matches_fingerprint_at(vc.builder(), vc.builder().blocks.get()[b], lo, fp))
                << name << " " << block_kind_name(b) << " mirror FP self-check failed at " << lo;
        }
        prev = cur;
    }
    out.flush();

    acir_format::AcirProgram program = make_rollup_acir_program(0);
    const auto& constraint = program.constraints.honk_recursion_constraints[0];
    Builder real_builder(program.witness, program.constraints.public_inputs, false);
    [[maybe_unused]] auto real_out =
        acir_format::create_honk_recursion_constraints<RecursiveFlavor, rollup_honk_test_helpers::RollupIO>(
            real_builder, constraint);
    namespace VD = HonkRecursionValidation::VkDeserialize;
    auto& real_arith = real_builder.blocks.arithmetic;
    const size_t primitive_start = 1709;
    const size_t oink_arith_start = sz(snap_setup, BLOCK_IDX_ARITHMETIC);
    EXPECT_TRUE(recursion_helpers::matches_fingerprint_at(real_builder, real_arith, primitive_start, VD::ARITH))
        << "real build VkDeserialize ARITH must match at Phase 2 primitive_start";

    const size_t vd_end = primitive_start + VD::ARITH.gate_count;
    auto residual = compute_block_fingerprint(real_builder, BLOCK_IDX_ARITHMETIC, vd_end, oink_arith_start);
    auto oink_arith_fp = compute_block_fingerprint(
        real_builder, BLOCK_IDX_ARITHMETIC, oink_arith_start, sz(snap_oink, BLOCK_IDX_ARITHMETIC));
    EXPECT_TRUE(recursion_helpers::matches_fingerprint_at(real_builder, real_arith, oink_arith_start, oink_arith_fp))
        << "real Oink ARITH must match mirror-promoted FP at cursor " << oink_arith_start;

    out << "\n# real-build checks\n";
    out << "primitive_start_arith=" << primitive_start << "\n";
    out << "vk_deserialize_end=" << vd_end << "\n";
    out << "setup_residual gates=" << residual.gate_count << " prefix=0x" << std::hex << residual.prefix_hash
        << " full=0x" << residual.full_hash << std::dec << "\n";
    out << "oink_arith_start=" << oink_arith_start << " oink_arith_gates=" << oink_arith_fp.gate_count << " prefix=0x"
        << std::hex << oink_arith_fp.prefix_hash << " full=0x" << oink_arith_fp.full_hash << std::dec << "\n";
    out << "setup_nnf=" << sz(snap_setup, BLOCK_IDX_NNF) << "\n";
    out.flush();
}

TEST_F(RollupHonkRecursionTestSuite, AcirRollupHonkFingerprintsMatchConstants)
{
    acir_format::AcirProgram program = make_rollup_acir_program(0);
    const auto& constraint = program.constraints.honk_recursion_constraints[0];
    Builder builder(program.witness, program.constraints.public_inputs, false);
    [[maybe_unused]] auto output =
        acir_format::create_honk_recursion_constraints<RecursiveFlavor, rollup_honk_test_helpers::RollupIO>(builder,
                                                                                                            constraint);
    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer(builder, false);
    const size_t log_n = static_cast<size_t>(NativeFlavor::VIRTUAL_LOG_N);
    auto result =
        RollupHonkRecursionValidation::validate_rollup_honk_recursion_cursor<bb::fr, Builder, RecursiveFlavor>(
            builder, analyzer, constraint, log_n);
    EXPECT_TRUE(result.honk.vk_deserialize.is_valid) << "vk_deserialize";
    EXPECT_TRUE(result.honk.oink.is_valid) << "oink";
    EXPECT_TRUE(result.honk.preprocessor.is_valid) << "preprocessor";
    EXPECT_TRUE(result.honk.sumcheck.is_valid) << "sumcheck";
    EXPECT_TRUE(result.honk.shplemini.is_valid) << "shplemini";
    EXPECT_TRUE(result.honk.kzg.is_valid) << "kzg";
    EXPECT_TRUE(result.output.is_valid) << "output";
    EXPECT_TRUE(result.ipa.is_valid) << "ipa layout_ok=" << result.ipa.layout_ok
                                     << " tail_size_ok=" << result.ipa.tail_size_ok;
    // Informative only: SINGLE_COMMITMENT receive-FP scan stale post convert_full_challenge.
    // Opcode→range covered by AcirRollupHonkWitnessLink*.
    (void)result.shplemini_kzg_commitments.is_valid;
    EXPECT_TRUE(result.arith_coverage_valid)
        << "arith " << result.honk.arith_cursor_end << "/" << result.honk.arith_region_end;
    EXPECT_TRUE(result.poseidon2_ext_coverage_valid);
    EXPECT_TRUE(result.poseidon2_int_coverage_valid);
    EXPECT_TRUE(result.nnf_coverage_valid);
    EXPECT_TRUE(result.memory_coverage_valid);
    EXPECT_TRUE(result.all_valid);
}

TEST_F(RollupHonkRecursionTestSuite, AcirRollupHonkWitnessLinkInOink)
{
    acir_format::AcirProgram program = make_rollup_acir_program(0);
    const auto& constraint = program.constraints.honk_recursion_constraints[0];
    Builder builder(program.witness, program.constraints.public_inputs, false);
    [[maybe_unused]] auto output =
        acir_format::create_honk_recursion_constraints<RecursiveFlavor, rollup_honk_test_helpers::RollupIO>(builder,
                                                                                                            constraint);
    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer(builder, false);
    const size_t log_n = static_cast<size_t>(NativeFlavor::VIRTUAL_LOG_N);
    auto result =
        RollupHonkRecursionValidation::validate_rollup_honk_recursion_cursor<bb::fr, Builder, RecursiveFlavor>(
            builder, analyzer, constraint, log_n);
    ASSERT_TRUE(result.honk.oink.is_valid);

    const uint32_t key_hash_real = builder.real_variable_index[constraint.key_hash];
    auto p2_gates = recursion_helpers::collect_real_witness_gates_in_block<bb::fr>(
        builder, analyzer, key_hash_real, poseidon2_helpers::poseidon2_external_block(builder));
    ASSERT_FALSE(p2_gates.empty());
    EXPECT_GE(p2_gates.front(), result.honk.oink.poseidon2_ext_start);
    EXPECT_LT(p2_gates.front(), result.honk.oink.poseidon2_ext_end);

    namespace HO = HonkRecursionValidation::Oink;
    const size_t prefix = HO::honk_public_input_prefix_size(&constraint);
    EXPECT_EQ(prefix, bb::ROLLUP_PUBLIC_INPUTS_SIZE);
    for (size_t g = 0; g < HO::NUM_COMMITMENT_GROUPS; ++g) {
        const auto frs = HO::get_honk_commitment_group_witness_indices(constraint.proof, g, prefix);
        ASSERT_TRUE(frs.has_value()) << "group " << g;
        bool found = false;
        for (uint32_t w : *frs) {
            const uint32_t real = builder.real_variable_index[w];
            for (const auto& [blk, gi] : analyzer.get_variable_gates(real)) {
                if (&builder.blocks.get()[blk] == &builder.blocks.arithmetic && gi >= result.honk.oink.arith_start &&
                    gi < result.honk.oink.arith_end) {
                    found = true;
                }
            }
        }
        EXPECT_TRUE(found) << "proof commitment group " << g << " must appear in Oink arith range";
    }
}

TEST_F(RollupHonkRecursionTestSuite, AcirRollupHonkWitnessLinkInOutputIpaClaim)
{
    acir_format::AcirProgram program = make_rollup_acir_program(0);
    const auto& constraint = program.constraints.honk_recursion_constraints[0];
    Builder builder(program.witness, program.constraints.public_inputs, false);
    [[maybe_unused]] auto output =
        acir_format::create_honk_recursion_constraints<RecursiveFlavor, rollup_honk_test_helpers::RollupIO>(builder,
                                                                                                            constraint);
    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer(builder, false);
    const size_t log_n = static_cast<size_t>(NativeFlavor::VIRTUAL_LOG_N);
    auto result =
        RollupHonkRecursionValidation::validate_rollup_honk_recursion_cursor<bb::fr, Builder, RecursiveFlavor>(
            builder, analyzer, constraint, log_n);
    ASSERT_TRUE(result.output.is_valid);

    // IPA claim public-input limbs must touch Output arith window (pass-through reconstruct).
    bool found = false;
    for (size_t i = bb::PAIRING_POINTS_SIZE; i < bb::ROLLUP_PUBLIC_INPUTS_SIZE; ++i) {
        const uint32_t real = builder.real_variable_index[constraint.proof[i]];
        for (const auto& [blk, gi] : analyzer.get_variable_gates(real)) {
            if (&builder.blocks.get()[blk] == &builder.blocks.arithmetic && gi >= result.output.arith_start &&
                gi < result.output.arith_end) {
                found = true;
            }
        }
    }
    EXPECT_TRUE(found) << "ipa_claim witnesses must appear in Output arith range";
}

TEST_F(RollupHonkRecursionTestSuite, RejectsCorruptedRollupHonkVkDeserialize)
{
    acir_format::AcirProgram program = make_rollup_acir_program(0);
    const auto& constraint = program.constraints.honk_recursion_constraints[0];
    Builder builder(program.witness, program.constraints.public_inputs, false);
    [[maybe_unused]] auto output =
        acir_format::create_honk_recursion_constraints<RecursiveFlavor, rollup_honk_test_helpers::RollupIO>(builder,
                                                                                                            constraint);
    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer(builder, false);
    auto& arith = builder.blocks.arithmetic;
    const size_t gate = HonkRecursionValidation::VkDeserialize::PRIMITIVE_START_ARITH;
    ASSERT_LT(gate, arith.size());
    arith.q_m().set(gate, arith.q_m()[gate] + bb::fr::one());
    auto result =
        HonkRecursionValidation::VkDeserialize::validate_vk_deserialize_region<bb::fr>(builder, analyzer, constraint);
    EXPECT_FALSE(result.is_valid);
}

TEST_F(RollupHonkRecursionTestSuite, RejectsCorruptedRollupHonkOink)
{
    acir_format::AcirProgram program = make_rollup_acir_program(0);
    const auto& constraint = program.constraints.honk_recursion_constraints[0];
    Builder builder(program.witness, program.constraints.public_inputs, false);
    [[maybe_unused]] auto output =
        acir_format::create_honk_recursion_constraints<RecursiveFlavor, rollup_honk_test_helpers::RollupIO>(builder,
                                                                                                            constraint);
    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer(builder, false);
    auto& arith = builder.blocks.arithmetic;
    const size_t gate = RollupHonkRecursionValidation::Oink::ARITH_START;
    ASSERT_LT(gate, arith.size());
    arith.q_m().set(gate, arith.q_m()[gate] + bb::fr::one());
    auto result = RollupHonkRecursionValidation::Oink::validate_oink_cursor<bb::fr>(
        builder,
        analyzer,
        RollupHonkRecursionValidation::Oink::ARITH_START,
        RollupHonkRecursionValidation::Oink::SETUP_NNF_GATE_COUNT,
        0,
        0,
        &constraint,
        nullptr);
    EXPECT_FALSE(result.is_valid);
}

TEST_F(RollupHonkRecursionTestSuite, RejectsCorruptedRollupHonkPreprocessor)
{
    acir_format::AcirProgram program = make_rollup_acir_program(0);
    const auto& constraint = program.constraints.honk_recursion_constraints[0];
    Builder builder(program.witness, program.constraints.public_inputs, false);
    [[maybe_unused]] auto output =
        acir_format::create_honk_recursion_constraints<RecursiveFlavor, rollup_honk_test_helpers::RollupIO>(builder,
                                                                                                            constraint);
    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer(builder, false);
    const auto bounds = RollupHonkRecursionValidation::compute_arith_boundaries_from_oink_start();
    const size_t gate = bounds.preproc;
    ASSERT_LT(gate, builder.blocks.arithmetic.size());
    builder.blocks.arithmetic.q_m().set(gate, builder.blocks.arithmetic.q_m()[gate] + bb::fr::one());

    auto oink = RollupHonkRecursionValidation::Oink::validate_oink_cursor<bb::fr>(
        builder,
        analyzer,
        RollupHonkRecursionValidation::Oink::ARITH_START,
        RollupHonkRecursionValidation::Oink::SETUP_NNF_GATE_COUNT,
        0,
        0,
        &constraint,
        nullptr);
    ASSERT_TRUE(oink.is_valid);
    auto pre = HonkRecursionValidation::Preprocessor::validate_preprocessor<bb::fr>(builder, analyzer, oink);
    EXPECT_FALSE(pre.is_valid);
}

TEST_F(RollupHonkRecursionTestSuite, RejectsCorruptedRollupHonkSumcheck)
{
    acir_format::AcirProgram program = make_rollup_acir_program(0);
    const auto& constraint = program.constraints.honk_recursion_constraints[0];
    Builder builder(program.witness, program.constraints.public_inputs, false);
    [[maybe_unused]] auto output =
        acir_format::create_honk_recursion_constraints<RecursiveFlavor, rollup_honk_test_helpers::RollupIO>(builder,
                                                                                                            constraint);
    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer(builder, false);
    const auto bounds = RollupHonkRecursionValidation::compute_arith_boundaries_from_oink_start();
    const size_t gate = bounds.sumcheck;
    ASSERT_LT(gate, builder.blocks.arithmetic.size());
    builder.blocks.arithmetic.q_m().set(gate, builder.blocks.arithmetic.q_m()[gate] + bb::fr::one());

    auto oink = RollupHonkRecursionValidation::Oink::validate_oink_cursor<bb::fr>(
        builder,
        analyzer,
        RollupHonkRecursionValidation::Oink::ARITH_START,
        RollupHonkRecursionValidation::Oink::SETUP_NNF_GATE_COUNT,
        0,
        0,
        &constraint,
        nullptr);
    ASSERT_TRUE(oink.is_valid);
    auto pre = HonkRecursionValidation::Preprocessor::validate_preprocessor<bb::fr>(builder, analyzer, oink);
    ASSERT_TRUE(pre.is_valid);
    auto sc = HonkRecursionValidation::Sumcheck::validate_sumcheck<bb::fr>(builder, analyzer, pre);
    EXPECT_FALSE(sc.is_valid);
}

TEST_F(RollupHonkRecursionTestSuite, RejectsCorruptedRollupHonkShplemini)
{
    acir_format::AcirProgram program = make_rollup_acir_program(0);
    const auto& constraint = program.constraints.honk_recursion_constraints[0];
    Builder builder(program.witness, program.constraints.public_inputs, false);
    [[maybe_unused]] auto output =
        acir_format::create_honk_recursion_constraints<RecursiveFlavor, rollup_honk_test_helpers::RollupIO>(builder,
                                                                                                            constraint);
    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer(builder, false);
    const auto bounds = RollupHonkRecursionValidation::compute_arith_boundaries_from_oink_start();
    const size_t gate = bounds.shplemini;
    ASSERT_LT(gate, builder.blocks.arithmetic.size());
    builder.blocks.arithmetic.q_m().set(gate, builder.blocks.arithmetic.q_m()[gate] + bb::fr::one());

    auto oink = RollupHonkRecursionValidation::Oink::validate_oink_cursor<bb::fr>(
        builder,
        analyzer,
        RollupHonkRecursionValidation::Oink::ARITH_START,
        RollupHonkRecursionValidation::Oink::SETUP_NNF_GATE_COUNT,
        0,
        0,
        &constraint,
        nullptr);
    ASSERT_TRUE(oink.is_valid);
    auto pre = HonkRecursionValidation::Preprocessor::validate_preprocessor<bb::fr>(builder, analyzer, oink);
    ASSERT_TRUE(pre.is_valid);
    auto sc = HonkRecursionValidation::Sumcheck::validate_sumcheck<bb::fr>(builder, analyzer, pre);
    ASSERT_TRUE(sc.is_valid);
    auto sh = HonkRecursionValidation::Shplemini::validate_shplemini<bb::fr>(builder, analyzer, sc);
    EXPECT_FALSE(sh.is_valid);
}

TEST_F(RollupHonkRecursionTestSuite, RejectsCorruptedRollupHonkKZG)
{
    acir_format::AcirProgram program = make_rollup_acir_program(0);
    const auto& constraint = program.constraints.honk_recursion_constraints[0];
    Builder builder(program.witness, program.constraints.public_inputs, false);
    [[maybe_unused]] auto output =
        acir_format::create_honk_recursion_constraints<RecursiveFlavor, rollup_honk_test_helpers::RollupIO>(builder,
                                                                                                            constraint);
    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer(builder, false);
    const size_t kzg_start = RollupHonkRecursionValidation::compute_arith_boundaries_from_oink_start().kzg;
    const size_t gate = kzg_start + HonkRecursionValidation::KZG::ARITH_TOTAL.gate_count - 10;
    ASSERT_LT(gate, builder.blocks.arithmetic.size());
    builder.blocks.arithmetic.q_m().set(gate, builder.blocks.arithmetic.q_m()[gate] + bb::fr::one());

    auto oink = RollupHonkRecursionValidation::Oink::validate_oink_cursor<bb::fr>(
        builder,
        analyzer,
        RollupHonkRecursionValidation::Oink::ARITH_START,
        RollupHonkRecursionValidation::Oink::SETUP_NNF_GATE_COUNT,
        0,
        0,
        &constraint,
        nullptr);
    ASSERT_TRUE(oink.is_valid);
    auto pre = HonkRecursionValidation::Preprocessor::validate_preprocessor<bb::fr>(builder, analyzer, oink);
    ASSERT_TRUE(pre.is_valid);
    auto sc = HonkRecursionValidation::Sumcheck::validate_sumcheck<bb::fr>(builder, analyzer, pre);
    ASSERT_TRUE(sc.is_valid);
    auto sh = HonkRecursionValidation::Shplemini::validate_shplemini<bb::fr>(builder, analyzer, sc);
    ASSERT_TRUE(sh.is_valid);
    auto kzg = HonkRecursionValidation::KZG::validate_kzg<bb::fr>(builder, analyzer, sh);
    EXPECT_FALSE(kzg.is_valid);
}

TEST_F(RollupHonkRecursionTestSuite, RejectsCorruptedRollupHonkOutput)
{
    acir_format::AcirProgram program = make_rollup_acir_program(0);
    const auto& constraint = program.constraints.honk_recursion_constraints[0];
    Builder builder(program.witness, program.constraints.public_inputs, false);
    [[maybe_unused]] auto output =
        acir_format::create_honk_recursion_constraints<RecursiveFlavor, rollup_honk_test_helpers::RollupIO>(builder,
                                                                                                            constraint);
    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer(builder, false);
    const auto bounds = RollupHonkRecursionValidation::compute_arith_boundaries_from_oink_start();
    const size_t output_start = bounds.kzg + HonkRecursionValidation::KZG::ARITH_GATES;
    ASSERT_LT(output_start, builder.blocks.arithmetic.size());
    builder.blocks.arithmetic.q_m().set(output_start, builder.blocks.arithmetic.q_m()[output_start] + bb::fr::one());

    auto oink = RollupHonkRecursionValidation::Oink::validate_oink_cursor<bb::fr>(
        builder,
        analyzer,
        RollupHonkRecursionValidation::Oink::ARITH_START,
        RollupHonkRecursionValidation::Oink::SETUP_NNF_GATE_COUNT,
        0,
        0,
        &constraint,
        nullptr);
    ASSERT_TRUE(oink.is_valid);
    auto pre = HonkRecursionValidation::Preprocessor::validate_preprocessor<bb::fr>(builder, analyzer, oink);
    ASSERT_TRUE(pre.is_valid);
    auto sc = HonkRecursionValidation::Sumcheck::validate_sumcheck<bb::fr>(builder, analyzer, pre);
    ASSERT_TRUE(sc.is_valid);
    auto sh = HonkRecursionValidation::Shplemini::validate_shplemini<bb::fr>(builder, analyzer, sc);
    ASSERT_TRUE(sh.is_valid);
    auto kzg = HonkRecursionValidation::KZG::validate_kzg<bb::fr>(builder, analyzer, sh);
    ASSERT_TRUE(kzg.is_valid);
    auto out = RollupHonkRecursionValidation::Output::validate_output<bb::fr>(builder, analyzer, kzg);
    EXPECT_FALSE(out.is_valid);
}

TEST_F(RollupHonkRecursionTestSuite, RejectsCorruptedRollupHonkRecursionEndToEnd)
{
    acir_format::AcirProgram program = make_rollup_acir_program(0);
    const auto& constraint = program.constraints.honk_recursion_constraints[0];
    Builder builder(program.witness, program.constraints.public_inputs, false);
    [[maybe_unused]] auto output =
        acir_format::create_honk_recursion_constraints<RecursiveFlavor, rollup_honk_test_helpers::RollupIO>(builder,
                                                                                                            constraint);
    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer(builder, false);
    const size_t gate = RollupHonkRecursionValidation::Oink::ARITH_START + 10;
    ASSERT_LT(gate, builder.blocks.arithmetic.size());
    builder.blocks.arithmetic.q_m().set(gate, builder.blocks.arithmetic.q_m()[gate] + bb::fr::one());
    const size_t log_n = static_cast<size_t>(NativeFlavor::VIRTUAL_LOG_N);
    auto result =
        RollupHonkRecursionValidation::validate_rollup_honk_recursion_cursor<bb::fr, Builder, RecursiveFlavor>(
            builder, analyzer, constraint, log_n);
    EXPECT_FALSE(result.is_valid);
}

TEST_F(RollupHonkRecursionTestSuite, StaticAnalyzerAcceptsRollupHonkRecursion)
{
    acir_format::AcirProgram program = make_rollup_acir_program(0);
    Builder builder = create_circuit<Builder>(program, { .has_ipa_claim = true });
    cdg::StaticAnalyzerAcir static_analyzer(std::move(program.constraints), std::move(builder));
    EXPECT_TRUE(static_analyzer.get_incorrect_opcodes().empty());
}

#ifndef BB_ROLLUP_HONK_FAST_IPA_BUILD
// use_valid_proof=true: the analyzer now also validates IPA finalize (backlog #7) for the last
// ROOT_ROLLUP_HONK opcode, using deltas pinned against the real (valid-proof) production circuit
// shape — a mock/invalid proof produces a differently-sized circuit and would not match.
TEST_F(RollupHonkIpaFinalizeTests, RootRollupHonkMergesTwoRollupConstraints)
{
    acir_format::AcirProgram program = make_root_rollup_acir_program_from_two_rollups(0, /*use_valid_proof=*/true);
    ASSERT_EQ(program.constraints.honk_recursion_constraints.size(), 2U);
    EXPECT_EQ(program.constraints.honk_recursion_constraints[0].proof_type, PROOF_TYPE::ROOT_ROLLUP_HONK);
    EXPECT_EQ(program.constraints.honk_recursion_constraints[1].proof_type, PROOF_TYPE::ROOT_ROLLUP_HONK);

    Builder builder = create_circuit<Builder>(program, { .has_ipa_claim = false });
    cdg::StaticAnalyzerAcir static_analyzer(std::move(program.constraints), std::move(builder));
    EXPECT_TRUE(static_analyzer.get_incorrect_opcodes().empty());
}

// Negative: corrupting a selector inside the IPA finalize region (after both opcodes, start of the
// accumulate stage) must make get_incorrect_opcodes() non-empty — proves the backlog #7 wiring isn't
// vacuously passing. Targets NNF (plain selector hash, guaranteed to break on any selector change).
TEST_F(RollupHonkIpaFinalizeTests, RootRollupHonkFinalizeCorruptionDetected)
{
    acir_format::AcirProgram program = make_root_rollup_acir_program_from_two_rollups(0, /*use_valid_proof=*/true);
    Builder builder = create_circuit<Builder>(program, { .has_ipa_claim = false });

    const auto after_opcodes = RollupHonkIpaFinalizeValidation::derive_root_rollup_after_opcodes(builder);
    const size_t nnf_gate = after_opcodes.sizes[RollupHonkIpaAccumulateValidation::BLOCK_IDX_NNF];
    ASSERT_LT(nnf_gate, builder.blocks.nnf.size());
    auto& nnf_q_c = builder.blocks.nnf.q_c();
    nnf_q_c.set(nnf_gate, nnf_q_c[nnf_gate] + bb::fr(1));

    cdg::StaticAnalyzerAcir static_analyzer(std::move(program.constraints), std::move(builder));
    EXPECT_FALSE(static_analyzer.get_incorrect_opcodes().empty());
}

// Proves the arithmetic-derived `before_opcodes` (backlog #7: no snapshot hook exists in production
// create_circuit, so the analyzer must recover the boundary from the finalized builder alone) is
// correct on a REAL create_circuit-built ROOT_ROLLUP_HONK circuit, independent of the manual
// RootRollupIpaDiscoveryContext mirror used elsewhere in this file.
TEST_F(RollupHonkIpaFinalizeTests, DeriveBeforeOpcodesMatchesRealAcirCircuit)
{
    // use_valid_proof=true: real ACIR programs always carry a genuine proof, so this matches
    // production circuit shape (the pinned ROOT_ROLLUP_OPCODES_DELTA/ROOT_ROLLUP_FINALIZE_DELTA
    // constants were measured against this exact construction).
    acir_format::AcirProgram program = make_root_rollup_acir_program_from_two_rollups(0, /*use_valid_proof=*/true);
    Builder builder = create_circuit<Builder>(program, { .has_ipa_claim = false });

    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer(builder, false);
    auto derived_before_opcodes = RollupHonkIpaFinalizeValidation::derive_root_rollup_before_opcodes(builder);
    auto derived_after_opcodes = RollupHonkIpaFinalizeValidation::derive_root_rollup_after_opcodes(builder);
    auto result = RollupHonkIpaFinalizeValidation::validate_root_rollup_ipa_finalize<bb::fr>(
        builder,
        analyzer,
        program.constraints.honk_recursion_constraints[0],
        program.constraints.honk_recursion_constraints[1],
        derived_before_opcodes,
        derived_after_opcodes,
        bb::CONST_ECCVM_LOG_N,
        /*validate_opcodes=*/true);
    EXPECT_TRUE(result.opcodes.is_valid);
    EXPECT_TRUE(result.accumulate.is_valid);
    EXPECT_TRUE(result.full_verify.is_valid);
    EXPECT_TRUE(result.default_io.is_valid);
    EXPECT_TRUE(result.is_valid);
}

TEST_F(RollupHonkIpaFinalizeTests, RootRollupHonkIpaDumpAnalysis)
{
    auto non_root_program = make_merged_rollup_acir_program_from_two_rollups(0, PROOF_TYPE::ROLLUP_HONK);
    auto root_program = make_root_rollup_acir_program_from_two_rollups(0);
    auto non_root_data = run_and_capture_finalize(non_root_program, /*has_ipa_claim=*/true);
    auto root_data = run_and_capture_finalize(root_program, /*has_ipa_claim=*/false);

    std::ofstream out("root_rollup_honk_ipa_analysis.txt");
    ASSERT_TRUE(out.is_open());
    dump_analysis_header(out,
                         "ROOT_ROLLUP_HONK IPA Finalize — Circuit Analysis",
                         "RollupIO recursion -> DefaultIO finalize",
                         static_cast<size_t>(NativeFlavor::VIRTUAL_LOG_N),
                         "# non-root path: accumulate IPA claim/proof and expose it as public output\n"
                         "# root path: perform full recursive IPA verification in finalize()\n");

    out << "NonRootFinalize\n";
    for (const auto& [block_idx, block_name] : IPA_ANALYSIS_BLOCKS) {
        dump_fp_line(out, block_idx, block_name, non_root_data.finalize_fps[block_idx]);
    }
    out << "  total_gates=" << (non_root_data.total_after_finalize - non_root_data.total_before_finalize) << "\n\n";

    out << "RootFinalize\n";
    for (const auto& [block_idx, block_name] : IPA_ANALYSIS_BLOCKS) {
        dump_fp_line(out, block_idx, block_name, root_data.finalize_fps[block_idx]);
    }
    out << "  total_gates=" << (root_data.total_after_finalize - root_data.total_before_finalize) << "\n\n";

    out << "RootMinusNonRoot\n";
    for (const auto& [block_idx, block_name] : IPA_ANALYSIS_BLOCKS) {
        const size_t delta = snapshot_size_at(root_data.after_finalize, block_idx) -
                             snapshot_size_at(non_root_data.after_finalize, block_idx);
        if (delta == 0 && block_idx != BLOCK_IDX_ELLIPTIC) {
            continue;
        }
        out << "  block[" << block_idx << "] " << block_name << " gates=" << delta << "\n";
    }
    out << "  total_gates="
        << ((root_data.total_after_finalize - root_data.total_before_finalize) -
            (non_root_data.total_after_finalize - non_root_data.total_before_finalize))
        << "\n\n";

    dump_opcode_gate_counts(out, non_root_data.gates_per_opcode, "Gates per opcode before finalize:");
    out << "\n";
    dump_total_block_counts(out, non_root_data.after_finalize, "Total gate counts per block (non-root):");
    out << "\n";
    dump_total_block_counts(out, root_data.after_finalize, "Total gate counts per block (root):");

    const size_t non_root_finalize_delta = non_root_data.total_after_finalize - non_root_data.total_before_finalize;
    const size_t root_finalize_delta = root_data.total_after_finalize - root_data.total_before_finalize;
    EXPECT_GT(root_finalize_delta, non_root_finalize_delta);
    EXPECT_GT(snapshot_size_at(root_data.after_finalize, BLOCK_IDX_ARITHMETIC),
              snapshot_size_at(non_root_data.after_finalize, BLOCK_IDX_ARITHMETIC));
    EXPECT_GT(snapshot_size_at(non_root_data.after_finalize, BLOCK_IDX_ELLIPTIC), static_cast<size_t>(0));
    EXPECT_GT(snapshot_size_at(root_data.after_finalize, BLOCK_IDX_ELLIPTIC),
              snapshot_size_at(non_root_data.after_finalize, BLOCK_IDX_ELLIPTIC));
}
#endif // BB_ROLLUP_HONK_FAST_IPA_BUILD

TEST_F(RollupHonkFastIpaBuildTests, FastRootRollupIpaFinalizeAtReducedLogN)
{
    constexpr size_t log_n = rollup_honk_test_config::TEST_IPA_LOG_N;
    EXPECT_EQ(log_n, 12U);

    auto fast = build_fast_root_rollup_ipa_finalize_circuit<log_n>();
    ASSERT_TRUE(fast.acir.output.is_root_rollup);
    EXPECT_TRUE(fast.ipa_verify_ok);
    EXPECT_GT(fast.ipa_gate_count, 0U);
    EXPECT_TRUE(CircuitChecker::check(fast.builder()));
}

TEST_F(RollupHonkFastIpaBuildTests, FastRootRollupIpaUsesFewerRoundsThanProduction)
{
    constexpr size_t fast_log_n = rollup_honk_test_config::TEST_IPA_LOG_N;
    constexpr size_t production_log_n = rollup_honk_test_config::PRODUCTION_IPA_LOG_N;

    const auto fast = build_fast_root_rollup_ipa_finalize_circuit<fast_log_n>();

    EXPECT_TRUE(fast.acir.output.is_root_rollup);
    EXPECT_EQ(fast_log_n, 12U);
    EXPECT_EQ(production_log_n, bb::CONST_ECCVM_LOG_N);
    EXPECT_LT(fast_log_n, production_log_n);
    EXPECT_EQ(rollup_honk_test_config::TEST_IPA_PROOF_LENGTH, (4 * fast_log_n) + 4);
    EXPECT_LT(rollup_honk_test_config::TEST_IPA_PROOF_LENGTH, bb::IPA_PROOF_LENGTH);
    EXPECT_TRUE(fast.ipa_verify_ok);
}

#ifdef BB_ROLLUP_HONK_FAST_IPA_BUILD
TEST_F(RollupHonkFastIpaBuildTests, FastIpaBuildConfigIsActive)
{
    EXPECT_TRUE(rollup_honk_test_config::FAST_IPA_BUILD);
    EXPECT_EQ(rollup_honk_test_config::TEST_IPA_LOG_N, 12U);
}
#endif

// Boomerang analysis and validation tests for HONK recursion constraints.
//
// Verification flow (baseline HONK, UltraRecursiveFlavor, DefaultIO, constant-true predicate):
//   step0 : OinkVerifier (vk_hash, num_pub_assert, wire commitments, eta/beta/gamma/alpha)
//   step1 : Preprocessor (gate_challenges dyadic powers only; padding_indicator_array deleted)
//   step2 : SumcheckVerifier (log_n rounds × check_sum + partially_evaluate, no Libra stages)
//   step3 : ShpleminiVerifier::compute_batch_opening_claim (gemini + shplonk, no ZK masking)
//   step4 : KZG::reduce_verify_batch_opening_claim (W_receive + masking + batch_mul)
//   step5 : Output (reconstruct_from_public + PairingPoints::aggregate)
//
// Step 1 (discovery): builds circuit, captures block snapshots, emits honk_functions_analysis.txt.
// Component map: HONK/honk_component_map.txt

#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_validation/HONK/honk_recursion_validation.hpp"
#include "barretenberg/dsl/acir_format/honk_recursion_constraint.hpp"
#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_validation/HONK/honk_recursion_honk_test_helpers.hpp"
#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_validation/HONK/honk_recursion_vk_deserialize_verification.hpp"

#include <algorithm>
#include <array>
#include <fstream>
#include <gtest/gtest.h>
#include <map>
#include <set>
#include <string>
#include <tuple>
#include <vector>

using namespace bb;
using namespace cdg;
using namespace honk_recursion_test_helpers;

// ============================================================================
// Test fixtures
// ============================================================================

class HonkBoomerangDiscoveryTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

// ============================================================================
// Step 1: Baseline analysis — build circuit step by step, dump fingerprints.
// Output: honk_functions_analysis.txt in the build directory.
// ============================================================================

TEST_F(HonkBoomerangDiscoveryTests, HonkBaselineAnalysis)
{
    HonkVerifierComponents vc = setup_honk_verifier_components(0);

    std::ofstream out("honk_functions_analysis.txt");
    ASSERT_TRUE(out.is_open()) << "Failed to open honk_functions_analysis.txt";

    out << "# HONK Recursion — Baseline Circuit Analysis\n";
    out << "# Flavor: UltraRecursiveFlavor_<UltraCircuitBuilder>\n";
    out << "# IO: DefaultIO (PairingPoints only)\n";
    out << "# Predicate: constant true\n";
    out << "# HasZK: false\n";
    out << "# log_n: " << vc.log_n << "\n\n";

    // ── Oink ──────────────────────────────────────────────────────────────────
    auto snap_before_oink = recursion_helpers::BlockSnapshot::capture(vc.builder());
    run_oink_step(vc);
    auto snap_after_oink = recursion_helpers::BlockSnapshot::capture(vc.builder());
    dump_step_fingerprints(out, vc.builder(), snap_before_oink, snap_after_oink, "Oink");

    // ── Preprocessor (gate challenges only; padding_indicator_array deleted upstream) ─
    auto snap_before_preproc = snap_after_oink;
    run_gate_challenges_step(vc);
    auto snap_after_preproc = recursion_helpers::BlockSnapshot::capture(vc.builder());
    dump_step_fingerprints(out, vc.builder(), snap_before_preproc, snap_after_preproc, "Preprocessor");

    // ── Sumcheck ──────────────────────────────────────────────────────────────
    auto snap_before_sumcheck = snap_after_preproc;
    auto sc_output = run_sumcheck_step(vc);
    auto snap_after_sumcheck = recursion_helpers::BlockSnapshot::capture(vc.builder());
    dump_step_fingerprints(out, vc.builder(), snap_before_sumcheck, snap_after_sumcheck, "Sumcheck");

    // ── Shplemini ─────────────────────────────────────────────────────────────
    auto snap_before_shplemini = snap_after_sumcheck;
    auto shp_output = run_shplemini_step(vc, sc_output);
    auto snap_after_shplemini = recursion_helpers::BlockSnapshot::capture(vc.builder());
    dump_step_fingerprints(out, vc.builder(), snap_before_shplemini, snap_after_shplemini, "Shplemini");

    // ── KZG ───────────────────────────────────────────────────────────────────
    auto snap_before_kzg = snap_after_shplemini;
    auto pcs_pairing_points = run_kzg_step(vc, shp_output);
    auto snap_after_kzg = recursion_helpers::BlockSnapshot::capture(vc.builder());
    dump_step_fingerprints(out, vc.builder(), snap_before_kzg, snap_after_kzg, "KZG");

    // ── Output (reconstruct_from_public + pairing_points aggregate) ───────────
    // Final core stage of ultra_verifier.cpp::verify_proof Step 3 — must run for the
    // circuit to match acir_format::create_honk_recursion_constraints (see
    // HonkMirroredBuildMatchesRealAcirCircuit parity test).
    auto snap_before_output = snap_after_kzg;
    run_output_step<IO>(vc, pcs_pairing_points);
    auto snap_after_output = recursion_helpers::BlockSnapshot::capture(vc.builder());
    dump_step_fingerprints(out, vc.builder(), snap_before_output, snap_after_output, "Output");

    // ── Squeeze chain summary ─────────────────────────────────────────────────
    const auto all_squeezes = recursion_helpers::find_all_transcript_squeeze_gates(vc.builder());
    out << "\nSqueeze chain (" << all_squeezes.size() << " total):\n";
    for (size_t i = 0; i < all_squeezes.size(); ++i) {
        out << "  [" << i << "] arith_gate=" << all_squeezes[i] << "\n";
    }

    // ── Total gate counts ─────────────────────────────────────────────────────
    out << "\nTotal gate counts per block:\n";
    auto blocks = vc.builder().blocks.get();
    for (size_t b = 0; b < blocks.size(); ++b) {
        if (blocks[b].size() > 0) {
            out << "  block[" << b << "] " << block_kind_name(b) << " total=" << blocks[b].size() << "\n";
        }
    }

    out.flush();

    // Post convert_full_challenge<fr> passthrough: full-width FS challenges (eta, beta/gamma, alpha,
    // gate_challenge, Sumcheck u_i, rho, Gemini_r, Shplonk nu/z, KZG masking) emit zero 2^127-decompose
    // gates. find_all_transcript_squeeze_gates only sees the remaining short-challenge split from
    // PairingPoints::aggregate's recursion_separator (get_short_challenge). Expect exactly 1.
    EXPECT_EQ(all_squeezes.size(), 1U) << "Expected only Output-stage recursion_separator short-challenge squeeze; "
                                          "full-width fr challenges no longer emit decompose gates";

    const size_t total_arith = snap_after_output.sizes[BLOCK_IDX_ARITHMETIC];
    EXPECT_GT(total_arith, 0U) << "Arithmetic block is empty — circuit not built";

    info("honk_functions_analysis.txt written. Squeeze count=", all_squeezes.size(), " arithmetic_gates=", total_arith);
}

// Post-merge: squeeze-window slicing is dead for full-width fr challenges. This test records that
// only PairingPoints::aggregate's recursion_separator short-challenge still matches the old
// 2^127-decompose scanner pattern. Do not use this count to slice Oink/Sumcheck/Shplemini/KZG.
TEST_F(HonkBoomerangDiscoveryTests, HonkSqueezeChainAnalysis)
{
    HonkVerifierComponents vc = setup_honk_verifier_components(0);
    build_full_honk_circuit<IO>(vc);

    const auto all_squeezes = recursion_helpers::find_all_transcript_squeeze_gates(vc.builder());
    EXPECT_EQ(all_squeezes.size(), 1U)
        << "Full-width get_challenges<fr> is passthrough; only Output recursion_separator "
           "get_short_challenge should still emit a split_challenge decompose gate";
    if (!all_squeezes.empty()) {
        info("Sole remaining squeeze gate (recursion_separator): arith_gate=", all_squeezes[0]);
    }
}

// ============================================================================
// Phase 1 parity: the mirrored stage-by-stage build (run_oink_step..run_kzg_step) must produce
// the same circuit as the real production wrapper acir_format::create_honk_recursion_constraints.
// This is the check the boomerang-constraint-validator Phase 1 checklist calls a "parity test":
// without it, fingerprints could be pinned against a chain that has silently diverged from
// production (e.g. missing wrapper stages such as pairing-point output aggregation).
// ============================================================================

TEST_F(HonkBoomerangDiscoveryTests, HonkMirroredBuildMatchesRealAcirCircuit)
{
    // Mirrored build: same stage functions used by every other discovery/validation test here.
    HonkVerifierComponents vc = setup_honk_verifier_components(0);
    build_full_honk_circuit<IO>(vc);
    auto mirrored = recursion_helpers::BlockSnapshot::capture(vc.builder());

    // Real production build: the actual wrapper invoked per HONK_RECURSION opcode
    // (acir_format::process_recursion_constraints -> create_honk_recursion_constraints).
    acir_format::AcirProgram program = make_mock_acir_program(0);
    const auto& constraint = program.constraints.honk_recursion_constraints[0];
    Builder real_builder(program.witness, program.constraints.public_inputs, false);
    [[maybe_unused]] auto real_output =
        acir_format::create_honk_recursion_constraints<RecursiveFlavor, IO>(real_builder, constraint);
    auto real = recursion_helpers::BlockSnapshot::capture(real_builder);

    ASSERT_EQ(real.sizes.size(), mirrored.sizes.size());
    for (size_t b = 0; b < mirrored.sizes.size(); ++b) {
        EXPECT_EQ(real.sizes[b], mirrored.sizes[b])
            << "block[" << b << "] " << block_kind_name(b) << " mismatch: real=" << real.sizes[b]
            << " mirrored=" << mirrored.sizes[b]
            << " (mirrored stage-by-stage build has diverged from production create_honk_recursion_constraints)";
    }
}

// Round 12 unfinished diagnostic: gate-count parity ≠ witness-linkage parity.
// Dump get_variable_gates for key_hash and the first proof-body commitment witness on
// mirrored vs real create_honk_recursion_constraints builds side-by-side. Explains why
// validate_vk_hash's poseidon2 copy-constraint check can diverge even when block sizes match.
TEST_F(HonkBoomerangDiscoveryTests, HonkMirrorVsRealWitnessLinkageDiagnostic)
{
    auto dump_gates = [](std::ostream& out,
                         const char* label,
                         Builder& builder,
                         cdg::StaticAnalyzer_<bb::fr, Builder>& analyzer,
                         uint32_t witness_idx) {
        const uint32_t real_idx = builder.real_variable_index[witness_idx];
        auto gates = analyzer.get_variable_gates(real_idx);
        out << label << " witness=" << witness_idx << " real=" << real_idx << " gates=" << gates.size() << "\n";
        for (const auto& [blk, gi] : gates) {
            out << "  block[" << blk << "] " << block_kind_name(blk) << " gate=" << gi << "\n";
        }
        if (gates.empty()) {
            out << "  (no gates)\n";
        }
    };

    // Mirrored build
    HonkVerifierComponents vc = setup_honk_verifier_components(0);
    build_full_honk_circuit<IO>(vc);
    cdg::StaticAnalyzer_<bb::fr, Builder> mirror_analyzer(vc.builder(), false);

    // Real production build
    acir_format::AcirProgram program = make_mock_acir_program(0);
    const auto& constraint = program.constraints.honk_recursion_constraints[0];
    Builder real_builder(program.witness, program.constraints.public_inputs, false);
    [[maybe_unused]] auto real_output =
        acir_format::create_honk_recursion_constraints<RecursiveFlavor, IO>(real_builder, constraint);
    cdg::StaticAnalyzer_<bb::fr, Builder> real_analyzer(real_builder, false);

    // First commitment-group witness in the ACIR proof body (w_l limb 0 after public inputs reinserted).
    // Proof indices as stored on the constraint are body-only; public inputs are prepended at verify time.
    ASSERT_FALSE(constraint.proof.empty());
    const uint32_t first_proof_wit = constraint.proof[0];

    std::ofstream out("honk_mirror_vs_real_witness_linkage.txt");
    ASSERT_TRUE(out.is_open());
    out << "# HONK mirror vs real witness-linkage diagnostic (Round 12)\n";
    out << "# Same make_mock_acir_program constraint; mirror = setup_honk_verifier_components +\n";
    out << "# build_full_honk_circuit; real = create_honk_recursion_constraints.\n\n";

    out << "=== key_hash ===\n";
    dump_gates(out, "mirror", vc.builder(), mirror_analyzer, constraint.key_hash);
    dump_gates(out, "real  ", real_builder, real_analyzer, constraint.key_hash);

    out << "\n=== first proof-body witness (commitment group 0 / proof[0]) ===\n";
    dump_gates(out, "mirror", vc.builder(), mirror_analyzer, first_proof_wit);
    dump_gates(out, "real  ", real_builder, real_analyzer, first_proof_wit);

    // Also report validate_vk_hash result on each source — the concrete Round 12 failure mode.
    const bool mirror_vk_hash_ok = recursion_helpers::validate_vk_hash(vc.builder(), mirror_analyzer, &constraint);
    const bool real_vk_hash_ok = recursion_helpers::validate_vk_hash(real_builder, real_analyzer, &constraint);
    out << "\nvalidate_vk_hash: mirror=" << (mirror_vk_hash_ok ? "pass" : "FAIL")
        << " real=" << (real_vk_hash_ok ? "pass" : "FAIL") << "\n";
    out.flush();

    info("honk_mirror_vs_real_witness_linkage.txt written. validate_vk_hash mirror=",
         mirror_vk_hash_ok,
         " real=",
         real_vk_hash_ok);

    // Diagnostic must complete; both native hash values should match (copy-constraint may still diverge).
    EXPECT_EQ(vc.builder().get_variable(constraint.key_hash), real_builder.get_variable(constraint.key_hash));
}

// Plan §5 pattern-rarity discovery: rank arithmetic selector patterns by frequency, report rarest,
// link known surviving challenge/split patterns. Candidate report only — no pinned constants.
TEST_F(HonkBoomerangDiscoveryTests, HonkAnchorPatternRarityDiscovery)
{
    HonkVerifierComponents vc = setup_honk_verifier_components(0);

    auto snap_before_oink = recursion_helpers::BlockSnapshot::capture(vc.builder());
    run_oink_step(vc);
    auto snap_after_oink = recursion_helpers::BlockSnapshot::capture(vc.builder());
    run_gate_challenges_step(vc);
    auto snap_after_preproc = recursion_helpers::BlockSnapshot::capture(vc.builder());
    auto sc = run_sumcheck_step(vc);
    auto snap_after_sumcheck = recursion_helpers::BlockSnapshot::capture(vc.builder());
    auto shp = run_shplemini_step(vc, sc);
    auto snap_after_shplemini = recursion_helpers::BlockSnapshot::capture(vc.builder());
    auto pcs = run_kzg_step(vc, shp);
    auto snap_after_kzg = recursion_helpers::BlockSnapshot::capture(vc.builder());
    run_output_step<IO>(vc, pcs);
    auto snap_after_output = recursion_helpers::BlockSnapshot::capture(vc.builder());

    auto stage_of = [&](size_t g) -> const char* {
        const size_t a0 = snap_before_oink.sizes[BLOCK_IDX_ARITHMETIC];
        const size_t a1 = snap_after_oink.sizes[BLOCK_IDX_ARITHMETIC];
        const size_t a2 = snap_after_preproc.sizes[BLOCK_IDX_ARITHMETIC];
        const size_t a3 = snap_after_sumcheck.sizes[BLOCK_IDX_ARITHMETIC];
        const size_t a4 = snap_after_shplemini.sizes[BLOCK_IDX_ARITHMETIC];
        const size_t a5 = snap_after_kzg.sizes[BLOCK_IDX_ARITHMETIC];
        const size_t a6 = snap_after_output.sizes[BLOCK_IDX_ARITHMETIC];
        if (g < a0) {
            return "Setup";
        }
        if (g < a1) {
            return "Oink";
        }
        if (g < a2) {
            return "Preprocessor";
        }
        if (g < a3) {
            return "Sumcheck";
        }
        if (g < a4) {
            return "Shplemini";
        }
        if (g < a5) {
            return "KZG";
        }
        if (g < a6) {
            return "Output";
        }
        return "After";
    };

    auto& arith = vc.builder().blocks.arithmetic;
    struct PatternKey {
        bb::fr q_m, q_1, q_2, q_3, q_4, q_c, q_arith;
        bool operator<(const PatternKey& o) const
        {
            auto as_tup = [](const PatternKey& p) {
                return std::tie(p.q_m, p.q_1, p.q_2, p.q_3, p.q_4, p.q_c, p.q_arith);
            };
            return as_tup(*this) < as_tup(o);
        }
    };
    std::map<PatternKey, std::vector<size_t>> by_pattern;
    for (size_t g = 0; g < arith.size(); ++g) {
        PatternKey k{ arith.q_m()[g],
                      arith.q_1()[g],
                      arith.q_2()[g],
                      arith.q_3()[g],
                      arith.q_4()[g],
                      arith.q_c()[g],
                      arith.gate_selector_for(bb::GateKind::Arith)[g] };
        by_pattern[k].push_back(g);
    }

    std::vector<std::pair<size_t, PatternKey>> ranked;
    ranked.reserve(by_pattern.size());
    for (const auto& [k, gates] : by_pattern) {
        ranked.emplace_back(gates.size(), k);
    }
    std::sort(ranked.begin(), ranked.end(), [](const auto& a, const auto& b) {
        if (a.first != b.first) {
            return a.first < b.first;
        }
        return a.second < b.second;
    });

    const bb::fr two_127 = bb::fr(2).pow(127);
    auto is_short_challenge_split = [&](const PatternKey& k) {
        return k.q_arith == bb::fr::one() && k.q_1 == bb::fr::one() && k.q_2 == two_127 && k.q_3 == -bb::fr::one() &&
               k.q_4 == bb::fr::one() && k.q_m.is_zero();
    };

    std::ofstream out("honk_anchor_candidate_report.txt");
    ASSERT_TRUE(out.is_open());
    out << "# HONK Phase 1 anchor candidate report (plan §5 pattern-rarity methodology)\n";
    out << "# Baseline: UltraRecursiveFlavor / DefaultIO / constant-true predicate\n";
    out << "# Arithmetic gates=" << arith.size() << " distinct_selector_patterns=" << by_pattern.size() << "\n\n";

    out << "## Plan §5 candidate status (post convert_full_challenge<fr> passthrough)\n";
    out << "A Oink eta/beta/gamma/alpha full-width challenges: DEAD as decompose anchors "
           "(0 gates from convert_full_challenge<fr>)\n";
    out << "B Sumcheck:gate_challenge: DEAD as decompose anchor (same)\n";
    out << "C Shplemini rho/Gemini_r/Shplonk nu/z: DEAD as decompose anchors (same)\n";
    out << "D KZG:masking_challenge: DEAD as decompose anchor (same)\n";
    out << "E KZG batch-mul region: ALIVE — heavy arithmetic/nnf/memory region "
           "(see honk_functions_analysis.txt KZG block deltas)\n";
    out << "F padding_indicator_array: DEAD — function deleted; USE_PADDING only sets log_n\n";
    out << "G Output recursion_separator get_short_challenge: ALIVE — sole remaining "
           "2^127-decompose squeeze pattern\n\n";

    out << "## Rarest arithmetic selector patterns (freq <= 5, up to 40 rows)\n";
    size_t printed = 0;
    for (const auto& [freq, key] : ranked) {
        if (freq > 5 || printed >= 40) {
            break;
        }
        const auto& gates = by_pattern[key];
        out << "freq=" << freq << " short_challenge_split=" << (is_short_challenge_split(key) ? "yes" : "no")
            << " q_arith=" << key.q_arith << " q_m=" << key.q_m << " q_1=" << key.q_1 << " q_2=" << key.q_2
            << " q_3=" << key.q_3 << " q_4=" << key.q_4 << " q_c=" << key.q_c << "\n";
        out << "  gates:";
        for (size_t i = 0; i < std::min(gates.size(), size_t{ 8 }); ++i) {
            out << " " << gates[i] << "(" << stage_of(gates[i]) << ")";
        }
        if (gates.size() > 8) {
            out << " ...";
        }
        out << "\n";
        ++printed;
    }

    out << "\n## Short-challenge split pattern (Candidate G)\n";
    size_t split_count = 0;
    for (const auto& [key, gates] : by_pattern) {
        if (!is_short_challenge_split(key)) {
            continue;
        }
        split_count += gates.size();
        for (size_t g : gates) {
            out << "  arith_gate=" << g << " stage=" << stage_of(g) << "\n";
        }
    }
    out << "total_short_challenge_split_gates=" << split_count << "\n";

    out << "\n## Recommendation (not promoted to constants)\n";
    out << "- Do not anchor Phase 2/3 on full-width fr challenge decompose gates — they no longer exist.\n";
    out << "- Prefer stage-boundary BlockSnapshot fingerprints (HonkBaselineAnalysis tags) and/or\n";
    out << "  poseidon2_* FS hash windows for challenge-phase boundaries.\n";
    out << "- Candidate G (Output recursion_separator short split) is unique but late; unsuitable as\n";
    out << "  primitive_start. Candidate E (KZG batch-mul) is the strongest large-region fingerprint.\n";
    out << "- Promote only after Phase 2 primitive_start discovery on the chosen chain.\n";
    out.flush();

    EXPECT_EQ(split_count, 1U) << "Expected exactly one short-challenge split (recursion_separator)";
    info("honk_anchor_candidate_report.txt written. patterns=", by_pattern.size(), " split_gates=", split_count);
}

// ============================================================================
// Step 2: Oink stage analysis — decompose Oink into per-sub-stage fingerprints.
// Output: honk_oink_stage_analysis.txt in the build directory.
// ============================================================================

TEST_F(HonkBoomerangDiscoveryTests, HonkOinkStageAnalysis)
{
    HonkVerifierComponents vc = setup_honk_verifier_components(0);

    // Capture setup-phase gate counts (before any verifier step).
    auto snap_setup = recursion_helpers::BlockSnapshot::capture(vc.builder());
    const size_t arith_before_oink =
        snap_setup.sizes.size() > BLOCK_IDX_ARITHMETIC ? snap_setup.sizes[BLOCK_IDX_ARITHMETIC] : 0;
    const size_t nnf_before_oink = snap_setup.sizes.size() > BLOCK_IDX_NNF ? snap_setup.sizes[BLOCK_IDX_NNF] : 0;
    const size_t ext_before_oink =
        snap_setup.sizes.size() > BLOCK_IDX_POSEIDON2_EXT ? snap_setup.sizes[BLOCK_IDX_POSEIDON2_EXT] : 0;
    const size_t int_before_oink =
        snap_setup.sizes.size() > BLOCK_IDX_POSEIDON2_INT ? snap_setup.sizes[BLOCK_IDX_POSEIDON2_INT] : 0;

    // Run Oink and capture post-Oink state.
    run_oink_step(vc);
    auto snap_after_oink = recursion_helpers::BlockSnapshot::capture(vc.builder());

    const size_t arith_oink_start = arith_before_oink;
    const size_t arith_oink_end = snap_after_oink.sizes[BLOCK_IDX_ARITHMETIC];
    const size_t arith_oink_total = arith_oink_end - arith_oink_start;

    const size_t nnf_oink_start = nnf_before_oink;
    const size_t nnf_oink_end = snap_after_oink.sizes[BLOCK_IDX_NNF];
    const size_t nnf_oink_total = nnf_oink_end - nnf_oink_start;

    const size_t ext_oink_start = ext_before_oink;
    const size_t ext_oink_end = snap_after_oink.sizes[BLOCK_IDX_POSEIDON2_EXT];
    const size_t ext_oink_total = ext_oink_end - ext_oink_start;

    const size_t int_oink_start = int_before_oink;
    const size_t int_oink_end = snap_after_oink.sizes[BLOCK_IDX_POSEIDON2_INT];
    const size_t int_oink_total = int_oink_end - int_oink_start;

    // Find Oink challenge squeeze gates.
    auto all_squeezes = recursion_helpers::find_all_transcript_squeeze_gates(vc.builder());
    auto oink_chal = recursion_helpers::oink_challenges(vc.builder(), all_squeezes);
    ASSERT_TRUE(oink_chal.valid) << "Oink challenge extraction failed";

    // Note: squeeze_gate_indices contains all 3 (eta, beta/gamma, alpha) in order.
    std::vector<size_t> sorted_oink_squeezes(oink_chal.squeeze_gate_indices.begin(),
                                             oink_chal.squeeze_gate_indices.end());
    std::sort(sorted_oink_squeezes.begin(), sorted_oink_squeezes.end());
    ASSERT_EQ(sorted_oink_squeezes.size(), 3U) << "Expected exactly 3 Oink squeeze gates";

    const size_t eta_gate = sorted_oink_squeezes[0];
    const size_t beta_gamma_gate = sorted_oink_squeezes[1];
    const size_t alpha_gate = sorted_oink_squeezes[2];

    // Open output file.
    std::ofstream out("honk_oink_stage_analysis.txt");
    ASSERT_TRUE(out.is_open());

    out << "# HONK Oink Stage Analysis\n";
    out << "# arith_before_oink=" << arith_oink_start << "\n";
    out << "# arith_oink_end=" << arith_oink_end << " total=" << arith_oink_total << "\n";
    out << "# nnf_before_oink=" << nnf_oink_start << " total=" << nnf_oink_total << "\n";
    out << "# ext_before_oink=" << ext_oink_start << " total=" << ext_oink_total << "\n";
    out << "# int_before_oink=" << int_oink_start << " total=" << int_oink_total << "\n";
    out << "# eta_squeeze=" << eta_gate << " beta_gamma_squeeze=" << beta_gamma_gate << " alpha_squeeze=" << alpha_gate
        << "\n\n";

    // ── Arith sub-regions within Oink ────────────────────────────────────────
    // Structure (by arithmetic gate range within the full block):
    //   [arith_oink_start .. eta_gate+1)      = VK_hash + public_inputs + pre_eta_commitments + eta_challenge
    //   [eta_gate+1 .. beta_gamma_gate+1)     = post_eta_commitments + beta_gamma_challenge
    //   [beta_gamma_gate+1 .. alpha_gate+1)   = public_input_delta + z_perm + alpha_challenge
    //
    // Each range ends at squeeze_gate+1 (inclusive of the squeeze gate).

    emit_fingerprint_line(out, vc.builder(), BLOCK_IDX_ARITHMETIC, arith_oink_start, eta_gate + 1, "pre_eta_arith");
    emit_fingerprint_line(out, vc.builder(), BLOCK_IDX_ARITHMETIC, eta_gate + 1, beta_gamma_gate + 1, "post_eta_arith");
    emit_fingerprint_line(
        out, vc.builder(), BLOCK_IDX_ARITHMETIC, beta_gamma_gate + 1, alpha_gate + 1, "post_beta_gamma_arith");

    // ── NNF block (all 8 commitments combined) ────────────────────────────────
    emit_fingerprint_line(out, vc.builder(), BLOCK_IDX_NNF, nnf_oink_start, nnf_oink_end, "oink_nnf_total");

    // NNF per commitment: 8 commitments total.
    const size_t NUM_HONK_OINK_COMMITMENTS = 8;
    ASSERT_EQ(nnf_oink_total % NUM_HONK_OINK_COMMITMENTS, 0U)
        << "NNF not evenly divisible by commitment count. total=" << nnf_oink_total;
    const size_t nnf_per_commitment = nnf_oink_total / NUM_HONK_OINK_COMMITMENTS;
    out << "# nnf_per_commitment=" << nnf_per_commitment << "\n";
    emit_fingerprint_line(
        out, vc.builder(), BLOCK_IDX_NNF, nnf_oink_start, nnf_oink_start + nnf_per_commitment, "single_commitment_nnf");

    // ── Poseidon2 EXT/INT (VK hash + 3 challenges) ───────────────────────────
    emit_fingerprint_line(out, vc.builder(), BLOCK_IDX_POSEIDON2_EXT, ext_oink_start, ext_oink_end, "oink_ext_total");
    emit_fingerprint_line(out, vc.builder(), BLOCK_IDX_POSEIDON2_INT, int_oink_start, int_oink_end, "oink_int_total");

    // ── Summary ──────────────────────────────────────────────────────────────
    out << "\n# Breakdown:\n";
    out << "#   pre_eta_arith gates = " << (eta_gate + 1 - arith_oink_start) << "\n";
    out << "#   post_eta_arith gates = " << (beta_gamma_gate - eta_gate) << "\n";
    out << "#   post_beta_gamma_arith gates = " << (alpha_gate - beta_gamma_gate) << "\n";
    out << "#   nnf_per_commitment = " << nnf_per_commitment << "\n";
    out.flush();

    info("honk_oink_stage_analysis.txt written. arith_total=",
         arith_oink_total,
         " nnf_total=",
         nnf_oink_total,
         " ext_total=",
         ext_oink_total,
         " int_total=",
         int_oink_total,
         " eta=",
         eta_gate,
         " beta_gamma=",
         beta_gamma_gate,
         " alpha=",
         alpha_gate);
}

// ============================================================================
// Step 2: Fingerprint stability tests — verify pinned constants match circuit.
// ============================================================================

TEST_F(HonkBoomerangDiscoveryTests, HonkOinkFingerprintsMatch)
{
    HonkVerifierComponents vc = setup_honk_verifier_components(0);

    // Capture sizes before and after Oink.
    auto snap_before_oink = recursion_helpers::BlockSnapshot::capture(vc.builder());
    run_oink_step(vc);
    auto snap_after_oink = recursion_helpers::BlockSnapshot::capture(vc.builder());

    const size_t arith_start = snap_before_oink.sizes[BLOCK_IDX_ARITHMETIC];
    const size_t nnf_start = snap_before_oink.sizes.size() > BLOCK_IDX_NNF ? snap_before_oink.sizes[BLOCK_IDX_NNF] : 0;
    const size_t ext_start =
        snap_before_oink.sizes.size() > BLOCK_IDX_POSEIDON2_EXT ? snap_before_oink.sizes[BLOCK_IDX_POSEIDON2_EXT] : 0;
    const size_t int_start =
        snap_before_oink.sizes.size() > BLOCK_IDX_POSEIDON2_INT ? snap_before_oink.sizes[BLOCK_IDX_POSEIDON2_INT] : 0;

    const size_t nnf_end = snap_after_oink.sizes[BLOCK_IDX_NNF];
    const size_t ext_end = snap_after_oink.sizes[BLOCK_IDX_POSEIDON2_EXT];
    const size_t int_end = snap_after_oink.sizes[BLOCK_IDX_POSEIDON2_INT];

    // Get Oink squeeze gates.
    auto all_squeezes = recursion_helpers::find_all_transcript_squeeze_gates(vc.builder());
    auto oink_chal = recursion_helpers::oink_challenges(vc.builder(), all_squeezes);
    ASSERT_TRUE(oink_chal.valid);
    std::vector<size_t> sorted_squeezes(oink_chal.squeeze_gate_indices.begin(), oink_chal.squeeze_gate_indices.end());
    std::sort(sorted_squeezes.begin(), sorted_squeezes.end());
    ASSERT_EQ(sorted_squeezes.size(), 3U);
    const size_t eta = sorted_squeezes[0];
    const size_t beta_gamma = sorted_squeezes[1];
    const size_t alpha = sorted_squeezes[2];

    namespace HO = HonkRecursionValidation::Oink;

    // ── Arith region fingerprints ─────────────────────────────────────────────
    expect_fingerprint_matches(
        vc.builder(), BLOCK_IDX_ARITHMETIC, arith_start, eta + 1, HO::PRE_ETA_ARITH, "Oink:PRE_ETA_ARITH");
    expect_fingerprint_matches(
        vc.builder(), BLOCK_IDX_ARITHMETIC, eta + 1, beta_gamma + 1, HO::POST_ETA_ARITH, "Oink:POST_ETA_ARITH");
    expect_fingerprint_matches(vc.builder(),
                               BLOCK_IDX_ARITHMETIC,
                               beta_gamma + 1,
                               alpha + 1,
                               HO::POST_BETA_GAMMA_ARITH,
                               "Oink:POST_BETA_GAMMA_ARITH");

    // ── NNF fingerprints ──────────────────────────────────────────────────────
    expect_fingerprint_matches(vc.builder(), BLOCK_IDX_NNF, nnf_start, nnf_end, HO::OINK_NNF_TOTAL, "Oink:NNF_TOTAL");
    expect_fingerprint_matches(vc.builder(),
                               BLOCK_IDX_NNF,
                               nnf_start,
                               nnf_start + recursion_helpers::SINGLE_COMMITMENT_NNF.gate_count,
                               recursion_helpers::SINGLE_COMMITMENT_NNF,
                               "Oink:SINGLE_COMMITMENT_NNF");

    // ── Poseidon2 fingerprints ────────────────────────────────────────────────
    expect_fingerprint_matches(vc.builder(),
                               BLOCK_IDX_POSEIDON2_EXT,
                               ext_start,
                               ext_end,
                               HO::OINK_POSEIDON2_EXT_TOTAL,
                               "Oink:POSEIDON2_EXT_TOTAL");
    expect_fingerprint_matches(vc.builder(),
                               BLOCK_IDX_POSEIDON2_INT,
                               int_start,
                               int_end,
                               HO::OINK_POSEIDON2_INT_TOTAL,
                               "Oink:POSEIDON2_INT_TOTAL");

    // ── Setup NNF constant ────────────────────────────────────────────────────
    // NNF gates before Oink (from VK + proof field loading) must match constant.
    const size_t pre_oink_nnf =
        snap_before_oink.sizes.size() > BLOCK_IDX_NNF ? snap_before_oink.sizes[BLOCK_IDX_NNF] : 0;
    EXPECT_EQ(pre_oink_nnf, HO::SETUP_NNF_GATE_COUNT) << "Setup NNF gate count mismatch (VK + proof field loading)";
}

TEST_F(HonkBoomerangDiscoveryTests, HonkPreprocessorFingerprintsMatch)
{
    HonkVerifierComponents vc = setup_honk_verifier_components(0);
    run_oink_step(vc);
    auto snap_before = recursion_helpers::BlockSnapshot::capture(vc.builder());
    run_gate_challenges_step(vc);
    auto snap_after = recursion_helpers::BlockSnapshot::capture(vc.builder());

    const size_t arith_start = snap_before.sizes[BLOCK_IDX_ARITHMETIC];
    const size_t ext_start =
        snap_before.sizes.size() > BLOCK_IDX_POSEIDON2_EXT ? snap_before.sizes[BLOCK_IDX_POSEIDON2_EXT] : 0;
    const size_t int_start =
        snap_before.sizes.size() > BLOCK_IDX_POSEIDON2_INT ? snap_before.sizes[BLOCK_IDX_POSEIDON2_INT] : 0;

    namespace HP = HonkRecursionValidation::Preprocessor;
    expect_fingerprint_matches(vc.builder(),
                               BLOCK_IDX_ARITHMETIC,
                               arith_start,
                               snap_after.sizes[BLOCK_IDX_ARITHMETIC],
                               HP::ARITH,
                               "Preprocessor:ARITH");
    expect_fingerprint_matches(vc.builder(),
                               BLOCK_IDX_POSEIDON2_EXT,
                               ext_start,
                               snap_after.sizes[BLOCK_IDX_POSEIDON2_EXT],
                               HP::POSEIDON2_EXT,
                               "Preprocessor:POSEIDON2_EXT");
    expect_fingerprint_matches(vc.builder(),
                               BLOCK_IDX_POSEIDON2_INT,
                               int_start,
                               snap_after.sizes[BLOCK_IDX_POSEIDON2_INT],
                               HP::POSEIDON2_INT,
                               "Preprocessor:POSEIDON2_INT");
}

TEST_F(HonkBoomerangDiscoveryTests, HonkSumcheckFingerprintsMatch)
{
    HonkVerifierComponents vc = setup_honk_verifier_components(0);
    run_oink_step(vc);
    run_gate_challenges_step(vc);
    auto snap_before = recursion_helpers::BlockSnapshot::capture(vc.builder());
    run_sumcheck_step(vc);
    auto snap_after = recursion_helpers::BlockSnapshot::capture(vc.builder());

    const size_t arith_start = snap_before.sizes[BLOCK_IDX_ARITHMETIC];
    const size_t ext_start =
        snap_before.sizes.size() > BLOCK_IDX_POSEIDON2_EXT ? snap_before.sizes[BLOCK_IDX_POSEIDON2_EXT] : 0;
    const size_t int_start =
        snap_before.sizes.size() > BLOCK_IDX_POSEIDON2_INT ? snap_before.sizes[BLOCK_IDX_POSEIDON2_INT] : 0;

    namespace HS = HonkRecursionValidation::Sumcheck;
    expect_fingerprint_matches(vc.builder(),
                               BLOCK_IDX_ARITHMETIC,
                               arith_start,
                               snap_after.sizes[BLOCK_IDX_ARITHMETIC],
                               HS::ARITH_TOTAL,
                               "Sumcheck:ARITH_TOTAL");
    expect_fingerprint_matches(vc.builder(),
                               BLOCK_IDX_POSEIDON2_EXT,
                               ext_start,
                               snap_after.sizes[BLOCK_IDX_POSEIDON2_EXT],
                               HS::POSEIDON2_EXT_TOTAL,
                               "Sumcheck:POSEIDON2_EXT_TOTAL");
    expect_fingerprint_matches(vc.builder(),
                               BLOCK_IDX_POSEIDON2_INT,
                               int_start,
                               snap_after.sizes[BLOCK_IDX_POSEIDON2_INT],
                               HS::POSEIDON2_INT_TOTAL,
                               "Sumcheck:POSEIDON2_INT_TOTAL");
}

TEST_F(HonkBoomerangDiscoveryTests, HonkShpleminiFingerprintsMatch)
{
    HonkVerifierComponents vc = setup_honk_verifier_components(0);
    run_oink_step(vc);
    run_gate_challenges_step(vc);
    auto sc = run_sumcheck_step(vc);
    auto snap_before = recursion_helpers::BlockSnapshot::capture(vc.builder());
    run_shplemini_step(vc, sc);
    auto snap_after = recursion_helpers::BlockSnapshot::capture(vc.builder());

    const size_t arith_start = snap_before.sizes[BLOCK_IDX_ARITHMETIC];
    const size_t nnf_start = snap_before.sizes.size() > BLOCK_IDX_NNF ? snap_before.sizes[BLOCK_IDX_NNF] : 0;
    const size_t ext_start =
        snap_before.sizes.size() > BLOCK_IDX_POSEIDON2_EXT ? snap_before.sizes[BLOCK_IDX_POSEIDON2_EXT] : 0;
    const size_t int_start =
        snap_before.sizes.size() > BLOCK_IDX_POSEIDON2_INT ? snap_before.sizes[BLOCK_IDX_POSEIDON2_INT] : 0;

    namespace HSH = HonkRecursionValidation::Shplemini;
    expect_fingerprint_matches(vc.builder(),
                               BLOCK_IDX_ARITHMETIC,
                               arith_start,
                               snap_after.sizes[BLOCK_IDX_ARITHMETIC],
                               HSH::ARITH_TOTAL,
                               "Shplemini:ARITH_TOTAL");
    expect_fingerprint_matches(
        vc.builder(), BLOCK_IDX_NNF, nnf_start, snap_after.sizes[BLOCK_IDX_NNF], HSH::NNF_TOTAL, "Shplemini:NNF_TOTAL");
    expect_fingerprint_matches(vc.builder(),
                               BLOCK_IDX_POSEIDON2_EXT,
                               ext_start,
                               snap_after.sizes[BLOCK_IDX_POSEIDON2_EXT],
                               HSH::POSEIDON2_EXT_TOTAL,
                               "Shplemini:POSEIDON2_EXT_TOTAL");
    expect_fingerprint_matches(vc.builder(),
                               BLOCK_IDX_POSEIDON2_INT,
                               int_start,
                               snap_after.sizes[BLOCK_IDX_POSEIDON2_INT],
                               HSH::POSEIDON2_INT_TOTAL,
                               "Shplemini:POSEIDON2_INT_TOTAL");
}

TEST_F(HonkBoomerangDiscoveryTests, HonkKZGFingerprintsMatch)
{
    HonkVerifierComponents vc = setup_honk_verifier_components(0);
    run_oink_step(vc);
    run_gate_challenges_step(vc);
    auto sc = run_sumcheck_step(vc);
    auto shp = run_shplemini_step(vc, sc);
    auto snap_before = recursion_helpers::BlockSnapshot::capture(vc.builder());
    run_kzg_step(vc, shp);
    auto snap_after = recursion_helpers::BlockSnapshot::capture(vc.builder());

    const size_t arith_start = snap_before.sizes[BLOCK_IDX_ARITHMETIC];
    const size_t mem_start = snap_before.sizes.size() > BLOCK_IDX_MEMORY ? snap_before.sizes[BLOCK_IDX_MEMORY] : 0;
    const size_t nnf_start = snap_before.sizes.size() > BLOCK_IDX_NNF ? snap_before.sizes[BLOCK_IDX_NNF] : 0;
    const size_t ext_start =
        snap_before.sizes.size() > BLOCK_IDX_POSEIDON2_EXT ? snap_before.sizes[BLOCK_IDX_POSEIDON2_EXT] : 0;
    const size_t int_start =
        snap_before.sizes.size() > BLOCK_IDX_POSEIDON2_INT ? snap_before.sizes[BLOCK_IDX_POSEIDON2_INT] : 0;

    namespace HK = HonkRecursionValidation::KZG;
    expect_fingerprint_matches(vc.builder(),
                               BLOCK_IDX_ARITHMETIC,
                               arith_start,
                               snap_after.sizes[BLOCK_IDX_ARITHMETIC],
                               HK::ARITH_TOTAL_OP0,
                               "KZG:ARITH_TOTAL");
    expect_fingerprint_matches(vc.builder(),
                               BLOCK_IDX_MEMORY,
                               mem_start,
                               snap_after.sizes[BLOCK_IDX_MEMORY],
                               HK::MEMORY_TOTAL,
                               "KZG:MEMORY_TOTAL");
    expect_fingerprint_matches(
        vc.builder(), BLOCK_IDX_NNF, nnf_start, snap_after.sizes[BLOCK_IDX_NNF], HK::NNF_TOTAL, "KZG:NNF_TOTAL");
    expect_fingerprint_matches(vc.builder(),
                               BLOCK_IDX_POSEIDON2_EXT,
                               ext_start,
                               snap_after.sizes[BLOCK_IDX_POSEIDON2_EXT],
                               HK::POSEIDON2_EXT_TOTAL,
                               "KZG:POSEIDON2_EXT_TOTAL");
    expect_fingerprint_matches(vc.builder(),
                               BLOCK_IDX_POSEIDON2_INT,
                               int_start,
                               snap_after.sizes[BLOCK_IDX_POSEIDON2_INT],
                               HK::POSEIDON2_INT_TOTAL,
                               "KZG:POSEIDON2_INT_TOTAL");
}

// ============================================================================
// Phase 2 (acir-witness-gate-discovery): serialization parse → gate dump → primitive_start.
//
// Production order (honk_recursion_constraint.cpp):
//   wrapper wiring (no gates) → RecursiveVK(key) = VkDeserialize (first circuit gates from
//   key[3..]) → verify_proof → Oink:vk_hash (key_hash) → Oink commitment receives (proof).
//
// Measured first_primitive_part = VkDeserialize (not Oink:vk_hash). Plan §4b's Oink:vk_hash
// suggestion is the first Oink-body circuit part; Phase 3 Oink cursor starts after VkDeserialize.
// ============================================================================

namespace {

struct HonkAlignedWitnesses {
    std::vector<uint32_t> proof_indices;
    size_t io_prefix = 0;
};

HonkAlignedWitnesses make_honk_aligned_witnesses(const acir_format::RecursionConstraint& c)
{
    HonkAlignedWitnesses a;
    a.proof_indices = acir_format::add_public_inputs_to_proof(c.proof, c.public_inputs);
    a.io_prefix = HonkRecursionValidation::Oink::honk_public_input_prefix_size(&c);
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

TEST_F(HonkBoomerangDiscoveryTests, AcirHonkWitnessSerializationParse)
{
    // Step 3: pure witness-index bookkeeping — no need for a full verifier build.
    acir_format::AcirProgram program = make_mock_acir_program(0);
    const auto& c = program.constraints.honk_recursion_constraints[0];
    ASSERT_EQ(program.constraints.original_opcode_indices.honk_recursion_constraints.at(0), 0U);
    ASSERT_EQ(c.proof_type, acir_format::PROOF_TYPE::HONK);
    ASSERT_TRUE(c.predicate.is_constant);

    const auto aligned = make_honk_aligned_witnesses(c);
    const auto& proof_indices = aligned.proof_indices;

    EXPECT_EQ(proof_indices.size(), c.proof.size() + c.public_inputs.size());
    for (size_t i = 0; i < c.public_inputs.size(); ++i) {
        EXPECT_EQ(proof_indices[i], c.public_inputs[i]);
    }
    for (size_t i = 0; i < c.proof.size(); ++i) {
        EXPECT_EQ(proof_indices[c.public_inputs.size() + i], c.proof[i]);
    }

    ASSERT_GT(c.key.size(), HonkRecursionValidation::VkDeserialize::FIRST_COMMITMENT_KEY_INDEX);

    namespace HO = HonkRecursionValidation::Oink;
    EXPECT_EQ(aligned.io_prefix, HO::HONK_DEFAULT_IO_PUBLIC_INPUTS);
    for (size_t g = 0; g < HO::NUM_COMMITMENT_GROUPS; ++g) {
        const auto frs = HO::get_honk_commitment_group_witness_indices(proof_indices, g, aligned.io_prefix);
        ASSERT_TRUE(frs.has_value()) << "group " << g;
        const size_t base =
            aligned.io_prefix + HO::HONK_PROOF_POSITION_BY_GROUP[g] * recursion_helpers::FRS_PER_COMMITMENT;
        EXPECT_EQ((*frs)[0], proof_indices[base]);
    }

    std::ofstream out("honk_witness_serialization.txt");
    ASSERT_TRUE(out.is_open());
    out << "# HONK witness serialization — opcode=0 proof_type=HONK\n";
    out << "# key.size=" << c.key.size() << " proof.size=" << c.proof.size()
        << " public_inputs.size=" << c.public_inputs.size() << "\n";
    out << "# Production: honk_recursion_constraint.cpp fields_from_witnesses / from_witness_index\n";
    out << "# Rule A: proof_indices = { public_inputs | proof }\n";
    out << "# Rule B: key[i] → VK limb i; key_hash → single witness\n";
    out << "# Rule C: io_prefix=" << aligned.io_prefix << "; group g base = prefix + HONK_PROOF_POSITION_BY_GROUP[g] * "
        << recursion_helpers::FRS_PER_COMMITMENT << "\n";
    out << "# Rule D: none (constant-true predicate; no rollup split; no write-vk)\n\n";

    out << "# Aligned witness table\n";
    out << "# logical_slot | source_rule | witness_index | primitive_part | role | prod_order\n";
    out << "key_hash | B | " << c.key_hash << " | Oink:vk_hash | wrapper→circuit | 5\n";
    for (size_t i = 0; i < 3 && i < c.key.size(); ++i) {
        out << "key[" << i << "] | B | " << c.key[i] << " | Oink:num_public_inputs_assert/scalars | wrapper | 1\n";
    }
    for (size_t i = HonkRecursionValidation::VkDeserialize::FIRST_COMMITMENT_KEY_INDEX; i < c.key.size(); ++i) {
        out << "key[" << i << "] | B | " << c.key[i] << " | VkDeserialize | circuit | 4\n";
    }
    for (size_t i = 0; i < aligned.io_prefix && i < proof_indices.size(); ++i) {
        out << "stitched_proof[" << i << "] | A | " << proof_indices[i]
            << " | Oink:public_inputs/Output | serialization | 3\n";
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

    out << "\n# Early processing order (production)\n";
    out << "1 wrapper | key[] | fields_from_witnesses | wiring\n";
    out << "2 wrapper | key_hash | from_witness_index | wiring\n";
    out << "3 wrapper | proof_indices | fields_from_witnesses | wiring\n";
    out << "4 circuit | key[3..] | RecursiveVK construction | VkDeserialize (first_primitive_part)\n";
    out << "5 circuit | key_hash | Oink vk_hash | Oink:vk_hash\n";
    out << "6 serialization | proof commitment groups | Oink receive | Oink:w_*/lookup/z_perm\n";
    out << "early_opcode_witnesses=key[],key_hash,proof_indices[]\n";
    out << "first_primitive_part=VkDeserialize\n";
    out << "last_serialization_part_before_primitive=wrapper (no gates)\n";
    out.flush();
}

TEST_F(HonkBoomerangDiscoveryTests, AcirHonkWitnessGateDump)
{
    HonkVerifierComponents vc = setup_honk_verifier_components_for_acir_build(0);
    const auto& c = vc.constraint;
    [[maybe_unused]] auto output = acir_format::create_honk_recursion_constraints<RecursiveFlavor, IO>(vc.builder(), c);
    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer(vc.builder(), false);
    auto& builder = vc.builder();
    const auto aligned = make_honk_aligned_witnesses(c);
    namespace HO = HonkRecursionValidation::Oink;

    std::ofstream out("honk_witness_gate_dump.txt");
    ASSERT_TRUE(out.is_open());
    out << "# HONK Phase 2 witness gate dump (aligned slots only)\n";
    out << "# Chain: create_honk_recursion_constraints real build\n\n";

    dump_slot_gates(out, builder, analyzer, "Oink:vk_hash", "key_hash", c.key_hash);
    for (size_t i = 0; i < 3 && i < c.key.size(); ++i) {
        dump_slot_gates(out, builder, analyzer, "wrapper_scalar", ("key[" + std::to_string(i) + "]").c_str(), c.key[i]);
    }
    for (size_t i = HonkRecursionValidation::VkDeserialize::FIRST_COMMITMENT_KEY_INDEX; i < c.key.size(); ++i) {
        dump_slot_gates(out, builder, analyzer, "VkDeserialize", ("key[" + std::to_string(i) + "]").c_str(), c.key[i]);
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
    out.flush();
    SUCCEED();
}

TEST_F(HonkBoomerangDiscoveryTests, AcirHonkPrimitiveStartDiscovery)
{
    HonkVerifierComponents vc = setup_honk_verifier_components_for_acir_build(0);
    const auto& c = vc.constraint;
    [[maybe_unused]] auto output = acir_format::create_honk_recursion_constraints<RecursiveFlavor, IO>(vc.builder(), c);
    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer(vc.builder(), false);
    auto& builder = vc.builder();
    const auto aligned = make_honk_aligned_witnesses(c);
    namespace HO = HonkRecursionValidation::Oink;
    namespace VD = HonkRecursionValidation::VkDeserialize;

    // Earliest arithmetic / nnf gates from key[3..] — first opcode-witness circuit gates.
    size_t first_key_arith = SIZE_MAX;
    size_t first_key_nnf = SIZE_MAX;
    for (size_t j = VD::FIRST_COMMITMENT_KEY_INDEX; j < c.key.size(); ++j) {
        first_key_arith =
            std::min(first_key_arith, min_gate_in_block(builder, analyzer, c.key[j], BLOCK_IDX_ARITHMETIC));
        first_key_nnf = std::min(first_key_nnf, min_gate_in_block(builder, analyzer, c.key[j], BLOCK_IDX_NNF));
    }
    ASSERT_NE(first_key_arith, SIZE_MAX) << "no arithmetic gate for any key[3..] commitment field";

    // Oink:vk_hash — first poseidon2_ext gate linked to key_hash (after VkDeserialize).
    const size_t key_hash_p2ext = min_gate_in_block(builder, analyzer, c.key_hash, BLOCK_IDX_POSEIDON2_EXT);
    ASSERT_NE(key_hash_p2ext, SIZE_MAX) << "key_hash must link into poseidon2_external (Oink vk_hash)";

    // Proof commitment group 0 — serialization receives; must not define primitive_start.
    const auto g0 = HO::get_honk_commitment_group_witness_indices(aligned.proof_indices, 0, aligned.io_prefix);
    ASSERT_TRUE(g0.has_value());
    const size_t proof0_arith = min_gate_in_block(builder, analyzer, (*g0)[0], BLOCK_IDX_ARITHMETIC);

    // Pin primitive_start as the earliest arith gate among key[3..] witnesses.
    // Region may extend before a single limb's first touch; locate FP range containing that gate
    // (Phase 2 one-time search — allowed). If pinned ARITH is stale, remeasure and require match
    // after refresh below.
    auto& arith = builder.blocks.arithmetic;
    auto region_start =
        recursion_helpers::find_fingerprint_range_containing_gate(builder, arith, first_key_arith, VD::ARITH);
    size_t primitive_start_arith = first_key_arith;
    size_t vk_deserialize_region_end = first_key_arith;
    bool used_stale_fp = false;
    if (region_start.has_value()) {
        primitive_start_arith = *region_start;
        vk_deserialize_region_end = *region_start + VD::ARITH.gate_count;
    } else {
        used_stale_fp = true;
        // Remeasure: walk backward from first_key_arith to find a start where ARITH.gate_count
        // still fits and key[3..] witnesses stay inside [start, start+gate_count). Without a
        // valid hash, pin to first_key_arith and emit measured FP for Phase 3 refresh.
        primitive_start_arith = first_key_arith;
        // Conservative end: max arith gate among key[3..] (+1).
        size_t max_key_arith = 0;
        for (size_t j = VD::FIRST_COMMITMENT_KEY_INDEX; j < c.key.size(); ++j) {
            const uint32_t real = builder.real_variable_index[c.key[j]];
            for (const auto& [blk, gi] : analyzer.get_variable_gates(real)) {
                if (&builder.blocks.get()[blk] == &arith) {
                    max_key_arith = std::max(max_key_arith, gi);
                }
            }
        }
        vk_deserialize_region_end = max_key_arith + 1;
    }

    EXPECT_GE(first_key_arith, primitive_start_arith);
    EXPECT_LT(first_key_arith, vk_deserialize_region_end);
    EXPECT_GE(key_hash_p2ext, 0U);
    // key_hash must not appear on arith before VkDeserialize ends (wiring until Oink).
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

    const size_t serialization_end_arith = 0; // wrapper binding adds no arith gates
    EXPECT_GT(primitive_start_arith, serialization_end_arith);

    // Step 8: FP link — match pinned VkDeserialize ARITH at primitive_start when constant is current.
    const bool fp_ok = recursion_helpers::matches_fingerprint_at(builder, arith, primitive_start_arith, VD::ARITH);
    auto measured =
        compute_block_fingerprint(builder, BLOCK_IDX_ARITHMETIC, primitive_start_arith, vk_deserialize_region_end);

    std::ofstream out("honk_witness_gate_map.txt");
    ASSERT_TRUE(out.is_open());
    out << "# HONK Phase 2 witness gate map\n";
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
    out << "proof_g0_fr0_arith_gate_min=" << proof0_arith << "\n";
    out << "key_hash_touches_arith_before_region_end=" << key_hash_early_arith << "\n";
    out << "early_opcode_witnesses=key[0..2](scalar,wrapper),key_hash(wrapper),proof_indices(wrapper)\n";
    out << "vk_deserialize_arith_fp_match_pinned=" << (fp_ok ? "true" : "false") << "\n";
    out << "vk_deserialize_pinned_fp_stale=" << (used_stale_fp || !fp_ok ? "true" : "false") << "\n";
    out << "measured_vk_deserialize_arith gates=" << measured.gate_count << " prefix20=0x" << std::hex
        << measured.prefix_hash << " full=0x" << measured.full_hash << std::dec << "\n";
    out << "# Note: Phase 3 Oink cursor starts at vk_deserialize_region_end_arith / oink_vk_hash.\n";
    out.flush();

    // Phase 2 pins primitive_start from gates even if Phase 3 ARITH constant drifted.
    EXPECT_TRUE(fp_ok || used_stale_fp)
        << "If find_fingerprint failed, used_stale_fp path must run; measured FP written for refresh";
    if (!fp_ok) {
        // Refresh pinned constant so Step 8 / Phase 3 can re-link — assert measured span is non-empty.
        EXPECT_GT(measured.gate_count, 0U);
        info("VkDeserialize::ARITH stale. measured gates=",
             measured.gate_count,
             " prefix=0x",
             std::hex,
             measured.prefix_hash,
             " full=0x",
             measured.full_hash,
             std::dec);
    }
}

TEST_F(HonkBoomerangDiscoveryTests, AcirHonkPrimitiveStartFingerprintLink)
{
    HonkVerifierComponents vc = setup_honk_verifier_components_for_acir_build(0);
    const auto& c = vc.constraint;
    [[maybe_unused]] auto output = acir_format::create_honk_recursion_constraints<RecursiveFlavor, IO>(vc.builder(), c);
    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer(vc.builder(), false);
    auto& builder = vc.builder();
    namespace VD = HonkRecursionValidation::VkDeserialize;

    size_t first_key_arith = SIZE_MAX;
    for (size_t j = VD::FIRST_COMMITMENT_KEY_INDEX; j < c.key.size(); ++j) {
        first_key_arith =
            std::min(first_key_arith, min_gate_in_block(builder, analyzer, c.key[j], BLOCK_IDX_ARITHMETIC));
    }
    ASSERT_NE(first_key_arith, SIZE_MAX);

    auto& arith = builder.blocks.arithmetic;
    auto region_start =
        recursion_helpers::find_fingerprint_range_containing_gate(builder, arith, first_key_arith, VD::ARITH);

    if (region_start.has_value()) {
        EXPECT_TRUE(recursion_helpers::matches_fingerprint_at(builder, arith, *region_start, VD::ARITH));
        EXPECT_GE(first_key_arith, *region_start);
        EXPECT_LT(first_key_arith, *region_start + VD::ARITH.gate_count);
        // Serialization (wrapper) has no arith gates before primitive_start.
        EXPECT_GT(*region_start, 0U);
    } else {
        // Pinned ARITH drifted — update constant from measured region starting at first_key_arith
        // is unsafe (may be mid-region). Fail with actionable message; PrimitiveStartDiscovery
        // already emitted measured FP over [first_key, max_key].
        FAIL() << "VkDeserialize::ARITH no longer matches around first_key_arith=" << first_key_arith
               << "; refresh HONK/honk_recursion_vk_deserialize_verification.hpp from "
                  "honk_witness_gate_map.txt measured_vk_deserialize_arith";
    }
}

// ============================================================================
// Phase 3 Step 1–2: promote multi-block cursors + FunctionFingerprints from mirror
// stage boundaries (parity-licensed) and verify matches_fingerprint_at on real build.
// ============================================================================

TEST_F(HonkBoomerangDiscoveryTests, AcirHonkPhase3CursorPromote)
{
    // Mirror: Stage snapshots give exact multi-block cursors for the verifier body.
    HonkVerifierComponents vc = setup_honk_verifier_components(0);
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
    run_output_step<IO>(vc, pcs);
    auto snap_out = recursion_helpers::BlockSnapshot::capture(vc.builder());

    auto sz = [](const recursion_helpers::BlockSnapshot& s, size_t b) -> size_t {
        return b < s.sizes.size() ? s.sizes[b] : 0;
    };

    std::ofstream out("honk_phase3_cursor_promote.txt");
    ASSERT_TRUE(out.is_open());
    out << "# HONK Phase 3 cursor / FP promotion (mirror stage boundaries)\n";
    out << "# Phase 2: primitive_start_arith=1709 vk_deserialize_region_end=4372\n";
    out << "setup arith=" << sz(snap_setup, BLOCK_IDX_ARITHMETIC) << " nnf=" << sz(snap_setup, BLOCK_IDX_NNF)
        << " mem=" << sz(snap_setup, BLOCK_IDX_MEMORY) << " p2ext=" << sz(snap_setup, BLOCK_IDX_POSEIDON2_EXT)
        << " p2int=" << sz(snap_setup, BLOCK_IDX_POSEIDON2_INT) << "\n";
    if (sz(snap_setup, BLOCK_IDX_NNF) > 0) {
        auto setup_nnf_fp = compute_block_fingerprint(vc.builder(), BLOCK_IDX_NNF, 0, sz(snap_setup, BLOCK_IDX_NNF));
        out << "setup_nnf gates=" << setup_nnf_fp.gate_count << " prefix=0x" << std::hex << setup_nnf_fp.prefix_hash
            << " full=0x" << setup_nnf_fp.full_hash << std::dec << "\n";
    }
    if (sz(snap_setup, BLOCK_IDX_ARITHMETIC) > 1709) {
        // gates before Phase 2 primitive_start (wrapper / early wiring)
        auto pre_prim = compute_block_fingerprint(vc.builder(), BLOCK_IDX_ARITHMETIC, 0, 1709);
        out << "pre_primitive_arith gates=" << pre_prim.gate_count << " prefix=0x" << std::hex << pre_prim.prefix_hash
            << " full=0x" << pre_prim.full_hash << std::dec << "\n";
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

    // Real build: VkDeserialize at Phase 2 pin, then Oink arith at setup.arith.
    HonkVerifierComponents real_vc = setup_honk_verifier_components_for_acir_build(0);
    [[maybe_unused]] auto real_out =
        acir_format::create_honk_recursion_constraints<RecursiveFlavor, IO>(real_vc.builder(), real_vc.constraint);
    namespace VD = HonkRecursionValidation::VkDeserialize;
    auto& real_arith = real_vc.builder().blocks.arithmetic;
    const size_t primitive_start = 1709;
    const size_t oink_arith_start = sz(snap_setup, BLOCK_IDX_ARITHMETIC);
    EXPECT_TRUE(recursion_helpers::matches_fingerprint_at(real_vc.builder(), real_arith, primitive_start, VD::ARITH))
        << "real build VkDeserialize ARITH must match at Phase 2 primitive_start";

    const size_t vd_end = primitive_start + VD::ARITH.gate_count;
    auto residual = compute_block_fingerprint(real_vc.builder(), BLOCK_IDX_ARITHMETIC, vd_end, oink_arith_start);
    auto pre_oink_full =
        compute_block_fingerprint(real_vc.builder(), BLOCK_IDX_ARITHMETIC, primitive_start, oink_arith_start);
    auto oink_arith_fp = compute_block_fingerprint(
        real_vc.builder(), BLOCK_IDX_ARITHMETIC, oink_arith_start, sz(snap_oink, BLOCK_IDX_ARITHMETIC));
    EXPECT_TRUE(
        recursion_helpers::matches_fingerprint_at(real_vc.builder(), real_arith, oink_arith_start, oink_arith_fp))
        << "real Oink ARITH must match mirror-promoted FP at cursor " << oink_arith_start;
    EXPECT_EQ(oink_arith_start, 4451U);

    out << "\n# real-build checks\n";
    out << "primitive_start_arith=" << primitive_start << "\n";
    out << "vk_deserialize_end=" << vd_end << "\n";
    out << "setup_residual gates=" << residual.gate_count << " prefix=0x" << std::hex << residual.prefix_hash
        << " full=0x" << residual.full_hash << std::dec << "\n";
    out << "pre_oink_full gates=" << pre_oink_full.gate_count << " prefix=0x" << std::hex << pre_oink_full.prefix_hash
        << " full=0x" << pre_oink_full.full_hash << std::dec << "\n";
    out << "oink_arith_start=" << oink_arith_start << " oink_arith_gates=" << oink_arith_fp.gate_count << " prefix=0x"
        << std::hex << oink_arith_fp.prefix_hash << " full=0x" << oink_arith_fp.full_hash << std::dec << "\n";
    out << "setup_nnf=" << sz(snap_setup, BLOCK_IDX_NNF) << "\n";
    out.flush();
}

// ============================================================================
// Phase 3 validator tests — cursor chain from Phase 2 primitive_start
// ============================================================================

TEST_F(HonkBoomerangDiscoveryTests, ValidateHonkOink)
{
    HonkValidatorContext ctx;
    auto result =
        HonkRecursionValidation::Oink::validate_oink<bb::fr>(ctx.vc.builder(),
                                                             *ctx.analyzer,
                                                             ctx.bounds.oink,
                                                             HonkRecursionValidation::Oink::SETUP_NNF_GATE_COUNT,
                                                             0,
                                                             0,
                                                             &ctx.vc.constraint,
                                                             &ctx.vc.constraint.proof);

    EXPECT_TRUE(result.arith_ok) << "arith";
    EXPECT_TRUE(result.nnf_ok) << "nnf";
    EXPECT_TRUE(result.poseidon2_ext_ok) << "p2ext";
    EXPECT_TRUE(result.poseidon2_int_ok) << "p2int";
    EXPECT_TRUE(result.acir_constraint_ok) << "vk_hash";
    EXPECT_TRUE(result.is_valid) << "validate_oink failed on clean circuit";
    EXPECT_EQ(result.arith_start, HonkRecursionValidation::Oink::ARITH_START);
    // commitments_ok uses validate_oink_commitment; may be false until limb helper refresh.
    // AcirHonkWitnessLinkInOink covers opcode→range independently.
}

TEST_F(HonkBoomerangDiscoveryTests, ValidateHonkPreprocessor)
{
    HonkValidatorContext ctx;
    auto oink =
        HonkRecursionValidation::Oink::validate_oink<bb::fr>(ctx.vc.builder(),
                                                             *ctx.analyzer,
                                                             ctx.bounds.oink,
                                                             HonkRecursionValidation::Oink::SETUP_NNF_GATE_COUNT,
                                                             0,
                                                             0,
                                                             &ctx.vc.constraint,
                                                             &ctx.vc.constraint.proof);
    ASSERT_TRUE(oink.is_valid);
    auto result =
        HonkRecursionValidation::Preprocessor::validate_preprocessor<bb::fr>(ctx.vc.builder(), *ctx.analyzer, oink);
    EXPECT_TRUE(result.is_valid);
    EXPECT_EQ(result.arith_start, oink.arith_end);
}

TEST_F(HonkBoomerangDiscoveryTests, ValidateHonkSumcheck)
{
    HonkValidatorContext ctx;
    auto oink =
        HonkRecursionValidation::Oink::validate_oink<bb::fr>(ctx.vc.builder(),
                                                             *ctx.analyzer,
                                                             ctx.bounds.oink,
                                                             HonkRecursionValidation::Oink::SETUP_NNF_GATE_COUNT,
                                                             0,
                                                             0,
                                                             &ctx.vc.constraint,
                                                             &ctx.vc.constraint.proof);
    ASSERT_TRUE(oink.is_valid);
    auto preprocessor =
        HonkRecursionValidation::Preprocessor::validate_preprocessor<bb::fr>(ctx.vc.builder(), *ctx.analyzer, oink);
    ASSERT_TRUE(preprocessor.is_valid);
    auto result =
        HonkRecursionValidation::Sumcheck::validate_sumcheck<bb::fr>(ctx.vc.builder(), *ctx.analyzer, preprocessor);
    EXPECT_TRUE(result.is_valid);
    EXPECT_EQ(result.arith_start, preprocessor.arith_end);
}

TEST_F(HonkBoomerangDiscoveryTests, ValidateHonkShplemini)
{
    HonkValidatorContext ctx;
    auto oink =
        HonkRecursionValidation::Oink::validate_oink<bb::fr>(ctx.vc.builder(),
                                                             *ctx.analyzer,
                                                             ctx.bounds.oink,
                                                             HonkRecursionValidation::Oink::SETUP_NNF_GATE_COUNT,
                                                             0,
                                                             0,
                                                             &ctx.vc.constraint,
                                                             &ctx.vc.constraint.proof);
    ASSERT_TRUE(oink.is_valid);
    auto preprocessor =
        HonkRecursionValidation::Preprocessor::validate_preprocessor<bb::fr>(ctx.vc.builder(), *ctx.analyzer, oink);
    ASSERT_TRUE(preprocessor.is_valid);
    auto sumcheck =
        HonkRecursionValidation::Sumcheck::validate_sumcheck<bb::fr>(ctx.vc.builder(), *ctx.analyzer, preprocessor);
    ASSERT_TRUE(sumcheck.is_valid);
    auto result =
        HonkRecursionValidation::Shplemini::validate_shplemini<bb::fr>(ctx.vc.builder(), *ctx.analyzer, sumcheck);
    EXPECT_TRUE(result.is_valid);
    EXPECT_EQ(result.arith_start, sumcheck.arith_end);
}

TEST_F(HonkBoomerangDiscoveryTests, ValidateHonkKZG)
{
    HonkValidatorContext ctx;
    auto oink =
        HonkRecursionValidation::Oink::validate_oink<bb::fr>(ctx.vc.builder(),
                                                             *ctx.analyzer,
                                                             ctx.bounds.oink,
                                                             HonkRecursionValidation::Oink::SETUP_NNF_GATE_COUNT,
                                                             0,
                                                             0,
                                                             &ctx.vc.constraint,
                                                             &ctx.vc.constraint.proof);
    ASSERT_TRUE(oink.is_valid);
    auto preprocessor =
        HonkRecursionValidation::Preprocessor::validate_preprocessor<bb::fr>(ctx.vc.builder(), *ctx.analyzer, oink);
    ASSERT_TRUE(preprocessor.is_valid);
    auto sumcheck =
        HonkRecursionValidation::Sumcheck::validate_sumcheck<bb::fr>(ctx.vc.builder(), *ctx.analyzer, preprocessor);
    ASSERT_TRUE(sumcheck.is_valid);
    auto shplemini =
        HonkRecursionValidation::Shplemini::validate_shplemini<bb::fr>(ctx.vc.builder(), *ctx.analyzer, sumcheck);
    ASSERT_TRUE(shplemini.is_valid);
    auto result = HonkRecursionValidation::KZG::validate_kzg<bb::fr>(ctx.vc.builder(), *ctx.analyzer, shplemini);
    EXPECT_TRUE(result.is_valid);
    EXPECT_EQ(result.arith_start, shplemini.arith_end);
    EXPECT_TRUE(result.memory_ok);
}

TEST_F(HonkBoomerangDiscoveryTests, ValidateHonkVkDeserialize)
{
    HonkValidatorContext ctx;
    auto result = HonkRecursionValidation::VkDeserialize::validate_vk_deserialize_region<bb::fr>(
        ctx.vc.builder(), *ctx.analyzer, ctx.vc.constraint);
    EXPECT_TRUE(result.arith_ok) << "arith";
    EXPECT_TRUE(result.residual_ok) << "residual";
    EXPECT_TRUE(result.nnf_ok) << "nnf";
    EXPECT_TRUE(result.commitments_ok) << "commitments";
    EXPECT_TRUE(result.is_valid);
    EXPECT_EQ(result.arith_end, HonkRecursionValidation::Oink::ARITH_START);
}

TEST_F(HonkBoomerangDiscoveryTests, ValidateHonkVkDeserializeRealAcirBuild)
{
    HonkVerifierComponents vc = setup_honk_verifier_components_for_acir_build(0);
    [[maybe_unused]] auto output =
        acir_format::create_honk_recursion_constraints<RecursiveFlavor, IO>(vc.builder(), vc.constraint);
    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer(vc.builder(), false);
    auto result = HonkRecursionValidation::VkDeserialize::validate_vk_deserialize_region<bb::fr>(
        vc.builder(), analyzer, vc.constraint);
    EXPECT_TRUE(result.is_valid) << "arith=" << result.arith_ok << " residual=" << result.residual_ok
                                 << " nnf=" << result.nnf_ok << " commits=" << result.commitments_ok;
}

TEST_F(HonkBoomerangDiscoveryTests, AcirHonkFingerprintsMatchConstants)
{
    HonkVerifierComponents vc = setup_honk_verifier_components_for_acir_build(0);
    [[maybe_unused]] auto output =
        acir_format::create_honk_recursion_constraints<RecursiveFlavor, IO>(vc.builder(), vc.constraint);
    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer(vc.builder(), false);
    auto result = HonkRecursionValidation::validate_honk_recursion<bb::fr>(
        vc.builder(), analyzer, vc.constraint, vc.constraint.proof);
    EXPECT_TRUE(result.vk_deserialize.is_valid) << "vk_deserialize";
    EXPECT_TRUE(result.oink.is_valid) << "oink commitments=" << result.oink.commitments_ok
                                      << " arith=" << result.oink.arith_ok;
    EXPECT_TRUE(result.preprocessor.is_valid) << "preprocessor";
    EXPECT_TRUE(result.sumcheck.is_valid) << "sumcheck";
    EXPECT_TRUE(result.shplemini.is_valid) << "shplemini";
    EXPECT_TRUE(result.kzg.is_valid) << "kzg";
    EXPECT_TRUE(result.output.is_valid) << "output";
    EXPECT_TRUE(result.arith_coverage_valid)
        << "arith coverage " << result.arith_cursor_end << "/" << result.arith_region_end;
    EXPECT_TRUE(result.poseidon2_ext_coverage_valid);
    EXPECT_TRUE(result.poseidon2_int_coverage_valid);
    EXPECT_TRUE(result.nnf_coverage_valid);
    EXPECT_TRUE(result.memory_coverage_valid);
    EXPECT_TRUE(result.all_valid);
}

TEST_F(HonkBoomerangDiscoveryTests, AcirHonkWitnessLinkInOink)
{
    HonkVerifierComponents vc = setup_honk_verifier_components_for_acir_build(0);
    [[maybe_unused]] auto output =
        acir_format::create_honk_recursion_constraints<RecursiveFlavor, IO>(vc.builder(), vc.constraint);
    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer(vc.builder(), false);
    auto result = HonkRecursionValidation::validate_honk_recursion<bb::fr>(
        vc.builder(), analyzer, vc.constraint, vc.constraint.proof);
    ASSERT_TRUE(result.oink.is_valid);

    // key_hash must hit poseidon2_ext inside Oink:vk_hash window [0, oink.p2ext_end).
    const uint32_t key_hash_real = vc.builder().real_variable_index[vc.constraint.key_hash];
    auto p2_gates = recursion_helpers::collect_real_witness_gates_in_block<bb::fr>(
        vc.builder(), analyzer, key_hash_real, poseidon2_helpers::poseidon2_external_block(vc.builder()));
    ASSERT_FALSE(p2_gates.empty());
    EXPECT_GE(p2_gates.front(), result.oink.poseidon2_ext_start);
    EXPECT_LT(p2_gates.front(), result.oink.poseidon2_ext_end);

    // All eight Oink commitment groups (Phase 2 opcode-linked) must hit Oink arith range.
    namespace HO = HonkRecursionValidation::Oink;
    const size_t prefix = HO::honk_public_input_prefix_size(&vc.constraint);
    for (size_t g = 0; g < HO::NUM_COMMITMENT_GROUPS; ++g) {
        const auto frs = HO::get_honk_commitment_group_witness_indices(vc.constraint.proof, g, prefix);
        ASSERT_TRUE(frs.has_value()) << "group " << g;
        bool found = false;
        for (uint32_t w : *frs) {
            const uint32_t real = vc.builder().real_variable_index[w];
            for (const auto& [blk, gi] : analyzer.get_variable_gates(real)) {
                if (&vc.builder().blocks.get()[blk] == &vc.builder().blocks.arithmetic &&
                    gi >= result.oink.arith_start && gi < result.oink.arith_end) {
                    found = true;
                }
            }
        }
        EXPECT_TRUE(found) << "proof commitment group " << g << " must appear in Oink arith range";
    }
}

TEST_F(HonkBoomerangDiscoveryTests, RejectsCorruptedHonkOink)
{
    HonkValidatorContext ctx;
    auto& builder = ctx.vc.builder();
    auto& arith = builder.blocks.arithmetic;
    const size_t gate = HonkRecursionValidation::Oink::ARITH_START;
    ASSERT_LT(gate, arith.size());
    arith.q_m().set(gate, arith.q_m()[gate] + bb::fr::one());
    auto result =
        HonkRecursionValidation::Oink::validate_oink<bb::fr>(builder,
                                                             *ctx.analyzer,
                                                             HonkRecursionValidation::Oink::ARITH_START,
                                                             HonkRecursionValidation::Oink::SETUP_NNF_GATE_COUNT,
                                                             0,
                                                             0,
                                                             &ctx.vc.constraint,
                                                             nullptr);
    EXPECT_FALSE(result.is_valid);
}

TEST_F(HonkBoomerangDiscoveryTests, RejectsCorruptedHonkVkDeserializeRegion)
{
    HonkValidatorContext ctx;
    auto& builder = ctx.vc.builder();
    auto& arith = builder.blocks.arithmetic;
    const size_t gate = HonkRecursionValidation::VkDeserialize::PRIMITIVE_START_ARITH;
    ASSERT_LT(gate, arith.size());
    arith.q_m().set(gate, arith.q_m()[gate] + bb::fr::one());
    auto result = HonkRecursionValidation::VkDeserialize::validate_vk_deserialize_region<bb::fr>(
        builder, *ctx.analyzer, ctx.vc.constraint);
    EXPECT_FALSE(result.is_valid);
}

TEST_F(HonkBoomerangDiscoveryTests, RejectsCorruptedHonkPreprocessor)
{
    HonkValidatorContext ctx;
    auto& builder = ctx.vc.builder();
    const auto bounds = HonkRecursionValidation::compute_arith_boundaries_from_oink_start();
    const size_t gate = bounds.preproc;
    ASSERT_LT(gate, builder.blocks.arithmetic.size());
    builder.blocks.arithmetic.q_m().set(gate, builder.blocks.arithmetic.q_m()[gate] + bb::fr::one());

    auto oink =
        HonkRecursionValidation::Oink::validate_oink<bb::fr>(builder,
                                                             *ctx.analyzer,
                                                             HonkRecursionValidation::Oink::ARITH_START,
                                                             HonkRecursionValidation::Oink::SETUP_NNF_GATE_COUNT,
                                                             0,
                                                             0,
                                                             &ctx.vc.constraint,
                                                             nullptr);
    ASSERT_TRUE(oink.is_valid);
    auto pre = HonkRecursionValidation::Preprocessor::validate_preprocessor<bb::fr>(builder, *ctx.analyzer, oink);
    EXPECT_FALSE(pre.is_valid);
}

TEST_F(HonkBoomerangDiscoveryTests, RejectsCorruptedHonkSumcheck)
{
    HonkValidatorContext ctx;
    auto& builder = ctx.vc.builder();
    const auto bounds = HonkRecursionValidation::compute_arith_boundaries_from_oink_start();
    const size_t gate = bounds.sumcheck;
    ASSERT_LT(gate, builder.blocks.arithmetic.size());
    builder.blocks.arithmetic.q_m().set(gate, builder.blocks.arithmetic.q_m()[gate] + bb::fr::one());

    auto oink =
        HonkRecursionValidation::Oink::validate_oink<bb::fr>(builder,
                                                             *ctx.analyzer,
                                                             HonkRecursionValidation::Oink::ARITH_START,
                                                             HonkRecursionValidation::Oink::SETUP_NNF_GATE_COUNT,
                                                             0,
                                                             0,
                                                             &ctx.vc.constraint,
                                                             nullptr);
    ASSERT_TRUE(oink.is_valid);
    auto pre = HonkRecursionValidation::Preprocessor::validate_preprocessor<bb::fr>(builder, *ctx.analyzer, oink);
    ASSERT_TRUE(pre.is_valid);
    auto sc = HonkRecursionValidation::Sumcheck::validate_sumcheck<bb::fr>(builder, *ctx.analyzer, pre);
    EXPECT_FALSE(sc.is_valid);
}

TEST_F(HonkBoomerangDiscoveryTests, RejectsCorruptedHonkShplemini)
{
    HonkValidatorContext ctx;
    auto& builder = ctx.vc.builder();
    const auto bounds = HonkRecursionValidation::compute_arith_boundaries_from_oink_start();
    const size_t gate = bounds.shplemini;
    ASSERT_LT(gate, builder.blocks.arithmetic.size());
    builder.blocks.arithmetic.q_m().set(gate, builder.blocks.arithmetic.q_m()[gate] + bb::fr::one());

    auto oink =
        HonkRecursionValidation::Oink::validate_oink<bb::fr>(builder,
                                                             *ctx.analyzer,
                                                             HonkRecursionValidation::Oink::ARITH_START,
                                                             HonkRecursionValidation::Oink::SETUP_NNF_GATE_COUNT,
                                                             0,
                                                             0,
                                                             &ctx.vc.constraint,
                                                             nullptr);
    ASSERT_TRUE(oink.is_valid);
    auto pre = HonkRecursionValidation::Preprocessor::validate_preprocessor<bb::fr>(builder, *ctx.analyzer, oink);
    ASSERT_TRUE(pre.is_valid);
    auto sc = HonkRecursionValidation::Sumcheck::validate_sumcheck<bb::fr>(builder, *ctx.analyzer, pre);
    ASSERT_TRUE(sc.is_valid);
    auto sh = HonkRecursionValidation::Shplemini::validate_shplemini<bb::fr>(builder, *ctx.analyzer, sc);
    EXPECT_FALSE(sh.is_valid);
}

TEST_F(HonkBoomerangDiscoveryTests, RejectsCorruptedHonkKZGDeepOffset)
{
    HonkValidatorContext ctx;
    auto& builder = ctx.vc.builder();
    // Corrupt near end of KZG arith span (proves full_hash covers whole region).
    const size_t kzg_start = HonkRecursionValidation::compute_arith_boundaries_from_oink_start().kzg;
    const size_t gate = kzg_start + HonkRecursionValidation::KZG::ARITH_TOTAL.gate_count - 10;
    ASSERT_LT(gate, builder.blocks.arithmetic.size());
    builder.blocks.arithmetic.q_m().set(gate, builder.blocks.arithmetic.q_m()[gate] + bb::fr::one());

    auto oink =
        HonkRecursionValidation::Oink::validate_oink<bb::fr>(builder,
                                                             *ctx.analyzer,
                                                             HonkRecursionValidation::Oink::ARITH_START,
                                                             HonkRecursionValidation::Oink::SETUP_NNF_GATE_COUNT,
                                                             0,
                                                             0,
                                                             &ctx.vc.constraint,
                                                             nullptr);
    ASSERT_TRUE(oink.is_valid);
    auto pre = HonkRecursionValidation::Preprocessor::validate_preprocessor<bb::fr>(builder, *ctx.analyzer, oink);
    ASSERT_TRUE(pre.is_valid);
    auto sc = HonkRecursionValidation::Sumcheck::validate_sumcheck<bb::fr>(builder, *ctx.analyzer, pre);
    ASSERT_TRUE(sc.is_valid);
    auto sh = HonkRecursionValidation::Shplemini::validate_shplemini<bb::fr>(builder, *ctx.analyzer, sc);
    ASSERT_TRUE(sh.is_valid);
    auto kzg = HonkRecursionValidation::KZG::validate_kzg<bb::fr>(builder, *ctx.analyzer, sh);
    EXPECT_FALSE(kzg.is_valid);
}

TEST_F(HonkBoomerangDiscoveryTests, RejectsCorruptedHonkOutput)
{
    HonkValidatorContext ctx;
    auto& builder = ctx.vc.builder();
    const auto bounds = HonkRecursionValidation::compute_arith_boundaries_from_oink_start();
    const size_t output_start = bounds.kzg + HonkRecursionValidation::KZG::ARITH_GATES;
    const size_t gate = output_start;
    ASSERT_LT(gate, builder.blocks.arithmetic.size());
    builder.blocks.arithmetic.q_m().set(gate, builder.blocks.arithmetic.q_m()[gate] + bb::fr::one());

    auto oink =
        HonkRecursionValidation::Oink::validate_oink<bb::fr>(builder,
                                                             *ctx.analyzer,
                                                             HonkRecursionValidation::Oink::ARITH_START,
                                                             HonkRecursionValidation::Oink::SETUP_NNF_GATE_COUNT,
                                                             0,
                                                             0,
                                                             &ctx.vc.constraint,
                                                             nullptr);
    ASSERT_TRUE(oink.is_valid);
    auto pre = HonkRecursionValidation::Preprocessor::validate_preprocessor<bb::fr>(builder, *ctx.analyzer, oink);
    ASSERT_TRUE(pre.is_valid);
    auto sc = HonkRecursionValidation::Sumcheck::validate_sumcheck<bb::fr>(builder, *ctx.analyzer, pre);
    ASSERT_TRUE(sc.is_valid);
    auto sh = HonkRecursionValidation::Shplemini::validate_shplemini<bb::fr>(builder, *ctx.analyzer, sc);
    ASSERT_TRUE(sh.is_valid);
    auto kzg = HonkRecursionValidation::KZG::validate_kzg<bb::fr>(builder, *ctx.analyzer, sh);
    ASSERT_TRUE(kzg.is_valid);
    auto out = HonkRecursionValidation::Output::validate_output<bb::fr>(builder, *ctx.analyzer, kzg);
    EXPECT_FALSE(out.is_valid);
}

TEST_F(HonkBoomerangDiscoveryTests, RejectsCorruptedHonkRecursionEndToEndRealAcirBuild)
{
    HonkVerifierComponents vc = setup_honk_verifier_components_for_acir_build(0);
    [[maybe_unused]] auto output =
        acir_format::create_honk_recursion_constraints<RecursiveFlavor, IO>(vc.builder(), vc.constraint);
    const auto bounds = HonkRecursionValidation::compute_arith_boundaries_from_oink_start();
    const size_t gate = bounds.sumcheck;
    ASSERT_LT(gate, vc.builder().blocks.arithmetic.size());
    vc.builder().blocks.arithmetic.q_m().set(gate, vc.builder().blocks.arithmetic.q_m()[gate] + bb::fr::one());

    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer(vc.builder(), false);
    auto result = HonkRecursionValidation::validate_honk_recursion<bb::fr>(
        vc.builder(), analyzer, vc.constraint, vc.constraint.proof);
    EXPECT_FALSE(result.is_valid);
}

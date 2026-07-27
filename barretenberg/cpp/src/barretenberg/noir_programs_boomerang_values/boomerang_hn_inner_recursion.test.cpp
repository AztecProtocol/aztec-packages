// HN::INNER kernel — boomerang discovery and validation tests (2× HN, 180 squeezes).

#include "barretenberg/boomerang_value_detection/graph_description_acir.hpp"
#include "barretenberg/noir_programs_boomerang_values/HNInnerValidation.hpp"
#include "barretenberg/noir_programs_boomerang_values/boomerang_hn_recursion_test_helpers.hpp"

#include <fstream>
#include <gtest/gtest.h>

using namespace bb;
using namespace hn_recursion_test;

class HNInnerRecursionTestSuite : public BoomerangHNRecursionTests {};

// Corrupt the first non-fix-witness arithmetic gate in [start, start+span) by bumping its q_c
// selector (changes the selector-hash fingerprint of whatever validated window contains it).
// Returns the corrupted gate index, or SIZE_MAX if none found.
static size_t corrupt_arith_selector_in_range(HNBuilder& builder, size_t start, size_t span)
{
    auto& arith = builder.blocks.arithmetic;
    for (size_t g = start; g < start + span && g < arith.size(); ++g) {
        if (!recursion_helpers::is_fix_witness_gate(builder, g)) {
            arith.q_c().set(g, arith.q_c()[g] + bb::fr(7));
            return g;
        }
    }
    return SIZE_MAX;
}

#define EXPECT_FP_MATCH(label, expected, actual)                                                                       \
    do {                                                                                                               \
        SCOPED_TRACE(label);                                                                                           \
        EXPECT_EQ((expected).gate_count, (actual).gate_count) << label << " gate_count";                               \
        EXPECT_EQ((expected).prefix_hash, (actual).prefix_hash) << label << " prefix_hash";                            \
        EXPECT_EQ((expected).full_hash, (actual).full_hash) << label << " full_hash";                                  \
    } while (0)

/**
 * @brief INNER kernel built from real ACIR: MegaStaticAnalyzerAcir reports zero incorrect opcodes.
 */
TEST_F(HNInnerRecursionTestSuite, AcirHNInnerFingerprintsMatchConstants)
{
    BB_DISABLE_ASSERTS();

    auto setup = make_hn_inner_acir_setup();
    HNBuilder builder = build_hn_circuit_from_acir(setup);
    AcirFormat constraint_system_copy = setup.program.constraints;

    cdg::MegaStaticAnalyzerAcir analyzer(std::move(constraint_system_copy), std::move(builder));
    EXPECT_TRUE(analyzer.get_incorrect_opcodes().empty());
}

// Dispatch (graph_description_acir.cpp process_hn_recursion_constraint) tells INNER apart from
// RESET structurally (2 vs 1 PROOF_TYPE::HN entries in hn_recursion_constraints), then assigns
// loop0/loop1 by each constraint's own position in that array — the real ACIR verification-queue
// order, not a squeeze-gate-count heuristic. Position alone is not blindly trusted, though: loop0's
// C2 witness link (validate_c0_key_hash_link) and loop1's micro-Oink vk_hash search both tie the
// *content* of whichever constraint gets assigned to them back to the gates actually being
// validated. This test proves that corroboration is load-bearing: same circuit gates, but with the
// two ACIR constraint entries (and matching original_opcode_indices) physically swapped in the
// array, each loop is now handed the *other* opcode's key/key_hash — content that does not match
// the gates it is checked against — and the analyzer must reject it.
// (Content-based vk_hash-anchor disambiguation was tried as a *replacement* for array order and
// found unsound on its own — see comment at the INNER dispatch call site for why.)
TEST_F(HNInnerRecursionTestSuite, AcirHNInnerDispatchDetectsSwappedArrayOrder)
{
    BB_DISABLE_ASSERTS();

    auto setup = make_hn_inner_acir_setup();
    HNBuilder builder = build_hn_circuit_from_acir(setup);
    AcirFormat constraint_system_copy = setup.program.constraints;

    std::swap(constraint_system_copy.hn_recursion_constraints[0], constraint_system_copy.hn_recursion_constraints[1]);
    std::swap(constraint_system_copy.original_opcode_indices.hn_recursion_constraints[0],
              constraint_system_copy.original_opcode_indices.hn_recursion_constraints[1]);

    cdg::MegaStaticAnalyzerAcir analyzer(std::move(constraint_system_copy), std::move(builder));
    EXPECT_FALSE(analyzer.get_incorrect_opcodes().empty());
}

// Stage 3.2 step 1 discovery: dump the full squeeze map (no length assertion) so the actual
// current squeeze layout can be read off directly, rather than assumed from stale constants.
// HN_INNER_TOTAL_SQUEEZES/HN_INNER_LOOP_SIZE are frozen at pre-Stage-4 values (180/90); this test
// exists to measure what the circuit actually produces today.
TEST_F(HNInnerRecursionTestSuite, HNInnerSqueezeMapDump)
{
    BB_DISABLE_ASSERTS();
    HNBuilder builder = build_inner_kernel_circuit();
    const auto sq = recursion_helpers::find_all_transcript_squeeze_gates(builder);

    std::ofstream out("hn_inner_squeeze_map.txt");
    ASSERT_TRUE(out.is_open());
    out << "# total squeezes=" << sq.size() << "\n";
    out << "# arithmetic block size=" << builder.blocks.arithmetic.size() << "\n\n";
    for (size_t i = 0; i < sq.size(); ++i) {
        out << "sq[" << i << "]=" << sq[i];
        if (i > 0) {
            out << "  gap_from_prev=" << (sq[i] - sq[i - 1]);
        }
        out << "\n";
    }
    info("HN INNER squeeze map (", sq.size(), " squeezes) written to hn_inner_squeeze_map.txt");
    SUCCEED();
}

// Stage 3.2 step 1 discovery: from HNInnerSqueezeMapDump's raw squeeze map (175 total, not the
// stale 180), the canonical RESET-shaped windows (Oink/main-SC/batching/MLB/claim_batching) match
// loop0 exactly at sq[0..86] (87 squeezes, unchanged shared HN_SQUEEZE_* constants). What follows
// claim_batching is new/changed: loop0's post-claim tail collapsed from the old 12-squeeze model to
// a SINGLE squeeze (sq[87]), then a much-shrunk bridge (sq[87]->sq[88], 32 gates not 77), then
// loop1's own micro-Oink (vk_hash + commitment chain, ending at its own eta sq[88]) -> beta(sq[89],
// gap98, already correctly aliased to HNInitValidation::OINK_BETA_TO_ALPHA_ARITH) -> alpha/gate_challenge
// (sq[90], gap20) -> main_sc (24 rounds, sq[91..114], NOT the stale LOOP1_MAIN_SC_ROUNDS=21) ->
// batching (33, sq[115..147]) -> MLB (24, sq[148..172]) -> claim_batching (sq[173]) -> loop1's own
// single-squeeze post-claim tail (sq[174], the last squeeze). This dump pins the exact fingerprints
// for every NEW/changed window (loop0 post-claim tail, bridge, loop1 vk_hash + commitment chain,
// loop1 post-claim tail) so HNInnerValidation.hpp can be rebuilt against them, per Stage 3.2 step 1.
// Cursor-chain re-derivation (hn_cursor_chaining_plan.md, applied to INNER after the RESET pilot).
// The old 175-squeeze model (loop0 sq[0..87], bridge, loop1 sq[88..174]) is void for the same reason
// RESET's was: most FS challenges are `fr`-typed post-merge (zero gates), so the squeeze detector
// only resolves the batching-phase `fq` challenges. Actual total is 64, not 175. This dumps every
// soft-squeeze-delimited window across the whole circuit (mirrors AcirHNResetCursorChainDump) so the
// real structure -- including whether loop1's batching-shaped window count genuinely differs from
// loop0's 33 -- is measured, not assumed.
TEST_F(HNInnerRecursionTestSuite, HNInnerBoundaryWindowsDump)
{
    BB_DISABLE_ASSERTS();
    const auto setup = make_hn_inner_acir_setup();
    HNBuilder builder = build_hn_circuit_from_acir(setup);
    HNAnalyzer analyzer(builder, false);

    const auto sq = recursion_helpers::find_all_transcript_squeeze_gates(builder);
    auto& arith = builder.blocks.arithmetic;

    std::ofstream out("hn_inner_boundary_windows_analysis.txt");
    ASSERT_TRUE(out.is_open());
    out << "# total soft squeezes=" << sq.size() << " arith_block_size=" << arith.size() << "\n\n";

    const auto dump = [&](const char* name, size_t ws, size_t we) {
        const auto arith_fp = hn_compute_fingerprint(builder, HN_BLOCK_ARITHMETIC, ws, we);
        out << name << " arith[" << ws << "," << we << ") gate_count=" << arith_fp.gate_count << " prefix=0x"
            << std::hex << arith_fp.prefix_hash << " full=0x" << arith_fp.full_hash << std::dec << "\n";
    };

    // Every soft-squeeze-delimited window in order: [0,sq[0]+1), (sq[i]+1,sq[i+1]+1), (sq.back()+1,end).
    std::vector<size_t> bounds;
    bounds.push_back(0);
    for (size_t s : sq) {
        bounds.push_back(s + 1);
    }
    bounds.push_back(arith.size());
    std::sort(bounds.begin(), bounds.end());
    bounds.erase(std::unique(bounds.begin(), bounds.end()), bounds.end());

    for (size_t i = 0; i + 1 < bounds.size(); ++i) {
        const std::string name = "WIN_" + std::to_string(i);
        dump(name.c_str(), bounds[i], bounds[i + 1]);
    }

    // Targeted sub-boundary checks inside WIN_35 [4649,7096): hypothesis is loop0's own MLB+tail
    // (matches RESET_MLB_AND_TAIL_LIVE_ARITH exactly) + BRIDGE (old-model 32 gates) + loop1's own
    // live prefix (remainder). Verify each hypothesized cut point directly instead of inferring.
    out << "\n# Targeted sub-boundary probes inside WIN_35:\n";
    dump("PROBE_LOOP0_MLB_AND_TAIL", 4649, 4649 + 875);
    dump("PROBE_BRIDGE_32", 4649 + 875, 4649 + 875 + 32);
    dump("PROBE_LOOP1_LIVE_PREFIX_REMAINDER", 4649 + 875 + 32, 7096);
    out << "# RESET_MLB_AND_TAIL_LIVE_ARITH = {875, 0x759410a0cce32760, 0xa309021ba960130c, 20}\n";
    out << "# old BRIDGE_ARITH = {32, 0x1e092eca9c65aadc, 0x6f5b7beb662fb358, 20}\n";

    // Loop1 vk_hash (INIT-style micro-Oink anchor) — C1_VK_HASH_PROFILE aliases INIT's own vk_hash
    // constants (HNInitValidation::INIT_VK_HASH_*), which are separately stale pending INIT's own
    // cursor-chain roll (not yet done) -- best-effort only, does not gate the probes above.
    const auto vk_hash = HNVerification::HNOinkValidation::validate_vk_hash_anchor<bb::fr>(
        builder, analyzer, setup.hn_constraint(1), HNVerification::HNInnerValidation::C1_VK_HASH_PROFILE);
    out << "\nLOOP1_VK_HASH valid=" << vk_hash.valid;
    if (vk_hash.valid) {
        out << " poseidon2=[" << vk_hash.poseidon2_ext_start << "," << vk_hash.poseidon2_ext_end << ")";
    }
    out << " (C1_VK_HASH_PROFILE aliases INIT's stale vk_hash constants -- expected to fail until INIT rolls)\n";

    // Follow-up probes (round 2): split loop0's MLB+tail at RESET's own 823/52 boundary; check loop1's
    // known 109-gate pre-eta fingerprint right after the bridge; characterize the final 68-gate tail.
    out << "\n# Follow-up probes:\n";
    dump("PROBE_LOOP0_MLB_AND_CLAIM_BATCHING_823", 4649, 4649 + 823);
    dump("PROBE_LOOP0_POST_MLB_TAIL_52", 4649 + 823, 4649 + 875);
    out << "# RESET_MLB_AND_CLAIM_BATCHING_ARITH = {823, 0x759410a0cce32760, 0x4d0fde50f9777bfa, 20}\n";
    out << "# RESET_ONLY_POST_MLB_TAIL_ARITH = {52, 0xa44b2f3fcc6aa714, 0xba3a3a5f3c682134, 20}\n";
    dump("PROBE_LOOP1_PRE_ETA_109", 5556, 5556 + 109);
    out << "# LOOP1_PRE_ETA_ARITH = {109, 0xadb4a58bfc92dcab, 0x3d1e3b76dc6b88e9, 20}\n";
    dump("PROBE_LOOP1_OINK_MAINSC_LIVE_1431", 5665, 7096);
    dump("PROBE_FINAL_TAIL_68", 8521, 8589);

    // Poseidon2 side: total coverage requires loop0's own tail [1576, loop1_vk_hash_start) and loop1's
    // own tail [loop1_vk_hash_end, poseidon2.size()) -- both coarse combined spans, same granularity
    // RESET itself uses for RESET_POSEIDON2_TAIL (one monolithic fingerprint, no per-round attribution
    // without a full sumcheck.hpp production trace).
    auto& poseidon2 = builder.blocks.poseidon2;
    out << "\n# Poseidon2 side (total size=" << poseidon2.size() << "):\n";
    const auto dump_p2 = [&](const char* name, size_t ws, size_t we) {
        const auto fp = hn_compute_fingerprint(builder, HN_BLOCK_POSEIDON2_EXT, ws, we);
        out << name << " poseidon2[" << ws << "," << we << ") gate_count=" << fp.gate_count << " prefix=0x" << std::hex
            << fp.prefix_hash << " full=0x" << fp.full_hash << std::dec << "\n";
    };
    dump_p2("PROBE_LOOP0_POSEIDON2_TAIL", 1576, vk_hash.poseidon2_ext_start);
    dump_p2("PROBE_LOOP1_POSEIDON2_TAIL", vk_hash.poseidon2_ext_end, poseidon2.size());

    info("HN INNER boundary windows analysis written to hn_inner_boundary_windows_analysis.txt");
    SUCCEED();
}

// Phase 2 (cursor-chain re-derivation): witness-anchored primitive_start per loop, squeeze-independent.
// loop0 and loop1 both call validate_vk_hash_anchor with the SAME C1_VK_HASH_PROFILE (poseidon-only,
// arith.gate_count==0). Checks whether the two anchors land at different poseidon2 positions (real
// discrimination) and whether validate_c0_key_hash_link's arith_start-based bound check
// (HNInnerValidation.hpp:510-511) still discriminates now that arith_start is unconditionally 0 for a
// poseidon-only profile -- this predates the second merge but was never empirically re-checked because
// every test exercising it also asserted the now-broken sq.size()==175 first.
TEST_F(HNInnerRecursionTestSuite, AcirHNInnerLoop0Loop1VkHashAnchorPositions)
{
    BB_DISABLE_ASSERTS();
    const auto setup = make_hn_inner_acir_setup();
    HNBuilder builder = build_hn_circuit_from_acir(setup);
    HNAnalyzer analyzer(builder, false);

    namespace INNER = HNVerification::HNInnerValidation;

    const auto anchor0 = HNVerification::HNOinkValidation::validate_vk_hash_anchor<bb::fr>(
        builder, analyzer, setup.hn_constraint(0), INNER::C1_VK_HASH_PROFILE);
    const auto anchor1 = HNVerification::HNOinkValidation::validate_vk_hash_anchor<bb::fr>(
        builder, analyzer, setup.hn_constraint(1), INNER::C1_VK_HASH_PROFILE);

    info("loop0 vk_hash anchor: valid=",
         anchor0.valid,
         " arith=[",
         anchor0.arith_start,
         ",",
         anchor0.arith_end,
         ") poseidon2=[",
         anchor0.poseidon2_ext_start,
         ",",
         anchor0.poseidon2_ext_end,
         ")");
    info("loop1 vk_hash anchor: valid=",
         anchor1.valid,
         " arith=[",
         anchor1.arith_start,
         ",",
         anchor1.arith_end,
         ") poseidon2=[",
         anchor1.poseidon2_ext_start,
         ",",
         anchor1.poseidon2_ext_end,
         ")");

    EXPECT_TRUE(anchor0.valid);
    EXPECT_TRUE(anchor1.valid);
    // Real discrimination signal: the two anchors must land at different poseidon2 positions.
    EXPECT_NE(anchor0.poseidon2_ext_start, anchor1.poseidon2_ext_start);
    // arith_start is 0 for both (poseidon-only profile) -- report whether this makes the
    // arith_start-based bound check in validate_c0_key_hash_link vacuous.
    info("anchor0.arith_start=",
         anchor0.arith_start,
         " anchor1.arith_start=",
         anchor1.arith_start,
         " (equal ⇒ validate_c0_key_hash_link's bound check cannot discriminate on arith_start alone)");

    // Direct call to validate_c0_key_hash_link with a placeholder sq covering enough entries for the
    // HN_SQUEEZE_OINK_ALPHA index read -- does NOT depend on total squeeze count matching 175.
    const auto sq = recursion_helpers::find_all_transcript_squeeze_gates(builder);
    ASSERT_GT(sq.size(), HNVerification::HN_SQUEEZE_OINK_ALPHA);
    const bool link0 = INNER::validate_c0_key_hash_link<bb::fr>(builder, analyzer, setup.hn_constraint(0), sq);
    const bool link1 = INNER::validate_c0_key_hash_link<bb::fr>(builder, analyzer, setup.hn_constraint(1), sq);
    info("validate_c0_key_hash_link: constraint(0)=",
         link0,
         " constraint(1)=",
         link1,
         " (both true ⇒ confirmed vacuous, not discriminating)");
}

// Phase 3 discovery: characterize loop0's MLB+claim_batching divergence from a standalone RESET
// circuit, per-gate, using the same technique as AcirHNFinalMLBTailDivergenceDiscovery. Phase 2 found
// the arith[4649,5472) span has the same prefix hash as RESET's but a different full hash -- find the
// exact gate where content starts to differ so the shared prefix (if any) can still be pinned as an
// alias and only the genuine tail re-derived, instead of re-deriving all 823 gates from scratch.
TEST_F(HNInnerRecursionTestSuite, AcirHNInnerLoop0MLBDivergenceDiscovery)
{
    BB_DISABLE_ASSERTS();

    HNBuilder reset_builder = build_hn_kernel_circuit(PROOF_TYPE::HN);
    const auto setup = make_hn_inner_acir_setup();
    HNBuilder inner_builder = build_hn_circuit_from_acir(setup);

    const size_t cursor = 4649; // loop0's own MLB+claim_batching start, per Phase 1/2 measurement.
    auto& reset_arith = reset_builder.blocks.arithmetic;
    auto& inner_arith = inner_builder.blocks.arithmetic;
    ASSERT_LT(cursor, reset_arith.size());
    ASSERT_LT(cursor, inner_arith.size());

    const size_t span = HNVerification::RESET_MLB_AND_CLAIM_BATCHING_ARITH.gate_count; // 823
    const size_t max_walk = std::min(span, std::min(reset_arith.size(), inner_arith.size()) - cursor);
    size_t divergence = max_walk;
    for (size_t i = 0; i < max_walk; ++i) {
        const auto reset_gate_fp =
            hn_compute_fingerprint(reset_builder, HN_BLOCK_ARITHMETIC, cursor + i, cursor + i + 1);
        const auto inner_gate_fp =
            hn_compute_fingerprint(inner_builder, HN_BLOCK_ARITHMETIC, cursor + i, cursor + i + 1);
        if (reset_gate_fp.full_hash != inner_gate_fp.full_hash) {
            divergence = i;
            break;
        }
    }

    std::ofstream out("hn_inner_loop0_mlb_divergence.txt");
    ASSERT_TRUE(out.is_open());
    out << "# RESET vs INNER-loop0 per-gate selector-hash walk from cursor=" << cursor << " (MLB+claim_batching)\n";
    out << "cursor=" << cursor << " span=" << span << "\n";
    out << "shared_prefix_gate_count=" << divergence << " (0-based offset from cursor where content diverges)\n";
    out << "divergence_absolute_gate=" << (cursor + divergence) << "\n";

    info("loop0 MLB divergence: shared_prefix=",
         divergence,
         "/",
         span,
         " divergence_absolute_gate=",
         cursor + divergence);
    SUCCEED();
}

// N-app (hn_count>2) boundary discovery is deferred this session (cursor-chain re-derivation covers
// hn_count==2 only -- see HNInnerValidation.hpp file-header scope note). The old squeeze-index-based
// discovery helpers here (`discover_inner_entry_boundaries`, `run_inner_n_app_boundary_discovery`,
// `HNInnerK2/K3AppsBoundaryDiscovery`) were built on the now-void squeeze model at their foundation
// (not just a stale constant: `HN_INNER_LOOP0_SQUEEZES`-based slicing assumes squeeze counts that no
// longer exist) and are deleted rather than patched. Resuming N>2 work should start with a fresh
// soft-squeeze-window dump (the `HNInnerBoundaryWindowsDump` pattern) against an N-app fixture, not a
// revival of this scanner.

/**
 * @brief validate_hn_inner passes end-to-end on a real ACIR-built INNER kernel: both loops, the
 * inter-loop bridge, and both opcodes' key_hash witness links, with full arith/poseidon2 coverage.
 */
TEST_F(HNInnerRecursionTestSuite, ValidateHNInnerKernel)
{
    BB_DISABLE_ASSERTS();
    const auto setup = make_hn_inner_acir_setup();
    HNBuilder builder = build_hn_circuit_from_acir(setup);

    auto result = HNVerification::validate_hn_inner(builder, setup.hn_constraint(0), setup.hn_constraint(1));

    EXPECT_TRUE(result.all_valid);
    EXPECT_TRUE(result.loops[0].all_valid);
    EXPECT_TRUE(result.loops[1].all_valid);
    EXPECT_TRUE(result.bridges[0].valid);
    // Total coverage is the cursor-chain PASS criterion (hn_cursor_chaining_plan.md).
    EXPECT_TRUE(result.loops[0].arith_coverage_valid);
    EXPECT_TRUE(result.loops[0].poseidon2_coverage_valid);
    EXPECT_TRUE(result.loops[1].arith_coverage_valid);
    EXPECT_TRUE(result.loops[1].poseidon2_coverage_valid);
    EXPECT_EQ(result.loops[1].arith_cursor_end, builder.blocks.arithmetic.size());
    EXPECT_EQ(result.loops[1].poseidon2_cursor_end, builder.blocks.poseidon2.size());
    // C2: both opcodes' key_hash witnesses are linked to their vk_hash regions.
    EXPECT_TRUE(result.loops[0].key_hash_linked);
    EXPECT_TRUE(result.loops[1].key_hash_linked);
}

// HNInnerC1OinkMicroFingerprintMatch, HNInnerC0VkHashAnchor, and AcirHNInnerC0KeyHashGateDiscovery
// (squeeze-model dumps/anchors for loop1 micro-Oink and loop0's key_hash link) are superseded by
// AcirHNInnerLoop0Loop1VkHashAnchorPositions (Phase 2), which proves both anchors witness-link and
// resolve to distinct positions on the real cursor-chain circuit, without any squeeze-count
// assumption.

/**
 * @brief validate_hn_inner accepts matching IVC queue entries + expected VK snapshots for both
 * loop0 (previous kernel) and loop1 (new app).
 */
TEST_F(HNInnerRecursionTestSuite, ValidateHNInnerIvQueueConsistency)
{
    BB_DISABLE_ASSERTS();

    const auto setup = make_hn_inner_acir_setup();
    HNBuilder builder = build_hn_circuit_from_acir(setup);
    HNAnalyzer analyzer(builder, false);

    const Chonk::VerifierInputs queue0{
        {},
        nullptr,
        nullptr,
        setup.queue_snapshots[0].kind,
    };
    const Chonk::VerifierInputs queue1{
        {},
        nullptr,
        nullptr,
        setup.queue_snapshots[1].kind,
    };

    const HNVerification::HNInnerValidation::IvQueueExpectedVk expected_vk0{
        .fields = setup.expected_vk_fields_all[0],
        .hash = setup.expected_vk_hashes[0],
    };
    const HNVerification::HNInnerValidation::IvQueueExpectedVk expected_vk1{
        .fields = setup.expected_vk_fields_all[1],
        .hash = setup.expected_vk_hashes[1],
    };

    auto result = HNVerification::validate_hn_inner<bb::fr>(
        builder, analyzer, setup.hn_constraint(0), setup.hn_constraint(1), queue0, queue1, expected_vk0, expected_vk1);
    EXPECT_TRUE(result.all_valid);
    EXPECT_TRUE(result.iv_queues[0].valid);
    EXPECT_TRUE(result.iv_queues[1].valid);
}

/**
 * @brief INNER kernel: corrupting a gate in loop1's Oink+MainSC live span fails validate_hn_inner.
 */
TEST_F(HNInnerRecursionTestSuite, ValidateHNInnerDetectsCorruption)
{
    BB_DISABLE_ASSERTS();
    const auto setup = make_hn_inner_acir_setup();
    HNBuilder builder = build_hn_circuit_from_acir(setup);
    namespace INNER = HNVerification::HNInnerValidation;

    ASSERT_NE(corrupt_arith_selector_in_range(builder, INNER::INNER_BRIDGE_ARITH_END, 200), SIZE_MAX);

    auto result = HNVerification::validate_hn_inner(builder, setup.hn_constraint(0), setup.hn_constraint(1));
    EXPECT_FALSE(result.all_valid);
}

// C3 per-branch corruption tests. validate_hn_inner is fail-fast but populates the reached
// sub-result; each test asserts the SPECIFIC sub-flag flips, not just top-level all_valid. Gate
// offsets are derived from the pinned cursor-chain constants (HNInnerValidation.hpp), not squeeze
// indices (hn_cursor_chaining_plan.md) -- each named region below is real, measured this session.

// loop0 (C0) Oink+MainSC live span — corrupt near the start of [0, 2602).
TEST_F(HNInnerRecursionTestSuite, ValidateHNInnerDetectsLoop0OinkCorruption)
{
    BB_DISABLE_ASSERTS();
    const auto setup = make_hn_inner_acir_setup();
    HNBuilder builder = build_hn_circuit_from_acir(setup);

    ASSERT_NE(corrupt_arith_selector_in_range(builder, 0, 20), SIZE_MAX);

    auto result = HNVerification::validate_hn_inner(builder, setup.hn_constraint(0), setup.hn_constraint(1));
    EXPECT_FALSE(result.loops[0].oink.valid);
    EXPECT_FALSE(result.loops[0].all_valid);
    EXPECT_FALSE(result.all_valid);
}

// loop0 (C0) post-MLB tail — corrupt INNER_LOOP0_POST_MLB_TAIL_ARITH's window.
TEST_F(HNInnerRecursionTestSuite, ValidateHNInnerDetectsLoop0PostMLBCorruption)
{
    BB_DISABLE_ASSERTS();
    const auto setup = make_hn_inner_acir_setup();
    HNBuilder builder = build_hn_circuit_from_acir(setup);
    namespace INNER = HNVerification::HNInnerValidation;

    const size_t ws = INNER::INNER_LOOP0_ARITH_END - INNER::INNER_LOOP0_POST_MLB_TAIL_ARITH.gate_count;
    ASSERT_NE(corrupt_arith_selector_in_range(builder, ws, INNER::INNER_LOOP0_POST_MLB_TAIL_ARITH.gate_count),
              SIZE_MAX);

    auto result = HNVerification::validate_hn_inner(builder, setup.hn_constraint(0), setup.hn_constraint(1));
    EXPECT_TRUE(result.loops[0].oink.valid); // additive: oink untouched
    EXPECT_TRUE(result.loops[0].mlb.valid);  // additive: MLB+claim_batching untouched
    EXPECT_FALSE(result.loops[0].post_mlb.valid);
    EXPECT_FALSE(result.loops[0].all_valid);
    EXPECT_FALSE(result.all_valid);
}

// inter-loop bridge (32 gates) — corrupt the whole window.
TEST_F(HNInnerRecursionTestSuite, ValidateHNInnerDetectsBridgeCorruption)
{
    BB_DISABLE_ASSERTS();
    const auto setup = make_hn_inner_acir_setup();
    HNBuilder builder = build_hn_circuit_from_acir(setup);
    namespace INNER = HNVerification::HNInnerValidation;

    ASSERT_NE(
        corrupt_arith_selector_in_range(builder, INNER::INNER_LOOP0_ARITH_END, INNER::INNER_BRIDGE_ARITH.gate_count),
        SIZE_MAX);

    auto result = HNVerification::validate_hn_inner(builder, setup.hn_constraint(0), setup.hn_constraint(1));
    EXPECT_TRUE(result.loops[0].all_valid); // additive: loop0 untouched
    EXPECT_FALSE(result.bridges[0].valid);
    EXPECT_FALSE(result.all_valid);
}

// loop1 (C1) pre-eta / micro-Oink commitment chain — corrupt INNER_LOOP1_PRE_ETA_ARITH_V2's window.
TEST_F(HNInnerRecursionTestSuite, ValidateHNInnerDetectsLoop1MicroOinkCorruption)
{
    BB_DISABLE_ASSERTS();
    const auto setup = make_hn_inner_acir_setup();
    HNBuilder builder = build_hn_circuit_from_acir(setup);
    namespace INNER = HNVerification::HNInnerValidation;

    ASSERT_NE(corrupt_arith_selector_in_range(
                  builder, INNER::INNER_BRIDGE_ARITH_END, INNER::INNER_LOOP1_PRE_ETA_ARITH_V2.gate_count),
              SIZE_MAX);

    auto result = HNVerification::validate_hn_inner(builder, setup.hn_constraint(0), setup.hn_constraint(1));
    EXPECT_TRUE(result.loops[0].all_valid);
    EXPECT_TRUE(result.bridges[0].valid);
    EXPECT_FALSE(result.loops[1].micro_oink.commitment_chain_valid);
    EXPECT_FALSE(result.loops[1].all_valid);
    EXPECT_FALSE(result.all_valid);
}

// loop1 (C1) final tail — corrupt INNER_FINAL_TAIL_ARITH's window (very end of the circuit).
TEST_F(HNInnerRecursionTestSuite, ValidateHNInnerDetectsLoop1PostMLBCorruption)
{
    BB_DISABLE_ASSERTS();
    const auto setup = make_hn_inner_acir_setup();
    HNBuilder builder = build_hn_circuit_from_acir(setup);
    namespace INNER = HNVerification::HNInnerValidation;

    ASSERT_NE(corrupt_arith_selector_in_range(
                  builder, INNER::INNER_LOOP1_ARITH_END, INNER::INNER_FINAL_TAIL_ARITH.gate_count),
              SIZE_MAX);

    auto result = HNVerification::validate_hn_inner(builder, setup.hn_constraint(0), setup.hn_constraint(1));
    EXPECT_TRUE(result.loops[1].micro_oink.valid); // additive: micro-Oink untouched
    EXPECT_TRUE(result.loops[1].mlb.valid);        // additive: loop1 MLB+tail untouched
    EXPECT_FALSE(result.loops[1].post_mlb.valid);
    EXPECT_FALSE(result.loops[1].all_valid);
    EXPECT_FALSE(result.all_valid);
}

// loop1 (C1) MLB+tail region — corrupt near the end of INNER_LOOP1_MLB_AND_TAIL_ARITH, immediately
// before the seam into the final tail, proving the chain fingerprints right up to that boundary
// with no unfingerprinted gap (mirrors the round-3 seam regression this test replaces).
TEST_F(HNInnerRecursionTestSuite, ValidateHNInnerDetectsLoop1MLBTailSeamCorruption)
{
    BB_DISABLE_ASSERTS();
    const auto setup = make_hn_inner_acir_setup();
    HNBuilder builder = build_hn_circuit_from_acir(setup);
    namespace INNER = HNVerification::HNInnerValidation;

    const size_t ws = INNER::INNER_LOOP1_ARITH_END - INNER::INNER_LOOP1_MLB_AND_TAIL_ARITH.gate_count;
    ASSERT_NE(corrupt_arith_selector_in_range(builder, ws, INNER::INNER_LOOP1_MLB_AND_TAIL_ARITH.gate_count), SIZE_MAX);

    auto result = HNVerification::validate_hn_inner(builder, setup.hn_constraint(0), setup.hn_constraint(1));
    EXPECT_TRUE(result.loops[1].micro_oink.valid); // additive: micro-Oink untouched
    EXPECT_FALSE(result.loops[1].mlb.valid);
    EXPECT_FALSE(result.loops[1].all_valid);
    EXPECT_FALSE(result.all_valid);
}

// ValidateHNInnerC0KeyHashLinkDiscriminates asserted validate_c0_key_hash_link discriminates loop0
// from loop1 via an arith_start bound check. Phase 2 (AcirHNInnerLoop0Loop1VkHashAnchorPositions)
// empirically disproved this: arith_start is unconditionally 0 for the poseidon-only profile, so the
// old check returns true for BOTH constraints -- confirmed vacuous, not a discriminator. Deleted
// rather than fixed in place: the new validators discriminate for real, by construction (a wrong
// constraint's key_hash resolves to a different poseidon2 position, and the loop-specific fingerprint
// chain then fails to match there) -- see validate_inner_loop0's doc comment.

// C3: per-field corruption of validate_iv_queue_consistency. One circuit build; each case mutates
// only the queue metadata / expected-VK snapshot (not the circuit) and asserts the SPECIFIC
// IvQueueValidationResult sub-flag flips. proof_empty/public_inputs_empty are construction-
// guaranteed (constraint.proof/public_inputs always empty for HN) — asserted true, not corruptible.
TEST_F(HNInnerRecursionTestSuite, ValidateHNInnerDetectsIvQueueCorruption)
{
    BB_DISABLE_ASSERTS();
    const auto setup = make_hn_inner_acir_setup();
    HNBuilder builder = build_hn_circuit_from_acir(setup);
    HNAnalyzer analyzer(builder, false);

    namespace INNER = HNVerification::HNInnerValidation;
    const auto make_queue = [](Chonk::CircuitKind kind) { return Chonk::VerifierInputs{ {}, nullptr, nullptr, kind }; };
    const Chonk::VerifierInputs queue0 = make_queue(setup.queue_snapshots[0].kind);
    const Chonk::VerifierInputs queue1 = make_queue(setup.queue_snapshots[1].kind);
    const INNER::IvQueueExpectedVk vk0{ .fields = setup.expected_vk_fields_all[0],
                                        .hash = setup.expected_vk_hashes[0] };
    const INNER::IvQueueExpectedVk vk1{ .fields = setup.expected_vk_fields_all[1],
                                        .hash = setup.expected_vk_hashes[1] };

    // Honest baseline: structural (non-corruptible) fields hold.
    {
        auto r = HNVerification::validate_hn_inner<bb::fr>(
            builder, analyzer, setup.hn_constraint(0), setup.hn_constraint(1), queue0, queue1, vk0, vk1);
        EXPECT_TRUE(r.iv_queues[0].valid);
        EXPECT_TRUE(r.iv_queues[0].public_inputs_empty);
        EXPECT_TRUE(r.iv_queues[0].proof_empty);
    }

    // (a) wrong proof_type for constraint0 (HN → HN_FINAL). proof_type_matches now derives purely
    // from constraint.proof_type (VerifierInputs no longer carries a per-entry proof-type tag), so
    // the corruption target moves from the queue entry to the constraint itself.
    {
        RecursionConstraint bad_constraint = setup.hn_constraint(0);
        bad_constraint.proof_type = static_cast<uint32_t>(PROOF_TYPE::HN_FINAL);
        auto r = HNVerification::validate_hn_inner<bb::fr>(
            builder, analyzer, bad_constraint, setup.hn_constraint(1), queue0, queue1, vk0, vk1);
        EXPECT_FALSE(r.iv_queues[0].proof_type_matches);
        EXPECT_FALSE(r.iv_queues[0].valid);
        EXPECT_FALSE(r.all_valid);
    }

    // (b) wrong is_kernel for queue0 (C0 expects true) — flip via CircuitKind (App <-> Kernel).
    {
        const auto flipped_kind = setup.queue_snapshots[0].kind == Chonk::CircuitKind::Kernel
                                      ? Chonk::CircuitKind::App
                                      : Chonk::CircuitKind::Kernel;
        const auto bad = make_queue(flipped_kind);
        auto r = HNVerification::validate_hn_inner<bb::fr>(
            builder, analyzer, setup.hn_constraint(0), setup.hn_constraint(1), bad, queue1, vk0, vk1);
        EXPECT_FALSE(r.iv_queues[0].is_kernel_matches);
        EXPECT_FALSE(r.iv_queues[0].valid);
    }

    // (c) mismatched VK field → vk_witnesses_match false. IvQueueExpectedVk holds const refs, so
    // mutate an owning copy of the fields vector and bind the view to it.
    {
        std::vector<bb::fr> bad_fields = setup.expected_vk_fields_all[0];
        ASSERT_FALSE(bad_fields.empty());
        bad_fields[0] += bb::fr::one();
        const INNER::IvQueueExpectedVk bad_vk0{ .fields = bad_fields, .hash = setup.expected_vk_hashes[0] };
        auto r = HNVerification::validate_hn_inner<bb::fr>(
            builder, analyzer, setup.hn_constraint(0), setup.hn_constraint(1), queue0, queue1, bad_vk0, vk1);
        EXPECT_FALSE(r.iv_queues[0].vk_witnesses_match);
        EXPECT_FALSE(r.iv_queues[0].valid);
    }

    // (d) mismatched VK hash → key_hash_matches false.
    {
        const bb::fr bad_hash = setup.expected_vk_hashes[0] + bb::fr::one();
        const INNER::IvQueueExpectedVk bad_vk0{ .fields = setup.expected_vk_fields_all[0], .hash = bad_hash };
        auto r = HNVerification::validate_hn_inner<bb::fr>(
            builder, analyzer, setup.hn_constraint(0), setup.hn_constraint(1), queue0, queue1, bad_vk0, vk1);
        EXPECT_FALSE(r.iv_queues[0].key_hash_matches);
        EXPECT_FALSE(r.iv_queues[0].valid);
    }
}

// ValidateHNInnerDetectsMiddleAppCorruption / ValidateHNInnerDetectsInteriorBridgeCorruption (N-app,
// hn_count 3/4) are deleted, not retargeted: they built on `discover_entry_boundaries`'s squeeze-index
// scan, which is void for the same reason as everything else this session found stale (squeeze
// undercount) -- on the real N=3/4 fixtures the header's `discover_entry_boundaries` now returns an
// empty result immediately (`sq.size() < HN_INNER_LOOP0_SQUEEZES`), so these tests were failing their
// own setup assertions, not exercising real per-branch corruption detection. hn_count>2 is explicitly
// deferred this session (HNInnerValidation.hpp file-header scope note); `validate`/
// `validate_hn_inner_for_opcode` fail closed for hn_count!=2 by construction
// (AcirHNInnerRejectsHnCountOverflow below covers the ACIR-dispatch side of that guard).

// hn_count overflow -- the ACIR dispatch gate (graph_description_acir.cpp) must fail closed for
// more HN entries than any valid INNER kernel can have, not silently misroute to RESET's
// single-loop baseline the way the old hn_count==2 gate did for 3/4 constraints. Production itself
// refuses to build a real >MAX_APPS_PER_KERNEL-app circuit (throws during create_circuit), so this
// tests the dispatch gate directly: take a valid 2-constraint circuit and duplicate its app
// constraint in the ACIR-level copy (content is irrelevant -- the guard fires on hn_count alone,
// before touching any gate).
TEST_F(HNInnerRecursionTestSuite, AcirHNInnerRejectsHnCountOverflow)
{
    BB_DISABLE_ASSERTS();
    const auto setup = make_hn_inner_acir_setup();
    HNBuilder builder = build_hn_circuit_from_acir(setup);
    AcirFormat constraint_system_copy = setup.program.constraints;
    ASSERT_EQ(constraint_system_copy.hn_recursion_constraints.size(), 2UL);

    const auto app_constraint = constraint_system_copy.hn_recursion_constraints[1];
    const auto app_opcode_idx = constraint_system_copy.original_opcode_indices.hn_recursion_constraints[1];
    for (int i = 0; i < 3; ++i) {
        constraint_system_copy.hn_recursion_constraints.push_back(app_constraint);
        constraint_system_copy.original_opcode_indices.hn_recursion_constraints.push_back(app_opcode_idx);
    }
    ASSERT_EQ(constraint_system_copy.hn_recursion_constraints.size(), 5UL);

    cdg::MegaStaticAnalyzerAcir analyzer(std::move(constraint_system_copy), std::move(builder));
    EXPECT_FALSE(analyzer.get_incorrect_opcodes().empty());
}

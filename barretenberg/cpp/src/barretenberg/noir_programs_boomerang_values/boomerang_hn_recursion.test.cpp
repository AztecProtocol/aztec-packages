// HN / HyperNova Recursion Constraint Validation — boomerang analysis tests.
//
// Verification flow for RESET kernel (baseline):
//   phase1 : OinkVerifier (vk_hash, commitments, eta/beta/gamma/alpha)
//   phase2 : Gate-challenge generation (get_dyadic_powers_of_challenge)
//   phase3 : Main Sumcheck (21 rounds)
//   phase4 : HyperNova batching challenges (unshifted + shifted)
//   phase5 : MLB accumulator receive (transcript receives)
//   phase6 : Multilinear-batching Sumcheck (21 rounds)
//   phase7 : Claim-batching challenge
//   phase8 : Databus consistency checks
//   phase9 : Accumulator hash
//   phase10: Merge recursive verification
//   phase11: Pairing-points aggregation
//   phase12: KernelIO set_public
//
// Fingerprint constants and shared helpers live in recursion_constraints_helper.hpp.
// HN / HyperNova Recursion — RESET baseline and shared-kernel tests.
// INIT tests: boomerang_hn_init_recursion.test.cpp
// INNER tests: boomerang_hn_inner_recursion.test.cpp

#include "barretenberg/boomerang_value_detection/graph_description_acir.hpp"
#include "barretenberg/noir_programs_boomerang_values/boomerang_hn_recursion_test_helpers.hpp"

#include <fstream>
#include <gtest/gtest.h>

using namespace bb;
using namespace hn_recursion_test;

class HNRecursionTestSuite : public BoomerangHNRecursionTests {};

// Phase 1 placeholder: verify fixture compiles and circuit builds
// ============================================================================

TEST_F(BoomerangHNRecursionTests, ResetKernelCircuitBuilds)
{
    BB_DISABLE_ASSERTS();
    HNBuilder builder = build_reset_kernel_circuit();
    EXPECT_GT(builder.get_num_finalized_gates(), 0UL);
}

// ============================================================================
// Phase 2: Discovery — block structure + squeeze map
// ============================================================================

// 2.1 + 2.2: Dump full block structure and squeeze-gate map for the RESET kernel.
// Outputs:
//   hn_functions_analysis.txt  — per-block gate counts + labelled squeeze list
//   hn_squeeze_map.txt         — one row per squeeze: abs_idx / selector context
TEST_F(BoomerangHNRecursionTests, HNBaselineAnalysis)
{
    BB_DISABLE_ASSERTS();
    HNBuilder builder = build_reset_kernel_circuit();

    auto& blocks = builder.blocks;
    const auto labels = blocks.get_labels();
    auto all_blocks = blocks.get();

    // ── hn_functions_analysis.txt ────────────────────────────────────────────
    {
        std::ofstream out("hn_functions_analysis.txt");
        ASSERT_TRUE(out.is_open());

        out << "=== HN RESET Kernel — full block structure ===\n\n";
        out << "Total arithmetic gates : " << blocks.arithmetic.size() << "\n";
        out << "Total poseidon2 (merged ext+int) : " << blocks.poseidon2.size() << "\n";
        out << "Total nnf              : " << blocks.nnf.size() << "\n";
        out << "Total memory           : " << blocks.memory.size() << "\n";
        out << "Total ecc_op           : " << blocks.ecc_op.size() << "\n";
        out << "Total elliptic         : " << blocks.elliptic.size() << "\n";
        out << "Total delta_range      : " << blocks.delta_range.size() << "\n";
        out << "Total lookup           : " << blocks.lookup.size() << "\n";
        out << "Total pub_inputs       : " << blocks.pub_inputs.size() << "\n\n";

        out << "--- all blocks (index / name / size) ---\n";
        for (size_t b = 0; b < labels.size(); ++b) {
            out << "  block[" << b << "] " << labels[b] << " size=" << all_blocks[b].size() << "\n";
        }
        out << "\n";

        // Transcript squeeze gates
        const auto squeezes = recursion_helpers::find_all_transcript_squeeze_gates(builder);
        out << "--- transcript squeeze gates (total=" << squeezes.size() << ") ---\n";
        for (size_t i = 0; i < squeezes.size(); ++i) {
            const size_t g = squeezes[i];
            auto& arith = blocks.arithmetic;
            out << "  squeeze[" << i << "] arith_gate=" << g << " q_m=" << arith.q_m()[g] << " q_1=" << arith.q_1()[g]
                << " q_2=" << arith.q_2()[g] << " q_3=" << arith.q_3()[g] << " q_4=" << arith.q_4()[g]
                << " q_c=" << arith.q_c()[g] << " q_arith=" << arith.gate_selector_for(bb::GateKind::Arith)[g]
                << " wl=" << arith.w_l()[g] << " wr=" << arith.w_r()[g] << " wo=" << arith.w_o()[g]
                << " w4=" << arith.w_4()[g] << "\n";
        }
        out << "\n";

        info("HN baseline analysis written to hn_functions_analysis.txt");
        info("  arithmetic gates : ", blocks.arithmetic.size());
        info("  squeeze gates    : ", squeezes.size());
    }

    // ── hn_squeeze_map.txt ───────────────────────────────────────────────────
    {
        const auto squeezes = recursion_helpers::find_all_transcript_squeeze_gates(builder);
        std::ofstream out("hn_squeeze_map.txt");
        ASSERT_TRUE(out.is_open());

        auto& arith = builder.blocks.arithmetic;
        const size_t total_arith = arith.size();

        out << "# HN RESET kernel — squeeze gate context map\n";
        out << "# total arithmetic gates: " << total_arith << "\n";
        out << "# total squeeze gates: " << squeezes.size() << "\n\n";

        for (size_t i = 0; i < squeezes.size(); ++i) {
            const size_t g = squeezes[i];
            out << "squeeze[" << i << "]  abs=" << g << "  frac=" << g << "/" << total_arith << "\n";

            // Dump 5 gates before and after for context
            const size_t lo = (g >= 5) ? g - 5 : 0;
            const size_t hi = std::min(g + 6, total_arith);
            for (size_t k = lo; k < hi; ++k) {
                out << "  " << (k == g ? ">>>" : "   ") << " gate[" << k << "]"
                    << " q_m=" << arith.q_m()[k] << " q_1=" << arith.q_1()[k] << " q_2=" << arith.q_2()[k]
                    << " q_3=" << arith.q_3()[k] << " q_4=" << arith.q_4()[k] << " q_c=" << arith.q_c()[k]
                    << " q_arith=" << arith.gate_selector_for(bb::GateKind::Arith)[k] << "\n";
            }
            out << "\n";
        }
        info("Squeeze map written to hn_squeeze_map.txt");
    }

    // Basic sanity: circuit is non-trivial and has squeeze gates
    EXPECT_GT(builder.get_num_finalized_gates(), 10000UL);
    const auto squeezes = recursion_helpers::find_all_transcript_squeeze_gates(builder);
    EXPECT_GT(squeezes.size(), 0UL);
}

// DIAGNOSTIC (throwaway, not part of the validated suite): post-merge, find_all_transcript_squeeze_gates
// returns far fewer gates than before (35 vs the old 87 pin) because most Fiat-Shamir challenges now
// convert to `fr` (identity, no gate) instead of `fq` (decompose gate) -- see
// stdlib/primitives/field/field_conversion.hpp::convert_full_challenge. This dumps per-gate selector
// signatures over the big unexplained span [sq[0]+1, sq[1]+1) to look for a repeating per-round pattern
// that could anchor Main Sumcheck rounds without a squeeze marker.
TEST_F(BoomerangHNRecursionTests, HNPostMergeGateShapeDiagnostic)
{
    BB_DISABLE_ASSERTS();
    HNBuilder builder = build_reset_kernel_circuit();
    auto& arith = builder.blocks.arithmetic;
    const auto sq = recursion_helpers::find_all_transcript_squeeze_gates(builder);
    ASSERT_GE(sq.size(), 2UL);

    std::ofstream out("hn_postmerge_gate_shape_diag.txt");
    ASSERT_TRUE(out.is_open());
    out << "# sq[0]=" << sq[0] << " sq[1]=" << sq[1] << " span=" << (sq[1] - sq[0]) << "\n";
    out << "# arith.size()=" << arith.size() << "\n";
    for (size_t g = sq[0] + 1; g < sq[1] + 1 && g < arith.size(); ++g) {
        const bool is_fix = recursion_helpers::is_fix_witness_gate(builder, g);
        const bool is_add = recursion_helpers::is_transcript_add_gate<bb::fr>(arith, g);
        out << g << " qm=" << arith.q_m()[g] << " q1=" << arith.q_1()[g] << " q2=" << arith.q_2()[g]
            << " q3=" << arith.q_3()[g] << " q4=" << arith.q_4()[g] << " qc=" << arith.q_c()[g]
            << " qarith=" << arith.gate_selector_for(bb::GateKind::Arith)[g] << " fix=" << is_fix << " add=" << is_add
            << "\n";
    }
    SUCCEED();
}

// Step 1 (hn_cursor_chaining_plan.md): discover RESET primitive_start from ACIR key_hash/key[]
// witnesses without relying on stale squeeze indices or pre-merge VkHashProfile constants.
// Writes hn_reset_witness_gate_map.txt with candidate FunctionFingerprint pins for the vk_hash stage.
TEST_F(BoomerangHNRecursionTests, AcirHNResetPrimitiveStartDiscovery)
{
    BB_DISABLE_ASSERTS();

    HNAcirSetup setup = make_hn_acir_setup(PROOF_TYPE::HN, /*is_kernel=*/true);
    const RecursionConstraint& constraint = setup.hn_constraint(0);
    ASSERT_FALSE(constraint.key.empty());
    ASSERT_NE(constraint.key_hash, 0U);

    HNBuilder builder = build_hn_circuit_from_acir(setup);
    HNAnalyzer analyzer(builder, false);

    auto& poseidon2 = builder.blocks.poseidon2;
    auto& arith = builder.blocks.arithmetic;

    const uint32_t key_hash_real = builder.real_variable_index[constraint.key_hash];
    const std::vector<size_t> key_hash_p2_gates = OinkVerifierValidation::collect_real_witness_gates_in_block<bb::fr>(
        builder, analyzer, key_hash_real, poseidon2);
    ASSERT_FALSE(key_hash_p2_gates.empty()) << "key_hash has no poseidon2 gates";

    std::set<size_t> key_limb_p2_gates;
    size_t limbs_with_p2 = 0;
    size_t limbs_with_any_gate = 0;
    std::map<size_t, size_t> limb_block_histogram; // block_idx -> limb count that touches it
    size_t first_limb_min_gate = SIZE_MAX;
    size_t first_limb_block = SIZE_MAX;
    for (size_t i = 0; i < constraint.key.size(); ++i) {
        const uint32_t key_real = builder.real_variable_index[constraint.key[i]];
        const auto all_gates = analyzer.get_variable_gates(key_real);
        if (!all_gates.empty()) {
            ++limbs_with_any_gate;
            std::set<size_t> blocks_touched;
            for (const auto& [blk, g] : all_gates) {
                blocks_touched.insert(blk);
                if (i == 0 && g < first_limb_min_gate) {
                    first_limb_min_gate = g;
                    first_limb_block = blk;
                }
            }
            for (size_t blk : blocks_touched) {
                ++limb_block_histogram[blk];
            }
        }
        const auto gates =
            OinkVerifierValidation::collect_real_witness_gates_in_block<bb::fr>(builder, analyzer, key_real, poseidon2);
        if (!gates.empty()) {
            ++limbs_with_p2;
            key_limb_p2_gates.insert(gates.begin(), gates.end());
        }
    }
    ASSERT_GT(limbs_with_any_gate, 0UL) << "no constraint.key[] limb appears on any gate";

    std::set<size_t> all_p2_gates(key_hash_p2_gates.begin(), key_hash_p2_gates.end());
    all_p2_gates.insert(key_limb_p2_gates.begin(), key_limb_p2_gates.end());
    const size_t p2_start = *all_p2_gates.begin();
    const size_t p2_end = *all_p2_gates.rbegin() + 1;

    const std::set<size_t> linked_arith_from_cover =
        recursion_helpers::collect_linked_gates<bb::fr>(builder, analyzer, poseidon2, p2_start, p2_end, arith);

    // Probe only the sparse witness-touched poseidon gates (not every gate in the covering span).
    std::set<size_t> linked_arith_from_touched;
    for (size_t g : all_p2_gates) {
        const auto linked =
            recursion_helpers::collect_linked_gates<bb::fr>(builder, analyzer, poseidon2, g, g + 1, arith);
        linked_arith_from_touched.insert(linked.begin(), linked.end());
    }

    std::set<size_t> key_related_arith;
    const auto collect_arith = [&](uint32_t wit) {
        const uint32_t real = builder.real_variable_index[wit];
        for (size_t g :
             OinkVerifierValidation::collect_real_witness_gates_in_block<bb::fr>(builder, analyzer, real, arith)) {
            key_related_arith.insert(g);
        }
    };
    collect_arith(constraint.key_hash);
    for (uint32_t key_wit : constraint.key) {
        collect_arith(key_wit);
    }

    size_t limbs_in_span = 0;
    for (uint32_t key_wit : constraint.key) {
        const uint32_t key_real = builder.real_variable_index[key_wit];
        const auto gates =
            OinkVerifierValidation::collect_real_witness_gates_in_block<bb::fr>(builder, analyzer, key_real, poseidon2);
        for (size_t g : gates) {
            if (g >= p2_start && g < p2_end) {
                ++limbs_in_span;
                break;
            }
        }
    }

    std::ofstream out("hn_reset_witness_gate_map.txt");
    ASSERT_TRUE(out.is_open());
    out << "# HN RESET — ACIR witness → gate map (cursor-chain Step 1)\n";
    out << "# proof_type=HN key.size=" << constraint.key.size() << " key_hash=" << constraint.key_hash << "\n";
    out << "# constraint.proof empty (fold proof from native verification_queue)\n";
    out << std::dec << "poseidon2_block_size=" << poseidon2.size() << " arith_block_size=" << arith.size() << "\n";
    out << "key_hash_poseidon2_gates=";
    for (size_t g : key_hash_p2_gates) {
        out << g << ",";
    }
    out << "\n";
    out << "key_limb_poseidon2_gate_count=" << key_limb_p2_gates.size() << "\n";
    out << "key_limbs_with_any_gate=" << limbs_with_any_gate << "/" << constraint.key.size() << "\n";
    out << "key_limbs_with_poseidon2=" << limbs_with_p2 << "/" << constraint.key.size() << "\n";
    out << "key_limbs_in_covering_poseidon2_span=" << limbs_in_span << "/" << constraint.key.size() << "\n";
    out << "first_key_limb_earliest_gate block=" << first_limb_block << " gate=" << first_limb_min_gate << "\n";
    out << "key_limb_block_histogram:";
    for (const auto& [blk, count] : limb_block_histogram) {
        out << " b" << blk << "=" << count;
    }
    out << "\n";
    // key_hash across all blocks
    out << "key_hash_all_gates:";
    for (const auto& [blk, g] : analyzer.get_variable_gates(key_hash_real)) {
        out << " b" << blk << ":" << g;
    }
    out << "\n";
    // Does ANY poseidon2↔arith link exist near the covering span? Sample mid-span gate.
    if (p2_end > p2_start) {
        const size_t mid = p2_start + (p2_end - p2_start) / 2;
        const auto mid_linked =
            recursion_helpers::collect_linked_gates<bb::fr>(builder, analyzer, poseidon2, mid, mid + 1, arith);
        out << "sample_mid_poseidon_gate=" << mid << " linked_arith_count=" << mid_linked.size() << "\n";
        const auto whole_p2_to_arith = recursion_helpers::collect_linked_gates<bb::fr>(
            builder, analyzer, poseidon2, 0, std::min(poseidon2.size(), size_t{ 50 }), arith);
        out << "poseidon2[0..50)_linked_arith_count=" << whole_p2_to_arith.size() << "\n";
    }
    out << "poseidon2_covering=[" << p2_start << ".." << p2_end << ") gates=" << (p2_end - p2_start) << "\n";
    out << "linked_arith_from_cover_count=" << linked_arith_from_cover.size() << "\n";
    out << "linked_arith_from_touched_count=" << linked_arith_from_touched.size() << "\n";
    out << "key_related_arith_count=" << key_related_arith.size() << "\n";

    std::set<size_t> arith_union = linked_arith_from_cover;
    arith_union.insert(linked_arith_from_touched.begin(), linked_arith_from_touched.end());
    arith_union.insert(key_related_arith.begin(), key_related_arith.end());

    if (!arith_union.empty()) {
        const size_t arith_start = *arith_union.begin();
        const size_t arith_end = *arith_union.rbegin() + 1;
        out << "arith_union=[" << arith_start << ".." << arith_end << ") gates=" << (arith_end - arith_start) << "\n";
        out << "primitive_start_arith=" << arith_start << "\n";
        print_fp(
            out, "RESET_VK_HASH_ARITH", hn_compute_fingerprint(builder, HN_BLOCK_ARITHMETIC, arith_start, arith_end));
    }
    out << "primitive_start_poseidon2=" << p2_start << "\n";
    print_fp(out, "RESET_VK_HASH_POSEIDON2", hn_compute_fingerprint(builder, HN_BLOCK_POSEIDON2_EXT, p2_start, p2_end));
    out << "// Mega merged poseidon2: use RESET_VK_HASH_POSEIDON2 for both poseidon2_ext and poseidon2_int\n";

    // ecc_op span covering key limbs (148/151 land there on RESET post-merge).
    auto& ecc_op = builder.blocks.ecc_op;
    std::set<size_t> key_limb_ecc_gates;
    for (uint32_t key_wit : constraint.key) {
        const uint32_t key_real = builder.real_variable_index[key_wit];
        for (size_t g :
             OinkVerifierValidation::collect_real_witness_gates_in_block<bb::fr>(builder, analyzer, key_real, ecc_op)) {
            key_limb_ecc_gates.insert(g);
        }
    }
    if (!key_limb_ecc_gates.empty()) {
        const size_t ecc_lo = *key_limb_ecc_gates.begin();
        const size_t ecc_hi = *key_limb_ecc_gates.rbegin() + 1;
        out << "key_limb_ecc_op_covering=[" << ecc_lo << ".." << ecc_hi << ") gates=" << (ecc_hi - ecc_lo)
            << " touched=" << key_limb_ecc_gates.size() << "\n";
        const auto ecc_to_arith =
            recursion_helpers::collect_linked_gates<bb::fr>(builder, analyzer, ecc_op, ecc_lo, ecc_hi, arith);
        const auto ecc_to_p2 =
            recursion_helpers::collect_linked_gates<bb::fr>(builder, analyzer, ecc_op, ecc_lo, ecc_hi, poseidon2);
        out << "ecc_op_covering_linked_arith_count=" << ecc_to_arith.size() << "\n";
        out << "ecc_op_covering_linked_poseidon2_count=" << ecc_to_p2.size() << "\n";
        if (!ecc_to_arith.empty()) {
            out << "primitive_start_arith_via_ecc=" << *ecc_to_arith.begin() << "\n";
        }
        if (!ecc_to_p2.empty()) {
            out << "poseidon2_via_ecc_key_limbs=[" << *ecc_to_p2.begin() << ".." << (*ecc_to_p2.rbegin() + 1) << ")\n";
        }
    }

    // Reverse link: does arith→poseidon2 exist at all near arith start?
    if (arith.size() > 0) {
        const auto a0_to_p2 = recursion_helpers::collect_linked_gates<bb::fr>(
            builder, analyzer, arith, 0, std::min(arith.size(), size_t{ 100 }), poseidon2);
        out << "arith[0..100)_linked_poseidon2_count=" << a0_to_p2.size() << "\n";
    }

    // Step 1 PASS criteria adapted to post-merge Mega layout:
    // - every key limb appears on some gate (serialization wired)
    // - key_hash appears on poseidon2 (vk_hash absorb/assert)
    // - covering poseidon2 span from earliest key-touched poseidon through key_hash is non-empty
    EXPECT_EQ(limbs_with_any_gate, constraint.key.size());
    EXPECT_FALSE(key_hash_p2_gates.empty());
    EXPECT_LT(p2_start, p2_end);
    EXPECT_EQ(limbs_in_span, limbs_with_p2) << "poseidon2-touched key limbs must lie in covering span";

    // Pin check: RESET_VK_HASH_PROFILE must locate the same covering span.
    const auto vk_hash = HNVerification::HNOinkValidation::validate_vk_hash_anchor<bb::fr>(
        builder, analyzer, constraint, HNVerification::RESET_VK_HASH_PROFILE);
    EXPECT_TRUE(vk_hash.valid);
    EXPECT_EQ(vk_hash.poseidon2_ext_start, p2_start);
    EXPECT_EQ(vk_hash.poseidon2_ext_end, p2_end);
    EXPECT_EQ(vk_hash.arith_start, 0UL);
    EXPECT_EQ(vk_hash.arith_end, 0UL);

    const auto key_link = HNVerification::HNOinkValidation::validate_key_limbs_drive_vk_hash<bb::fr>(
        builder, analyzer, constraint, vk_hash);
    EXPECT_TRUE(key_link.valid);
    EXPECT_EQ(key_link.limbs_linked, constraint.key.size());

    out << "validate_vk_hash_anchor_valid=" << vk_hash.valid << " poseidon2=[" << vk_hash.poseidon2_ext_start << ".."
        << vk_hash.poseidon2_ext_end << ")\n";
    out << "key_limbs_drive_vk_hash_valid=" << key_link.valid << " linked=" << key_link.limbs_linked << "/"
        << key_link.limbs_checked << "\n";
    out << "primitive_start_poseidon2=" << vk_hash.poseidon2_ext_start << " (arith absent on ACIR vk_hash path)\n";

    info("HN RESET witness gate map written to hn_reset_witness_gate_map.txt");
    SUCCEED();
}

// Step 2 dump (hn_cursor_chaining_plan.md): fresh RESET fingerprint chain from ACIR-anchored
// primitive_start. Remaining transcript squeezes are soft dump boundaries only (fq challenges
// still emit gates); they are NOT validation indices. Output: hn_reset_functions_analysis.txt.
TEST_F(BoomerangHNRecursionTests, AcirHNResetCursorChainDump)
{
    BB_DISABLE_ASSERTS();

    HNAcirSetup setup = make_hn_acir_setup(PROOF_TYPE::HN, /*is_kernel=*/true);
    const RecursionConstraint& constraint = setup.hn_constraint(0);
    HNBuilder builder = build_hn_circuit_from_acir(setup);
    HNAnalyzer analyzer(builder, false);

    const auto vk_hash = HNVerification::HNOinkValidation::validate_vk_hash_anchor<bb::fr>(
        builder, analyzer, constraint, HNVerification::RESET_VK_HASH_PROFILE);
    ASSERT_TRUE(vk_hash.valid);

    auto& arith = builder.blocks.arithmetic;
    auto& poseidon2 = builder.blocks.poseidon2;
    const auto sq = recursion_helpers::find_all_transcript_squeeze_gates(builder);

    std::ofstream out("hn_reset_functions_analysis.txt");
    ASSERT_TRUE(out.is_open());
    out << "# HN RESET — cursor-chain fingerprint dump (from ACIR primitive_start)\n";
    out << "# primitive_start_poseidon2=" << vk_hash.poseidon2_ext_start << " (arith vk_hash absent on ACIR path)\n";
    out << std::dec << "arith_block_size=" << arith.size() << " poseidon2_block_size=" << poseidon2.size()
        << " soft_squeezes=" << sq.size() << "\n\n";

    // Chain entry 0: vk_hash poseidon covering span.
    out << "// chain[0] VkHash poseidon2=[" << vk_hash.poseidon2_ext_start << ".." << vk_hash.poseidon2_ext_end
        << ")\n";
    print_fp(out,
             "RESET_VK_HASH_POSEIDON2",
             hn_compute_fingerprint(
                 builder, HN_BLOCK_POSEIDON2_EXT, vk_hash.poseidon2_ext_start, vk_hash.poseidon2_ext_end));

    // Soft arith windows: [0, sq[0]+1), then (sq[i]+1, sq[i+1]+1), then (sq.back()+1, arith.size()).
    std::vector<size_t> arith_bounds;
    arith_bounds.push_back(0);
    for (size_t s : sq) {
        arith_bounds.push_back(s + 1);
    }
    arith_bounds.push_back(arith.size());
    std::sort(arith_bounds.begin(), arith_bounds.end());
    arith_bounds.erase(std::unique(arith_bounds.begin(), arith_bounds.end()), arith_bounds.end());

    size_t chain_idx = 1;
    for (size_t i = 0; i + 1 < arith_bounds.size(); ++i) {
        const size_t a0 = arith_bounds[i];
        const size_t a1 = arith_bounds[i + 1];
        if (a0 >= a1) {
            continue;
        }
        const std::string tag = "RESET_CHAIN_" + std::to_string(chain_idx);
        out << "// chain[" << chain_idx << "] soft_arith=[" << a0 << ".." << a1 << ") gates=" << (a1 - a0) << "\n";
        print_fp(out, (tag + "_ARITH").c_str(), hn_compute_fingerprint(builder, HN_BLOCK_ARITHMETIC, a0, a1));
        const auto linked = hn_extract_linked_poseidon_fps(builder, analyzer, a0, a1);
        if (linked.valid) {
            // Skip poseidon segments that sit entirely inside the vk_hash covering span (already chained).
            if (linked.external.start + linked.external.fp.gate_count <= vk_hash.poseidon2_ext_end &&
                linked.external.start >= vk_hash.poseidon2_ext_start) {
                out << "//   " << tag << " poseidon2 fully inside vk_hash span — omitted\n";
            } else {
                print_linked_poseidon_fps(out, tag.c_str(), linked);
            }
        } else {
            out << "//   " << tag << " no linked poseidon2\n";
        }
        ++chain_idx;
    }

    // Poseidon remainder after vk_hash, if any uncovered tail exists.
    if (vk_hash.poseidon2_ext_end < poseidon2.size()) {
        out << "// poseidon2_tail=[" << vk_hash.poseidon2_ext_end << ".." << poseidon2.size() << ")\n";
        print_fp(out,
                 "RESET_POSEIDON2_TAIL",
                 hn_compute_fingerprint(builder, HN_BLOCK_POSEIDON2_EXT, vk_hash.poseidon2_ext_end, poseidon2.size()));
    }

    out << "\n# chain_entries_soft_arith_windows=" << (chain_idx - 1) << "\n";
    info("HN RESET cursor-chain dump written to hn_reset_functions_analysis.txt");
    SUCCEED();
}

// CHONK-style per-stage gate fingerprint dump for the full HN RESET kernel pipeline.
// Output: hn_mega_functions_analysis.txt (analogue of megazk_functions_analysis.txt).
// Each stage lists arithmetic + linked poseidon2_ext + poseidon2_int segments.
// LEGACY: squeeze-indexed; superseded by AcirHNResetCursorChainDump for cursor-chain work.
TEST_F(HNRecursionTestSuite, AcirHNFunctionAnalysis)
{
    BB_DISABLE_ASSERTS();
    HNBuilder builder = build_reset_kernel_circuit();
    HNAnalyzer analyzer(builder, false);

    const auto sq = recursion_helpers::find_all_transcript_squeeze_gates(builder);
    // Post-merge squeeze detector undercounts; dump whatever remains as soft bounds.
    ASSERT_FALSE(sq.empty());

    std::ofstream out("hn_mega_functions_analysis.txt");
    ASSERT_TRUE(out.is_open());

    out << "# HN RESET kernel — per-stage gate fingerprints\n";
    out << "# Format mirrors megazk_functions_analysis.txt (CHONK boomerang)\n";
    out << "# total squeezes: " << sq.size() << "\n\n";

    const auto dump = [&](const char* tag, size_t arith_start, size_t arith_end) {
        write_hn_arith_poseidon_stage(out, builder, analyzer, tag, arith_start, arith_end);
    };

    // ── Oink phase ────────────────────────────────────────────────────────────
    dump("HN:Oink:pre_eta", 0, sq[HNVerification::HN_SQUEEZE_OINK_ETA] + 1);
    dump("HN:Oink:eta_to_beta",
         sq[HNVerification::HN_SQUEEZE_OINK_ETA] + 1,
         sq[HNVerification::HN_SQUEEZE_OINK_BETA] + 1);
    dump("HN:Oink:beta_to_alpha",
         sq[HNVerification::HN_SQUEEZE_OINK_BETA] + 1,
         sq[HNVerification::HN_SQUEEZE_OINK_ALPHA] + 1);

    // ── Gate challenge ────────────────────────────────────────────────────────
    dump("HN:GateChallenge",
         sq[HNVerification::HN_SQUEEZE_OINK_ALPHA] + 1,
         sq[HNVerification::HN_SQUEEZE_GATE_CHALLENGE] + 1);

    // ── Main Sumcheck (21 rounds) ─────────────────────────────────────────────
    for (size_t r = 0; r < HNVerification::HN_NUM_MAIN_SC_SQUEEZES; ++r) {
        dump(("HN:MainSumcheck:round_" + std::to_string(r)).c_str(),
             sq[HNVerification::HN_SQUEEZE_GATE_CHALLENGE + r] + 1,
             sq[HNVerification::HN_SQUEEZE_GATE_CHALLENGE + r + 1] + 1);
    }

    // ── Batching (29 challenges) ────────────────────────────────────────────────
    dump("HN:Batching:transition",
         sq[HNVerification::HN_SQUEEZE_MAIN_SC_LAST] + 1,
         sq[HNVerification::HN_SQUEEZE_BATCHING_FIRST] + 1);
    for (size_t k = 0; k < HNVerification::HN_NUM_BATCHING_SQUEEZES; ++k) {
        dump(("HN:Batching:round_" + std::to_string(k)).c_str(),
             sq[HNVerification::HN_SQUEEZE_BATCHING_FIRST + k] + 1,
             sq[HNVerification::HN_SQUEEZE_BATCHING_FIRST + k + 1] + 1);
    }

    // ── MLB phase ─────────────────────────────────────────────────────────────
    dump("HN:MLB:alpha_transition",
         sq[HNVerification::HN_SQUEEZE_BATCHING_LAST] + 1,
         sq[HNVerification::HN_SQUEEZE_MLB_ALPHA] + 1);
    for (size_t r = 0; r < HNVerification::HN_NUM_MLB_SC_SQUEEZES; ++r) {
        dump(("HN:MLB:Sumcheck:round_" + std::to_string(r)).c_str(),
             sq[HNVerification::HN_SQUEEZE_MLB_ALPHA + r] + 1,
             sq[HNVerification::HN_SQUEEZE_MLB_ALPHA + r + 1] + 1);
    }
    dump("HN:MLB:claim_batching",
         sq[HNVerification::HN_SQUEEZE_MLB_SC_LAST] + 1,
         sq[HNVerification::HN_SQUEEZE_CLAIM_BATCHING] + 1);

    // ── Tail (databus consistency + accumulator hash + merge hash-absorb + pairing points +
    //    kernel IO). No transcript squeeze runs here for a baseline (non-FINAL) kernel -- see the
    //    note above HN_SQUEEZE_POST_MLB_FIRST in hypernova_verification.hpp -- so this is one
    //    non-interactive block from claim_batching to the end of the arithmetic block.
    const size_t arith_total = builder.blocks.arithmetic.size();
    dump("HN:Tail:post_claim_batching", sq[HNVerification::HN_SQUEEZE_CLAIM_BATCHING] + 1, arith_total);

    // ── Full Poseidon2 block (Mega merged poseidon2_external/poseidon2_quad_internal into one) ──
    write_stage_fingerprint(
        out, builder, "HN:Poseidon2:full", { hn_segment(HN_BLOCK_POSEIDON2_EXT, 0, builder.blocks.poseidon2.size()) });

    // Legacy squeeze dump only — cursor-chain coverage is AcirHNResetCursorChainDump / ValidateHNBaseline.
    out << "\n# legacy squeeze dump; see AcirHNResetCursorChainDump for cursor-chain pins\n";
    info("HN function analysis written to hn_mega_functions_analysis.txt");
    SUCCEED();
}

// CHONK-style per-stage gate fingerprint dump for the HN INIT / OINK-only path.
// Output: hn_init_mega_functions_analysis.txt
// Since INIT has no MLB phase, we dump:
//   Oink (3 windows) -> GateChallenge -> MainSumcheck (21 rounds)
//   -> Batching (29 squeezes incl. transition) -> tail stack (13 squeezes).

// ACIR poseidon-linked arith anchor for INIT vk_hash (key_hash witness).

// Pin micro-OINK stage fingerprints from hn_oink_functions_analysis.txt.

// Coarse FunctionFingerprint dump for INIT main sumcheck / batching tail windows.

TEST_F(HNRecursionTestSuite, AcirHNFingerprintsMatchConstants)
{
    BB_DISABLE_ASSERTS();

    auto ivc = make_mock_chonk_for_scenario({ PROOF_TYPE::HN });
    AcirProgram program = build_hn_kernel_program(*ivc);
    const ProgramMetadata metadata{ ivc };

    HNBuilder builder = create_circuit<HNBuilder>(program, metadata);
    AcirFormat constraint_system_copy = program.constraints;

    cdg::MegaStaticAnalyzerAcir analyzer(std::move(constraint_system_copy), std::move(builder));
    EXPECT_TRUE(analyzer.get_incorrect_opcodes().empty());
}

// INNER kernel: two HN verification loops — boomerang must accept via validate_hn_inner.

// Mode 1 discovery: per-constraint fingerprint dump for INNER kernel (2× HN via ACIR).
// Full circuit has both constraints; each test writes the verification loop attributed to one constraint.
//   hn_inner_constraint0_functions_analysis.txt — previous kernel (is_kernel=true), sq[0..89] + inter-loop bridge
//   hn_inner_constraint1_functions_analysis.txt — new app (is_kernel=false), sq[90..179]

// Pin poseidon2 cursor-chain coverage (vk_hash + tail) on RESET.
TEST_F(HNRecursionTestSuite, HNPoseidonFingerprintMatch)
{
    BB_DISABLE_ASSERTS();
    HNAcirSetup setup = make_hn_acir_setup(PROOF_TYPE::HN, /*is_kernel=*/true);
    HNBuilder builder = build_hn_circuit_from_acir(setup);
    HNAnalyzer analyzer(builder, false);

    auto result = HNVerification::validate_hn_baseline<bb::fr>(builder, analyzer, &setup.hn_constraint(0));
    EXPECT_TRUE(result.all_valid);
    EXPECT_TRUE(result.poseidon2_coverage_valid);
    EXPECT_TRUE(result.poseidon_full_valid);
}

// 3.1: Compute FunctionFingerprint values for each HN phase.
// Outputs hn_fingerprints.txt with ready-to-paste C++ constant declarations.
//
// Squeeze group boundaries (re-derived after upstream bumped CONST_FOLDING_LOG_N 21->24 and
// MegaFlavor::NUM_UNSHIFTED_ENTITIES 55->62; MegaFlavor::NUM_SHIFTED_ENTITIES unchanged at 5).
// Total squeeze count 90->87: main/MLB Sumcheck grow 21->24 rounds each (+3/+3, tracks
// VIRTUAL_LOG_N), batching grows 29->33 (tracks NUM_UNSHIFTED_ENTITIES), and the old 13-squeeze
// post-MLB group (accumulator hash + per-step merge Shplonk/KZG challenges) is gone entirely --
// `complete_kernel_circuit_logic` (chonk.cpp) now does a non-interactive Poseidon2 absorb
// (`Goblin::BatchMergeRecursiveVerifier::ecc_op_hash_step`) per step instead of a full merge
// verify, so there is nothing left to squeeze after claim_batching for a baseline (non-FINAL)
// kernel. The real gate-heavy batch-merge verifier now runs once, only in HN_FINAL/HIDING.
//   [0]      OinkVerifier: eta
//   [1]      OinkVerifier: beta/gamma
//   [2]      OinkVerifier: alpha
//   [3]      gate_challenge
//   [4-27]   Main Sumcheck rounds 0-23 (24 rounds)
//   [28-60]  Batching challenges (33)
//   [61]     MLB: Sumcheck:alpha
//   [62-85]  MLB Sumcheck rounds 0-23 (24 rounds)
//   [86]     MLB: claim_batching_challenge
TEST_F(BoomerangHNRecursionTests, HNFingerprintExtraction)
{
    BB_DISABLE_ASSERTS();
    HNBuilder builder = build_reset_kernel_circuit();

    const auto sq = recursion_helpers::find_all_transcript_squeeze_gates(builder);
    ASSERT_EQ(sq.size(), 87UL) << "Squeeze count changed — re-run discovery";

    std::ofstream out("hn_fingerprints.txt");
    ASSERT_TRUE(out.is_open());

    out << "// ============================================================\n";
    out << "// HN RESET kernel — FunctionFingerprint constants\n";
    out << "// Generated by HNFingerprintExtraction test.\n";
    out << "// Paste into HNVerification namespace in recursion_constraints_helper.hpp\n";
    out << "// ============================================================\n\n";

    // Helper: compute arith fingerprint for window [a, b) — b is exclusive
    const auto arith_fp = [&](size_t a, size_t b) {
        return hn_compute_fingerprint(builder, HN_BLOCK_ARITHMETIC, a, b);
    };
    const auto pos2_ext_fp = [&](size_t a, size_t b) {
        return hn_compute_fingerprint(builder, HN_BLOCK_POSEIDON2_EXT, a, b);
    };

    // ── Oink phase: gates 0 through sq[2] (inclusive) ────────────────────────
    // sq[0]=1014 (eta), sq[1]=2458 (beta/gamma), sq[2]=2765 (alpha)
    {
        out << "// --- Oink phase ---\n";
        auto fp = arith_fp(0, sq[0] + 1);
        print_fp(out, "OINK_PRE_ETA_ARITH", fp);

        fp = arith_fp(sq[0] + 1, sq[1] + 1);
        print_fp(out, "OINK_ETA_TO_BETA_ARITH", fp);

        fp = arith_fp(sq[1] + 1, sq[2] + 1);
        print_fp(out, "OINK_BETA_TO_ALPHA_ARITH", fp);
        out << "\n";
    }

    // ── Gate challenge: gates sq[2]+1 through sq[3] ──────────────────────────
    {
        out << "// --- Gate challenge ---\n";
        auto fp = arith_fp(sq[2] + 1, sq[3] + 1);
        print_fp(out, "GATE_CHALLENGE_ARITH", fp);
        out << "\n";
    }

    // ── Main Sumcheck rounds ──────────────────────────────────────────────────
    // Round 0: sq[3]+1 .. sq[4]
    // Round 1: sq[4]+1 .. sq[5]
    // Rounds 2-23: sq[k]+1 .. sq[k+1]
    {
        out << "// --- Main Sumcheck ---\n";
        auto fp0 = arith_fp(sq[3] + 1, sq[4] + 1);
        print_fp(out, "MAIN_SUMCHECK_ROUND_0_ARITH", fp0);

        auto fp1 = arith_fp(sq[4] + 1, sq[5] + 1);
        print_fp(out, "MAIN_SUMCHECK_ROUND_1_ARITH", fp1);

        // Rounds 2-23 should be identical
        auto fp2 = arith_fp(sq[5] + 1, sq[6] + 1);
        print_fp(out, "MAIN_SUMCHECK_ROUND_N_ARITH", fp2);

        // Verify rounds 2-23 are actually identical
        bool all_same = true;
        for (size_t r = 2; r < 24; ++r) {
            auto fpR = arith_fp(sq[3 + r] + 1, sq[3 + r + 1] + 1);
            if (fpR.full_hash != fp2.full_hash || fpR.gate_count != fp2.gate_count) {
                out << "// WARNING: round " << r << " differs from round 2!\n";
                print_fp(out, ("MAIN_SUMCHECK_ROUND_" + std::to_string(r) + "_ARITH").c_str(), fpR);
                all_same = false;
            }
        }
        if (all_same) {
            out << "// Rounds 2-23: confirmed identical (same fingerprint as ROUND_N)\n";
        }
        out << "\n";
    }

    // ── Batching challenges ───────────────────────────────────────────────────
    // 33 squeezes [28..60]. Expect all 33 to share the same fingerprint.
    {
        out << "// --- Batching challenges ---\n";
        // Transition from main Sumcheck to batching: sq[27]+1 .. sq[28]
        auto fp_trans = arith_fp(sq[27] + 1, sq[28] + 1);
        print_fp(out, "BATCHING_TRANSITION_ARITH", fp_trans);

        // Typical batching block (round 1 = sq[28]+1 .. sq[29])
        auto fp_batch = arith_fp(sq[28] + 1, sq[29] + 1);
        print_fp(out, "BATCHING_CHALLENGE_ARITH", fp_batch);

        // Verify all subsequent batching rounds are identical
        bool batch_same = true;
        for (size_t k = 29; k < 60; ++k) {
            auto fpK = arith_fp(sq[k] + 1, sq[k + 1] + 1);
            if (fpK.full_hash != fp_batch.full_hash || fpK.gate_count != fp_batch.gate_count) {
                out << "// WARNING: batching round " << (k - 28) << " differs!\n";
                print_fp(out, ("BATCHING_ROUND_" + std::to_string(k - 28) + "_ARITH").c_str(), fpK);
                batch_same = false;
            }
        }
        if (batch_same) {
            out << "// Batching rounds 1-32: confirmed identical\n";
        }
        out << "\n";
    }

    // ── MLB alpha + Sumcheck + claim_batching ─────────────────────────────────
    {
        out << "// --- MLB phase ---\n";
        // Transition: sq[60]+1 .. sq[61] (batching end to MLB alpha)
        auto fp_mlb_alpha = arith_fp(sq[60] + 1, sq[61] + 1);
        print_fp(out, "MLB_ALPHA_ARITH", fp_mlb_alpha);

        // MLB Sumcheck round 0: sq[61]+1 .. sq[62]
        auto fp_mlb0 = arith_fp(sq[61] + 1, sq[62] + 1);
        print_fp(out, "MLB_SUMCHECK_ROUND_0_ARITH", fp_mlb0);

        // MLB Sumcheck round 1: sq[62]+1 .. sq[63]
        auto fp_mlb1 = arith_fp(sq[62] + 1, sq[63] + 1);
        print_fp(out, "MLB_SUMCHECK_ROUND_1_ARITH", fp_mlb1);

        // MLB Sumcheck rounds 2-23 (should be identical)
        auto fp_mlbN = arith_fp(sq[63] + 1, sq[64] + 1);
        print_fp(out, "MLB_SUMCHECK_ROUND_N_ARITH", fp_mlbN);

        bool mlb_same = true;
        for (size_t r = 2; r < 24; ++r) {
            auto fpR = arith_fp(sq[61 + r] + 1, sq[61 + r + 1] + 1);
            if (fpR.full_hash != fp_mlbN.full_hash || fpR.gate_count != fp_mlbN.gate_count) {
                out << "// WARNING: MLB round " << r << " differs!\n";
                print_fp(out, ("MLB_SUMCHECK_ROUND_" + std::to_string(r) + "_ARITH").c_str(), fpR);
                mlb_same = false;
            }
        }
        if (mlb_same) {
            out << "// MLB rounds 2-23: confirmed identical\n";
        }

        // claim_batching: sq[85]+1 .. sq[86]
        auto fp_claim = arith_fp(sq[85] + 1, sq[86] + 1);
        print_fp(out, "CLAIM_BATCHING_ARITH", fp_claim);
        out << "\n";
    }

    // ── Poseidon2 blocks: per-phase linked fingerprints ───────────────────────
    {
        HNAnalyzer analyzer(builder, false);
        out << "// --- Poseidon2 linked fingerprints (arith window -> pos2_ext -> pos2_int) ---\n";

        const auto extract_and_print = [&](const char* prefix, size_t arith_start, size_t arith_end) {
            const auto linked = hn_extract_linked_poseidon_fps(builder, analyzer, arith_start, arith_end);
            print_linked_poseidon_fps(out, prefix, linked);
        };

        // Oink: each inter-squeeze window ends at the challenge squeeze gate.
        extract_and_print("OINK_PRE_ETA", 0, sq[0] + 1);
        extract_and_print("OINK_ETA_TO_BETA", sq[0] + 1, sq[1] + 1);
        extract_and_print("OINK_BETA_TO_ALPHA", sq[1] + 1, sq[2] + 1);

        // Gate challenge + representative Sumcheck / batching / MLB windows.
        extract_and_print("GATE_CHALLENGE", sq[2] + 1, sq[3] + 1);
        extract_and_print("MAIN_SUMCHECK_ROUND_0", sq[3] + 1, sq[4] + 1);
        extract_and_print("MAIN_SUMCHECK_ROUND_N", sq[5] + 1, sq[6] + 1);
        extract_and_print("BATCHING_TRANSITION", sq[27] + 1, sq[28] + 1);
        extract_and_print("BATCHING_CHALLENGE", sq[28] + 1, sq[29] + 1);
        extract_and_print("MLB_ALPHA", sq[60] + 1, sq[61] + 1);
        extract_and_print("MLB_SUMCHECK_ROUND_0", sq[61] + 1, sq[62] + 1);
        extract_and_print("MLB_SUMCHECK_ROUND_N", sq[63] + 1, sq[64] + 1);
        extract_and_print("CLAIM_BATCHING", sq[85] + 1, sq[86] + 1);

        out << "\n// --- Poseidon2 full-block fingerprint (Mega merged ext+int into one block) ---\n";
        const size_t p2_size = builder.blocks.poseidon2.size();
        print_fp(out, "POSEIDON2_FULL", pos2_ext_fp(0, p2_size));
    }

    info("Fingerprint constants written to hn_fingerprints.txt");
    SUCCEED();
}

// ============================================================================
// Phase 3: Fingerprint pinning tests
// ============================================================================

// Helper: assert two fingerprints match (gate_count, prefix_hash, full_hash).
#define EXPECT_FP_MATCH(label, expected, actual)                                                                       \
    do {                                                                                                               \
        EXPECT_EQ((expected).gate_count, (actual).gate_count) << (label) << " gate_count mismatch";                    \
        EXPECT_EQ((expected).prefix_hash, (actual).prefix_hash) << (label) << " prefix_hash mismatch";                 \
        EXPECT_EQ((expected).full_hash, (actual).full_hash) << (label) << " full_hash mismatch";                       \
    } while (0)

// 3.3a: Oink phase fingerprints match stored constants.
TEST_F(BoomerangHNRecursionTests, HNOinkFingerprintMatch)
{
    BB_DISABLE_ASSERTS();
    HNBuilder builder = build_reset_kernel_circuit();
    const auto sq = recursion_helpers::find_all_transcript_squeeze_gates(builder);
    ASSERT_GE(sq.size(), HNVerification::HN_SQUEEZE_OINK_ALPHA + 1UL);

    namespace HN = HNVerification;

    EXPECT_FP_MATCH("OINK_PRE_ETA",
                    HN::OINK_PRE_ETA_ARITH,
                    hn_compute_fingerprint(builder, HN_BLOCK_ARITHMETIC, 0, sq[HN::HN_SQUEEZE_OINK_ETA] + 1));

    EXPECT_FP_MATCH(
        "OINK_ETA_TO_BETA",
        HN::OINK_ETA_TO_BETA_ARITH,
        hn_compute_fingerprint(
            builder, HN_BLOCK_ARITHMETIC, sq[HN::HN_SQUEEZE_OINK_ETA] + 1, sq[HN::HN_SQUEEZE_OINK_BETA] + 1));

    EXPECT_FP_MATCH(
        "OINK_BETA_TO_ALPHA",
        HN::OINK_BETA_TO_ALPHA_ARITH,
        hn_compute_fingerprint(
            builder, HN_BLOCK_ARITHMETIC, sq[HN::HN_SQUEEZE_OINK_BETA] + 1, sq[HN::HN_SQUEEZE_OINK_ALPHA] + 1));
}

// 3.3b: Gate challenge + batching challenge both share CHALLENGE_EXTRACT_25_ARITH.
TEST_F(BoomerangHNRecursionTests, HNChallengExtract25FingerprintMatch)
{
    BB_DISABLE_ASSERTS();
    HNBuilder builder = build_reset_kernel_circuit();
    const auto sq = recursion_helpers::find_all_transcript_squeeze_gates(builder);
    namespace HN = HNVerification;

    // Gate challenge block (sq[2]+1 .. sq[3])
    EXPECT_FP_MATCH(
        "GATE_CHALLENGE",
        HN::CHALLENGE_EXTRACT_25_ARITH,
        hn_compute_fingerprint(
            builder, HN_BLOCK_ARITHMETIC, sq[HN::HN_SQUEEZE_OINK_ALPHA] + 1, sq[HN::HN_SQUEEZE_GATE_CHALLENGE] + 1));

    // One batching challenge block
    EXPECT_FP_MATCH("BATCHING_CHALLENGE",
                    HN::CHALLENGE_EXTRACT_25_ARITH,
                    hn_compute_fingerprint(builder,
                                           HN_BLOCK_ARITHMETIC,
                                           sq[HN::HN_SQUEEZE_BATCHING_FIRST] + 1,
                                           sq[HN::HN_SQUEEZE_BATCHING_FIRST + 1] + 1));
}

// 3.3c: Main Sumcheck round fingerprints.
TEST_F(BoomerangHNRecursionTests, HNMainSumcheckFingerprintMatch)
{
    BB_DISABLE_ASSERTS();
    HNBuilder builder = build_reset_kernel_circuit();
    const auto sq = recursion_helpers::find_all_transcript_squeeze_gates(builder);
    namespace HN = HNVerification;

    const size_t base = HN::HN_SQUEEZE_GATE_CHALLENGE; // sq[3] = gate_challenge

    // Round 0
    EXPECT_FP_MATCH("MAIN_SC_ROUND_0",
                    HN::MAIN_SUMCHECK_ROUND_0_ARITH,
                    hn_compute_fingerprint(builder, HN_BLOCK_ARITHMETIC, sq[base] + 1, sq[base + 1] + 1));

    // Round 1
    EXPECT_FP_MATCH("MAIN_SC_ROUND_1",
                    HN::MAIN_SUMCHECK_ROUND_1_ARITH,
                    hn_compute_fingerprint(builder, HN_BLOCK_ARITHMETIC, sq[base + 1] + 1, sq[base + 2] + 1));

    // Round 2
    EXPECT_FP_MATCH("MAIN_SC_ROUND_2",
                    HN::MAIN_SUMCHECK_ROUND_2_ARITH,
                    hn_compute_fingerprint(builder, HN_BLOCK_ARITHMETIC, sq[base + 2] + 1, sq[base + 3] + 1));

    // Rounds 3–23: all must match ROUND_STD
    for (size_t r = 3; r <= 23; ++r) {
        EXPECT_FP_MATCH(("MAIN_SC_ROUND_" + std::to_string(r)).c_str(),
                        HN::MAIN_SUMCHECK_ROUND_STD_ARITH,
                        hn_compute_fingerprint(builder, HN_BLOCK_ARITHMETIC, sq[base + r] + 1, sq[base + r + 1] + 1));
    }
}

// 3.3d: Batching transition and challenge blocks.
TEST_F(BoomerangHNRecursionTests, HNBatchingFingerprintMatch)
{
    BB_DISABLE_ASSERTS();
    HNBuilder builder = build_reset_kernel_circuit();
    const auto sq = recursion_helpers::find_all_transcript_squeeze_gates(builder);
    namespace HN = HNVerification;

    // Transition: end of main Sumcheck → first batching squeeze
    EXPECT_FP_MATCH(
        "BATCHING_TRANSITION",
        HN::BATCHING_TRANSITION_ARITH,
        hn_compute_fingerprint(
            builder, HN_BLOCK_ARITHMETIC, sq[HN::HN_SQUEEZE_MAIN_SC_LAST] + 1, sq[HN::HN_SQUEEZE_BATCHING_FIRST] + 1));

    // All 28 subsequent batching blocks must match CHALLENGE_EXTRACT_25_ARITH
    for (size_t k = HN::HN_SQUEEZE_BATCHING_FIRST; k < HN::HN_SQUEEZE_BATCHING_LAST; ++k) {
        EXPECT_FP_MATCH(("BATCHING_BLOCK_" + std::to_string(k - HN::HN_SQUEEZE_BATCHING_FIRST + 1)).c_str(),
                        HN::CHALLENGE_EXTRACT_25_ARITH,
                        hn_compute_fingerprint(builder, HN_BLOCK_ARITHMETIC, sq[k] + 1, sq[k + 1] + 1));
    }
}

// 3.3e: MLB phase fingerprints.
TEST_F(BoomerangHNRecursionTests, HNMLBSumcheckFingerprintMatch)
{
    BB_DISABLE_ASSERTS();
    HNBuilder builder = build_reset_kernel_circuit();
    const auto sq = recursion_helpers::find_all_transcript_squeeze_gates(builder);
    namespace HN = HNVerification;

    // MLB alpha block
    EXPECT_FP_MATCH(
        "MLB_ALPHA",
        HN::MLB_ALPHA_ARITH,
        hn_compute_fingerprint(
            builder, HN_BLOCK_ARITHMETIC, sq[HN::HN_SQUEEZE_BATCHING_LAST] + 1, sq[HN::HN_SQUEEZE_MLB_ALPHA] + 1));

    const size_t mlb_base = HN::HN_SQUEEZE_MLB_ALPHA;

    // MLB Sumcheck round 0
    EXPECT_FP_MATCH("MLB_SC_ROUND_0",
                    HN::MLB_SUMCHECK_ROUND_0_ARITH,
                    hn_compute_fingerprint(builder, HN_BLOCK_ARITHMETIC, sq[mlb_base] + 1, sq[mlb_base + 1] + 1));

    // MLB Sumcheck rounds 1–23 (all identical)
    for (size_t r = 1; r <= 23; ++r) {
        EXPECT_FP_MATCH(
            ("MLB_SC_ROUND_" + std::to_string(r)).c_str(),
            HN::MLB_SUMCHECK_ROUND_STD_ARITH,
            hn_compute_fingerprint(builder, HN_BLOCK_ARITHMETIC, sq[mlb_base + r] + 1, sq[mlb_base + r + 1] + 1));
    }

    // Claim batching block (MLB SC round 20 end → claim_batching squeeze)
    EXPECT_FP_MATCH(
        "CLAIM_BATCHING",
        HN::CLAIM_BATCHING_ARITH,
        hn_compute_fingerprint(
            builder, HN_BLOCK_ARITHMETIC, sq[HN::HN_SQUEEZE_MLB_SC_LAST] + 1, sq[HN::HN_SQUEEZE_CLAIM_BATCHING] + 1));
}

// (HNPostMLBFingerprintMatch removed: a RESET kernel has no squeezes past claim_batching -- see the
// note above HN_SQUEEZE_POST_MLB_FIRST in hypernova_verification.hpp -- so there is no post-MLB
// region left on this kernel type to fingerprint.)

// ============================================================================
// Phase 4: Anchor uniqueness tests
// ============================================================================
// For each anchor, we verify structural uniqueness in the circuit:
//   (a) exactly N squeezes matching the expected pattern exist at the expected positions
//   (b) the anchor is distinguishable from neighboring squeezes by position or spacing
//   (c) the phase-start fingerprint matches at the expected offset from the anchor

// Helper: verify that the squeeze at index sq_idx belongs to an isolated group
// (gap to prev and next squeeze larger than expected within-phase spacing).
static void expect_isolated_squeeze(const std::vector<size_t>& sq,
                                    size_t sq_idx,
                                    size_t expected_arith_pos,
                                    size_t min_gap_before,
                                    size_t min_gap_after,
                                    const char* label)
{
    SCOPED_TRACE(label);
    ASSERT_LT(sq_idx, sq.size());
    EXPECT_EQ(sq[sq_idx], expected_arith_pos) << label << " position";
    if (sq_idx > 0) {
        EXPECT_GE(sq[sq_idx] - sq[sq_idx - 1], min_gap_before) << label << " gap_before";
    }
    if (sq_idx + 1 < sq.size()) {
        EXPECT_GE(sq[sq_idx + 1] - sq[sq_idx], min_gap_after) << label << " gap_after";
    }
}

// 4.1: Anchor uniqueness — verify all 6 top-candidate anchors are structurally unique.
TEST_F(BoomerangHNRecursionTests, HNAnchorUniqueness)
{
    BB_DISABLE_ASSERTS();
    HNBuilder builder = build_reset_kernel_circuit();
    const auto sq = recursion_helpers::find_all_transcript_squeeze_gates(builder);
    ASSERT_EQ(sq.size(), HNVerification::HN_RESET_TOTAL_SQUEEZES);
    namespace HN = HNVerification;

    // ── Anchor 1: Oink eta (sq[0]) ───────────────────────────────────────────
    // Only squeeze before position 1000. Gap to next = 1399 arith gates.
    expect_isolated_squeeze(sq,
                            HN::HN_SQUEEZE_OINK_ETA,
                            271,
                            /*min_gap_before=*/0,
                            /*min_gap_after=*/1000,
                            "OinkEta");
    // No other squeeze exists before position 1000
    size_t squeezes_before_1000 = 0;
    for (size_t g : sq) {
        if (g < 1000)
            ++squeezes_before_1000;
    }
    EXPECT_EQ(squeezes_before_1000, 1UL) << "OinkEta uniqueness: multiple squeezes before arith 1000";

    // ── Anchor 2: Main Sumcheck round 0 start (sq[4]) ────────────────────────
    // First squeeze of the 24-squeeze group with ~67-68-gate spacing.
    // Distinguishable from batching (spacing 20) and MLB SC (spacing 42).
    {
        const size_t main_sc_first = sq[HN::HN_SQUEEZE_MAIN_SC_FIRST];
        const size_t main_sc_last = sq[HN::HN_SQUEEZE_MAIN_SC_LAST];
        EXPECT_EQ(main_sc_first, 2006UL);
        EXPECT_EQ(main_sc_last, 3569UL);

        // All 23 spacing values should be in range [60, 90] (not 20 and not 42)
        bool all_in_range = true;
        for (size_t i = HN::HN_SQUEEZE_MAIN_SC_FIRST; i < HN::HN_SQUEEZE_MAIN_SC_LAST; ++i) {
            const size_t gap = sq[i + 1] - sq[i];
            if (gap < 60 || gap > 90) {
                all_in_range = false;
                ADD_FAILURE() << "Main SC gap out of [60,90] at round " << (i - HN::HN_SQUEEZE_MAIN_SC_FIRST)
                              << ": gap=" << gap;
            }
        }
        EXPECT_TRUE(all_in_range) << "Main Sumcheck spacing uniqueness";

        // Gap before the main SC group — transition from gate_challenge
        EXPECT_GE(main_sc_first - sq[HN::HN_SQUEEZE_GATE_CHALLENGE], 100UL)
            << "Main SC group must have >100 gate gap from gate_challenge";
        // Large gap after the main SC group — transition to batching
        EXPECT_GE(sq[HN::HN_SQUEEZE_BATCHING_FIRST] - main_sc_last, 500UL)
            << "Main SC group must have >500 gate gap to batching";
    }

    // ── Anchor 3: Batching start (sq[28]) ────────────────────────────────────
    // First squeeze of the 33-squeeze group with exactly-20-gate spacing.
    {
        const size_t batch_first = sq[HN::HN_SQUEEZE_BATCHING_FIRST];
        const size_t batch_last = sq[HN::HN_SQUEEZE_BATCHING_LAST];
        EXPECT_EQ(batch_first, 4353UL);
        EXPECT_EQ(batch_last, 4993UL);

        // All 32 spacings should be exactly 20
        for (size_t i = HN::HN_SQUEEZE_BATCHING_FIRST; i < HN::HN_SQUEEZE_BATCHING_LAST; ++i) {
            EXPECT_EQ(sq[i + 1] - sq[i], 20UL) << "Batching spacing not 20 at index " << i;
        }
        // Large gap before
        EXPECT_GE(batch_first - sq[HN::HN_SQUEEZE_MAIN_SC_LAST], 500UL)
            << "Batching group must have >500 gate gap from main SC end";
        // Moderate gap after
        EXPECT_GE(sq[HN::HN_SQUEEZE_MLB_ALPHA] - batch_last, 40UL)
            << "Batching group must have >40 gate gap to MLB alpha";
    }

    // ── Anchor 4: MLB alpha (sq[61]) ─────────────────────────────────────────
    // Isolated squeeze flanked by large gaps on both sides.
    expect_isolated_squeeze(sq,
                            HN::HN_SQUEEZE_MLB_ALPHA,
                            5045,
                            /*min_gap_before=*/40,
                            /*min_gap_after=*/100,
                            "MLBAlpha");

    // ── Anchor 5: MLB Sumcheck start (sq[62]) ────────────────────────────────
    // First squeeze of the 24-squeeze group with exactly-42-gate spacing.
    {
        const size_t mlb_first = sq[HN::HN_SQUEEZE_MLB_SC_FIRST];
        const size_t mlb_last = sq[HN::HN_SQUEEZE_MLB_SC_LAST];
        EXPECT_EQ(mlb_first, 5205UL);
        EXPECT_EQ(mlb_last, 6171UL);

        // All 23 spacings should be exactly 42
        for (size_t i = HN::HN_SQUEEZE_MLB_SC_FIRST; i < HN::HN_SQUEEZE_MLB_SC_LAST; ++i) {
            EXPECT_EQ(sq[i + 1] - sq[i], 42UL) << "MLB SC spacing not 42 at index " << i;
        }
        // Gap from MLB alpha to first MLB SC squeeze
        EXPECT_GE(mlb_first - sq[HN::HN_SQUEEZE_MLB_ALPHA], 100UL)
            << "MLB SC group must have >100 gate gap from MLB alpha";
    }

    // ── Anchor 6: claim_batching (sq[86]) ────────────────────────────────────
    // Last squeeze in a baseline (non-FINAL) kernel -- no post-MLB group follows (see the note
    // above HN_SQUEEZE_POST_MLB_FIRST in hypernova_verification.hpp), so min_gap_after is unchecked.
    expect_isolated_squeeze(sq,
                            HN::HN_SQUEEZE_CLAIM_BATCHING,
                            6225,
                            /*min_gap_before=*/50,
                            /*min_gap_after=*/300,
                            "ClaimBatching");
}

// 4.2: Anchor stability across kernel types (INIT, INNER, TAIL, HIDING).
// For each variant, verify that:
//   (a) transcript squeeze gates still exist (circuit is non-trivial)
//   (b) the HN-like phases (where applicable) still show up at recognizable positions
//   (c) the anchor fingerprints for BATCHING and MLB_SUMCHECK_STD remain stable
//      (they should — these are protocol-level structures, not kernel-type-specific)
TEST_F(BoomerangHNRecursionTests, HNAnchorStabilityAcrossKernels)
{
    BB_DISABLE_ASSERTS();
    namespace HN = HNVerification;

    // Helper: verify that batching+MLB fingerprints survive in an arbitrary HN kernel.
    // We only verify the structural SPACING of squeeze groups, not absolute positions
    // (since different kernel types have different total gate counts and positions).
    const auto check_hn_squeeze_structure = [&](HNBuilder& builder,
                                                const char* kernel_name,
                                                size_t expected_main_sc_rounds,
                                                size_t expected_batching_squeezes,
                                                size_t expected_mlb_sc_rounds) {
        SCOPED_TRACE(kernel_name);
        const auto sq = recursion_helpers::find_all_transcript_squeeze_gates(builder);
        ASSERT_GE(sq.size(), 10UL) << kernel_name << ": too few squeezes";

        // Find the 24-long regular-spacing group (main Sumcheck) by scanning for
        // consecutive squeezes with spacing in [60, 90].
        size_t main_sc_run_start = sq.size();
        size_t main_sc_run_len = 0;
        for (size_t i = 0; i + 1 < sq.size(); ++i) {
            const size_t gap = sq[i + 1] - sq[i];
            if (gap >= 60 && gap <= 90) {
                if (main_sc_run_len == 0) {
                    main_sc_run_start = i;
                }
                ++main_sc_run_len;
            } else {
                if (main_sc_run_len >= expected_main_sc_rounds - 1) {
                    break;
                }
                main_sc_run_start = sq.size();
                main_sc_run_len = 0;
            }
        }
        EXPECT_GE(main_sc_run_len, expected_main_sc_rounds - 1)
            << kernel_name << ": main Sumcheck spacing group not found";

        // Find 20-spacing group (batching) after main SC
        size_t batch_run_len = 0;
        for (size_t i = main_sc_run_start + main_sc_run_len + 1;
             i + 1 < sq.size() && batch_run_len < expected_batching_squeezes - 1;
             ++i) {
            const size_t gap = sq[i + 1] - sq[i];
            if (gap == 20) {
                ++batch_run_len;
            } else if (batch_run_len > 0) {
                break;
            }
        }
        EXPECT_GE(batch_run_len, expected_batching_squeezes - 2) << kernel_name << ": batching spacing group not found";

        // Find 42-spacing group (MLB Sumcheck) after batching
        size_t mlb_run_len = 0;
        for (size_t i = 0; i + 1 < sq.size(); ++i) {
            const size_t gap = sq[i + 1] - sq[i];
            if (gap == 42) {
                ++mlb_run_len;
            } else if (mlb_run_len > 2) {
                break;
            }
        }
        EXPECT_GE(mlb_run_len, expected_mlb_sc_rounds - 2) << kernel_name << ": MLB Sumcheck spacing group not found";
    };

    // RESET kernel (baseline — already confirmed in other tests)
    {
        HNBuilder builder = build_reset_kernel_circuit();
        check_hn_squeeze_structure(builder, "RESET", 24, 33, 24);
    }

    // TAIL kernel: HN_TAIL proof — adds ZK masking gates but same HN verification core
    {
        HNBuilder builder = build_hn_kernel_circuit(PROOF_TYPE::HN);
        check_hn_squeeze_structure(builder, "TAIL", 24, 33, 24);
    }

    // HIDING kernel: HN_FINAL proof — adds decider verification on top of folding
    {
        HNAcirSetup setup = make_hn_acir_setup(PROOF_TYPE::HN_FINAL, /*is_kernel=*/true);
        HNBuilder builder = build_hn_circuit_from_acir(setup);
        const auto sq = recursion_helpers::find_all_transcript_squeeze_gates(builder);
        // HIDING has extra stages (decider), so just verify total > RESET total
        EXPECT_GT(sq.size(), HN::HN_RESET_TOTAL_SQUEEZES)
            << "HIDING kernel should have more squeezes than RESET (extra decider)";
    }

    // INNER kernel: two HN proofs — expect twice the main pipeline
    {
        HNBuilder builder = build_inner_kernel_circuit();
        const auto sq = recursion_helpers::find_all_transcript_squeeze_gates(builder);
        // Should have ~2x the RESET squeeze count (two verification loops)
        EXPECT_GT(sq.size(), HN::HN_RESET_TOTAL_SQUEEZES)
            << "INNER kernel should have more squeezes than RESET (two verification loops)";
    }
}

// ============================================================================
// Phase 5: Stage validators
// ============================================================================

// 5.1e: Witness link test — Oink squeeze gates link to Poseidon2 external block.
// Verifies the challenge is actually derived from a Poseidon2 hash, not from an
// unlinked arithmetic gate.
TEST_F(BoomerangHNRecursionTests, ValidateHNOinkArithLinksToPos2Ext)
{
    BB_DISABLE_ASSERTS();
    HNBuilder builder = build_reset_kernel_circuit();
    const auto sq = recursion_helpers::find_all_transcript_squeeze_gates(builder);
    HNAnalyzer analyzer(builder, false);

    // For each Oink squeeze gate, check that at least one wire variable
    // also appears in the poseidon2_external block.
    const size_t p2ext_block_idx = HN_BLOCK_POSEIDON2_EXT;
    auto& arith = builder.blocks.arithmetic;

    for (size_t si = 0; si <= HNVerification::HN_SQUEEZE_OINK_ALPHA; ++si) {
        SCOPED_TRACE("Oink squeeze " + std::to_string(si));
        const size_t g = sq[si];
        bool found_link = false;

        for (uint32_t wire_raw : { arith.w_l()[g], arith.w_r()[g], arith.w_o()[g], arith.w_4()[g] }) {
            const uint32_t v = builder.real_variable_index[wire_raw];
            for (const auto& [blk_idx, g_idx] : analyzer.get_variable_gates(v)) {
                if (blk_idx == p2ext_block_idx) {
                    found_link = true;
                    break;
                }
            }
            if (found_link) {
                break;
            }
        }
        EXPECT_TRUE(found_link) << "Oink squeeze[" << si << "] has no witness link to poseidon2_external";
    }
}

// 5.1f: Witness link test (HN.4) — the opcode's key_hash lands in the oink vk_hash poseidon2 region.
// key_hash is (with key[]) the ONLY ACIR witness an HN opcode consumes; the fold proof is native queue data.
// Oink's vk_hash stage hashes the VK via poseidon2 and constrains the digest == key_hash. key_hash itself is
// never re-materialized as an arithmetic-block witness post quad-compression (only the absorbed digest is,
// reachable from the poseidon2 gate via a witness link) — OinkVerifierValidation::validate_vk_hash_stage is
// dead code here (it anchors against a separate, unmaintained VK_HASH_POSEIDON2_EXT/VK_HASH_ARITHMETIC pair
// that validate_hn_baseline_impl's oink stage does not use). The real, currently-maintained anchor is
// OINK_PRE_ETA_ARITH, positioned at [sq[HN_SQUEEZE_OINK_ETA]+1 - gate_count, sq[HN_SQUEEZE_OINK_ETA]+1) — so
// this test instead proves key_hash's poseidon2_external gate links (via collect_linked_gates) into an
// arithmetic gate inside that exact window. Family-wide (shared fold-core oink), exercised on plain-HN/RESET.
TEST_F(BoomerangHNRecursionTests, ValidateHNKeyHashLinksToVkHashPoseidon2)
{
    BB_DISABLE_ASSERTS();
    HNAcirSetup setup = make_hn_acir_setup(PROOF_TYPE::HN, /*is_kernel=*/true);
    const RecursionConstraint& constraint = setup.hn_constraint(0);
    ASSERT_NE(constraint.key_hash, 0U);

    HNBuilder builder = build_hn_circuit_from_acir(setup);
    HNAnalyzer analyzer(builder, false);
    const auto sq = recursion_helpers::find_all_transcript_squeeze_gates(builder);

    auto& poseidon2_external = builder.blocks.poseidon2; // Mega merged poseidon2_external/poseidon2_quad_internal
    auto& arith = builder.blocks.arithmetic;
    const uint32_t key_hash_real = builder.real_variable_index[constraint.key_hash];

    std::vector<size_t> key_hash_p2_gates;
    for (const auto& [blk, g] : analyzer.get_variable_gates(key_hash_real)) {
        if (blk == HN_BLOCK_POSEIDON2_EXT) {
            key_hash_p2_gates.push_back(g);
        }
    }
    ASSERT_FALSE(key_hash_p2_gates.empty()) << "key_hash not linked to the vk_hash poseidon2 region";

    const size_t pre_eta_end = sq[HNVerification::HN_SQUEEZE_OINK_ETA] + 1;
    ASSERT_GE(pre_eta_end, HNVerification::OINK_PRE_ETA_ARITH.gate_count);
    const size_t pre_eta_start = pre_eta_end - HNVerification::OINK_PRE_ETA_ARITH.gate_count;

    bool linked_into_pre_eta_window = false;
    for (size_t p2_gate : key_hash_p2_gates) {
        for (size_t g : recursion_helpers::collect_linked_gates(
                 builder, analyzer, poseidon2_external, p2_gate, p2_gate + 1, arith)) {
            if (g >= pre_eta_start && g < pre_eta_end) {
                linked_into_pre_eta_window = true;
                break;
            }
        }
        if (linked_into_pre_eta_window) {
            break;
        }
    }
    EXPECT_TRUE(linked_into_pre_eta_window)
        << "key_hash's vk_hash poseidon2 usage doesn't link into the validated oink pre-eta window";
}

// ============================================================================
// Phase 7: Extension kernel validators
// ============================================================================
//
// (Phase 7 discovery helper + HNExtensionKernelSqueezeCounts, an assertion-free squeeze-position
// dump across RESET/TAIL/HIDING/INNER/INIT used during initial reverse-engineering, removed: every
// shape it explored now has its own dedicated validator + pinning tests below/in the per-kernel
// test files, so the dump had no remaining regression value.)

// 7.2: TAIL kernel — structurally identical to RESET; same cursor-chain validate_hn_baseline.
TEST_F(BoomerangHNRecursionTests, ValidateHNTailKernel)
{
    BB_DISABLE_ASSERTS();
    HNAcirSetup setup = make_hn_acir_setup(PROOF_TYPE::HN, /*is_kernel=*/true);
    HNBuilder builder = build_hn_circuit_from_acir(setup);
    HNAnalyzer analyzer(builder, false);

    auto result = HNVerification::validate_hn_baseline<bb::fr>(builder, analyzer, &setup.hn_constraint(0));

    EXPECT_TRUE(result.all_valid);
    EXPECT_TRUE(result.arith_coverage_valid);
    EXPECT_TRUE(result.poseidon2_coverage_valid);
    EXPECT_TRUE(result.batching.valid);
    EXPECT_EQ(result.batching.squeezes_found, HNVerification::RESET_NUM_BATCHING_CHALLENGE_WINDOWS);
}

/**
 * @brief TAIL kernel: corrupting a gate in the arith prefix fails cursor-chain coverage.
 */
TEST_F(BoomerangHNRecursionTests, ValidateHNTailDetectsCorruption)
{
    BB_DISABLE_ASSERTS();
    HNAcirSetup setup = make_hn_acir_setup(PROOF_TYPE::HN, /*is_kernel=*/true);
    HNBuilder builder = build_hn_circuit_from_acir(setup);
    HNAnalyzer analyzer(builder, false);

    auto& arith = builder.blocks.arithmetic;
    for (size_t g = 0; g < HNVerification::RESET_OINK_MAINSC_LIVE_ARITH.gate_count; ++g) {
        if (!recursion_helpers::is_fix_witness_gate(builder, g)) {
            arith.q_m().set(g, bb::fr(42));
            break;
        }
    }
    auto result = HNVerification::validate_hn_baseline<bb::fr>(builder, analyzer, &setup.hn_constraint(0));
    EXPECT_FALSE(result.all_valid);
}

// Gate offset where the RESET/FINAL-shared fold-core ends (post-claim_batching) -- the F2/F3 boundary in
// the cursor-chain model. Recomputed inline (not read from a live `validate_hn_hiding` result) so
// corruption tests can target a region before running the validator under test.
static size_t hn_final_shared_fold_core_end()
{
    return HNVerification::RESET_OINK_MAINSC_LIVE_ARITH.gate_count +
           HNVerification::RESET_PRE_BATCHING_PADDING_ARITH.gate_count +
           HNVerification::RESET_NUM_BATCHING_CHALLENGE_WINDOWS *
               HNVerification::RESET_BATCHING_CHALLENGE_WINDOW_ARITH.gate_count +
           HNVerification::RESET_MLB_AND_CLAIM_BATCHING_ARITH.gate_count;
}

// 7.3 / 9.8: HIDING (HN_FINAL) kernel — shared fold-core (F2) through claim_batching, then the combined
// FINAL-only decider+batch-merge fingerprint chain (F3+F5+tail), then the trailing hiding mask (F6).
TEST_F(BoomerangHNRecursionTests, ValidateHNHidingKernel)
{
    BB_DISABLE_ASSERTS();
    HNAcirSetup setup = make_hn_acir_setup(PROOF_TYPE::HN_FINAL, /*is_kernel=*/true);
    const RecursionConstraint& constraint = setup.hn_constraint(0);
    HNBuilder builder = build_hn_circuit_from_acir(setup);

    auto result = HNVerification::validate_hn_hiding(builder, &constraint);

    EXPECT_TRUE(result.all_valid);
    EXPECT_TRUE(result.baseline.mlb.valid);  // F2 fold-core (through claim_batching)
    EXPECT_TRUE(result.decider_merge.valid); // F3+F5+tail: decider + batch-merge + HidingKernelIO
    EXPECT_TRUE(result.ecc_op.valid);        // F3+F5 EC group ops (ecc_op selectors)
    EXPECT_TRUE(result.mask.valid);          // F6 trailing ecc_op mask
}

// 9.8: corrupt a gate inside the shared fold-core (F2) region. Mirrors RESET's own baseline corruption
// test -- proves validate_hn_hiding's F2 stage is a real fingerprint check, not a squeeze-count shortcut.
TEST_F(BoomerangHNRecursionTests, ValidateHNHidingDetectsBaselineCorruption)
{
    BB_DISABLE_ASSERTS();
    HNAcirSetup setup = make_hn_acir_setup(PROOF_TYPE::HN_FINAL, /*is_kernel=*/true);
    const RecursionConstraint& constraint = setup.hn_constraint(0);
    HNBuilder builder = build_hn_circuit_from_acir(setup);

    auto& arith = builder.blocks.arithmetic;
    for (size_t g = 0; g < HNVerification::RESET_OINK_MAINSC_LIVE_ARITH.gate_count; ++g) {
        if (!recursion_helpers::is_fix_witness_gate(builder, g)) {
            arith.q_m().set(g, bb::fr(42));
            break;
        }
    }

    auto result = HNVerification::validate_hn_hiding(builder, &constraint);
    EXPECT_FALSE(result.baseline.mlb.valid);
    EXPECT_FALSE(result.all_valid);
}

// 9.8: corrupt a gate near the START of the combined decider+batch-merge region (arith, right after the F2
// shared fold-core ends). The shared fold-core (F2) is untouched, so this proves the decider+merge
// fingerprint chain (F3+F5+tail) is a real, additive check.
TEST_F(BoomerangHNRecursionTests, ValidateHNHidingDetectsDeciderCorruption)
{
    BB_DISABLE_ASSERTS();
    HNAcirSetup setup = make_hn_acir_setup(PROOF_TYPE::HN_FINAL, /*is_kernel=*/true);
    const RecursionConstraint& constraint = setup.hn_constraint(0);
    HNBuilder builder = build_hn_circuit_from_acir(setup);

    auto& arith = builder.blocks.arithmetic;
    const size_t decider_gate = hn_final_shared_fold_core_end() + 5;
    arith.q_1().set(decider_gate, arith.q_1()[decider_gate] + bb::fr::one());

    auto result = HNVerification::validate_hn_hiding(builder, &constraint);
    EXPECT_TRUE(result.baseline.mlb.valid); // fold-core untouched — decider+merge check is strictly additive
    EXPECT_FALSE(result.decider_merge.valid);
    EXPECT_FALSE(result.all_valid);
}

// 9.8: corrupt the trailing hiding mask (F6) on the ecc_op block. F2 fold-core and F3+F5 decider+merge stay
// valid, proving the mask check is real and additive.
TEST_F(BoomerangHNRecursionTests, ValidateHNHidingDetectsMaskCorruption)
{
    BB_DISABLE_ASSERTS();
    HNAcirSetup setup = make_hn_acir_setup(PROOF_TYPE::HN_FINAL, /*is_kernel=*/true);
    const RecursionConstraint& constraint = setup.hn_constraint(0);
    HNBuilder builder = build_hn_circuit_from_acir(setup);

    // Zero the 2nd row op-wire of the first trailing random op (repoint the witness index — set_variable is
    // unavailable outside write_vk mode). validate_hn_final_mask requires it to be non-zero.
    auto& block = builder.blocks.ecc_op;
    const size_t base = block.size() - HNVerification::HNFinalValidation::HN_FINAL_MASK_ROWS;
    block.w_l()[base + 1] = builder.add_variable(bb::fr::zero());

    auto result = HNVerification::validate_hn_hiding(builder, &constraint);
    EXPECT_TRUE(result.baseline.mlb.valid);
    EXPECT_TRUE(result.decider_merge.valid); // decider+merge untouched — mask check is strictly additive
    EXPECT_FALSE(result.mask.valid);
    EXPECT_FALSE(result.all_valid);
}

// 9.9: corrupt a selector INSIDE the decider's ecc_op region (the KZG/Shplemini pairing group ops, which
// live in the Goblin ecc_op block, not arith/poseidon2). This is the region the arith+poseidon2 window
// chain and the trailing-mask check both miss; validate_hn_final_ecc_op fingerprints its selectors. F2
// fold-core and F3+F5 decider+merge (arith) stay valid, proving the ecc_op selector check is real and
// additive.
TEST_F(BoomerangHNRecursionTests, ValidateHNHidingDetectsEccOpCorruption)
{
    BB_DISABLE_ASSERTS();
    HNAcirSetup setup = make_hn_acir_setup(PROOF_TYPE::HN_FINAL, /*is_kernel=*/true);
    const RecursionConstraint& constraint = setup.hn_constraint(0);
    HNBuilder builder = build_hn_circuit_from_acir(setup);

    // Pick a row inside the hashed decider region [0, size - mask), a few rows before the trailing mask so
    // it lands among the decider's ecc_op gates (not the shared fold-core front). Bump a selector so the
    // ecc_op selector hash diverges from the pinned constant.
    auto& block = builder.blocks.ecc_op;
    ASSERT_GT(block.size(), HNVerification::HNFinalValidation::HN_FINAL_MASK_ROWS + 6);
    const size_t ecc_gate = block.size() - HNVerification::HNFinalValidation::HN_FINAL_MASK_ROWS - 6;
    block.q_1().set(ecc_gate, block.q_1()[ecc_gate] + bb::fr::one());

    auto result = HNVerification::validate_hn_hiding(builder, &constraint);
    EXPECT_TRUE(result.baseline.mlb.valid);  // fold-core untouched
    EXPECT_TRUE(result.decider_merge.valid); // arith/poseidon2 decider+merge chain untouched
    EXPECT_FALSE(result.ecc_op.valid);
    EXPECT_FALSE(result.all_valid);
}

// Corrupt a gate deep inside the combined decider+batch-merge region (what used to be the separate
// batch-merge (F5) territory before the two collapsed into one fingerprint -- see
// AcirHNFinalPostSharedCoreSqueezeDiscovery). Proves the fingerprint actually covers the FULL span, not
// just its opening gates.
TEST_F(BoomerangHNRecursionTests, ValidateHNHidingDetectsDeepDeciderMergeCorruption)
{
    BB_DISABLE_ASSERTS();
    HNAcirSetup setup = make_hn_acir_setup(PROOF_TYPE::HN_FINAL, /*is_kernel=*/true);
    const RecursionConstraint& constraint = setup.hn_constraint(0);
    HNBuilder builder = build_hn_circuit_from_acir(setup);

    auto& arith = builder.blocks.arithmetic;
    ASSERT_GT(HNVerification::HNFinalValidation::HN_FINAL_DECIDER_AND_MERGE_ARITH.gate_count, 100U);
    const size_t deep_gate = hn_final_shared_fold_core_end() +
                             HNVerification::HNFinalValidation::HN_FINAL_DECIDER_AND_MERGE_ARITH.gate_count - 100;
    arith.q_1().set(deep_gate, arith.q_1()[deep_gate] + bb::fr::one());

    auto result = HNVerification::validate_hn_hiding(builder, &constraint);
    EXPECT_TRUE(result.baseline.mlb.valid); // fold-core untouched
    EXPECT_FALSE(result.decider_merge.valid);
    EXPECT_FALSE(result.all_valid);
}

// 7.1: INNER kernel — exactly 2×90 squeezes, two structural loops.

// 7.4: INIT kernel (OINK-only path) — 67 squeezes, no MLB.

// ============================================================================
// Phase 6: Integration tests
// ============================================================================

// 6.1: Full validate_hn_baseline — positive test on RESET kernel (cursor-chain coverage).
TEST_F(BoomerangHNRecursionTests, ValidateHNBaseline)
{
    BB_DISABLE_ASSERTS();
    HNAcirSetup setup = make_hn_acir_setup(PROOF_TYPE::HN, /*is_kernel=*/true);
    HNBuilder builder = build_hn_circuit_from_acir(setup);
    HNAnalyzer analyzer(builder, false);

    auto result = HNVerification::validate_hn_baseline<bb::fr>(builder, analyzer, &setup.hn_constraint(0));

    EXPECT_TRUE(result.all_valid);
    EXPECT_TRUE(result.arith_coverage_valid);
    EXPECT_TRUE(result.poseidon2_coverage_valid);
    EXPECT_EQ(result.arith_cursor_end, result.arith_region_end);
    EXPECT_EQ(result.poseidon2_cursor_end, result.poseidon2_region_end);
    EXPECT_EQ(result.primitive_start_poseidon2, 300UL);
    EXPECT_TRUE(result.oink.valid);
    EXPECT_TRUE(result.gate_challenge.valid);
    EXPECT_TRUE(result.main_sumcheck.valid);
    EXPECT_TRUE(result.pre_batching_padding.valid);
    EXPECT_TRUE(result.batching.valid);
    EXPECT_EQ(result.batching.squeezes_found, HNVerification::RESET_NUM_BATCHING_CHALLENGE_WINDOWS);
    EXPECT_TRUE(result.mlb.valid);
    EXPECT_TRUE(result.post_mlb.valid);
}

// 6.2: Full validate_hn_baseline — corrupted circuit must fail (cursor coverage).
TEST_F(BoomerangHNRecursionTests, ValidateHNBaselineDetectsCorruption)
{
    BB_DISABLE_ASSERTS();
    HNAcirSetup setup = make_hn_acir_setup(PROOF_TYPE::HN, /*is_kernel=*/true);
    HNBuilder builder = build_hn_circuit_from_acir(setup);
    HNAnalyzer analyzer(builder, false);

    // Corrupt inside the batching-challenge band (after live-prefix + padding) so a matched FP breaks.
    auto& arith = builder.blocks.arithmetic;
    const size_t g = HNVerification::RESET_OINK_MAINSC_LIVE_ARITH.gate_count +
                     HNVerification::RESET_PRE_BATCHING_PADDING_ARITH.gate_count + 3;
    ASSERT_LT(g, arith.size());
    if (!recursion_helpers::is_fix_witness_gate(builder, g)) {
        arith.q_2().set(g, bb::fr(7));
    }

    auto result = HNVerification::validate_hn_baseline<bb::fr>(builder, analyzer, &setup.hn_constraint(0));
    EXPECT_FALSE(result.all_valid);
}

// 6.3: Corrupting the pre-batching padding span (RESET_PRE_BATCHING_PADDING_ARITH) must fail — proves
// the padding span has its own fingerprint check rather than being silently absorbed into a neighbor.
TEST_F(BoomerangHNRecursionTests, ValidateHNBaselineDetectsPaddingCorruption)
{
    BB_DISABLE_ASSERTS();
    HNAcirSetup setup = make_hn_acir_setup(PROOF_TYPE::HN, /*is_kernel=*/true);
    HNBuilder builder = build_hn_circuit_from_acir(setup);
    HNAnalyzer analyzer(builder, false);

    auto& arith = builder.blocks.arithmetic;
    const size_t region_start = HNVerification::RESET_OINK_MAINSC_LIVE_ARITH.gate_count;
    const size_t region_end = region_start + HNVerification::RESET_PRE_BATCHING_PADDING_ARITH.gate_count;
    ASSERT_LT(region_end, arith.size());

    // The padding span is selector-zero throughout; setting any selector non-zero breaks its hash.
    arith.q_c().set(region_start + 1, bb::fr(13));

    auto result = HNVerification::validate_hn_baseline<bb::fr>(builder, analyzer, &setup.hn_constraint(0));
    EXPECT_FALSE(result.pre_batching_padding.valid);
    EXPECT_FALSE(result.all_valid);
}

// ============================================================================
// Phase 8: ACIR integration — MegaStaticAnalyzerAcir
// ============================================================================

// 8.1: Build RESET kernel via ACIR and run MegaStaticAnalyzerAcir.
// The process_hn_recursion_constraint specialization should accept it.
TEST_F(BoomerangHNRecursionTests, AcirIntegrationResetKernel)
{
    BB_DISABLE_ASSERTS();

    auto ivc = make_mock_chonk_for_scenario({ PROOF_TYPE::HN });
    AcirProgram program = build_hn_kernel_program(*ivc);
    const ProgramMetadata metadata{ ivc };

    HNBuilder builder = create_circuit<HNBuilder>(program, metadata);
    AcirFormat constraint_system_copy = program.constraints;

    // MegaStaticAnalyzerAcir takes AcirFormat + MegaCircuitBuilder
    cdg::MegaStaticAnalyzerAcir analyzer(std::move(constraint_system_copy), std::move(builder));

    const auto incorrect = analyzer.get_incorrect_opcodes();
    EXPECT_TRUE(incorrect.empty()) << "RESET kernel ACIR: " << incorrect.size() << " incorrect opcode(s) detected";
}

// 8.1b: Build HIDING kernel via ACIR and verify it also passes.
TEST_F(BoomerangHNRecursionTests, AcirIntegrationHidingKernel)
{
    BB_DISABLE_ASSERTS();

    auto ivc = make_mock_chonk_for_scenario({ PROOF_TYPE::HN_FINAL });
    AcirProgram program = build_hn_kernel_program(*ivc);
    const ProgramMetadata metadata{ ivc };

    HNBuilder builder = create_circuit<HNBuilder>(program, metadata);
    AcirFormat constraint_system_copy = program.constraints;

    cdg::MegaStaticAnalyzerAcir analyzer(std::move(constraint_system_copy), std::move(builder));

    const auto incorrect = analyzer.get_incorrect_opcodes();
    EXPECT_TRUE(incorrect.empty()) << "HIDING kernel ACIR: " << incorrect.size() << " incorrect opcode(s)";
}

// 8.1c: Corrupted RESET kernel should be flagged as incorrect.
TEST_F(BoomerangHNRecursionTests, AcirIntegrationDetectsCorruption)
{
    BB_DISABLE_ASSERTS();

    auto ivc = make_mock_chonk_for_scenario({ PROOF_TYPE::HN });
    AcirProgram program = build_hn_kernel_program(*ivc);
    const ProgramMetadata metadata{ ivc };

    HNBuilder builder = create_circuit<HNBuilder>(program, metadata);

    // Remove a squeeze gate's 2^127 marker → count check will fail
    const auto sq = recursion_helpers::find_all_transcript_squeeze_gates(builder);
    ASSERT_FALSE(sq.empty());
    builder.blocks.arithmetic.q_2().set(sq[HNVerification::HN_SQUEEZE_GATE_CHALLENGE + 3], bb::fr::zero());

    AcirFormat constraint_system_copy = program.constraints;
    cdg::MegaStaticAnalyzerAcir analyzer(std::move(constraint_system_copy), std::move(builder));

    const auto incorrect = analyzer.get_incorrect_opcodes();
    EXPECT_FALSE(incorrect.empty()) << "Corrupted RESET kernel should have incorrect opcode(s)";
}

// 8.2: Real multi-step IVC chain — app0 -> INIT -> app1 -> INNER -> RESET -> TAIL -> HIDING.
// Unlike 8.1's isolated single-opcode mocks (mock_chonk_accumulation called directly for one
// opcode at a time), this drives the boomerang validator through a genuine ivc->accumulate()
// sequence, identical in shape to dsl/acir_format/hypernova_recursion_constraint.test.cpp's
// AccumulateTwoApps (proven end-to-end there via ivc->prove()+ChonkNativeVerifier). Each kernel
// step's ACIR circuit is built via the real production entry point (build_hn_kernel_program +
// create_circuit, driven by the ivc's own verification_queue) before being fed to the analyzer.
TEST_F(BoomerangHNRecursionTests, AcirIntegrationFullKernelChain)
{
    BB_DISABLE_ASSERTS();

    // app0, INIT, app1, INNER, RESET, TAIL, HIDING.
    auto ivc = std::make_shared<Chonk>(std::vector<Chonk::CircuitKind>{ Chonk::CircuitKind::App,
                                                                        Chonk::CircuitKind::Kernel,
                                                                        Chonk::CircuitKind::App,
                                                                        Chonk::CircuitKind::Kernel,
                                                                        Chonk::CircuitKind::Kernel,
                                                                        Chonk::CircuitKind::Kernel,
                                                                        Chonk::CircuitKind::HidingKernel });

    accumulate_hn_app_step(ivc);
    accumulate_hn_kernel_step_and_validate(ivc, "INIT kernel"); // verifies app0 (OINK)

    ASSERT_EQ(ivc->verification_queue.size(), 1u);
    EXPECT_EQ(ivc->verification_queue[0].kind, Chonk::CircuitKind::Kernel);
    accumulate_hn_app_step(ivc);
    accumulate_hn_kernel_step_and_validate(ivc, "INNER kernel"); // verifies INIT + app1 (HN, HN)

    ASSERT_EQ(ivc->verification_queue.size(), 1u);
    EXPECT_EQ(ivc->verification_queue[0].kind, Chonk::CircuitKind::Kernel);
    accumulate_hn_kernel_step_and_validate(ivc, "RESET kernel"); // verifies INNER (HN)

    ASSERT_EQ(ivc->verification_queue.size(), 1u);
    // TAIL is indistinguishable from RESET at the IVC level -- HN_TAIL folded into plain HN upstream
    // (both a single Kernel-kind, is_kernel() verify; same fold-core).
    EXPECT_EQ(ivc->verification_queue[0].kind, Chonk::CircuitKind::Kernel);
    accumulate_hn_kernel_step_and_validate(ivc, "TAIL kernel"); // verifies RESET (HN)

    ASSERT_EQ(ivc->verification_queue.size(), 1u);
    // The queued proof is verified via HN_FINAL because the IVC is now positioned as the hiding
    // kernel (expected_proof_type derives HN_FINAL from ivc.is_hiding_kernel(), not a per-entry tag).
    EXPECT_TRUE(ivc->is_hiding_kernel());
    EXPECT_EQ(ivc->verification_queue[0].kind, Chonk::CircuitKind::Kernel);
    accumulate_hn_kernel_step_and_validate(ivc, "HIDING kernel"); // verifies TAIL (HN_FINAL)
}

// 6.3: Cursor-chain coverage ordering — Oink+MainSC-live -> pre-batching padding -> batching challenge
// windows -> MLB+tail-live; poseidon vk_hash -> tail.
TEST_F(BoomerangHNRecursionTests, ValidateHNBaselineStageOrdering)
{
    BB_DISABLE_ASSERTS();
    HNAcirSetup setup = make_hn_acir_setup(PROOF_TYPE::HN, /*is_kernel=*/true);
    HNBuilder builder = build_hn_circuit_from_acir(setup);
    HNAnalyzer analyzer(builder, false);

    auto result = HNVerification::validate_hn_baseline<bb::fr>(builder, analyzer, &setup.hn_constraint(0));
    ASSERT_TRUE(result.all_valid) << "Baseline must pass before ordering can be checked";

    EXPECT_EQ(result.oink.pre_eta_arith_start, 0UL);
    EXPECT_EQ(result.pre_batching_padding.arith_start, HNVerification::RESET_OINK_MAINSC_LIVE_ARITH.gate_count);
    EXPECT_EQ(result.batching.arith_start,
              HNVerification::RESET_OINK_MAINSC_LIVE_ARITH.gate_count +
                  HNVerification::RESET_PRE_BATCHING_PADDING_ARITH.gate_count);
    EXPECT_EQ(result.mlb.alpha_arith_start,
              result.batching.arith_start + HNVerification::RESET_NUM_BATCHING_CHALLENGE_WINDOWS *
                                                HNVerification::RESET_BATCHING_CHALLENGE_WINDOW_ARITH.gate_count);
    EXPECT_EQ(result.post_mlb.transition_arith_start, result.mlb.alpha_arith_start);
    EXPECT_EQ(result.mlb.sc_arith_end, result.shared_fold_core_arith_end);
    EXPECT_EQ(result.shared_fold_core_arith_end + HNVerification::RESET_ONLY_POST_MLB_TAIL_ARITH.gate_count,
              builder.blocks.arithmetic.size());
    EXPECT_EQ(result.arith_cursor_end, builder.blocks.arithmetic.size());
    EXPECT_EQ(result.primitive_start_poseidon2 + HNVerification::RESET_VK_HASH_POSEIDON2.gate_count +
                  HNVerification::RESET_POSEIDON2_TAIL.gate_count,
              builder.blocks.poseidon2.size());
}

// Step A (hn_multi_opcode_primitive_start_plan.md): diagnostic-only, no production code touched.
//
// Corrected construction per user guidance: ONE shared Chonk/ivc, multiple mock_chonk_accumulation
// calls (mirroring how make_hn_inner_acir_setup already builds INNER's 2-constraint circuit), ONE
// combined AcirProgram, ONE create_circuit call -- not 3 independent Chonk instances (that was the
// bug in the first version of this test: each fresh Chonk pays its own one-time merge-verifier
// genesis cost, which doesn't reflect how a real multi-opcode circuit shares that cost once).
//
// Hypothesis under test: the merge-verifier/setup prefix before vk_hash is a one-time cost for the
// FIRST opcode's own circuit region only; opcode 2+ in the same shared builder should anchor with
// zero additional gap (primitive_start(c1) == fold-core end of c0, contiguous) -- i.e.
// "primitive_start == 0" relative to the previous opcode's boundary, not relative to absolute
// gate 0. This is the load-bearing assumption for hn_multi_opcode_primitive_start_plan.md's whole
// local-squeeze-window design.
TEST_F(HNRecursionTestSuite, DiagnosticVkHashAnchorMultiOpcodeSharedIvc)
{
    BB_DISABLE_ASSERTS();

    // Synthetic non-standard stack (see note above this test): two kernel-role entries sharing one
    // queue is not a reachable production shape (HN_TAIL folded into plain HN upstream, and no real
    // opcode sequence puts two non-INNER HN entries in one builder either way) -- constructed by
    // hand rather than via make_mock_chonk_for_scenario, which enforces production-valid shapes.
    auto ivc = std::make_shared<Chonk>(std::vector<Chonk::CircuitKind>{ Chonk::CircuitKind::App,
                                                                        Chonk::CircuitKind::Kernel,
                                                                        Chonk::CircuitKind::Kernel,
                                                                        Chonk::CircuitKind::Kernel,
                                                                        Chonk::CircuitKind::HidingKernel });
    mock_chonk_accumulation(ivc, /*is_kernel=*/true);
    mock_chonk_accumulation(ivc, /*is_kernel=*/true);
    AcirProgram program = build_hn_kernel_program(*ivc);
    const ProgramMetadata metadata{ ivc };

    HNBuilder builder = create_circuit<HNBuilder>(program, metadata);
    HNAnalyzer analyzer(builder, false);

    ASSERT_EQ(program.constraints.hn_recursion_constraints.size(), 2U);
    const auto& c0 = program.constraints.hn_recursion_constraints[0]; // HN (RESET-shaped)
    const auto& c1 = program.constraints.hn_recursion_constraints[1]; // HN (TAIL-shaped; no distinct type)

    const auto a0 = HNVerification::HNOinkValidation::validate_vk_hash_anchor<bb::fr>(
        builder, analyzer, c0, HNVerification::HNInitValidation::INIT_VK_HASH_PROFILE);
    const auto a1 = HNVerification::HNOinkValidation::validate_vk_hash_anchor<bb::fr>(
        builder, analyzer, c1, HNVerification::HNInitValidation::INIT_VK_HASH_PROFILE);
    const auto sq = recursion_helpers::find_all_transcript_squeeze_gates(builder);

    std::cout << "[multi-opcode diagnostic] c0(HN):      valid=" << a0.valid << " arith_start=" << a0.arith_start
              << " arith_end=" << a0.arith_end << "\n";
    std::cout << "[multi-opcode diagnostic] c1(HN_TAIL): valid=" << a1.valid << " arith_start=" << a1.arith_start
              << " arith_end=" << a1.arith_end << "\n";
    std::cout << "[multi-opcode diagnostic] total arithmetic.size()=" << builder.blocks.arithmetic.size()
              << " total sq.size()=" << sq.size() << "\n";
    if (!sq.empty()) {
        std::cout << "[multi-opcode diagnostic] sq.front()=" << sq.front() << " sq.back()=" << sq.back() << "\n";
    }

    EXPECT_TRUE(a0.valid);
    EXPECT_TRUE(a1.valid);
}

// Step A follow-up (hn_multi_opcode_primitive_start_plan.md, now SUPERSEDED): asked whether
// c1(HN_TAIL)'s vk_hash anchor sits exactly where c0(HN)'s own trailing content ends inside an
// artificial shared HN+HN_TAIL builder, with zero extra gap. Answer came back NO (shared c0 tail:
// 141 gates / hash 0xc06744b1918ea7cb vs solo: 129 gates / hash 0xe80b8166777f017e -- a real
// 12-gate delta, not a rounding artifact). That answer killed the plan: per the "5 valid kernel
// queue patterns" doxygen (hypernova_recursion_constraint.cpp) and hn_fix_plan.md item 4, real
// compiler output never puts HN + HN_TAIL (or any 2 non-INNER HN-family opcodes) in one builder --
// this test's own construction is synthetic, not a reachable production shape. Removed rather than
// left red: it encoded a now-disproven hypothesis for a scenario that cannot occur, so it had no
// remaining regression value. See tracker.md 9.10/9.11 and hn_multi_opcode_primitive_start_plan.md
// for the closure writeup and full numbers.

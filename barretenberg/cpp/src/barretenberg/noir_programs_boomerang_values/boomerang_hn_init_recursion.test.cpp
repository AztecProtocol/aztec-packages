// HN::INIT kernel — boomerang discovery and validation tests (OINK-only path, 61 squeezes).

#include "barretenberg/boomerang_value_detection/graph_description_acir.hpp"
#include "barretenberg/noir_programs_boomerang_values/HNInitValidation.hpp"
#include "barretenberg/noir_programs_boomerang_values/boomerang_hn_recursion_test_helpers.hpp"

#include <fstream>
#include <gtest/gtest.h>

using namespace bb;
using namespace hn_recursion_test;

class HNInitRecursionTestSuite : public BoomerangHNRecursionTests {};

// Corrupts the first non-fix_witness arith gate in [start, start+span); returns its gate index.
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

// CHONK-style per-stage gate fingerprint dump for the HN INIT / OINK-only path.
// Output: hn_oink_functions_analysis.txt
TEST_F(HNInitRecursionTestSuite, HNInitFingerPrintDump)
{
    BB_DISABLE_ASSERTS();

    const auto setup = make_hn_init_acir_setup();
    HNBuilder builder = build_hn_witness_builder(setup);
    auto ctx = build_hn_init_oink_context(builder, setup);
    HNAnalyzer analyzer(builder, false);
    (void)analyzer;

    std::ofstream out("hn_oink_functions_analysis.txt");
    ASSERT_TRUE(out.is_open());

    hn_execute_oink_part(builder, ctx, out);

    info("HN OINK function analysis written to hn_oink_functions_analysis.txt");
    SUCCEED();
}

// ACIR poseidon-linked arith anchor for INIT vk_hash (key_hash witness).
TEST_F(HNInitRecursionTestSuite, AcirHNInitPoseidonLinkedGateFilter)
{
    BB_DISABLE_ASSERTS();

    const auto setup = make_hn_init_acir_setup();
    HNBuilder builder = build_hn_init_kernel_circuit();
    HNAnalyzer analyzer(builder, false);
    const auto& constraint = setup.hn_constraint(0);

    const uint32_t key_hash_real = builder.real_variable_index[constraint.key_hash];
    auto& poseidon2_external = builder.blocks.poseidon2; // Mega merged poseidon2_external/poseidon2_quad_internal
    const std::vector<size_t> external_gates = OinkVerifierValidation::collect_real_witness_gates_in_block<bb::fr>(
        builder, analyzer, key_hash_real, poseidon2_external);
    ASSERT_FALSE(external_gates.empty());

    std::ofstream out("hn_init_acir_anchor_gates.txt");
    ASSERT_TRUE(out.is_open());
    out << "# key_hash witness=" << constraint.key_hash << " real=" << key_hash_real << "\n";
    out << "# external candidate gates=" << external_gates.size() << "\n";

    const auto vk_hash = HNVerification::HNInitValidation::validate_init_vk_hash<bb::fr>(builder, analyzer, constraint);
    out << "vk_hash_valid=" << vk_hash.valid << " arith=[" << vk_hash.arith_start << "," << vk_hash.arith_end
        << ") poseidon2=[" << vk_hash.poseidon2_ext_start << "," << vk_hash.poseidon2_ext_end << ")\n";
    EXPECT_TRUE(vk_hash.valid);

    // The anchor is poseidon-only: no ACIR key/key_hash witness reaches the arithmetic block, so the
    // profile's arith fingerprint is empty and the anchor reports an empty arith range (see
    // AcirHNInitVkHashProfileDiscovery). The primitive start is the poseidon2 span.
    EXPECT_EQ(vk_hash.arith_start, vk_hash.arith_end);
    EXPECT_LT(vk_hash.poseidon2_ext_start, vk_hash.poseidon2_ext_end);
    EXPECT_EQ(vk_hash.poseidon2_ext_end - vk_hash.poseidon2_ext_start,
              HNVerification::HNInitValidation::INIT_VK_HASH_POSEIDON2_EXT.gate_count);

    // Every key_hash poseidon2 gate must fall inside the anchored span, proving the ACIR opcode's
    // declared VK hash actually drives it rather than sitting on a disconnected witness.
    for (size_t g : external_gates) {
        EXPECT_GE(g, vk_hash.poseidon2_ext_start);
        EXPECT_LT(g, vk_hash.poseidon2_ext_end);
    }

    print_fp(out,
             "INIT_VK_HASH_POSEIDON2_EXT",
             hn_compute_fingerprint(
                 builder, HN_BLOCK_POSEIDON2_EXT, vk_hash.poseidon2_ext_start, vk_hash.poseidon2_ext_end));

    info("HN INIT ACIR anchor written to hn_init_acir_anchor_gates.txt");
}

// Pin micro-OINK stage fingerprints from hn_oink_functions_analysis.txt.
TEST_F(HNInitRecursionTestSuite, HNInitOinkFingerprintMatch)
{
    BB_DISABLE_ASSERTS();

    const auto setup = make_hn_init_acir_setup();
    HNBuilder builder = build_hn_witness_builder(setup);
    auto ctx = build_hn_init_oink_context(builder, setup);

    auto vk = ctx.verifier_instance->get_vk();

    const auto before = recursion_helpers::BlockSnapshot::capture(builder);
    HNOinkField vk_hash = vk->hash_with_origin_tagging(*ctx.transcript);
    ctx.transcript->add_to_hash_buffer("vk_hash", vk_hash);
    ctx.verifier_instance->vk_and_hash->hash.assert_equal(vk_hash);
    const auto after = recursion_helpers::BlockSnapshot::capture(builder);

    namespace INIT = HNVerification::HNInitValidation;
    const size_t vk_start = before.sizes[HN_BLOCK_ARITHMETIC];
    const size_t vk_end = after.sizes[HN_BLOCK_ARITHMETIC];
    const auto vk_fp = hn_compute_fingerprint(builder, HN_BLOCK_ARITHMETIC, vk_start, vk_end);
    EXPECT_EQ(INIT::INIT_MIRROR_VK_HASH_ARITH.gate_count, vk_fp.gate_count);
    EXPECT_EQ(INIT::INIT_MIRROR_VK_HASH_ARITH.full_hash, vk_fp.full_hash);
    EXPECT_EQ(INIT::COMMITMENT_RECEIVE_ARITH.gate_count, INIT::COMMITMENT_RECEIVE_ARITH.fingerprint_size);
}

// Re-derives the vk_hash anchor profile (arith + poseidon2) directly from the ACIR circuit, using the
// witness cover of key_hash + key[] limbs on the poseidon2 block as the span. The profile cannot come
// from the witness-builder mirror: the mirror's vk_hash span is a different shape (dumped here as a
// cross-check), and the anchor search only succeeds against a profile measured on the circuit it runs on.
// Output: hn_init_vk_hash_profile.txt
TEST_F(HNInitRecursionTestSuite, AcirHNInitVkHashProfileDiscovery)
{
    BB_DISABLE_ASSERTS();

    std::ofstream out("hn_init_vk_hash_profile.txt");
    ASSERT_TRUE(out.is_open());

    // Poseidon2 span covering every ACIR key/key_hash witness, plus the arith gates linked out of it.
    // Mirrors AcirHNResetPrimitiveStartDiscovery's cover derivation.
    struct VkHashSpan {
        recursion_helpers::FunctionFingerprint arith;
        recursion_helpers::FunctionFingerprint poseidon2;
        size_t p2_start = 0;
        size_t arith_start = 0;
    };
    const auto measure_acir_span = [](HNBuilder& builder, HNAnalyzer& analyzer, const RecursionConstraint& constraint) {
        auto& poseidon2 = builder.blocks.poseidon2;
        auto& arith = builder.blocks.arithmetic;

        std::set<size_t> p2_cover;
        const auto add_p2 = [&](uint32_t wit) {
            const uint32_t real = builder.real_variable_index[wit];
            for (size_t g : OinkVerifierValidation::collect_real_witness_gates_in_block<bb::fr>(
                     builder, analyzer, real, poseidon2)) {
                p2_cover.insert(g);
            }
        };
        add_p2(constraint.key_hash);
        for (uint32_t key_wit : constraint.key) {
            add_p2(key_wit);
        }

        VkHashSpan span;
        if (p2_cover.empty()) {
            return span;
        }
        span.p2_start = *p2_cover.begin();
        const size_t p2_end = *p2_cover.rbegin() + 1;

        const std::set<size_t> linked_arith =
            recursion_helpers::collect_linked_gates<bb::fr>(builder, analyzer, poseidon2, span.p2_start, p2_end, arith);
        span.arith_start = linked_arith.empty() ? 0 : *linked_arith.begin();
        const size_t arith_end = linked_arith.empty() ? 0 : *linked_arith.rbegin() + 1;

        span.poseidon2 = hn_compute_fingerprint(builder, HN_BLOCK_POSEIDON2_EXT, span.p2_start, p2_end);
        span.arith = hn_compute_fingerprint(builder, HN_BLOCK_ARITHMETIC, span.arith_start, arith_end);
        return span;
    };

    const auto setup = make_hn_init_acir_setup();
    HNBuilder builder = build_hn_circuit_from_acir(setup);
    HNAnalyzer analyzer(builder, false);
    const auto span = measure_acir_span(builder, analyzer, setup.hn_constraint(0));

    out << "# vk_hash span derived from the ACIR key/key_hash witness cover on poseidon2\n";
    out << "acir_arith_total=" << builder.blocks.arithmetic.size()
        << " acir_poseidon2_total=" << builder.blocks.poseidon2.size() << "\n";
    out << "p2_start=" << span.p2_start << " arith_start=" << span.arith_start << "\n";
    print_fp(out, "INIT_VK_HASH_ARITH", span.arith);
    print_fp(out, "INIT_VK_HASH_POSEIDON2_EXT", span.poseidon2);

    // Determinism: a second independent build must produce byte-identical fingerprints and positions,
    // otherwise the values are witness-dependent and unpinnable.
    const auto setup2 = make_hn_init_acir_setup();
    HNBuilder builder2 = build_hn_circuit_from_acir(setup2);
    HNAnalyzer analyzer2(builder2, false);
    const auto span2 = measure_acir_span(builder2, analyzer2, setup2.hn_constraint(0));
    EXPECT_EQ(span.p2_start, span2.p2_start);
    EXPECT_EQ(span.arith_start, span2.arith_start);
    EXPECT_EQ(span.arith.gate_count, span2.arith.gate_count);
    EXPECT_EQ(span.arith.full_hash, span2.arith.full_hash);
    EXPECT_EQ(span.poseidon2.gate_count, span2.poseidon2.gate_count);
    EXPECT_EQ(span.poseidon2.full_hash, span2.poseidon2.full_hash);

    // The derived profile must anchor via the production search path.
    const HNVerification::HNOinkValidation::VkHashProfile derived{
        .arith = span.arith,
        .poseidon2_ext = span.poseidon2,
        .poseidon2_int = span.poseidon2,
    };
    const auto anchored = HNVerification::HNOinkValidation::validate_vk_hash_anchor<bb::fr>(
        builder, analyzer, setup.hn_constraint(0), derived);
    out << "acir_anchor_valid=" << anchored.valid << " arith=[" << anchored.arith_start << "," << anchored.arith_end
        << ") poseidon2=[" << anchored.poseidon2_ext_start << "," << anchored.poseidon2_ext_end << ")\n";
    EXPECT_TRUE(anchored.valid);
    EXPECT_EQ(anchored.arith_start, span.arith_start);

    // No ACIR key/key_hash witness reaches the arithmetic block, so the anchor is poseidon-only and the
    // profile's arith fingerprint must stay empty (same shape as RESET_VK_HASH_PROFILE). The
    // witness-builder mirror's vk_hash span is a separate, larger region -- see HNInitOinkFingerprintMatch.
    EXPECT_EQ(span.arith.gate_count, 0UL);

    info("HN INIT vk_hash profile written to hn_init_vk_hash_profile.txt");
}

// Measures the real post-merge INIT arith/poseidon2 cursor-chain shape. The squeeze-index model is dead
// (all Oink and Sumcheck challenges are `fr`-typed and emit zero gates), so this reports what actually
// survives and segments the arithmetic block around it, mirroring RESET's stage split.
// Output: hn_init_cursor_chain.txt
TEST_F(HNInitRecursionTestSuite, AcirHNInitCursorChainDiscovery)
{
    BB_DISABLE_ASSERTS();

    std::ofstream out("hn_init_cursor_chain.txt");
    ASSERT_TRUE(out.is_open());

    const auto setup = make_hn_init_acir_setup();
    HNBuilder builder = build_hn_circuit_from_acir(setup);
    HNAnalyzer analyzer(builder, false);
    const auto& constraint = setup.hn_constraint(0);

    const size_t arith_total = builder.blocks.arithmetic.size();
    const size_t poseidon_total = builder.blocks.poseidon2.size();
    const auto sq = recursion_helpers::find_all_transcript_squeeze_gates(builder);

    out << "arith_total=" << arith_total << " poseidon2_total=" << poseidon_total << " squeezes=" << sq.size() << "\n";
    out << "# surviving squeeze gates (batching-phase `fq` challenges only)\n";
    for (size_t i = 0; i < sq.size(); ++i) {
        out << "  sq[" << i << "]=" << sq[i] << (i > 0 ? " delta=" + std::to_string(sq[i] - sq[i - 1]) : "") << "\n";
    }
    ASSERT_FALSE(sq.empty());

    const auto vk_hash = HNVerification::HNInitValidation::validate_init_vk_hash<bb::fr>(builder, analyzer, constraint);
    ASSERT_TRUE(vk_hash.valid);
    out << "vk_hash poseidon2=[" << vk_hash.poseidon2_ext_start << "," << vk_hash.poseidon2_ext_end << ")\n";

    // Poseidon2: anchor span then everything after it as one tail, matching RESET_POSEIDON2_TAIL.
    print_fp(out,
             "INIT_POSEIDON2_TAIL",
             hn_compute_fingerprint(builder, HN_BLOCK_POSEIDON2_EXT, vk_hash.poseidon2_ext_end, poseidon_total));

    // Arith stage split. Every stage boundary is a measured squeeze position or a block edge; the
    // pre-batching head is one monolith because no squeeze marker sub-divides it post-merge.
    const size_t head_end = sq.front() + 1;
    print_fp(out, "INIT_OINK_MAINSC_LIVE_ARITH", hn_compute_fingerprint(builder, HN_BLOCK_ARITHMETIC, 0, head_end));

    out << "# per-window batching fingerprints (checking uniformity)\n";
    std::set<std::pair<size_t, uint64_t>> window_shapes;
    for (size_t i = 0; i + 1 < sq.size(); ++i) {
        const auto fp = hn_compute_fingerprint(builder, HN_BLOCK_ARITHMETIC, sq[i] + 1, sq[i + 1] + 1);
        out << "  window[" << i << "] gates=" << fp.gate_count << " full_hash=0x" << std::hex << fp.full_hash
            << std::dec << "\n";
        window_shapes.insert({ fp.gate_count, fp.full_hash });
    }
    out << "distinct_window_shapes=" << window_shapes.size() << "\n";
    if (window_shapes.size() == 1) {
        print_fp(out,
                 "INIT_BATCHING_CHALLENGE_WINDOW_ARITH",
                 hn_compute_fingerprint(builder, HN_BLOCK_ARITHMETIC, sq[0] + 1, sq[1] + 1));
        out << "INIT_NUM_BATCHING_CHALLENGE_WINDOWS = " << sq.size() - 1 << "\n";
    }

    const size_t tail_start = sq.back() + 1;
    print_fp(out,
             "INIT_POST_BATCHING_TAIL_ARITH",
             hn_compute_fingerprint(builder, HN_BLOCK_ARITHMETIC, tail_start, arith_total));
    out << "tail=[" << tail_start << "," << arith_total << ") gates=" << arith_total - tail_start << "\n";

    // Determinism across an independent build: positions and hashes must be identical or nothing is pinnable.
    const auto setup2 = make_hn_init_acir_setup();
    HNBuilder builder2 = build_hn_circuit_from_acir(setup2);
    HNAnalyzer analyzer2(builder2, false);
    const auto sq2 = recursion_helpers::find_all_transcript_squeeze_gates(builder2);
    ASSERT_EQ(sq.size(), sq2.size());
    EXPECT_EQ(builder2.blocks.arithmetic.size(), arith_total);
    EXPECT_EQ(builder2.blocks.poseidon2.size(), poseidon_total);
    for (size_t i = 0; i < sq.size(); ++i) {
        EXPECT_EQ(sq[i], sq2[i]) << "squeeze " << i << " moved between builds";
    }
    const auto head2 = hn_compute_fingerprint(builder2, HN_BLOCK_ARITHMETIC, 0, sq2.front() + 1);
    const auto head1 = hn_compute_fingerprint(builder, HN_BLOCK_ARITHMETIC, 0, head_end);
    EXPECT_EQ(head1.gate_count, head2.gate_count);
    EXPECT_EQ(head1.full_hash, head2.full_hash);
    const auto tail2 = hn_compute_fingerprint(builder2, HN_BLOCK_ARITHMETIC, sq2.back() + 1, arith_total);
    const auto tail1 = hn_compute_fingerprint(builder, HN_BLOCK_ARITHMETIC, tail_start, arith_total);
    EXPECT_EQ(tail1.gate_count, tail2.gate_count);
    EXPECT_EQ(tail1.full_hash, tail2.full_hash);

    info("HN INIT cursor chain written to hn_init_cursor_chain.txt");
}

// Empirical witness trace of the transcript-absorption prefix at the head of the arithmetic block, to
// determine what those gates actually absorb (do not guess, trace it). The head stage begins at gate 0:
// the vk_hash anchor is poseidon-only, so it contributes no arithmetic gates to skip past.
TEST_F(HNInitRecursionTestSuite, HNInitPreEtaWitnessTrace)
{
    BB_DISABLE_ASSERTS();

    auto setup = make_hn_init_acir_setup();
    const std::vector<bb::fr> native_proof = setup.ivc->verification_queue.front().proof;
    const size_t original_proof_size = native_proof.size();
    const size_t expected_num_public_inputs =
        ProofLength::HypernovaInstanceToAccum<HNOinkRecursiveFlavor>::derive_num_public_inputs(
            original_proof_size, HNOinkRecursiveFlavor::VIRTUAL_LOG_N);

    HNBuilder builder = build_hn_circuit_from_acir(setup);
    HNAnalyzer analyzer(builder, false);
    const auto& constraint = setup.hn_constraint(0);

    const auto vk_hash = HNVerification::HNInitValidation::validate_init_vk_hash<bb::fr>(builder, analyzer, constraint);
    ASSERT_TRUE(vk_hash.valid);
    ASSERT_EQ(vk_hash.arith_start, vk_hash.arith_end) << "anchor is expected to be poseidon-only";

    auto& arith = builder.blocks.arithmetic;
    const size_t region_start = 0;
    const size_t region_end = HNVerification::HNInitValidation::INIT_OINK_MAINSC_LIVE_ARITH.gate_count;
    ASSERT_LE(region_end, arith.size());

    std::ofstream out("hn_init_pre_eta_witness_trace.txt");
    ASSERT_TRUE(out.is_open());
    out << "# head stage region=[" << region_start << "," << region_end << ")\n";
    out << "# region size=" << (region_end - region_start) << "\n\n";
    out << "# original (pre-consumption) native queue-entry proof.size()=" << original_proof_size << "\n";
    out << "# expected_num_public_inputs (derive_num_public_inputs formula)=" << expected_num_public_inputs << "\n\n";

    size_t fix_witness_count = 0;
    size_t transcript_add_count = 0;
    size_t other_count = 0;
    size_t matched_to_proof = 0;

    for (size_t g = region_start; g < region_end; ++g) {
        const bool is_fix = recursion_helpers::is_fix_witness_gate(builder, g);
        const bool is_add = recursion_helpers::is_transcript_add_gate<bb::fr>(arith, g);
        out << "gate " << g << ": ";
        if (is_fix) {
            ++fix_witness_count;
            const bb::fr fixed_value = -arith.q_c()[g];
            out << "fix_witness value=" << fixed_value;
        } else if (is_add) {
            ++transcript_add_count;
            const uint32_t wr_real = builder.real_variable_index[arith.w_r()[g]];
            const bb::fr absorbed = builder.get_variable(wr_real);
            out << "transcript_add absorbed=" << absorbed;
            for (size_t i = 0; i < native_proof.size(); ++i) {
                if (native_proof[i] == absorbed) {
                    out << " MATCHES proof[" << i << "]";
                    ++matched_to_proof;
                    break;
                }
            }
        } else {
            ++other_count;
            out << "OTHER q_m=" << arith.q_m()[g] << " q_1=" << arith.q_1()[g] << " q_2=" << arith.q_2()[g]
                << " q_3=" << arith.q_3()[g] << " q_4=" << arith.q_4()[g] << " q_c=" << arith.q_c()[g];
        }
        out << "\n";
    }

    out << "\n# summary: fix_witness=" << fix_witness_count << " transcript_add=" << transcript_add_count
        << " other=" << other_count << " matched_to_native_proof=" << matched_to_proof << "\n";

    info("HN INIT pre-eta witness trace written to hn_init_pre_eta_witness_trace.txt");
    SUCCEED();
}

/**
 * @brief INIT kernel built from real ACIR: MegaStaticAnalyzerAcir reports zero incorrect opcodes.
 */
TEST_F(HNInitRecursionTestSuite, AcirHNInitFingerprintsMatchConstants)
{
    BB_DISABLE_ASSERTS();

    auto setup = make_hn_init_acir_setup();
    HNBuilder builder = build_hn_circuit_from_acir(setup);
    AcirFormat constraint_system_copy = setup.program.constraints;

    cdg::MegaStaticAnalyzerAcir analyzer(std::move(constraint_system_copy), std::move(builder));
    EXPECT_TRUE(analyzer.get_incorrect_opcodes().empty());
}

/**
 * @brief validate_init_iv_queue_consistency and the full validate_hn_init both accept a matching IVC
 * queue entry + expected VK snapshot for the INIT kernel.
 */
TEST_F(HNInitRecursionTestSuite, ValidateHNInitIvQueueConsistency)
{
    BB_DISABLE_ASSERTS();
    const auto setup = make_hn_init_acir_setup();
    HNBuilder builder = build_hn_circuit_from_acir(setup);
    HNAnalyzer analyzer(builder, false);
    const auto& constraint = setup.hn_constraint(0);

    BB_ASSERT_EQ(setup.queue_snapshots.size(), 1UL);
    const Chonk::VerifierInputs queue_entry{
        {},
        nullptr,
        nullptr,
        setup.queue_snapshots[0].kind,
    };

    const HNVerification::HNInitValidation::IvQueueExpectedVk expected_vk{
        .fields = setup.expected_vk_fields,
        .hash = setup.expected_vk_hash,
    };

    auto iv_result = HNVerification::HNInitValidation::validate_init_iv_queue_consistency<bb::fr>(
        builder, constraint, queue_entry, expected_vk);
    EXPECT_TRUE(iv_result.valid);

    auto result = HNVerification::validate_hn_init(builder, analyzer, constraint, queue_entry, expected_vk);
    EXPECT_TRUE(result.iv_queue.valid);
    EXPECT_TRUE(result.all_valid);
}

/**
 * @brief validate_hn_init passes end-to-end on a real ACIR-built INIT kernel, with the cursor chain
 * covering the arithmetic and poseidon2 blocks completely (no unmatched gates).
 */
TEST_F(HNInitRecursionTestSuite, ValidateHNInitKernel)
{
    BB_DISABLE_ASSERTS();
    const auto setup = make_hn_init_acir_setup();
    HNBuilder builder = build_hn_circuit_from_acir(setup);
    HNAnalyzer analyzer(builder, false);
    const auto& constraint = setup.hn_constraint(0);

    auto result = HNVerification::validate_hn_init(builder, analyzer, constraint);

    EXPECT_TRUE(result.all_valid);
    EXPECT_TRUE(result.oink.valid);
    EXPECT_TRUE(result.oink.vk_hash.valid);
    EXPECT_TRUE(result.main_sumcheck.fingerprint_valid);
    EXPECT_TRUE(result.pre_batching_padding.fingerprint_valid);
    EXPECT_TRUE(result.batching.fingerprint_valid);
    EXPECT_TRUE(result.post_batching.valid);
    EXPECT_EQ(result.batching_windows_found, HNVerification::HNInitValidation::INIT_NUM_BATCHING_CHALLENGE_WINDOWS);

    // Total contiguous coverage is the PASS criterion: an injected or missing gate cannot hide in a gap.
    EXPECT_TRUE(result.arith_coverage_valid);
    EXPECT_TRUE(result.poseidon2_coverage_valid);
    EXPECT_EQ(result.arith_cursor_end, result.arith_region_end);
    EXPECT_EQ(result.poseidon2_cursor_end, result.poseidon2_region_end);

    // Stages are contiguous and in source order.
    EXPECT_EQ(result.main_sumcheck.arith_start, 0UL);
    EXPECT_EQ(result.main_sumcheck.arith_end, result.pre_batching_padding.arith_start);
    EXPECT_EQ(result.pre_batching_padding.arith_end, result.batching.arith_start);
    EXPECT_EQ(result.batching.arith_end, result.post_batching.arith_start);
    EXPECT_EQ(result.post_batching.arith_end, result.arith_region_end);
}

// Corrupts the transcript-absorption prefix at the very start of the head stage -- the region that used
// to be validated separately as the pre-eta commitment chain, and which had zero corruption coverage
// before it was fingerprinted. The vk_hash anchor is poseidon-only, so it stays valid.
TEST_F(HNInitRecursionTestSuite, ValidateHNInitDetectsHeadStagePrefixCorruption)
{
    BB_DISABLE_ASSERTS();
    const auto setup = make_hn_init_acir_setup();
    HNBuilder builder = build_hn_circuit_from_acir(setup);
    HNAnalyzer analyzer(builder, false);
    const auto& constraint = setup.hn_constraint(0);

    ASSERT_NE(
        corrupt_arith_selector_in_range(builder, 0, HNVerification::HNInitValidation::INIT_PRE_ETA_ARITH.gate_count),
        SIZE_MAX);

    auto result = HNVerification::validate_hn_init(builder, analyzer, constraint);
    EXPECT_TRUE(result.oink.vk_hash.valid);
    EXPECT_FALSE(result.main_sumcheck.fingerprint_valid);
    EXPECT_FALSE(result.arith_coverage_valid);
    EXPECT_FALSE(result.all_valid);
}

// Corrupts a gate near the END of the head stage's 2207-gate span, proving the monolithic fingerprint
// covers its full span rather than only its opening.
TEST_F(HNInitRecursionTestSuite, ValidateHNInitDetectsDeepHeadStageCorruption)
{
    BB_DISABLE_ASSERTS();
    const auto setup = make_hn_init_acir_setup();
    HNBuilder builder = build_hn_circuit_from_acir(setup);
    HNAnalyzer analyzer(builder, false);
    const auto& constraint = setup.hn_constraint(0);

    const size_t head_gates = HNVerification::HNInitValidation::INIT_OINK_MAINSC_LIVE_ARITH.gate_count;
    ASSERT_NE(corrupt_arith_selector_in_range(builder, head_gates - 50, 50), SIZE_MAX);

    auto result = HNVerification::validate_hn_init(builder, analyzer, constraint);
    EXPECT_TRUE(result.oink.vk_hash.valid);
    EXPECT_FALSE(result.main_sumcheck.fingerprint_valid);
    EXPECT_FALSE(result.all_valid);
}

// Corrupts a gate inside the Main-Sumcheck portion of the head stage (past the transcript-absorption
// prefix), and asserts the failure is reported on the head stage's own flag rather than only on all_valid.
TEST_F(HNInitRecursionTestSuite, ValidateHNInitDetectsMainSumcheckCorruption)
{
    BB_DISABLE_ASSERTS();
    const auto setup = make_hn_init_acir_setup();
    HNBuilder builder = build_hn_circuit_from_acir(setup);
    HNAnalyzer analyzer(builder, false);
    const auto& constraint = setup.hn_constraint(0);

    namespace INIT = HNVerification::HNInitValidation;
    const size_t prefix = INIT::INIT_PRE_ETA_ARITH.gate_count;
    ASSERT_NE(corrupt_arith_selector_in_range(builder, prefix, INIT::INIT_OINK_MAINSC_LIVE_ARITH.gate_count - prefix),
              SIZE_MAX);

    auto result = HNVerification::validate_hn_init(builder, analyzer, constraint);
    EXPECT_TRUE(result.oink.valid);
    EXPECT_FALSE(result.main_sumcheck.fingerprint_valid);
    EXPECT_FALSE(result.all_valid);
}

// Corrupts the selector-zero pre-batching padding. It has its own stage so the failure is attributed
// there, not folded into the head stage or the batching windows.
TEST_F(HNInitRecursionTestSuite, ValidateHNInitDetectsPreBatchingPaddingCorruption)
{
    BB_DISABLE_ASSERTS();
    const auto setup = make_hn_init_acir_setup();
    HNBuilder builder = build_hn_circuit_from_acir(setup);
    HNAnalyzer analyzer(builder, false);
    const auto& constraint = setup.hn_constraint(0);

    namespace INIT = HNVerification::HNInitValidation;
    const size_t padding_start = INIT::INIT_OINK_MAINSC_LIVE_ARITH.gate_count;
    ASSERT_NE(corrupt_arith_selector_in_range(builder, padding_start, INIT::INIT_PRE_BATCHING_PADDING_ARITH.gate_count),
              SIZE_MAX);

    auto result = HNVerification::validate_hn_init(builder, analyzer, constraint);
    EXPECT_TRUE(result.main_sumcheck.fingerprint_valid);
    EXPECT_FALSE(result.pre_batching_padding.fingerprint_valid);
    EXPECT_FALSE(result.batching.fingerprint_valid);
    EXPECT_FALSE(result.all_valid);
}

// Corrupts a gate inside the batching-phase challenge windows: the batching stage flips false while the
// two stages before it stay valid.
TEST_F(HNInitRecursionTestSuite, ValidateHNInitDetectsBatchingCorruption)
{
    BB_DISABLE_ASSERTS();
    const auto setup = make_hn_init_acir_setup();
    HNBuilder builder = build_hn_circuit_from_acir(setup);
    HNAnalyzer analyzer(builder, false);
    const auto& constraint = setup.hn_constraint(0);

    namespace INIT = HNVerification::HNInitValidation;
    const size_t batching_start =
        INIT::INIT_OINK_MAINSC_LIVE_ARITH.gate_count + INIT::INIT_PRE_BATCHING_PADDING_ARITH.gate_count;
    const size_t batching_span =
        INIT::INIT_NUM_BATCHING_CHALLENGE_WINDOWS * INIT::INIT_BATCHING_CHALLENGE_WINDOW_ARITH.gate_count;
    ASSERT_NE(corrupt_arith_selector_in_range(builder, batching_start, batching_span), SIZE_MAX);

    auto result = HNVerification::validate_hn_init(builder, analyzer, constraint);
    EXPECT_TRUE(result.main_sumcheck.fingerprint_valid);
    EXPECT_TRUE(result.pre_batching_padding.fingerprint_valid);
    EXPECT_FALSE(result.batching.fingerprint_valid);
    EXPECT_FALSE(result.all_valid);
}

// Corrupts the post-batching tail (accumulator hash / default databus commitments / KernelIO). This span
// was never fingerprinted under the retired squeeze model, so it had no corruption coverage at all.
TEST_F(HNInitRecursionTestSuite, ValidateHNInitDetectsPostBatchingTailCorruption)
{
    BB_DISABLE_ASSERTS();
    const auto setup = make_hn_init_acir_setup();
    HNBuilder builder = build_hn_circuit_from_acir(setup);
    HNAnalyzer analyzer(builder, false);
    const auto& constraint = setup.hn_constraint(0);

    namespace INIT = HNVerification::HNInitValidation;
    const size_t tail_start =
        INIT::INIT_OINK_MAINSC_LIVE_ARITH.gate_count + INIT::INIT_PRE_BATCHING_PADDING_ARITH.gate_count +
        INIT::INIT_NUM_BATCHING_CHALLENGE_WINDOWS * INIT::INIT_BATCHING_CHALLENGE_WINDOW_ARITH.gate_count;
    ASSERT_NE(corrupt_arith_selector_in_range(builder, tail_start, INIT::INIT_POST_BATCHING_TAIL_ARITH.gate_count),
              SIZE_MAX);

    auto result = HNVerification::validate_hn_init(builder, analyzer, constraint);
    EXPECT_TRUE(result.batching.fingerprint_valid);
    EXPECT_FALSE(result.post_batching.valid);
    EXPECT_FALSE(result.arith_coverage_valid);
    EXPECT_FALSE(result.all_valid);
}

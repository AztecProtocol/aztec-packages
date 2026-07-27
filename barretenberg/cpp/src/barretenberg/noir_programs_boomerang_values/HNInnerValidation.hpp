#pragma once

#include "barretenberg/dsl/acir_format/recursion_constraint.hpp"
#include "barretenberg/noir_programs_boomerang_values/HNInitValidation.hpp"
#include "barretenberg/noir_programs_boomerang_values/HNOinkValidationCommon.hpp"
#include "barretenberg/noir_programs_boomerang_values/hypernova_verification.hpp"
#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_helper.hpp"

#include <algorithm>
#include <optional>
#include <vector>

// HN::INNER boomerang validation — two folding loops (C0 kernel + C1 app), a bridge between
// them, and per-loop post-claim-batching tails. Included from `hypernova_verification.hpp`
// inside `namespace HNVerification`.
//
// Stage 3.2 step 1 (2026-07-16) re-derivation: the old model (HN_INNER_TOTAL_SQUEEZES=180,
// HN_INNER_LOOP_SIZE=90, a 77-gate bridge, and 12/13-squeeze C0_KERNEL/C1_APP post-MLB profiles)
// was frozen at pre-Stage-4 values and genuinely wrong post-delayed-merge, not just stale offsets
// — see hn_inner_squeeze_map.txt / hn_inner_boundary_windows_analysis.txt
// (HNInnerSqueezeMapDump / HNInnerBoundaryWindowsDump). Empirically confirmed on the current
// 2-constraint fixture (175 total squeezes):
//   - Loop0 (kernel role) occupies global sq[0..87] (88 squeezes): the canonical RESET-style
//     baseline (Oink 4 squeezes + main-SC 24 + batching 33 + MLB 24 + claim_batching = 87
//     squeezes, sq[0..86], UNCHANGED from the shared HN_SQUEEZE_* constants) followed by exactly
//     ONE post-claim-batching squeeze (sq[87]) — the delayed-merge `ecc_op_hash_step` absorb plus
//     the kernel-only 3-slot consistency-check content, replacing the old 12-squeeze tail.
//   - The bridge is the gap between sq[87] and sq[88]: 32 gates, not 77.
//   - Loop1 (app role) occupies global sq[88..174] (87 squeezes): a 3-squeeze Oink-equivalent
//     prefix (eta=end-of-commitment-chain, beta, alpha=gate_challenge — ONE FEWER squeeze than
//     loop0's canonical 4, exactly what LOOP1_TAIL_SQUEEZE_OFFSET=1 already compensates for) +
//     main-SC 24 (not the stale 21) + batching 33 + MLB 24 + claim_batching = 86 squeezes
//     (sq[88..173]) followed by exactly ONE post-claim-batching squeeze (sq[174], the very last
//     squeeze in the array) — same `ecc_op_hash_step` template (confirmed: its 20-gate prefix
//     hash matches loop0's post-claim squeeze exactly) plus last-in-queue KernelIO/accumulator-hash
//     closeout content instead of the kernel-only consistency check.
// The 12/13-squeeze-per-loop post-MLB model and its many per-k special-cased fingerprints are
// gone entirely — each loop now has exactly one post-claim-batching window, pinned as a single
// monolithic FunctionFingerprint (arith-only, no poseidon requirement: like INIT's Stage 4c
// pre-eta fix, these are homogeneous single-purpose absorb/closeout gates whose selector
// signature is a weak/generic hash, so a poseidon link search either finds nothing precise or a
// spuriously broad match — arithmetic-only pinning is exactly as strong here since any corruption
// in the window still flips the arith hash).

// ============================================================================
// Cursor-chain re-derivation (2026-07-27), per hn_cursor_chaining_plan.md, after the second (larger)
// `origin/next` merge invalidated the entire squeeze-index model above (175/180-squeeze constants:
// most Fiat-Shamir challenges collapsed fr, undercounting squeezes; see NEXT_MERGE_COMPILE_FIXES.md
// items 11-13, tracker.md 10.16-10.19, recursion_constraints_validation/hn_inner_{analysis,plan,tz}.md).
// Measured on the real create_circuit build (hn_count=2: 1 kernel loop0 + 1 app loop1,
// HNInnerBoundaryWindowsDump / AcirHNInnerLoop0Loop1VkHashAnchorPositions /
// AcirHNInnerLoop0MLBDivergenceDiscovery). All constants below are witness-anchored, real, measured --
// not guessed or copy-pasted across kernels.
//
// Total arithmetic coverage (8589 gates, matches builder.blocks.arithmetic.size() exactly):
//   [0,2602) RESET_OINK_MAINSC_LIVE_ARITH (byte-identical to RESET -- loop0 IS a RESET fold)
//   [2602,3989) RESET_PRE_BATCHING_PADDING_ARITH (byte-identical to RESET)
//   [3989,4649) 33x RESET_BATCHING_CHALLENGE_WINDOW_ARITH (byte-identical to RESET)
//   [4649,5472) INNER_LOOP0_MLB_AND_CLAIM_BATCHING_ARITH -- NEW: same prefix as RESET's own
//     RESET_MLB_AND_CLAIM_BATCHING_ARITH (same MLB-alpha opening shape) but a DIFFERENT full_hash;
//     per-gate walk (AcirHNInnerLoop0MLBDivergenceDiscovery) found first 243/823 gates byte-identical
//     to RESET, diverging mid-way through MLB Sumcheck round 1. Root cause not fully attributed to a
//     specific emitting statement this pass (open follow-up, same class as RESET_PRE_BATCHING_PADDING's
//     own unattributed-emitter note) -- pinned as its own measured constant rather than aliased.
//   [5472,5524) INNER_LOOP0_POST_MLB_TAIL_ARITH -- NEW, fully different from RESET's tail (expected:
//     loop0 feeds the bridge/loop1, not a final accumulator).
//   [5524,5556) INNER_BRIDGE_ARITH -- NEW, replaces the dead old BRIDGE_ARITH (different hash entirely).
//   [5556,5665) INNER_LOOP1_PRE_ETA_ARITH -- NEW, replaces the stale old LOOP1_PRE_ETA_ARITH (which does
//     not match at all post-merge).
//   [5665,7096) INNER_LOOP1_OINK_MAINSC_LIVE_ARITH -- NEW, loop1's own combined Oink+MainSC span
//     (app-flavor, smaller than loop0's 2602 -- fewer commitments, INIT found the same pattern).
//   [7096,7636) 27x RESET_BATCHING_CHALLENGE_WINDOW_ARITH (byte-identical hash to RESET's window, but
//     COUNT is 27 not 33 -- confirmed real, not a hypothesis: loop1 folds fewer claims than loop0/RESET).
//   [7636,8521) INNER_LOOP1_MLB_AND_TAIL_ARITH -- NEW, shares loop0's tail's prefix (same MLB-alpha
//     opening) but different full_hash and 10 gates longer (885 vs 875) -- consistent with the existing
//     LOOP1_POST_CLAIM_TAIL_ARITH doc comment's num_apps==1 "fix_witness-skip quirk" note below.
//   [8521,8589) INNER_FINAL_TAIL_ARITH -- NEW, shares first-20-gate prefix with
//     HNFinalValidation::HN_FINAL_POST_MERGE_TAIL_ARITH (same pairing-aggregate finalization shape) but
//     more content (68 vs FINAL's 22 gates) -- plausibly kernel-output-accumulator-hash / databus-
//     consistency writes FINAL's hiding-kernel path doesn't do. Root cause not fully source-traced this
//     pass (open follow-up), pinned as its own measured constant.
//
// Total poseidon2 coverage (13325 gates, matches builder.blocks.poseidon2.size() exactly):
//   [0,300) out of scope -- not linked to this constraint's witnesses (same documented carve-out RESET
//     uses for its own [0, primitive_start) prefix).
//   [300,1576) RESET_VK_HASH_POSEIDON2 (loop0's vk_hash -- byte-identical position AND content to RESET).
//   [1576,6400) INNER_LOOP0_POSEIDON2_TAIL -- NEW (shares RESET_POSEIDON2_TAIL's prefix -- same sponge
//     absorb shape -- but shorter: loop0's own tail is cut short by loop1's vk_hash starting at 6400).
//   [6400,7676) RESET_VK_HASH_POSEIDON2 (loop1's vk_hash -- SAME profile/constant as loop0's, confirmed
//     via a distinct anchor position, not a coincidental match: AcirHNInnerLoop0Loop1VkHashAnchorPositions
//     proved EXPECT_NE(anchor0.poseidon2_ext_start, anchor1.poseidon2_ext_start)).
//   [7676,13325) INNER_LOOP1_POSEIDON2_TAIL -- NEW (same sponge-absorb prefix shape as RESET's tail).
//
// Scope: this measured chain covers hn_count==2 (1 kernel + 1 app) only -- the configuration every
// existing INNER test constructs. hn_count>2 (num_apps>=2) needs its own fresh dump/re-derivation
// (structurally different: N-1 bridges, N-1 app loops, a different last-entry tail per num_apps -- see
// the existing num_apps==2/3 measured-but-unpromoted comments below validate_inner_loop_app) and is
// explicitly deferred, not silently mis-validated -- mirrors HNInitValidation's own single-app scope
// carve-out (tracker.md 10.18), which was reviewed and passed with the same kind of boundary.
// ============================================================================

namespace HNVerification {
using namespace recursion_helpers;
namespace HNInnerValidation {

using IvQueueExpectedVk = HNInitValidation::IvQueueExpectedVk;
using IvQueueValidationResult = HNInitValidation::IvQueueValidationResult;
using VkHashValidationResult = HNOinkValidation::VkHashValidationResult;

inline constexpr FunctionFingerprint INNER_LOOP0_MLB_AND_CLAIM_BATCHING_ARITH = {
    823, 0x759410a0cce32760ULL, 0x95280f2f97452378ULL, 20
};
inline constexpr FunctionFingerprint INNER_LOOP0_POST_MLB_TAIL_ARITH = {
    52, 0x84833fe1f966001cULL, 0xea8f52b201632bddULL, 20
};
inline constexpr FunctionFingerprint INNER_BRIDGE_ARITH = { 32, 0x169e1adb0fb1fb81ULL, 0x7376682d14e7c647ULL, 20 };
inline constexpr FunctionFingerprint INNER_LOOP1_PRE_ETA_ARITH_V2 = {
    109, 0x348959549501a5d6ULL, 0xa248c783bed90d44ULL, 20
};
inline constexpr FunctionFingerprint INNER_LOOP1_OINK_MAINSC_LIVE_ARITH = {
    1431, 0x8c59fcd76e0d277eULL, 0x28ebf5f0162a9919ULL, 20
};
static constexpr size_t INNER_LOOP1_NUM_BATCHING_CHALLENGE_WINDOWS = 27;
inline constexpr FunctionFingerprint INNER_LOOP1_MLB_AND_TAIL_ARITH = {
    885, 0x759410a0cce32760ULL, 0x3f841a971f2bc262ULL, 20
};
inline constexpr FunctionFingerprint INNER_FINAL_TAIL_ARITH = { 68, 0xe1afa2edd58e5946ULL, 0x5d60484faba481fdULL, 20 };
inline constexpr FunctionFingerprint INNER_LOOP0_POSEIDON2_TAIL = {
    4824, 0xdaf56faae2628656ULL, 0xd3e03f1c23fabb3aULL, 20
};
inline constexpr FunctionFingerprint INNER_LOOP1_POSEIDON2_TAIL = {
    5649, 0xdaf56faae2628656ULL, 0xcd48e8c4b1625b84ULL, 20
};

// C0 loop0 pre_eta arith is byte-identical to RESET's own OINK_PRE_ETA_ARITH (confirmed via
// DebugLoop0PreEtaWindow, Stage 3.2 step 1: both are a from-scratch Oink verify of one proof,
// same shape). The old 1015-gate pin here was stale -- there are only 272 gates available before
// squeeze[0] in this circuit, so a 1015-gate window could never have matched.
inline constexpr FunctionFingerprint C0_PRE_ETA_ARITH = HNVerification::OINK_PRE_ETA_ARITH;

// C1 micro-OINK vk_hash — same template as INIT (hn_inner_c1_oink_micro_analysis.txt).
inline constexpr FunctionFingerprint C1_VK_HASH_ARITH = HNInitValidation::INIT_VK_HASH_ARITH;
inline constexpr FunctionFingerprint C1_VK_HASH_POSEIDON2_EXT = HNInitValidation::INIT_VK_HASH_POSEIDON2_EXT;
inline constexpr FunctionFingerprint C1_VK_HASH_POSEIDON2_INT = HNInitValidation::INIT_VK_HASH_POSEIDON2_INT;

inline constexpr HNOinkValidation::VkHashProfile C1_VK_HASH_PROFILE{
    .arith = C1_VK_HASH_ARITH,
    .poseidon2_ext = C1_VK_HASH_POSEIDON2_EXT,
    .poseidon2_int = C1_VK_HASH_POSEIDON2_INT,
};

// Loop1's pre-eta commitment/public-input transcript-absorption chain (Stage 3.2 step 1,
// mirroring HNInitValidation's INIT_PRE_ETA_ARITH fix): one monolithic fingerprint over
// [vk_hash.arith_end, eta_squeeze+1) instead of the old positional 16x5-gate
// COMMITMENT_RECEIVE_ARITH model. From hn_inner_boundary_windows_analysis.txt
// (HNInnerBoundaryWindowsDump); differs from INIT's own 76-gate chain (109 gates here) since
// this is the app-verify variant, not the OINK-only variant.
inline constexpr FunctionFingerprint LOOP1_PRE_ETA_ARITH = { 109, 0xadb4a58bfc92dcabULL, 0x3d1e3b76dc6b88e9ULL, 20 };

// Loop1 inter-squeeze after micro-chain (already correctly aliased to INIT's re-derived values --
// no change needed here, only the round count / post-claim model below were stale).
inline constexpr FunctionFingerprint C1_INTER_SQUEEZE_ARITH = HNInitValidation::OINK_BETA_TO_ALPHA_ARITH;
inline constexpr FunctionFingerprint C1_INTER_SQUEEZE_POSEIDON2_EXT =
    HNInitValidation::OINK_BETA_TO_ALPHA_POSEIDON2_EXT;
inline constexpr FunctionFingerprint C1_INTER_SQUEEZE_POSEIDON2_INT =
    HNInitValidation::OINK_BETA_TO_ALPHA_POSEIDON2_INT;

// Bridge between consecutive loops: single ecc_op_hash_step absorb, 32 gates (was stale 77-gate
// INNER_INTER_LOOP_TAIL_ARITH in hypernova_verification.hpp -- superseded by this INNER-local
// constant; arith-only, see file-header rationale above).
inline constexpr FunctionFingerprint BRIDGE_ARITH = { 32, 0x1e092eca9c65aadcULL, 0x6f5b7beb662fb358ULL, 20 };

// Loop0 (kernel-role) post-claim-batching tail: ecc_op_hash_step + kernel-only 3-slot
// consistency-check content. Single squeeze, replaces the old 12-squeeze C0_KERNEL model.
inline constexpr FunctionFingerprint LOOP0_POST_CLAIM_TAIL_ARITH = {
    474, 0x8c844843809d1fbdULL, 0xfa9373e3235f4ed8ULL, 20
};

// Loop1 (app-role, last-in-queue) post-claim-batching tail: ecc_op_hash_step + KernelIO/
// accumulator-hash closeout content. Single squeeze, replaces the old 13-squeeze C1_APP model.
// Shares LOOP0_POST_CLAIM_TAIL_ARITH's 20-gate prefix hash (same shared ecc_op_hash_step
// template) but a different full length/hash (closeout content differs from the kernel-only
// consistency check) -- confirms both windows share a common absorb prefix, as expected.
inline constexpr FunctionFingerprint LOOP1_POST_CLAIM_TAIL_ARITH = {
    270, 0x8c844843809d1fbdULL, 0x56518774a60a773eULL, 20
};

// Middle-app (not last in queue) post-claim-batching tail. Stage 3.2 step 2/5 discovery
// (tracker.md 10.7/10.8, K=2/K=3 fixtures): every non-last entry -- kernel or app -- shares this
// shape. Confirmed byte-identical (full_hash) to LOOP0_POST_CLAIM_TAIL_ARITH across 4 independent
// instances; the 1-gate-shorter count is a middle-app entry lacking the one `fix_witness` gate
// present in the kernel-role variant (calculate_hash_arithmetic_block skips fix_witness gates, so
// the hash matches regardless).
inline constexpr FunctionFingerprint MIDDLE_APP_POST_CLAIM_TAIL_ARITH = {
    473, 0x8c844843809d1fbdULL, 0xfa9373e3235f4ed8ULL, 20
};

// Loop1's main Sumcheck has 24 rounds (round_0..round_23, matching the shared
// HN_NUM_MAIN_SC_SQUEEZES post-Stage-4; was stale at 21), consuming local
// sq[LOOP1_MAIN_SC_BASE..LOOP1_MAIN_SC_BASE+LOOP1_MAIN_SC_ROUNDS]. This must land exactly on
// sq_idx(HN_SQUEEZE_MAIN_SC_LAST) so the batching-transition window that follows starts where
// this loop ends, with no unfingerprinted gap in between.
static constexpr size_t LOOP1_MAIN_SC_ROUNDS = HN_NUM_MAIN_SC_SQUEEZES;
static constexpr size_t LOOP1_MAIN_SC_BASE = 2;
static constexpr size_t LOOP1_TAIL_SQUEEZE_OFFSET = 1;

// Loop0 occupies global sq[0..87] (88 squeezes: 87 canonical baseline squeezes sq[0..86] + 1
// post-claim tail squeeze sq[87]); loop1 occupies the remaining sq[88..] (87 squeezes for the
// 2-constraint fixture: 86 canonical-minus-one-offset baseline squeezes + 1 post-claim tail).
// Local index of loop0's own post-claim tail squeeze within its 88-entry slice.
static constexpr size_t LOOP0_LOCAL_POST_CLAIM_TAIL_IDX = 87;
// Local index of loop1's claim_batching squeeze within its own slice (canonical 86, minus
// LOOP1_TAIL_SQUEEZE_OFFSET=1); its post-claim tail squeeze is the very next (last) entry.
static constexpr size_t LOOP1_LOCAL_CLAIM_BATCHING_IDX = HN_SQUEEZE_CLAIM_BATCHING - LOOP1_TAIL_SQUEEZE_OFFSET;
static constexpr size_t LOOP1_LOCAL_POST_CLAIM_TAIL_IDX = LOOP1_LOCAL_CLAIM_BATCHING_IDX + 1;
// Global index of loop0's last squeeze (its post-claim tail) == loop0's squeeze count - 1.
static constexpr size_t HN_INNER_LOOP0_SQUEEZES = LOOP0_LOCAL_POST_CLAIM_TAIL_IDX + 1;

struct MicroOinkValidationResult {
    VkHashValidationResult vk_hash;
    bool commitment_chain_valid = false;
    bool pre_eta_tail_valid = false;
    bool inter_squeeze_valid = false;
    bool gate_challenge_valid = false;
    bool valid = false;
};

struct BridgeValidationResult {
    bool valid = false;
    size_t arith_start = 0;
    size_t arith_end = 0;
};

struct LoopValidationResult : HNBaselineValidationResult {
    MicroOinkValidationResult micro_oink;
    // C0 (loop0): opcode key_hash witness reaches the loop0 Oink vk_hash region (poseidon2 + arith).
    // C1 (loop1): mirrors micro_oink.vk_hash.valid (already witness-anchored on constraint.key_hash).
    bool key_hash_linked = false;
};

struct OpcodeValidationResult {
    size_t constraint_index = 0;
    IvQueueValidationResult iv_queue;
    LoopValidationResult loop;
    BridgeValidationResult bridge;
    bool all_valid = false;
};

struct Result {
    // loops[0] = kernel (C0); loops[1..] = apps, in queue order. bridges[i] links loops[i] to
    // loops[i+1]. iv_queues is parallel to loops but only populated for entries an optional
    // queue/expected-VK snapshot was supplied for (see `validate`).
    std::vector<LoopValidationResult> loops;
    std::vector<BridgeValidationResult> bridges;
    std::vector<IvQueueValidationResult> iv_queues;
    size_t total_squeezes = 0;
    // Structure sanity check for loops[1] specifically (the first app entry) -- not generalized to
    // a per-app vector since it's a debug/structural flag, not a correctness-critical check.
    bool loop1_structure_valid = false;
    bool all_valid = false;
};

/**
 * @brief Cross-check one INNER ACIR constraint against its IVC verification queue entry.
 *
 * Same metadata checks as INIT, but `expect_is_kernel` distinguishes C0 (previous kernel,
 * is_kernel=true) from C1 (new app, is_kernel=false). Used by integration tests that pass
 * both queue slots and expected VK snapshots.
 *
 * @param builder           Populated INNER circuit with constraint witness values.
 * @param constraint        HN recursion constraint for this opcode (key, key_hash, proof_type, …).
 * @param queue_entry       Native IVC queue slot being recursively verified.
 * @param expected_vk       VK field elements and hash captured before circuit construction.
 * @param expect_is_kernel  true for C0 (constraint index 0), false for C1 (constraint index 1).
 * @return                  Per-check flags and aggregate valid bit (checked is always true).
 */
template <typename FF, typename CircuitBuilder>
IvQueueValidationResult validate_iv_queue_consistency(CircuitBuilder& builder,
                                                      const acir_format::RecursionConstraint& constraint,
                                                      const Chonk::VerifierInputs& queue_entry,
                                                      const IvQueueExpectedVk& expected_vk,
                                                      bool expect_is_kernel)
{
    IvQueueValidationResult result;
    result.checked = true;

    // INNER's queue entries (previous-kernel verify or app verify) are always PROOF_TYPE::HN -- only INIT's
    // leading entry (OINK) and HIDING's entry (HN_FINAL) differ, per expected_proof_type in
    // recursion_constraint.hpp. VerifierInputs no longer carries a per-entry proof-type tag.
    result.proof_type_matches = constraint.proof_type == static_cast<uint32_t>(acir_format::PROOF_TYPE::HN);
    result.is_kernel_matches = queue_entry.is_kernel() == expect_is_kernel;
    result.public_inputs_empty = constraint.public_inputs.empty();
    result.proof_empty = constraint.proof.empty();

    const std::vector<bb::fr>& vk_fields = expected_vk.fields;
    const bb::fr& vk_hash = expected_vk.hash;

    result.vk_witnesses_match = constraint.key.size() == vk_fields.size();
    for (size_t i = 0; i < constraint.key.size() && result.vk_witnesses_match; ++i) {
        if (builder.get_variable(constraint.key[i]) != vk_fields[i]) {
            result.vk_witnesses_match = false;
        }
    }
    result.key_hash_matches = builder.get_variable(constraint.key_hash) == vk_hash;

    result.valid = result.proof_type_matches && result.is_kernel_matches && result.public_inputs_empty &&
                   result.proof_empty && result.vk_witnesses_match && result.key_hash_matches;
    return result;
}

/**
 * @brief Validate one loop's single post-claim-batching tail squeeze (arith-only).
 *
 * Post-Stage-4 (delayed merge), a loop's post-claim-batching content collapsed to exactly one
 * squeeze (the `ecc_op_hash_step` absorb, plus role-specific closeout content) -- see the
 * Stage 3.2 file-header note for why this replaced the old 12/13-squeeze per-k model.
 *
 * @param builder  Populated circuit.
 * @param ws       Arithmetic-block start (claim_batching squeeze's gate index + 1).
 * @param we       Arithmetic-block end (this loop's own last squeeze's gate index + 1).
 * @param fp       LOOP0_POST_CLAIM_TAIL_ARITH or LOOP1_POST_CLAIM_TAIL_ARITH.
 * @return         true iff the window's selector-hash fingerprint matches.
 */
template <typename CircuitBuilder>
bool validate_post_claim_tail(CircuitBuilder& builder, size_t ws, size_t we, const FunctionFingerprint& fp)
{
    auto& arith = builder.blocks.arithmetic;
    if (ws + fp.gate_count > arith.size() || we - ws != fp.gate_count) {
        return false;
    }
    return matches_fingerprint_at(builder, arith, ws, fp);
}

/**
 * @brief Validate loop0 (C0) Oink inter-squeeze windows — baseline RESET-style path.
 *
 * C0 has no vk_hash ACIR anchor; uses C0-specific pre_eta arith (1015 gates, differs from
 * RESET hash) plus standard eta→beta and beta→alpha windows. Gate challenge is validated
 * by validate_hn_baseline_impl when called from validate_inner_loop0.
 *
 * @param builder   Populated circuit.
 * @param analyzer  Static analyzer for poseidon link traversal.
 * @param sq        Loop0 squeeze indices sq[0..89] (local slice, 90 entries).
 * @param cursor    Poseidon cursor advanced across Oink windows.
 * @param result    LoopValidationResult; oink sub-fields updated on success.
 * @return          true when pre_eta, eta→beta, and beta→alpha windows match.
 */
template <typename FF, typename CircuitBuilder>
bool validate_loop0_oink(CircuitBuilder& builder,
                         cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                         const std::vector<size_t>& sq,
                         HNPoseidonCursor& cursor,
                         LoopValidationResult& result)
{
    const auto validate_window = [&](size_t arith_start,
                                     size_t arith_end,
                                     const FunctionFingerprint& arith_fp,
                                     const FunctionFingerprint& p2ext_fp,
                                     const FunctionFingerprint& p2int_fp) {
        return validate_hn_window_poseidon<FF>(
            builder, analyzer, arith_start, arith_end, arith_fp, p2ext_fp, p2int_fp, cursor);
    };

    const size_t pre_eta_start = (sq[HN_SQUEEZE_OINK_ETA] + 1 >= C0_PRE_ETA_ARITH.gate_count)
                                     ? (sq[HN_SQUEEZE_OINK_ETA] + 1 - C0_PRE_ETA_ARITH.gate_count)
                                     : 0;
    if (!validate_window(pre_eta_start,
                         sq[HN_SQUEEZE_OINK_ETA] + 1,
                         C0_PRE_ETA_ARITH,
                         OINK_PRE_ETA_POSEIDON2_EXT,
                         OINK_PRE_ETA_POSEIDON2_INT)) {
        return false;
    }
    result.oink.pre_eta_arith_start = pre_eta_start;

    if (!validate_window(sq[HN_SQUEEZE_OINK_ETA] + 1,
                         sq[HN_SQUEEZE_OINK_BETA] + 1,
                         OINK_ETA_TO_BETA_ARITH,
                         OINK_ETA_TO_BETA_POSEIDON2_EXT,
                         OINK_ETA_TO_BETA_POSEIDON2_INT)) {
        return false;
    }
    result.oink.eta_to_beta_arith_start = sq[HN_SQUEEZE_OINK_ETA] + 1;

    if (!validate_window(sq[HN_SQUEEZE_OINK_BETA] + 1,
                         sq[HN_SQUEEZE_OINK_ALPHA] + 1,
                         OINK_BETA_TO_ALPHA_ARITH,
                         OINK_BETA_TO_ALPHA_POSEIDON2_EXT,
                         OINK_BETA_TO_ALPHA_POSEIDON2_INT)) {
        return false;
    }
    result.oink.beta_to_alpha_arith_start = sq[HN_SQUEEZE_OINK_BETA] + 1;
    result.oink.valid = true;
    return true;
}

/**
 * @brief Validate loop1 (C1) micro-Oink chain — INIT-style vk_hash + commitment receive path.
 *
 * Anchors vk_hash from constraint.key_hash, validates the monolithic pre-eta transcript-
 * absorption chain (LOOP1_PRE_ETA_ARITH, Stage 3.2), checks the cursor reaches the eta squeeze,
 * then C1 inter-squeeze and gate challenge windows before main sumcheck.
 *
 * @param builder     Populated circuit.
 * @param analyzer    Static analyzer for poseidon link traversal.
 * @param sq          Loop1 squeeze indices (local slice; global offset HN_INNER_LOOP0_SQUEEZES).
 * @param cursor      Poseidon cursor for inter-squeeze and gate-challenge windows.
 * @param constraint  C1 ACIR recursion constraint (key_hash anchor source).
 * @param result      MicroOinkValidationResult filled with per-stage flags.
 * @return            true when the full micro-Oink chain and gate challenge pass.
 */
template <typename FF, typename CircuitBuilder>
bool validate_loop1_micro_oink(CircuitBuilder& builder,
                               cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                               const std::vector<size_t>& sq,
                               HNPoseidonCursor& cursor,
                               const acir_format::RecursionConstraint& constraint,
                               MicroOinkValidationResult& result)
{
    const auto validate_window = [&](size_t arith_start,
                                     size_t arith_end,
                                     const FunctionFingerprint& arith_fp,
                                     const FunctionFingerprint& p2ext_fp,
                                     const FunctionFingerprint& p2int_fp) {
        return validate_hn_window_poseidon<FF>(
            builder, analyzer, arith_start, arith_end, arith_fp, p2ext_fp, p2int_fp, cursor);
    };

    result.vk_hash = HNOinkValidation::validate_vk_hash_anchor<FF>(builder, analyzer, constraint, C1_VK_HASH_PROFILE);
    if (!result.vk_hash.valid) {
        return false;
    }

    size_t oink_cursor = result.vk_hash.arith_end;
    result.commitment_chain_valid =
        HNOinkValidation::validate_pre_eta_transcript_chain(builder, oink_cursor, LOOP1_PRE_ETA_ARITH);
    if (!result.commitment_chain_valid) {
        return false;
    }
    oink_cursor += LOOP1_PRE_ETA_ARITH.gate_count;

    result.pre_eta_tail_valid = oink_cursor <= sq[HN_SQUEEZE_OINK_ETA] + 1;
    if (!result.pre_eta_tail_valid) {
        return false;
    }

    result.inter_squeeze_valid = validate_window(sq[HN_SQUEEZE_OINK_ETA] + 1,
                                                 sq[HN_SQUEEZE_OINK_BETA] + 1,
                                                 C1_INTER_SQUEEZE_ARITH,
                                                 C1_INTER_SQUEEZE_POSEIDON2_EXT,
                                                 C1_INTER_SQUEEZE_POSEIDON2_INT);
    if (!result.inter_squeeze_valid) {
        return false;
    }

    result.gate_challenge_valid = validate_window(sq[HN_SQUEEZE_OINK_BETA] + 1,
                                                  sq[HN_SQUEEZE_OINK_ALPHA] + 1,
                                                  CHALLENGE_EXTRACT_25_ARITH,
                                                  CHALLENGE_EXTRACT_POSEIDON2_EXT,
                                                  CHALLENGE_EXTRACT_POSEIDON2_INT);
    result.valid = result.gate_challenge_valid;
    return result.valid;
}

// Cursor-chain arith totals (compile-time; sums of pinned RESET-shared + INNER-specific gate counts,
// hn_count==2 scope only). Used both to bound each loop's own coverage check and to hand the next
// loop/bridge its starting arith gate -- these are DERIVED from already-witness-verified fingerprint
// gate counts, not independently-guessed absolute indices.
static constexpr size_t INNER_LOOP0_ARITH_END =
    RESET_OINK_MAINSC_LIVE_ARITH.gate_count + RESET_PRE_BATCHING_PADDING_ARITH.gate_count +
    RESET_NUM_BATCHING_CHALLENGE_WINDOWS * RESET_BATCHING_CHALLENGE_WINDOW_ARITH.gate_count +
    INNER_LOOP0_MLB_AND_CLAIM_BATCHING_ARITH.gate_count + INNER_LOOP0_POST_MLB_TAIL_ARITH.gate_count;
static constexpr size_t INNER_BRIDGE_ARITH_END = INNER_LOOP0_ARITH_END + INNER_BRIDGE_ARITH.gate_count;
static constexpr size_t INNER_LOOP1_ARITH_END =
    INNER_BRIDGE_ARITH_END + INNER_LOOP1_PRE_ETA_ARITH_V2.gate_count + INNER_LOOP1_OINK_MAINSC_LIVE_ARITH.gate_count +
    INNER_LOOP1_NUM_BATCHING_CHALLENGE_WINDOWS * RESET_BATCHING_CHALLENGE_WINDOW_ARITH.gate_count +
    INNER_LOOP1_MLB_AND_TAIL_ARITH.gate_count;
static constexpr size_t INNER_FINAL_ARITH_END = INNER_LOOP1_ARITH_END + INNER_FINAL_TAIL_ARITH.gate_count;

/**
 * @brief Validate the 32-gate inter-loop bridge (single ecc_op_hash_step absorb) between loop0
 * and loop1, anchored at an explicit arith gate index (loop0's own derived arith end).
 *
 * Cursor-chain re-derivation: no longer squeeze-indexed (hn_cursor_chaining_plan.md). `arith_start`
 * is a caller-supplied cursor, itself derived from already-fingerprint-verified gate counts (either
 * loop0's live `arith_cursor_end`, or the compile-time `INNER_BRIDGE_ARITH_END`'s predecessor when
 * called independently per-opcode).
 *
 * @param builder      Populated circuit.
 * @param arith_start  First bridge gate (loop0's own arith cursor end).
 * @return             BridgeValidationResult with arith bounds and valid bit.
 */
template <typename CircuitBuilder>
BridgeValidationResult validate_inter_loop_bridge(CircuitBuilder& builder, size_t arith_start)
{
    BridgeValidationResult result;
    auto& arith = builder.blocks.arithmetic;
    if (arith_start + INNER_BRIDGE_ARITH.gate_count > arith.size()) {
        return result;
    }
    result.arith_start = arith_start;
    result.arith_end = arith_start + INNER_BRIDGE_ARITH.gate_count;
    result.valid = matches_fingerprint_at(builder, arith, arith_start, INNER_BRIDGE_ARITH);
    return result;
}

// One queue entry's squeeze-index span: [start_idx, last_idx] into the global squeeze array.
struct EntryBoundary {
    size_t start_idx = 0;
    size_t last_idx = 0;
};

/**
 * @brief Discover per-queue-entry squeeze boundaries for an N-app INNER kernel.
 *
 * Entry 0 (kernel role) is fixed-length (HN_INNER_LOOP0_SQUEEZES, confirmed independent of total
 * app count -- Stage 3.2 step 1). Every subsequent entry's end is NOT assumed: found by scanning
 * forward for the next BRIDGE_ARITH-shaped gap between consecutive squeezes (Stage 3.2 step 2/5
 * discovery, tracker.md 10.7/10.8). Returns fewer than hn_count entries if a bridge couldn't be
 * found or the total squeeze count is too small for even the kernel slice -- callers must check
 * `entries.size() == hn_count` before use.
 *
 * @param builder   Populated circuit.
 * @param sq        Full transcript squeeze-gate index map.
 * @param hn_count  Total HN recursion constraints in this kernel (1 kernel-verify + N apps).
 * @return          Up to hn_count EntryBoundary entries, in queue order.
 */
template <typename CircuitBuilder>
std::vector<EntryBoundary> discover_entry_boundaries(CircuitBuilder& builder,
                                                     const std::vector<size_t>& sq,
                                                     size_t hn_count)
{
    std::vector<EntryBoundary> entries;
    if (hn_count == 0 || sq.size() < HN_INNER_LOOP0_SQUEEZES) {
        return entries;
    }
    entries.push_back({ 0, HN_INNER_LOOP0_SQUEEZES - 1 });

    const size_t num_apps = hn_count - 1;
    size_t start = HN_INNER_LOOP0_SQUEEZES;
    for (size_t app = 0; app + 1 < num_apps; ++app) {
        size_t last_idx = SIZE_MAX;
        for (size_t i = start; i + 1 < sq.size(); ++i) {
            const size_t ws = sq[i] + 1;
            const size_t we = sq[i + 1] + 1;
            if (we - ws == BRIDGE_ARITH.gate_count &&
                matches_fingerprint_at(builder, builder.blocks.arithmetic, ws, BRIDGE_ARITH)) {
                last_idx = i;
                break;
            }
        }
        if (last_idx == SIZE_MAX) {
            return entries;
        }
        entries.push_back({ start, last_idx });
        start = last_idx + 1;
    }
    if (num_apps >= 1) {
        if (start > sq.size() - 1) {
            return entries;
        }
        entries.push_back({ start, sq.size() - 1 });
    }
    return entries;
}

/**
 * @brief Witness-link check: constraint0.key_hash reaches loop0's Oink vk_hash region.
 *
 * Stage 3.2 re-derivation: the original check required key_hash's real variable to appear
 * directly in an arithmetic gate inside loop0's Oink region. Empirically (AcirHNInnerC0KeyHashGateDiscovery)
 * key_hash's real variable now has ZERO arithmetic-block appearances anywhere in the circuit --
 * it feeds directly into the poseidon2_external vk_hash absorb with no arithmetic copy gate, so
 * that check could never pass. Fixed by reusing `validate_vk_hash_anchor` (which already proves
 * key_hash's real variable links to a fingerprint-matched arith+poseidon2 vk_hash group, the same
 * technique INIT/loop1 use) and checking the found group's position falls inside loop0's own Oink
 * span (`< oink_arith_hi`) -- this is what gives the check its discrimination power: passing
 * constraint1's key_hash still finds a valid anchor (loop1's own vk_hash, since both loops share
 * the same profile), just at a position outside loop0's span.
 *
 * @param builder     Populated circuit.
 * @param analyzer    Static analyzer for witness→gate traversal.
 * @param constraint  C0 ACIR recursion constraint (key_hash source).
 * @param sq          Loop0 squeeze indices (local slice, 88 entries).
 * @return            true when key_hash's vk_hash anchor is found and falls inside loop0's Oink span.
 */
template <typename FF, typename CircuitBuilder>
bool validate_c0_key_hash_link(CircuitBuilder& builder,
                               cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                               const acir_format::RecursionConstraint& constraint,
                               const std::vector<size_t>& sq)
{
    if (constraint.key.empty()) {
        return false;
    }
    const auto vk_hash =
        HNOinkValidation::validate_vk_hash_anchor<FF>(builder, analyzer, constraint, C1_VK_HASH_PROFILE);
    if (!vk_hash.valid) {
        return false;
    }
    const size_t oink_arith_hi = sq[HN_SQUEEZE_OINK_ALPHA] + 1;
    return vk_hash.arith_start < oink_arith_hi;
}

/**
 * @brief Validate loop0 (C0, previous-kernel) via a witness-anchored per-block cursor chain.
 *
 * primitive_start is `constraint0.key_hash`'s vk_hash anchor (poseidon2, RESET_VK_HASH_PROFILE-
 * equivalent). Arith chain reuses RESET's own byte-identical stages (Oink+MainSC, pre-batching
 * padding, 33 batching windows) then two loop0-specific stages measured this session
 * (INNER_LOOP0_MLB_AND_CLAIM_BATCHING_ARITH, INNER_LOOP0_POST_MLB_TAIL_ARITH). No squeeze indexing
 * anywhere (hn_cursor_chaining_plan.md). Discrimination from loop1 happens on the **poseidon2** side
 * only, not the arith side: the arith chain always starts at gate 0 regardless of which constraint
 * was passed, but `poseidon_cursor` starts at this constraint's own `vk_hash.poseidon2_ext_end` --
 * passing constraint1's key_hash resolves that to loop1's position (6400+1276), and the subsequent
 * `matches_fingerprint_at(poseidon2, ..., INNER_LOOP0_POSEIDON2_TAIL)` check fails there because the
 * real content at that position is loop1's own (differently-hashed) tail, not loop0's -- see
 * AcirHNInnerLoop0Loop1VkHashAnchorPositions.
 *
 * @param builder      Populated circuit.
 * @param analyzer     Static analyzer for witness→gate traversal.
 * @param constraint0  C0 ACIR recursion constraint (key_hash anchor source).
 * @return             LoopValidationResult; `arith_cursor_end` is loop0's own arith end (bridge start).
 */
template <typename FF, typename CircuitBuilder>
LoopValidationResult validate_inner_loop0(CircuitBuilder& builder,
                                          cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                          const acir_format::RecursionConstraint& constraint0)
{
    LoopValidationResult result;
    auto& arith = builder.blocks.arithmetic;
    auto& poseidon2 = builder.blocks.poseidon2;

    result.micro_oink.vk_hash =
        HNOinkValidation::validate_vk_hash_anchor<FF>(builder, analyzer, constraint0, C1_VK_HASH_PROFILE);
    if (!result.micro_oink.vk_hash.valid) {
        return result;
    }
    result.primitive_start_poseidon2 = result.micro_oink.vk_hash.poseidon2_ext_start;

    size_t poseidon_cursor = result.micro_oink.vk_hash.poseidon2_ext_end;
    if (!matches_fingerprint_at(builder, poseidon2, poseidon_cursor, INNER_LOOP0_POSEIDON2_TAIL)) {
        return result;
    }
    poseidon_cursor += INNER_LOOP0_POSEIDON2_TAIL.gate_count;
    result.poseidon2_cursor_end = poseidon_cursor;
    result.poseidon2_region_end = poseidon_cursor; // loop0's own declared scope, fully consumed above
    result.poseidon2_coverage_valid = true;

    size_t arith_cursor = 0;
    const auto advance = [&](const FunctionFingerprint& fp) {
        if (arith_cursor + fp.gate_count > arith.size() || !matches_fingerprint_at(builder, arith, arith_cursor, fp)) {
            return false;
        }
        arith_cursor += fp.gate_count;
        return true;
    };

    if (!advance(RESET_OINK_MAINSC_LIVE_ARITH)) {
        return result;
    }
    result.oink.valid = true;
    result.gate_challenge.valid = true;
    result.main_sumcheck.arith_end = arith_cursor;
    result.main_sumcheck.valid = true;

    result.pre_batching_padding.arith_start = arith_cursor;
    if (!advance(RESET_PRE_BATCHING_PADDING_ARITH)) {
        return result;
    }
    result.pre_batching_padding.valid = true;

    result.batching.arith_start = arith_cursor;
    for (size_t i = 0; i < RESET_NUM_BATCHING_CHALLENGE_WINDOWS; ++i) {
        if (!advance(RESET_BATCHING_CHALLENGE_WINDOW_ARITH)) {
            result.batching.squeezes_found = i;
            return result;
        }
    }
    result.batching.squeezes_found = RESET_NUM_BATCHING_CHALLENGE_WINDOWS;
    result.batching.valid = true;

    result.mlb.alpha_arith_start = arith_cursor;
    result.mlb.sc_arith_start = arith_cursor;
    if (!advance(INNER_LOOP0_MLB_AND_CLAIM_BATCHING_ARITH)) {
        return result;
    }
    result.mlb.sc_arith_end = arith_cursor;
    result.mlb.valid = true;
    result.shared_fold_core_arith_end = arith_cursor;

    result.post_mlb.transition_arith_start = arith_cursor;
    if (!advance(INNER_LOOP0_POST_MLB_TAIL_ARITH)) {
        return result;
    }
    result.post_mlb.valid = true;
    result.post_mlb.squeezes_found = 1;

    result.arith_cursor_end = arith_cursor;
    result.arith_region_end = INNER_LOOP0_ARITH_END;
    result.arith_coverage_valid = (arith_cursor == INNER_LOOP0_ARITH_END);

    // Full-chain match from constraint0's own key_hash anchor IS the witness-link proof (see
    // file-header discrimination note) -- not a separate/vacuous position-bound check.
    result.key_hash_linked = true;
    result.all_valid = result.arith_coverage_valid && result.poseidon2_coverage_valid && result.key_hash_linked;
    return result;
}

/**
 * @brief Validate loop1 (C1, app) via a witness-anchored per-block cursor chain, continuing the
 * arith cursor from the bridge's end.
 *
 * primitive_start is `constraint1.key_hash`'s own vk_hash anchor (same profile/constant as loop0's,
 * confirmed to resolve to a DIFFERENT poseidon2 position -- AcirHNInnerLoop0Loop1VkHashAnchorPositions
 * proved this with EXPECT_NE). Arith chain: loop1-specific pre-eta + Oink/MainSC live span (app-
 * flavor, fewer commitments than loop0/RESET), 27 batching windows (not loop0's 33 -- confirmed real,
 * app folds fewer claims), loop1-specific MLB+tail, then the shared final tail. Total arith/poseidon2
 * coverage to end-of-block is the PASS criterion (hn_count==2 scope only).
 *
 * @param builder      Populated circuit.
 * @param analyzer     Static analyzer for witness→gate traversal.
 * @param constraint1  C1 ACIR recursion constraint (key_hash anchor source).
 * @param arith_start  First loop1 arith gate (bridge's own arith_end).
 * @return             LoopValidationResult; total-coverage `all_valid` (reaches end of both blocks).
 */
template <typename FF, typename CircuitBuilder>
LoopValidationResult validate_inner_loop1(CircuitBuilder& builder,
                                          cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                          const acir_format::RecursionConstraint& constraint1,
                                          size_t arith_start)
{
    LoopValidationResult result;
    auto& arith = builder.blocks.arithmetic;
    auto& poseidon2 = builder.blocks.poseidon2;

    result.micro_oink.vk_hash =
        HNOinkValidation::validate_vk_hash_anchor<FF>(builder, analyzer, constraint1, C1_VK_HASH_PROFILE);
    if (!result.micro_oink.vk_hash.valid) {
        return result;
    }
    result.primitive_start_poseidon2 = result.micro_oink.vk_hash.poseidon2_ext_start;

    size_t poseidon_cursor = result.micro_oink.vk_hash.poseidon2_ext_end;
    if (!matches_fingerprint_at(builder, poseidon2, poseidon_cursor, INNER_LOOP1_POSEIDON2_TAIL)) {
        return result;
    }
    poseidon_cursor += INNER_LOOP1_POSEIDON2_TAIL.gate_count;
    result.poseidon2_cursor_end = poseidon_cursor;
    result.poseidon2_region_end = poseidon2.size();
    result.poseidon2_coverage_valid = (poseidon_cursor == poseidon2.size());

    size_t arith_cursor = arith_start;
    const auto advance = [&](const FunctionFingerprint& fp) {
        if (arith_cursor + fp.gate_count > arith.size() || !matches_fingerprint_at(builder, arith, arith_cursor, fp)) {
            return false;
        }
        arith_cursor += fp.gate_count;
        return true;
    };

    if (!advance(INNER_LOOP1_PRE_ETA_ARITH_V2)) {
        return result;
    }
    result.micro_oink.commitment_chain_valid = true;

    if (!advance(INNER_LOOP1_OINK_MAINSC_LIVE_ARITH)) {
        return result;
    }
    result.micro_oink.valid = true;
    result.oink.valid = true;
    result.gate_challenge.valid = true;
    result.main_sumcheck.arith_end = arith_cursor;
    result.main_sumcheck.valid = true;

    result.batching.arith_start = arith_cursor;
    for (size_t i = 0; i < INNER_LOOP1_NUM_BATCHING_CHALLENGE_WINDOWS; ++i) {
        if (!advance(RESET_BATCHING_CHALLENGE_WINDOW_ARITH)) {
            result.batching.squeezes_found = i;
            return result;
        }
    }
    result.batching.squeezes_found = INNER_LOOP1_NUM_BATCHING_CHALLENGE_WINDOWS;
    result.batching.valid = true;

    result.mlb.alpha_arith_start = arith_cursor;
    result.mlb.sc_arith_start = arith_cursor;
    if (!advance(INNER_LOOP1_MLB_AND_TAIL_ARITH)) {
        return result;
    }
    result.mlb.sc_arith_end = arith_cursor;
    result.mlb.valid = true;
    result.shared_fold_core_arith_end = arith_cursor;

    result.post_mlb.transition_arith_start = arith_cursor;
    if (!advance(INNER_FINAL_TAIL_ARITH)) {
        return result;
    }
    result.post_mlb.valid = true;
    result.post_mlb.squeezes_found = 1;

    result.arith_cursor_end = arith_cursor;
    result.arith_region_end = arith.size();
    result.arith_coverage_valid = (arith_cursor == arith.size());

    result.key_hash_linked = true;
    result.all_valid = result.arith_coverage_valid && result.poseidon2_coverage_valid && result.key_hash_linked;
    return result;
}

/**
 * @brief ACIR analyzer entry — validate one INNER opcode against its circuit slice.
 *
 * Scope: hn_count==2 only this session (1 kernel + 1 app -- the configuration every existing INNER
 * test constructs). hn_count>2 fails closed rather than silently mis-validating -- see file-header
 * scope note; needs its own fresh dump/re-derivation (N-1 bridges, N-1 app loops, a last-entry tail
 * that grows with app count).
 *
 * @param builder            Populated INNER circuit.
 * @param analyzer           Static analyzer for poseidon link traversal.
 * @param constraint         ACIR recursion constraint for this opcode (vk_hash anchor).
 * @param constraint_index   0 = C0 (kernel); 1 = C1 (app).
 * @param hn_count           Total HN recursion constraints in this kernel; must be 2.
 * @return                   OpcodeValidationResult with loop, optional bridge, and all_valid.
 */
template <typename FF, typename CircuitBuilder>
OpcodeValidationResult validate_hn_inner_for_opcode(CircuitBuilder& builder,
                                                    cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                                    const acir_format::RecursionConstraint& constraint,
                                                    size_t constraint_index,
                                                    size_t hn_count)
{
    OpcodeValidationResult result;
    result.constraint_index = constraint_index;

    if (hn_count != 2 || constraint_index >= hn_count) {
        return result;
    }

    if (constraint_index == 0) {
        result.loop = validate_inner_loop0<FF>(builder, analyzer, constraint);
        result.all_valid = result.loop.all_valid;
        if (result.all_valid) {
            result.bridge = validate_inter_loop_bridge(builder, result.loop.arith_cursor_end);
            result.all_valid = result.all_valid && result.bridge.valid;
        }
    } else {
        result.loop = validate_inner_loop1<FF>(builder, analyzer, constraint, INNER_BRIDGE_ARITH_END);
        result.all_valid = result.loop.all_valid;
    }

    return result;
}

/**
 * @brief Full INNER kernel validator — both loops + the bridge in one call (tests / debug).
 *
 * Scope: hn_count==2 only this session (see file-header note); `constraints.size() != 2` fails
 * closed. Optionally cross-checks IVC queue metadata for both entries when queue0/queue1 and
 * expected VK snapshots are supplied. Fail-fast: returns early on the first failing phase.
 *
 * @param builder       Populated INNER circuit.
 * @param analyzer      Static analyzer for poseidon link traversal.
 * @param constraints   HN recursion constraints in queue order; must have exactly 2 entries.
 * @param queue0        Optional IVC queue entry for constraints[0] integration tests.
 * @param queue1        Optional IVC queue entry for constraints[1] integration tests.
 * @param expected_vk0  Expected VK for constraints[0]; required when queue0 is set.
 * @param expected_vk1  Expected VK for constraints[1]; required when queue1 is set.
 * @return              Result with loops, bridges, optional iv_queues, all_valid.
 */
template <typename FF, typename CircuitBuilder>
Result validate(CircuitBuilder& builder,
                cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                const std::vector<acir_format::RecursionConstraint>& constraints,
                std::optional<std::reference_wrapper<const Chonk::VerifierInputs>> queue0 = std::nullopt,
                std::optional<std::reference_wrapper<const Chonk::VerifierInputs>> queue1 = std::nullopt,
                std::optional<std::reference_wrapper<const IvQueueExpectedVk>> expected_vk0 = std::nullopt,
                std::optional<std::reference_wrapper<const IvQueueExpectedVk>> expected_vk1 = std::nullopt)
{
    Result result;
    const size_t hn_count = constraints.size();
    if (hn_count != 2) {
        return result;
    }
    result.loops.resize(hn_count);
    result.bridges.resize(hn_count - 1);
    result.iv_queues.resize(hn_count);

    if (queue0.has_value()) {
        if (!expected_vk0.has_value()) {
            return result;
        }
        result.iv_queues[0] =
            validate_iv_queue_consistency<FF>(builder, constraints[0], queue0->get(), expected_vk0->get(), true);
        if (!result.iv_queues[0].valid) {
            return result;
        }
    }

    if (queue1.has_value()) {
        if (!expected_vk1.has_value()) {
            return result;
        }
        result.iv_queues[1] =
            validate_iv_queue_consistency<FF>(builder, constraints[1], queue1->get(), expected_vk1->get(), false);
        if (!result.iv_queues[1].valid) {
            return result;
        }
    }

    result.loops[0] = validate_inner_loop0<FF>(builder, analyzer, constraints[0]);
    if (!result.loops[0].all_valid) {
        return result;
    }

    result.bridges[0] = validate_inter_loop_bridge(builder, result.loops[0].arith_cursor_end);
    if (!result.bridges[0].valid) {
        return result;
    }

    result.loops[1] = validate_inner_loop1<FF>(builder, analyzer, constraints[1], result.bridges[0].arith_end);
    if (!result.loops[1].all_valid) {
        return result;
    }

    result.loop1_structure_valid = true; // structural shape is implicit in the total-coverage cursor chain
    result.all_valid = true;
    return result;
}

} // namespace HNInnerValidation

using HNInnerValidationResult = HNInnerValidation::Result;

/**
 * @brief Convenience wrapper — full INNER validation without IVC queue cross-check.
 *
 * @param builder      Populated INNER circuit.
 * @param analyzer     Static analyzer for poseidon link traversal.
 * @param constraint0  C0 ACIR recursion constraint.
 * @param constraint1  C1 ACIR recursion constraint.
 * @return             HNInnerValidationResult from HNInnerValidation::validate.
 */
template <typename FF, typename CircuitBuilder>
HNInnerValidationResult validate_hn_inner(CircuitBuilder& builder,
                                          cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                          const acir_format::RecursionConstraint& constraint0,
                                          const acir_format::RecursionConstraint& constraint1)
{
    return HNInnerValidation::validate<FF>(builder, analyzer, { constraint0, constraint1 });
}

/**
 * @brief Convenience wrapper — full N-app INNER validation without IVC queue cross-check.
 *
 * @param builder      Populated INNER circuit.
 * @param analyzer     Static analyzer for poseidon link traversal.
 * @param constraints  HN recursion constraints in queue order (constraints[0] = kernel).
 * @return             HNInnerValidationResult from HNInnerValidation::validate.
 */
template <typename FF, typename CircuitBuilder>
HNInnerValidationResult validate_hn_inner(CircuitBuilder& builder,
                                          cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                          const std::vector<acir_format::RecursionConstraint>& constraints)
{
    return HNInnerValidation::validate<FF>(builder, analyzer, constraints);
}

/**
 * @brief Convenience wrapper — full INNER validation with dual IVC queue cross-check.
 *
 * @param builder       Populated INNER circuit.
 * @param analyzer      Static analyzer for poseidon link traversal.
 * @param constraint0   C0 ACIR recursion constraint.
 * @param constraint1   C1 ACIR recursion constraint.
 * @param queue0        IVC queue entry for C0 (expect is_kernel=true).
 * @param queue1        IVC queue entry for C1 (expect is_kernel=false).
 * @param expected_vk0  VK snapshot for C0 constraint witnesses.
 * @param expected_vk1  VK snapshot for C1 constraint witnesses.
 * @return              HNInnerValidationResult from HNInnerValidation::validate.
 */
template <typename FF, typename CircuitBuilder>
HNInnerValidationResult validate_hn_inner(CircuitBuilder& builder,
                                          cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                          const acir_format::RecursionConstraint& constraint0,
                                          const acir_format::RecursionConstraint& constraint1,
                                          const Chonk::VerifierInputs& queue0,
                                          const Chonk::VerifierInputs& queue1,
                                          const HNInnerValidation::IvQueueExpectedVk& expected_vk0,
                                          const HNInnerValidation::IvQueueExpectedVk& expected_vk1)
{
    return HNInnerValidation::validate<FF>(builder,
                                           analyzer,
                                           { constraint0, constraint1 },
                                           std::cref(queue0),
                                           std::cref(queue1),
                                           std::cref(expected_vk0),
                                           std::cref(expected_vk1));
}

/**
 * @brief Per-opcode INNER validator exposed in HNVerification namespace for graph_description_acir.
 *
 * Thin forwarder to HNInnerValidation::validate_hn_inner_for_opcode.
 *
 * @param builder            Populated INNER circuit.
 * @param analyzer           Static analyzer for poseidon link traversal.
 * @param constraint         ACIR recursion constraint for the current opcode.
 * @param constraint_index   0 = C0 (kernel); 1..hn_count-1 = apps in queue order.
 * @param hn_count           Total HN recursion constraints in this kernel (1 kernel + N apps).
 * @return                   OpcodeValidationResult with all_valid aggregate.
 */
template <typename FF, typename CircuitBuilder>
HNInnerValidation::OpcodeValidationResult validate_hn_inner_for_opcode(
    CircuitBuilder& builder,
    cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
    const acir_format::RecursionConstraint& constraint,
    size_t constraint_index,
    size_t hn_count)
{
    return HNInnerValidation::validate_hn_inner_for_opcode<FF>(
        builder, analyzer, constraint, constraint_index, hn_count);
}

/**
 * @brief Test helper — full INNER validation with analyzer constructed internally.
 *
 * @param builder      Populated INNER circuit.
 * @param constraint0  C0 ACIR recursion constraint.
 * @param constraint1  C1 ACIR recursion constraint.
 * @return             HNInnerValidationResult from validate_hn_inner<bb::fr>.
 */
template <typename CircuitBuilder>
HNInnerValidationResult validate_hn_inner(CircuitBuilder& builder,
                                          const acir_format::RecursionConstraint& constraint0,
                                          const acir_format::RecursionConstraint& constraint1)
{
    cdg::StaticAnalyzer_<bb::fr, CircuitBuilder> analyzer(builder, false);
    return validate_hn_inner<bb::fr>(builder, analyzer, constraint0, constraint1);
}

} // namespace HNVerification

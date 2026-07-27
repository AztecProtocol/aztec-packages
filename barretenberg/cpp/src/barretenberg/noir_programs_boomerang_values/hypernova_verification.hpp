#pragma once

#ifndef BB_RECURSION_HELPERS_AVAILABLE
#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_helper.hpp"
#endif

// ============================================================================
// HNVerification - fingerprint constants and result structs for HN/HyperNova
// recursion validation (RESET kernel baseline).
//
// Circuit constants (from MegaFlavor):
//   VIRTUAL_LOG_N (CONST_FOLDING_LOG_N) = 24   (Sumcheck rounds, both main and MLB)
//   NUM_UNSHIFTED_ENTITIES = 62  -> 61 batching labels -> 31 Poseidon2 calls -> 31 arith squeeze gates
//   NUM_SHIFTED_ENTITIES   = 5   -> 4  batching labels -> 2  Poseidon2 calls -> 2  arith squeeze gates
//   HasZK = false  (no ZK correction squeeze in either Sumcheck)
//
// Total squeeze gates: 3(Oink) + 1(gate_challenge) + 24(main SC) + 33(batching) +
//                      1(MLB alpha) + 24(MLB SC) + 1(claim_batching) = 87
//
// There is no post-MLB squeeze group for a baseline (non-FINAL) kernel: `complete_kernel_circuit_logic`
// (chonk.cpp) does a non-interactive Poseidon2 absorb (`Goblin::BatchMergeRecursiveVerifier::ecc_op_hash_step`)
// per step instead of a full merge verify, so nothing is squeezed after claim_batching. The real
// gate-heavy batch-merge verifier runs once, only in HN_FINAL/HIDING (see HNFinalValidation.hpp).
//
// Boundary finding: witness-anchored cursor chain (hn_cursor_chaining_plan.md). Squeeze-index
// constants below are legacy until Step 2 deletes them from validate_hn_baseline.
// ============================================================================
namespace HNVerification {

using namespace recursion_helpers;

// Nested as HNVerification::HNOinkValidation (same include later from HNInitValidation is a no-op).
#include "barretenberg/noir_programs_boomerang_values/HNOinkValidationCommon.hpp"

// Expected total squeeze gate count for the RESET kernel (legacy; detector undercounts post-merge).
static constexpr size_t HN_RESET_TOTAL_SQUEEZES = 87;

// RESET vk_hash ACIR anchor (AcirHNResetPrimitiveStartDiscovery / hn_reset_witness_gate_map.txt).
// Poseidon-only on the create_circuit path: key_hash and a few key limbs sit in poseidon2[300..1576);
// most key limbs wire through ecc_op. arith.gate_count == 0 ⇒ validate_vk_hash_anchor skips arith.
inline constexpr FunctionFingerprint RESET_VK_HASH_ARITH = { 0, 0, 0, 0 };
inline constexpr FunctionFingerprint RESET_VK_HASH_POSEIDON2 = {
    1276, 0x24491dfe40c3c6d1ULL, 0x72ba60f31e27f7a0ULL, 20
};
inline constexpr HNOinkValidation::VkHashProfile RESET_VK_HASH_PROFILE{
    .arith = RESET_VK_HASH_ARITH,
    .poseidon2_ext = RESET_VK_HASH_POSEIDON2,
    .poseidon2_int = RESET_VK_HASH_POSEIDON2,
};

// RESET cursor-chain arith/poseidon FPs from hn_reset_functions_analysis.txt (AcirHNResetCursorChainDump).
// Contiguous coverage: arith [0..5524) and poseidon2 [primitive_start=300..8025). Named by source-order
// protocol phase (per the pre-merge squeeze-index model's phase boundaries, which stayed semantically
// correct even though the squeeze indices themselves collapsed post-merge -- see
// hn_cursor_chaining_plan.md). Post-merge, Oink/gate_challenge/Main-Sumcheck/MLB/claim_batching
// challenges are all `fr`-typed (StdlibCodec::convert_full_challenge -- zero gates); only the 33
// batching-phase `fq` challenges still emit a squeeze-detectable decompose gate. That means everything
// strictly between two adjacent phases in that group has no squeeze marker to sub-divide on, so each
// phase group below is one fingerprint spanning several protocol stages, not one stage each.
//
// [0..2602): Oink (vk_hash/wire-commitment receipt -- Goblin commitments need no on-curve arith gates,
// so Oink itself contributes ~0 here) + gate_challenge + Main Sumcheck's 24-round relation-check
// arithmetic. Confirmed live (non-zero selectors throughout, per HNPostMergeGateShapeDiagnostic).
// Per-round sub-boundaries are not fingerprinted individually -- would need a full sumcheck.hpp
// production trace to attribute gate ranges to specific rounds without a squeeze anchor; open follow-up.
inline constexpr FunctionFingerprint RESET_OINK_MAINSC_LIVE_ARITH = {
    2602, 0x28bbb8861d2edb76ULL, 0x123d0c61869e05d4ULL, 20
};
// [2602..3989): fully selector-zero (q_arith=0 included) across all 1387 gates -- confirmed via
// HNPostMergeGateShapeDiagnostic. Sits after the Main-Sumcheck-live span and before the first batching
// challenge; not an integer multiple of CONST_FOLDING_LOG_N(24), NUM_DISABLED_ROWS_IN_SUMCHECK(4), or
// NUM_MASKED_ROWS(3), so it isn't top-of-trace masking padding at face value. Root emitter not yet
// identified (open item) -- pinned as its own named fingerprint specifically so an injected gate here
// is caught by coverage, rather than silently absorbed into the live-content fingerprint above.
inline constexpr FunctionFingerprint RESET_PRE_BATCHING_PADDING_ARITH = {
    1387, 0x85884a0f6eeea876ULL, 0xcfa4a65bb168cca6ULL, 20
};
// 33 identical 20-gate windows, [3989..4649): the batching-phase `fq` challenge extract/decompose
// (31 unshifted + 2 shifted -- matches the pre-merge HN_NUM_BATCHING_SQUEEZES=33). The only phase
// whose internal structure the squeeze detector still resolves post-merge.
inline constexpr FunctionFingerprint RESET_BATCHING_CHALLENGE_WINDOW_ARITH = {
    20, 0x7803cef376e6a721ULL, 0x7803cef376e6a721ULL, 20
};
static constexpr size_t RESET_NUM_BATCHING_CHALLENGE_WINDOWS = 33;
// [4649..5524): MLB alpha + MLB Sumcheck (24 rounds) + claim_batching + post-MLB tail (accumulator
// hash / merge / pairing). Retained for reference/diagnostics (e.g. AcirHNFinalMLBTailDivergenceDiscovery);
// validate_hn_baseline uses the two-way split below instead, since FINAL shares only the first part.
inline constexpr FunctionFingerprint RESET_MLB_AND_TAIL_LIVE_ARITH = {
    875, 0x759410a0cce32760ULL, 0xa309021ba960130cULL, 20
};
// [4649..5472): MLB alpha + MLB Sumcheck (24 rounds) + claim_batching -- the part of the above span that
// FINAL/HIDING also shares (F2's fold-core runs through claim_batching before F3's decider takes over).
// Confirmed by a per-gate selector-hash walk (AcirHNFinalMLBTailDivergenceDiscovery): FINAL is
// byte-identical to RESET for exactly these 823 gates, then diverges.
inline constexpr FunctionFingerprint RESET_MLB_AND_CLAIM_BATCHING_ARITH = {
    823, 0x759410a0cce32760ULL, 0x4d0fde50f9777bfaULL, 20
};
// [5472..5524): post-MLB tail (accumulator hash / merge / pairing) -- RESET/TAIL-only. FINAL replaces
// this 52-gate span with the F3 decider instead (validate_hn_hiding does not call this stage).
inline constexpr FunctionFingerprint RESET_ONLY_POST_MLB_TAIL_ARITH = {
    52, 0xa44b2f3fcc6aa714ULL, 0xba3a3a5f3c682134ULL, 20
};
inline constexpr FunctionFingerprint RESET_POSEIDON2_TAIL = {
    6449, 0xdaf56faae2628656ULL, 0x63b9f065e895a019ULL, 20
}; // [1576..8025) after vk_hash

// Squeeze index boundaries (0-based indices into find_all_transcript_squeeze_gates output).
static constexpr size_t HN_SQUEEZE_OINK_ETA = 0;
static constexpr size_t HN_SQUEEZE_OINK_BETA = 1;
static constexpr size_t HN_SQUEEZE_OINK_ALPHA = 2;
static constexpr size_t HN_SQUEEZE_GATE_CHALLENGE = 3;
static constexpr size_t HN_SQUEEZE_MAIN_SC_FIRST = 4; // round 0
static constexpr size_t HN_SQUEEZE_MAIN_SC_LAST = 27; // round 23
static constexpr size_t HN_SQUEEZE_BATCHING_FIRST = 28;
static constexpr size_t HN_SQUEEZE_BATCHING_LAST = 60;
static constexpr size_t HN_SQUEEZE_MLB_ALPHA = 61;
static constexpr size_t HN_SQUEEZE_MLB_SC_FIRST = 62; // round 0
static constexpr size_t HN_SQUEEZE_MLB_SC_LAST = 85;  // round 23
static constexpr size_t HN_SQUEEZE_CLAIM_BATCHING = 86;
// Retained for HNInitValidation.hpp / HNInnerValidation.hpp, which independently derive their own
// post-MLB-shaped tail windows for kernel types that still have squeezes past claim_batching in
// their own (differently-indexed) sequence. Not used by validate_hn_baseline_impl's baseline path
// below, which always runs with skip_post_mlb_phase=true (no such tail exists for RESET/TAIL/F2).
static constexpr size_t HN_SQUEEZE_POST_MLB_FIRST = 77;
static constexpr size_t HN_SQUEEZE_POST_MLB_LAST = 89;

// Number of squeeze gates per phase.
static constexpr size_t HN_NUM_OINK_SQUEEZES = 3;
static constexpr size_t HN_NUM_MAIN_SC_SQUEEZES = 24;  // one per round
static constexpr size_t HN_NUM_BATCHING_SQUEEZES = 33; // 31 unshifted + 2 shifted
static constexpr size_t HN_NUM_MLB_SC_SQUEEZES = 24;   // one per round
static constexpr size_t HN_NUM_POST_MLB_SQUEEZES = 13; // legacy INIT/INNER-only tail; see note above

// -- Arithmetic-block fingerprints ------------------------------------------------
// Each fingerprint covers the arithmetic gates in [prev_squeeze+1, this_squeeze] inclusive.

// Oink phase: from circuit start through oink_alpha squeeze.
inline constexpr FunctionFingerprint OINK_PRE_ETA_ARITH = { 272, 0xb1e3bb38890ac62aULL, 0x5c39fb273a5154aeULL, 20 };
inline constexpr FunctionFingerprint OINK_ETA_TO_BETA_ARITH = {
    1399, 0x8d1d38594cf4125bULL, 0x611a41ea84b38d2dULL, 20
};
inline constexpr FunctionFingerprint OINK_BETA_TO_ALPHA_ARITH = {
    206, 0x1e092eca9c65aadcULL, 0xff32db0f62847076ULL, 20
};

// Gate challenge: 20 arith gates between oink_alpha and main Sumcheck round 0.
// Note: GATE_CHALLENGE and BATCHING_CHALLENGE share the same fingerprint - they are both
// single-challenge Poseidon2 extraction blocks.
inline constexpr FunctionFingerprint CHALLENGE_EXTRACT_25_ARITH = {
    20, 0x50c2248efada8825ULL, 0x50c2248efada8825ULL, 20
};

// Main Sumcheck: 24 rounds with 4 structural types.
inline constexpr FunctionFingerprint MAIN_SUMCHECK_ROUND_0_ARITH = {
    110, 0x1e092eca9c65aadcULL, 0x21f292ccb32f2a5bULL, 20
};
inline constexpr FunctionFingerprint MAIN_SUMCHECK_ROUND_1_ARITH = {
    67, 0xb420d61c200a1c65ULL, 0x725d822750d79e98ULL, 20
};
inline constexpr FunctionFingerprint MAIN_SUMCHECK_ROUND_2_ARITH = {
    68, 0xb420d61c200a1c65ULL, 0x627833828561c1b6ULL, 20
};
// Rounds 3-23 (21 occurrences, all identical):
inline constexpr FunctionFingerprint MAIN_SUMCHECK_ROUND_STD_ARITH = {
    68, 0xb420d61c200a1c65ULL, 0x706f3b44dd391f9fULL, 20
};

// Batching challenges: transition block (end of Sumcheck -> first batching squeeze).
inline constexpr FunctionFingerprint BATCHING_TRANSITION_ARITH = {
    784, 0xb420d61c200a1c65ULL, 0x30447d5a9538e6b1ULL, 20
};
// Each of the 32 subsequent batching squeezes shares the same fingerprint
// as CHALLENGE_EXTRACT_25_ARITH (identical structure to gate_challenge blocks).

// MLB phase.
inline constexpr FunctionFingerprint MLB_ALPHA_ARITH = { 52, 0xdfdba5d83231a302ULL, 0x161948f88e8c95bcULL, 20 };
inline constexpr FunctionFingerprint MLB_SUMCHECK_ROUND_0_ARITH = {
    160, 0xd40caefddbba2fceULL, 0xd1f1901e6f509f01ULL, 20
};
// MLB rounds 1-23 (all identical, including round 1):
inline constexpr FunctionFingerprint MLB_SUMCHECK_ROUND_STD_ARITH = {
    42, 0xb420d61c200a1c65ULL, 0x97fb446676027590ULL, 20
};
inline constexpr FunctionFingerprint CLAIM_BATCHING_ARITH = { 54, 0xb420d61c200a1c65ULL, 0x400c14491e9b6d27ULL, 20 };

// Post-MLB regions (accumulator hash + merge verification + pairing aggregation).
inline constexpr FunctionFingerprint POST_MLB_TRANSITION_ARITH = {
    339, 0x67de582ae9f482b8ULL, 0x2c5380b5b0b37528ULL, 20
};
inline constexpr FunctionFingerprint MERGE_PAIRING_TRANSITION_ARITH = {
    256, 0xe8a9b6fece232906ULL, 0xc6ea7612bc351dfbULL, 20
};
inline constexpr FunctionFingerprint POST_CLAIM_TAIL_ARITH = { 301, 0x71b4530b06b93d1eULL, 0x8e07d2e2b8f54d05ULL, 20 };

// -- Per-stage Poseidon2 linked fingerprints (arith -> pos2_ext -> pos2_int) ------
inline constexpr FunctionFingerprint OINK_PRE_ETA_POSEIDON2_EXT = {
    3279, 0x840b6b73357db138ULL, 0xfb4d3a2ef519017ULL, 20
};
inline constexpr FunctionFingerprint OINK_PRE_ETA_POSEIDON2_INT = {
    4767, 0x899264eaceb0c538ULL, 0x4c0f154c567fef1eULL, 20
};
inline constexpr FunctionFingerprint OINK_ETA_TO_BETA_POSEIDON2_EXT = {
    1563, 0x840b6b73357db138ULL, 0xcc111972b33feb17ULL, 20
};
inline constexpr FunctionFingerprint OINK_ETA_TO_BETA_POSEIDON2_INT = {
    2271, 0x899264eaceb0c538ULL, 0x7ee058ddd5ca47dbULL, 20
};
inline constexpr FunctionFingerprint OINK_BETA_TO_ALPHA_POSEIDON2_EXT = {
    3149, 0xfb4ddce121f3a4a2ULL, 0x1d04883b5ade74bULL, 20
};
inline constexpr FunctionFingerprint OINK_BETA_TO_ALPHA_POSEIDON2_INT = {
    4575, 0x899264eaceb0c538ULL, 0xd06fabf64d02ccd2ULL, 20
};
inline constexpr FunctionFingerprint CHALLENGE_EXTRACT_POSEIDON2_EXT = {
    1398, 0x840b6b73357db138ULL, 0xf7b40ec7218b488eULL, 20
};
inline constexpr FunctionFingerprint CHALLENGE_EXTRACT_POSEIDON2_INT = {
    2031, 0x899264eaceb0c538ULL, 0xcb651e27b85bc2b5ULL, 20
};
inline constexpr FunctionFingerprint MAIN_SUMCHECK_ROUND_0_POSEIDON2_EXT = {
    1398, 0x840b6b73357db138ULL, 0xf7b40ec7218b488eULL, 20
};
inline constexpr FunctionFingerprint MAIN_SUMCHECK_ROUND_0_POSEIDON2_INT = {
    2031, 0x899264eaceb0c538ULL, 0xcb651e27b85bc2b5ULL, 20
};
inline constexpr FunctionFingerprint MAIN_SUMCHECK_ROUND_N_POSEIDON2_EXT = {
    1398, 0x840b6b73357db138ULL, 0xf7b40ec7218b488eULL, 20
};
inline constexpr FunctionFingerprint MAIN_SUMCHECK_ROUND_N_POSEIDON2_INT = {
    2031, 0x899264eaceb0c538ULL, 0xcb651e27b85bc2b5ULL, 20
};
inline constexpr FunctionFingerprint BATCHING_TRANSITION_POSEIDON2_EXT = {
    1398, 0x840b6b73357db138ULL, 0xf7b40ec7218b488eULL, 20
};
inline constexpr FunctionFingerprint BATCHING_TRANSITION_POSEIDON2_INT = {
    2031, 0x899264eaceb0c538ULL, 0xcb651e27b85bc2b5ULL, 20
};
inline constexpr FunctionFingerprint MLB_ALPHA_POSEIDON2_EXT = {
    1541, 0x840b6b73357db138ULL, 0xeb03492b24166113ULL, 20
};
inline constexpr FunctionFingerprint MLB_ALPHA_POSEIDON2_INT = {
    2239, 0x899264eaceb0c538ULL, 0xda7b66b0ea99f25cULL, 20
};
inline constexpr FunctionFingerprint MLB_SUMCHECK_ROUND_0_POSEIDON2_EXT = {
    2168, 0x840b6b73357db138ULL, 0xf846bba7c2706d10ULL, 20
};
inline constexpr FunctionFingerprint MLB_SUMCHECK_ROUND_0_POSEIDON2_INT = {
    3151, 0x899264eaceb0c538ULL, 0x9c22821bad8a3497ULL, 20
};
inline constexpr FunctionFingerprint MLB_SUMCHECK_ROUND_N_POSEIDON2_EXT = {
    2168, 0x840b6b73357db138ULL, 0xf846bba7c2706d10ULL, 20
};
inline constexpr FunctionFingerprint MLB_SUMCHECK_ROUND_N_POSEIDON2_INT = {
    3151, 0x899264eaceb0c538ULL, 0x9c22821bad8a3497ULL, 20
};
inline constexpr FunctionFingerprint CLAIM_BATCHING_POSEIDON2_EXT = {
    2100, 0x840b6b73357db138ULL, 0xe36e7caf24d825aaULL, 20
};
inline constexpr FunctionFingerprint CLAIM_BATCHING_POSEIDON2_INT = {
    3055, 0x899264eaceb0c538ULL, 0xcb1ed5ee5396b6a8ULL, 20
};
inline constexpr FunctionFingerprint POST_MLB_TRANSITION_POSEIDON2_EXT = {
    61, 0xb9cd57c57c65c57dULL, 0xded9abd612d18a4cULL, 20
};
inline constexpr FunctionFingerprint POST_MLB_TRANSITION_POSEIDON2_INT = {
    341, 0x46e0a14d737d651dULL, 0xa2162e32047bada4ULL, 20
};
inline constexpr FunctionFingerprint POST_MLB_SQUEEZE_1_ARITH = {
    39, 0x161538cb3af2037aULL, 0xc805004721883f06ULL, 20
};
inline constexpr FunctionFingerprint POST_MLB_SQUEEZE_1_POSEIDON2_EXT = {
    21, 0xb9cd57c57c65c57dULL, 0x3d048ab9d41138d7ULL, 20
};
inline constexpr FunctionFingerprint POST_MLB_SQUEEZE_1_POSEIDON2_INT = {
    113, 0x46e0a14d737d651dULL, 0x9fe51f81858e9e47ULL, 20
};
inline constexpr FunctionFingerprint POST_CLAIM_TAIL_PART0_ARITH = {
    75, 0x71b4530b06b93d1eULL, 0x4045a9c1676e0106ULL, 20
};
inline constexpr FunctionFingerprint POST_CLAIM_TAIL_PART1_ARITH = {
    97, 0x3475d22714a0267aULL, 0x97b177cf40154d57ULL, 20
};
inline constexpr FunctionFingerprint POST_CLAIM_TAIL_PART1_POSEIDON2_EXT = {
    59, 0xe7a86e429c7b3f3eULL, 0x7a0c09119107c375ULL, 20
};
inline constexpr FunctionFingerprint POST_CLAIM_TAIL_PART1_POSEIDON2_INT = {
    341, 0x46e0a14d737d651dULL, 0xa2162e32047bada4ULL, 20
};
inline constexpr FunctionFingerprint POST_CLAIM_TAIL_PART2_ARITH = {
    129, 0x7e215464d8c33d9cULL, 0xe80b8166777f017eULL, 20
};
inline constexpr FunctionFingerprint POST_CLAIM_TAIL_PART2_POSEIDON2_EXT = {
    101, 0xe7a86e429c7b3f3eULL, 0x60fe2c65d6241acaULL, 20
};
inline constexpr FunctionFingerprint POST_CLAIM_TAIL_PART2_POSEIDON2_INT = {
    569, 0x46e0a14d737d651dULL, 0xc3f0797963e4415cULL, 20
};
// INNER loop0 inter-loop bridge (sq[89]+1 .. sq[90]+1, 77 gates) — filled by HNInnerLoop0TailFingerprintMatch.
inline constexpr FunctionFingerprint INNER_INTER_LOOP_TAIL_ARITH = {
    77, 0x7ac115c8c65e3714ULL, 0x83f16afae2f97947ULL, 20
};
inline constexpr FunctionFingerprint INNER_INTER_LOOP_TAIL_POSEIDON2_EXT = {
    51, 0xb9cd57c57c65c57dULL, 0x93a00f75e49cc286ULL, 20
};
inline constexpr FunctionFingerprint INNER_INTER_LOOP_TAIL_POSEIDON2_INT = {
    284, 0x46e0a14d737d651dULL, 0x1a1ba8ea3e51fcedULL, 20
};

// -- Poseidon2 full-block fingerprints -------------------------------------------
inline constexpr FunctionFingerprint POSEIDON2_EXTERNAL_FULL = {
    3476, 0x840b6b73357db138ULL, 0x9349443d1c3abb8ULL, 20
};
inline constexpr FunctionFingerprint POSEIDON2_INTERNAL_FULL = {
    5056, 0x899264eaceb0c538ULL, 0x16baa86bbbac37acULL, 20
};

// Chained Poseidon2 search cursor — each stage advances min_start for the next.
struct HNPoseidonCursor {
    size_t poseidon2_ext_min_start = 0;
    size_t poseidon2_int_min_start = 0;
};

// -- Result structs ----------------------------------------------------------------

struct HNOinkValidationResult {
    size_t pre_eta_arith_start = 0;
    size_t eta_to_beta_arith_start = 0;
    size_t beta_to_alpha_arith_start = 0;
    bool valid = false;
};

struct HNGateChallengeValidationResult {
    size_t arith_start = 0;
    bool valid = false;
};

struct HNMainSumcheckValidationResult {
    size_t arith_start = 0;  // start of round 0
    size_t arith_end = 0;    // end of round 20 (exclusive)
    size_t rounds_found = 0; // expect HN_NUM_MAIN_SC_SQUEEZES
    bool valid = false;
};

struct HNBatchingValidationResult {
    size_t arith_start = 0;
    size_t squeezes_found = 0; // expect HN_NUM_BATCHING_SQUEEZES
    bool valid = false;
};

struct HNMLBValidationResult {
    size_t alpha_arith_start = 0;
    size_t sc_arith_start = 0;
    size_t sc_arith_end = 0;
    size_t rounds_found = 0;
    bool valid = false;
};

struct HNPostMLBValidationResult {
    size_t transition_arith_start = 0;
    size_t squeezes_found = 0;
    bool valid = false;
};

// RESET cursor-chain only: the selector-zero span between Main-Sumcheck-live and the first batching
// challenge window (RESET_PRE_BATCHING_PADDING_ARITH). Its own field so a non-zero injection there is
// attributed correctly instead of silently folding into main_sumcheck's or batching's flag.
struct HNPreBatchingPaddingValidationResult {
    size_t arith_start = 0;
    bool valid = false;
};

struct HNBaselineValidationResult {
    HNOinkValidationResult oink;
    HNGateChallengeValidationResult gate_challenge;
    HNMainSumcheckValidationResult main_sumcheck;
    HNPreBatchingPaddingValidationResult pre_batching_padding;
    HNBatchingValidationResult batching;
    HNMLBValidationResult mlb;
    HNPostMLBValidationResult post_mlb;
    bool poseidon_full_valid = false;
    bool all_valid = false;
    // Cursor-chain coverage (hn_cursor_chaining_plan.md). PASS iff cursors reach region ends.
    // poseidon2 coverage is scoped to [primitive_start_poseidon2, poseidon2_region_end) -- the gates
    // this ACIR opcode's own key_hash/key[] witnesses provably touch (per
    // hn_reset_witness_gate_map.txt: gate 300 is the earliest key-limb-linked poseidon2 gate).
    // [0, primitive_start_poseidon2) is explicitly OUT OF SCOPE for this validator, not silently
    // skipped: those gates aren't linked to this constraint's witnesses at all, so this validator has
    // no ACIR-witness basis to check them -- a different opcode/circuit-setup concern, not RESET's.
    size_t primitive_start_poseidon2 = 0;
    size_t arith_cursor_end = 0;
    size_t poseidon2_cursor_end = 0;
    size_t arith_region_end = 0;
    size_t poseidon2_region_end = 0;
    bool arith_coverage_valid = false;
    bool poseidon2_coverage_valid = false;
    // Cursor right after the RESET/FINAL-shared fold-core (Oink+MainSC, padding, batching, MLB+
    // claim_batching) and before the RESET-only post-MLB tail. FINAL's F3 decider picks up from here
    // instead of the RESET-only tail -- see validate_hn_baseline_shared_core.
    size_t shared_fold_core_arith_end = 0;
};

// -- Internal helper ----------------------------------------------------------------

/**
 * @brief Compute an arithmetic-block FunctionFingerprint for the gate range `[start, end)`.
 *
 * @param builder Circuit to hash.
 * @param start   First arithmetic-block gate (inclusive).
 * @param end     One past the last arithmetic-block gate (exclusive).
 * @return        Gate count, prefix hash (first `min(SCANNER_FINGERPRINT_SIZE, count)` gates), full hash.
 */
template <typename CircuitBuilder> FunctionFingerprint hn_arith_fp(CircuitBuilder& builder, size_t start, size_t end)
{
    const size_t count = end - start;
    const size_t fp_size = std::min(SCANNER_FINGERPRINT_SIZE, count);
    return FunctionFingerprint{
        .gate_count = count,
        .prefix_hash = calculate_hash_arithmetic_block(builder, start, start + fp_size),
        .full_hash = calculate_hash_arithmetic_block(builder, start, end),
        .fingerprint_size = fp_size,
    };
}

/**
 * @brief Check whether a computed fingerprint matches a stored constant.
 *
 * @return True iff `gate_count`, `prefix_hash`, and `full_hash` all match.
 */
inline bool fp_matches(const FunctionFingerprint& expected, const FunctionFingerprint& computed)
{
    return computed.gate_count == expected.gate_count && computed.prefix_hash == expected.prefix_hash &&
           computed.full_hash == expected.full_hash;
}

/**
 * @brief Validate an arithmetic window and its linked Poseidon2 ext/int chains.
 *
 * Advances @p cursor so the next stage searches only after this stage's Poseidon2 ranges.
 */
template <typename FF, typename CircuitBuilder>
bool validate_hn_window_poseidon(CircuitBuilder& builder,
                                 cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                 size_t arith_start,
                                 size_t arith_end,
                                 const FunctionFingerprint& arith_fp,
                                 const FunctionFingerprint& poseidon2_ext_fp,
                                 const FunctionFingerprint& poseidon2_int_fp,
                                 HNPoseidonCursor& cursor)
{
    const auto computed_arith = hn_arith_fp(builder, arith_start, arith_end);
    if (!fp_matches(arith_fp, computed_arith)) {
        return false;
    }

    auto& arith = builder.blocks.arithmetic;
    // Mega merged poseidon2_external/poseidon2_quad_internal into one `poseidon2` block; both
    // aliases below point at the same block object. Poseidon2-linked fingerprints here are stale
    // pending re-derivation against the merged layout.
    auto& poseidon2_external = builder.blocks.poseidon2;
    auto& poseidon2_internal = builder.blocks.poseidon2;

    const std::set<size_t> linked_external_gates =
        collect_linked_gates(builder, analyzer, arith, arith_start, arith_end, poseidon2_external);

    const auto external_start = find_fingerprint_range_at_or_after_any_gate(
        builder, poseidon2_external, linked_external_gates, poseidon2_ext_fp);
    if (!external_start.has_value()) {
        return false;
    }

    const size_t external_end = *external_start + poseidon2_ext_fp.gate_count;
    const std::set<size_t> linked_internal_gates =
        collect_linked_gates(builder, analyzer, poseidon2_external, *external_start, external_end, poseidon2_internal);

    const auto internal_start = find_fingerprint_range_at_or_after_any_gate(
        builder, poseidon2_internal, linked_internal_gates, poseidon2_int_fp);
    if (!internal_start.has_value()) {
        return false;
    }

    // Advance cursor for diagnostics / optional chaining hints (not used to filter linked gates).
    cursor.poseidon2_ext_min_start = std::max(cursor.poseidon2_ext_min_start, external_end);
    cursor.poseidon2_int_min_start =
        std::max(cursor.poseidon2_int_min_start, *internal_start + poseidon2_int_fp.gate_count);
    return true;
}

// -- Post-MLB validator -------------------------------------------------------------

/**
 * @brief Validate the post-MLB region (accumulator hash + merge + pairing).
 *
 * Validates the transition block and all 13 post-MLB squeeze windows (arith only).
 */
template <typename CircuitBuilder>
HNPostMLBValidationResult validate_hn_post_mlb(CircuitBuilder& builder,
                                               const std::vector<size_t>& sq,
                                               size_t arith_total_gates)
{
    HNPostMLBValidationResult result;

    if (sq.size() < HN_SQUEEZE_POST_MLB_LAST + 1) {
        return result;
    }

    const auto fp_matches_window = [&](size_t ws, size_t we, const FunctionFingerprint& expected) {
        return fp_matches(expected, hn_arith_fp(builder, ws, we));
    };

    if (!fp_matches_window(
            sq[HN_SQUEEZE_CLAIM_BATCHING] + 1, sq[HN_SQUEEZE_POST_MLB_FIRST] + 1, POST_MLB_TRANSITION_ARITH)) {
        return result;
    }
    result.transition_arith_start = sq[HN_SQUEEZE_CLAIM_BATCHING] + 1;

    const auto post_squeeze_arith_fp = [&](size_t k) -> const FunctionFingerprint& {
        if (k == 1) {
            return POST_MLB_SQUEEZE_1_ARITH;
        }
        if (k == 9) {
            return MERGE_PAIRING_TRANSITION_ARITH;
        }
        if (k == 10) {
            return POST_CLAIM_TAIL_PART0_ARITH;
        }
        if (k == 11) {
            return POST_CLAIM_TAIL_PART1_ARITH;
        }
        if (k == 12) {
            return POST_CLAIM_TAIL_PART2_ARITH;
        }
        return CHALLENGE_EXTRACT_25_ARITH;
    };

    for (size_t k = 0; k < HN_NUM_POST_MLB_SQUEEZES; ++k) {
        const size_t ws = sq[HN_SQUEEZE_POST_MLB_FIRST + k] + 1;
        const size_t we =
            (k + 1 < HN_NUM_POST_MLB_SQUEEZES) ? sq[HN_SQUEEZE_POST_MLB_FIRST + k + 1] + 1 : arith_total_gates;
        if (!fp_matches_window(ws, we, post_squeeze_arith_fp(k))) {
            return result;
        }
        ++result.squeezes_found;
    }

    result.valid = (result.squeezes_found == HN_NUM_POST_MLB_SQUEEZES);
    return result;
}

// -- Top-level baseline validator ---------------------------------------------------

/**
 * @brief Shared fold-core validator: Oink -> gate challenge -> main sumcheck -> batching -> MLB -> post-MLB.
 *
 * Parametrized so every HN queue shape (RESET, INNER loop0/loop1, TAIL, HIDING) can reuse one
 * implementation instead of duplicating the stage chain per shape.
 *
 * @param builder                     Populated circuit.
 * @param analyzer                    Static analyzer for poseidon link traversal.
 * @param sq                          Transcript squeeze-gate index map for this constraint's own slice.
 * @param cursor                      Poseidon cursor threaded through all stages; advances as it consumes.
 * @param validate_poseidon_full_blocks Whether to additionally assert full poseidon2 ext/int block coverage.
 * @param arith_region_end            Upper bound of the arithmetic region to validate (0 = whole block).
 * @param skip_oink_phase             Skip the Oink windows (loop1: already covered by micro-Oink).
 * @param skip_post_mlb_phase         Skip the post-MLB per-squeeze loop (loop0: caller validates it separately).
 * @param skip_through_gate_challenge Skip Oink AND gate-challenge stages (loop1: no local gate challenge).
 * @param main_sc_round_count         Number of main-sumcheck rounds for this shape (default: RESET/TAIL/HIDING).
 * @param tail_squeeze_offset         Squeeze-index shift applied from `HN_SQUEEZE_MAIN_SC_LAST` onward.
 * @param main_sc_squeeze_base        Squeeze index where the main-sumcheck window chain begins.
 * @return                            Per-stage results + `all_valid` aggregate.
 */
template <typename FF, typename CircuitBuilder>
HNBaselineValidationResult validate_hn_baseline_impl(CircuitBuilder& builder,
                                                     cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                                     const std::vector<size_t>& sq,
                                                     HNPoseidonCursor& cursor,
                                                     bool validate_poseidon_full_blocks,
                                                     size_t arith_region_end = 0,
                                                     bool skip_oink_phase = false,
                                                     bool skip_post_mlb_phase = false,
                                                     bool skip_through_gate_challenge = false,
                                                     size_t main_sc_round_count = HN_NUM_MAIN_SC_SQUEEZES,
                                                     size_t tail_squeeze_offset = 0,
                                                     size_t main_sc_squeeze_base = HN_SQUEEZE_GATE_CHALLENGE)
{
    HNBaselineValidationResult result;

    // A baseline (non-FINAL) kernel has no squeezes past claim_batching (see the note above
    // HN_SQUEEZE_POST_MLB_FIRST), so the minimum required length only reaches HN_SQUEEZE_POST_MLB_LAST
    // when the caller still wants the legacy post-MLB phase (skip_post_mlb_phase=false).
    const size_t min_squeezes = skip_post_mlb_phase ? (HN_SQUEEZE_CLAIM_BATCHING + 1) : (HN_SQUEEZE_POST_MLB_LAST + 1);
    if (sq.size() < min_squeezes - tail_squeeze_offset) {
        return result;
    }

    if (arith_region_end == 0) {
        arith_region_end = builder.blocks.arithmetic.size();
    }

    const auto sq_idx = [&](size_t canonical_idx) -> size_t {
        if (tail_squeeze_offset > 0 && canonical_idx >= HN_SQUEEZE_MAIN_SC_LAST) {
            return sq[canonical_idx - tail_squeeze_offset];
        }
        return sq[canonical_idx];
    };

    const auto validate_window = [&](size_t arith_start,
                                     size_t arith_end,
                                     const FunctionFingerprint& arith_fp,
                                     const FunctionFingerprint& p2ext_fp,
                                     const FunctionFingerprint& p2int_fp) {
        return validate_hn_window_poseidon<FF>(
            builder, analyzer, arith_start, arith_end, arith_fp, p2ext_fp, p2int_fp, cursor);
    };

    const size_t pre_eta_start = (sq[HN_SQUEEZE_OINK_ETA] + 1 >= OINK_PRE_ETA_ARITH.gate_count)
                                     ? (sq[HN_SQUEEZE_OINK_ETA] + 1 - OINK_PRE_ETA_ARITH.gate_count)
                                     : 0;

    if (!skip_oink_phase && !skip_through_gate_challenge) {
        // Oink (3 windows)
        if (!validate_window(pre_eta_start,
                             sq[HN_SQUEEZE_OINK_ETA] + 1,
                             OINK_PRE_ETA_ARITH,
                             OINK_PRE_ETA_POSEIDON2_EXT,
                             OINK_PRE_ETA_POSEIDON2_INT)) {
            return result;
        }
        result.oink.pre_eta_arith_start = pre_eta_start;
        if (!validate_window(sq[HN_SQUEEZE_OINK_ETA] + 1,
                             sq[HN_SQUEEZE_OINK_BETA] + 1,
                             OINK_ETA_TO_BETA_ARITH,
                             OINK_ETA_TO_BETA_POSEIDON2_EXT,
                             OINK_ETA_TO_BETA_POSEIDON2_INT)) {
            return result;
        }
        result.oink.eta_to_beta_arith_start = sq[HN_SQUEEZE_OINK_ETA] + 1;
        if (!validate_window(sq[HN_SQUEEZE_OINK_BETA] + 1,
                             sq[HN_SQUEEZE_OINK_ALPHA] + 1,
                             OINK_BETA_TO_ALPHA_ARITH,
                             OINK_BETA_TO_ALPHA_POSEIDON2_EXT,
                             OINK_BETA_TO_ALPHA_POSEIDON2_INT)) {
            return result;
        }
        result.oink.beta_to_alpha_arith_start = sq[HN_SQUEEZE_OINK_BETA] + 1;
        result.oink.valid = true;
    } else {
        result.oink.valid = true;
    }

    if (!skip_through_gate_challenge) {
        // Gate challenge
        if (!validate_window(sq[HN_SQUEEZE_OINK_ALPHA] + 1,
                             sq[HN_SQUEEZE_GATE_CHALLENGE] + 1,
                             CHALLENGE_EXTRACT_25_ARITH,
                             CHALLENGE_EXTRACT_POSEIDON2_EXT,
                             CHALLENGE_EXTRACT_POSEIDON2_INT)) {
            return result;
        }
        result.gate_challenge.arith_start = sq[HN_SQUEEZE_OINK_ALPHA] + 1;
        result.gate_challenge.valid = true;
    } else {
        result.gate_challenge.valid = true;
    }

    // Main Sumcheck (21 rounds)
    const auto main_sc_arith_fp = [](size_t round) -> const FunctionFingerprint& {
        if (round == 0) {
            return MAIN_SUMCHECK_ROUND_0_ARITH;
        }
        if (round == 1) {
            return MAIN_SUMCHECK_ROUND_1_ARITH;
        }
        if (round == 2) {
            return MAIN_SUMCHECK_ROUND_2_ARITH;
        }
        return MAIN_SUMCHECK_ROUND_STD_ARITH;
    };
    const size_t main_sc_base = main_sc_squeeze_base;
    for (size_t r = 0; r < main_sc_round_count; ++r) {
        const size_t ws = sq[main_sc_base + r] + 1;
        const size_t we = sq[main_sc_base + r + 1] + 1;
        const auto& p2ext = (r == 0) ? MAIN_SUMCHECK_ROUND_0_POSEIDON2_EXT : MAIN_SUMCHECK_ROUND_N_POSEIDON2_EXT;
        const auto& p2int = (r == 0) ? MAIN_SUMCHECK_ROUND_0_POSEIDON2_INT : MAIN_SUMCHECK_ROUND_N_POSEIDON2_INT;
        if (!validate_window(ws, we, main_sc_arith_fp(r), p2ext, p2int)) {
            return result;
        }
        if (r == 0) {
            result.main_sumcheck.arith_start = ws;
        }
        result.main_sumcheck.arith_end = we;
        ++result.main_sumcheck.rounds_found;
    }
    result.main_sumcheck.valid = (result.main_sumcheck.rounds_found == main_sc_round_count);

    // Batching: transition + 28 challenge blocks
    if (!validate_window(sq_idx(HN_SQUEEZE_MAIN_SC_LAST) + 1,
                         sq_idx(HN_SQUEEZE_BATCHING_FIRST) + 1,
                         BATCHING_TRANSITION_ARITH,
                         BATCHING_TRANSITION_POSEIDON2_EXT,
                         BATCHING_TRANSITION_POSEIDON2_INT)) {
        return result;
    }
    result.batching.arith_start = sq_idx(HN_SQUEEZE_MAIN_SC_LAST) + 1;
    result.batching.squeezes_found = 1;

    for (size_t k = HN_SQUEEZE_BATCHING_FIRST; k < HN_SQUEEZE_BATCHING_LAST; ++k) {
        if (!validate_window(sq_idx(k) + 1,
                             sq_idx(k + 1) + 1,
                             CHALLENGE_EXTRACT_25_ARITH,
                             CHALLENGE_EXTRACT_POSEIDON2_EXT,
                             CHALLENGE_EXTRACT_POSEIDON2_INT)) {
            return result;
        }
        ++result.batching.squeezes_found;
    }
    result.batching.valid = (result.batching.squeezes_found == HN_NUM_BATCHING_SQUEEZES);

    // MLB: alpha + 21 sumcheck rounds + claim batching
    if (!validate_window(sq_idx(HN_SQUEEZE_BATCHING_LAST) + 1,
                         sq_idx(HN_SQUEEZE_MLB_ALPHA) + 1,
                         MLB_ALPHA_ARITH,
                         MLB_ALPHA_POSEIDON2_EXT,
                         MLB_ALPHA_POSEIDON2_INT)) {
        return result;
    }
    result.mlb.alpha_arith_start = sq_idx(HN_SQUEEZE_BATCHING_LAST) + 1;

    const size_t mlb_base = HN_SQUEEZE_MLB_ALPHA;
    for (size_t r = 0; r < HN_NUM_MLB_SC_SQUEEZES; ++r) {
        const size_t ws = sq_idx(mlb_base + r) + 1;
        const size_t we = sq_idx(mlb_base + r + 1) + 1;
        const auto& arith_fp = (r == 0) ? MLB_SUMCHECK_ROUND_0_ARITH : MLB_SUMCHECK_ROUND_STD_ARITH;
        const auto& p2ext = (r == 0) ? MLB_SUMCHECK_ROUND_0_POSEIDON2_EXT : MLB_SUMCHECK_ROUND_N_POSEIDON2_EXT;
        const auto& p2int = (r == 0) ? MLB_SUMCHECK_ROUND_0_POSEIDON2_INT : MLB_SUMCHECK_ROUND_N_POSEIDON2_INT;
        if (!validate_window(ws, we, arith_fp, p2ext, p2int)) {
            return result;
        }
        if (r == 0) {
            result.mlb.sc_arith_start = ws;
        }
        result.mlb.sc_arith_end = we;
        ++result.mlb.rounds_found;
    }

    if (!validate_window(sq_idx(HN_SQUEEZE_MLB_SC_LAST) + 1,
                         sq_idx(HN_SQUEEZE_CLAIM_BATCHING) + 1,
                         CLAIM_BATCHING_ARITH,
                         CLAIM_BATCHING_POSEIDON2_EXT,
                         CLAIM_BATCHING_POSEIDON2_INT)) {
        return result;
    }
    result.mlb.valid = (result.mlb.rounds_found == HN_NUM_MLB_SC_SQUEEZES);

    // Post-MLB: transition + 13 squeeze windows
    if (!skip_post_mlb_phase) {
        if (!validate_window(sq_idx(HN_SQUEEZE_CLAIM_BATCHING) + 1,
                             sq_idx(HN_SQUEEZE_POST_MLB_FIRST) + 1,
                             POST_MLB_TRANSITION_ARITH,
                             POST_MLB_TRANSITION_POSEIDON2_EXT,
                             POST_MLB_TRANSITION_POSEIDON2_INT)) {
            return result;
        }
        result.post_mlb.transition_arith_start = sq_idx(HN_SQUEEZE_CLAIM_BATCHING) + 1;

        const auto post_squeeze_fps = [&](size_t k, size_t ws, size_t we)
            -> std::tuple<const FunctionFingerprint&, const FunctionFingerprint&, const FunctionFingerprint&> {
            if (k == 12) {
                const size_t gate_count = we - ws;
                if (gate_count == CHALLENGE_EXTRACT_25_ARITH.gate_count) {
                    return { CHALLENGE_EXTRACT_25_ARITH,
                             CHALLENGE_EXTRACT_POSEIDON2_EXT,
                             CHALLENGE_EXTRACT_POSEIDON2_INT };
                }
                if (gate_count == INNER_INTER_LOOP_TAIL_ARITH.gate_count) {
                    return { INNER_INTER_LOOP_TAIL_ARITH,
                             INNER_INTER_LOOP_TAIL_POSEIDON2_EXT,
                             INNER_INTER_LOOP_TAIL_POSEIDON2_INT };
                }
                return { POST_CLAIM_TAIL_PART2_ARITH,
                         POST_CLAIM_TAIL_PART2_POSEIDON2_EXT,
                         POST_CLAIM_TAIL_PART2_POSEIDON2_INT };
            }
            if (k == 1) {
                return { POST_MLB_SQUEEZE_1_ARITH, POST_MLB_SQUEEZE_1_POSEIDON2_EXT, POST_MLB_SQUEEZE_1_POSEIDON2_INT };
            }
            if (k == 9) {
                return { MERGE_PAIRING_TRANSITION_ARITH,
                         POST_MLB_TRANSITION_POSEIDON2_EXT,
                         POST_MLB_TRANSITION_POSEIDON2_INT };
            }
            if (k == 10) {
                return { POST_CLAIM_TAIL_PART0_ARITH,
                         MLB_SUMCHECK_ROUND_0_POSEIDON2_EXT,
                         MLB_SUMCHECK_ROUND_0_POSEIDON2_INT };
            }
            if (k == 11) {
                return { POST_CLAIM_TAIL_PART1_ARITH,
                         POST_CLAIM_TAIL_PART1_POSEIDON2_EXT,
                         POST_CLAIM_TAIL_PART1_POSEIDON2_INT };
            }
            return { CHALLENGE_EXTRACT_25_ARITH, CHALLENGE_EXTRACT_POSEIDON2_EXT, CHALLENGE_EXTRACT_POSEIDON2_INT };
        };

        for (size_t k = 0; k < HN_NUM_POST_MLB_SQUEEZES; ++k) {
            const size_t ws = sq_idx(HN_SQUEEZE_POST_MLB_FIRST + k) + 1;
            const size_t we =
                (k + 1 < HN_NUM_POST_MLB_SQUEEZES) ? sq_idx(HN_SQUEEZE_POST_MLB_FIRST + k + 1) + 1 : arith_region_end;
            const auto [arith_fp, p2ext_fp, p2int_fp] = post_squeeze_fps(k, ws, we);
            if (!validate_window(ws, we, arith_fp, p2ext_fp, p2int_fp)) {
                return result;
            }
            ++result.post_mlb.squeezes_found;
        }
        result.post_mlb.valid = (result.post_mlb.squeezes_found == HN_NUM_POST_MLB_SQUEEZES);
    } else {
        result.post_mlb.valid = true;
    }

    if (validate_poseidon_full_blocks) {
        // Mega merged poseidon2_external/poseidon2_quad_internal into one `poseidon2` block.
        auto& p2ext = builder.blocks.poseidon2;
        auto& p2int = builder.blocks.poseidon2;
        if (!matches_fingerprint_at(builder, p2ext, 0, POSEIDON2_EXTERNAL_FULL) ||
            !matches_fingerprint_at(builder, p2int, 0, POSEIDON2_INTERNAL_FULL)) {
            return result;
        }
        result.poseidon_full_valid = true;
    }

    result.all_valid = result.oink.valid && result.gate_challenge.valid && result.main_sumcheck.valid &&
                       result.batching.valid && result.mlb.valid && (skip_post_mlb_phase || result.post_mlb.valid) &&
                       (!validate_poseidon_full_blocks || result.poseidon_full_valid);
    return result;
}

/**
 * @brief Gap-based structural check for one 90-squeeze HN loop, used when absolute Oink layout differs.
 *
 * @param sq                   Squeeze-gate index map for this loop's slice.
 * @param require_oink_gaps    Whether to assert the Oink-phase squeeze gaps (false when Oink is skipped).
 * @param main_sc_round_count  Number of main-sumcheck rounds expected for this shape.
 * @param tail_squeeze_offset  Squeeze-index shift applied from `HN_SQUEEZE_MAIN_SC_LAST` onward.
 * @param main_sc_squeeze_base Squeeze index where the main-sumcheck window chain begins.
 * @return                     True iff every expected inter-squeeze gap matches its stage's gate count.
 */
inline bool validate_hn_loop_structure(const std::vector<size_t>& sq,
                                       bool require_oink_gaps = true,
                                       size_t main_sc_round_count = HN_NUM_MAIN_SC_SQUEEZES,
                                       size_t tail_squeeze_offset = 0,
                                       size_t main_sc_squeeze_base = HN_SQUEEZE_GATE_CHALLENGE)
{
    if (sq.size() < HN_SQUEEZE_GATE_CHALLENGE + 1) {
        return false;
    }

    const auto sq_idx = [&](size_t canonical_idx) -> size_t {
        if (tail_squeeze_offset > 0 && canonical_idx >= HN_SQUEEZE_MAIN_SC_LAST) {
            return sq[canonical_idx - tail_squeeze_offset];
        }
        return sq[canonical_idx];
    };

    if (require_oink_gaps) {
        const bool oink_ok = (sq[1] - sq[0] == OINK_ETA_TO_BETA_ARITH.gate_count) &&
                             (sq[2] - sq[1] == OINK_BETA_TO_ALPHA_ARITH.gate_count) &&
                             (sq[3] - sq[2] == CHALLENGE_EXTRACT_25_ARITH.gate_count);
        if (!oink_ok) {
            return false;
        }
    }

    size_t sc_run = 0;
    const size_t main_sc_last = main_sc_squeeze_base + main_sc_round_count;
    for (size_t i = main_sc_squeeze_base + 1; i + 1 <= main_sc_last; ++i) {
        const size_t gap = sq[i + 1] - sq[i];
        if (gap == MAIN_SUMCHECK_ROUND_1_ARITH.gate_count || gap == MAIN_SUMCHECK_ROUND_STD_ARITH.gate_count) {
            ++sc_run;
        }
        if (sc_run == main_sc_round_count - 1) {
            break;
        }
    }
    if (sc_run < main_sc_round_count - 1) {
        return false;
    }

    size_t batch_run = 0;
    for (size_t i = HN_SQUEEZE_BATCHING_FIRST; i + 1 <= HN_SQUEEZE_BATCHING_LAST; ++i) {
        if (sq_idx(i + 1) - sq_idx(i) == CHALLENGE_EXTRACT_25_ARITH.gate_count) {
            ++batch_run;
        }
        if (batch_run == HN_NUM_BATCHING_SQUEEZES - 1) {
            break;
        }
    }
    if (batch_run < HN_NUM_BATCHING_SQUEEZES - 1) {
        return false;
    }

    size_t mlb_run = 0;
    for (size_t i = HN_SQUEEZE_MLB_ALPHA; i + 1 <= HN_SQUEEZE_MLB_SC_LAST; ++i) {
        if (sq_idx(i + 1) - sq_idx(i) == MLB_SUMCHECK_ROUND_STD_ARITH.gate_count) {
            ++mlb_run;
        }
        if (mlb_run == HN_NUM_MLB_SC_SQUEEZES - 1) {
            break;
        }
    }
    return mlb_run >= HN_NUM_MLB_SC_SQUEEZES - 1;
}

/**
 * @brief Validate the RESET/FINAL-shared fold-core (Oink+MainSC, padding, batching, MLB+claim_batching)
 * via a contiguous FunctionFingerprint cursor chain, stopping right after claim_batching.
 *
 * Anchors `primitive_start` on ACIR `key_hash`/`key[]` (RESET_VK_HASH_PROFILE). Does not check region
 * coverage or set `all_valid` -- callers differ on what follows this shared core (RESET/TAIL continue
 * with the RESET-only post-MLB tail; FINAL/HIDING continues with the F3 decider instead), so coverage
 * is the caller's responsibility. Success is signaled by `result.mlb.valid` (true only if every stage
 * up to and including claim_batching matched); `result.shared_fold_core_arith_end` /
 * `result.poseidon2_cursor_end` give the cursors the caller should continue from.
 *
 * @param constraint  Optional ACIR constraint for the vk_hash anchor. When null, poseidon2 chain
 *                    starts at gate 0 (legacy callers without an ACIR handle) — prefer supplying it.
 */
template <typename FF, typename CircuitBuilder>
HNBaselineValidationResult validate_hn_shared_fold_core(CircuitBuilder& builder,
                                                        cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                                        const acir_format::RecursionConstraint* constraint = nullptr)
{
    HNBaselineValidationResult result;
    auto& arith = builder.blocks.arithmetic;
    auto& poseidon2 = builder.blocks.poseidon2;
    result.arith_region_end = arith.size();
    result.poseidon2_region_end = poseidon2.size();

    size_t poseidon_cursor = 0;
    if (constraint != nullptr) {
        const auto vk_hash =
            HNOinkValidation::validate_vk_hash_anchor<FF>(builder, analyzer, *constraint, RESET_VK_HASH_PROFILE);
        if (!vk_hash.valid) {
            return result;
        }
        if (!HNOinkValidation::validate_key_limbs_drive_vk_hash<FF>(builder, analyzer, *constraint, vk_hash).valid) {
            return result;
        }
        result.primitive_start_poseidon2 = vk_hash.poseidon2_ext_start;
        poseidon_cursor = vk_hash.poseidon2_ext_start;
        if (!matches_fingerprint_at(builder, poseidon2, poseidon_cursor, RESET_VK_HASH_POSEIDON2)) {
            return result;
        }
        poseidon_cursor += RESET_VK_HASH_POSEIDON2.gate_count;
    }

    if (poseidon_cursor + RESET_POSEIDON2_TAIL.gate_count > poseidon2.size() ||
        !matches_fingerprint_at(builder, poseidon2, poseidon_cursor, RESET_POSEIDON2_TAIL)) {
        return result;
    }
    poseidon_cursor += RESET_POSEIDON2_TAIL.gate_count;
    result.poseidon2_cursor_end = poseidon_cursor;

    size_t arith_cursor = 0;
    const auto advance_arith = [&](const FunctionFingerprint& fp) -> bool {
        if (arith_cursor + fp.gate_count > arith.size() || !matches_fingerprint_at(builder, arith, arith_cursor, fp)) {
            return false;
        }
        arith_cursor += fp.gate_count;
        return true;
    };

    // Stage 1: Oink + gate_challenge + Main Sumcheck (24 rounds), all `fr`-challenged post-merge so no
    // squeeze marker sub-divides them (see RESET_OINK_MAINSC_LIVE_ARITH doc comment). Cannot
    // independently verify Oink vs gate_challenge vs Main Sumcheck without a full sumcheck.hpp
    // production trace -- all three flags below are tied to this one combined-span check, not
    // independently confirmed. `main_sumcheck.rounds_found` is left at 0 (not per-round verified).
    if (!advance_arith(RESET_OINK_MAINSC_LIVE_ARITH)) {
        return result;
    }
    result.oink.pre_eta_arith_start = 0;
    result.oink.valid = true;
    result.gate_challenge.arith_start = 0;
    result.gate_challenge.valid = true;
    result.main_sumcheck.arith_start = 0;
    result.main_sumcheck.arith_end = arith_cursor;
    result.main_sumcheck.valid = true;

    // Stage 2: pre-batching padding -- own field/fingerprint so an injection here isn't mistaken for
    // stage 1 or stage 3 corruption. See RESET_PRE_BATCHING_PADDING_ARITH doc comment (open item: the
    // emitting function isn't identified yet, but the span is pinned and checked).
    result.pre_batching_padding.arith_start = arith_cursor;
    if (!advance_arith(RESET_PRE_BATCHING_PADDING_ARITH)) {
        return result;
    }
    result.pre_batching_padding.valid = true;

    // Stage 3: batching-phase `fq` challenge windows -- the one phase the squeeze detector still
    // resolves internally post-merge (31 unshifted + 2 shifted, matches legacy HN_NUM_BATCHING_SQUEEZES).
    result.batching.arith_start = arith_cursor;
    for (size_t i = 0; i < RESET_NUM_BATCHING_CHALLENGE_WINDOWS; ++i) {
        if (!advance_arith(RESET_BATCHING_CHALLENGE_WINDOW_ARITH)) {
            result.batching.squeezes_found = i;
            return result;
        }
    }
    result.batching.squeezes_found = RESET_NUM_BATCHING_CHALLENGE_WINDOWS;
    result.batching.valid = true;

    // Stage 4 (shared part only): MLB (alpha + 24-round Sumcheck) + claim_batching. RESET/TAIL append a
    // RESET-only post-MLB tail after this (accumulator hash/merge/pairing); FINAL/HIDING appends the F3
    // decider instead -- so this function stops here, at the shared boundary.
    result.mlb.alpha_arith_start = arith_cursor;
    result.mlb.sc_arith_start = arith_cursor;
    if (!advance_arith(RESET_MLB_AND_CLAIM_BATCHING_ARITH)) {
        return result;
    }
    result.mlb.sc_arith_end = arith_cursor;
    result.mlb.valid = true;
    result.shared_fold_core_arith_end = arith_cursor;

    return result;
}

/**
 * @brief Validate the full HN RESET kernel via a contiguous FunctionFingerprint cursor chain.
 *
 * Runs the RESET/FINAL-shared fold-core, then RESET's own post-MLB tail (accumulator hash / merge /
 * pairing), then asserts total coverage of both the arithmetic and poseidon2 blocks. Does not use
 * transcript-squeeze indices for boundaries (hn_cursor_chaining_plan.md).
 *
 * @param constraint  Optional ACIR constraint for the vk_hash anchor. When null, poseidon2 chain
 *                    starts at gate 0 (legacy callers without an ACIR handle) — prefer supplying it.
 */
template <typename FF, typename CircuitBuilder>
HNBaselineValidationResult validate_hn_baseline(CircuitBuilder& builder,
                                                cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                                const acir_format::RecursionConstraint* constraint = nullptr)
{
    HNBaselineValidationResult result = validate_hn_shared_fold_core<FF>(builder, analyzer, constraint);
    result.poseidon2_coverage_valid = (result.poseidon2_cursor_end == result.poseidon2_region_end);
    result.poseidon_full_valid = result.poseidon2_coverage_valid;
    if (!result.mlb.valid) {
        return result;
    }

    auto& arith = builder.blocks.arithmetic;
    size_t arith_cursor = result.shared_fold_core_arith_end;
    if (arith_cursor + RESET_ONLY_POST_MLB_TAIL_ARITH.gate_count > arith.size() ||
        !matches_fingerprint_at(builder, arith, arith_cursor, RESET_ONLY_POST_MLB_TAIL_ARITH)) {
        return result;
    }
    arith_cursor += RESET_ONLY_POST_MLB_TAIL_ARITH.gate_count;
    result.post_mlb.transition_arith_start = result.mlb.alpha_arith_start;
    result.post_mlb.valid = true;

    result.arith_cursor_end = arith_cursor;
    result.arith_coverage_valid = (arith_cursor == result.arith_region_end);
    result.all_valid = result.arith_coverage_valid && result.poseidon2_coverage_valid;
    return result;
}

/**
 * @brief Convenience overload — constructs a witness-link analyzer on the stack.
 */
template <typename CircuitBuilder> HNBaselineValidationResult validate_hn_baseline(CircuitBuilder& builder)
{
    cdg::StaticAnalyzer_<bb::fr, CircuitBuilder> analyzer(builder, false);
    return validate_hn_baseline<bb::fr>(builder, analyzer);
}

// -- Extension validators -----------------------------------------------------------
//
// The HIDING (HN_FINAL), INIT, and INNER kernel validators (`validate_hn_hiding`, `validate_hn_init`,
// `validate_hn_inner`) live in their own opcode headers (`HNFinalValidation.hpp`, `HNInitValidation.hpp`,
// `HNInnerValidation.hpp`), each self-nested under `namespace HNVerification { namespace HNXValidation {
// ... } }` -- this file stays opcode-agnostic so it can be shared across all HN opcode branches without
// pulling in every opcode's header.
//
// TAIL's ecc_op block carries no TAIL-specific content: `complete_kernel_circuit_logic` (chonk.cpp)
// prepends the same single `queue_ecc_eq()` to every kernel type regardless of queue type, and
// `accumulate_and_fold`/`verify_folding` (chonk.cpp) handle QUEUE_TYPE::HN and QUEUE_TYPE::HN_TAIL
// identically. So a TAIL kernel's circuit is structurally indistinguishable from a RESET kernel's,
// and `validate_hn_baseline` covers it fully -- there is no separate `validate_hn_tail`.

} // namespace HNVerification

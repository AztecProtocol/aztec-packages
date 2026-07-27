#pragma once

// ROOT_ROLLUP_HONK IPA::full_verify_recursive validation (after IPA::accumulate).
//
// Both paths are stepped per round (claim hash -> generator challenge -> per-round transcript ->
// reduce-finish MSM -> per-round G_zero s_vec -> batch-mul check), differing only in the
// reduce-finish/batch-mul fingerprints (which scale with log_n):
// Fast (log_n=12): root_rollup_honk_ipa_fast_rounds_analysis.txt
// Production (log_n=15): root_rollup_honk_ipa_production_rounds_analysis.txt

#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_validation/ROLLUP_HONK/rollup_honk_ipa_accumulate_verification.hpp"
#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_validation/ROLLUP_HONK/rollup_honk_ipa_gzero_svec_verification.hpp"
#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_validation/ROLLUP_HONK/rollup_honk_ipa_test_config.hpp"
#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_helper.hpp"
#include "barretenberg/noir_programs_boomerang_values/poseidon2s_helpers.hpp"
#include "barretenberg/constants.hpp"
#include <cstddef>

namespace RollupHonkIpaFullVerifyValidation {

using BlockCursor = RollupHonkIpaAccumulateValidation::BlockCursor;

static constexpr size_t IPA_FULL_VERIFY_SQUEEZE_COUNT = 16;
// 1 generator-challenge squeeze + one squeeze per transcript round (TEST_IPA_LOG_N = 12).
static constexpr size_t FAST_IPA_FULL_VERIFY_SQUEEZE_COUNT = 13;

// FullVerify_ClaimHash (shared)
static constexpr recursion_helpers::FunctionFingerprint CLAIM_HASH_ARITH =
    RollupHonkIpaAccumulateValidation::NESTED0_CLAIM_HASH_ARITH;

// --- Stepped fast IPA (log_n=12) ---

static constexpr recursion_helpers::FunctionFingerprint GENERATOR_CHALLENGE_ARITH = {
    38, 0x49966e00712e56a5ULL, 0x28a16069c7802515ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint GENERATOR_CHALLENGE_NNF = {
    6, 0xdd4f1a36fb766e79ULL, 0xdd4f1a36fb766e79ULL, 6
};
static constexpr recursion_helpers::FunctionFingerprint GENERATOR_CHALLENGE_POSEIDON2_EXT = {
    20, 0xec92a899925d755ULL, 0xec92a899925d755ULL, 20
};
static constexpr recursion_helpers::FunctionFingerprint GENERATOR_CHALLENGE_POSEIDON2_INT = {
    114, 0xee3a7ac895f8a6d9ULL, 0x8112ac29167e98daULL, 20
};

static constexpr recursion_helpers::FunctionFingerprint TRANSCRIPT_ROUND_ARITH = {
    76, 0x13ddeb2caf5adf1cULL, 0x6c468de8e6ff8bcbULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint TRANSCRIPT_ROUND_NNF = {
    22, 0x3e6be5a5a8e7506bULL, 0xafa178806b737ad6ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint TRANSCRIPT_ROUND_POSEIDON2_EXT = {
    20, 0xec92a899925d755ULL, 0xec92a899925d755ULL, 20
};
static constexpr recursion_helpers::FunctionFingerprint TRANSCRIPT_ROUND_POSEIDON2_INT = {
    114, 0xee3a7ac895f8a6d9ULL, 0x8112ac29167e98daULL, 20
};

static constexpr recursion_helpers::FunctionFingerprint REDUCE_FINISH_MSM_ARITH = {
    6388, 0xc4efb1d42862043dULL, 0x48c854967592205eULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint REDUCE_FINISH_MSM_ELLIPTIC = {
    2334, 0xa9be1730a335e7d9ULL, 0x70bd374f9f2d3deeULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint REDUCE_FINISH_MSM_MEMORY = {
    2080, 0xe7fd0be5c039f40fULL, 0x367926cedc083f29ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint REDUCE_FINISH_MSM_NNF = {
    613, 0x5357cf033657dca2ULL, 0x5929552160bccea7ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};

static constexpr recursion_helpers::FunctionFingerprint BATCH_MUL_CHECK_ARITH = {
    167847, 0x1c87986d8bb13df5ULL, 0xc90f1f8e1294456eULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint BATCH_MUL_CHECK_ELLIPTIC = {
    327854, 0xa9be1730a335e7d9ULL, 0xfd935c4dad5140a5ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint BATCH_MUL_CHECK_MEMORY = {
    327600, 0xe7fd0be5c039f40fULL, 0x991e06ca46205731ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};

static constexpr recursion_helpers::FunctionFingerprint FAST_FULL_VERIFY_ARITH = {
    232471, 0x83c7792df42b5d74ULL, 0x16bb3605246e6d32ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint FAST_FULL_VERIFY_ELLIPTIC = {
    330188, 0xa9be1730a335e7d9ULL, 0x24159d9bb7d40bd2ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint FAST_FULL_VERIFY_MEMORY = {
    329680, 0xe7fd0be5c039f40fULL, 0xc293ebd722c75ef9ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint FAST_FULL_VERIFY_NNF = {
    66439, 0xff2ca3c0bde9b337ULL, 0x75d11049a0855be4ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint FAST_FULL_VERIFY_POSEIDON2_EXT = {
    260, 0xec92a899925d755ULL, 0xff180bdded8e3ca0ULL, 20
};
static constexpr recursion_helpers::FunctionFingerprint FAST_FULL_VERIFY_POSEIDON2_INT = {
    1482, 0xee3a7ac895f8a6d9ULL, 0x3a46c0e73e761382ULL, 20
};

// --- Production stepped (log_n=15) ---
// Fingerprints from root_rollup_honk_ipa_production_rounds_analysis.txt. Claim hash, generator
// challenge and per-round transcript round fingerprints are log_n-independent, so the shared
// CLAIM_HASH_ARITH / GENERATOR_CHALLENGE_* / TRANSCRIPT_ROUND_* constants above apply unchanged;
// only reduce-finish MSM and the G_zero batch-mul check scale with log_n and need their own values.

static constexpr recursion_helpers::FunctionFingerprint PRODUCTION_REDUCE_FINISH_MSM_ARITH = {
    7873, 0xc4efb1d42862043dULL, 0x81e08f4a8ed2337aULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint PRODUCTION_REDUCE_FINISH_MSM_ELLIPTIC = {
    2814, 0xa9be1730a335e7d9ULL, 0x83d9deead10cb129ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint PRODUCTION_REDUCE_FINISH_MSM_MEMORY = {
    2560, 0xe7fd0be5c039f40fULL, 0x22850c83d74477b5ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint PRODUCTION_REDUCE_FINISH_MSM_NNF = {
    757, 0x5357cf033657dca2ULL, 0x5481398b340762d5ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};

static constexpr recursion_helpers::FunctionFingerprint PRODUCTION_BATCH_MUL_CHECK_ARITH = {
    1343387, 0x1c87986d8bb13df5ULL, 0xc2c85ecb3e8afd63ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint PRODUCTION_BATCH_MUL_CHECK_ELLIPTIC = {
    2621614, 0xa9be1730a335e7d9ULL, 0x0c0377be7beea74bULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint PRODUCTION_BATCH_MUL_CHECK_MEMORY = {
    2621360, 0xe7fd0be5c039f40fULL, 0xd994152304ca2adbULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};

static constexpr recursion_helpers::FunctionFingerprint PRODUCTION_FULL_VERIFY_ARITH = {
    1811120, 0x83c7792df42b5d74ULL, 0x75dd4678326de4f8ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint PRODUCTION_FULL_VERIFY_ELLIPTIC = {
    2624428, 0xa9be1730a335e7d9ULL, 0x35c4f1c7a12b457cULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint PRODUCTION_FULL_VERIFY_MEMORY = {
    2623920, 0xe7fd0be5c039f40fULL, 0xf0983cd746cefb4dULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint PRODUCTION_FULL_VERIFY_NNF = {
    525410, 0xff2ca3c0bde9b337ULL, 0xd6b9bd9dbd4453c1ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint PRODUCTION_FULL_VERIFY_POSEIDON2_EXT = {
    320, 0x0ec92a899925d755ULL, 0x8bcb27fc403fb851ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint PRODUCTION_FULL_VERIFY_POSEIDON2_INT = {
    1824, 0xee3a7ac895f8a6d9ULL, 0xa2c686d75555e7f6ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};

struct StageValidationResult {
    bool is_valid = false;
    BlockCursor end{};
};

template <typename CircuitBuilder>
bool matches_block_fingerprint(CircuitBuilder& builder,
                               auto& block,
                               size_t start,
                               const recursion_helpers::FunctionFingerprint& fp)
{
    if (fp.gate_count == 0) {
        return true;
    }
    return recursion_helpers::matches_fingerprint_at(builder, block, start, fp);
}

inline bool cursors_equal(const BlockCursor& a, const BlockCursor& b)
{
    return a.arith == b.arith && a.elliptic == b.elliptic && a.memory == b.memory && a.nnf == b.nnf
           && a.poseidon2_ext == b.poseidon2_ext && a.poseidon2_int == b.poseidon2_int;
}

template <typename CircuitBuilder>
StageValidationResult validate_claim_hash(CircuitBuilder& builder, const BlockCursor& previous)
{
    StageValidationResult result;
    result.end = previous;
    result.end.arith += CLAIM_HASH_ARITH.gate_count;
    result.is_valid = matches_block_fingerprint(builder, builder.blocks.arithmetic, previous.arith, CLAIM_HASH_ARITH);
    return result;
}

template <typename CircuitBuilder>
StageValidationResult validate_generator_challenge(CircuitBuilder& builder, const BlockCursor& previous)
{
    StageValidationResult result;
    result.end.arith = previous.arith + GENERATOR_CHALLENGE_ARITH.gate_count;
    result.end.nnf = previous.nnf + GENERATOR_CHALLENGE_NNF.gate_count;
    result.end.poseidon2_ext = previous.poseidon2_ext + GENERATOR_CHALLENGE_POSEIDON2_EXT.gate_count;
    result.end.poseidon2_int = previous.poseidon2_int + GENERATOR_CHALLENGE_POSEIDON2_INT.gate_count;
    result.end.elliptic = previous.elliptic;
    result.end.memory = previous.memory;

    result.is_valid =
        matches_block_fingerprint(builder, builder.blocks.arithmetic, previous.arith, GENERATOR_CHALLENGE_ARITH)
        && matches_block_fingerprint(builder, builder.blocks.nnf, previous.nnf, GENERATOR_CHALLENGE_NNF)
        && matches_block_fingerprint(
            builder, poseidon2_helpers::poseidon2_external_block(builder), previous.poseidon2_ext, GENERATOR_CHALLENGE_POSEIDON2_EXT)
        && matches_block_fingerprint(
            builder, poseidon2_helpers::poseidon2_internal_block(builder), previous.poseidon2_int, GENERATOR_CHALLENGE_POSEIDON2_INT);
    return result;
}

template <typename CircuitBuilder>
StageValidationResult validate_transcript_round(CircuitBuilder& builder, const BlockCursor& previous)
{
    StageValidationResult result;
    result.end.arith = previous.arith + TRANSCRIPT_ROUND_ARITH.gate_count;
    result.end.nnf = previous.nnf + TRANSCRIPT_ROUND_NNF.gate_count;
    result.end.poseidon2_ext = previous.poseidon2_ext + TRANSCRIPT_ROUND_POSEIDON2_EXT.gate_count;
    result.end.poseidon2_int = previous.poseidon2_int + TRANSCRIPT_ROUND_POSEIDON2_INT.gate_count;
    result.end.elliptic = previous.elliptic;
    result.end.memory = previous.memory;

    result.is_valid =
        matches_block_fingerprint(builder, builder.blocks.arithmetic, previous.arith, TRANSCRIPT_ROUND_ARITH)
        && matches_block_fingerprint(builder, builder.blocks.nnf, previous.nnf, TRANSCRIPT_ROUND_NNF)
        && matches_block_fingerprint(
            builder, poseidon2_helpers::poseidon2_external_block(builder), previous.poseidon2_ext, TRANSCRIPT_ROUND_POSEIDON2_EXT)
        && matches_block_fingerprint(
            builder, poseidon2_helpers::poseidon2_internal_block(builder), previous.poseidon2_int, TRANSCRIPT_ROUND_POSEIDON2_INT);
    return result;
}

template <typename CircuitBuilder>
StageValidationResult validate_reduce_finish_msm(CircuitBuilder& builder, const BlockCursor& previous)
{
    StageValidationResult result;
    result.end.arith = previous.arith + REDUCE_FINISH_MSM_ARITH.gate_count;
    result.end.elliptic = previous.elliptic + REDUCE_FINISH_MSM_ELLIPTIC.gate_count;
    result.end.memory = previous.memory + REDUCE_FINISH_MSM_MEMORY.gate_count;
    result.end.nnf = previous.nnf + REDUCE_FINISH_MSM_NNF.gate_count;
    result.end.poseidon2_ext = previous.poseidon2_ext;
    result.end.poseidon2_int = previous.poseidon2_int;

    result.is_valid =
        matches_block_fingerprint(builder, builder.blocks.arithmetic, previous.arith, REDUCE_FINISH_MSM_ARITH)
        && matches_block_fingerprint(builder, builder.blocks.elliptic, previous.elliptic, REDUCE_FINISH_MSM_ELLIPTIC)
        && matches_block_fingerprint(builder, builder.blocks.memory, previous.memory, REDUCE_FINISH_MSM_MEMORY)
        && matches_block_fingerprint(builder, builder.blocks.nnf, previous.nnf, REDUCE_FINISH_MSM_NNF);
    return result;
}

template <typename CircuitBuilder>
StageValidationResult validate_gzero_batch_mul_check(CircuitBuilder& builder, const BlockCursor& previous)
{
    StageValidationResult result;
    result.end.arith = previous.arith + BATCH_MUL_CHECK_ARITH.gate_count;
    result.end.elliptic = previous.elliptic + BATCH_MUL_CHECK_ELLIPTIC.gate_count;
    result.end.memory = previous.memory + BATCH_MUL_CHECK_MEMORY.gate_count;
    result.end.nnf = previous.nnf;
    result.end.poseidon2_ext = previous.poseidon2_ext;
    result.end.poseidon2_int = previous.poseidon2_int;

    result.is_valid =
        matches_block_fingerprint(builder, builder.blocks.arithmetic, previous.arith, BATCH_MUL_CHECK_ARITH)
        && matches_block_fingerprint(builder, builder.blocks.elliptic, previous.elliptic, BATCH_MUL_CHECK_ELLIPTIC)
        && matches_block_fingerprint(builder, builder.blocks.memory, previous.memory, BATCH_MUL_CHECK_MEMORY);
    return result;
}

inline BlockCursor cursor_after_fast_aggregate(const BlockCursor& baseline)
{
    return BlockCursor{
        .arith = baseline.arith + FAST_FULL_VERIFY_ARITH.gate_count,
        .elliptic = baseline.elliptic + FAST_FULL_VERIFY_ELLIPTIC.gate_count,
        .memory = baseline.memory + FAST_FULL_VERIFY_MEMORY.gate_count,
        .nnf = baseline.nnf + FAST_FULL_VERIFY_NNF.gate_count,
        .poseidon2_ext = baseline.poseidon2_ext + FAST_FULL_VERIFY_POSEIDON2_EXT.gate_count,
        .poseidon2_int = baseline.poseidon2_int + FAST_FULL_VERIFY_POSEIDON2_INT.gate_count,
    };
}

template <typename CircuitBuilder>
bool validate_fast_full_verify_aggregate_fp(CircuitBuilder& builder, const BlockCursor& baseline)
{
    return matches_block_fingerprint(builder, builder.blocks.arithmetic, baseline.arith, FAST_FULL_VERIFY_ARITH)
           && matches_block_fingerprint(builder, builder.blocks.elliptic, baseline.elliptic, FAST_FULL_VERIFY_ELLIPTIC)
           && matches_block_fingerprint(builder, builder.blocks.memory, baseline.memory, FAST_FULL_VERIFY_MEMORY)
           && matches_block_fingerprint(builder, builder.blocks.nnf, baseline.nnf, FAST_FULL_VERIFY_NNF)
           && matches_block_fingerprint(
               builder, poseidon2_helpers::poseidon2_external_block(builder), baseline.poseidon2_ext, FAST_FULL_VERIFY_POSEIDON2_EXT)
           && matches_block_fingerprint(
               builder, poseidon2_helpers::poseidon2_internal_block(builder), baseline.poseidon2_int, FAST_FULL_VERIFY_POSEIDON2_INT);
}

struct IpaFullVerifyValidationResult {
    bool is_valid = false;
    bool claim_hash_ok = false;
    bool generator_challenge_ok = false;
    bool transcript_rounds_ok = false;
    bool reduce_finish_msm_ok = false;
    bool gzero_svec_ok = false;
    bool batch_mul_check_ok = false;
    bool aggregate_ok = false;
    bool squeeze_count_ok = false;
    bool cursors_at_end_ok = false;
    BlockCursor end{};
};

template <typename CircuitBuilder>
StageValidationResult validate_production_reduce_finish_msm(CircuitBuilder& builder, const BlockCursor& previous)
{
    StageValidationResult result;
    result.end.arith = previous.arith + PRODUCTION_REDUCE_FINISH_MSM_ARITH.gate_count;
    result.end.elliptic = previous.elliptic + PRODUCTION_REDUCE_FINISH_MSM_ELLIPTIC.gate_count;
    result.end.memory = previous.memory + PRODUCTION_REDUCE_FINISH_MSM_MEMORY.gate_count;
    result.end.nnf = previous.nnf + PRODUCTION_REDUCE_FINISH_MSM_NNF.gate_count;
    result.end.poseidon2_ext = previous.poseidon2_ext;
    result.end.poseidon2_int = previous.poseidon2_int;

    result.is_valid = matches_block_fingerprint(
                          builder, builder.blocks.arithmetic, previous.arith, PRODUCTION_REDUCE_FINISH_MSM_ARITH)
                      && matches_block_fingerprint(
                          builder, builder.blocks.elliptic, previous.elliptic, PRODUCTION_REDUCE_FINISH_MSM_ELLIPTIC)
                      && matches_block_fingerprint(
                          builder, builder.blocks.memory, previous.memory, PRODUCTION_REDUCE_FINISH_MSM_MEMORY)
                      && matches_block_fingerprint(
                          builder, builder.blocks.nnf, previous.nnf, PRODUCTION_REDUCE_FINISH_MSM_NNF);
    return result;
}

template <typename CircuitBuilder>
StageValidationResult validate_production_gzero_batch_mul_check(CircuitBuilder& builder, const BlockCursor& previous)
{
    StageValidationResult result;
    result.end.arith = previous.arith + PRODUCTION_BATCH_MUL_CHECK_ARITH.gate_count;
    result.end.elliptic = previous.elliptic + PRODUCTION_BATCH_MUL_CHECK_ELLIPTIC.gate_count;
    result.end.memory = previous.memory + PRODUCTION_BATCH_MUL_CHECK_MEMORY.gate_count;
    result.end.nnf = previous.nnf;
    result.end.poseidon2_ext = previous.poseidon2_ext;
    result.end.poseidon2_int = previous.poseidon2_int;

    result.is_valid =
        matches_block_fingerprint(builder, builder.blocks.arithmetic, previous.arith, PRODUCTION_BATCH_MUL_CHECK_ARITH)
        && matches_block_fingerprint(
            builder, builder.blocks.elliptic, previous.elliptic, PRODUCTION_BATCH_MUL_CHECK_ELLIPTIC)
        && matches_block_fingerprint(
            builder, builder.blocks.memory, previous.memory, PRODUCTION_BATCH_MUL_CHECK_MEMORY);
    return result;
}

inline BlockCursor cursor_after_production_aggregate(const BlockCursor& baseline)
{
    return BlockCursor{
        .arith = baseline.arith + PRODUCTION_FULL_VERIFY_ARITH.gate_count,
        .elliptic = baseline.elliptic + PRODUCTION_FULL_VERIFY_ELLIPTIC.gate_count,
        .memory = baseline.memory + PRODUCTION_FULL_VERIFY_MEMORY.gate_count,
        .nnf = baseline.nnf + PRODUCTION_FULL_VERIFY_NNF.gate_count,
        .poseidon2_ext = baseline.poseidon2_ext + PRODUCTION_FULL_VERIFY_POSEIDON2_EXT.gate_count,
        .poseidon2_int = baseline.poseidon2_int + PRODUCTION_FULL_VERIFY_POSEIDON2_INT.gate_count,
    };
}

template <typename CircuitBuilder>
bool validate_production_full_verify_aggregate_fp(CircuitBuilder& builder, const BlockCursor& baseline)
{
    return matches_block_fingerprint(builder, builder.blocks.arithmetic, baseline.arith, PRODUCTION_FULL_VERIFY_ARITH)
           && matches_block_fingerprint(
               builder, builder.blocks.elliptic, baseline.elliptic, PRODUCTION_FULL_VERIFY_ELLIPTIC)
           && matches_block_fingerprint(builder, builder.blocks.memory, baseline.memory, PRODUCTION_FULL_VERIFY_MEMORY)
           && matches_block_fingerprint(builder, builder.blocks.nnf, baseline.nnf, PRODUCTION_FULL_VERIFY_NNF)
           && matches_block_fingerprint(
               builder, poseidon2_helpers::poseidon2_external_block(builder), baseline.poseidon2_ext, PRODUCTION_FULL_VERIFY_POSEIDON2_EXT)
           && matches_block_fingerprint(
               builder, poseidon2_helpers::poseidon2_internal_block(builder), baseline.poseidon2_int, PRODUCTION_FULL_VERIFY_POSEIDON2_INT);
}

template <typename CircuitBuilder>
IpaFullVerifyValidationResult validate_ipa_full_verify_stepped_fast(CircuitBuilder& builder,
                                                                  const BlockCursor& after_accumulate,
                                                                  size_t ipa_log_n)
{
    IpaFullVerifyValidationResult result;
    if (ipa_log_n != rollup_honk_test_config::TEST_IPA_LOG_N || ipa_log_n != RollupHonkIpaGZeroSVecValidation::FAST_IPA_LOG_N) {
        return result;
    }

    BlockCursor cursor = after_accumulate;

    auto claim_hash = validate_claim_hash(builder, cursor);
    result.claim_hash_ok = claim_hash.is_valid;
    if (!claim_hash.is_valid) {
        return result;
    }
    cursor = claim_hash.end;

    auto generator_challenge = validate_generator_challenge(builder, cursor);
    result.generator_challenge_ok = generator_challenge.is_valid;
    if (!generator_challenge.is_valid) {
        return result;
    }
    cursor = generator_challenge.end;

    result.transcript_rounds_ok = true;
    for (size_t round = 0; round < ipa_log_n; ++round) {
        auto transcript_round = validate_transcript_round(builder, cursor);
        if (!transcript_round.is_valid) {
            result.transcript_rounds_ok = false;
            return result;
        }
        cursor = transcript_round.end;
    }

    auto reduce_finish = validate_reduce_finish_msm(builder, cursor);
    result.reduce_finish_msm_ok = reduce_finish.is_valid;
    if (!reduce_finish.is_valid) {
        return result;
    }
    cursor = reduce_finish.end;

    auto gzero_svec = RollupHonkIpaGZeroSVecValidation::validate_gzero_svec_rounds(builder, cursor, ipa_log_n);
    result.gzero_svec_ok = gzero_svec.is_valid;
    if (!gzero_svec.is_valid) {
        return result;
    }
    cursor = gzero_svec.end;

    auto batch_mul = validate_gzero_batch_mul_check(builder, cursor);
    result.batch_mul_check_ok = batch_mul.is_valid;
    if (!batch_mul.is_valid) {
        return result;
    }
    cursor = batch_mul.end;
    result.end = cursor;

    result.aggregate_ok = validate_fast_full_verify_aggregate_fp(builder, after_accumulate);
    result.cursors_at_end_ok = cursors_equal(cursor, cursor_after_fast_aggregate(after_accumulate));

    // Range-scoped count (not a raw total): a total-count comparison would break once default_io (built after
    // this stage in the orchestrator) adds its own gates to the same builder before this validator runs.
    const auto all_squeezes = recursion_helpers::find_all_transcript_squeeze_gates(builder);
    size_t squeezes_in_range = 0;
    for (const size_t gate_idx : all_squeezes) {
        if (gate_idx >= after_accumulate.arith && gate_idx < cursor.arith) {
            ++squeezes_in_range;
        }
    }
    result.squeeze_count_ok = squeezes_in_range == FAST_IPA_FULL_VERIFY_SQUEEZE_COUNT;

    result.is_valid = result.claim_hash_ok && result.generator_challenge_ok && result.transcript_rounds_ok
                      && result.reduce_finish_msm_ok && result.gzero_svec_ok && result.batch_mul_check_ok
                      && result.aggregate_ok && result.squeeze_count_ok && result.cursors_at_end_ok;
    return result;
}

template <typename CircuitBuilder>
IpaFullVerifyValidationResult validate_ipa_full_verify_stepped_production(CircuitBuilder& builder,
                                                                          const BlockCursor& after_accumulate,
                                                                          size_t ipa_log_n)
{
    IpaFullVerifyValidationResult result;
    if (ipa_log_n != rollup_honk_test_config::PRODUCTION_IPA_LOG_N) {
        return result;
    }

    BlockCursor cursor = after_accumulate;

    auto claim_hash = validate_claim_hash(builder, cursor);
    result.claim_hash_ok = claim_hash.is_valid;
    if (!claim_hash.is_valid) {
        return result;
    }
    cursor = claim_hash.end;

    auto generator_challenge = validate_generator_challenge(builder, cursor);
    result.generator_challenge_ok = generator_challenge.is_valid;
    if (!generator_challenge.is_valid) {
        return result;
    }
    cursor = generator_challenge.end;

    result.transcript_rounds_ok = true;
    for (size_t round = 0; round < ipa_log_n; ++round) {
        auto transcript_round = validate_transcript_round(builder, cursor);
        if (!transcript_round.is_valid) {
            result.transcript_rounds_ok = false;
            return result;
        }
        cursor = transcript_round.end;
    }

    auto reduce_finish = validate_production_reduce_finish_msm(builder, cursor);
    result.reduce_finish_msm_ok = reduce_finish.is_valid;
    if (!reduce_finish.is_valid) {
        return result;
    }
    cursor = reduce_finish.end;

    auto gzero_svec = RollupHonkIpaGZeroSVecValidation::validate_gzero_svec_rounds(builder, cursor, ipa_log_n);
    result.gzero_svec_ok = gzero_svec.is_valid;
    if (!gzero_svec.is_valid) {
        return result;
    }
    cursor = gzero_svec.end;

    auto batch_mul = validate_production_gzero_batch_mul_check(builder, cursor);
    result.batch_mul_check_ok = batch_mul.is_valid;
    if (!batch_mul.is_valid) {
        return result;
    }
    cursor = batch_mul.end;
    result.end = cursor;

    result.aggregate_ok = validate_production_full_verify_aggregate_fp(builder, after_accumulate);
    result.cursors_at_end_ok = cursors_equal(cursor, cursor_after_production_aggregate(after_accumulate));

    // Range-scoped count (not a raw total): a total-count comparison would break once default_io (built after
    // this stage in the orchestrator) adds its own gates to the same builder before this validator runs.
    const auto all_squeezes = recursion_helpers::find_all_transcript_squeeze_gates(builder);
    size_t squeezes_in_range = 0;
    for (const size_t gate_idx : all_squeezes) {
        if (gate_idx >= after_accumulate.arith && gate_idx < cursor.arith) {
            ++squeezes_in_range;
        }
    }
    result.squeeze_count_ok = squeezes_in_range == IPA_FULL_VERIFY_SQUEEZE_COUNT;

    result.is_valid = result.claim_hash_ok && result.generator_challenge_ok && result.transcript_rounds_ok
                      && result.reduce_finish_msm_ok && result.gzero_svec_ok && result.batch_mul_check_ok
                      && result.aggregate_ok && result.squeeze_count_ok && result.cursors_at_end_ok;
    return result;
}

template <typename CircuitBuilder>
IpaFullVerifyValidationResult validate_ipa_full_verify(CircuitBuilder& builder,
                                                       const BlockCursor& after_accumulate,
                                                       size_t ipa_log_n = bb::CONST_ECCVM_LOG_N)
{
    if (ipa_log_n == RollupHonkIpaGZeroSVecValidation::FAST_IPA_LOG_N) {
        return validate_ipa_full_verify_stepped_fast(builder, after_accumulate, ipa_log_n);
    }
    return validate_ipa_full_verify_stepped_production(builder, after_accumulate, ipa_log_n);
}

} // namespace RollupHonkIpaFullVerifyValidation

#pragma once

// ROOT_ROLLUP_HONK IPA::accumulate validation (before full_verify_recursive).
//
// Fingerprints from root_rollup_honk_ipa_accumulate_analysis.txt
// (RollupHonkIpaAccumulateTests.RootRollupHonkIpaAccumulateFunctionAnalysis).
//
// Baseline: 2× ROOT_ROLLUP_HONK opcodes, valid RollupIO proofs, HasZK=false, log_n=28.

#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_helper.hpp"
#include "barretenberg/noir_programs_boomerang_values/poseidon2s_helpers.hpp"
#include <cstddef>

namespace RollupHonkIpaAccumulateValidation {

constexpr size_t BLOCK_IDX_ARITHMETIC = 2;
constexpr size_t BLOCK_IDX_ELLIPTIC = 4;
constexpr size_t BLOCK_IDX_MEMORY = 5;
constexpr size_t BLOCK_IDX_NNF = 6;
constexpr size_t BLOCK_IDX_POSEIDON2_EXT = 7;
constexpr size_t BLOCK_IDX_POSEIDON2_INT = 8;

static constexpr size_t IPA_ACCUMULATE_SQUEEZE_COUNT = 30; // cursor-migrate; was 33 pre-fork

// ReduceVerify_Nested0_ClaimHash
static constexpr recursion_helpers::FunctionFingerprint NESTED0_CLAIM_HASH_ARITH = {
    6, 0xe8365a5992224457ULL, 0xe8365a5992224457ULL, 6
};

// ReduceVerify_Nested0_Body
static constexpr recursion_helpers::FunctionFingerprint NESTED0_BODY_ARITH = {
    9122, 0x8f0d1455f62d96adULL, 0x157e213dd3987de1ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint NESTED0_BODY_ELLIPTIC = {
    2814, 0xa80bcd343fb54115ULL, 0xfc55a94957e58800ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint NESTED0_BODY_MEMORY = {
    2560, 0xd57d77a9715cfae9ULL, 0x5490822c07ca729bULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint NESTED0_BODY_NNF = {
    1093, 0x8532e80b0fef3fa6ULL, 0x4ca8f8fee77ef19fULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint NESTED0_BODY_POSEIDON2_EXT = {
    320, 0xd66e384960826081ULL, 0xcad8bf43f7002afcULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint NESTED0_BODY_POSEIDON2_INT = {
    1824, 0xfeae5f9d5c27d251ULL, 0x29624fd269a550deULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};

// ReduceVerify_Nested1_ClaimHash (same as nested0 claim hash)
static constexpr recursion_helpers::FunctionFingerprint NESTED1_CLAIM_HASH_ARITH = NESTED0_CLAIM_HASH_ARITH;

// ReduceVerify_Nested1_Body (arith gate count differs; other blocks match nested0)
static constexpr recursion_helpers::FunctionFingerprint NESTED1_BODY_ARITH = {
    9049, 0xb999fccc4ccea6c6ULL, 0xfad14ffc959fbfcbULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint NESTED1_BODY_ELLIPTIC = NESTED0_BODY_ELLIPTIC;
static constexpr recursion_helpers::FunctionFingerprint NESTED1_BODY_MEMORY = NESTED0_BODY_MEMORY;
static constexpr recursion_helpers::FunctionFingerprint NESTED1_BODY_NNF = NESTED0_BODY_NNF;
static constexpr recursion_helpers::FunctionFingerprint NESTED1_BODY_POSEIDON2_EXT = NESTED0_BODY_POSEIDON2_EXT;
static constexpr recursion_helpers::FunctionFingerprint NESTED1_BODY_POSEIDON2_INT = NESTED0_BODY_POSEIDON2_INT;

// AccumulationGlue
static constexpr recursion_helpers::FunctionFingerprint ACCUMULATION_GLUE_ARITH = {
    1861, 0x54b6283c06479365ULL, 0x12cb4f49260377e2ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint ACCUMULATION_GLUE_ELLIPTIC = {
    336, 0x64f61050dca98d38ULL, 0xfd76e6ae9ede9cb9ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint ACCUMULATION_GLUE_MEMORY = {
    80, 0xd57d77a9715cfae9ULL, 0x8554366e1f03100dULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint ACCUMULATION_GLUE_NNF = {
    1455, 0x8532e80b0fef3fa6ULL, 0x249b1c42f23bdfccULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint ACCUMULATION_GLUE_POSEIDON2_EXT = {
    230, 0xd66e384960826081ULL, 0x71942cb1ced692efULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint ACCUMULATION_GLUE_POSEIDON2_INT = {
    1311, 0xfeae5f9d5c27d251ULL, 0x895d7afb919867fbULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};

// IpaAccumulate aggregate (baseline -> after accumulate)
static constexpr recursion_helpers::FunctionFingerprint ACCUMULATE_ARITH = {
    20044, 0x973c7bdfa2868b7fULL, 0xc6ddfce5d4d472e4ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint ACCUMULATE_ELLIPTIC = {
    5964, 0xa80bcd343fb54115ULL, 0x286057eeb58b49a9ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint ACCUMULATE_MEMORY = {
    5200, 0xd57d77a9715cfae9ULL, 0x491b179437dea119ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint ACCUMULATE_NNF = {
    3641, 0x8532e80b0fef3fa6ULL, 0x11e8a70edcc10ab6ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint ACCUMULATE_POSEIDON2_EXT = {
    870, 0xd66e384960826081ULL, 0x6aa95ac45935764aULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint ACCUMULATE_POSEIDON2_INT = {
    4959, 0xfeae5f9d5c27d251ULL, 0xdc97756ddcd6bc4aULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};

struct BlockCursor {
    size_t arith = 0;
    size_t elliptic = 0;
    size_t memory = 0;
    size_t nnf = 0;
    size_t poseidon2_ext = 0;
    size_t poseidon2_int = 0;
};

inline size_t snapshot_block_size(const recursion_helpers::BlockSnapshot& snapshot, size_t block_idx)
{
    return block_idx < snapshot.sizes.size() ? snapshot.sizes[block_idx] : 0;
}

inline BlockCursor block_cursor_from_snapshot(const recursion_helpers::BlockSnapshot& snapshot)
{
    return BlockCursor{
        .arith = snapshot_block_size(snapshot, BLOCK_IDX_ARITHMETIC),
        .elliptic = snapshot_block_size(snapshot, BLOCK_IDX_ELLIPTIC),
        .memory = snapshot_block_size(snapshot, BLOCK_IDX_MEMORY),
        .nnf = snapshot_block_size(snapshot, BLOCK_IDX_NNF),
        .poseidon2_ext = snapshot_block_size(snapshot, BLOCK_IDX_POSEIDON2_EXT),
        .poseidon2_int = snapshot_block_size(snapshot, BLOCK_IDX_POSEIDON2_INT),
    };
}

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

template <typename CircuitBuilder>
StageValidationResult validate_nested0_claim_hash(CircuitBuilder& builder, const BlockCursor& previous)
{
    StageValidationResult result;
    result.end = previous;
    result.end.arith += NESTED0_CLAIM_HASH_ARITH.gate_count;
    result.is_valid =
        matches_block_fingerprint(builder, builder.blocks.arithmetic, previous.arith, NESTED0_CLAIM_HASH_ARITH);
    return result;
}

template <typename CircuitBuilder>
StageValidationResult validate_nested0_body(CircuitBuilder& builder, const BlockCursor& previous)
{
    StageValidationResult result;
    result.end.arith = previous.arith + NESTED0_BODY_ARITH.gate_count;
    result.end.elliptic = previous.elliptic + NESTED0_BODY_ELLIPTIC.gate_count;
    result.end.memory = previous.memory + NESTED0_BODY_MEMORY.gate_count;
    result.end.nnf = previous.nnf + NESTED0_BODY_NNF.gate_count;
    result.end.poseidon2_ext = previous.poseidon2_ext + NESTED0_BODY_POSEIDON2_EXT.gate_count;
    result.end.poseidon2_int = previous.poseidon2_int + NESTED0_BODY_POSEIDON2_INT.gate_count;

    result.is_valid =
        matches_block_fingerprint(builder, builder.blocks.arithmetic, previous.arith, NESTED0_BODY_ARITH) &&
        matches_block_fingerprint(builder, builder.blocks.elliptic, previous.elliptic, NESTED0_BODY_ELLIPTIC) &&
        matches_block_fingerprint(builder, builder.blocks.memory, previous.memory, NESTED0_BODY_MEMORY) &&
        matches_block_fingerprint(builder, builder.blocks.nnf, previous.nnf, NESTED0_BODY_NNF) &&
        matches_block_fingerprint(
            builder, poseidon2_helpers::poseidon2_external_block(builder), previous.poseidon2_ext, NESTED0_BODY_POSEIDON2_EXT) &&
        matches_block_fingerprint(
            builder, poseidon2_helpers::poseidon2_internal_block(builder), previous.poseidon2_int, NESTED0_BODY_POSEIDON2_INT);
    return result;
}

template <typename CircuitBuilder>
StageValidationResult validate_nested1_claim_hash(CircuitBuilder& builder, const BlockCursor& previous)
{
    StageValidationResult result;
    result.end = previous;
    result.end.arith += NESTED1_CLAIM_HASH_ARITH.gate_count;
    result.is_valid =
        matches_block_fingerprint(builder, builder.blocks.arithmetic, previous.arith, NESTED1_CLAIM_HASH_ARITH);
    return result;
}

template <typename CircuitBuilder>
StageValidationResult validate_nested1_body(CircuitBuilder& builder, const BlockCursor& previous)
{
    StageValidationResult result;
    result.end.arith = previous.arith + NESTED1_BODY_ARITH.gate_count;
    result.end.elliptic = previous.elliptic + NESTED1_BODY_ELLIPTIC.gate_count;
    result.end.memory = previous.memory + NESTED1_BODY_MEMORY.gate_count;
    result.end.nnf = previous.nnf + NESTED1_BODY_NNF.gate_count;
    result.end.poseidon2_ext = previous.poseidon2_ext + NESTED1_BODY_POSEIDON2_EXT.gate_count;
    result.end.poseidon2_int = previous.poseidon2_int + NESTED1_BODY_POSEIDON2_INT.gate_count;

    result.is_valid =
        matches_block_fingerprint(builder, builder.blocks.arithmetic, previous.arith, NESTED1_BODY_ARITH) &&
        matches_block_fingerprint(builder, builder.blocks.elliptic, previous.elliptic, NESTED1_BODY_ELLIPTIC) &&
        matches_block_fingerprint(builder, builder.blocks.memory, previous.memory, NESTED1_BODY_MEMORY) &&
        matches_block_fingerprint(builder, builder.blocks.nnf, previous.nnf, NESTED1_BODY_NNF) &&
        matches_block_fingerprint(
            builder, poseidon2_helpers::poseidon2_external_block(builder), previous.poseidon2_ext, NESTED1_BODY_POSEIDON2_EXT) &&
        matches_block_fingerprint(
            builder, poseidon2_helpers::poseidon2_internal_block(builder), previous.poseidon2_int, NESTED1_BODY_POSEIDON2_INT);
    return result;
}

template <typename CircuitBuilder>
StageValidationResult validate_accumulation_glue(CircuitBuilder& builder, const BlockCursor& previous)
{
    StageValidationResult result;
    result.end.arith = previous.arith + ACCUMULATION_GLUE_ARITH.gate_count;
    result.end.elliptic = previous.elliptic + ACCUMULATION_GLUE_ELLIPTIC.gate_count;
    result.end.memory = previous.memory + ACCUMULATION_GLUE_MEMORY.gate_count;
    result.end.nnf = previous.nnf + ACCUMULATION_GLUE_NNF.gate_count;
    result.end.poseidon2_ext = previous.poseidon2_ext + ACCUMULATION_GLUE_POSEIDON2_EXT.gate_count;
    result.end.poseidon2_int = previous.poseidon2_int + ACCUMULATION_GLUE_POSEIDON2_INT.gate_count;

    result.is_valid =
        matches_block_fingerprint(builder, builder.blocks.arithmetic, previous.arith, ACCUMULATION_GLUE_ARITH) &&
        matches_block_fingerprint(builder, builder.blocks.elliptic, previous.elliptic, ACCUMULATION_GLUE_ELLIPTIC) &&
        matches_block_fingerprint(builder, builder.blocks.memory, previous.memory, ACCUMULATION_GLUE_MEMORY) &&
        matches_block_fingerprint(builder, builder.blocks.nnf, previous.nnf, ACCUMULATION_GLUE_NNF) &&
        matches_block_fingerprint(
            builder, poseidon2_helpers::poseidon2_external_block(builder), previous.poseidon2_ext, ACCUMULATION_GLUE_POSEIDON2_EXT) &&
        matches_block_fingerprint(
            builder, poseidon2_helpers::poseidon2_internal_block(builder), previous.poseidon2_int, ACCUMULATION_GLUE_POSEIDON2_INT);
    return result;
}

struct IpaAccumulateValidationResult {
    bool is_valid = false;
    bool nested0_claim_hash_ok = false;
    bool nested0_body_ok = false;
    bool nested1_claim_hash_ok = false;
    bool nested1_body_ok = false;
    bool accumulation_glue_ok = false;
    bool aggregate_ok = false;
    bool squeeze_count_ok = false;
    BlockCursor end{};
};

template <typename CircuitBuilder>
IpaAccumulateValidationResult validate_ipa_accumulate(CircuitBuilder& builder, const BlockCursor& after_opcodes)
{
    IpaAccumulateValidationResult result;
    BlockCursor cursor = after_opcodes;

    auto nested0_claim_hash = validate_nested0_claim_hash(builder, cursor);
    result.nested0_claim_hash_ok = nested0_claim_hash.is_valid;
    if (!nested0_claim_hash.is_valid) {
        return result;
    }
    cursor = nested0_claim_hash.end;

    auto nested0_body = validate_nested0_body(builder, cursor);
    result.nested0_body_ok = nested0_body.is_valid;
    if (!nested0_body.is_valid) {
        return result;
    }
    cursor = nested0_body.end;

    auto nested1_claim_hash = validate_nested1_claim_hash(builder, cursor);
    result.nested1_claim_hash_ok = nested1_claim_hash.is_valid;
    if (!nested1_claim_hash.is_valid) {
        return result;
    }
    cursor = nested1_claim_hash.end;

    auto nested1_body = validate_nested1_body(builder, cursor);
    result.nested1_body_ok = nested1_body.is_valid;
    if (!nested1_body.is_valid) {
        return result;
    }
    cursor = nested1_body.end;

    auto accumulation_glue = validate_accumulation_glue(builder, cursor);
    result.accumulation_glue_ok = accumulation_glue.is_valid;
    if (!accumulation_glue.is_valid) {
        return result;
    }
    cursor = accumulation_glue.end;
    result.end = cursor;

    const BlockCursor baseline = after_opcodes;
    result.aggregate_ok =
        matches_block_fingerprint(builder, builder.blocks.arithmetic, baseline.arith, ACCUMULATE_ARITH) &&
        matches_block_fingerprint(builder, builder.blocks.elliptic, baseline.elliptic, ACCUMULATE_ELLIPTIC) &&
        matches_block_fingerprint(builder, builder.blocks.memory, baseline.memory, ACCUMULATE_MEMORY) &&
        matches_block_fingerprint(builder, builder.blocks.nnf, baseline.nnf, ACCUMULATE_NNF) &&
        matches_block_fingerprint(
            builder, poseidon2_helpers::poseidon2_external_block(builder), baseline.poseidon2_ext, ACCUMULATE_POSEIDON2_EXT) &&
        matches_block_fingerprint(
            builder, poseidon2_helpers::poseidon2_internal_block(builder), baseline.poseidon2_int, ACCUMULATE_POSEIDON2_INT);

    // Count only squeezes whose gate index falls within this stage's own range. A raw total-count comparison
    // would break once this validator runs after later stages (full_verify, default_io) have already added
    // their own squeeze gates to the same builder, since it counts every squeeze in the whole circuit.
    const auto all_squeezes = recursion_helpers::find_all_transcript_squeeze_gates(builder);
    size_t squeezes_in_range = 0;
    for (const size_t gate_idx : all_squeezes) {
        if (gate_idx >= baseline.arith && gate_idx < cursor.arith) {
            ++squeezes_in_range;
        }
    }
    result.squeeze_count_ok = squeezes_in_range == IPA_ACCUMULATE_SQUEEZE_COUNT;

    result.is_valid = result.nested0_claim_hash_ok && result.nested0_body_ok && result.nested1_claim_hash_ok &&
                      result.nested1_body_ok && result.accumulation_glue_ok && result.aggregate_ok &&
                      result.squeeze_count_ok;
    return result;
}

template <typename CircuitBuilder>
IpaAccumulateValidationResult validate_ipa_accumulate(CircuitBuilder& builder,
                                                      const recursion_helpers::BlockSnapshot& after_opcodes)
{
    return validate_ipa_accumulate(builder, block_cursor_from_snapshot(after_opcodes));
}

} // namespace RollupHonkIpaAccumulateValidation

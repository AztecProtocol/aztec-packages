#pragma once

// GZero s_vec round validation.
// Fast (log_n=12) fingerprints from root_rollup_honk_ipa_fast_rounds_analysis.txt;
// production (log_n=15) extends the same arrays with rounds 12-14 from
// root_rollup_honk_ipa_production_rounds_analysis.txt.
//
// The per-round gate count is log_n-independent (unit + delta*(2^round-1)) and the per-round
// structural full_hash is identical across log_n for a given round index (rounds 0-11 match the
// fast artifact exactly), so a single 15-entry table serves both the fast and production paths.

#include "barretenberg/constants.hpp"
#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_helper.hpp"
#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_validation/ROLLUP_HONK/rollup_honk_ipa_accumulate_verification.hpp"
#include "barretenberg/noir_programs_boomerang_values/sha256_circuit_helpers.hpp"
#include <array>
#include <cstddef>

namespace RollupHonkIpaGZeroSVecValidation {

using BlockCursor = RollupHonkIpaAccumulateValidation::BlockCursor;

static constexpr size_t FAST_IPA_LOG_N = 12;
// Largest supported log_n (production ROOT rollup IPA uses CONST_ECCVM_LOG_N = 15).
static constexpr size_t MAX_IPA_LOG_N = bb::CONST_ECCVM_LOG_N;

// Round-0 unit sizes from FullVerify_GZero_SVecRound_0 dump.
static constexpr size_t ARITH_U = 10;
static constexpr size_t ARITH_DELTA = 14; // gates(1) - gates(0) = 24 - 10
static constexpr size_t NNF_U = 19;
static constexpr size_t NNF_DELTA = 16; // gates(1) - gates(0) = 35 - 19

static constexpr recursion_helpers::FunctionFingerprint SVEC_ROUND_0_ARITH = {
    10, 0xb579408c47f2f3aeULL, 0xb579408c47f2f3aeULL, 10
};
static constexpr recursion_helpers::FunctionFingerprint SVEC_ROUND_0_NNF = {
    19, 0xe00d85e7d030911eULL, 0xe00d85e7d030911eULL, 19
};

// Per-round segment full_hash (delta gates added in that round). Rounds 0-11 are shared with the
// fast log_n=12 artifact; rounds 12-14 come from root_rollup_honk_ipa_production_rounds_analysis.txt
// (log_n=15) — same structural hash function, values confirmed identical for the overlapping rounds.
static constexpr std::array<size_t, MAX_IPA_LOG_N> ARITH_FULL_HASH = { {
    0xb579408c47f2f3aeULL,
    0xeab2ea70aafabb77ULL,
    0x9255ec1857fe1a5fULL,
    0x4a7c80f89f330003ULL,
    0xb407fd5f74153e03ULL,
    0xa8386cc47d404f29ULL,
    0x97e50a917f10a216ULL,
    0x02ef9c0d9116a63ULL,
    0x7167a0a82e6d328eULL,
    0x89dabb7a1d38da4dULL,
    0xf542b23647eb401fULL,
    0xba42af76bcedfde3ULL,
    0x10ba68458a785665ULL,
    0x180d8f9182464dbeULL,
    0x45a570f7a973d08dULL,
} };

static constexpr std::array<size_t, MAX_IPA_LOG_N> NNF_FULL_HASH = { {
    0xe00d85e7d030911eULL,
    0xe5d54bc1744640d2ULL,
    0x13202bb2e14d943fULL,
    0x3678cbce41e1a445ULL,
    0xf970513ca7f477a5ULL,
    0xcc8969bb11e876d7ULL,
    0xa201ea7b80beafd8ULL,
    0x7e0e922f70754311ULL,
    0x8cd2305625ebc93eULL,
    0xd35a32e79cf2a84bULL,
    0x7b68d8b412e7e5ccULL,
    0xc41387719f370e8ULL,
    0x27e62306cff85781ULL,
    0xfa1f4d1715e64940ULL,
    0xa0d77859e55326ecULL,
} };

constexpr size_t svec_round_gate_count(size_t unit_gates, size_t delta_gates, size_t round_index)
{
    return unit_gates + delta_gates * ((size_t{ 1 } << round_index) - 1);
}

constexpr size_t expected_arith_gate_count(size_t round_index)
{
    return svec_round_gate_count(ARITH_U, ARITH_DELTA, round_index);
}

constexpr size_t expected_nnf_gate_count(size_t round_index)
{
    return svec_round_gate_count(NNF_U, NNF_DELTA, round_index);
}

template <typename CircuitBuilder>
size_t compute_block_full_hash(CircuitBuilder& builder, size_t block_idx, size_t start, size_t gate_count)
{
    if (gate_count == 0) {
        return 0;
    }
    const size_t end = start + gate_count;
    auto& block = builder.blocks.get()[block_idx];
    if (block_idx == RollupHonkIpaAccumulateValidation::BLOCK_IDX_ARITHMETIC) {
        return recursion_helpers::calculate_hash_arithmetic_block(builder, start, end);
    }
    return sha256_helpers::compute_selector_hash(0, block, start, end - 1);
}

struct GZeroSVecRoundsValidationResult {
    bool is_valid = false;
    size_t rounds_validated = 0;
    BlockCursor end{};
};

template <typename CircuitBuilder>
GZeroSVecRoundsValidationResult validate_gzero_svec_rounds(CircuitBuilder& builder,
                                                           BlockCursor cursor,
                                                           size_t ipa_log_n)
{
    GZeroSVecRoundsValidationResult result;
    if (ipa_log_n == 0 || ipa_log_n > MAX_IPA_LOG_N) {
        return result;
    }

    for (size_t round = 0; round < ipa_log_n; ++round) {
        const size_t arith_gates = expected_arith_gate_count(round);
        const size_t nnf_gates = expected_nnf_gate_count(round);

        if (round == 0) {
            if (!recursion_helpers::matches_fingerprint_at(
                    builder, builder.blocks.arithmetic, cursor.arith, SVEC_ROUND_0_ARITH)
                || !recursion_helpers::matches_fingerprint_at(
                    builder, builder.blocks.nnf, cursor.nnf, SVEC_ROUND_0_NNF)) {
                return result;
            }
        } else {
            const size_t arith_hash = compute_block_full_hash(
                builder, RollupHonkIpaAccumulateValidation::BLOCK_IDX_ARITHMETIC, cursor.arith, arith_gates);
            const size_t nnf_hash =
                compute_block_full_hash(builder, RollupHonkIpaAccumulateValidation::BLOCK_IDX_NNF, cursor.nnf, nnf_gates);
            if (arith_hash != ARITH_FULL_HASH[round] || nnf_hash != NNF_FULL_HASH[round]) {
                return result;
            }
        }

        cursor.arith += arith_gates;
        cursor.nnf += nnf_gates;
        result.rounds_validated = round + 1;
    }

    result.end = cursor;
    result.is_valid = result.rounds_validated == ipa_log_n;
    return result;
}

} // namespace RollupHonkIpaGZeroSVecValidation

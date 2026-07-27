#pragma once

#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_validation/ROLLUP_HONK/rollup_honk_ipa_accumulate_verification.hpp"
#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_validation/ROLLUP_HONK/rollup_honk_ipa_full_verify_verification.hpp"
#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_validation/ROLLUP_HONK/rollup_honk_ipa_test_config.hpp"
#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_validation/ROLLUP_HONK/rollup_honk_root_opcodes_verification.hpp"
#include <cstddef>

namespace RollupHonkIpaFinalizeValidation {

using BlockCursor = RollupHonkIpaAccumulateValidation::BlockCursor;

// DefaultIO finalize after full IPA verification (pairing points public).
static constexpr recursion_helpers::FunctionFingerprint DEFAULT_IO_ARITH = {
    48, 0x7314e4744cd39f1cULL, 0xe3053e29548533b7ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint DEFAULT_IO_NNF = {
    52, 0xea7878474fb57b58ULL, 0xb04373768ce8d877ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};

struct DefaultIOFinalizeValidationResult {
    bool is_valid = false;
    bool arith_ok = false;
    bool nnf_ok = false;
    BlockCursor end{};
};

template <typename CircuitBuilder>
DefaultIOFinalizeValidationResult validate_default_io_finalize(CircuitBuilder& builder,
                                                               const BlockCursor& after_full_verify)
{
    DefaultIOFinalizeValidationResult result;
    result.end = after_full_verify;
    result.end.arith += DEFAULT_IO_ARITH.gate_count;
    result.end.nnf += DEFAULT_IO_NNF.gate_count;

    result.arith_ok = recursion_helpers::matches_fingerprint_at(
        builder, builder.blocks.arithmetic, after_full_verify.arith, DEFAULT_IO_ARITH);
    result.nnf_ok =
        recursion_helpers::matches_fingerprint_at(builder, builder.blocks.nnf, after_full_verify.nnf, DEFAULT_IO_NNF);
    result.is_valid = result.arith_ok && result.nnf_ok;
    return result;
}

// Combined per-block gate-count delta contributed by the two ROOT_ROLLUP_HONK opcodes and by IPA
// finalize (accumulate -> full_verify[production log_n=15 stepped] -> DefaultIO) respectively.
// Pinned from the RootOpcodesAggregate / RootFinalize sections of
// root_rollup_honk_opcodes_analysis.txt / root_rollup_honk_ipa_analysis.txt (dumps of the real,
// create_circuit-built ROOT_ROLLUP_HONK circuit). Used to derive the `before_opcodes` BlockSnapshot
// from a fully-finalized production builder, where no snapshot was captured during construction —
// the production analyzer only ever sees the circuit after create_circuit has already run finalize().
struct RootRollupBlockDelta {
    size_t arith;
    size_t elliptic;
    size_t memory;
    size_t nnf;
    size_t poseidon2_ext;
    size_t poseidon2_int;
};

static constexpr RootRollupBlockDelta ROOT_ROLLUP_OPCODES_DELTA = { 650174, 0, 36890, 354220, 4020, 22914 };
static constexpr RootRollupBlockDelta ROOT_ROLLUP_FINALIZE_DELTA = { 1372592, 1057572, 7760, 529103, 1190, 6783 };

/**
 * @brief Derive the `after_opcodes` BlockSnapshot (before IPA finalize) from a fully-built
 * ROOT_ROLLUP_HONK builder, by subtracting the fixed finalize delta from the live final block sizes.
 */
template <typename CircuitBuilder>
recursion_helpers::BlockSnapshot derive_root_rollup_after_opcodes(CircuitBuilder& builder)
{
    auto snapshot = recursion_helpers::BlockSnapshot::capture(builder);
    using RollupHonkIpaAccumulateValidation::BLOCK_IDX_ARITHMETIC;
    using RollupHonkIpaAccumulateValidation::BLOCK_IDX_ELLIPTIC;
    using RollupHonkIpaAccumulateValidation::BLOCK_IDX_MEMORY;
    using RollupHonkIpaAccumulateValidation::BLOCK_IDX_NNF;
    using RollupHonkIpaAccumulateValidation::BLOCK_IDX_POSEIDON2_EXT;
    using RollupHonkIpaAccumulateValidation::BLOCK_IDX_POSEIDON2_INT;

    snapshot.sizes[BLOCK_IDX_ARITHMETIC] -= ROOT_ROLLUP_FINALIZE_DELTA.arith;
    snapshot.sizes[BLOCK_IDX_ELLIPTIC] -= ROOT_ROLLUP_FINALIZE_DELTA.elliptic;
    snapshot.sizes[BLOCK_IDX_MEMORY] -= ROOT_ROLLUP_FINALIZE_DELTA.memory;
    snapshot.sizes[BLOCK_IDX_NNF] -= ROOT_ROLLUP_FINALIZE_DELTA.nnf;
    snapshot.sizes[BLOCK_IDX_POSEIDON2_EXT] -= ROOT_ROLLUP_FINALIZE_DELTA.poseidon2_ext;
    snapshot.sizes[BLOCK_IDX_POSEIDON2_INT] -= ROOT_ROLLUP_FINALIZE_DELTA.poseidon2_int;
    return snapshot;
}

/**
 * @brief Derive the `before_opcodes` BlockSnapshot from a fully-built ROOT_ROLLUP_HONK builder.
 *
 * The production analyzer (StaticAnalyzerAcir) only ever observes the builder after create_circuit has
 * already run both opcodes and finalize() — there is no hook to capture a snapshot mid-construction.
 * Since ROOT_ROLLUP_HONK's structural shape is fixed (pinned by every fingerprint in this validation
 * suite), `before_opcodes` can be recovered by subtracting the two known, fixed deltas from the live
 * final block sizes instead.
 */
template <typename CircuitBuilder>
recursion_helpers::BlockSnapshot derive_root_rollup_before_opcodes(CircuitBuilder& builder)
{
    auto snapshot = derive_root_rollup_after_opcodes(builder);
    using RollupHonkIpaAccumulateValidation::BLOCK_IDX_ARITHMETIC;
    using RollupHonkIpaAccumulateValidation::BLOCK_IDX_ELLIPTIC;
    using RollupHonkIpaAccumulateValidation::BLOCK_IDX_MEMORY;
    using RollupHonkIpaAccumulateValidation::BLOCK_IDX_NNF;
    using RollupHonkIpaAccumulateValidation::BLOCK_IDX_POSEIDON2_EXT;
    using RollupHonkIpaAccumulateValidation::BLOCK_IDX_POSEIDON2_INT;

    snapshot.sizes[BLOCK_IDX_ARITHMETIC] -= ROOT_ROLLUP_OPCODES_DELTA.arith;
    snapshot.sizes[BLOCK_IDX_ELLIPTIC] -= ROOT_ROLLUP_OPCODES_DELTA.elliptic;
    snapshot.sizes[BLOCK_IDX_MEMORY] -= ROOT_ROLLUP_OPCODES_DELTA.memory;
    snapshot.sizes[BLOCK_IDX_NNF] -= ROOT_ROLLUP_OPCODES_DELTA.nnf;
    snapshot.sizes[BLOCK_IDX_POSEIDON2_EXT] -= ROOT_ROLLUP_OPCODES_DELTA.poseidon2_ext;
    snapshot.sizes[BLOCK_IDX_POSEIDON2_INT] -= ROOT_ROLLUP_OPCODES_DELTA.poseidon2_int;
    return snapshot;
}

struct RootRollupIpaFinalizeValidationResult {
    bool is_valid = false;
    RollupHonkRootOpcodesValidation::RootRollupOpcodesValidationResult opcodes;
    RollupHonkIpaAccumulateValidation::IpaAccumulateValidationResult accumulate;
    RollupHonkIpaFullVerifyValidation::IpaFullVerifyValidationResult full_verify;
    DefaultIOFinalizeValidationResult default_io;
    BlockCursor end{};
};

template <typename FF, typename CircuitBuilder>
RootRollupIpaFinalizeValidationResult validate_root_rollup_ipa_finalize(
    CircuitBuilder& builder,
    cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
    const acir_format::RecursionConstraint& constraint0,
    const acir_format::RecursionConstraint& constraint1,
    const recursion_helpers::BlockSnapshot& before_opcodes,
    const recursion_helpers::BlockSnapshot& after_opcodes,
    size_t ipa_log_n = bb::CONST_ECCVM_LOG_N,
    bool validate_opcodes = false,
    const BlockCursor* fast_after_accumulate = nullptr)
{
    RootRollupIpaFinalizeValidationResult result;

    if (validate_opcodes) {
        BlockCursor opcode_cursor = RollupHonkIpaAccumulateValidation::block_cursor_from_snapshot(before_opcodes);
        result.opcodes = RollupHonkRootOpcodesValidation::validate_root_rollup_opcodes<FF>(
            builder, analyzer, constraint0, constraint1, opcode_cursor, after_opcodes);
        if (!result.opcodes.is_valid) {
            return result;
        }
    }

    if (fast_after_accumulate != nullptr) {
        result.accumulate.is_valid = true;
        result.accumulate.end = *fast_after_accumulate;
    } else if (validate_opcodes) {
        // Chain off the cursor the opcode0/opcode1/aggregate fingerprint checks just produced, instead
        // of independently re-deriving a start position from the externally-supplied `after_opcodes`
        // snapshot. This makes accumulate validation actually depend on opcodes having validated clean.
        result.accumulate = RollupHonkIpaAccumulateValidation::validate_ipa_accumulate(builder, result.opcodes.end);
        if (!result.accumulate.is_valid) {
            return result;
        }
    } else {
        result.accumulate = RollupHonkIpaAccumulateValidation::validate_ipa_accumulate(builder, after_opcodes);
        if (!result.accumulate.is_valid) {
            return result;
        }
    }

    result.full_verify =
        RollupHonkIpaFullVerifyValidation::validate_ipa_full_verify(builder, result.accumulate.end, ipa_log_n);
    if (!result.full_verify.is_valid) {
        return result;
    }

    result.default_io = validate_default_io_finalize(builder, result.full_verify.end);
    if (!result.default_io.is_valid) {
        return result;
    }

    result.end = result.default_io.end;
    result.is_valid = (!validate_opcodes || result.opcodes.is_valid) && result.accumulate.is_valid &&
                      result.full_verify.is_valid && result.default_io.is_valid;
    return result;
}

/**
 * @brief ACIR-first entry point: validate ROOT_ROLLUP_HONK IPA finalize from a fully-built production
 * builder, deriving `before_opcodes`/`after_opcodes` internally instead of requiring the caller to
 * construct `BlockSnapshot`s by hand. This is the entry point production code (and any other caller
 * driving the real, `create_circuit`-built ROOT_ROLLUP_HONK shape) should use — it satisfies the
 * `RecursionConstraint[]` + `StaticAnalyzer` contract directly.
 *
 * Only valid for the production circuit shape (the one `ROOT_ROLLUP_OPCODES_DELTA`/
 * `ROOT_ROLLUP_FINALIZE_DELTA` are pinned against, i.e. production `ipa_log_n`). Callers exercising a
 * different shape (e.g. the fast `log_n=12` test path, which captures snapshots mid-construction
 * instead of deriving them post-hoc) must keep using `validate_root_rollup_ipa_finalize` directly with
 * their own captured `BlockSnapshot`s.
 */
template <typename FF, typename CircuitBuilder>
RootRollupIpaFinalizeValidationResult validate_root_rollup_ipa_finalize_from_acir(
    CircuitBuilder& builder,
    cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
    const acir_format::RecursionConstraint& constraint0,
    const acir_format::RecursionConstraint& constraint1,
    bool validate_opcodes = true)
{
    const auto before_opcodes = derive_root_rollup_before_opcodes(builder);
    const auto after_opcodes = derive_root_rollup_after_opcodes(builder);
    return validate_root_rollup_ipa_finalize<FF>(builder,
                                                 analyzer,
                                                 constraint0,
                                                 constraint1,
                                                 before_opcodes,
                                                 after_opcodes,
                                                 bb::CONST_ECCVM_LOG_N,
                                                 validate_opcodes);
}

} // namespace RollupHonkIpaFinalizeValidation

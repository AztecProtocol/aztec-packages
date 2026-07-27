#pragma once

// ROOT_ROLLUP_HONK 2× honk recursion opcodes validation (before IPA finalize).
//
// Fingerprints from root_rollup_honk_opcodes_analysis.txt

#include "barretenberg/boomerang_value_detection/graph.hpp"
#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_helper.hpp"
#include "barretenberg/noir_programs_boomerang_values/poseidon2s_helpers.hpp"
#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_validation/ROLLUP_HONK/rollup_honk_ipa_accumulate_verification.hpp"
#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_validation/ROLLUP_HONK/rollup_honk_recursion_oink_verification.hpp"
#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_validation/ROLLUP_HONK/rollup_honk_vk_deserialize_verification.hpp"
#include <cstddef>
#include <set>
#include <vector>

namespace RollupHonkRootOpcodesValidation {

using BlockCursor = RollupHonkIpaAccumulateValidation::BlockCursor;

// ── Phase 2: ACIR witness -> gate discovery (segment-scoped opcode entry anchor) ──
//
// Independently locates where a given opcode's vk_hash (constraint.key_hash) verification
// actually begins, via a structural Oink-squeeze scan + witness-gate lookup -- NOT via the
// pinned per-block gate-count deltas `validate_root_rollup_opcode0/1` use to walk the cursor.
// Used by `validate_root_rollup_opcodes` to cross-check the positionally-derived entry cursor
// against this witness-derived anchor before trusting it.
struct RootRollupVkHashAnchor {
    bool is_valid = false;
    size_t arith_start = SIZE_MAX;
    size_t arith_end = SIZE_MAX;
    size_t poseidon2_ext_start = SIZE_MAX;
    size_t poseidon2_int_start = SIZE_MAX;
};

template <typename FF, typename CircuitBuilder>
RootRollupVkHashAnchor discover_rollup_vk_hash_in_segment(CircuitBuilder& builder,
                                                          cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                                          const acir_format::RecursionConstraint& constraint,
                                                          const recursion_helpers::BlockSnapshot& segment_start,
                                                          const recursion_helpers::BlockSnapshot& segment_end,
                                                          size_t opcode_index = 0)
{
    using namespace RollupHonkRecursionValidation::Oink;
    const auto& PRE_ETA_ARITH = pre_eta_arith(opcode_index);
    const auto& PREAMBLE_ARITH = preamble_arith(opcode_index);

    RootRollupVkHashAnchor result;
    if (constraint.key.empty()) {
        return result;
    }

    auto snapshot_at = [](const recursion_helpers::BlockSnapshot& snapshot, size_t idx) {
        return idx < snapshot.sizes.size() ? snapshot.sizes[idx] : 0;
    };

    const size_t min_arith = snapshot_at(segment_start, RollupHonkIpaAccumulateValidation::BLOCK_IDX_ARITHMETIC);
    const size_t max_arith = snapshot_at(segment_end, RollupHonkIpaAccumulateValidation::BLOCK_IDX_ARITHMETIC);
    const size_t min_ext = snapshot_at(segment_start, RollupHonkIpaAccumulateValidation::BLOCK_IDX_POSEIDON2_EXT);
    const size_t min_int = snapshot_at(segment_start, RollupHonkIpaAccumulateValidation::BLOCK_IDX_POSEIDON2_INT);
    const size_t nnf_start = snapshot_at(segment_start, RollupHonkIpaAccumulateValidation::BLOCK_IDX_NNF);

    // Cursor-migrate: no Oink squeezes. Anchor VkDeserialize via key[3], then Oink at region_end.
    const auto vd = RollupHonkRecursionValidation::VkDeserialize::validate_vk_deserialize_region<FF>(
        builder, analyzer, constraint, opcode_index, nnf_start);
    if (!vd.is_valid || vd.arith_region_start == SIZE_MAX) {
        return result;
    }
    if (vd.arith_region_start < min_arith || vd.region_end > max_arith) {
        return result;
    }

    const size_t arith_start = vd.region_end; // Oink / PRE_ETA begins immediately after VkDeserialize (ROOT)
    if (arith_start + PRE_ETA_ARITH.gate_count > max_arith) {
        return result;
    }

    auto& arith = builder.blocks.arithmetic;
    if (!recursion_helpers::matches_fingerprint_at(builder, arith, arith_start, PRE_ETA_ARITH)) {
        return result;
    }

    result.is_valid = true;
    result.arith_start = arith_start;
    result.arith_end = arith_start + PRE_ETA_ARITH.gate_count - PREAMBLE_ARITH.gate_count;

    auto& poseidon2_external = poseidon2_helpers::poseidon2_external_block(builder);
    auto& poseidon2_internal = poseidon2_helpers::poseidon2_internal_block(builder);
    std::vector<size_t> external_candidate_gates = recursion_helpers::collect_real_witness_gates_in_block<FF>(
        builder, analyzer, builder.real_variable_index[constraint.key_hash], poseidon2_external);
    for (size_t gate_idx : external_candidate_gates) {
        if (gate_idx >= min_ext && (result.poseidon2_ext_start == SIZE_MAX || gate_idx < result.poseidon2_ext_start)) {
            result.poseidon2_ext_start = gate_idx;
        }
    }
    if (result.poseidon2_ext_start != SIZE_MAX) {
        const std::set<size_t> linked_internal_gates =
            recursion_helpers::collect_linked_gates(builder,
                                                    analyzer,
                                                    poseidon2_external,
                                                    result.poseidon2_ext_start,
                                                    result.poseidon2_ext_start + 1,
                                                    poseidon2_internal);
        auto internal_start = recursion_helpers::find_fingerprint_range_at_or_after_any_gate(
            builder, poseidon2_internal, linked_internal_gates, PREAMBLE_POSEIDON2_INT);
        if (internal_start.has_value() && *internal_start >= min_int) {
            result.poseidon2_int_start = *internal_start;
        }
    }

    return result;
}

static constexpr recursion_helpers::FunctionFingerprint OPCODE0_ARITH = {
    309654, 0x13758fb36b5eef17ULL, 0xc9efdd7c80f20834ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint OPCODE0_MEMORY = {
    18445, 0xd57d77a9715cfae9ULL, 0xb9510f81f6022274ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint OPCODE0_NNF = {
    168098, 0x8532e80b0fef3fa6ULL, 0xbfd87e4e1595ad34ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint OPCODE0_POSEIDON2_EXT = {
    1980, 0xd66e384960826081ULL, 0x833130dab87437aULL, 20
};
static constexpr recursion_helpers::FunctionFingerprint OPCODE0_POSEIDON2_INT = {
    11286, 0xfeae5f9d5c27d251ULL, 0x6bfee911dcd9c77ULL, 20
};

static constexpr recursion_helpers::FunctionFingerprint OPCODE1_ARITH = {
    340520, 0x2dce00dfaa8b2f7aULL, 0x2589b70804f8495cULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint OPCODE1_MEMORY = OPCODE0_MEMORY;
static constexpr recursion_helpers::FunctionFingerprint OPCODE1_NNF = {
    186122, 0x8532e80b0fef3fa6ULL, 0x54cae1b7801c53aeULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint OPCODE1_POSEIDON2_EXT = {
    2040, 0xd66e384960826081ULL, 0x4cc295fb8ad86ba5ULL, 20
};
static constexpr recursion_helpers::FunctionFingerprint OPCODE1_POSEIDON2_INT = {
    11628, 0xfeae5f9d5c27d251ULL, 0xfb4ff3eb40ee8a24ULL, 20
};

static constexpr recursion_helpers::FunctionFingerprint OPCODES_AGGREGATE_ARITH = {
    650174, 0x13758fb36b5eef17ULL, 0xdfcc4409579b2930ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint OPCODES_AGGREGATE_MEMORY = {
    36890, 0xd57d77a9715cfae9ULL, 0x2d759b36ebc64e16ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint OPCODES_AGGREGATE_NNF = {
    354220, 0x8532e80b0fef3fa6ULL, 0x963e8d4dad0f1dbcULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint OPCODES_AGGREGATE_POSEIDON2_EXT = {
    4020, 0xd66e384960826081ULL, 0x9d428b9e7bb9ebbaULL, 20
};
static constexpr recursion_helpers::FunctionFingerprint OPCODES_AGGREGATE_POSEIDON2_INT = {
    22914, 0xfeae5f9d5c27d251ULL, 0x63d1b4270c1ad044ULL, 20
};

struct OpcodeValidationResult {
    bool is_valid = false;
    BlockCursor end{};
};

struct RootRollupOpcodesValidationResult {
    bool is_valid = false;
    bool opcode0_ok = false;
    bool opcode1_ok = false;
    bool aggregate_ok = false;
    bool cursors_at_end_ok = false;
    bool entry_anchors_ok = false;
    BlockCursor end{};
};

// Builds a minimal BlockSnapshot view of a BlockCursor for feeding into
// `discover_rollup_vk_hash_in_segment`, which only reads BLOCK_IDX_ARITHMETIC /
// BLOCK_IDX_POSEIDON2_EXT / BLOCK_IDX_POSEIDON2_INT off its segment bounds.
inline recursion_helpers::BlockSnapshot cursor_to_snapshot_bound(const BlockCursor& cursor)
{
    recursion_helpers::BlockSnapshot snapshot;
    snapshot.sizes.assign(9, 0);
    snapshot.sizes[RollupHonkIpaAccumulateValidation::BLOCK_IDX_ARITHMETIC] = cursor.arith;
    snapshot.sizes[RollupHonkIpaAccumulateValidation::BLOCK_IDX_POSEIDON2_EXT] = cursor.poseidon2_ext;
    snapshot.sizes[RollupHonkIpaAccumulateValidation::BLOCK_IDX_POSEIDON2_INT] = cursor.poseidon2_int;
    return snapshot;
}

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

inline BlockCursor block_cursor_from_snapshot(const recursion_helpers::BlockSnapshot& snapshot)
{
    return RollupHonkIpaAccumulateValidation::block_cursor_from_snapshot(snapshot);
}

inline BlockCursor cursor_after_opcodes_aggregate(const BlockCursor& start)
{
    return BlockCursor{
        .arith = start.arith + OPCODES_AGGREGATE_ARITH.gate_count,
        .elliptic = start.elliptic,
        .memory = start.memory + OPCODES_AGGREGATE_MEMORY.gate_count,
        .nnf = start.nnf + OPCODES_AGGREGATE_NNF.gate_count,
        .poseidon2_ext = start.poseidon2_ext + OPCODES_AGGREGATE_POSEIDON2_EXT.gate_count,
        .poseidon2_int = start.poseidon2_int + OPCODES_AGGREGATE_POSEIDON2_INT.gate_count,
    };
}

inline bool cursors_equal(const BlockCursor& a, const BlockCursor& b)
{
    return a.arith == b.arith && a.elliptic == b.elliptic && a.memory == b.memory && a.nnf == b.nnf &&
           a.poseidon2_ext == b.poseidon2_ext && a.poseidon2_int == b.poseidon2_int;
}

template <typename CircuitBuilder>
OpcodeValidationResult validate_root_rollup_opcode0(CircuitBuilder& builder, const BlockCursor& previous)
{
    OpcodeValidationResult result;
    result.end.arith = previous.arith + OPCODE0_ARITH.gate_count;
    result.end.memory = previous.memory + OPCODE0_MEMORY.gate_count;
    result.end.nnf = previous.nnf + OPCODE0_NNF.gate_count;
    result.end.poseidon2_ext = previous.poseidon2_ext + OPCODE0_POSEIDON2_EXT.gate_count;
    result.end.poseidon2_int = previous.poseidon2_int + OPCODE0_POSEIDON2_INT.gate_count;
    result.end.elliptic = previous.elliptic;

    result.is_valid = matches_block_fingerprint(builder, builder.blocks.arithmetic, previous.arith, OPCODE0_ARITH) &&
                      matches_block_fingerprint(builder, builder.blocks.memory, previous.memory, OPCODE0_MEMORY) &&
                      matches_block_fingerprint(builder, builder.blocks.nnf, previous.nnf, OPCODE0_NNF) &&
                      matches_block_fingerprint(
                          builder, poseidon2_helpers::poseidon2_external_block(builder), previous.poseidon2_ext, OPCODE0_POSEIDON2_EXT) &&
                      matches_block_fingerprint(
                          builder, poseidon2_helpers::poseidon2_internal_block(builder), previous.poseidon2_int, OPCODE0_POSEIDON2_INT);
    return result;
}

template <typename CircuitBuilder>
OpcodeValidationResult validate_root_rollup_opcode1(CircuitBuilder& builder, const BlockCursor& previous)
{
    OpcodeValidationResult result;
    result.end.arith = previous.arith + OPCODE1_ARITH.gate_count;
    result.end.memory = previous.memory + OPCODE1_MEMORY.gate_count;
    result.end.nnf = previous.nnf + OPCODE1_NNF.gate_count;
    result.end.poseidon2_ext = previous.poseidon2_ext + OPCODE1_POSEIDON2_EXT.gate_count;
    result.end.poseidon2_int = previous.poseidon2_int + OPCODE1_POSEIDON2_INT.gate_count;
    result.end.elliptic = previous.elliptic;

    result.is_valid = matches_block_fingerprint(builder, builder.blocks.arithmetic, previous.arith, OPCODE1_ARITH) &&
                      matches_block_fingerprint(builder, builder.blocks.memory, previous.memory, OPCODE1_MEMORY) &&
                      matches_block_fingerprint(builder, builder.blocks.nnf, previous.nnf, OPCODE1_NNF) &&
                      matches_block_fingerprint(
                          builder, poseidon2_helpers::poseidon2_external_block(builder), previous.poseidon2_ext, OPCODE1_POSEIDON2_EXT) &&
                      matches_block_fingerprint(
                          builder, poseidon2_helpers::poseidon2_internal_block(builder), previous.poseidon2_int, OPCODE1_POSEIDON2_INT);
    return result;
}

template <typename FF, typename CircuitBuilder>
RootRollupOpcodesValidationResult validate_root_rollup_opcodes(CircuitBuilder& builder,
                                                               cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                                               const acir_format::RecursionConstraint& constraint0,
                                                               const acir_format::RecursionConstraint& constraint1,
                                                               BlockCursor cursor,
                                                               const recursion_helpers::BlockSnapshot& after_opcodes)
{
    RootRollupOpcodesValidationResult result;
    const BlockCursor start = cursor;

    auto opcode0 = validate_root_rollup_opcode0(builder, cursor);
    result.opcode0_ok = opcode0.is_valid;
    if (!opcode0.is_valid) {
        return result;
    }
    cursor = opcode0.end;

    // Witness cross-check: independently confirm the entry cursor for each opcode is exactly
    // where that opcode's own VkDeserialize region (anchored on constraint.key[3], the first
    // commitment witness) actually begins -- not just the pinned per-block gate-count deltas
    // `validate_root_rollup_opcode0/1` use to walk the cursor forward. VkDeserialize is the very
    // first sub-stage of each opcode, so its witness-discovered start must equal the entry cursor
    // exactly (see rollup_honk_vk_deserialize_verification.hpp).
    const auto anchor0 = RollupHonkRecursionValidation::VkDeserialize::validate_vk_deserialize_region<FF>(
        builder, analyzer, constraint0, /*opcode_index=*/0, start.nnf);
    result.entry_anchors_ok = anchor0.is_valid && anchor0.nnf_ok && anchor0.arith_region_start == start.arith;

    const auto anchor1 = RollupHonkRecursionValidation::VkDeserialize::validate_vk_deserialize_region<FF>(
        builder, analyzer, constraint1, /*opcode_index=*/1, cursor.nnf);
    result.entry_anchors_ok =
        result.entry_anchors_ok && anchor1.is_valid && anchor1.nnf_ok && anchor1.arith_region_start == cursor.arith;

    auto opcode1 = validate_root_rollup_opcode1(builder, cursor);
    result.opcode1_ok = opcode1.is_valid;
    if (!opcode1.is_valid) {
        return result;
    }
    cursor = opcode1.end;
    result.end = cursor;

    result.aggregate_ok =
        matches_block_fingerprint(builder, builder.blocks.arithmetic, start.arith, OPCODES_AGGREGATE_ARITH) &&
        matches_block_fingerprint(builder, builder.blocks.memory, start.memory, OPCODES_AGGREGATE_MEMORY) &&
        matches_block_fingerprint(builder, builder.blocks.nnf, start.nnf, OPCODES_AGGREGATE_NNF) &&
        matches_block_fingerprint(
            builder, poseidon2_helpers::poseidon2_external_block(builder), start.poseidon2_ext, OPCODES_AGGREGATE_POSEIDON2_EXT) &&
        matches_block_fingerprint(
            builder, poseidon2_helpers::poseidon2_internal_block(builder), start.poseidon2_int, OPCODES_AGGREGATE_POSEIDON2_INT);

    const BlockCursor expected_end = block_cursor_from_snapshot(after_opcodes);
    result.cursors_at_end_ok = cursors_equal(cursor, expected_end);

    result.is_valid = result.opcode0_ok && result.opcode1_ok && result.aggregate_ok && result.cursors_at_end_ok &&
                      result.entry_anchors_ok;
    return result;
}

} // namespace RollupHonkRootOpcodesValidation

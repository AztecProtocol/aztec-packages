#pragma once

// ROLLUP_HONK / ROOT_ROLLUP_HONK Phase 3 orchestrator.
//
// ROLLUP_HONK (single opcode): Honk VkDeserialize@1709 + residual → Oink cursor → … → Rollup Output.
// ROOT_ROLLUP_HONK: cursor_from(starts, opcode_index) — Rollup VkDeserialize(OP0/OP1) → Oink@region_end
//                   → … → Output; caller supplies multi-block handoff after prior opcode.

#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_validation/HONK/honk_recursion_validation.hpp"
#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_validation/ROLLUP_HONK/rollup_honk_ipa_accumulate_verification.hpp"
#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_validation/ROLLUP_HONK/rollup_honk_ipa_verification.hpp"
#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_validation/ROLLUP_HONK/rollup_honk_recursion_oink_verification.hpp"
#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_validation/ROLLUP_HONK/rollup_honk_recursion_output_verification.hpp"
#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_validation/ROLLUP_HONK/rollup_honk_shplemini_kzg_commitments_verification.hpp"
#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_validation/ROLLUP_HONK/rollup_honk_vk_deserialize_verification.hpp"
#include <algorithm>
#include <cstddef>
#include <set>
#include <vector>

namespace RollupHonkRecursionValidation {

static constexpr size_t TOTAL_SQUEEZE_GATES = 1; // Output recursion_separator only; not for stage slicing

using BlockCursor = RollupHonkIpaAccumulateValidation::BlockCursor;

inline std::vector<size_t> squeezes_in_window(const std::vector<size_t>& all_squeezes, size_t lo, size_t hi)
{
    std::vector<size_t> out;
    for (size_t g : all_squeezes) {
        if (g >= lo && g < hi) {
            out.push_back(g);
        }
    }
    return out;
}

struct RollupHonkRecursionValidationResult {
    bool is_valid = false;
    IO::RollupProofLayout layout;
    HonkRecursionValidation::HonkRecursionValidationResult honk;
    Output::OutputValidationResult output;
    ProofCommitments::ShpleminiKzgCommitmentsResult shplemini_kzg_commitments;
    IPA::IpaTailValidationResult ipa;
    VkDeserialize::VkDeserializeValidationResult rollup_vk_deserialize;

    bool arith_coverage_valid = false;
    bool poseidon2_ext_coverage_valid = false;
    bool poseidon2_int_coverage_valid = false;
    bool nnf_coverage_valid = false;
    bool memory_coverage_valid = false;
    bool all_valid = false;

    // Ends after this opcode's Output / KZG — handoff into the next ROOT opcode.
    BlockCursor handoff_end{};
};

inline HonkRecursionValidation::ArithBoundaries compute_arith_boundaries_from_oink_start(
    size_t oink_arith_start = Oink::ARITH_START)
{
    HonkRecursionValidation::ArithBoundaries b;
    b.oink = oink_arith_start;
    b.preproc = oink_arith_start + Oink::ARITH_GATES;
    b.sumcheck = b.preproc + HonkRecursionValidation::PREPROCESSOR_ARITH_GATES;
    b.shplemini = b.sumcheck + HonkRecursionValidation::SUMCHECK_ARITH_GATES;
    b.kzg = b.shplemini + HonkRecursionValidation::SHPLEMINI_ARITH_GATES;
    return b;
}

inline void mirror_output_into_honk(RollupHonkRecursionValidationResult& result)
{
    result.honk.output.arith_start = result.output.arith_start;
    result.honk.output.arith_end = result.output.arith_end;
    result.honk.output.nnf_start = result.output.nnf_start;
    result.honk.output.nnf_end = result.output.nnf_end;
    result.honk.output.poseidon2_ext_start = result.output.poseidon2_ext_start;
    result.honk.output.poseidon2_ext_end = result.output.poseidon2_ext_end;
    result.honk.output.poseidon2_int_start = result.output.poseidon2_int_start;
    result.honk.output.poseidon2_int_end = result.output.poseidon2_int_end;
    result.honk.output.arith_ok = result.output.arith_ok;
    result.honk.output.nnf_ok = result.output.nnf_ok;
    result.honk.output.poseidon2_ext_ok = result.output.poseidon2_ext_ok;
    result.honk.output.poseidon2_int_ok = result.output.poseidon2_int_ok;
    result.honk.output.is_valid = result.output.is_valid;
}

template <typename FF, typename CircuitBuilder>
void set_coverage_and_handoff(RollupHonkRecursionValidationResult& result, CircuitBuilder& builder)
{
    result.honk.arith_cursor_end = result.output.arith_end;
    result.honk.arith_region_end = builder.blocks.arithmetic.size();
    result.honk.poseidon2_ext_cursor_end = result.output.poseidon2_ext_end;
    result.honk.poseidon2_ext_region_end = poseidon2_helpers::poseidon2_external_block(builder).size();
    result.honk.poseidon2_int_cursor_end = result.output.poseidon2_int_end;
    result.honk.poseidon2_int_region_end = poseidon2_helpers::poseidon2_internal_block(builder).size();
    result.honk.nnf_cursor_end = result.output.nnf_end;
    result.honk.nnf_region_end = builder.blocks.nnf.size();
    result.honk.memory_cursor_end = result.honk.kzg.memory_end;
    result.honk.memory_region_end = builder.blocks.memory.size();

    result.arith_coverage_valid = result.honk.arith_cursor_end == result.honk.arith_region_end;
    result.poseidon2_ext_coverage_valid = result.honk.poseidon2_ext_cursor_end == result.honk.poseidon2_ext_region_end;
    result.poseidon2_int_coverage_valid = result.honk.poseidon2_int_cursor_end == result.honk.poseidon2_int_region_end;
    result.nnf_coverage_valid = result.honk.nnf_cursor_end == result.honk.nnf_region_end;
    result.memory_coverage_valid = result.honk.memory_cursor_end == result.honk.memory_region_end;

    result.honk.arith_coverage_valid = result.arith_coverage_valid;
    result.honk.poseidon2_ext_coverage_valid = result.poseidon2_ext_coverage_valid;
    result.honk.poseidon2_int_coverage_valid = result.poseidon2_int_coverage_valid;
    result.honk.nnf_coverage_valid = result.nnf_coverage_valid;
    result.honk.memory_coverage_valid = result.memory_coverage_valid;

    result.handoff_end.arith = result.output.arith_end;
    result.handoff_end.nnf = result.output.nnf_end;
    result.handoff_end.poseidon2_ext = result.output.poseidon2_ext_end;
    result.handoff_end.poseidon2_int = result.output.poseidon2_int_end;
    result.handoff_end.memory = result.honk.kzg.memory_end;
    result.handoff_end.elliptic = 0;

    result.honk.all_valid = result.output.is_valid;
    result.honk.is_valid = result.honk.all_valid;
    result.all_valid = result.honk.is_valid && result.ipa.is_valid;
    result.is_valid = result.all_valid;
}

template <typename FF, typename CircuitBuilder, typename RecursiveFlavor>
RollupHonkRecursionValidationResult validate_rollup_honk_recursion_cursor(
    CircuitBuilder& builder,
    cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
    const acir_format::RecursionConstraint& constraint,
    size_t log_n)
{
    RollupHonkRecursionValidationResult result;
    result.layout = IO::validate_rollup_proof_layout<RecursiveFlavor>(constraint, log_n);
    if (!result.layout.is_valid) {
        return result;
    }

    // Same VkDeserialize + residual as bare HONK (Phase 2 pin identical).
    result.honk.vk_deserialize =
        HonkRecursionValidation::VkDeserialize::validate_vk_deserialize_region<FF>(builder, analyzer, constraint);
    if (!result.honk.vk_deserialize.is_valid) {
        return result;
    }

    result.honk.oink = Oink::validate_oink_cursor<FF>(builder,
                                                      analyzer,
                                                      result.honk.vk_deserialize.arith_end,
                                                      result.honk.vk_deserialize.nnf_end,
                                                      /*poseidon2_ext_start=*/0,
                                                      /*poseidon2_int_start=*/0,
                                                      &constraint,
                                                      &constraint.proof,
                                                      /*opcode_index=*/0);
    if (!result.honk.oink.is_valid) {
        return result;
    }

    result.honk.preprocessor =
        HonkRecursionValidation::Preprocessor::validate_preprocessor<FF>(builder, analyzer, result.honk.oink);
    if (!result.honk.preprocessor.is_valid) {
        return result;
    }

    result.honk.sumcheck =
        HonkRecursionValidation::Sumcheck::validate_sumcheck<FF>(builder, analyzer, result.honk.preprocessor);
    if (!result.honk.sumcheck.is_valid) {
        return result;
    }

    result.honk.shplemini =
        HonkRecursionValidation::Shplemini::validate_shplemini<FF>(builder, analyzer, result.honk.sumcheck);
    if (!result.honk.shplemini.is_valid) {
        return result;
    }

    result.honk.kzg = HonkRecursionValidation::KZG::validate_kzg<FF>(builder, analyzer, result.honk.shplemini);
    if (!result.honk.kzg.is_valid) {
        return result;
    }

    result.output = Output::validate_output<FF>(builder, analyzer, result.honk.kzg);
    mirror_output_into_honk(result);
    if (!result.output.is_valid) {
        return result;
    }

    result.shplemini_kzg_commitments =
        ProofCommitments::validate_shplemini_kzg_commitments<RecursiveFlavor>(builder, analyzer, constraint, log_n);

    result.ipa = IPA::validate_ipa_tail_and_claim<RecursiveFlavor>(builder, constraint, log_n);
    if (!result.ipa.is_valid) {
        return result;
    }

    set_coverage_and_handoff<FF>(result, builder);
    return result;
}

/**
 * @brief ROOT (and multi-opcode) cursor chain with explicit multi-block starts.
 *
 * No Honk setup residual — Oink begins at VkDeserialize arith region_end (ROOT legacy).
 * When starts.arith == 0 and opcode_index == 0, arith handoff equality is skipped (discover via key[3]).
 */
template <typename FF, typename CircuitBuilder, typename RecursiveFlavor>
RollupHonkRecursionValidationResult validate_rollup_honk_recursion_cursor_from(
    CircuitBuilder& builder,
    cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
    const acir_format::RecursionConstraint& constraint,
    size_t log_n,
    size_t opcode_index,
    const BlockCursor& starts)
{
    RollupHonkRecursionValidationResult result;
    result.layout = IO::validate_rollup_proof_layout<RecursiveFlavor>(constraint, log_n);
    if (!result.layout.is_valid) {
        return result;
    }

    result.rollup_vk_deserialize =
        VkDeserialize::validate_vk_deserialize_region<FF>(builder, analyzer, constraint, opcode_index, starts.nnf);
    if (!result.rollup_vk_deserialize.is_valid || !result.rollup_vk_deserialize.nnf_ok) {
        return result;
    }
    // Opcode 0 with zero arith handoff: accept discovered VkDeserialize start. Later opcodes must match.
    if (!(opcode_index == 0 && starts.arith == 0) && result.rollup_vk_deserialize.arith_region_start != starts.arith) {
        return result;
    }

    result.honk.oink = Oink::validate_oink_cursor<FF>(builder,
                                                      analyzer,
                                                      result.rollup_vk_deserialize.region_end,
                                                      result.rollup_vk_deserialize.nnf_end,
                                                      starts.poseidon2_ext,
                                                      starts.poseidon2_int,
                                                      &constraint,
                                                      &constraint.proof,
                                                      opcode_index);
    if (!result.honk.oink.is_valid) {
        return result;
    }

    result.honk.preprocessor =
        HonkRecursionValidation::Preprocessor::validate_preprocessor<FF>(builder, analyzer, result.honk.oink);
    if (!result.honk.preprocessor.is_valid) {
        return result;
    }

    result.honk.sumcheck =
        HonkRecursionValidation::Sumcheck::validate_sumcheck<FF>(builder, analyzer, result.honk.preprocessor);
    if (!result.honk.sumcheck.is_valid) {
        return result;
    }

    result.honk.shplemini =
        HonkRecursionValidation::Shplemini::validate_shplemini<FF>(builder, analyzer, result.honk.sumcheck);
    if (!result.honk.shplemini.is_valid) {
        return result;
    }

    result.honk.kzg = HonkRecursionValidation::KZG::validate_kzg<FF>(
        builder, analyzer, result.honk.shplemini, opcode_index, starts.memory);
    if (!result.honk.kzg.is_valid) {
        return result;
    }

    result.output = Output::validate_output<FF>(builder, analyzer, result.honk.kzg);
    mirror_output_into_honk(result);
    if (!result.output.is_valid) {
        return result;
    }

    // Informative only (stale SINGLE_COMMITMENT receive-FP).
    result.shplemini_kzg_commitments =
        ProofCommitments::validate_shplemini_kzg_commitments<RecursiveFlavor>(builder, analyzer, constraint, log_n);

    result.ipa = IPA::validate_ipa_tail_and_claim<RecursiveFlavor>(builder, constraint, log_n);
    if (!result.ipa.is_valid) {
        return result;
    }

    set_coverage_and_handoff<FF>(result, builder);
    return result;
}

// Legacy squeeze-window path — unused by dispatcher after cursor-migrate (kept for reference).
template <typename FF, typename CircuitBuilder, typename RecursiveFlavor>
RollupHonkRecursionValidationResult validate_rollup_honk_recursion_squeeze_legacy(
    CircuitBuilder& builder,
    cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
    const acir_format::RecursionConstraint& constraint,
    size_t log_n,
    size_t opcode_index)
{
    RollupHonkRecursionValidationResult result;
    result.layout = IO::validate_rollup_proof_layout<RecursiveFlavor>(constraint, log_n);
    if (!result.layout.is_valid) {
        return result;
    }

    auto vk_deserialize =
        VkDeserialize::validate_vk_deserialize_region<FF>(builder, analyzer, constraint, opcode_index);
    if (!vk_deserialize.is_valid) {
        return result;
    }
    const size_t oink_arith_start = vk_deserialize.region_end;
    const size_t preproc_arith_start = oink_arith_start + Oink::arith_gates(opcode_index);
    const size_t sumcheck_arith_start = preproc_arith_start + HonkRecursionValidation::PREPROCESSOR_ARITH_GATES;
    const size_t shplemini_arith_start = sumcheck_arith_start + HonkRecursionValidation::SUMCHECK_ARITH_GATES;
    const size_t kzg_arith_start = shplemini_arith_start + HonkRecursionValidation::SHPLEMINI_ARITH_GATES;
    const size_t kzg_arith_end = kzg_arith_start + HonkRecursionValidation::KZG::arith_total(opcode_index).gate_count;

    auto all_squeezes = recursion_helpers::find_all_transcript_squeeze_gates(builder);

    std::set<size_t> consumed;
    auto rollup_oink = Oink::validate_oink(builder,
                                           analyzer,
                                           oink_arith_start,
                                           squeezes_in_window(all_squeezes, oink_arith_start, preproc_arith_start),
                                           consumed,
                                           constraint,
                                           constraint.proof,
                                           opcode_index);
    result.honk.oink = rollup_oink.base;
    if (!result.honk.oink.is_valid) {
        return result;
    }

    result.honk.preprocessor = HonkRecursionValidation::Preprocessor::validate_preprocessor(
        builder,
        analyzer,
        result.honk.oink,
        squeezes_in_window(all_squeezes, preproc_arith_start, sumcheck_arith_start),
        consumed);
    if (!result.honk.preprocessor.is_valid) {
        return result;
    }

    result.honk.sumcheck = HonkRecursionValidation::Sumcheck::validate_sumcheck(
        builder,
        analyzer,
        result.honk.preprocessor,
        squeezes_in_window(all_squeezes, sumcheck_arith_start, shplemini_arith_start),
        consumed);
    if (!result.honk.sumcheck.is_valid) {
        return result;
    }

    result.honk.shplemini = HonkRecursionValidation::Shplemini::validate_shplemini(
        builder,
        analyzer,
        result.honk.sumcheck,
        squeezes_in_window(all_squeezes, shplemini_arith_start, kzg_arith_start),
        consumed);
    if (!result.honk.shplemini.is_valid) {
        return result;
    }

    result.honk.kzg =
        HonkRecursionValidation::KZG::validate_kzg(builder,
                                                   analyzer,
                                                   result.honk.shplemini,
                                                   squeezes_in_window(all_squeezes, kzg_arith_start, kzg_arith_end),
                                                   consumed,
                                                   opcode_index);
    result.honk.is_valid = result.honk.kzg.is_valid;
    if (!result.honk.is_valid) {
        return result;
    }

    result.shplemini_kzg_commitments =
        ProofCommitments::validate_shplemini_kzg_commitments<RecursiveFlavor>(builder, analyzer, constraint, log_n);
    if (!result.shplemini_kzg_commitments.is_valid) {
        return result;
    }

    result.ipa = IPA::validate_ipa_tail_and_claim<RecursiveFlavor>(builder, constraint, log_n);
    result.is_valid = result.ipa.is_valid && result.honk.is_valid;
    return result;
}

template <typename FF, typename CircuitBuilder, typename RecursiveFlavor>
RollupHonkRecursionValidationResult validate_rollup_honk_recursion(CircuitBuilder& builder,
                                                                   cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                                                   const acir_format::RecursionConstraint& constraint,
                                                                   size_t log_n,
                                                                   size_t opcode_index = 0,
                                                                   const BlockCursor& starts = {})
{
    if (constraint.proof_type == acir_format::PROOF_TYPE::ROOT_ROLLUP_HONK) {
        return validate_rollup_honk_recursion_cursor_from<FF, CircuitBuilder, RecursiveFlavor>(
            builder, analyzer, constraint, log_n, opcode_index, starts);
    }
    // Single ROLLUP_HONK (and any non-ROOT): pin@1709 cursor. Ignore starts / opcode_index.
    return validate_rollup_honk_recursion_cursor<FF, CircuitBuilder, RecursiveFlavor>(
        builder, analyzer, constraint, log_n);
}

} // namespace RollupHonkRecursionValidation

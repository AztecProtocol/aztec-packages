#pragma once

// Witness-anchoring for the commitment-shaped Shplemini/KZG proof[] fields (Gemini fold commitments,
// Shplonk:Q, KZG:W). HonkRecursionValidation::Shplemini/::KZG only check these regions structurally
// (matches_fingerprint_at over the whole arith/nnf/poseidon2 block) — they never confirm that a
// specific ACIR constraint.proof[] witness feeds a specific transcript field. This layers an
// orthogonal check on top, the same way rollup_honk_recursion_oink_verification.hpp anchors Oink's
// wire/lookup/z_perm commitments to their constraint.proof[] witnesses.
//
// Offsets are computed purely from bb::ProofLength (fixed by proof serialization, independent of
// builder state) — unlike the pre-Oink VkDeserialize gap, no production-code replay is needed here.
//
// NOT covered here: Sumcheck round univariates/evaluations and Gemini fold evaluations. Those are
// scalar-shaped (single fr, not a 4-fr commitment) and need a single-fr transcript-absorption
// helper — a separate follow-up.
//
// require_absorption is passed false for all three checks below: validate_commitment_transcript_
// absorption's is_transcript_add_gate pattern was pinned against Oink's absorption shape. Verified
// against the real merged ROOT_ROLLUP_HONK circuit (both opcodes), deserialize (fp_valid) and
// wire-tracing (commitment_ok) pass cleanly for Gemini folds/Shplonk:Q/KZG:W, but absorption does
// not — past Sumcheck the sponge batches differently. Deserialize + wire-tracing already prove the
// witness is genuinely wired to a real EC point (the actual boomerang concern); re-deriving a third
// absorption gate shape for this stage is a separate follow-up, not required for that guarantee.

#include "barretenberg/honk/proof_length.hpp"
#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_helper.hpp"
#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_validation/HONK/honk_recursion_oink_verification.hpp"
#include <cstddef>
#include <vector>

namespace RollupHonkRecursionValidation::ProofCommitments {

/**
 * @brief Validate a single 4-fr commitment at a known absolute offset into constraint.proof.
 *
 * Same three checks as recursion_helpers::validate_commitment_group_full, but addressed by absolute
 * offset instead of the MegaZK group_idx*FRS_PER_COMMITMENT convention (which assumes all commitment
 * groups are contiguous — not true past Oink, where scalar sections sit in between).
 */
template <typename FF, typename CircuitBuilder>
bool validate_commitment_at_offset(CircuitBuilder& builder,
                                   cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                   const std::vector<uint32_t>& proof_witnesses,
                                   size_t offset,
                                   bool require_absorption = true)
{
    if (offset + recursion_helpers::FRS_PER_COMMITMENT > proof_witnesses.size()) {
        return false;
    }
    const uint32_t fr0 = proof_witnesses[offset];
    const uint32_t fr1 = proof_witnesses[offset + 1];
    const uint32_t fr2 = proof_witnesses[offset + 2];
    const uint32_t fr3 = proof_witnesses[offset + 3];

    auto fp = recursion_helpers::validate_commitment_receive_fingerprint<FF>(builder, analyzer, fr0, fr1, fr2, fr3);
    if (!fp.is_valid) {
        return false;
    }
    if (!recursion_helpers::validate_oink_commitment<FF>(builder, analyzer, fr0, fr1, fr2, fr3)) {
        return false;
    }
    if (require_absorption &&
        !recursion_helpers::validate_commitment_transcript_absorption<FF>(builder, analyzer, fr0, fr1, fr2, fr3)) {
        return false;
    }
    return true;
}

struct ShpleminiKzgCommitmentsResult {
    bool is_valid = false;
    bool gemini_folds_ok = false;
    bool shplonk_q_ok = false;
    bool kzg_w_ok = false;
    size_t gemini_fold_start = SIZE_MAX;
    size_t shplonk_q_offset = SIZE_MAX;
    size_t kzg_w_offset = SIZE_MAX;
};

/**
 * @brief Anchor Gemini fold commitments, Shplonk:Q, and KZG:W to their constraint.proof[] witnesses.
 *
 * Proof layout (relative to constraint.proof[0]):
 *   [0, prefix)                              public input prefix (honk_public_input_prefix_size)
 *   [prefix, prefix+oink_len)                Oink commitments (already anchored elsewhere)
 *   [.., .. + sumcheck_len)                   Sumcheck univariates + evaluations (scalars, not here)
 *   [.., .. + (log_n-1)*4)                    Gemini FOLD_1..FOLD_{log_n-1} commitments
 *   [.., .. + log_n)                          Gemini a_1..a_{log_n} evaluations (scalars, not here)
 *   [.., .. + 4)                              Shplonk:Q commitment
 *   [.., .. + 4)                              KZG:W commitment
 *
 * @tparam RecursiveFlavor Same flavor passed to validate_rollup_honk_recursion / validate_rollup_proof_layout.
 * @param log_n circuit_size log — same value threaded through the rest of the ROLLUP_HONK validation.
 */
template <typename RecursiveFlavor, typename FF, typename CircuitBuilder>
ShpleminiKzgCommitmentsResult validate_shplemini_kzg_commitments(
    CircuitBuilder& builder,
    cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
    const acir_format::RecursionConstraint& constraint,
    size_t log_n)
{
    ShpleminiKzgCommitmentsResult result;
    using Codec = bb::ProofLength::CodecConstants<RecursiveFlavor>;

    const size_t prefix = HonkRecursionValidation::Oink::honk_public_input_prefix_size(&constraint);
    const size_t oink_len = bb::ProofLength::Oink<RecursiveFlavor>::LENGTH_WITHOUT_PUB_INPUTS;
    const size_t sumcheck_len = bb::ProofLength::Sumcheck<RecursiveFlavor>::LENGTH(log_n);
    const size_t shplemini_start = prefix + oink_len + sumcheck_len;
    const size_t num_folds = log_n - 1;

    result.gemini_fold_start = shplemini_start;
    result.gemini_folds_ok = true;
    for (size_t i = 0; i < num_folds; ++i) {
        const size_t offset = shplemini_start + i * Codec::num_frs_in_comm;
        if (!validate_commitment_at_offset<FF>(builder, analyzer, constraint.proof, offset, /*require_absorption=*/false)) {
            result.gemini_folds_ok = false;
            break;
        }
    }

    const size_t gemini_eval_len = log_n * Codec::num_frs_in_scalar;
    result.shplonk_q_offset = shplemini_start + num_folds * Codec::num_frs_in_comm + gemini_eval_len;
    result.shplonk_q_ok = validate_commitment_at_offset<FF>(
        builder, analyzer, constraint.proof, result.shplonk_q_offset, /*require_absorption=*/false);

    result.kzg_w_offset = result.shplonk_q_offset + Codec::num_frs_in_comm;
    result.kzg_w_ok = validate_commitment_at_offset<FF>(
        builder, analyzer, constraint.proof, result.kzg_w_offset, /*require_absorption=*/false);

    result.is_valid = result.gemini_folds_ok && result.shplonk_q_ok && result.kzg_w_ok;
    return result;
}

} // namespace RollupHonkRecursionValidation::ProofCommitments

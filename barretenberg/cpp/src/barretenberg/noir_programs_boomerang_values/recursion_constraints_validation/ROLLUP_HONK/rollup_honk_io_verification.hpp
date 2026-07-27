#pragma once
#include "barretenberg/dsl/acir_format/recursion_constraint.hpp"
#include "barretenberg/honk/proof_length.hpp"
#include "barretenberg/honk/types/public_inputs_type.hpp"
#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_validation/HONK/honk_recursion_oink_verification.hpp"
#include <cstddef>

namespace RollupHonkRecursionValidation::IO {

struct RollupProofLayout {
    bool is_valid = false;
    bool proof_type_ok = false;
    bool proof_size_ok = false;
    bool oink_commitments_fit = false;
    bool ipa_tail_ok = false;
    bool full_ipa_verification_allowed = false;
    size_t rollup_public_inputs_start = 0;
    size_t rollup_public_inputs_end = bb::ROLLUP_PUBLIC_INPUTS_SIZE;
    size_t pairing_inputs_start = 0;
    size_t pairing_inputs_end = bb::PAIRING_POINTS_SIZE;
    size_t ipa_claim_start = bb::PAIRING_POINTS_SIZE;
    size_t ipa_claim_end = bb::ROLLUP_PUBLIC_INPUTS_SIZE;
    size_t honk_body_start = bb::ROLLUP_PUBLIC_INPUTS_SIZE;
    size_t honk_body_end = SIZE_MAX;
    size_t ipa_tail_start = SIZE_MAX;
    size_t ipa_tail_end = SIZE_MAX;
};

inline bool is_rollup_honk_proof_type(const acir_format::RecursionConstraint& constraint)
{
    return constraint.proof_type == acir_format::PROOF_TYPE::ROLLUP_HONK ||
           constraint.proof_type == acir_format::PROOF_TYPE::ROOT_ROLLUP_HONK;
}

template <typename RecursiveFlavor>
RollupProofLayout validate_rollup_proof_layout(const acir_format::RecursionConstraint& constraint, size_t log_n)
{
    RollupProofLayout result;
    result.proof_type_ok = is_rollup_honk_proof_type(constraint);
    result.full_ipa_verification_allowed = constraint.proof_type == acir_format::PROOF_TYPE::ROOT_ROLLUP_HONK;

    const size_t honk_body_len = bb::ProofLength::Honk<RecursiveFlavor>::LENGTH_WITHOUT_PUB_INPUTS(log_n);
    result.honk_body_end = result.honk_body_start + honk_body_len;
    result.ipa_tail_start = result.honk_body_end;
    result.ipa_tail_end = result.ipa_tail_start + bb::IPA_PROOF_LENGTH;

    result.proof_size_ok = constraint.proof.size() == result.ipa_tail_end;
    result.oink_commitments_fit = result.honk_body_start + HonkRecursionValidation::Oink::NUM_COMMITMENT_GROUPS *
                                                               recursion_helpers::FRS_PER_COMMITMENT <=
                                  result.honk_body_end;
    result.ipa_tail_ok = constraint.proof.size() >= bb::IPA_PROOF_LENGTH &&
                         constraint.proof.size() - bb::IPA_PROOF_LENGTH == result.ipa_tail_start;
    result.is_valid = result.proof_type_ok && result.proof_size_ok && result.oink_commitments_fit && result.ipa_tail_ok;
    return result;
}

} // namespace RollupHonkRecursionValidation::IO

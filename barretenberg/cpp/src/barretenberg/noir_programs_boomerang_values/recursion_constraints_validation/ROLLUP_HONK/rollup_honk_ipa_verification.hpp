#pragma once

#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_validation/ROLLUP_HONK/rollup_honk_io_verification.hpp"
#include <array>
#include <cstddef>
#include <vector>

namespace RollupHonkRecursionValidation::IPA {

struct IpaTailValidationResult {
    bool is_valid = false;
    bool layout_ok = false;
    bool tail_size_ok = false;
    bool pass_through_ok = false;
    size_t ipa_tail_start = SIZE_MAX;
    size_t ipa_tail_end = SIZE_MAX;
};

inline std::array<bb::fr, bb::GRUMPKIN_OPENING_CLAIM_SIZE> ipa_claim_fields_from_rollup_public_inputs(
    auto& builder, const acir_format::RecursionConstraint& constraint)
{
    std::array<bb::fr, bb::GRUMPKIN_OPENING_CLAIM_SIZE> fields{};
    constexpr size_t start = bb::PAIRING_POINTS_SIZE;
    for (size_t i = 0; i < fields.size(); ++i) {
        fields[i] = builder.get_variable(constraint.proof[start + i]);
    }
    return fields;
}

inline std::vector<bb::fr> ipa_tail_fields(auto& builder,
                                           const acir_format::RecursionConstraint& constraint,
                                           const IO::RollupProofLayout& layout)
{
    std::vector<bb::fr> proof;
    if (layout.ipa_tail_end > constraint.proof.size()) {
        return proof;
    }
    proof.reserve(bb::IPA_PROOF_LENGTH);
    for (size_t i = layout.ipa_tail_start; i < layout.ipa_tail_end; ++i) {
        proof.push_back(builder.get_variable(constraint.proof[i]));
    }
    return proof;
}

inline bool ipa_claim_fields_match_expected(auto& builder,
                                            const acir_format::RecursionConstraint& constraint,
                                            const std::array<bb::fr, bb::GRUMPKIN_OPENING_CLAIM_SIZE>& expected)
{
    const auto actual = ipa_claim_fields_from_rollup_public_inputs(builder, constraint);
    return actual == expected;
}

template <typename RecursiveFlavor, typename CircuitBuilder>
IpaTailValidationResult validate_ipa_tail_and_claim(CircuitBuilder& builder,
                                                    const acir_format::RecursionConstraint& constraint,
                                                    size_t log_n)
{
    IpaTailValidationResult result;
    const auto layout = IO::validate_rollup_proof_layout<RecursiveFlavor>(constraint, log_n);
    result.layout_ok = layout.is_valid;
    result.ipa_tail_start = layout.ipa_tail_start;
    result.ipa_tail_end = layout.ipa_tail_end;
    if (!result.layout_ok) {
        return result;
    }

    auto proof = ipa_tail_fields(builder, constraint, layout);
    result.tail_size_ok = proof.size() == bb::IPA_PROOF_LENGTH;
    if (!result.tail_size_ok) {
        return result;
    }

    // Recursive ROLLUP_HONK carries IPA proof data for deferred verification. No IPA arithmetic gates are created here.
    result.pass_through_ok = true;
    result.is_valid = result.pass_through_ok;
    return result;
}

} // namespace RollupHonkRecursionValidation::IPA

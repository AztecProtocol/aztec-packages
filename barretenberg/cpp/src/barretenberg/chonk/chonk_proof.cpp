// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "barretenberg/chonk/chonk_proof.hpp"
#include "barretenberg/special_public_inputs/special_public_inputs.hpp"

namespace bb {

/**
 * @brief Serialize Chonk Proof
 */
template <bool IsRecursive>
std::vector<typename ChonkProof_<IsRecursive>::FF> ChonkProof_<IsRecursive>::to_field_elements() const
{
    HonkProof proof;

    proof.insert(proof.end(), mega_proof.begin(), mega_proof.end());
    proof.insert(proof.end(), goblin_proof.merge_proof.begin(), goblin_proof.merge_proof.end());
    proof.insert(proof.end(), goblin_proof.eccvm_proof.begin(), goblin_proof.eccvm_proof.end());
    proof.insert(proof.end(), goblin_proof.ipa_proof.begin(), goblin_proof.ipa_proof.end());
    proof.insert(proof.end(), goblin_proof.translator_proof.begin(), goblin_proof.translator_proof.end());
    return proof;
};

/**
 * @brief Split a vector of field elements into ChonkProof components.
 */
template <bool IsRecursive>
ChonkProof_<IsRecursive> ChonkProof_<IsRecursive>::from_field_elements(const std::vector<FF>& fields)
{
    HonkProof mega_proof;
    GoblinProof goblin_proof;

    // Calculate custom public inputs size from total proof size
    BB_ASSERT_GTE(fields.size(), PROOF_LENGTH, "Proof size is less than minimum proof length");
    size_t custom_public_inputs_size = fields.size() - PROOF_LENGTH;

    // Mega proof
    auto start_idx = fields.begin();
    auto end_idx =
        start_idx + static_cast<std::ptrdiff_t>(HIDING_KERNEL_PROOF_LENGTH_WITHOUT_PUBLIC_INPUTS +
                                                bb::HidingKernelIO::PUBLIC_INPUTS_SIZE + custom_public_inputs_size);
    mega_proof.insert(mega_proof.end(), start_idx, end_idx);

    // Merge proof
    start_idx = end_idx;
    end_idx += static_cast<std::ptrdiff_t>(MERGE_PROOF_SIZE);
    goblin_proof.merge_proof.insert(goblin_proof.merge_proof.end(), start_idx, end_idx);

    // ECCVM proof
    start_idx = end_idx;
    end_idx += static_cast<std::ptrdiff_t>(ECCVMFlavor::PROOF_LENGTH_WITHOUT_PUB_INPUTS);
    goblin_proof.eccvm_proof.insert(goblin_proof.eccvm_proof.end(), start_idx, end_idx);

    // IPA proof
    start_idx = end_idx;
    end_idx += static_cast<std::ptrdiff_t>(IPA_PROOF_LENGTH);
    goblin_proof.ipa_proof.insert(goblin_proof.ipa_proof.end(), start_idx, end_idx);

    // Translator proof
    start_idx = end_idx;
    end_idx += static_cast<std::ptrdiff_t>(TranslatorFlavor::PROOF_LENGTH_WITHOUT_PUB_INPUTS);
    goblin_proof.translator_proof.insert(goblin_proof.translator_proof.end(), start_idx, end_idx);

    return ChonkProof_{ std::move(mega_proof), std::move(goblin_proof) };
}

// Explicit template instantiations
template std::vector<bb::fr> ChonkProof_<false>::to_field_elements() const;
template std::vector<stdlib::field_t<UltraCircuitBuilder>> ChonkProof_<true>::to_field_elements() const;

template ChonkProof_<false> ChonkProof_<false>::from_field_elements(const std::vector<bb::fr>& fields);
template ChonkProof_<true> ChonkProof_<true>::from_field_elements(
    const std::vector<stdlib::field_t<UltraCircuitBuilder>>& fields);

} // namespace bb

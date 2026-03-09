// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "barretenberg/chonk/chonk_proof.hpp"
#include "barretenberg/flavor/mega_zk_flavor.hpp"
#include "barretenberg/honk/proof_length.hpp"
#include "barretenberg/special_public_inputs/special_public_inputs.hpp"

namespace bb {

/**
 * @brief Serialize Chonk Proof to a flat vector of field elements.
 */
template <bool IsRecursive>
std::vector<typename ChonkProof_<IsRecursive>::FF> ChonkProof_<IsRecursive>::to_field_elements() const
{
    HonkProof proof;

    proof.insert(proof.end(), mega_zk_proof.begin(), mega_zk_proof.end());
    proof.insert(proof.end(), merge_proof.begin(), merge_proof.end());
    proof.insert(proof.end(), eccvm_proof.begin(), eccvm_proof.end());
    proof.insert(proof.end(), ipa_proof.begin(), ipa_proof.end());
    proof.insert(proof.end(), joint_proof.begin(), joint_proof.end());
    return proof;
};

/**
 * @brief Split a flat vector of field elements into ChonkProof components.
 * @details Uses known fixed sizes for merge/eccvm/ipa proofs, and derives the mega_zk_proof and
 * joint_proof sizes from the total.
 */
template <bool IsRecursive>
ChonkProof_<IsRecursive> ChonkProof_<IsRecursive>::from_field_elements(const std::vector<FF>& fields)
{
    // Fixed-size components
    constexpr size_t merge_size = MERGE_PROOF_SIZE;
    constexpr size_t eccvm_size = ECCVMFlavor::PROOF_LENGTH;
    constexpr size_t ipa_size = IPA_PROOF_LENGTH;

    // MegaZK Oink proof size = oink data + public inputs (HidingKernelIO + custom)
    constexpr size_t mega_zk_oink_without_pub_inputs = ProofLength::Oink<MegaZKFlavor>::LENGTH_WITHOUT_PUB_INPUTS;
    const size_t mega_zk_oink_length = mega_zk_oink_without_pub_inputs + bb::HidingKernelIO::PUBLIC_INPUTS_SIZE;
    // TODO(si): handle custom public inputs properly; for now assume none.

    auto it = fields.begin();

    HonkProof mega_zk_proof(it, it + static_cast<std::ptrdiff_t>(mega_zk_oink_length));
    it += static_cast<std::ptrdiff_t>(mega_zk_oink_length);

    HonkProof merge_proof_out(it, it + static_cast<std::ptrdiff_t>(merge_size));
    it += static_cast<std::ptrdiff_t>(merge_size);

    HonkProof eccvm_proof_out(it, it + static_cast<std::ptrdiff_t>(eccvm_size));
    it += static_cast<std::ptrdiff_t>(eccvm_size);

    HonkProof ipa_proof_out(it, it + static_cast<std::ptrdiff_t>(ipa_size));
    it += static_cast<std::ptrdiff_t>(ipa_size);

    // Remainder is the joint_proof
    HonkProof joint_proof_out(it, fields.end());

    return ChonkProof_{ std::move(mega_zk_proof),
                        std::move(merge_proof_out),
                        std::move(eccvm_proof_out),
                        std::move(ipa_proof_out),
                        std::move(joint_proof_out) };
}

// Explicit template instantiations
template std::vector<bb::fr> ChonkProof_<false>::to_field_elements() const;
template std::vector<stdlib::field_t<UltraCircuitBuilder>> ChonkProof_<true>::to_field_elements() const;

template ChonkProof_<false> ChonkProof_<false>::from_field_elements(const std::vector<bb::fr>& fields);
template ChonkProof_<true> ChonkProof_<true>::from_field_elements(
    const std::vector<stdlib::field_t<UltraCircuitBuilder>>& fields);

} // namespace bb

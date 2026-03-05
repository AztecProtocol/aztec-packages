#include "chonk_batch_verifier.hpp"
#include "barretenberg/commitment_schemes/ipa/ipa.hpp"
#include "barretenberg/commitment_schemes/verification_key.hpp"
#include "barretenberg/eccvm/eccvm_flavor.hpp"

namespace bb {

bool ChonkBatchVerifier::verify(std::span<const Input> inputs)
{
    const size_t num_proofs = inputs.size();
    if (num_proofs == 0) {
        return true;
    }

    // Phase 1: Run all non-IPA verification for each proof, collecting IPA claims
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1651): Consider batching and/or multithreading the
    // non-IPA portion of verification as well. Becomes significant for moderate batch sizes.
    std::vector<OpeningClaim<curve::Grumpkin>> ipa_claims;
    std::vector<std::shared_ptr<NativeTranscript>> ipa_transcripts;
    ipa_claims.reserve(num_proofs);
    ipa_transcripts.reserve(num_proofs);

    for (const auto& input : inputs) {
        ChonkNativeVerifier verifier(input.vk_and_hash);
        auto result = verifier.reduce_to_ipa_claim(input.proof);
        if (!result.all_checks_passed) {
            return false;
        }
        ipa_claims.push_back(result.ipa_claim);
        ipa_transcripts.push_back(std::make_shared<NativeTranscript>(result.ipa_proof));
    }

    // Phase 2: Batch IPA verification with single SRS MSM
    auto ipa_vk = VerifierCommitmentKey<curve::Grumpkin>{ ECCVMFlavor::ECCVM_FIXED_SIZE };
    return IPA<curve::Grumpkin>::batch_reduce_verify(ipa_vk, ipa_claims, ipa_transcripts);
}

} // namespace bb

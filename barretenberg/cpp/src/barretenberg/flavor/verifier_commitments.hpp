// === AUDIT STATUS ===
// internal:    { status: Completed, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/common/zip_view.hpp"

#include <memory>
#include <type_traits>

namespace bb {

template <typename Flavor, typename Commitment, typename = void> struct VerifierCommitmentEntities {
    using Type = typename Flavor::template AllEntities<Commitment>;
};

template <typename Flavor, typename Commitment>
struct VerifierCommitmentEntities<Flavor, Commitment, std::void_t<typename Flavor::NativeFlavor>> {
    using Type = typename Flavor::NativeFlavor::template AllEntities<Commitment>;
};

template <typename Flavor> class VerifierCommitmentsConstructor {
  public:
    using Commitment = typename Flavor::Commitment;
    using VerificationKey = typename Flavor::VerificationKey;
    using WitnessCommitments = typename Flavor::WitnessCommitments;
    using Commitments = typename VerifierCommitmentEntities<Flavor, Commitment>::Type;

    static Commitments construct(const std::shared_ptr<VerificationKey>& verification_key)
    {
        Commitments commitments;
        copy_precomputed(commitments, verification_key);
        return commitments;
    }

    static Commitments construct(const std::shared_ptr<VerificationKey>& verification_key,
                                 const WitnessCommitments& witness_commitments)
    {
        Commitments commitments = construct(verification_key);
        copy_witness(commitments, witness_commitments);
        return commitments;
    }

    static Commitments construct(const std::shared_ptr<VerificationKey>& verification_key,
                                 const WitnessCommitments& witness_commitments,
                                 const Commitment& gemini_masking_commitment)
    {
        Commitments commitments = construct(verification_key, witness_commitments);
        if constexpr (has_gemini_masking()) {
            commitments.gemini_masking_poly() = gemini_masking_commitment;
        }
        return commitments;
    }

  private:
    static constexpr bool has_gemini_masking()
    {
        if constexpr (requires { Flavor::HasGeminiMasking; }) {
            return Flavor::HasGeminiMasking;
        } else {
            return Flavor::HasZK;
        }
    }

    static void copy_precomputed(Commitments& commitments, const std::shared_ptr<VerificationKey>& verification_key)
    {
        for (auto [precomputed, in] : zip_view(commitments.get_precomputed(), verification_key->get_all())) {
            precomputed = in;
        }
    }

    static void copy_witness(Commitments& commitments, const WitnessCommitments& witness_commitments)
    {
        for (auto [witness, in] : zip_view(commitments.get_witness(), witness_commitments.get_all())) {
            witness = in;
        }
        for (auto [shifted, src] : zip_view(commitments.get_shifted(), witness_commitments.get_to_be_shifted())) {
            shifted = src;
        }
    }
};

} // namespace bb

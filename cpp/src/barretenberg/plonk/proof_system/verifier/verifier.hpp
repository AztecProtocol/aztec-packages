#pragma once
#include "../types/proof.hpp"
#include "../types/program_settings.hpp"
#include "../widgets/random_widgets/random_widget.hpp"
#include "barretenberg/transcript/manifest.hpp"
#include "barretenberg/plonk/proof_system/commitment_scheme/commitment_scheme.hpp"

namespace proof_system::plonk {
template <typename program_settings> class VerifierBase {

  public:
    VerifierBase(std::shared_ptr<verification_key> verifier_key = nullptr,
                 const transcript::Manifest& manifest = transcript::Manifest());
    VerifierBase(VerifierBase&& other);
    VerifierBase(const VerifierBase& other) = delete;
    VerifierBase& operator=(const VerifierBase& other) = delete;
    VerifierBase& operator=(VerifierBase&& other);

    bool validate_commitments();
    bool validate_scalars();

    bool verify_proof(const plonk::proof& proof);
    transcript::Manifest manifest;

    std::shared_ptr<verification_key> key;
    std::map<std::string, barretenberg::g1::affine_element> kate_g1_elements;
    std::map<std::string, barretenberg::fr> kate_fr_elements;
    std::unique_ptr<CommitmentScheme> commitment_scheme;
};

extern template class VerifierBase<standard_verifier_settings>;
extern template class VerifierBase<turbo_verifier_settings>;
extern template class VerifierBase<ultra_verifier_settings>;
extern template class VerifierBase<ultra_to_standard_verifier_settings>;
extern template class VerifierBase<ultra_with_keccak_verifier_settings>;

typedef VerifierBase<standard_verifier_settings> Verifier;
typedef VerifierBase<turbo_verifier_settings> TurboVerifier;
typedef VerifierBase<ultra_verifier_settings> UltraVerifier;
typedef VerifierBase<ultra_to_standard_verifier_settings> UltraToStandardVerifier;
typedef VerifierBase<ultra_with_keccak_verifier_settings> UltraWithKeccakVerifier;
} // namespace proof_system::plonk

#include "./goblin_translator_verifier.hpp"
#include "barretenberg/honk/flavor/goblin_translator.hpp"
#include "barretenberg/honk/flavor/standard.hpp"
#include "barretenberg/honk/transcript/transcript.hpp"
#include "barretenberg/honk/utils/power_polynomial.hpp"
#include "barretenberg/numeric/bitop/get_msb.hpp"

using namespace barretenberg;
using namespace proof_system::honk::sumcheck;

namespace proof_system::honk {
template <typename Flavor>
GoblinTranslatorVerifier_<Flavor>::GoblinTranslatorVerifier_(
    std::shared_ptr<typename Flavor::VerificationKey> verifier_key)
    : key(verifier_key)
{}

template <typename Flavor>
GoblinTranslatorVerifier_<Flavor>::GoblinTranslatorVerifier_(GoblinTranslatorVerifier_&& other) noexcept
    : key(std::move(other.key))
    , pcs_verification_key(std::move(other.pcs_verification_key))
{}

template <typename Flavor>
GoblinTranslatorVerifier_<Flavor>& GoblinTranslatorVerifier_<Flavor>::operator=(
    GoblinTranslatorVerifier_&& other) noexcept
{
    key = other.key;
    pcs_verification_key = (std::move(other.pcs_verification_key));
    commitments.clear();
    pcs_fr_elements.clear();
    return *this;
}

/**
 * @brief This function verifies an GoblinTranslator Honk proof for given program settings.
 *
 */
template <typename Flavor> bool GoblinTranslatorVerifier_<Flavor>::verify_proof(const plonk::proof& proof)
{
    using FF = typename Flavor::FF;
    using BF = typename Flavor::BF;
    using GroupElement = typename Flavor::GroupElement;
    using Commitment = typename Flavor::Commitment;
    using PCSParams = typename Flavor::PCSParams;
    using PCS = typename Flavor::PCS;
    using Gemini = pcs::gemini::GeminiVerifier_<PCSParams>;
    using Shplonk = pcs::shplonk::ShplonkVerifier_<PCSParams>;
    using VerifierCommitments = typename Flavor::VerifierCommitments;
    using CommitmentLabels = typename Flavor::CommitmentLabels;

    RelationParameters<FF> relation_parameters;

    transcript = VerifierTranscript<FF>{ proof.proof_data };

    auto commitments = VerifierCommitments(key, transcript);
    auto commitment_labels = CommitmentLabels();

    // TODO(Adrian): Change the initialization of the transcript to take the VK hash?
    const auto circuit_size = transcript.template receive_from_prover<uint32_t>("circuit_size");
    const auto evaluation_input_x = transcript.template receive_from_prover<BF>("evaluation_input_x");
    const auto batching_challenge_v = transcript.template receive_from_prover<BF>("batching_challenge_v");
    (void)evaluation_input_x;
    (void)batching_challenge_v;
    if (circuit_size != key->circuit_size) {
        return false;
    }

    // Get commitments
    auto wire_commitments = commitments.get_wires();
    auto wire_labels = commitment_labels.get_wires();
    for (size_t i = 0; i < wire_commitments.size(); i++) {
        wire_commitments[i] = transcript.template receive_from_prover<Commitment>(wire_labels[i]);
    }

    // Get permutation challenges
    auto [gamma] = transcript.get_challenges("gamma");

    relation_parameters.beta = 0;
    relation_parameters.gamma = gamma;
    relation_parameters.public_input_delta = 0;
    relation_parameters.lookup_grand_product_delta = 0;

    // Get commitment to permutation and lookup grand products
    commitments.z_perm = transcript.template receive_from_prover<Commitment>(commitment_labels.z_perm);

    // Execute Sumcheck Verifier
    auto sumcheck = SumcheckVerifier<Flavor>(circuit_size, transcript);

    std::optional sumcheck_output = sumcheck.verify(relation_parameters);

    // If Sumcheck does not return an output, sumcheck verification has failed
    if (!sumcheck_output.has_value()) {
        return false;
    }
    // TODO:remove;
    // return true;

    auto [multivariate_challenge, purported_evaluations] = *sumcheck_output;

    // Execute Gemini/Shplonk verification:

    // Construct inputs for Gemini verifier:
    // - Multivariate opening point u = (u_0, ..., u_{d-1})
    // - batched unshifted and to-be-shifted polynomial commitments
    auto batched_commitment_unshifted = GroupElement::zero();
    auto batched_commitment_to_be_shifted = GroupElement::zero();

    // Compute powers of batching challenge rho
    FF rho = transcript.get_challenge("rho");
    std::vector<FF> rhos = pcs::gemini::powers_of_rho(rho, Flavor::NUM_ALL_ENTITIES);

    // Compute batched multivariate evaluation
    FF batched_evaluation = FF::zero();
    size_t evaluation_idx = 0;
    for (auto& value : purported_evaluations.get_unshifted_then_shifted()) {
        batched_evaluation += value * rhos[evaluation_idx];
        ++evaluation_idx;
    }

    // Construct batched commitment for NON-shifted polynomials
    size_t commitment_idx = 0;
    for (auto& commitment : commitments.get_unshifted()) {
        batched_commitment_unshifted += commitment * rhos[commitment_idx];
        ++commitment_idx;
    }

    // Construct batched commitment for to-be-shifted polynomials
    for (auto& commitment : commitments.get_to_be_shifted()) {
        batched_commitment_to_be_shifted += commitment * rhos[commitment_idx];
        ++commitment_idx;
    }

    // Produce a Gemini claim consisting of:
    // - d+1 commitments [Fold_{r}^(0)], [Fold_{-r}^(0)], and [Fold^(l)], l = 1:d-1
    // - d+1 evaluations a_0_pos, and a_l, l = 0:d-1
    auto gemini_claim = Gemini::reduce_verification(multivariate_challenge,
                                                    batched_evaluation,
                                                    batched_commitment_unshifted,
                                                    batched_commitment_to_be_shifted,
                                                    transcript);

    // Produce a Shplonk claim: commitment [Q] - [Q_z], evaluation zero (at random challenge z)
    auto shplonk_claim = Shplonk::reduce_verification(pcs_verification_key, gemini_claim, transcript);

    // // Verify the Shplonk claim with KZG or IPA
    return PCS::verify(pcs_verification_key, shplonk_claim, transcript);
}

template class GoblinTranslatorVerifier_<honk::flavor::GoblinTranslatorBasic>;

} // namespace proof_system::honk

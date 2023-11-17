

#include "./Fib_verifier.hpp"
#include "barretenberg/honk/flavor/generated/Fib_flavor.hpp"
#include "barretenberg/honk/pcs/gemini/gemini.hpp"
#include "barretenberg/honk/pcs/shplonk/shplonk.hpp"
#include "barretenberg/honk/transcript/transcript.hpp"
#include "barretenberg/honk/utils/power_polynomial.hpp"
#include "barretenberg/numeric/bitop/get_msb.hpp"

using namespace barretenberg;
using namespace proof_system::honk::sumcheck;

namespace proof_system::honk {
template <typename Flavor>
FibVerifier_<Flavor>::FibVerifier_(std::shared_ptr<typename Flavor::VerificationKey> verifier_key)
    : key(verifier_key)
{}

template <typename Flavor>
FibVerifier_<Flavor>::FibVerifier_(FibVerifier_&& other) noexcept
    : key(std::move(other.key))
    , pcs_verification_key(std::move(other.pcs_verification_key))
{}

template <typename Flavor> FibVerifier_<Flavor>& FibVerifier_<Flavor>::operator=(FibVerifier_&& other) noexcept
{
    key = other.key;
    pcs_verification_key = (std::move(other.pcs_verification_key));
    commitments.clear();
    pcs_fr_elements.clear();
    return *this;
}

/**
 * @brief This function verifies an Fib Honk proof for given program settings.
 *
 */
template <typename Flavor> bool FibVerifier_<Flavor>::verify_proof(const plonk::proof& proof)
{
    using FF = typename Flavor::FF;
    using GroupElement = typename Flavor::GroupElement;
    using Commitment = typename Flavor::Commitment;
    using PCS = typename Flavor::PCS;
    using Curve = typename Flavor::Curve;
    using Gemini = pcs::gemini::GeminiVerifier_<Curve>;
    using Shplonk = pcs::shplonk::ShplonkVerifier_<Curve>;
    using VerifierCommitments = typename Flavor::VerifierCommitments;
    using CommitmentLabels = typename Flavor::CommitmentLabels;

    RelationParameters<FF> relation_parameters;

    transcript = VerifierTranscript<FF>{ proof.proof_data };

    auto commitments = VerifierCommitments(key, transcript);
    auto commitment_labels = CommitmentLabels();

    const auto circuit_size = transcript.template receive_from_prover<uint32_t>("circuit_size");

    if (circuit_size != key->circuit_size) {
        return false;
    }

    // Get commitments to VM wires
    commitments.Fibonacci_LAST = transcript.template receive_from_prover<Commitment>(commitment_labels.Fibonacci_LAST);
    commitments.Fibonacci_FIRST =
        transcript.template receive_from_prover<Commitment>(commitment_labels.Fibonacci_FIRST);
    commitments.Fibonacci_x = transcript.template receive_from_prover<Commitment>(commitment_labels.Fibonacci_x);
    commitments.Fibonacci_y = transcript.template receive_from_prover<Commitment>(commitment_labels.Fibonacci_y);

    // Permutation / logup related stuff?
    // Get challenge for sorted list batching and wire four memory records
    // auto [beta, gamma] = transcript.get_challenges("bbeta", "gamma");
    // relation_parameters.gamma = gamma;
    // auto beta_sqr = beta * beta;
    // relation_parameters.beta = beta;
    // relation_parameters.beta_sqr = beta_sqr;
    // relation_parameters.beta_cube = beta_sqr * beta;
    // relation_parameters.Fib_set_permutation_delta =
    //     gamma * (gamma + beta_sqr) * (gamma + beta_sqr + beta_sqr) * (gamma + beta_sqr + beta_sqr + beta_sqr);
    // relation_parameters.Fib_set_permutation_delta = relation_parameters.Fib_set_permutation_delta.invert();

    // Get commitment to permutation and lookup grand products
    // commitments.lookup_inverses =
    //     transcript.template receive_from_prover<Commitment>(commitment_labels.lookup_inverses);
    // commitments.z_perm = transcript.template receive_from_prover<Commitment>(commitment_labels.z_perm);

    // Execute Sumcheck Verifier
    auto sumcheck = SumcheckVerifier<Flavor>(circuit_size);

    auto [multivariate_challenge, purported_evaluations, sumcheck_verified] =
        sumcheck.verify(relation_parameters, transcript);

    // If Sumcheck did not verify, return false
    if (sumcheck_verified.has_value() && !sumcheck_verified.value()) {
        return false;
    }

    // Execute Gemini/Shplonk verification:

    // Construct inputs for Gemini verifier:
    // - Multivariate opening point u = (u_0, ..., u_{d-1})
    // - batched unshifted and to-be-shifted polynomial commitments
    auto batched_commitment_unshifted = GroupElement::zero();
    auto batched_commitment_to_be_shifted = GroupElement::zero();
    const size_t NUM_POLYNOMIALS = Flavor::NUM_ALL_ENTITIES;
    // Compute powers of batching challenge rho
    FF rho = transcript.get_challenge("rho");
    std::vector<FF> rhos = pcs::gemini::powers_of_rho(rho, NUM_POLYNOMIALS);

    // Compute batched multivariate evaluation
    FF batched_evaluation = FF::zero();
    size_t evaluation_idx = 0;
    for (auto& value : purported_evaluations.get_unshifted()) {
        batched_evaluation += value * rhos[evaluation_idx];
        ++evaluation_idx;
    }
    for (auto& value : purported_evaluations.get_shifted()) {
        batched_evaluation += value * rhos[evaluation_idx];
        ++evaluation_idx;
    }

    // Construct batched commitment for NON-shifted polynomials
    size_t commitment_idx = 0;
    for (auto& commitment : commitments.get_unshifted()) {
        // TODO(@zac-williamson) ensure Fib polynomial commitments are never points at infinity (#2214)
        if (commitment.y != 0) {
            batched_commitment_unshifted += commitment * rhos[commitment_idx];
        } else {
            info("point at infinity (unshifted)");
        }
        ++commitment_idx;
    }

    // Construct batched commitment for to-be-shifted polynomials
    for (auto& commitment : commitments.get_to_be_shifted()) {
        // TODO(@zac-williamson) ensure Fib polynomial commitments are never points at infinity (#2214)
        if (commitment.y != 0) {
            batched_commitment_to_be_shifted += commitment * rhos[commitment_idx];
        } else {
            info("point at infinity (to be shifted)");
        }
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

    // Verify the Shplonk claim with KZG or IPA
    auto verified = PCS::verify(pcs_verification_key, shplonk_claim, transcript);

    return sumcheck_verified.value() && verified;
}

template class FibVerifier_<honk::flavor::FibFlavor>;

} // namespace proof_system::honk

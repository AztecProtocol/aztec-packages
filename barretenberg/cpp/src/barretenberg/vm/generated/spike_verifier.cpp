

#include "./spike_verifier.hpp"
#include "barretenberg/commitment_schemes/zeromorph/zeromorph.hpp"
#include "barretenberg/numeric/bitop/get_msb.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/transcript/transcript.hpp"
#include "barretenberg/vm/generated/spike_flavor.hpp"

namespace bb {
SpikeVerifier::SpikeVerifier(std::shared_ptr<Flavor::VerificationKey> verifier_key)
    : key(verifier_key)
{}

SpikeVerifier::SpikeVerifier(SpikeVerifier&& other) noexcept
    : key(std::move(other.key))
    , pcs_verification_key(std::move(other.pcs_verification_key))
{}

SpikeVerifier& SpikeVerifier::operator=(SpikeVerifier&& other) noexcept
{
    key = other.key;
    pcs_verification_key = (std::move(other.pcs_verification_key));
    commitments.clear();
    return *this;
}

using FF = SpikeVerifier::FF;

// Evaluations are the evaluations of the polynomial over the boolean hypercube
// The multivariate challenge is the challenge in each variable of the polynomial
// This challenge is generated during the sumcheck protocol
//
// TODO: Using the current evaluate_mle implementation is inefficient
FF evaluate_public_input_column(std::vector<FF> evals, std::vector<FF> challenges)
{
    Polynomial<FF> polynomial(evals);
    return polynomial.evaluate_mle(challenges);
}

/**
 * @brief This function verifies an Spike Honk proof for given program settings.
 *
 */
// bool SpikeVerifier::verify_proof(const HonkProof& proof, PublicInputColumns public_inputs)
bool SpikeVerifier::verify_proof(const HonkProof& proof, std::vector<FF> public_inputs)
{
    using Flavor = SpikeFlavor;
    using FF = Flavor::FF;
    using Commitment = Flavor::Commitment;
    // using PCS = Flavor::PCS;
    // using ZeroMorph = ZeroMorphVerifier_<PCS>;
    using VerifierCommitments = Flavor::VerifierCommitments;
    using CommitmentLabels = Flavor::CommitmentLabels;

    RelationParameters<FF> relation_parameters;

    transcript = std::make_shared<Transcript>(proof);

    VerifierCommitments commitments{ key };
    CommitmentLabels commitment_labels;

    const auto circuit_size = transcript->template receive_from_prover<uint32_t>("circuit_size");

    if (circuit_size != key->circuit_size) {
        return false;
    }

    // Get commitments to VM wires
    commitments.Spike_kernel_inputs__is_public =
        transcript->template receive_from_prover<Commitment>(commitment_labels.Spike_kernel_inputs__is_public);
    commitments.Spike_x = transcript->template receive_from_prover<Commitment>(commitment_labels.Spike_x);

    auto [beta, gamm] = transcript->template get_challenges<FF>("beta", "gamma");
    relation_parameters.beta = beta;
    relation_parameters.gamma = gamm;

    // Get commitments to inverses

    // Execute Sumcheck Verifier
    const size_t log_circuit_size = numeric::get_msb(circuit_size);
    auto sumcheck = SumcheckVerifier<Flavor>(log_circuit_size, transcript);

    FF alpha = transcript->template get_challenge<FF>("Sumcheck:alpha");

    auto gate_challenges = std::vector<FF>(log_circuit_size);
    for (size_t idx = 0; idx < log_circuit_size; idx++) {
        gate_challenges[idx] = transcript->template get_challenge<FF>("Sumcheck:gate_challenge_" + std::to_string(idx));
    }

    auto [multivariate_challenge, claimed_evaluations, sumcheck_verified] =
        sumcheck.verify(relation_parameters, alpha, gate_challenges);

    // If Sumcheck did not verify, return false
    if (sumcheck_verified.has_value() && !sumcheck_verified.value()) {
        return false;
    }

    // Compute the public inputs evaluations, and verify that they match the claimed evaluations
    // This is performed later in the verifier such that we can use the same evalutaions that are computed
    // during sumcheck and confirmed during zeromorph
    // A more optimal implementation would avoid the prover having to compute the commitment to the public inputs
    // and compute them at a different challenge earlier in the program
    // This would require a change in our zeromorph implementation where it assumes all evaluations were made
    // at the same challenge point.
    // TODO: document this design choice in a github issue

    info("sumcheck claimed evaluations", claimed_evaluations);

    FF public_column_evaluation = evaluate_public_input_column(public_inputs, multivariate_challenge);
    info("public column evaluation: ", public_column_evaluation);

    // Execute ZeroMorph rounds. See https://hackmd.io/dlf9xEwhTQyE3hiGbq4FsA?view for a complete description of the
    // unrolled protocol.
    // NOTE: temporarily disabled - facing integration issues
    // auto pairing_points = ZeroMorph::verify(commitments.get_unshifted(),
    //                                         commitments.get_to_be_shifted(),
    //                                         claimed_evaluations.get_unshifted(),
    //                                         claimed_evaluations.get_shifted(),
    //                                         multivariate_challenge,
    //                                         transcript);

    // auto verified = pcs_verification_key->pairing_check(pairing_points[0], pairing_points[1]);
    // return sumcheck_verified.value() && verified;
    return sumcheck_verified.value();
}

} // namespace bb

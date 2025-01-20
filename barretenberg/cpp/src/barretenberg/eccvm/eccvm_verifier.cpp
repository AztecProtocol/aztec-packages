#include "./eccvm_verifier.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplonk.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"

namespace bb {

/**
 * @brief This function verifies an ECCVM Honk proof for given program settings.
 */
bool ECCVMVerifier::verify_proof(const ECCVMProof& proof)
{
    using Curve = typename Flavor::Curve;
    using Shplemini = ShpleminiVerifier_<Curve>;
    using Shplonk = ShplonkVerifier_<Curve>;
    using OpeningClaim = OpeningClaim<Curve>;

    RelationParameters<FF> relation_parameters;
    transcript = std::make_shared<Transcript>(proof.pre_ipa_proof);
    ipa_transcript = std::make_shared<Transcript>(proof.ipa_proof);
    VerifierCommitments commitments{ key };
    CommitmentLabels commitment_labels;

    const auto circuit_size = transcript->template receive_from_prover<uint32_t>("circuit_size");
    ASSERT(circuit_size == key->circuit_size);

    for (auto [comm, label] : zip_view(commitments.get_wires(), commitment_labels.get_wires())) {
        comm = transcript->template receive_from_prover<Commitment>(label);
    }

    // Get challenge for sorted list batching and wire four memory records
    auto [beta, gamma] = transcript->template get_challenges<FF>("beta", "gamma");

    auto beta_sqr = beta * beta;
    relation_parameters.gamma = gamma;
    relation_parameters.beta = beta;
    relation_parameters.beta_sqr = beta * beta;
    relation_parameters.beta_cube = beta_sqr * beta;
    relation_parameters.eccvm_set_permutation_delta =
        gamma * (gamma + beta_sqr) * (gamma + beta_sqr + beta_sqr) * (gamma + beta_sqr + beta_sqr + beta_sqr);
    relation_parameters.eccvm_set_permutation_delta = relation_parameters.eccvm_set_permutation_delta.invert();

    // Get commitment to permutation and lookup grand products
    commitments.lookup_inverses =
        transcript->template receive_from_prover<Commitment>(commitment_labels.lookup_inverses);
    commitments.z_perm = transcript->template receive_from_prover<Commitment>(commitment_labels.z_perm);

    // Execute Sumcheck Verifier
    const size_t log_circuit_size = numeric::get_msb(circuit_size);
    auto sumcheck = SumcheckVerifier<Flavor>(log_circuit_size, transcript);
    FF alpha = transcript->template get_challenge<FF>("Sumcheck:alpha");
    std::vector<FF> gate_challenges(CONST_PROOF_SIZE_LOG_N);
    for (size_t idx = 0; idx < gate_challenges.size(); idx++) {
        gate_challenges[idx] = transcript->template get_challenge<FF>("Sumcheck:gate_challenge_" + std::to_string(idx));
    }

    // Receive commitments to Libra masking polynomials
    std::array<Commitment, NUM_LIBRA_COMMITMENTS> libra_commitments = {};

    libra_commitments[0] = transcript->template receive_from_prover<Commitment>("Libra:concatenation_commitment");

    auto sumcheck_output = sumcheck.verify(relation_parameters, alpha, gate_challenges);

    libra_commitments[1] = transcript->template receive_from_prover<Commitment>("Libra:big_sum_commitment");
    libra_commitments[2] = transcript->template receive_from_prover<Commitment>("Libra:quotient_commitment");

    // If Sumcheck did not verify, return false
    if (sumcheck_output.verified.has_value() && !sumcheck_output.verified.value()) {
        vinfo("eccvm sumcheck failed");
        return false;
    }
    // Compute the Shplemini accumulator consisting of the Shplonk evaluation and the commitments and scalars vector
    // produced by the unified protocol
    bool consistency_checked = true;
    BatchOpeningClaim<Curve> sumcheck_batch_opening_claims =
        Shplemini::compute_batch_opening_claim(circuit_size,
                                               commitments.get_unshifted(),
                                               commitments.get_to_be_shifted(),
                                               sumcheck_output.claimed_evaluations.get_unshifted(),
                                               sumcheck_output.claimed_evaluations.get_shifted(),
                                               sumcheck_output.challenge,
                                               key->pcs_verification_key->get_g1_identity(),
                                               transcript,
                                               Flavor::REPEATED_COMMITMENTS,
                                               Flavor::HasZK,
                                               &consistency_checked,
                                               libra_commitments,
                                               sumcheck_output.claimed_libra_evaluation,
                                               sumcheck_output.round_univariate_commitments,
                                               sumcheck_output.round_univariate_evaluations);

    // Reduce the accumulator to a single opening claim
    const OpeningClaim multivariate_to_univariate_opening_claim =
        PCS::reduce_batch_opening_claim(sumcheck_batch_opening_claims);

    const FF evaluation_challenge_x = transcript->template get_challenge<FF>("Translation:evaluation_challenge_x");

    // Construct arrays of commitments and evaluations to be batched, the evaluations being received from the prover
    const size_t NUM_UNIVARIATES = 5;
    std::array<Commitment, NUM_UNIVARIATES> transcript_commitments = { commitments.transcript_op,
                                                                       commitments.transcript_Px,
                                                                       commitments.transcript_Py,
                                                                       commitments.transcript_z1,
                                                                       commitments.transcript_z2 };
    std::array<FF, NUM_UNIVARIATES> transcript_evaluations = {
        transcript->template receive_from_prover<FF>("Translation:op"),
        transcript->template receive_from_prover<FF>("Translation:Px"),
        transcript->template receive_from_prover<FF>("Translation:Py"),
        transcript->template receive_from_prover<FF>("Translation:z1"),
        transcript->template receive_from_prover<FF>("Translation:z2")
    };

    // Get the batching challenge for commitments and evaluations
    const FF ipa_batching_challenge = transcript->template get_challenge<FF>("Translation:ipa_batching_challenge");

    // Compute the batched commitment and batched evaluation for the univariate opening claim
    Commitment batched_commitment = transcript_commitments[0];
    FF batched_transcript_eval = transcript_evaluations[0];
    FF batching_scalar = ipa_batching_challenge;
    for (size_t idx = 1; idx < NUM_UNIVARIATES; ++idx) {
        batched_commitment = batched_commitment + transcript_commitments[idx] * batching_scalar;
        batched_transcript_eval += batching_scalar * transcript_evaluations[idx];
        batching_scalar *= ipa_batching_challenge;
    }

    const OpeningClaim translation_opening_claim = { { evaluation_challenge_x, batched_transcript_eval },
                                                     batched_commitment };

    const std::array<OpeningClaim, 2> opening_claims = { multivariate_to_univariate_opening_claim,
                                                         translation_opening_claim };

    // Construct and verify the combined opening claim
    const OpeningClaim batch_opening_claim =
        Shplonk::reduce_verification(key->pcs_verification_key->get_g1_identity(), opening_claims, transcript);

    const bool batched_opening_verified =
        PCS::reduce_verify(key->pcs_verification_key, batch_opening_claim, ipa_transcript);
    vinfo("eccvm sumcheck verified?: ", sumcheck_output.verified.value());
    vinfo("batch opening verified?: ", batched_opening_verified);
    return sumcheck_output.verified.value() && batched_opening_verified && consistency_checked;
}
} // namespace bb

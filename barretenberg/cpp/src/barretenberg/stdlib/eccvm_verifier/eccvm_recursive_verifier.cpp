#include "./eccvm_recursive_verifier.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplonk.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"
#include "barretenberg/transcript/transcript.hpp"

namespace bb {

template <typename Flavor>
ECCVMRecursiveVerifier_<Flavor>::ECCVMRecursiveVerifier_(
    Builder* builder, const std::shared_ptr<NativeVerificationKey>& native_verifier_key)
    : key(std::make_shared<VerificationKey>(builder, native_verifier_key))
    , builder(builder)
{}

/**
 * @brief This function verifies an ECCVM Honk proof for given program settings up to sumcheck.
 *
 */
template <typename Flavor>
std::pair<OpeningClaim<typename Flavor::Curve>, std::shared_ptr<typename ECCVMRecursiveVerifier_<Flavor>::Transcript>>
ECCVMRecursiveVerifier_<Flavor>::verify_proof(const ECCVMProof& proof)
{
    using Curve = typename Flavor::Curve;
    using Shplemini = ShpleminiVerifier_<Curve>;
    using Shplonk = ShplonkVerifier_<Curve>;
    using OpeningClaim = OpeningClaim<Curve>;
    using ClaimBatcher = ClaimBatcher_<Curve>;
    using ClaimBatch = ClaimBatcher::Batch;

    RelationParameters<FF> relation_parameters;

    StdlibProof<Builder> stdlib_proof = bb::convert_native_proof_to_stdlib(builder, proof.pre_ipa_proof);
    StdlibProof<Builder> stdlib_ipa_proof = bb::convert_native_proof_to_stdlib(builder, proof.ipa_proof);
    transcript = std::make_shared<Transcript>(stdlib_proof);
    ipa_transcript = std::make_shared<Transcript>(stdlib_ipa_proof);
    transcript->enable_manifest();
    ipa_transcript->enable_manifest();

    VerifierCommitments commitments{ key };
    CommitmentLabels commitment_labels;

    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1040): Extract circuit size as BF (field_t) then
    // convert to FF (bigfield fq) since this is what's expected by ZM. See issue for more details.
    const BF circuit_size_bf = transcript->template receive_from_prover<BF>("circuit_size");
    const FF circuit_size{ static_cast<int>(static_cast<uint256_t>(circuit_size_bf.get_value())) };

    for (auto [comm, label] : zip_view(commitments.get_wires(), commitment_labels.get_wires())) {
        comm = transcript->template receive_from_prover<Commitment>(label);
    }

    // Get challenge for sorted list batching and wire four memory records
    const auto [beta, gamma] = transcript->template get_challenges<FF>("beta", "gamma");

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
    const size_t log_circuit_size = numeric::get_msb(static_cast<uint32_t>(circuit_size.get_value()));
    auto sumcheck = SumcheckVerifier<Flavor>(log_circuit_size, transcript);
    const FF alpha = transcript->template get_challenge<FF>("Sumcheck:alpha");
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

    // Compute the Shplemini accumulator consisting of the Shplonk evaluation and the commitments and scalars vector
    // produced by the unified protocol
    bool consistency_checked = true;
    ClaimBatcher claim_batcher{
        .unshifted = ClaimBatch{ commitments.get_unshifted(), sumcheck_output.claimed_evaluations.get_unshifted() },
        .shifted = ClaimBatch{ commitments.get_to_be_shifted(), sumcheck_output.claimed_evaluations.get_shifted() }
    };
    BatchOpeningClaim<Curve> sumcheck_batch_opening_claims =
        Shplemini::compute_batch_opening_claim(circuit_size,
                                               claim_batcher,
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

    // Construct the vector of commitments (needs to be vector for the batch_mul)
    const std::vector<Commitment> translation_commitments = { commitments.transcript_op,
                                                              commitments.transcript_Px,
                                                              commitments.transcript_Py,
                                                              commitments.transcript_z1,
                                                              commitments.transcript_z2 };
    // Reduce the univariate evaluations claims to a single claim to be batched by Shplonk
    const OpeningClaim translation_opening_claim = reduce_verify_translation_evaluations(translation_commitments);
    // Construct and verify the combined opening claim
    const std::array<OpeningClaim, 2> opening_claims = { multivariate_to_univariate_opening_claim,
                                                         translation_opening_claim };

    const OpeningClaim batch_opening_claim =
        Shplonk::reduce_verification(key->pcs_verification_key->get_g1_identity(), opening_claims, transcript);

    return { batch_opening_claim, ipa_transcript };
}

/**
 * @brief To link the ECCVM Transcript wires 'op', 'Px', 'Py', 'z1', and 'z2' to the accumulator computed by the
 * translator, we verify their evaluations as univariates. For efficiency reasons, we batch these evaluations.
 *
 * @tparam Flavor ECCVMRecursiveFlavor_<UltraCircuitBuilder>
 * @param translation_commitments Commitments to  'op', 'Px', 'Py', 'z1', and 'z2'
 * @return OpeningClaim<typename Flavor::Curve>
 */
template <typename Flavor>
OpeningClaim<typename Flavor::Curve> ECCVMRecursiveVerifier_<Flavor>::reduce_verify_translation_evaluations(
    const std::vector<Commitment>& translation_commitments)
{
    using SmallIPAVerifier = SmallSubgroupIPAVerifier<typename ECCVMFlavor::Curve>;

    std::array<OpeningClaim<typename ECCVMFlavor::Curve>, NUM_SMALL_IPA_EVALUATIONS + 1> opening_claims;

    small_ipa_commitments[0] =
        transcript->template receive_from_prover<Commitment>("Translation:masking_term_commitment");

    evaluation_challenge_x = transcript->template get_challenge<FF>("Translation:evaluation_challenge_x");

    // Construct the array of evaluations to be batched, the evaluations being received from the prover
    for (auto [eval, label] : zip_view(translation_evaluations.get_all(), translation_evaluations.labels)) {
        *eval = transcript->template receive_from_prover<FF>(label);
    }
    // Get the batching challenge for commitments and evaluations
    batching_challenge_v = transcript->template get_challenge<FF>("Translation:batching_challenge_v");

    FF claimed_masking_term_eval = transcript->template receive_from_prover<FF>("Translation:masking_term_eval");

    small_ipa_commitments[1] = transcript->template receive_from_prover<Commitment>("Translation:big_sum_commitment");
    small_ipa_commitments[2] = small_ipa_commitments[1];
    small_ipa_commitments[3] = transcript->template receive_from_prover<Commitment>("Translation:quotient_commitment");

    FF small_ipa_evaluation_challenge =
        transcript->template get_challenge<FF>("Translation:small_ipa_evaluation_challenge");

    std::array<FF, NUM_SMALL_IPA_EVALUATIONS> small_ipa_evaluations;
    labels = SmallIPAVerifier::evaluation_labels();

    evaluation_points = SmallIPAVerifier::evaluation_points(small_ipa_evaluation_challenge);

    for (size_t idx = 0; idx < NUM_SMALL_IPA_EVALUATIONS; idx++) {
        small_ipa_evaluations[idx] = transcript->template receive_from_prover<FF>(labels[idx]);
        opening_claims[idx + 1] = { { evaluation_points[idx], small_ipa_evaluations[idx] },
                                    small_ipa_commitments[idx] };
    }

    // Compute the batched commitment and batched evaluation for the univariate opening claim
    auto batched_translation_evaluation = translation_evaluations[0];
    auto batching_scalar = batching_challenge_v;

    std::vector<FF> batching_challenges = { FF::one() };
    for (size_t idx = 1; idx < NUM_TRANSLATION_EVALUATIONS; ++idx) {
        batched_translation_evaluation += batching_scalar * translation_evaluations[idx];
        batching_challenges.emplace_back(batching_scalar);
        batching_scalar *= batching_challenge_v;
    }
    const Commitment batched_commitment = Commitment::batch_mul(translation_commitments, batching_challenges);

    return { { evaluation_challenge_x, batched_translation_evaluation }, batched_commitment };
};

template class ECCVMRecursiveVerifier_<ECCVMRecursiveFlavor_<UltraCircuitBuilder>>;
} // namespace bb

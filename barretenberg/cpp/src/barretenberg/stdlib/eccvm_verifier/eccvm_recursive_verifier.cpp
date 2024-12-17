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

    RelationParameters<FF> relation_parameters;

    StdlibProof<Builder> stdlib_proof = bb::convert_native_proof_to_stdlib(builder, proof.pre_ipa_proof);
    StdlibProof<Builder> stdlib_ipa_proof = bb::convert_native_proof_to_stdlib(builder, proof.ipa_proof);
    transcript = std::make_shared<Transcript>(stdlib_proof);
    ipa_transcript = std::make_shared<Transcript>(stdlib_ipa_proof);

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
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1009): probably the size of this should be fixed to the
    // maximum possible size of an ECCVM circuit otherwise we might run into problem because the number of rounds of
    // sumcheck is dependent on circuit size.
    const size_t log_circuit_size = numeric::get_msb(static_cast<uint32_t>(circuit_size.get_value()));
    auto sumcheck = SumcheckVerifier<Flavor>(log_circuit_size, transcript);
    const FF alpha = transcript->template get_challenge<FF>("Sumcheck:alpha");
    std::vector<FF> gate_challenges(CONST_PROOF_SIZE_LOG_N);
    for (size_t idx = 0; idx < gate_challenges.size(); idx++) {
        gate_challenges[idx] = transcript->template get_challenge<FF>("Sumcheck:gate_challenge_" + std::to_string(idx));
    }

    // Receive commitments to Libra masking polynomials
    std::array<Commitment, 3> libra_commitments = {};

    libra_commitments[0] = transcript->template receive_from_prover<Commitment>("Libra:concatenation_commitment");

    auto [multivariate_challenge, claimed_evaluations, claimed_libra_evaluation, sumcheck_verified] =
        sumcheck.verify(relation_parameters, alpha, gate_challenges);

    libra_commitments[1] = transcript->template receive_from_prover<Commitment>("Libra:big_sum_commitment");
    libra_commitments[2] = transcript->template receive_from_prover<Commitment>("Libra:quotient_commitment");

    // Compute the Shplemini accumulator consisting of the Shplonk evaluation and the commitments and scalars vector
    // produced by the unified protocol
    BatchOpeningClaim<Curve> sumcheck_batch_opening_claims =
        Shplemini::compute_batch_opening_claim(circuit_size,
                                               commitments.get_unshifted(),
                                               commitments.get_to_be_shifted(),
                                               claimed_evaluations.get_unshifted(),
                                               claimed_evaluations.get_shifted(),
                                               multivariate_challenge,
                                               key->pcs_verification_key->get_g1_identity(),
                                               transcript,
                                               Flavor::REPEATED_COMMITMENTS,
                                               Flavor::HasZK,
                                               libra_commitments,
                                               claimed_libra_evaluation);

    // Reduce the accumulator to a single opening claim
    const OpeningClaim multivariate_to_univariate_opening_claim =
        PCS::reduce_batch_opening_claim(sumcheck_batch_opening_claims);

    const FF evaluation_challenge_x = transcript->template get_challenge<FF>("Translation:evaluation_challenge_x");

    // Construct the vector of commitments (needs to be vector for the batch_mul) and array of evaluations to be batched
    std::vector<Commitment> transcript_commitments = { commitments.transcript_op,
                                                       commitments.transcript_Px,
                                                       commitments.transcript_Py,
                                                       commitments.transcript_z1,
                                                       commitments.transcript_z2 };

    std::vector<FF> transcript_evaluations = { transcript->template receive_from_prover<FF>("Translation:op"),
                                               transcript->template receive_from_prover<FF>("Translation:Px"),
                                               transcript->template receive_from_prover<FF>("Translation:Py"),
                                               transcript->template receive_from_prover<FF>("Translation:z1"),
                                               transcript->template receive_from_prover<FF>("Translation:z2") };

    // Get the batching challenge for commitments and evaluations
    const FF ipa_batching_challenge = transcript->template get_challenge<FF>("Translation:ipa_batching_challenge");

    // Compute the batched commitment and batched evaluation for the univariate opening claim
    auto batched_transcript_eval = transcript_evaluations[0];
    auto batching_scalar = ipa_batching_challenge;

    std::vector<FF> batching_challenges = { FF::one() };
    for (size_t idx = 1; idx < transcript_commitments.size(); ++idx) {
        batched_transcript_eval += batching_scalar * transcript_evaluations[idx];
        batching_challenges.emplace_back(batching_scalar);
        batching_scalar *= ipa_batching_challenge;
    }
    const Commitment batched_commitment = Commitment::batch_mul(transcript_commitments, batching_challenges);

    // Construct and verify the combined opening claim
    const OpeningClaim translation_opening_claim = { { evaluation_challenge_x, batched_transcript_eval },
                                                     batched_commitment };

    const std::array<OpeningClaim, 2> opening_claims = { multivariate_to_univariate_opening_claim,
                                                         translation_opening_claim };

    const OpeningClaim batch_opening_claim =
        Shplonk::reduce_verification(key->pcs_verification_key->get_g1_identity(), opening_claims, transcript);

    ASSERT(sumcheck_verified);
    return { batch_opening_claim, ipa_transcript };
}

template class ECCVMRecursiveVerifier_<ECCVMRecursiveFlavor_<UltraCircuitBuilder>>;
} // namespace bb

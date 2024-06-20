

#include "./copy_verifier.hpp"
#include "barretenberg/commitment_schemes/zeromorph/zeromorph.hpp"
#include "barretenberg/numeric/bitop/get_msb.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/transcript/transcript.hpp"

namespace bb {

CopyVerifier::CopyVerifier(std::shared_ptr<Flavor::VerificationKey> verifier_key)
    : key(verifier_key)
{}

CopyVerifier::CopyVerifier(CopyVerifier&& other) noexcept
    : key(std::move(other.key))
    , pcs_verification_key(std::move(other.pcs_verification_key))
{}

CopyVerifier& CopyVerifier::operator=(CopyVerifier&& other) noexcept
{
    key = other.key;
    pcs_verification_key = (std::move(other.pcs_verification_key));
    commitments.clear();
    return *this;
}

/**
 * @brief This function verifies an Copy Honk proof for given program settings.
 *
 */
bool CopyVerifier::verify_proof(const HonkProof& proof)
{
    using Flavor = CopyFlavor;
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
    commitments.copy_a = transcript->template receive_from_prover<Commitment>(commitment_labels.copy_a);
    commitments.copy_b = transcript->template receive_from_prover<Commitment>(commitment_labels.copy_b);
    commitments.copy_c = transcript->template receive_from_prover<Commitment>(commitment_labels.copy_c);
    commitments.copy_d = transcript->template receive_from_prover<Commitment>(commitment_labels.copy_d);
    commitments.copy_sigma_a = transcript->template receive_from_prover<Commitment>(commitment_labels.copy_sigma_a);
    commitments.copy_sigma_b = transcript->template receive_from_prover<Commitment>(commitment_labels.copy_sigma_b);
    commitments.copy_sigma_c = transcript->template receive_from_prover<Commitment>(commitment_labels.copy_sigma_c);
    commitments.copy_sigma_d = transcript->template receive_from_prover<Commitment>(commitment_labels.copy_sigma_d);
    commitments.copy_sigma_x = transcript->template receive_from_prover<Commitment>(commitment_labels.copy_sigma_x);
    commitments.copy_sigma_y = transcript->template receive_from_prover<Commitment>(commitment_labels.copy_sigma_y);
    commitments.copy_sigma_z = transcript->template receive_from_prover<Commitment>(commitment_labels.copy_sigma_z);
    commitments.copy_x = transcript->template receive_from_prover<Commitment>(commitment_labels.copy_x);
    commitments.copy_y = transcript->template receive_from_prover<Commitment>(commitment_labels.copy_y);
    commitments.copy_z = transcript->template receive_from_prover<Commitment>(commitment_labels.copy_z);
    commitments.id_0 = transcript->template receive_from_prover<Commitment>(commitment_labels.id_0);
    commitments.id_1 = transcript->template receive_from_prover<Commitment>(commitment_labels.id_1);
    commitments.id_2 = transcript->template receive_from_prover<Commitment>(commitment_labels.id_2);
    commitments.id_3 = transcript->template receive_from_prover<Commitment>(commitment_labels.id_3);

    auto [beta, gamm] = transcript->template get_challenges<FF>("beta", "gamma");
    relation_parameters.beta = beta;
    relation_parameters.gamma = gamm;

    // Get commitments to inverses
    commitments.copy_main = transcript->template receive_from_prover<Commitment>(commitment_labels.copy_main);
    commitments.copy_second = transcript->template receive_from_prover<Commitment>(commitment_labels.copy_second);

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

    // Public columns evaluation checks

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

#include "./ultra_verifier.hpp"
#include "barretenberg/honk/pcs/zeromorph/zeromorph.hpp"
#include "barretenberg/honk/transcript/transcript.hpp"
#include "barretenberg/honk/utils/power_polynomial.hpp"
#include "barretenberg/numeric/bitop/get_msb.hpp"

using namespace barretenberg;
using namespace proof_system::honk::sumcheck;

namespace proof_system::honk {
template <typename Flavor>
UltraVerifier_<Flavor>::UltraVerifier_(std::shared_ptr<typename Flavor::VerificationKey> verifier_key)
    : key(verifier_key)
{}

template <typename Flavor>
UltraVerifier_<Flavor>::UltraVerifier_(UltraVerifier_&& other)
    : key(std::move(other.key))
    , pcs_verification_key(std::move(other.pcs_verification_key))
{}

template <typename Flavor> UltraVerifier_<Flavor>& UltraVerifier_<Flavor>::operator=(UltraVerifier_&& other)
{
    key = other.key;
    pcs_verification_key = (std::move(other.pcs_verification_key));
    commitments.clear();
    return *this;
}

/**
 * @brief This function verifies an Ultra Honk proof for a given Flavor.
 *
 */
template <typename Flavor> bool UltraVerifier_<Flavor>::verify_proof(const plonk::proof& proof)
{
    using FF = typename Flavor::FF;
    using Commitment = typename Flavor::Commitment;
    using Curve = typename Flavor::Curve;
    using ZeroMorph = pcs::zeromorph::ZeroMorphVerifier_<Curve>;
    using VerifierCommitments = typename Flavor::VerifierCommitments;
    using CommitmentLabels = typename Flavor::CommitmentLabels;

    proof_system::RelationParameters<FF> relation_parameters;

    transcript = VerifierTranscript<FF>{ proof.proof_data };

    auto commitments = VerifierCommitments(key, transcript);
    auto commitment_labels = CommitmentLabels();

    // TODO(Adrian): Change the initialization of the transcript to take the VK hash?
    const auto circuit_size = transcript.template receive_from_prover<uint32_t>("circuit_size");
    const auto public_input_size = transcript.template receive_from_prover<uint32_t>("public_input_size");
    const auto pub_inputs_offset = transcript.template receive_from_prover<uint32_t>("pub_inputs_offset");
    const size_t log_circuit_size = numeric::get_msb(circuit_size);

    if (circuit_size != key->circuit_size) {
        return false;
    }
    if (public_input_size != key->num_public_inputs) {
        return false;
    }

    std::vector<FF> public_inputs;
    for (size_t i = 0; i < public_input_size; ++i) {
        auto public_input_i = transcript.template receive_from_prover<FF>("public_input_" + std::to_string(i));
        public_inputs.emplace_back(public_input_i);
    }

    // Get commitments to first three wire polynomials
    commitments.w_l = transcript.template receive_from_prover<Commitment>(commitment_labels.w_l);
    commitments.w_r = transcript.template receive_from_prover<Commitment>(commitment_labels.w_r);
    commitments.w_o = transcript.template receive_from_prover<Commitment>(commitment_labels.w_o);

    // If Goblin, get commitments to ECC op wire polynomials
    if constexpr (IsGoblinFlavor<Flavor>) {
        commitments.ecc_op_wire_1 =
            transcript.template receive_from_prover<Commitment>(commitment_labels.ecc_op_wire_1);
        commitments.ecc_op_wire_2 =
            transcript.template receive_from_prover<Commitment>(commitment_labels.ecc_op_wire_2);
        commitments.ecc_op_wire_3 =
            transcript.template receive_from_prover<Commitment>(commitment_labels.ecc_op_wire_3);
        commitments.ecc_op_wire_4 =
            transcript.template receive_from_prover<Commitment>(commitment_labels.ecc_op_wire_4);
    }

    // Get challenge for sorted list batching and wire four memory records
    auto eta = transcript.get_challenge("eta");
    relation_parameters.eta = eta;

    // Get commitments to sorted list accumulator and fourth wire
    commitments.sorted_accum = transcript.template receive_from_prover<Commitment>(commitment_labels.sorted_accum);
    commitments.w_4 = transcript.template receive_from_prover<Commitment>(commitment_labels.w_4);

    // Get permutation challenges
    auto [beta, gamma] = transcript.get_challenges("beta", "gamma");

    const FF public_input_delta =
        compute_public_input_delta<Flavor>(public_inputs, beta, gamma, circuit_size, pub_inputs_offset);
    const FF lookup_grand_product_delta = compute_lookup_grand_product_delta<FF>(beta, gamma, circuit_size);

    relation_parameters.beta = beta;
    relation_parameters.gamma = gamma;
    relation_parameters.public_input_delta = public_input_delta;
    relation_parameters.lookup_grand_product_delta = lookup_grand_product_delta;

    // Get commitment to permutation and lookup grand products
    commitments.z_perm = transcript.template receive_from_prover<Commitment>(commitment_labels.z_perm);
    commitments.z_lookup = transcript.template receive_from_prover<Commitment>(commitment_labels.z_lookup);

    // Execute Sumcheck Verifier
    auto sumcheck = SumcheckVerifier<Flavor>(circuit_size);

    auto [multivariate_challenge, claimed_evaluations, sumcheck_verified] =
        sumcheck.verify(relation_parameters, transcript);

    // If Sumcheck did not verify, return false
    if (sumcheck_verified.has_value() && !sumcheck_verified.value()) {
        return false;
    }

    // Execute ZeroMorph rounds

    // Compute powers of batching challenge rho
    FF rho = transcript.get_challenge("rho");
    std::vector<FF> rhos = pcs::zeromorph::powers_of_challenge(rho, Flavor::NUM_ALL_ENTITIES);

    // Construct batched evaluation v = sum_{i=0}^{m-1}\alpha^i*v_i + sum_{i=0}^{l-1}\alpha^{m+i}*w_i
    FF batched_evaluation = FF(0);
    size_t evaluation_idx = 0;
    for (auto& value : claimed_evaluations.get_unshifted_then_shifted()) {
        batched_evaluation += value * rhos[evaluation_idx];
        ++evaluation_idx;
    }

    // Receive commitments [q_k]
    std::vector<Commitment> C_q_k;
    C_q_k.reserve(log_circuit_size);
    for (size_t i = 0; i < log_circuit_size; ++i) {
        C_q_k.emplace_back(transcript.template receive_from_prover<Commitment>("ZM:C_q_" + std::to_string(i)));
    }

    // Challenge y
    auto y_challenge = transcript.get_challenge("ZM:y");

    // Receive commitment C_{q}
    auto C_q = transcript.template receive_from_prover<Commitment>("ZM:C_q");

    // Challenges x, z
    auto [x_challenge, z_challenge] = transcript.get_challenges("ZM:x", "ZM:z");

    // Compute commitment C_{\zeta_x}
    auto C_zeta_x = ZeroMorph::compute_C_zeta_x(C_q, C_q_k, y_challenge, x_challenge);

    std::vector<Commitment> f_commitments;
    std::vector<Commitment> g_commitments;
    for (auto& commitment : commitments.get_unshifted()) {
        f_commitments.emplace_back(commitment);
    }
    for (auto& commitment : commitments.get_to_be_shifted()) {
        g_commitments.emplace_back(commitment);
    }

    // Compute commitment C_{Z_x}
    Commitment C_Z_x = ZeroMorph::compute_C_Z_x(
        f_commitments, g_commitments, C_q_k, rho, batched_evaluation, x_challenge, multivariate_challenge);

    // Compute commitment C_{\zeta,Z}
    auto C_zeta_Z = C_zeta_x + C_Z_x * z_challenge;

    // Receive proof commitment \pi
    auto C_pi = transcript.template receive_from_prover<Commitment>("ZM:PI");

    // Construct inputs and perform pairing check to verify claimed evaluation
    // Note: The pairing check (without the degree check component X^{N_max-N-1}) can be expressed naturally as
    // e(C_{\zeta,Z}, [1]_2) = e(pi, [X - x]_2). This can be rearranged (e.g. see the plonk paper) as
    // e(C_{\zeta,Z} - x*pi, [1]_2) * e(-pi, [X]_2) = 1, or
    // e(P_0, [1]_2) * e(P_1, [X]_2) = 1
    auto P0 = C_zeta_Z + C_pi * x_challenge;
    auto P1 = -C_pi;
    auto verified = pcs_verification_key->pairing_check(P0, P1);

    return sumcheck_verified.value() && verified;
}

template class UltraVerifier_<honk::flavor::Ultra>;
template class UltraVerifier_<honk::flavor::UltraGrumpkin>;
template class UltraVerifier_<honk::flavor::GoblinUltra>;

} // namespace proof_system::honk

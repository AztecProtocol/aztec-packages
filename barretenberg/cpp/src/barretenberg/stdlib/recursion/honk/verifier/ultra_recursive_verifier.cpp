#include "barretenberg/stdlib/recursion/honk/verifier/ultra_recursive_verifier.hpp"
#include "barretenberg/honk/pcs/zeromorph/zeromorph.hpp"
#include "barretenberg/honk/transcript/transcript.hpp"
#include "barretenberg/honk/utils/grand_product_delta.hpp"
#include "barretenberg/honk/utils/power_polynomial.hpp"
#include "barretenberg/numeric/bitop/get_msb.hpp"

namespace proof_system::plonk::stdlib::recursion::honk {

template <typename Flavor>
UltraRecursiveVerifier_<Flavor>::UltraRecursiveVerifier_(Builder* builder,
                                                         std::shared_ptr<VerificationKey> verifier_key)
    : key(verifier_key)
    , builder(builder)
{}

/**
 * @brief This function constructs a recursive verifier circuit for an Ultra Honk proof of a given flavor.
 *
 */
template <typename Flavor>
std::array<typename Flavor::GroupElement, 2> UltraRecursiveVerifier_<Flavor>::verify_proof(const plonk::proof& proof)
{
    using Sumcheck = ::proof_system::honk::sumcheck::SumcheckVerifier<Flavor>;
    using Curve = typename Flavor::Curve;
    using ZeroMorph = ::proof_system::honk::pcs::zeromorph::ZeroMorphVerifier_<Curve>;
    using VerifierCommitments = typename Flavor::VerifierCommitments;
    using CommitmentLabels = typename Flavor::CommitmentLabels;
    using RelationParams = ::proof_system::RelationParameters<FF>;

    RelationParams relation_parameters;

    info("Initial: num gates = ", builder->get_num_gates());
    size_t prev_num_gates = builder->get_num_gates();

    transcript = Transcript<Builder>{ builder, proof.proof_data };

    auto commitments = VerifierCommitments(key);
    auto commitment_labels = CommitmentLabels();

    const auto circuit_size = transcript.template receive_from_prover<uint32_t>("circuit_size");
    const auto public_input_size = transcript.template receive_from_prover<uint32_t>("public_input_size");
    const auto pub_inputs_offset = transcript.template receive_from_prover<uint32_t>("pub_inputs_offset");
    const auto log_circuit_size = numeric::get_msb32(static_cast<uint32_t>(circuit_size.get_value()));

    // For debugging purposes only
    ASSERT(static_cast<uint32_t>(circuit_size.get_value()) == key->circuit_size);
    ASSERT(static_cast<uint32_t>(public_input_size.get_value()) == key->num_public_inputs);

    std::vector<FF> public_inputs;
    for (size_t i = 0; i < key->num_public_inputs; ++i) {
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

    const FF public_input_delta = proof_system::honk::compute_public_input_delta<Flavor>(
        public_inputs, beta, gamma, circuit_size, static_cast<uint32_t>(pub_inputs_offset.get_value()));
    const FF lookup_grand_product_delta =
        proof_system::honk::compute_lookup_grand_product_delta<FF>(beta, gamma, circuit_size);

    relation_parameters.beta = beta;
    relation_parameters.gamma = gamma;
    relation_parameters.public_input_delta = public_input_delta;
    relation_parameters.lookup_grand_product_delta = lookup_grand_product_delta;

    // Get commitment to permutation and lookup grand products
    commitments.z_perm = transcript.template receive_from_prover<Commitment>(commitment_labels.z_perm);
    commitments.z_lookup = transcript.template receive_from_prover<Commitment>(commitment_labels.z_lookup);

    // Execute Sumcheck Verifier and extract multivariate opening point u = (u_0, ..., u_{d-1}) and purported
    // multivariate evaluations at u
    auto sumcheck = Sumcheck(key->circuit_size);
    auto [multivariate_challenge, claimed_evaluations, verified] = sumcheck.verify(relation_parameters, transcript);

    info("Sumcheck: num gates = ",
         builder->get_num_gates() - prev_num_gates,
         ", (total = ",
         builder->get_num_gates(),
         ")");
    prev_num_gates = builder->get_num_gates();

    // Compute powers of batching challenge rho
    FF rho = transcript.get_challenge("rho");
    std::vector<FF> rhos = ::proof_system::honk::pcs::zeromorph::powers_of_challenge(rho, Flavor::NUM_ALL_ENTITIES);

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

    return { P0, P1 };
}

template class UltraRecursiveVerifier_<proof_system::honk::flavor::UltraRecursive_<UltraCircuitBuilder>>;
template class UltraRecursiveVerifier_<proof_system::honk::flavor::UltraRecursive_<GoblinUltraCircuitBuilder>>;
template class UltraRecursiveVerifier_<proof_system::honk::flavor::GoblinUltraRecursive_<UltraCircuitBuilder>>;
template class UltraRecursiveVerifier_<proof_system::honk::flavor::GoblinUltraRecursive_<GoblinUltraCircuitBuilder>>;

} // namespace proof_system::plonk::stdlib::recursion::honk

// #include "./ultra_verifier.hpp"
#include "barretenberg/stdlib/recursion/honk/verifier/ultra_recursive_verifier.hpp"
#include "barretenberg/honk/flavor/standard.hpp"
#include "barretenberg/honk/transcript/transcript.hpp"
#include "barretenberg/honk/utils/grand_product_delta.hpp"
#include "barretenberg/honk/utils/power_polynomial.hpp"
#include "barretenberg/numeric/bitop/get_msb.hpp"

using namespace barretenberg;
using namespace proof_system::honk::sumcheck;

namespace proof_system::plonk::stdlib::recursion::honk {
template <typename Flavor>
UltraRecursiveVerifier_<Flavor>::UltraRecursiveVerifier_(Builder* builder,
                                                         std::shared_ptr<typename Flavor::VerificationKey> verifier_key)
    : key(verifier_key)
    , builder(builder)
{}

template <typename Flavor>
UltraRecursiveVerifier_<Flavor>::UltraRecursiveVerifier_(UltraRecursiveVerifier_&& other) noexcept
    : key(std::move(other.key))
    , pcs_verification_key(std::move(other.pcs_verification_key))
{}

template <typename Flavor>
UltraRecursiveVerifier_<Flavor>& UltraRecursiveVerifier_<Flavor>::operator=(UltraRecursiveVerifier_&& other) noexcept
{
    key = other.key;
    pcs_verification_key = (std::move(other.pcs_verification_key));
    commitments.clear();
    pcs_fr_elements.clear();
    return *this;
}

/**
 * @brief This function verifies an Ultra Honk proof for given program settings.
 *
 */
template <typename Flavor> bool UltraRecursiveVerifier_<Flavor>::verify_proof(const plonk::proof& proof)
{
    using FF = typename Flavor::FF;
    // using GroupElement = typename Flavor::GroupElement;
    using Commitment = typename Flavor::Commitment;
    // using PCSParams = typename Flavor::PCSParams;
    // using PCS = typename Flavor::PCS;
    // using Gemini = pcs::gemini::GeminiVerifier_<PCSParams>;
    // using Shplonk = pcs::shplonk::ShplonkVerifier_<PCSParams>;
    using VerifierCommitments = typename Flavor::VerifierCommitments;
    using CommitmentLabels = typename Flavor::CommitmentLabels;

    RelationParameters<FF> relation_parameters;

    transcript = Transcript<Builder>{ builder, proof.proof_data };

    auto commitments = VerifierCommitments(key);
    auto commitment_labels = CommitmentLabels();

    // TODO(Adrian): Change the initialization of the transcript to take the VK hash?
    const auto circuit_size = transcript.template receive_from_prover<uint32_t>("circuit_size");
    const auto public_input_size = transcript.template receive_from_prover<uint32_t>("public_input_size");
    const auto pub_inputs_offset = transcript.template receive_from_prover<uint32_t>("pub_inputs_offset");

    // WORKTODO: need these simple native types in some locations. How to do this properly?
    auto circuit_size_native = static_cast<size_t>(circuit_size.get_value());
    auto public_input_size_native = static_cast<size_t>(public_input_size.get_value());
    auto pub_inputs_offset_native = static_cast<size_t>(pub_inputs_offset.get_value());

    if (circuit_size_native != key->circuit_size) {
        return false;
    }
    if (public_input_size_native != key->num_public_inputs) {
        return false;
    }

    std::vector<FF> public_inputs;
    for (size_t i = 0; i < public_input_size_native; ++i) {
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
        public_inputs, beta, gamma, circuit_size, pub_inputs_offset_native);
    const FF lookup_grand_product_delta =
        proof_system::honk::compute_lookup_grand_product_delta<FF>(beta, gamma, circuit_size);

    relation_parameters.beta = beta;
    relation_parameters.gamma = gamma;
    relation_parameters.public_input_delta = public_input_delta;
    relation_parameters.lookup_grand_product_delta = lookup_grand_product_delta;

    // Get commitment to permutation and lookup grand products
    commitments.z_perm = transcript.template receive_from_prover<Commitment>(commitment_labels.z_perm);
    commitments.z_lookup = transcript.template receive_from_prover<Commitment>(commitment_labels.z_lookup);

    // Execute Sumcheck Verifier
    auto sumcheck = SumcheckVerifier<Flavor>(circuit_size_native);

    std::optional sumcheck_output = sumcheck.verify(relation_parameters, transcript);

    // Note(luke): Temporary. Done only to complete manifest through sumcheck. Delete once we proceed to Gemini.
    [[maybe_unused]] FF rho = transcript.get_challenge("rho");

    // If Sumcheck does not return an output, sumcheck verification has failed
    if (!sumcheck_output.has_value()) {
        return false;
    } else {
        return true;
    }

    // auto [multivariate_challenge, purported_evaluations] = *sumcheck_output;

    // // Execute Gemini/Shplonk verification:

    // // Construct inputs for Gemini verifier:
    // // - Multivariate opening point u = (u_0, ..., u_{d-1})
    // // - batched unshifted and to-be-shifted polynomial commitments
    // auto batched_commitment_unshifted = GroupElement::zero();
    // auto batched_commitment_to_be_shifted = GroupElement::zero();

    // // Compute powers of batching challenge rho
    // FF rho = transcript.get_challenge("rho");
    // std::vector<FF> rhos = pcs::gemini::powers_of_rho(rho, Flavor::NUM_ALL_ENTITIES);

    // // Compute batched multivariate evaluation
    // FF batched_evaluation = FF::zero();
    // size_t evaluation_idx = 0;
    // for (auto& value : purported_evaluations.get_unshifted_then_shifted()) {
    //     batched_evaluation += value * rhos[evaluation_idx];
    //     ++evaluation_idx;
    // }

    // // Construct batched commitment for NON-shifted polynomials
    // size_t commitment_idx = 0;
    // for (auto& commitment : commitments.get_unshifted()) {
    //         batched_commitment_unshifted += commitment * rhos[commitment_idx];
    //     ++commitment_idx;
    // }

    // // Construct batched commitment for to-be-shifted polynomials
    // for (auto& commitment : commitments.get_to_be_shifted()) {
    //     batched_commitment_to_be_shifted += commitment * rhos[commitment_idx];
    //     ++commitment_idx;
    // }

    // // Produce a Gemini claim consisting of:
    // // - d+1 commitments [Fold_{r}^(0)], [Fold_{-r}^(0)], and [Fold^(l)], l = 1:d-1
    // // - d+1 evaluations a_0_pos, and a_l, l = 0:d-1
    // auto gemini_claim = Gemini::reduce_verification(multivariate_challenge,
    //                                           batched_evaluation,
    //                                           batched_commitment_unshifted,
    //                                           batched_commitment_to_be_shifted,
    //                                           transcript);

    // // Produce a Shplonk claim: commitment [Q] - [Q_z], evaluation zero (at random challenge z)
    // auto shplonk_claim = Shplonk::reduce_verification(pcs_verification_key, gemini_claim, transcript);

    // // // Verify the Shplonk claim with KZG or IPA
    // return PCS::verify(pcs_verification_key, shplonk_claim, transcript);
}

template class UltraRecursiveVerifier_<proof_system::honk::flavor::UltraRecursive>;

} // namespace proof_system::plonk::stdlib::recursion::honk

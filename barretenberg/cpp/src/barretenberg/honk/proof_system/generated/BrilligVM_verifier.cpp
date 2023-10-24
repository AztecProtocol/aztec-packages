

#include "./BrilligVM_verifier.hpp"
#include "barretenberg/honk/flavor/generated/BrilligVM_flavor.hpp"
#include "barretenberg/honk/pcs/gemini/gemini.hpp"
#include "barretenberg/honk/pcs/shplonk/shplonk.hpp"
#include "barretenberg/honk/transcript/transcript.hpp"
#include "barretenberg/honk/utils/power_polynomial.hpp"
#include "barretenberg/numeric/bitop/get_msb.hpp"

using namespace barretenberg;
using namespace proof_system::honk::sumcheck;

namespace proof_system::honk {
template <typename Flavor>
BrilligVMVerifier_<Flavor>::BrilligVMVerifier_(std::shared_ptr<typename Flavor::VerificationKey> verifier_key)
    : key(verifier_key)
{}

template <typename Flavor>
BrilligVMVerifier_<Flavor>::BrilligVMVerifier_(BrilligVMVerifier_&& other) noexcept
    : key(std::move(other.key))
    , pcs_verification_key(std::move(other.pcs_verification_key))
{}

template <typename Flavor>
BrilligVMVerifier_<Flavor>& BrilligVMVerifier_<Flavor>::operator=(BrilligVMVerifier_&& other) noexcept
{
    key = other.key;
    pcs_verification_key = (std::move(other.pcs_verification_key));
    commitments.clear();
    pcs_fr_elements.clear();
    return *this;
}

/**
 * @brief This function verifies an BrilligVM Honk proof for given program settings.
 *
 */
template <typename Flavor> bool BrilligVMVerifier_<Flavor>::verify_proof(const plonk::proof& proof)
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
    commitments.main_POSITIVE = transcript.template receive_from_prover<Commitment>(commitment_labels.main_POSITIVE);
    commitments.main_FIRST = transcript.template receive_from_prover<Commitment>(commitment_labels.main_FIRST);
    commitments.main_LAST = transcript.template receive_from_prover<Commitment>(commitment_labels.main_LAST);
    commitments.main_STEP = transcript.template receive_from_prover<Commitment>(commitment_labels.main_STEP);
    commitments.main__romgen_first_step =
        transcript.template receive_from_prover<Commitment>(commitment_labels.main__romgen_first_step);
    commitments.main_first_step =
        transcript.template receive_from_prover<Commitment>(commitment_labels.main_first_step);
    commitments.main_p_line = transcript.template receive_from_prover<Commitment>(commitment_labels.main_p_line);
    commitments.main_p_X_const = transcript.template receive_from_prover<Commitment>(commitment_labels.main_p_X_const);
    commitments.main_p_instr__jump_to_operation =
        transcript.template receive_from_prover<Commitment>(commitment_labels.main_p_instr__jump_to_operation);
    commitments.main_p_instr__loop =
        transcript.template receive_from_prover<Commitment>(commitment_labels.main_p_instr__loop);
    commitments.main_p_instr__reset =
        transcript.template receive_from_prover<Commitment>(commitment_labels.main_p_instr__reset);
    commitments.main_p_instr_call =
        transcript.template receive_from_prover<Commitment>(commitment_labels.main_p_instr_call);
    commitments.main_p_instr_call_param_l =
        transcript.template receive_from_prover<Commitment>(commitment_labels.main_p_instr_call_param_l);
    commitments.main_p_instr_ret =
        transcript.template receive_from_prover<Commitment>(commitment_labels.main_p_instr_ret);
    commitments.main_p_instr_return =
        transcript.template receive_from_prover<Commitment>(commitment_labels.main_p_instr_return);
    commitments.main_p_reg_write_X_r0 =
        transcript.template receive_from_prover<Commitment>(commitment_labels.main_p_reg_write_X_r0);
    commitments.main_p_reg_write_X_r1 =
        transcript.template receive_from_prover<Commitment>(commitment_labels.main_p_reg_write_X_r1);
    commitments.main_p_reg_write_X_r3 =
        transcript.template receive_from_prover<Commitment>(commitment_labels.main_p_reg_write_X_r3);
    commitments.main__block_enforcer_last_step =
        transcript.template receive_from_prover<Commitment>(commitment_labels.main__block_enforcer_last_step);
    commitments.main__linker_first_step =
        transcript.template receive_from_prover<Commitment>(commitment_labels.main__linker_first_step);
    commitments.main_XInv = transcript.template receive_from_prover<Commitment>(commitment_labels.main_XInv);
    commitments.main_XIsZero = transcript.template receive_from_prover<Commitment>(commitment_labels.main_XIsZero);
    commitments.main_m_addr = transcript.template receive_from_prover<Commitment>(commitment_labels.main_m_addr);
    commitments.main_m_step = transcript.template receive_from_prover<Commitment>(commitment_labels.main_m_step);
    commitments.main_m_change = transcript.template receive_from_prover<Commitment>(commitment_labels.main_m_change);
    commitments.main_m_value = transcript.template receive_from_prover<Commitment>(commitment_labels.main_m_value);
    commitments.main_m_op = transcript.template receive_from_prover<Commitment>(commitment_labels.main_m_op);
    commitments.main_m_is_write =
        transcript.template receive_from_prover<Commitment>(commitment_labels.main_m_is_write);
    commitments.main_m_is_read = transcript.template receive_from_prover<Commitment>(commitment_labels.main_m_is_read);
    commitments.main__operation_id =
        transcript.template receive_from_prover<Commitment>(commitment_labels.main__operation_id);
    commitments.main__sigma = transcript.template receive_from_prover<Commitment>(commitment_labels.main__sigma);
    commitments.main_pc = transcript.template receive_from_prover<Commitment>(commitment_labels.main_pc);
    commitments.main_X = transcript.template receive_from_prover<Commitment>(commitment_labels.main_X);
    commitments.main_Y = transcript.template receive_from_prover<Commitment>(commitment_labels.main_Y);
    commitments.main_Z = transcript.template receive_from_prover<Commitment>(commitment_labels.main_Z);
    commitments.main_jump_ptr = transcript.template receive_from_prover<Commitment>(commitment_labels.main_jump_ptr);
    commitments.main_addr = transcript.template receive_from_prover<Commitment>(commitment_labels.main_addr);
    commitments.main_tmp = transcript.template receive_from_prover<Commitment>(commitment_labels.main_tmp);
    commitments.main_reg_write_X_r0 =
        transcript.template receive_from_prover<Commitment>(commitment_labels.main_reg_write_X_r0);
    commitments.main_r0 = transcript.template receive_from_prover<Commitment>(commitment_labels.main_r0);
    commitments.main_reg_write_X_r1 =
        transcript.template receive_from_prover<Commitment>(commitment_labels.main_reg_write_X_r1);
    commitments.main_r1 = transcript.template receive_from_prover<Commitment>(commitment_labels.main_r1);
    commitments.main_r2 = transcript.template receive_from_prover<Commitment>(commitment_labels.main_r2);
    commitments.main_reg_write_X_r3 =
        transcript.template receive_from_prover<Commitment>(commitment_labels.main_reg_write_X_r3);
    commitments.main_r3 = transcript.template receive_from_prover<Commitment>(commitment_labels.main_r3);
    commitments.main_r4 = transcript.template receive_from_prover<Commitment>(commitment_labels.main_r4);
    commitments.main_r5 = transcript.template receive_from_prover<Commitment>(commitment_labels.main_r5);
    commitments.main_r6 = transcript.template receive_from_prover<Commitment>(commitment_labels.main_r6);
    commitments.main_r7 = transcript.template receive_from_prover<Commitment>(commitment_labels.main_r7);
    commitments.main_r8 = transcript.template receive_from_prover<Commitment>(commitment_labels.main_r8);
    commitments.main_r9 = transcript.template receive_from_prover<Commitment>(commitment_labels.main_r9);
    commitments.main_r10 = transcript.template receive_from_prover<Commitment>(commitment_labels.main_r10);
    commitments.main_r11 = transcript.template receive_from_prover<Commitment>(commitment_labels.main_r11);
    commitments.main_instr_call =
        transcript.template receive_from_prover<Commitment>(commitment_labels.main_instr_call);
    commitments.main_instr_call_param_l =
        transcript.template receive_from_prover<Commitment>(commitment_labels.main_instr_call_param_l);
    commitments.main_instr_ret = transcript.template receive_from_prover<Commitment>(commitment_labels.main_instr_ret);
    commitments.main_instr__jump_to_operation =
        transcript.template receive_from_prover<Commitment>(commitment_labels.main_instr__jump_to_operation);
    commitments.main_instr__reset =
        transcript.template receive_from_prover<Commitment>(commitment_labels.main_instr__reset);
    commitments.main_instr__loop =
        transcript.template receive_from_prover<Commitment>(commitment_labels.main_instr__loop);
    commitments.main_instr_return =
        transcript.template receive_from_prover<Commitment>(commitment_labels.main_instr_return);
    commitments.main_X_const = transcript.template receive_from_prover<Commitment>(commitment_labels.main_X_const);
    commitments.main_X_free_value =
        transcript.template receive_from_prover<Commitment>(commitment_labels.main_X_free_value);
    commitments.main_Y_free_value =
        transcript.template receive_from_prover<Commitment>(commitment_labels.main_Y_free_value);
    commitments.main_Z_free_value =
        transcript.template receive_from_prover<Commitment>(commitment_labels.main_Z_free_value);
    commitments.main__operation_id_no_change =
        transcript.template receive_from_prover<Commitment>(commitment_labels.main__operation_id_no_change);

    // Permutation / logup related stuff?
    // Get challenge for sorted list batching and wire four memory records
    // auto [beta, gamma] = transcript.get_challenges("bbeta", "gamma");
    // relation_parameters.gamma = gamma;
    // auto beta_sqr = beta * beta;
    // relation_parameters.beta = beta;
    // relation_parameters.beta_sqr = beta_sqr;
    // relation_parameters.beta_cube = beta_sqr * beta;
    // relation_parameters.BrilligVM_set_permutation_delta =
    //     gamma * (gamma + beta_sqr) * (gamma + beta_sqr + beta_sqr) * (gamma + beta_sqr + beta_sqr + beta_sqr);
    // relation_parameters.BrilligVM_set_permutation_delta =
    // relation_parameters.BrilligVM_set_permutation_delta.invert();

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
        // TODO(@zac-williamson) ensure BrilligVM polynomial commitments are never points at infinity (#2214)
        if (commitment.y != 0) {
            batched_commitment_unshifted += commitment * rhos[commitment_idx];
        } else {
            info("point at infinity (unshifted)");
        }
        ++commitment_idx;
    }

    // Construct batched commitment for to-be-shifted polynomials
    for (auto& commitment : commitments.get_to_be_shifted()) {
        // TODO(@zac-williamson) ensure BrilligVM polynomial commitments are never points at infinity (#2214)
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

template class BrilligVMVerifier_<honk::flavor::BrilligVMFlavor>;

} // namespace proof_system::honk

#include "./goblin_translator_verifier.hpp"
#include "barretenberg/commitment_schemes/zeromorph/zeromorph.hpp"
#include "barretenberg/flavor/goblin_translator.hpp"
#include "barretenberg/honk/proof_system/power_polynomial.hpp"
#include "barretenberg/numeric/bitop/get_msb.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/transcript/transcript.hpp"

using namespace barretenberg;
using namespace proof_system::honk::sumcheck;

namespace proof_system::honk {
template <typename Flavor>
GoblinTranslatorVerifier_<Flavor>::GoblinTranslatorVerifier_(
    std::shared_ptr<typename Flavor::VerificationKey> verifier_key)
    : key(verifier_key)
{}

template <typename Flavor>
GoblinTranslatorVerifier_<Flavor>::GoblinTranslatorVerifier_(GoblinTranslatorVerifier_&& other) noexcept
    : key(std::move(other.key))
    , pcs_verification_key(std::move(other.pcs_verification_key))
{}

template <typename Flavor>
GoblinTranslatorVerifier_<Flavor>& GoblinTranslatorVerifier_<Flavor>::operator=(
    GoblinTranslatorVerifier_&& other) noexcept
{
    key = other.key;
    pcs_verification_key = (std::move(other.pcs_verification_key));
    commitments.clear();
    pcs_fr_elements.clear();
    return *this;
}

/**
 * @brief This function verifies an GoblinTranslator Honk proof for given program settings.
 *
 */
template <typename Flavor>
bool GoblinTranslatorVerifier_<Flavor>::verify_proof(
    const plonk::proof& proof, const GoblinTranslationConsistencyData& translation_consistency_data)
{

    using FF = typename Flavor::FF;
    using BF = typename Flavor::BF;
    using Commitment = typename Flavor::Commitment;
    using Curve = typename Flavor::Curve;
    using ZeroMorph = pcs::zeromorph::ZeroMorphVerifier_<Curve>;
    using VerifierCommitments = typename Flavor::VerifierCommitments;
    using CommitmentLabels = typename Flavor::CommitmentLabels;

    const size_t NUM_LIMB_BITS = Flavor::NUM_LIMB_BITS;
    RelationParameters<FF> relation_parameters;

    transcript = BaseTranscript<FF>{ proof.proof_data };

    auto commitments = VerifierCommitments(key, transcript);
    auto commitment_labels = CommitmentLabels();

    // TODO(Adrian): Change the initialization of the transcript to take the VK hash?
    const auto circuit_size = transcript.template receive_from_prover<uint32_t>("circuit_size");
    evaluation_input_x = transcript.template receive_from_prover<BF>("evaluation_input_x");
    batching_challenge_v = transcript.template receive_from_prover<BF>("batching_challenge_v");
    const auto uint_accumulated_result = uint256_t(transcript.template receive_from_prover<BF>("accumulated_result"));
    auto uint_evaluation_input = uint256_t(evaluation_input_x);
    relation_parameters.evaluation_input_x = { uint_evaluation_input.slice(0, NUM_LIMB_BITS),
                                               uint_evaluation_input.slice(NUM_LIMB_BITS, NUM_LIMB_BITS * 2),
                                               uint_evaluation_input.slice(NUM_LIMB_BITS * 2, NUM_LIMB_BITS * 3),
                                               uint_evaluation_input.slice(NUM_LIMB_BITS * 3, NUM_LIMB_BITS * 4),
                                               uint_evaluation_input };
    relation_parameters.accumulated_result = {
        uint_accumulated_result.slice(0, NUM_LIMB_BITS),
        uint_accumulated_result.slice(NUM_LIMB_BITS, NUM_LIMB_BITS * 2),
        uint_accumulated_result.slice(NUM_LIMB_BITS * 2, NUM_LIMB_BITS * 3),
        uint_accumulated_result.slice(NUM_LIMB_BITS * 3, NUM_LIMB_BITS * 4),
    };
    std::vector<uint256_t> uint_batching_challenge_powers;
    uint_batching_challenge_powers.emplace_back(batching_challenge_v);
    auto running_power = batching_challenge_v * batching_challenge_v;
    uint_batching_challenge_powers.emplace_back(running_power);
    running_power *= batching_challenge_v;
    uint_batching_challenge_powers.emplace_back(running_power);
    running_power *= batching_challenge_v;
    uint_batching_challenge_powers.emplace_back(running_power);

    for (size_t i = 0; i < 4; i++) {
        relation_parameters.batching_challenge_v[i] = {
            uint_batching_challenge_powers[i].slice(0, NUM_LIMB_BITS),
            uint_batching_challenge_powers[i].slice(NUM_LIMB_BITS, NUM_LIMB_BITS * 2),
            uint_batching_challenge_powers[i].slice(NUM_LIMB_BITS * 2, NUM_LIMB_BITS * 3),
            uint_batching_challenge_powers[i].slice(NUM_LIMB_BITS * 3, NUM_LIMB_BITS * 4),
            uint_batching_challenge_powers[i]
        };
    }
    if (circuit_size != key->circuit_size) {
        return false;
    }

    // Get commitments

    // Get all the values of wires
    commitments.op = transcript.template receive_from_prover<Commitment>(commitment_labels.op);
    commitments.x_lo_y_hi = transcript.template receive_from_prover<Commitment>(commitment_labels.x_lo_y_hi);
    commitments.x_hi_z_1 = transcript.template receive_from_prover<Commitment>(commitment_labels.x_hi_z_1);
    commitments.y_lo_z_2 = transcript.template receive_from_prover<Commitment>(commitment_labels.y_lo_z_2);
    commitments.p_x_low_limbs = transcript.template receive_from_prover<Commitment>(commitment_labels.p_x_low_limbs);
    commitments.p_x_low_limbs_range_constraint_0 =
        transcript.template receive_from_prover<Commitment>(commitment_labels.p_x_low_limbs_range_constraint_0);
    commitments.p_x_low_limbs_range_constraint_1 =
        transcript.template receive_from_prover<Commitment>(commitment_labels.p_x_low_limbs_range_constraint_1);
    commitments.p_x_low_limbs_range_constraint_2 =
        transcript.template receive_from_prover<Commitment>(commitment_labels.p_x_low_limbs_range_constraint_2);
    commitments.p_x_low_limbs_range_constraint_3 =
        transcript.template receive_from_prover<Commitment>(commitment_labels.p_x_low_limbs_range_constraint_3);
    commitments.p_x_low_limbs_range_constraint_4 =
        transcript.template receive_from_prover<Commitment>(commitment_labels.p_x_low_limbs_range_constraint_4);
    commitments.p_x_low_limbs_range_constraint_tail =
        transcript.template receive_from_prover<Commitment>(commitment_labels.p_x_low_limbs_range_constraint_tail);
    commitments.p_x_high_limbs = transcript.template receive_from_prover<Commitment>(commitment_labels.p_x_high_limbs);
    commitments.p_x_high_limbs_range_constraint_0 =
        transcript.template receive_from_prover<Commitment>(commitment_labels.p_x_high_limbs_range_constraint_0);
    commitments.p_x_high_limbs_range_constraint_1 =
        transcript.template receive_from_prover<Commitment>(commitment_labels.p_x_high_limbs_range_constraint_1);
    commitments.p_x_high_limbs_range_constraint_2 =
        transcript.template receive_from_prover<Commitment>(commitment_labels.p_x_high_limbs_range_constraint_2);
    commitments.p_x_high_limbs_range_constraint_3 =
        transcript.template receive_from_prover<Commitment>(commitment_labels.p_x_high_limbs_range_constraint_3);
    commitments.p_x_high_limbs_range_constraint_4 =
        transcript.template receive_from_prover<Commitment>(commitment_labels.p_x_high_limbs_range_constraint_4);
    commitments.p_x_high_limbs_range_constraint_tail =
        transcript.template receive_from_prover<Commitment>(commitment_labels.p_x_high_limbs_range_constraint_tail);
    commitments.p_y_low_limbs = transcript.template receive_from_prover<Commitment>(commitment_labels.p_y_low_limbs);
    commitments.p_y_low_limbs_range_constraint_0 =
        transcript.template receive_from_prover<Commitment>(commitment_labels.p_y_low_limbs_range_constraint_0);
    commitments.p_y_low_limbs_range_constraint_1 =
        transcript.template receive_from_prover<Commitment>(commitment_labels.p_y_low_limbs_range_constraint_1);
    commitments.p_y_low_limbs_range_constraint_2 =
        transcript.template receive_from_prover<Commitment>(commitment_labels.p_y_low_limbs_range_constraint_2);
    commitments.p_y_low_limbs_range_constraint_3 =
        transcript.template receive_from_prover<Commitment>(commitment_labels.p_y_low_limbs_range_constraint_3);
    commitments.p_y_low_limbs_range_constraint_4 =
        transcript.template receive_from_prover<Commitment>(commitment_labels.p_y_low_limbs_range_constraint_4);
    commitments.p_y_low_limbs_range_constraint_tail =
        transcript.template receive_from_prover<Commitment>(commitment_labels.p_y_low_limbs_range_constraint_tail);
    commitments.p_y_high_limbs = transcript.template receive_from_prover<Commitment>(commitment_labels.p_y_high_limbs);
    commitments.p_y_high_limbs_range_constraint_0 =
        transcript.template receive_from_prover<Commitment>(commitment_labels.p_y_high_limbs_range_constraint_0);
    commitments.p_y_high_limbs_range_constraint_1 =
        transcript.template receive_from_prover<Commitment>(commitment_labels.p_y_high_limbs_range_constraint_1);
    commitments.p_y_high_limbs_range_constraint_2 =
        transcript.template receive_from_prover<Commitment>(commitment_labels.p_y_high_limbs_range_constraint_2);
    commitments.p_y_high_limbs_range_constraint_3 =
        transcript.template receive_from_prover<Commitment>(commitment_labels.p_y_high_limbs_range_constraint_3);
    commitments.p_y_high_limbs_range_constraint_4 =
        transcript.template receive_from_prover<Commitment>(commitment_labels.p_y_high_limbs_range_constraint_4);
    commitments.p_y_high_limbs_range_constraint_tail =
        transcript.template receive_from_prover<Commitment>(commitment_labels.p_y_high_limbs_range_constraint_tail);
    commitments.z_low_limbs = transcript.template receive_from_prover<Commitment>(commitment_labels.z_low_limbs);
    commitments.z_low_limbs_range_constraint_0 =
        transcript.template receive_from_prover<Commitment>(commitment_labels.z_low_limbs_range_constraint_0);
    commitments.z_low_limbs_range_constraint_1 =
        transcript.template receive_from_prover<Commitment>(commitment_labels.z_low_limbs_range_constraint_1);
    commitments.z_low_limbs_range_constraint_2 =
        transcript.template receive_from_prover<Commitment>(commitment_labels.z_low_limbs_range_constraint_2);
    commitments.z_low_limbs_range_constraint_3 =
        transcript.template receive_from_prover<Commitment>(commitment_labels.z_low_limbs_range_constraint_3);
    commitments.z_low_limbs_range_constraint_4 =
        transcript.template receive_from_prover<Commitment>(commitment_labels.z_low_limbs_range_constraint_4);
    commitments.z_low_limbs_range_constraint_tail =
        transcript.template receive_from_prover<Commitment>(commitment_labels.z_low_limbs_range_constraint_tail);
    commitments.z_high_limbs = transcript.template receive_from_prover<Commitment>(commitment_labels.z_high_limbs);
    commitments.z_high_limbs_range_constraint_0 =
        transcript.template receive_from_prover<Commitment>(commitment_labels.z_high_limbs_range_constraint_0);
    commitments.z_high_limbs_range_constraint_1 =
        transcript.template receive_from_prover<Commitment>(commitment_labels.z_high_limbs_range_constraint_1);
    commitments.z_high_limbs_range_constraint_2 =
        transcript.template receive_from_prover<Commitment>(commitment_labels.z_high_limbs_range_constraint_2);
    commitments.z_high_limbs_range_constraint_3 =
        transcript.template receive_from_prover<Commitment>(commitment_labels.z_high_limbs_range_constraint_3);
    commitments.z_high_limbs_range_constraint_4 =
        transcript.template receive_from_prover<Commitment>(commitment_labels.z_high_limbs_range_constraint_4);
    commitments.z_high_limbs_range_constraint_tail =
        transcript.template receive_from_prover<Commitment>(commitment_labels.z_high_limbs_range_constraint_tail);
    commitments.accumulators_binary_limbs_0 =
        transcript.template receive_from_prover<Commitment>(commitment_labels.accumulators_binary_limbs_0);
    commitments.accumulators_binary_limbs_1 =
        transcript.template receive_from_prover<Commitment>(commitment_labels.accumulators_binary_limbs_1);
    commitments.accumulators_binary_limbs_2 =
        transcript.template receive_from_prover<Commitment>(commitment_labels.accumulators_binary_limbs_2);
    commitments.accumulators_binary_limbs_3 =
        transcript.template receive_from_prover<Commitment>(commitment_labels.accumulators_binary_limbs_3);
    commitments.accumulator_low_limbs_range_constraint_0 =
        transcript.template receive_from_prover<Commitment>(commitment_labels.accumulator_low_limbs_range_constraint_0);
    commitments.accumulator_low_limbs_range_constraint_1 =
        transcript.template receive_from_prover<Commitment>(commitment_labels.accumulator_low_limbs_range_constraint_1);
    commitments.accumulator_low_limbs_range_constraint_2 =
        transcript.template receive_from_prover<Commitment>(commitment_labels.accumulator_low_limbs_range_constraint_2);
    commitments.accumulator_low_limbs_range_constraint_3 =
        transcript.template receive_from_prover<Commitment>(commitment_labels.accumulator_low_limbs_range_constraint_3);
    commitments.accumulator_low_limbs_range_constraint_4 =
        transcript.template receive_from_prover<Commitment>(commitment_labels.accumulator_low_limbs_range_constraint_4);
    commitments.accumulator_low_limbs_range_constraint_tail = transcript.template receive_from_prover<Commitment>(
        commitment_labels.accumulator_low_limbs_range_constraint_tail);
    commitments.accumulator_high_limbs_range_constraint_0 = transcript.template receive_from_prover<Commitment>(
        commitment_labels.accumulator_high_limbs_range_constraint_0);
    commitments.accumulator_high_limbs_range_constraint_1 = transcript.template receive_from_prover<Commitment>(
        commitment_labels.accumulator_high_limbs_range_constraint_1);
    commitments.accumulator_high_limbs_range_constraint_2 = transcript.template receive_from_prover<Commitment>(
        commitment_labels.accumulator_high_limbs_range_constraint_2);
    commitments.accumulator_high_limbs_range_constraint_3 = transcript.template receive_from_prover<Commitment>(
        commitment_labels.accumulator_high_limbs_range_constraint_3);
    commitments.accumulator_high_limbs_range_constraint_4 = transcript.template receive_from_prover<Commitment>(
        commitment_labels.accumulator_high_limbs_range_constraint_4);
    commitments.accumulator_high_limbs_range_constraint_tail = transcript.template receive_from_prover<Commitment>(
        commitment_labels.accumulator_high_limbs_range_constraint_tail);
    commitments.quotient_low_binary_limbs =
        transcript.template receive_from_prover<Commitment>(commitment_labels.quotient_low_binary_limbs);
    commitments.quotient_high_binary_limbs =
        transcript.template receive_from_prover<Commitment>(commitment_labels.quotient_high_binary_limbs);
    commitments.quotient_low_limbs_range_constraint_0 =
        transcript.template receive_from_prover<Commitment>(commitment_labels.quotient_low_limbs_range_constraint_0);
    commitments.quotient_low_limbs_range_constraint_1 =
        transcript.template receive_from_prover<Commitment>(commitment_labels.quotient_low_limbs_range_constraint_1);
    commitments.quotient_low_limbs_range_constraint_2 =
        transcript.template receive_from_prover<Commitment>(commitment_labels.quotient_low_limbs_range_constraint_2);
    commitments.quotient_low_limbs_range_constraint_3 =
        transcript.template receive_from_prover<Commitment>(commitment_labels.quotient_low_limbs_range_constraint_3);
    commitments.quotient_low_limbs_range_constraint_4 =
        transcript.template receive_from_prover<Commitment>(commitment_labels.quotient_low_limbs_range_constraint_4);
    commitments.quotient_low_limbs_range_constraint_tail =
        transcript.template receive_from_prover<Commitment>(commitment_labels.quotient_low_limbs_range_constraint_tail);
    commitments.quotient_high_limbs_range_constraint_0 =
        transcript.template receive_from_prover<Commitment>(commitment_labels.quotient_high_limbs_range_constraint_0);
    commitments.quotient_high_limbs_range_constraint_1 =
        transcript.template receive_from_prover<Commitment>(commitment_labels.quotient_high_limbs_range_constraint_1);
    commitments.quotient_high_limbs_range_constraint_2 =
        transcript.template receive_from_prover<Commitment>(commitment_labels.quotient_high_limbs_range_constraint_2);
    commitments.quotient_high_limbs_range_constraint_3 =
        transcript.template receive_from_prover<Commitment>(commitment_labels.quotient_high_limbs_range_constraint_3);
    commitments.quotient_high_limbs_range_constraint_4 =
        transcript.template receive_from_prover<Commitment>(commitment_labels.quotient_high_limbs_range_constraint_4);
    commitments.quotient_high_limbs_range_constraint_tail = transcript.template receive_from_prover<Commitment>(
        commitment_labels.quotient_high_limbs_range_constraint_tail);
    commitments.relation_wide_limbs =
        transcript.template receive_from_prover<Commitment>(commitment_labels.relation_wide_limbs);
    commitments.relation_wide_limbs_range_constraint_0 =
        transcript.template receive_from_prover<Commitment>(commitment_labels.relation_wide_limbs_range_constraint_0);
    commitments.relation_wide_limbs_range_constraint_1 =
        transcript.template receive_from_prover<Commitment>(commitment_labels.relation_wide_limbs_range_constraint_1);
    commitments.relation_wide_limbs_range_constraint_2 =
        transcript.template receive_from_prover<Commitment>(commitment_labels.relation_wide_limbs_range_constraint_2);
    commitments.relation_wide_limbs_range_constraint_3 =
        transcript.template receive_from_prover<Commitment>(commitment_labels.relation_wide_limbs_range_constraint_3);
    commitments.ordered_range_constraints_0 =
        transcript.template receive_from_prover<Commitment>(commitment_labels.ordered_range_constraints_0);
    commitments.ordered_range_constraints_1 =
        transcript.template receive_from_prover<Commitment>(commitment_labels.ordered_range_constraints_1);
    commitments.ordered_range_constraints_2 =
        transcript.template receive_from_prover<Commitment>(commitment_labels.ordered_range_constraints_2);
    commitments.ordered_range_constraints_3 =
        transcript.template receive_from_prover<Commitment>(commitment_labels.ordered_range_constraints_3);
    commitments.ordered_range_constraints_4 =
        transcript.template receive_from_prover<Commitment>(commitment_labels.ordered_range_constraints_4);

    // Get permutation challenges
    auto [gamma] = transcript.get_challenges("gamma");

    relation_parameters.beta = 0;
    relation_parameters.gamma = gamma;
    relation_parameters.public_input_delta = 0;
    relation_parameters.lookup_grand_product_delta = 0;

    // Get commitment to permutation and lookup grand products
    commitments.z_perm = transcript.template receive_from_prover<Commitment>(commitment_labels.z_perm);

    // Execute Sumcheck Verifier
    auto sumcheck = SumcheckVerifier<Flavor>(circuit_size);

    auto [multivariate_challenge, claimed_evaluations, sumcheck_verified] =
        sumcheck.verify(relation_parameters, transcript);

    // If Sumcheck did not verify, return false
    if (sumcheck_verified.has_value() && !sumcheck_verified.value()) {
        info("sumcheck failed");
        return false;
    }

    // Execute ZeroMorph rounds. See https://hackmd.io/dlf9xEwhTQyE3hiGbq4FsA?view for a complete description of the
    // unrolled protocol.
    auto pairing_points = ZeroMorph::verify(commitments, claimed_evaluations, multivariate_challenge, transcript);

    auto verified = pcs_verification_key->pairing_check(pairing_points[0], pairing_points[1]);

    const auto reconstruct_from_array = [](const auto& arr) {
        const BF elt_0 = (static_cast<uint256_t>(arr[0]));
        const BF elt_1 = (static_cast<uint256_t>(arr[1]) << 68);
        const BF elt_2 = (static_cast<uint256_t>(arr[2]) << 136);
        const BF elt_3 = (static_cast<uint256_t>(arr[3]) << 204);
        const BF reconstructed = elt_0 + elt_1 + elt_2 + elt_3;
        return reconstructed;
    };

    // info("in the verifier");
    // translation_consistency_data.print();
    const auto& reconstruct_value_from_eccvm_evaluations =
        [&](const GoblinTranslationConsistencyData& translation_consistency_data, auto& relation_parameters) {
            const BF accumulated_result = reconstruct_from_array(relation_parameters.accumulated_result);
            const BF x = reconstruct_from_array(relation_parameters.evaluation_input_x);
            const BF v1 = reconstruct_from_array(relation_parameters.batching_challenge_v[0]);
            const BF v2 = reconstruct_from_array(relation_parameters.batching_challenge_v[1]);
            const BF v3 = reconstruct_from_array(relation_parameters.batching_challenge_v[2]);
            const BF v4 = reconstruct_from_array(relation_parameters.batching_challenge_v[3]);
            const BF& op = translation_consistency_data.op;
            const BF& Px = translation_consistency_data.Px;
            const BF& Py = translation_consistency_data.Py;
            const BF& z1 = translation_consistency_data.z1;
            const BF& z2 = translation_consistency_data.z2;

            info("x: ", x);
            info("circuit_size: ", circuit_size);

            const BF x_power = x.pow(22);
            const BF eccvm_opening = op + (v1 * Px) + (v2 * Py) + (v3 * z1) + (v4 * z2);
            // info("v1  : ", v1);
            // info("v1^2: ", v1 * v1);
            // info("v2  : ", v2);
            // info("v2^2: ", v2 * v2);
            // info("v4  : ", v4);
            info("accumulated_result: ", accumulated_result);
            info("eccvm_opening:      ", eccvm_opening);
            return x_power * accumulated_result == eccvm_opening;
        };

    bool value_reconstructed =
        reconstruct_value_from_eccvm_evaluations(translation_consistency_data, relation_parameters);

    verified &= value_reconstructed;

    return verified;
}

template class GoblinTranslatorVerifier_<honk::flavor::GoblinTranslator>;

} // namespace proof_system::honk

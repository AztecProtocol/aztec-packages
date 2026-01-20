#include "barretenberg/vm2/constraining/verifier.hpp"

#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/numeric/bitop/get_msb.hpp"
#include "barretenberg/transcript/transcript.hpp"
#include "barretenberg/vm2/common/constants.hpp"
#include <numeric>

namespace bb::avm2 {

AvmVerifier::AvmVerifier(std::shared_ptr<Flavor::VerificationKey> verifier_key)
    : key(std::move(verifier_key))
{}

AvmVerifier::AvmVerifier(AvmVerifier&& other) noexcept
    : key(std::move(other.key))
    , transcript(std::move(other.transcript))
{}

AvmVerifier& AvmVerifier::operator=(AvmVerifier&& other) noexcept
{
    key = other.key;
    transcript = other.transcript;
    commitments.clear();
    return *this;
}

using FF = AvmFlavor::FF;

// Evaluate the given public input column over the multivariate challenge points
inline FF AvmVerifier::evaluate_public_input_column(const std::vector<FF>& points, std::vector<FF> challenges)
{
    Polynomial<FF> polynomial(points, (1 << key->log_circuit_size));
    return polynomial.evaluate_mle(challenges);
}

/**
 * @brief This function verifies an Avm Honk proof for given program settings.
 *
 */
bool AvmVerifier::verify_proof(const HonkProof& proof, const std::vector<std::vector<FF>>& public_inputs)
{
    using Flavor = AvmFlavor;
    using FF = Flavor::FF;
    using Commitment = Flavor::Commitment;
    using PCS = Flavor::PCS;
    using Curve = Flavor::Curve;
    using VerifierCommitments = Flavor::VerifierCommitments;
    using Shplemini = ShpleminiVerifier_<Curve, Flavor::HasZK>;
    using ClaimBatcher = ClaimBatcher_<Curve>;
    using ClaimBatch = ClaimBatcher::Batch;
    using VerifierCommitmentKey = typename Flavor::VerifierCommitmentKey;
    using Challenges = Flavor::AllEntities<FF>;

    RelationParameters<FF> relation_parameters;

    transcript->load_proof(proof);

    FF vk_hash = key->hash();
    transcript->add_to_hash_buffer("avm_vk_hash", vk_hash);
    vinfo("AVM vk hash in verifier: ", vk_hash);

    // Check public inputs size.
    if (public_inputs.size() != AVM_NUM_PUBLIC_INPUT_COLUMNS) {
        vinfo("Public inputs size mismatch");
        return false;
    }
    // Public inputs from proof
    for (size_t i = 0; i < AVM_NUM_PUBLIC_INPUT_COLUMNS; i++) {
        if (public_inputs[i].size() != AVM_PUBLIC_INPUTS_COLUMNS_MAX_LENGTH) {
            vinfo("Public input size mismatch");
            return false;
        }
        for (size_t j = 0; j < public_inputs[i].size(); j++) {
            transcript->add_to_hash_buffer("public_input_" + std::to_string(i) + "_" + std::to_string(j),
                                           public_inputs[i][j]);
        }
    }
    VerifierCommitments commitments{ key };
    // Get commitments to VM wires
    for (auto [comm, label] : zip_view(commitments.get_wires(), commitments.get_wires_labels())) {
        comm = transcript->template receive_from_prover<Commitment>(label);
    }

    auto [beta, gamma] = transcript->template get_challenges<FF>(std::array<std::string, 2>{ "beta", "gamma" });
    relation_parameters.beta = beta;
    relation_parameters.gamma = gamma;

    // Get commitments to inverses
    for (auto [label, commitment] : zip_view(commitments.get_derived_labels(), commitments.get_derived())) {
        commitment = transcript->template receive_from_prover<Commitment>(label);
    }

    // Execute Sumcheck Verifier
    std::vector<FF> padding_indicator_array(key->log_circuit_size, 1);

    // Multiply each linearly independent subrelation contribution by `alpha^i` for i = 0, ..., NUM_SUBRELATIONS - 1.
    const FF alpha = transcript->template get_challenge<FF>("Sumcheck:alpha");

    SumcheckVerifier<Flavor> sumcheck(transcript, alpha, key->log_circuit_size);

    // Get the gate challenges for sumcheck computation
    std::vector<FF> gate_challenges =
        transcript->template get_dyadic_powers_of_challenge<FF>("Sumcheck:gate_challenge", key->log_circuit_size);

    SumcheckOutput<Flavor> output = sumcheck.verify(relation_parameters, gate_challenges, padding_indicator_array);

    // If Sumcheck did not verify, return false
    if (!output.verified) {
        vinfo("Sumcheck verification failed");
        return false;
    }

    using C = ColumnAndShifts;
    std::array<FF, AVM_NUM_PUBLIC_INPUT_COLUMNS> claimed_evaluations = {
        output.claimed_evaluations.get(C::public_inputs_cols_0_),
        output.claimed_evaluations.get(C::public_inputs_cols_1_),
        output.claimed_evaluations.get(C::public_inputs_cols_2_),
        output.claimed_evaluations.get(C::public_inputs_cols_3_),
    };
    for (size_t i = 0; i < AVM_NUM_PUBLIC_INPUT_COLUMNS; i++) {
        FF public_input_evaluation = evaluate_public_input_column(public_inputs[i], output.challenge);
        if (public_input_evaluation != claimed_evaluations[i]) {
            vinfo("public_input_evaluation failed, public inputs col ", i);
            return false;
        }
    }

    // Batch commitments and evaluations using short scalars to reduce ECCVM circuit size
    std::span<const Commitment> unshifted_comms = commitments.get_unshifted();
    std::span<const FF> unshifted_evals = output.claimed_evaluations.get_unshifted();
    std::span<const Commitment> shifted_comms = commitments.get_to_be_shifted();
    std::span<const FF> shifted_evals = output.claimed_evaluations.get_shifted();

    // Get short batching challenges from transcript
    // Note: the first challenge is not used for batching, but to maintain the code cleaner, we generate it nonetheless
    Challenges challenges;
    auto unshifted_challenges_vec = transcript->template get_challenges<FF>(challenges.get_unshifted_labels());
    std::ranges::move(unshifted_challenges_vec, challenges.get_unshifted().begin());
    auto unshifted_challenges = challenges.get_unshifted();
    auto shifted_challenges = challenges.get_to_be_shifted();

    // Batch to be shifted polys
    Commitment squashed_shifted = batch_mul_native<Curve>(shifted_comms, shifted_challenges);

    // Batch unshifted commitments: first commitment has coefficient 1, rest are batched with challenges. We reuse the
    // calculation performed for to be shifted polys.
    Commitment squashed_unshifted =
        unshifted_comms[0] + squashed_shifted +
        batch_mul_native<Curve>(unshifted_comms.subspan(1, WIRES_TO_BE_SHIFTED_START_IDX - 1),
                                unshifted_challenges.subspan(1, WIRES_TO_BE_SHIFTED_START_IDX - 1)) +
        batch_mul_native<Curve>(unshifted_comms.subspan(WIRES_TO_BE_SHIFTED_END_IDX),
                                unshifted_challenges.subspan(WIRES_TO_BE_SHIFTED_END_IDX));

    // Batch evaluations: compute inner product with first eval as initial value for unshifted
    FF squashed_unshifted_eval = std::inner_product(
        unshifted_challenges.begin() + 1, unshifted_challenges.end(), unshifted_evals.begin() + 1, unshifted_evals[0]);

    FF squashed_shifted_eval =
        std::inner_product(shifted_challenges.begin(), shifted_challenges.end(), shifted_evals.begin(), FF(0));

    // Execute Shplemini rounds with squashed claims
    ClaimBatcher squashed_claim_batcher{ .unshifted = ClaimBatch{ .commitments = RefVector(squashed_unshifted),
                                                                  .evaluations = RefVector(squashed_unshifted_eval) },
                                         .shifted = ClaimBatch{ .commitments = RefVector(squashed_shifted),
                                                                .evaluations = RefVector(squashed_shifted_eval) } };
    auto opening_claim =
        Shplemini::compute_batch_opening_claim(
            padding_indicator_array, squashed_claim_batcher, output.challenge, Commitment::one(), transcript)
            .batch_opening_claim;

    const auto pairing_points = PCS::reduce_verify_batch_opening_claim(std::move(opening_claim), transcript);
    VerifierCommitmentKey pcs_vkey{};
    const auto shplemini_verified = pcs_vkey.pairing_check(pairing_points[0], pairing_points[1]);

    if (!shplemini_verified) {
        vinfo("Shplemini verification failed");
        return false;
    }

    return true;
}

} // namespace bb::avm2

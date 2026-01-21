// === AUDIT STATUS ===
// internal:    { status: Completed, auditors: [Federico], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================
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
    return *this;
}

/**
 * @brief Evaluate the given public input column over the multivariate challenge points
 *
 * @details Among its witness commitments, the AVM prover sends commitments to the public inputs. To enforce consistency
 * between these commitments and the public inputs, the verifier computes the evaluation of the public inputs sent in
 * the clear at the Sumcheck challenge and compares the result with the claimed evaluation sent by the Prover at the end
 * of Sumcheck.
 *
 * @param points The public input column to be evaluated
 * @param challenges The sumcheck challenge
 * @return FF
 */
inline AvmVerifier::FF AvmVerifier::evaluate_public_input_column(const std::vector<FF>& points,
                                                                 const std::vector<FF>& challenges)
{
    Polynomial<FF> polynomial(points, (1 << key->log_circuit_size));
    return polynomial.evaluate_mle(challenges);
}

/**
 * @brief Verify an AVM proof
 *
 */
bool AvmVerifier::verify_proof(const HonkProof& proof, const std::vector<std::vector<FF>>& public_inputs)
{
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

    // ========== Execute preamble round ==========

    // Add vk hash to transcript
    FF vk_hash = key->hash();
    transcript->add_to_hash_buffer("avm_vk_hash", vk_hash);
    vinfo("AVM vk hash in verifier: ", vk_hash);

    // ========== Execute public inputs round ==========

    // Validate number of public input columns
    if (public_inputs.size() != AVM_NUM_PUBLIC_INPUT_COLUMNS) {
        vinfo("Public inputs size mismatch");
        return false;
    }

    // Add public inputs to transcript. This ensures that the Sumcheck challenge depends both on the public inputs sent
    // in the clear and on the committed columns.
    for (size_t i = 0; i < AVM_NUM_PUBLIC_INPUT_COLUMNS; i++) {
        // Validate public input column size
        if (public_inputs[i].size() != AVM_PUBLIC_INPUTS_COLUMNS_MAX_LENGTH) {
            vinfo("Public input size mismatch");
            return false;
        }
        for (size_t j = 0; j < public_inputs[i].size(); j++) {
            transcript->add_to_hash_buffer("public_input_" + std::to_string(i) + "_" + std::to_string(j),
                                           public_inputs[i][j]);
        }
    }

    // ========== Execute wire commitments round ==========

    // Receive commitments to all polynomials except the logderivate ones
    VerifierCommitments commitments{ key };
    for (auto [comm, label] : zip_view(commitments.get_wires(), commitments.get_wires_labels())) {
        comm = transcript->template receive_from_prover<Commitment>(label);
    }

    // ========== Execute log derivative inverse round ==========

    // Generate randomness required by Lookup and Permutation relations
    auto [beta, gamma] = transcript->template get_challenges<FF>(std::array<std::string, 2>{ "beta", "gamma" });
    relation_parameters.beta = beta;
    relation_parameters.gamma = gamma;

    // Receive commitments to all logderivative inverse polynomials
    for (auto [commitment, label] : zip_view(commitments.get_derived(), commitments.get_derived_labels())) {
        commitment = transcript->template receive_from_prover<Commitment>(label);
    }

    // ========== Execute relation check rounds ==========

    // Construct padding indicator array: it is a vector of constant ones as the AVM verifier performs verification of
    // the AVM circuit, so the number of rounds is fixed.
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

    // Validate that the public inputs committed in the public input columns match the public inputs sent in the clear
    // by the Prover
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

    // ========== Execute PCS verification ==========

    // Batch commitments and evaluations using short scalars to reduce ECCVM circuit size
    std::span<const Commitment> unshifted_comms = commitments.get_unshifted();
    std::span<const FF> unshifted_evals = output.claimed_evaluations.get_unshifted();
    std::span<const Commitment> shifted_comms = commitments.get_to_be_shifted();
    std::span<const FF> shifted_evals = output.claimed_evaluations.get_shifted();

    // Get short batching challenges from transcript
    // Note: the challenge for ColumnAndShifts::precomputed_clk is not used for batching, but to maintain the code
    // cleaner, we generate it nonetheless
    Challenges challenges;
    auto unshifted_challenges_vec = transcript->template get_challenges<FF>(challenges.get_unshifted_labels());
    std::ranges::move(unshifted_challenges_vec, challenges.get_unshifted().begin());
    challenges.get(ColumnAndShifts::precomputed_clk) = FF(1); // Challenge for this column is 1
    auto unshifted_challenges = challenges.get_unshifted();
    auto shifted_challenges = challenges.get_to_be_shifted();

    // Batch shifted commitments
    Commitment batched_shifted = Commitment::batch_mul(shifted_comms, shifted_challenges);

    // Batch unshifted commitments: ColumnAndShifts::precomputed_clk has coefficient 1, rest are batched with
    // challenges. We reuse the calculation performed for shifted commitments.
    Commitment batched_unshifted =
        batched_shifted +
        Commitment::batch_mul(unshifted_comms.subspan(0, WIRES_TO_BE_SHIFTED_START_IDX),
                              unshifted_challenges.subspan(0, WIRES_TO_BE_SHIFTED_START_IDX)) +
        Commitment::batch_mul(unshifted_comms.subspan(WIRES_TO_BE_SHIFTED_END_IDX),
                              unshifted_challenges.subspan(WIRES_TO_BE_SHIFTED_END_IDX));

    // Batch evaluations: compute inner product with first eval as initial value for unshifted
    FF batched_unshifted_eval =
        std::inner_product(unshifted_challenges.begin(), unshifted_challenges.end(), unshifted_evals.begin(), FF(0));

    FF batched_shifted_eval =
        std::inner_product(shifted_challenges.begin(), shifted_challenges.end(), shifted_evals.begin(), FF(0));

    // Execute Shplemini rounds with batched claims
    ClaimBatcher batched_claim_batcher{ .unshifted = ClaimBatch{ .commitments = RefVector(batched_unshifted),
                                                                 .evaluations = RefVector(batched_unshifted_eval) },
                                        .shifted = ClaimBatch{ .commitments = RefVector(batched_shifted),
                                                               .evaluations = RefVector(batched_shifted_eval) } };
    auto opening_claim =
        Shplemini::compute_batch_opening_claim(
            padding_indicator_array, batched_claim_batcher, output.challenge, Commitment::one(), transcript)
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

#include "barretenberg/vm2/constraining/verifier.hpp"

#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/numeric/bitop/get_msb.hpp"
#include "barretenberg/transcript/transcript.hpp"
#include "barretenberg/vm2/common/constants.hpp"

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
    Polynomial<FF> polynomial(points, key->circuit_size);
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
    using Shplemini = ShpleminiVerifier_<Curve>;
    using ClaimBatcher = ClaimBatcher_<Curve>;
    using ClaimBatch = ClaimBatcher::Batch;
    using VerifierCommitmentKey = typename Flavor::VerifierCommitmentKey;

    RelationParameters<FF> relation_parameters;

    transcript->load_proof(proof);

    VerifierCommitments commitments{ key };

    const auto circuit_size = transcript->template receive_from_prover<uint32_t>("circuit_size");
    if (circuit_size != key->circuit_size) {
        vinfo("Circuit size mismatch: expected", key->circuit_size, " got ", circuit_size);
        return false;
    }

    // Get commitments to VM wires
    for (auto [comm, label] : zip_view(commitments.get_wires(), commitments.get_wires_labels())) {
        comm = transcript->template receive_from_prover<Commitment>(label);
    }

    auto [beta, gamm] = transcript->template get_challenges<FF>("beta", "gamma");
    relation_parameters.beta = beta;
    relation_parameters.gamma = gamm;

    // Get commitments to inverses
    for (auto [label, commitment] : zip_view(commitments.get_derived_labels(), commitments.get_derived())) {
        commitment = transcript->template receive_from_prover<Commitment>(label);
    }

    // Execute Sumcheck Verifier
    const size_t log_circuit_size = numeric::get_msb(circuit_size);

    std::array<FF, CONST_PROOF_SIZE_LOG_N> padding_indicator_array;

    for (size_t idx = 0; idx < CONST_PROOF_SIZE_LOG_N; idx++) {
        padding_indicator_array[idx] = (idx < log_circuit_size) ? FF{ 1 } : FF{ 0 };
    }
    auto sumcheck = SumcheckVerifier<Flavor>(transcript);

    FF alpha = transcript->template get_challenge<FF>("Sumcheck:alpha");

    auto gate_challenges = std::vector<FF>(log_circuit_size);
    for (size_t idx = 0; idx < log_circuit_size; idx++) {
        gate_challenges[idx] = transcript->template get_challenge<FF>("Sumcheck:gate_challenge_" + std::to_string(idx));
    }

    SumcheckOutput<Flavor> output =
        sumcheck.verify(relation_parameters, alpha, gate_challenges, padding_indicator_array);

    // If Sumcheck did not verify, return false
    if (!output.verified) {
        vinfo("Sumcheck verification failed");
        return false;
    }

    // Public columns evaluation checks
    std::vector<FF> mle_challenge(output.challenge.begin(),
                                  output.challenge.begin() + static_cast<int>(log_circuit_size));

    if (public_inputs.size() != AVM_NUM_PUBLIC_INPUT_COLUMNS) {
        vinfo("Public inputs size mismatch");
        return false;
    }

    std::array<FF, AVM_NUM_PUBLIC_INPUT_COLUMNS> claimed_evaluations = {
        output.claimed_evaluations.public_inputs_cols_0_,
        output.claimed_evaluations.public_inputs_cols_1_,
        output.claimed_evaluations.public_inputs_cols_2_,
        output.claimed_evaluations.public_inputs_cols_3_,
    };
    for (size_t i = 0; i < AVM_NUM_PUBLIC_INPUT_COLUMNS; i++) {
        FF public_input_evaluation = evaluate_public_input_column(public_inputs[i], mle_challenge);
        if (public_input_evaluation != claimed_evaluations[i]) {
            vinfo("public_input_evaluation failed, public inputs col ", i);
            return false;
        }
    }

    ClaimBatcher claim_batcher{
        .unshifted = ClaimBatch{ commitments.get_unshifted(), output.claimed_evaluations.get_unshifted() },
        .shifted = ClaimBatch{ commitments.get_to_be_shifted(), output.claimed_evaluations.get_shifted() }
    };
    const BatchOpeningClaim<Curve> opening_claim = Shplemini::compute_batch_opening_claim(
        padding_indicator_array, claim_batcher, output.challenge, Commitment::one(), transcript);

    const auto pairing_points = PCS::reduce_verify_batch_opening_claim(opening_claim, transcript);
    VerifierCommitmentKey pcs_vkey{};
    const auto shplemini_verified = pcs_vkey.pairing_check(pairing_points[0], pairing_points[1]);

    if (!shplemini_verified) {
        vinfo("Shplemini verification failed");
        return false;
    }

    return true;
}

} // namespace bb::avm2

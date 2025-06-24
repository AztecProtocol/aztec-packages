// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "barretenberg/stdlib/honk_verifier/ultra_recursive_verifier.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/honk/library/grand_product_delta.hpp"
#include "barretenberg/numeric/bitop/get_msb.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders_fwd.hpp"
#include "barretenberg/stdlib/primitives/padding_indicator_array/padding_indicator_array.hpp"
#include "barretenberg/stdlib/primitives/public_input_component/public_input_component.hpp"
#include "barretenberg/transcript/transcript.hpp"

namespace bb::stdlib::recursion::honk {

template <typename Flavor>
UltraRecursiveVerifier_<Flavor>::UltraRecursiveVerifier_(
    Builder* builder,
    const std::shared_ptr<NativeVerificationKey>& native_verifier_key,
    const std::shared_ptr<Transcript>& transcript)
    : key(std::make_shared<RecursiveDeciderVK>(builder, native_verifier_key))
    , builder(builder)
    , transcript(transcript)
{}

template <typename Flavor>
UltraRecursiveVerifier_<Flavor>::UltraRecursiveVerifier_(Builder* builder,
                                                         const std::shared_ptr<VerificationKey>& vkey,
                                                         const std::shared_ptr<Transcript>& transcript)
    : key(std::make_shared<RecursiveDeciderVK>(builder, vkey))
    , builder(builder)
    , transcript(transcript)
{}

/**
 * @brief This function constructs a recursive verifier circuit for a native Ultra Honk proof of a given flavor.
 * @return Output aggregation object
 */
template <typename Flavor>
UltraRecursiveVerifier_<Flavor>::Output UltraRecursiveVerifier_<Flavor>::verify_proof(const HonkProof& proof)
{
    StdlibProof<Builder> stdlib_proof = bb::convert_native_proof_to_stdlib(builder, proof);
    return verify_proof(stdlib_proof);
}

/**
 * @brief This function constructs a recursive verifier circuit for a native Ultra Honk proof of a given flavor.
 * @return Output aggregation object
 */
template <typename Flavor>
UltraRecursiveVerifier_<Flavor>::Output UltraRecursiveVerifier_<Flavor>::verify_proof(const StdlibProof<Builder>& proof)
{
    using Sumcheck = ::bb::SumcheckVerifier<Flavor>;
    using PCS = typename Flavor::PCS;
    using Curve = typename Flavor::Curve;
    using Shplemini = ::bb::ShpleminiVerifier_<Curve>;
    using VerifierCommitments = typename Flavor::VerifierCommitments;
    using ClaimBatcher = ClaimBatcher_<Curve>;
    using ClaimBatch = ClaimBatcher::Batch;
    using PublicPairingPoints = PublicInputComponent<PairingPoints<Builder>>;

    const size_t num_public_inputs = static_cast<uint32_t>(key->verification_key->num_public_inputs.get_value());
    BB_ASSERT_EQ(proof.size(), Flavor::NativeFlavor::PROOF_LENGTH_WITHOUT_PUB_INPUTS + num_public_inputs);

    Output output;
    StdlibProof<Builder> honk_proof;
    if constexpr (HasIPAAccumulator<Flavor>) {
        const size_t HONK_PROOF_LENGTH = Flavor::NativeFlavor::PROOF_LENGTH_WITHOUT_PUB_INPUTS - IPA_PROOF_LENGTH;
        // The extra calculation is for the IPA proof length.
        // TODO(https://github.com/AztecProtocol/barretenberg/issues/1182): Handle in ProofSurgeon.
        BB_ASSERT_EQ(proof.size(), HONK_PROOF_LENGTH + IPA_PROOF_LENGTH + num_public_inputs);
        // split out the ipa proof
        const std::ptrdiff_t honk_proof_with_pub_inputs_length =
            static_cast<std::ptrdiff_t>(HONK_PROOF_LENGTH + num_public_inputs);
        output.ipa_proof = StdlibProof<Builder>(proof.begin() + honk_proof_with_pub_inputs_length, proof.end());
        honk_proof = StdlibProof<Builder>(proof.begin(), proof.begin() + honk_proof_with_pub_inputs_length);
    } else {
        honk_proof = proof;
    }
    transcript->load_proof(honk_proof);
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1364): Improve VKs. Clarify the usage of
    // RecursiveDeciderVK here. Seems unnecessary.
    OinkVerifier oink_verifier{ builder, key, transcript };
    oink_verifier.verify();

    VerifierCommitments commitments{ key->verification_key, key->witness_commitments };

    auto gate_challenges = std::vector<FF>(CONST_PROOF_SIZE_LOG_N);
    for (size_t idx = 0; idx < CONST_PROOF_SIZE_LOG_N; idx++) {
        gate_challenges[idx] = transcript->template get_challenge<FF>("Sumcheck:gate_challenge_" + std::to_string(idx));
    }

    // Extract the aggregation object from the public inputs
    PairingPoints nested_points_accumulator =
        PublicPairingPoints::reconstruct(key->public_inputs, key->verification_key->pairing_inputs_public_input_key);
    output.points_accumulator = nested_points_accumulator;
    // Execute Sumcheck Verifier and extract multivariate opening point u = (u_0, ..., u_{d-1}) and purported
    // multivariate evaluations at u

    const auto padding_indicator_array =
        compute_padding_indicator_array<Curve, CONST_PROOF_SIZE_LOG_N>(key->verification_key->log_circuit_size);

    constrain_log_circuit_size(padding_indicator_array, key->verification_key->circuit_size);

    auto sumcheck = Sumcheck(transcript);

    // Receive commitments to Libra masking polynomials
    std::array<Commitment, NUM_LIBRA_COMMITMENTS> libra_commitments = {};
    if constexpr (Flavor::HasZK) {
        libra_commitments[0] = transcript->template receive_from_prover<Commitment>("Libra:concatenation_commitment");
    }
    SumcheckOutput<Flavor> sumcheck_output =
        sumcheck.verify(key->relation_parameters, key->alphas, gate_challenges, padding_indicator_array);

    // For MegaZKFlavor: the sumcheck output contains claimed evaluations of the Libra polynomials
    if constexpr (Flavor::HasZK) {
        libra_commitments[1] = transcript->template receive_from_prover<Commitment>("Libra:grand_sum_commitment");
        libra_commitments[2] = transcript->template receive_from_prover<Commitment>("Libra:quotient_commitment");
    }
    // Execute Shplemini to produce a batch opening claim subsequently verified by a univariate PCS
    bool consistency_checked = true;
    ClaimBatcher claim_batcher{
        .unshifted = ClaimBatch{ commitments.get_unshifted(), sumcheck_output.claimed_evaluations.get_unshifted() },
        .shifted = ClaimBatch{ commitments.get_to_be_shifted(), sumcheck_output.claimed_evaluations.get_shifted() }
    };
    const BatchOpeningClaim<Curve> opening_claim =
        Shplemini::compute_batch_opening_claim(padding_indicator_array,
                                               claim_batcher,
                                               sumcheck_output.challenge,
                                               Commitment::one(builder),
                                               transcript,
                                               Flavor::REPEATED_COMMITMENTS,
                                               Flavor::HasZK,
                                               &consistency_checked,
                                               libra_commitments,
                                               sumcheck_output.claimed_libra_evaluation);

    auto pairing_points = PCS::reduce_verify_batch_opening_claim(opening_claim, transcript);
    output.points_accumulator.aggregate(pairing_points);

    // Extract the IPA claim from the public inputs
    if constexpr (HasIPAAccumulator<Flavor>) {
        using PublicIpaClaim = PublicInputComponent<OpeningClaim<grumpkin<Builder>>>;
        output.ipa_claim =
            PublicIpaClaim::reconstruct(key->public_inputs, key->verification_key->ipa_claim_public_input_key);
    }

    return output;
}

template class UltraRecursiveVerifier_<bb::UltraRecursiveFlavor_<UltraCircuitBuilder>>;
template class UltraRecursiveVerifier_<bb::UltraRecursiveFlavor_<MegaCircuitBuilder>>;
template class UltraRecursiveVerifier_<bb::MegaRecursiveFlavor_<UltraCircuitBuilder>>;
template class UltraRecursiveVerifier_<bb::MegaRecursiveFlavor_<MegaCircuitBuilder>>;
template class UltraRecursiveVerifier_<bb::MegaZKRecursiveFlavor_<MegaCircuitBuilder>>;
template class UltraRecursiveVerifier_<bb::MegaZKRecursiveFlavor_<UltraCircuitBuilder>>;
template class UltraRecursiveVerifier_<bb::UltraRollupRecursiveFlavor_<UltraCircuitBuilder>>;
template class UltraRecursiveVerifier_<bb::UltraZKRecursiveFlavor_<UltraCircuitBuilder>>;
template class UltraRecursiveVerifier_<bb::UltraZKRecursiveFlavor_<MegaCircuitBuilder>>;
} // namespace bb::stdlib::recursion::honk

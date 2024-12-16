#include "barretenberg/stdlib/honk_verifier/ultra_recursive_verifier.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/numeric/bitop/get_msb.hpp"
#include "barretenberg/plonk_honk_shared/library/grand_product_delta.hpp"
#include "barretenberg/transcript/transcript.hpp"

namespace bb::stdlib::recursion::honk {

template <typename Flavor>
UltraRecursiveVerifier_<Flavor>::UltraRecursiveVerifier_(
    Builder* builder, const std::shared_ptr<NativeVerificationKey>& native_verifier_key)
    : key(std::make_shared<VerificationKey>(builder, native_verifier_key))
    , builder(builder)
{}

template <typename Flavor>
UltraRecursiveVerifier_<Flavor>::UltraRecursiveVerifier_(Builder* builder, const std::shared_ptr<VerificationKey>& vkey)
    : key(vkey)
    , builder(builder)
{}

/**
 * @brief This function constructs a recursive verifier circuit for a native Ultra Honk proof of a given flavor.
 * @return Output aggregation object
 */
template <typename Flavor>
UltraRecursiveVerifier_<Flavor>::Output UltraRecursiveVerifier_<Flavor>::verify_proof(const HonkProof& proof,
                                                                                      AggregationObject agg_obj)
{
    StdlibProof<Builder> stdlib_proof = bb::convert_native_proof_to_stdlib(builder, proof);
    return verify_proof(stdlib_proof, agg_obj);
}

/**
 * @brief This function constructs a recursive verifier circuit for a native Ultra Honk proof of a given flavor.
 * @return Output aggregation object
 */
template <typename Flavor>
UltraRecursiveVerifier_<Flavor>::Output UltraRecursiveVerifier_<Flavor>::verify_proof(const StdlibProof<Builder>& proof,
                                                                                      AggregationObject agg_obj)
{
    using Sumcheck = ::bb::SumcheckVerifier<Flavor>;
    using PCS = typename Flavor::PCS;
    using Curve = typename Flavor::Curve;
    using Shplemini = ::bb::ShpleminiVerifier_<Curve>;
    using VerifierCommitments = typename Flavor::VerifierCommitments;
    using Transcript = typename Flavor::Transcript;

    transcript = std::make_shared<Transcript>(proof);
    auto verification_key = std::make_shared<RecursiveDeciderVK>(builder, key);
    OinkVerifier oink_verifier{ builder, verification_key, transcript };
    oink_verifier.verify();

    VerifierCommitments commitments{ key, verification_key->witness_commitments };

    auto gate_challenges = std::vector<FF>(CONST_PROOF_SIZE_LOG_N);
    for (size_t idx = 0; idx < CONST_PROOF_SIZE_LOG_N; idx++) {
        gate_challenges[idx] = transcript->template get_challenge<FF>("Sumcheck:gate_challenge_" + std::to_string(idx));
    }

    // Parse out the aggregation object using the key->pairing_point_accumulator_public_input_indices
    AggregationObject nested_agg_obj;
    size_t idx = 0;
    std::array<typename Curve::Group, 2> nested_pairing_points;
    for (size_t i = 0; i < 2; i++) {
        std::array<typename Curve::BaseField, 2> base_field_vals;
        for (size_t j = 0; j < 2; j++) {
            std::array<FF, 4> bigfield_limbs;
            for (size_t k = 0; k < 4; k++) {
                bigfield_limbs[k] =
                    verification_key->public_inputs[key->pairing_point_accumulator_public_input_indices[idx]];
                idx++;
            }
            base_field_vals[j] = Curve::BaseField::construct_from_limbs(
                bigfield_limbs[0], bigfield_limbs[1], bigfield_limbs[2], bigfield_limbs[3]);
        }
        nested_pairing_points[i] = typename Curve::Group(base_field_vals[0], base_field_vals[1]);
    }

    nested_agg_obj.P0 = nested_pairing_points[0];
    nested_agg_obj.P1 = nested_pairing_points[1];
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/995): generate this challenge properly.
    typename Curve::ScalarField recursion_separator =
        Curve::ScalarField::from_witness_index(builder, builder->add_variable(42));
    agg_obj.aggregate(nested_agg_obj, recursion_separator);

    // Execute Sumcheck Verifier and extract multivariate opening point u = (u_0, ..., u_{d-1}) and purported
    // multivariate evaluations at u
    const size_t log_circuit_size = numeric::get_msb(static_cast<uint32_t>(key->circuit_size));
    auto sumcheck = Sumcheck(log_circuit_size, transcript);

    // Receive commitments to Libra masking polynomials
    std::array<Commitment, 3> libra_commitments = {};
    FF libra_evaluation{ 0 };
    if constexpr (Flavor::HasZK) {
        libra_commitments[0] = transcript->template receive_from_prover<Commitment>("Libra:concatenation_commitment");
    }
    SumcheckOutput<Flavor> sumcheck_output =
        sumcheck.verify(verification_key->relation_parameters, verification_key->alphas, gate_challenges);

    // For MegaZKFlavor: the sumcheck output contains claimed evaluations of the Libra polynomials
    if constexpr (Flavor::HasZK) {
        libra_evaluation = std::move(sumcheck_output.claimed_libra_evaluation);
        libra_commitments[1] = transcript->template receive_from_prover<Commitment>("Libra:big_sum_commitment");
        libra_commitments[2] = transcript->template receive_from_prover<Commitment>("Libra:quotient_commitment");
    }
    // Execute Shplemini to produce a batch opening claim subsequently verified by a univariate PCS
    const BatchOpeningClaim<Curve> opening_claim =
        Shplemini::compute_batch_opening_claim(key->circuit_size,
                                               commitments.get_unshifted(),
                                               commitments.get_to_be_shifted(),
                                               sumcheck_output.claimed_evaluations.get_unshifted(),
                                               sumcheck_output.claimed_evaluations.get_shifted(),
                                               sumcheck_output.challenge,
                                               Commitment::one(builder),
                                               transcript,
                                               Flavor::REPEATED_COMMITMENTS,
                                               Flavor::HasZK,
                                               libra_commitments,
                                               libra_evaluation);

    auto pairing_points = PCS::reduce_verify_batch_opening_claim(opening_claim, transcript);

    pairing_points[0] = pairing_points[0].normalize();
    pairing_points[1] = pairing_points[1].normalize();
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/995): generate recursion separator challenge properly.
    agg_obj.aggregate(pairing_points, recursion_separator);
    Output output;
    output.agg_obj = std::move(agg_obj);

    // Extract the IPA claim from the public inputs
    // Parse out the nested IPA claim using key->ipa_claim_public_input_indices and runs the native IPA verifier.
    if constexpr (HasIPAAccumulator<Flavor>) {
        const auto recover_fq_from_public_inputs = [](std::array<FF, Curve::BaseField::NUM_LIMBS>& limbs) {
            for (size_t k = 0; k < Curve::BaseField::NUM_LIMBS; k++) {
                limbs[k].create_range_constraint(Curve::BaseField::NUM_LIMB_BITS, "limb_" + std::to_string(k));
            }
            return Curve::BaseField::unsafe_construct_from_limbs(limbs[0], limbs[1], limbs[2], limbs[3], false);
        };

        if (verification_key->verification_key->contains_ipa_claim) {
            OpeningClaim<grumpkin<Builder>> ipa_claim;
            std::array<FF, Curve::BaseField::NUM_LIMBS> challenge_bigfield_limbs;
            for (size_t k = 0; k < Curve::BaseField::NUM_LIMBS; k++) {
                challenge_bigfield_limbs[k] =
                    verification_key
                        ->public_inputs[verification_key->verification_key->ipa_claim_public_input_indices[k]];
            }
            std::array<FF, Curve::BaseField::NUM_LIMBS> evaluation_bigfield_limbs;
            for (size_t k = 0; k < Curve::BaseField::NUM_LIMBS; k++) {
                evaluation_bigfield_limbs[k] =
                    verification_key
                        ->public_inputs[verification_key->verification_key
                                            ->ipa_claim_public_input_indices[Curve::BaseField::NUM_LIMBS + k]];
            }
            ipa_claim.opening_pair.challenge = recover_fq_from_public_inputs(challenge_bigfield_limbs);
            ipa_claim.opening_pair.evaluation = recover_fq_from_public_inputs(evaluation_bigfield_limbs);
            ipa_claim.commitment = {
                verification_key->public_inputs[verification_key->verification_key->ipa_claim_public_input_indices[8]],
                verification_key->public_inputs[verification_key->verification_key->ipa_claim_public_input_indices[9]],
                false
            };
            output.ipa_opening_claim = std::move(ipa_claim);
        }
    }

    return output;
}

template class UltraRecursiveVerifier_<bb::UltraRecursiveFlavor_<UltraCircuitBuilder>>;
template class UltraRecursiveVerifier_<bb::UltraRecursiveFlavor_<MegaCircuitBuilder>>;
template class UltraRecursiveVerifier_<bb::MegaRecursiveFlavor_<UltraCircuitBuilder>>;
template class UltraRecursiveVerifier_<bb::MegaRecursiveFlavor_<MegaCircuitBuilder>>;
template class UltraRecursiveVerifier_<bb::MegaZKRecursiveFlavor_<MegaCircuitBuilder>>;
template class UltraRecursiveVerifier_<bb::MegaZKRecursiveFlavor_<UltraCircuitBuilder>>;
template class UltraRecursiveVerifier_<bb::UltraRecursiveFlavor_<CircuitSimulatorBN254>>;
template class UltraRecursiveVerifier_<bb::MegaRecursiveFlavor_<CircuitSimulatorBN254>>;
template class UltraRecursiveVerifier_<bb::UltraRollupRecursiveFlavor_<UltraCircuitBuilder>>;
} // namespace bb::stdlib::recursion::honk

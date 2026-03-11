// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "barretenberg/ultra_honk/multi_honk_verifier.hpp"
#include "barretenberg/commitment_schemes/interleaved_group_batching.hpp"
#include "barretenberg/commitment_schemes/pairing_points.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/ref_array.hpp"
#include "barretenberg/flavor/multi_mega_recursive_flavor.hpp"
#include "barretenberg/flavor/multi_mega_zk_flavor.hpp"
#include "barretenberg/flavor/multi_mega_zk_recursive_flavor.hpp"
#include "barretenberg/honk/proof_length.hpp"
#include "barretenberg/special_public_inputs/special_public_inputs.hpp"
#include "barretenberg/stdlib/primitives/padding_indicator_array/padding_indicator_array.hpp"
#include "barretenberg/stdlib/special_public_inputs/special_public_inputs.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"
#include "barretenberg/ultra_honk/multi_honk_oink_verifier.hpp"

namespace bb {

template <IsMultiMegaFlavor Flavor, class IO>
typename MultiHonkVerifier_<Flavor, IO>::ReductionResult MultiHonkVerifier_<Flavor, IO>::reduce_to_pairing_check(
    const Proof& proof)
{
    using Shplemini = ShpleminiVerifier_<Curve, Flavor::HasZK>;

    this->transcript->load_proof(proof);

    // Reuse base class compute_log_n
    const size_t log_n = this->compute_log_n();

    // Derive num_public_inputs from proof size
    const size_t num_public_inputs = ProofLength::Honk<Flavor>::derive_num_public_inputs(proof.size(), log_n);

    // Use MultiHonkOinkVerifier to receive interleaved commitments
    MultiHonkOinkVerifier_<Flavor> oink_verifier{ this->verifier_instance, this->transcript, num_public_inputs };
    oink_verifier.verify();

    // Reuse base class compute_padding_indicator_array
    auto sumcheck_padding_indicator_array = this->compute_padding_indicator_array(log_n);
    this->verifier_instance->gate_challenges =
        this->transcript->template get_dyadic_powers_of_challenge<FF>("Sumcheck:gate_challenge", log_n);

    // Construct the sumcheck verifier
    SumcheckVerifier<Flavor> sumcheck(this->transcript, this->verifier_instance->alpha, log_n);

    // Receive commitments to Libra masking polynomials for ZKFlavors
    std::array<Commitment, NUM_LIBRA_COMMITMENTS> libra_commitments = {};
    if constexpr (Flavor::HasZK) {
        libra_commitments[0] =
            this->transcript->template receive_from_prover<Commitment>("Libra:concatenation_commitment");
    }

    // Run the sumcheck verifier
    SumcheckOutput<Flavor> sumcheck_output = sumcheck.verify(this->verifier_instance->relation_parameters,
                                                             this->verifier_instance->gate_challenges,
                                                             sumcheck_padding_indicator_array);

    // Get interleaving challenges (must match prover order - before Libra grand_sum/quotient)
    FF u0 = this->transcript->template get_challenge<FF>("Shplemini:interleaving_challenge_0");
    FF u1 = this->transcript->template get_challenge<FF>("Shplemini:interleaving_challenge_1");

    // Receive Libra grand_sum and quotient commitments (sent by SmallSubgroupIPA after interleaving challenges)
    if constexpr (Flavor::HasZK) {
        libra_commitments[1] = this->transcript->template receive_from_prover<Commitment>("Libra:grand_sum_commitment");
        libra_commitments[2] = this->transcript->template receive_from_prover<Commitment>("Libra:quotient_commitment");
    }

    // Compute Lagrange basis from the interleaving challenges
    auto lagrange_basis = MultiMegaFlavor::compute_lagrange_basis(u0, u1);

    // Build the full challenge vector: prepend interleaving challenges to sumcheck challenges
    std::vector<FF> full_challenge;
    full_challenge.reserve(Flavor::INTERLEAVING_LOG_K + sumcheck_output.challenge.size());
    full_challenge.push_back(u0);
    full_challenge.push_back(u1);
    full_challenge.insert(full_challenge.end(), sumcheck_output.challenge.begin(), sumcheck_output.challenge.end());

    // PCS padding indicator array must match full_challenge size (= log_n + INTERLEAVING_LOG_K).
    const size_t pcs_log_n = full_challenge.size();
    std::vector<FF> pcs_padding_indicator_array;
    pcs_padding_indicator_array.reserve(pcs_log_n);
    for (size_t i = 0; i < Flavor::INTERLEAVING_LOG_K; i++) {
        pcs_padding_indicator_array.push_back(FF{ 1 });
    }
    pcs_padding_indicator_array.insert(pcs_padding_indicator_array.end(),
                                       sumcheck_padding_indicator_array.begin(),
                                       sumcheck_padding_indicator_array.end());

    auto& interleaved = this->verifier_instance->interleaved_commitments;
    auto& evals = sumcheck_output.claimed_evaluations;
    auto vk = this->verifier_instance->get_vk();

    constexpr size_t NUM_UNSHIFTED = Flavor::NUM_ALL_INTERLEAVED_COMMITMENTS;
    constexpr size_t NUM_SHIFTED = Flavor::NUM_SHIFTABLE_INTERLEAVED_COMMITMENTS;
    constexpr size_t BATCH_SIZE = Flavor::INTERLEAVING_BATCH_SIZE;

    // Collect commitments into vectors
    auto unshifted_comms_ref = concatenate(vk->get_all(), interleaved.get_all());
    std::vector<Commitment> unshifted_comms_vec;
    unshifted_comms_vec.reserve(NUM_UNSHIFTED);
    for (size_t i = 0; i < NUM_UNSHIFTED; i++) {
        unshifted_comms_vec.push_back(unshifted_comms_ref[i]);
    }
    std::vector<Commitment> shifted_comms_vec;
    shifted_comms_vec.reserve(NUM_SHIFTED);
    for (const auto& c : interleaved.get_shiftable()) {
        shifted_comms_vec.push_back(c);
    }

    // Get batching challenges and batch claims using shared module
    auto [unshifted_challenges, shifted_challenges] =
        get_interleaved_batching_challenges<FF>(this->transcript, NUM_UNSHIFTED, NUM_SHIFTED);

    auto [batched_unshifted_comm, batched_shifted_comm, batched_unshifted_eval, batched_shifted_eval] =
        batch_interleaved_verifier_claims(unshifted_comms_vec,
                                          shifted_comms_vec,
                                          Flavor::get_unshifted_groups(evals),
                                          Flavor::get_shifted_groups(evals),
                                          unshifted_challenges,
                                          shifted_challenges,
                                          lagrange_basis);

    using ClaimBatcher = ClaimBatcher_<Curve>;
    using ClaimBatch = ClaimBatcher::Batch;

    ClaimBatcher claim_batcher{
        .unshifted = ClaimBatch{ RefVector<Commitment>(batched_unshifted_comm), RefVector<FF>(batched_unshifted_eval) },
        .shifted = ClaimBatch{ RefVector<Commitment>(batched_shifted_comm), RefVector<FF>(batched_shifted_eval) },
        .shift_exponent = BATCH_SIZE
    };

    const Commitment one_commitment = [&]() {
        if constexpr (IsRecursive) {
            return Commitment::one(this->builder);
        } else {
            return Commitment::one();
        }
    }();

    auto shplemini_output = Shplemini::compute_batch_opening_claim(pcs_padding_indicator_array,
                                                                   claim_batcher,
                                                                   full_challenge,
                                                                   one_commitment,
                                                                   this->transcript,
                                                                   Flavor::REPEATED_COMMITMENTS,
                                                                   libra_commitments,
                                                                   sumcheck_output.claimed_libra_evaluation);

    ReductionResult result;
    using PCS = typename Flavor::PCS;
    result.pairing_points = PCS::reduce_verify_batch_opening_claim(
        std::move(shplemini_output.batch_opening_claim), this->transcript, Flavor::FINAL_PCS_MSM_SIZE(log_n));

    if constexpr (Flavor::HasZK) {
        bool consistency_checked = shplemini_output.consistency_checked;
        vinfo("MultiHonkVerifier (ZK): consistency_checked=",
              consistency_checked ? "true" : "false",
              " sumcheck_verified=",
              sumcheck_output.verified ? "true" : "false");
        result.reduction_succeeded = sumcheck_output.verified && consistency_checked;
    } else {
        vinfo("MultiHonkVerifier sumcheck_verified: ", sumcheck_output.verified ? "true" : "false");
        result.reduction_succeeded = sumcheck_output.verified;
    }

    return result;
}

template <IsMultiMegaFlavor Flavor, class IO>
typename MultiHonkVerifier_<Flavor, IO>::Output MultiHonkVerifier_<Flavor, IO>::verify_proof(const Proof& proof)
{
    // Reduce to pairing check
    auto [pcs_pairing_points, reduction_succeeded] = reduce_to_pairing_check(proof);
    vinfo("MultiHonkVerifier: reduced to pairing check: ", reduction_succeeded ? "true" : "false");

    if constexpr (!IsRecursive) {
        if (!reduction_succeeded) {
            vinfo("MultiHonkVerifier: verification failed at reduction step");
            return Output{};
        }
    }

    // Process public inputs
    IO inputs;
    inputs.reconstruct_from_public(this->verifier_instance->public_inputs);

    // Aggregate pairing points
    PairingPoints pi_pairing_points = inputs.pairing_inputs;
    pi_pairing_points.aggregate(pcs_pairing_points);

    Output output;

    if constexpr (IsRecursive) {
        // Recursive: populate output for deferred verification
        output.points_accumulator = std::move(pi_pairing_points);
    } else {
        // Perform pairing check
        bool pairing_verified = pi_pairing_points.check();

        if (!pairing_verified) {
            vinfo("MultiHonkVerifier: verification failed at pairing check");
            return Output{};
        }

        output.result = true;
    }

    return output;
}

// Native flavor instantiations
template class MultiHonkVerifier_<MultiMegaFlavor, DefaultIO>;
template class MultiHonkVerifier_<MultiMegaZKFlavor, DefaultIO>;
template class MultiHonkVerifier_<MultiMegaZKFlavor, HidingKernelIO>;

// Recursive flavor instantiations
template class MultiHonkVerifier_<MultiMegaRecursiveFlavor_<UltraCircuitBuilder>,
                                  stdlib::recursion::honk::DefaultIO<UltraCircuitBuilder>>;
template class MultiHonkVerifier_<MultiMegaRecursiveFlavor_<MegaCircuitBuilder>,
                                  stdlib::recursion::honk::DefaultIO<MegaCircuitBuilder>>;
template class MultiHonkVerifier_<MultiMegaZKRecursiveFlavor_<UltraCircuitBuilder>,
                                  stdlib::recursion::honk::DefaultIO<UltraCircuitBuilder>>;
template class MultiHonkVerifier_<MultiMegaZKRecursiveFlavor_<UltraCircuitBuilder>,
                                  stdlib::recursion::honk::HidingKernelIO<UltraCircuitBuilder>>;
template class MultiHonkVerifier_<MultiMegaZKRecursiveFlavor_<MegaCircuitBuilder>,
                                  stdlib::recursion::honk::DefaultIO<MegaCircuitBuilder>>;

} // namespace bb

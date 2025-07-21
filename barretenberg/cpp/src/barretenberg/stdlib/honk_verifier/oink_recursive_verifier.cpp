// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "barretenberg/stdlib/honk_verifier/oink_recursive_verifier.hpp"

#include "barretenberg/flavor/mega_recursive_flavor.hpp"
#include "barretenberg/flavor/mega_zk_recursive_flavor.hpp"
#include "barretenberg/flavor/ultra_recursive_flavor.hpp"
#include "barretenberg/flavor/ultra_rollup_recursive_flavor.hpp"
#include "barretenberg/flavor/ultra_zk_recursive_flavor.hpp"
#include "barretenberg/honk/library/grand_product_delta.hpp"
#include "barretenberg/numeric/bitop/get_msb.hpp"
#include <utility>

namespace bb::stdlib::recursion::honk {

template <typename Flavor>
OinkRecursiveVerifier_<Flavor>::OinkRecursiveVerifier_(Builder* builder,
                                                       const std::shared_ptr<RecursiveDeciderVK>& decider_vk,
                                                       const std::shared_ptr<Transcript>& transcript,
                                                       std::string domain_separator)
    : decider_vk(decider_vk)
    , builder(builder)
    , transcript(transcript)
    , domain_separator(std::move(domain_separator))
{}

template <typename Flavor>
OinkRecursiveVerifier_<Flavor>::OinkRecursiveVerifier_(Builder* builder,
                                                       const std::shared_ptr<RecursiveDeciderVK>& decider_vk,
                                                       std::string domain_separator)
    : decider_vk(decider_vk)
    , builder(builder)
    , domain_separator(std::move(domain_separator))
{}

template <typename Flavor> void OinkRecursiveVerifier_<Flavor>::verify_proof(const OinkProof& proof)
{
    transcript->load_proof(proof);
    verify();
}

template <typename Flavor> void OinkRecursiveVerifier_<Flavor>::verify()
{
    using CommitmentLabels = typename Flavor::CommitmentLabels;

    WitnessCommitments commitments;
    CommitmentLabels labels;

    FF vkey_hash = decider_vk->vk_and_hash->vk->add_hash_to_transcript(domain_separator, *transcript);
    vinfo("vk hash in Oink recursive verifier: ", vkey_hash);
    vinfo("expected vk hash: ", decider_vk->vk_and_hash->hash);
    // Check that the vk hash matches the hash of the verification key
    decider_vk->vk_and_hash->hash.assert_equal(vkey_hash);

    size_t num_public_inputs =
        static_cast<size_t>(static_cast<uint32_t>(decider_vk->vk_and_hash->vk->num_public_inputs.get_value()));
    std::vector<FF> public_inputs;
    for (size_t i = 0; i < num_public_inputs; ++i) {
        public_inputs.emplace_back(
            transcript->template receive_from_prover<FF>(domain_separator + "public_input_" + std::to_string(i)));
    }

    // Get commitments to first three wire polynomials
    commitments.w_l = transcript->template receive_from_prover<Commitment>(domain_separator + labels.w_l);
    commitments.w_r = transcript->template receive_from_prover<Commitment>(domain_separator + labels.w_r);
    commitments.w_o = transcript->template receive_from_prover<Commitment>(domain_separator + labels.w_o);

    // If Goblin, get commitments to ECC op wire polynomials and DataBus columns
    if constexpr (IsMegaFlavor<Flavor>) {
        // Receive ECC op wire commitments
        for (auto [commitment, label] : zip_view(commitments.get_ecc_op_wires(), labels.get_ecc_op_wires())) {
            commitment = transcript->template receive_from_prover<Commitment>(domain_separator + label);
        }

        // Receive DataBus related polynomial commitments
        for (auto [commitment, label] : zip_view(commitments.get_databus_entities(), labels.get_databus_entities())) {
            commitment = transcript->template receive_from_prover<Commitment>(domain_separator + label);
        }
    }

    // Get eta challenges; used in RAM/ROM memory records and log derivative lookup argument
    auto [eta, eta_two, eta_three] = transcript->template get_challenges<FF>(
        domain_separator + "eta", domain_separator + "eta_two", domain_separator + "eta_three");

    // Get commitments to lookup argument polynomials and fourth wire
    commitments.lookup_read_counts =
        transcript->template receive_from_prover<Commitment>(domain_separator + labels.lookup_read_counts);
    commitments.lookup_read_tags =
        transcript->template receive_from_prover<Commitment>(domain_separator + labels.lookup_read_tags);
    commitments.w_4 = transcript->template receive_from_prover<Commitment>(domain_separator + labels.w_4);

    // Get permutation challenges
    auto [beta, gamma] = transcript->template get_challenges<FF>(domain_separator + "beta", domain_separator + "gamma");

    commitments.lookup_inverses =
        transcript->template receive_from_prover<Commitment>(domain_separator + labels.lookup_inverses);

    // If Goblin (i.e. using DataBus) receive commitments to log-deriv inverses polynomials
    if constexpr (IsMegaFlavor<Flavor>) {
        for (auto [commitment, label] : zip_view(commitments.get_databus_inverses(), labels.get_databus_inverses())) {
            commitment = transcript->template receive_from_prover<Commitment>(domain_separator + label);
        }
    }

    const FF public_input_delta = compute_public_input_delta<Flavor>(public_inputs,
                                                                     beta,
                                                                     gamma,
                                                                     decider_vk->vk_and_hash->vk->log_circuit_size,
                                                                     decider_vk->vk_and_hash->vk->pub_inputs_offset);

    // Get commitment to permutation and lookup grand products
    commitments.z_perm = transcript->template receive_from_prover<Commitment>(domain_separator + labels.z_perm);

    // Get the subrelation separation challenges for sumcheck/combiner computation
    std::array<std::string, Flavor::NUM_SUBRELATIONS - 1> challenge_labels;

    for (size_t idx = 0; idx < Flavor::NUM_SUBRELATIONS - 1; ++idx) {
        challenge_labels[idx] = domain_separator + "alpha_" + std::to_string(idx);
    }
    // It is more efficient to generate an array of challenges than to generate them individually.
    SubrelationSeparators alphas = transcript->template get_challenges<FF>(challenge_labels);

    decider_vk->relation_parameters =
        RelationParameters<FF>{ eta, eta_two, eta_three, beta, gamma, public_input_delta };
    decider_vk->witness_commitments = std::move(commitments);
    decider_vk->public_inputs = std::move(public_inputs);
    decider_vk->alphas = std::move(alphas);
}

template class OinkRecursiveVerifier_<bb::UltraRecursiveFlavor_<UltraCircuitBuilder>>;
template class OinkRecursiveVerifier_<bb::UltraRecursiveFlavor_<MegaCircuitBuilder>>;
template class OinkRecursiveVerifier_<bb::MegaRecursiveFlavor_<UltraCircuitBuilder>>;
template class OinkRecursiveVerifier_<bb::MegaRecursiveFlavor_<MegaCircuitBuilder>>;
template class OinkRecursiveVerifier_<bb::MegaZKRecursiveFlavor_<MegaCircuitBuilder>>;
template class OinkRecursiveVerifier_<bb::MegaZKRecursiveFlavor_<UltraCircuitBuilder>>;
template class OinkRecursiveVerifier_<bb::UltraRollupRecursiveFlavor_<UltraCircuitBuilder>>;
template class OinkRecursiveVerifier_<bb::UltraZKRecursiveFlavor_<UltraCircuitBuilder>>;
template class OinkRecursiveVerifier_<bb::UltraZKRecursiveFlavor_<MegaCircuitBuilder>>;
} // namespace bb::stdlib::recursion::honk

// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "barretenberg/stdlib/honk_verifier/oink_recursive_verifier.hpp"

#include "barretenberg/honk/library/grand_product_delta.hpp"
#include "barretenberg/numeric/bitop/get_msb.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_recursive_flavor.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_zk_recursive_flavor.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_recursive_flavor.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_rollup_recursive_flavor.hpp"
#include <utility>

namespace bb::stdlib::recursion::honk {

template <typename Flavor>
OinkRecursiveVerifier_<Flavor>::OinkRecursiveVerifier_(Builder* builder,
                                                       const std::shared_ptr<RecursiveDeciderVK>& verification_key,
                                                       const std::shared_ptr<Transcript>& transcript,
                                                       std::string domain_separator)
    : verification_key(verification_key)
    , builder(builder)
    , transcript(transcript)
    , domain_separator(std::move(domain_separator))
{}

template <typename Flavor>
OinkRecursiveVerifier_<Flavor>::OinkRecursiveVerifier_(Builder* builder,
                                                       const std::shared_ptr<RecursiveDeciderVK>& verification_key,
                                                       std::string domain_separator)
    : verification_key(verification_key)
    , builder(builder)
    , domain_separator(std::move(domain_separator))
{}

template <typename Flavor> void OinkRecursiveVerifier_<Flavor>::verify_proof(const OinkProof& proof)
{
    transcript = std::make_shared<Transcript>(proof);
    verify();
}

template <typename Flavor> void OinkRecursiveVerifier_<Flavor>::verify()
{
    using CommitmentLabels = typename Flavor::CommitmentLabels;

    WitnessCommitments commitments;
    CommitmentLabels labels;

    FF circuit_size = verification_key->verification_key->circuit_size;
    FF public_input_size = verification_key->verification_key->num_public_inputs;
    FF pub_inputs_offset = verification_key->verification_key->pub_inputs_offset;
    transcript->add_to_hash_buffer(domain_separator + "circuit_size", circuit_size);
    transcript->add_to_hash_buffer(domain_separator + "public_input_size", public_input_size);
    transcript->add_to_hash_buffer(domain_separator + "pub_inputs_offset", pub_inputs_offset);

    std::vector<FF> public_inputs;
    for (size_t i = 0; i < static_cast<size_t>(static_cast<uint32_t>(public_input_size.get_value())); ++i) {
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

    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1283): Suspicious get_value().
    const FF public_input_delta = compute_public_input_delta<Flavor>(
        public_inputs,
        beta,
        gamma,
        circuit_size,
        static_cast<uint32_t>(verification_key->verification_key->pub_inputs_offset.get_value()));

    // Get commitment to permutation and lookup grand products
    commitments.z_perm = transcript->template receive_from_prover<Commitment>(domain_separator + labels.z_perm);

    RelationSeparator alphas;
    std::array<std::string, Flavor::NUM_SUBRELATIONS - 1> args;
    for (size_t idx = 0; idx < alphas.size(); ++idx) {
        args[idx] = domain_separator + "alpha_" + std::to_string(idx);
    }
    alphas = transcript->template get_challenges<FF>(args);

    verification_key->relation_parameters =
        RelationParameters<FF>{ eta, eta_two, eta_three, beta, gamma, public_input_delta };
    verification_key->witness_commitments = std::move(commitments);
    verification_key->public_inputs = std::move(public_inputs);
    verification_key->alphas = std::move(alphas);
}

template class OinkRecursiveVerifier_<bb::UltraRecursiveFlavor_<UltraCircuitBuilder>>;
template class OinkRecursiveVerifier_<bb::UltraRecursiveFlavor_<MegaCircuitBuilder>>;
template class OinkRecursiveVerifier_<bb::MegaRecursiveFlavor_<UltraCircuitBuilder>>;
template class OinkRecursiveVerifier_<bb::MegaRecursiveFlavor_<MegaCircuitBuilder>>;
template class OinkRecursiveVerifier_<bb::MegaZKRecursiveFlavor_<MegaCircuitBuilder>>;
template class OinkRecursiveVerifier_<bb::MegaZKRecursiveFlavor_<UltraCircuitBuilder>>;
template class OinkRecursiveVerifier_<bb::UltraRollupRecursiveFlavor_<UltraCircuitBuilder>>;
} // namespace bb::stdlib::recursion::honk

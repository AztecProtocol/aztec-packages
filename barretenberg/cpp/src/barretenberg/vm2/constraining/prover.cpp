#include "barretenberg/vm2/constraining/prover.hpp"

#include "barretenberg/commitment_schemes/claim.hpp"
#include "barretenberg/commitment_schemes/commitment_key.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/common/constexpr_utils.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/honk/library/grand_product_library.hpp"
#include "barretenberg/honk/proof_system/logderivative_library.hpp"
#include "barretenberg/relations/permutation_relation.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"
#include "barretenberg/vm2/tooling/stats.hpp"

namespace bb::avm2 {

using Flavor = AvmFlavor;
using FF = Flavor::FF;

/**
 * Create AvmProver from proving key, witness and manifest.
 *
 * @param input_key Proving key.
 * @param input_manifest Input manifest
 *
 * @tparam settings Settings class.
 */
AvmProver::AvmProver(std::shared_ptr<Flavor::ProvingKey> input_key, PCSCommitmentKey& commitment_key)
    : key(std::move(input_key))
    , prover_polynomials(*key)
    , commitment_key(std::move(commitment_key))
{}

/**
 * @brief Add circuit size, public input size, and public inputs to transcript
 *
 */
void AvmProver::execute_preamble_round()
{
    const auto circuit_size = static_cast<uint32_t>(key->circuit_size);

    transcript->send_to_verifier("circuit_size", circuit_size);
}

/**
 * @brief Compute commitments to all of the witness wires (apart from the logderivative inverse wires)
 *
 */
void AvmProver::execute_wire_commitments_round()
{
    // Commit to all polynomials (apart from logderivative inverse polynomials, which are committed to in the later
    // logderivative phase)
    auto wire_polys = prover_polynomials.get_wires();
    const auto& labels = prover_polynomials.get_wires_labels();
    for (size_t idx = 0; idx < wire_polys.size(); ++idx) {
        transcript->send_to_verifier(labels[idx], commitment_key.commit(wire_polys[idx]));
    }
}

void AvmProver::execute_log_derivative_inverse_round()
{
    auto [beta, gamma] = transcript->template get_challenges<FF>("beta", "gamma");
    relation_parameters.beta = beta;
    relation_parameters.gamma = gamma;
    std::vector<std::function<void()>> tasks;

    bb::constexpr_for<0, std::tuple_size_v<Flavor::LookupRelations>, 1>([&]<size_t relation_idx>() {
        using Relation = std::tuple_element_t<relation_idx, Flavor::LookupRelations>;
        tasks.push_back([&]() {
            AVM_TRACK_TIME(std::string("prove/execute_log_derivative_inverse_round/") + std::string(Relation::NAME),
                           (compute_logderivative_inverse<FF, Relation>(
                               prover_polynomials, relation_parameters, key->circuit_size)));
        });
    });

    bb::parallel_for(tasks.size(), [&](size_t i) { tasks[i](); });
}

void AvmProver::execute_log_derivative_inverse_commitments_round()
{
    // Commit to all logderivative inverse polynomials
    for (auto [commitment, key_poly] : zip_view(witness_commitments.get_derived(), key->get_derived())) {
        commitment = commitment_key.commit(key_poly);
    }

    // Send all commitments to the verifier
    for (auto [label, commitment] :
         zip_view(prover_polynomials.get_derived_labels(), witness_commitments.get_derived())) {
        transcript->send_to_verifier(label, commitment);
    }
}

/**
 * @brief Run Sumcheck resulting in u = (u_1,...,u_d) challenges and all evaluations at u being calculated.
 *
 */
void AvmProver::execute_relation_check_rounds()
{
    using Sumcheck = SumcheckProver<Flavor>;

    auto sumcheck = Sumcheck(key->circuit_size, transcript);

    FF alpha = transcript->template get_challenge<FF>("Sumcheck:alpha");
    std::vector<FF> gate_challenges(numeric::get_msb(key->circuit_size));

    for (size_t idx = 0; idx < gate_challenges.size(); idx++) {
        gate_challenges[idx] = transcript->template get_challenge<FF>("Sumcheck:gate_challenge_" + std::to_string(idx));
    }
    sumcheck_output = sumcheck.prove(prover_polynomials, relation_parameters, alpha, gate_challenges);
}

void AvmProver::execute_pcs_rounds()
{
    using OpeningClaim = ProverOpeningClaim<Curve>;
    using PolynomialBatcher = GeminiProver_<Curve>::PolynomialBatcher;

    PolynomialBatcher polynomial_batcher(key->circuit_size);
    polynomial_batcher.set_unshifted(prover_polynomials.get_unshifted());
    polynomial_batcher.set_to_be_shifted_by_one(prover_polynomials.get_to_be_shifted());

    const OpeningClaim prover_opening_claim = ShpleminiProver_<Curve>::prove(
        key->circuit_size, polynomial_batcher, sumcheck_output.challenge, commitment_key, transcript);

    PCS::compute_opening_proof(commitment_key, prover_opening_claim, transcript);
}

HonkProof AvmProver::export_proof()
{
    proof = transcript->proof_data;
    return proof;
}

HonkProof AvmProver::construct_proof()
{
    // Add circuit size public input size and public inputs to transcript.
    execute_preamble_round();

    // Compute wire commitments.
    AVM_TRACK_TIME("prove/execute_wire_commitments_round", execute_wire_commitments_round());

    // Compute log derivative inverses.
    AVM_TRACK_TIME("prove/execute_log_derivative_inverse_round", execute_log_derivative_inverse_round());

    // Compute commitments to logderivative inverse polynomials.
    AVM_TRACK_TIME("prove/execute_log_derivative_inverse_commitments_round",
                   execute_log_derivative_inverse_commitments_round());

    // Run sumcheck subprotocol.
    AVM_TRACK_TIME("prove/execute_relation_check_rounds", execute_relation_check_rounds());

    // Execute PCS.
    AVM_TRACK_TIME("prove/execute_pcs_rounds", execute_pcs_rounds());

    return export_proof();
}

} // namespace bb::avm2

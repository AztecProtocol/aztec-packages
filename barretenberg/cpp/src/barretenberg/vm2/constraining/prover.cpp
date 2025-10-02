#include "barretenberg/vm2/constraining/prover.hpp"

#include <cstdlib>

#include "barretenberg/commitment_schemes/claim.hpp"
#include "barretenberg/commitment_schemes/commitment_key.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/common/constexpr_utils.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/honk/library/grand_product_library.hpp"
#include "barretenberg/honk/proof_system/logderivative_library.hpp"
#include "barretenberg/relations/permutation_relation.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"
#include "barretenberg/vm2/common/constants.hpp"
#include "barretenberg/vm2/constraining/polynomials.hpp"
#include "barretenberg/vm2/tooling/stats.hpp"

namespace bb::avm2 {

// Maximum number of polynomials to batch commit at once.
const size_t AVM_MAX_MSM_BATCH_SIZE =
    getenv("AVM_MAX_MSM_BATCH_SIZE") != nullptr ? std::stoul(getenv("AVM_MAX_MSM_BATCH_SIZE")) : 32;

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
AvmProver::AvmProver(std::shared_ptr<Flavor::ProvingKey> input_key,
                     std::shared_ptr<Flavor::VerificationKey> vk,
                     const PCSCommitmentKey& commitment_key)
    : key(std::move(input_key))
    , vk(std::move(vk))
    , prover_polynomials(*key)
    , commitment_key(commitment_key)
{}

/**
 * @brief Add circuit size, public input size, and public inputs to transcript
 *
 */
void AvmProver::execute_preamble_round()
{
    // TODO(#15892): Fiat-shamir the vk hash by uncommenting the line below.
    FF vk_hash = vk->hash();
    // transcript->add_to_hash_buffer("avm_vk_hash", vk_hash);
    info("AVM vk hash in prover: ", vk_hash);
}

/**
 * @brief Add public inputs to transcript
 *
 */
void AvmProver::execute_public_inputs_round()
{
    BB_BENCH_NAME("AvmProver::execute_public_inputs_round");

    using C = ColumnAndShifts;
    // We take the starting values of the public inputs polynomials to add to the transcript
    const auto public_inputs_cols = std::vector({ &prover_polynomials.get(C::public_inputs_cols_0_),
                                                  &prover_polynomials.get(C::public_inputs_cols_1_),
                                                  &prover_polynomials.get(C::public_inputs_cols_2_),
                                                  &prover_polynomials.get(C::public_inputs_cols_3_) });
    for (size_t i = 0; i < public_inputs_cols.size(); ++i) {
        for (size_t j = 0; j < AVM_PUBLIC_INPUTS_COLUMNS_MAX_LENGTH; ++j) {
            // The public inputs are added to the hash buffer, but do not increase the size of the proof
            transcript->add_to_hash_buffer("public_input_" + std::to_string(i) + "_" + std::to_string(j),
                                           j < public_inputs_cols[i]->size() ? public_inputs_cols[i]->at(j) : FF(0));
        }
    }
}
/**
 * @brief Compute commitments to all of the witness wires (apart from the logderivative inverse wires)
 *
 */
void AvmProver::execute_wire_commitments_round()
{
    BB_BENCH_NAME("AvmProver::execute_wire_commitments_round");
    // Commit to all polynomials (apart from logderivative inverse polynomials, which are committed to in the later
    // logderivative phase)
    auto wire_polys = prover_polynomials.get_wires();
    const auto& labels = prover_polynomials.get_wires_labels();
    auto batch = commitment_key.start_batch();
    for (size_t idx = 0; idx < wire_polys.size(); ++idx) {
        batch.add_to_batch(wire_polys[idx], labels[idx], /*mask for zk?*/ false);
    }
    batch.commit_and_send_to_verifier(transcript, AVM_MAX_MSM_BATCH_SIZE);
}

void AvmProver::execute_log_derivative_inverse_round()
{
    BB_BENCH_NAME("AvmProver::execute_log_derivative_inverse_round");

    auto [beta, gamma] = transcript->template get_challenges<FF>("beta", "gamma");
    relation_parameters.beta = beta;
    relation_parameters.gamma = gamma;
    std::vector<std::function<void()>> tasks;

    bb::constexpr_for<0, std::tuple_size_v<Flavor::LookupRelations>, 1>([&]<size_t relation_idx>() {
        using Relation = std::tuple_element_t<relation_idx, Flavor::LookupRelations>;
        tasks.push_back([&]() {
            // We need to resize the inverse polynomials for the relation, now that the selectors have been computed.
            constraining::resize_inverses(prover_polynomials,
                                          Relation::Settings::INVERSES,
                                          Relation::Settings::SRC_SELECTOR,
                                          Relation::Settings::DST_SELECTOR);

            AVM_TRACK_TIME(std::string("prove/log_derivative_inverse_round/") + std::string(Relation::NAME),
                           (compute_logderivative_inverse<FF, Relation>(
                               prover_polynomials, relation_parameters, key->circuit_size)));
        });
    });

    bb::parallel_for(tasks.size(), [&](size_t i) { tasks[i](); });
}

void AvmProver::execute_log_derivative_inverse_commitments_round()
{
    BB_BENCH_NAME("AvmProver::execute_log_derivative_inverse_commitments_round");
    auto batch = commitment_key.start_batch();
    // Commit to all logderivative inverse polynomials and send to verifier
    for (auto [derived_poly, commitment, label] : zip_view(prover_polynomials.get_derived(),
                                                           witness_commitments.get_derived(),
                                                           prover_polynomials.get_derived_labels())) {

        batch.add_to_batch(derived_poly, label, /*mask for zk?*/ false);
    }
    batch.commit_and_send_to_verifier(transcript, AVM_MAX_MSM_BATCH_SIZE);
}

/**
 * @brief Run Sumcheck resulting in u = (u_1,...,u_d) challenges and all evaluations at u being calculated.
 *
 */
void AvmProver::execute_relation_check_rounds()
{
    BB_BENCH_NAME("AvmProver::execute_relation_check_rounds");
    using Sumcheck = SumcheckProver<Flavor>;

    // Multiply each linearly independent subrelation contribution by `alpha^i` for i = 0, ..., NUM_SUBRELATIONS - 1.
    const FF alpha = transcript->template get_challenge<FF>("Sumcheck:alpha");

    // Generate gate challenges
    std::vector<FF> gate_challenges =
        transcript->template get_powers_of_challenge<FF>("Sumcheck:gate_challenge", key->log_circuit_size);

    Sumcheck sumcheck(key->circuit_size,
                      prover_polynomials,
                      transcript,
                      alpha,
                      gate_challenges,
                      relation_parameters,
                      key->log_circuit_size);

    sumcheck_output = sumcheck.prove();
}

void AvmProver::execute_pcs_rounds()
{
    BB_BENCH_NAME("AvmProver::execute_pcs_rounds");

    using OpeningClaim = ProverOpeningClaim<Curve>;
    using PolynomialBatcher = GeminiProver_<Curve>::PolynomialBatcher;

    PolynomialBatcher polynomial_batcher(key->circuit_size);
    polynomial_batcher.set_unshifted(RefVector<Polynomial>::from_span(prover_polynomials.get_unshifted()));
    polynomial_batcher.set_to_be_shifted_by_one(
        RefVector<Polynomial>::from_span(prover_polynomials.get_to_be_shifted()));

    const OpeningClaim prover_opening_claim = ShpleminiProver_<Curve>::prove(
        key->circuit_size, polynomial_batcher, sumcheck_output.challenge, commitment_key, transcript);

    PCS::compute_opening_proof(commitment_key, prover_opening_claim, transcript);
}

HonkProof AvmProver::export_proof()
{
    return transcript->export_proof();
}

HonkProof AvmProver::construct_proof()
{
    // Add circuit size public input size and public inputs to transcript.
    execute_preamble_round();

    // TODO(https://github.com/AztecProtocol/aztec-packages/pull/17045): make the protocols secure at some point
    // // Add public inputs to transcript.
    // AVM_TRACK_TIME("prove/public_inputs_round", execute_public_inputs_round());

    // Compute wire commitments.
    AVM_TRACK_TIME("prove/wire_commitments_round", execute_wire_commitments_round());

    // Compute log derivative inverses.
    AVM_TRACK_TIME("prove/log_derivative_inverse_round", execute_log_derivative_inverse_round());

    // Compute commitments to logderivative inverse polynomials.
    AVM_TRACK_TIME("prove/log_derivative_inverse_commitments_round",
                   execute_log_derivative_inverse_commitments_round());

    // Run sumcheck subprotocol.
    AVM_TRACK_TIME("prove/sumcheck", execute_relation_check_rounds());

    // Execute PCS.
    AVM_TRACK_TIME("prove/pcs_rounds", execute_pcs_rounds());

    return export_proof();
}

} // namespace bb::avm2

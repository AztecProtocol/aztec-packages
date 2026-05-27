// === AUDIT STATUS ===
// internal:    { status: Completed, auditors: [Federico], commit: 0e37cb8}
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================
#include "barretenberg/vm2/constraining/prover.hpp"

#include <algorithm>
#include <cstdlib>

#include "barretenberg/commitment_schemes/claim.hpp"
#include "barretenberg/commitment_schemes/commitment_key.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/common/constexpr_utils.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/honk/library/grand_product_library.hpp"
#include "barretenberg/honk/proof_system/logderivative_library.hpp"
#include "barretenberg/numeric/bitop/get_msb.hpp"
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
 * Create AvmProver from proving key, verification key and commitment key.
 *
 * @param input_key Proving key.
 * @param vk Verification key.
 * @param commitment_key PCS commitment key
 *
 */
AvmProver::AvmProver(std::shared_ptr<Flavor::ProvingKey> input_proving_key,
                     std::shared_ptr<Flavor::VerificationKey> vk,
                     const PCSCommitmentKey& commitment_key)
    : proving_key(std::move(input_proving_key))
    , vk(std::move(vk))
    , prover_polynomials(*proving_key)
    , commitment_key(commitment_key)
{}

/**
 * @brief Add vk hash to transcript
 *
 */
void AvmProver::execute_preamble_round()
{
    FF vk_hash = vk->get_hash();
    transcript->add_to_hash_buffer("avm_vk_hash", vk_hash);
    vinfo("AVM vk hash in prover: ", vk_hash);
}

/**
 * @brief Add public inputs to transcript
 *
 * @note The number of public inputs in the proof is fixed. If there are fewer public inputs than the fixed number, we
 * pad with zeros.
 *
 */
void AvmProver::execute_public_inputs_round()
{
    BB_BENCH_NAME("AvmProver::execute_public_inputs_round");

    using C = ColumnAndShifts;
    // Add the public inputs to the transcript so that the Sumcheck challenge depends both on the public inputs sent in
    // the clear and the commitments to the columns that are purtported to contain them.
    const std::array<ColumnAndShifts, AVM_NUM_PUBLIC_INPUT_COLUMNS> public_input_columns = {
        C::public_inputs_cols_0_,
        C::public_inputs_cols_1_,
        C::public_inputs_cols_2_,
        C::public_inputs_cols_3_,
    };

    for (size_t i = 0; i < public_input_columns.size(); ++i) {
        const Polynomial& public_input_col = prover_polynomials.get(public_input_columns[i]);
        size_t public_input_col_size = public_input_col.size();
        for (size_t j = 0; j < AVM_PUBLIC_INPUTS_COLUMNS_MAX_LENGTH; ++j) {
            // The public inputs are added to the hash buffer, but do not increase the size of the proof
            transcript->add_to_hash_buffer("public_input_" + std::to_string(i) + "_" + std::to_string(j),
                                           j < public_input_col_size ? public_input_col.at(j) : FF(0));
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
    auto batch = commitment_key.start_batch();
    for (const auto& [poly, label] : zip_view(prover_polynomials.get_wires(), prover_polynomials.get_wires_labels())) {
        batch.add_to_batch(poly, label);
    }
    batch.commit_and_send_to_verifier(transcript, AVM_MAX_MSM_BATCH_SIZE);
}

void AvmProver::execute_log_derivative_inverse_round()
{
    BB_BENCH_NAME("AvmProver::execute_log_derivative_inverse_round");

    auto [beta, gamma] = transcript->template get_challenges<FF>(std::array<std::string, 2>{ "beta", "gamma" });
    relation_parameters.beta = beta;
    relation_parameters.gamma = gamma;
    std::vector<std::function<void()>> tasks;

    // Iterate over all LookupRelations and for each relation create a task that:
    // 1. Resizes the inverse polynomial based on the max end_index() of the source and destination selector
    // 2. Computes the logderivative inverse
    bb::constexpr_for<0, std::tuple_size_v<Flavor::LookupRelations>, 1>([&]<size_t relation_idx>() {
        using Relation = std::tuple_element_t<relation_idx, Flavor::LookupRelations>;
        tasks.push_back([&]() {
            // We need to resize the inverse polynomials for the relation, now that the selectors have been computed.
            constraining::resize_inverses(prover_polynomials,
                                          Relation::Settings::INVERSES,
                                          Relation::Settings::SRC_SELECTOR,
                                          Relation::Settings::DST_SELECTOR);

            AVM_TRACK_TIME(std::string("prove/log_derivative_inverse_round/") + std::string(Relation::NAME),
                           (compute_logderivative_inverse<FF, Relation, Flavor::ProverPolynomials, false>(
                               prover_polynomials, relation_parameters)));
        });
    });

    // Execute all the tasks in parallel
    bb::parallel_for(tasks.size(), [&](size_t i) { tasks[i](); });
}

void AvmProver::execute_log_derivative_inverse_commitments_round()
{
    BB_BENCH_NAME("AvmProver::execute_log_derivative_inverse_commitments_round");
    auto batch = commitment_key.start_batch();
    // Commit to all logderivative inverse polynomials and send to verifier
    for (auto [derived_poly, label] :
         zip_view(prover_polynomials.get_derived(), prover_polynomials.get_derived_labels())) {

        batch.add_to_batch(derived_poly, label);
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
    std::vector<FF> gate_challenges = transcript->template get_dyadic_powers_of_challenge<FF>(
        "Sumcheck:gate_challenge", ProvingKey::log_circuit_size);

    Sumcheck sumcheck(ProvingKey::circuit_size,
                      prover_polynomials,
                      transcript,
                      alpha,
                      gate_challenges,
                      relation_parameters,
                      ProvingKey::log_circuit_size);

    sumcheck_output = sumcheck.prove();
}

/**
 * @brief Run the PCS to prove that the claimed evaluations are correct.
 *
 * @details To optimize performance time, we batch the polynomials using short scalars before executing Shplemini.
 * The batching proceeds in two phases (note that the unshifted polynomials contain copies of the shifted polynomials
 * that have not been shifted yet; this allows us to save some work by batching the shifted polynomials in their
 * to_be_shifted form and later shift them):
 *  1. Batch the shifted polynomials (in their to_be_shifted form) into a single polynomial
 *  2. Batch the unshifted polynomials, excluding the to_be_shifted polynomials, and then the batched polynomial
 *     computed at step 1
 */
void AvmProver::execute_pcs_rounds()
{
    BB_BENCH_NAME("AvmProver::execute_pcs_rounds");

    using OpeningClaim = ProverOpeningClaim<Curve>;
    using PolynomialBatcher = GeminiProver_<Curve>::PolynomialBatcher;
    using Challenges = Flavor::AllEntities<FF>;

    // Batch polynomials using short scalars
    auto unshifted_polys = prover_polynomials.get_unshifted();
    auto shifted_polys = prover_polynomials.get_to_be_shifted();

    // Get short batching challenges from transcript
    Challenges challenges;
    auto unshifted_challenges_vec = transcript->template get_challenges<FF>(challenges.get_unshifted_labels());
    std::ranges::move(unshifted_challenges_vec, challenges.get_unshifted().begin());
    auto unshifted_challenges = challenges.get_unshifted();
    auto shifted_challenges = challenges.get_to_be_shifted();

    auto index_of_max_end_index = [](const auto& polys) {
        // this assumes non-empty, returns an iterator
        auto it = std::ranges::max_element(
            polys.begin(), polys.end(), [](const auto& a, const auto& b) { return a.end_index() < b.end_index(); });

        // retrieves the index of the max element
        return static_cast<size_t>(std::distance(polys.begin(), it));
    };

    auto add_scaled_batched =
        [](Polynomial& dst, const std::span<Polynomial>& sources, const std::span<FF>& scalars, const size_t skip_idx) {
            const size_t num_slots = bb::get_num_cpus();
            std::vector<Polynomial> batched_polys(num_slots);
            for (auto& poly : batched_polys) {
                poly = Polynomial(dst.size(), dst.virtual_size(), dst.start_index());
            }

            // Chunks are consumed dynamically via an atomic counter: faster threads naturally pick up
            // more chunks while the slot they write to stays fixed for the life of their outer task.
            std::atomic<size_t> next_poly(0);

            // Accumulate polynomials: each thread picks up the next available polynomial
            parallel_for(num_slots, [&](size_t slot_id) {
                while (true) {
                    const size_t poly_id = next_poly.fetch_add(1, std::memory_order_relaxed);
                    if (poly_id >= sources.size()) {
                        break;
                    }
                    if (poly_id == skip_idx) {
                        continue;
                    }

                    const size_t start_idx = sources[poly_id].start_index();
                    const size_t end_idx = sources[poly_id].end_index();
                    for (size_t idx = start_idx; idx < end_idx; idx++) {
                        batched_polys[slot_id].at(idx) += scalars[poly_id] * sources[poly_id][idx];
                    }
                }
            });

            for (const auto& poly : batched_polys) {
                dst += poly;
            }
        };

    // Batch to be shifted polys in their to_be_shifted form
    // Search for poly with largest end index to avoid allocating a zero polynomial of circuit size
    size_t max_idx_shifted = index_of_max_end_index(shifted_polys);

    Polynomial batched_shifted = std::move(shifted_polys[max_idx_shifted]);
    batched_shifted *= shifted_challenges[max_idx_shifted];
    add_scaled_batched(batched_shifted, shifted_polys, shifted_challenges, max_idx_shifted);

    // Batch unshifted polys
    // Search the not to be shifted poly of max size to avoid allocating a zero polynomial of circuit size
    // The not to be shifted polys are in the ranges [0, WIRES_TO_BE_SHIFTED_START_IDX) and
    // [WIRES_TO_BE_SHIFTED_END_IDX, end]
    size_t max_idx_left_side = index_of_max_end_index(unshifted_polys.subspan(0, WIRES_TO_BE_SHIFTED_START_IDX));
    size_t max_idx_right_side = index_of_max_end_index(unshifted_polys.subspan(WIRES_TO_BE_SHIFTED_END_IDX));
    size_t max_idx_unshifted = unshifted_polys[max_idx_left_side].end_index() >
                                       unshifted_polys[max_idx_right_side + WIRES_TO_BE_SHIFTED_END_IDX].end_index()
                                   ? max_idx_left_side
                                   : max_idx_right_side + WIRES_TO_BE_SHIFTED_END_IDX;

    // Assign the batched unshifted polynomial according to whether the largest poly was among the to be shifted polys
    // or not
    Polynomial batched_unshifted;
    if (unshifted_polys[max_idx_unshifted].end_index() > batched_shifted.end_index()) {
        batched_unshifted = std::move(unshifted_polys[max_idx_unshifted]);
        batched_unshifted *= unshifted_challenges[max_idx_unshifted];
        batched_unshifted += batched_shifted;
    } else {
        // batched_shifted has a start_index == 1 which would assert if we directly call
        // batched_shifted.add_scaled(unshifted_polys[..]..). We therefore first initialize
        // a zero polynomial with start_index == 0 and size = end_index.
        batched_unshifted = Polynomial(batched_shifted.end_index());
        batched_unshifted += batched_shifted;
        batched_unshifted.add_scaled(unshifted_polys[max_idx_unshifted], unshifted_challenges[max_idx_unshifted]);
    }

    add_scaled_batched(batched_unshifted,
                       unshifted_polys.subspan(0, WIRES_TO_BE_SHIFTED_START_IDX),
                       unshifted_challenges.subspan(0, WIRES_TO_BE_SHIFTED_START_IDX),
                       max_idx_unshifted);
    add_scaled_batched(batched_unshifted,
                       unshifted_polys.subspan(WIRES_TO_BE_SHIFTED_END_IDX),
                       unshifted_challenges.subspan(WIRES_TO_BE_SHIFTED_END_IDX),
                       max_idx_unshifted >= WIRES_TO_BE_SHIFTED_END_IDX
                           ? max_idx_unshifted - WIRES_TO_BE_SHIFTED_END_IDX
                           : unshifted_polys.size());

    const size_t circuit_dyadic_size = numeric::round_up_power_2(batched_unshifted.end_index());

    PolynomialBatcher polynomial_batcher(circuit_dyadic_size);
    polynomial_batcher.set_unshifted(RefVector{ batched_unshifted });
    polynomial_batcher.set_to_be_shifted_by_one(RefVector{ batched_shifted });

    const OpeningClaim prover_opening_claim = ShpleminiProver_<Curve>::prove(
        circuit_dyadic_size, polynomial_batcher, sumcheck_output.challenge, commitment_key, transcript);

    PCS::compute_opening_proof(commitment_key, prover_opening_claim, transcript);
}

HonkProof AvmProver::export_proof()
{
    return transcript->export_proof();
}

HonkProof AvmProver::construct_proof()
{
    // Add vk hash to transcript.
    execute_preamble_round();

    // Add public inputs to transcript.
    AVM_TRACK_TIME("prove/public_inputs_round", execute_public_inputs_round());

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

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
#include "barretenberg/commitment_schemes/interleaving_utils.hpp"
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
 * @brief Commit to groups of BS consecutive wire polynomials using interleaved commitments.
 * @details For BS=1, this degenerates to individual commits (identical to non-interleaved behavior).
 */
void AvmProver::execute_wire_commitments_round()
{
    BB_BENCH_NAME("AvmProver::execute_wire_commitments_round");
    constexpr size_t BS = Flavor::INTERLEAVING_BATCH_SIZE;
    auto wires = prover_polynomials.get_wires();

    for (size_t g = 0; g < Flavor::NUM_WIRE_GROUPS; g++) {
        size_t start = g * BS;
        size_t count = std::min(BS, wires.size() - start);
        std::vector<PolynomialSpan<const FF>> chunks;
        chunks.reserve(count);
        for (size_t j = 0; j < count; j++) {
            chunks.push_back(wires[start + j]);
        }
        auto comm = commitment_key.commit_interleaved<BS>(chunks);
        transcript->send_to_verifier("WIRE_GROUP_" + std::to_string(g), comm);
    }
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
                               prover_polynomials, relation_parameters, ProvingKey::circuit_size)));
        });
    });

    // Execute all the tasks in parallel
    bb::parallel_for(tasks.size(), [&](size_t i) { tasks[i](); });
}

void AvmProver::execute_log_derivative_inverse_commitments_round()
{
    BB_BENCH_NAME("AvmProver::execute_log_derivative_inverse_commitments_round");
    constexpr size_t BS = Flavor::INTERLEAVING_BATCH_SIZE;
    auto derived = prover_polynomials.get_derived();

    for (size_t g = 0; g < Flavor::NUM_DERIVED_GROUPS; g++) {
        size_t start = g * BS;
        size_t count = std::min(BS, derived.size() - start);
        std::vector<PolynomialSpan<const FF>> chunks;
        chunks.reserve(count);
        for (size_t j = 0; j < count; j++) {
            chunks.push_back(derived[start + j]);
        }
        auto comm = commitment_key.commit_interleaved<BS>(chunks);
        transcript->send_to_verifier("DERIVED_GROUP_" + std::to_string(g), comm);
    }
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
 * @brief Materialize interleaved group polynomials from individual entity polynomials.
 * @details F_g(X) = sum_{j=0}^{BS-1} f_{g*BS+j}(X^BS) * X^j
 *
 * If shiftable=true, constituent polys have start_index>=1, so interleaved positions 0..BS-1
 * are zero. The group poly is created with start_index=BS so it can be used as a to_be_shifted
 * polynomial in PolynomialBatcher.
 */
template <size_t BS>
static std::vector<Flavor::Polynomial> build_interleaved_groups(std::span<Flavor::Polynomial> polys,
                                                                size_t num_groups,
                                                                bool shiftable = false)
{
    using Polynomial = Flavor::Polynomial;
    std::vector<Polynomial> result;
    result.reserve(num_groups);
    for (size_t g = 0; g < num_groups; g++) {
        size_t start = g * BS;
        size_t max_end = 0;
        for (size_t j = 0; j < BS && start + j < polys.size(); j++) {
            max_end = std::max(max_end, polys[start + j].end_index());
        }
        const size_t interleaved_size = max_end * BS;
        const size_t virtual_size = numeric::round_up_power_2(interleaved_size);
        Polynomial interleaved =
            shiftable ? Polynomial::shiftable(interleaved_size, virtual_size, BS) : Polynomial(interleaved_size);
        for (size_t j = 0; j < BS && start + j < polys.size(); j++) {
            auto& p = polys[start + j];
            for (size_t i = p.start_index(); i < p.end_index(); i++) {
                interleaved.at(i * BS + j) = p.at(i);
            }
        }
        result.push_back(std::move(interleaved));
    }
    return result;
}

/**
 * @brief Run the PCS to prove that the claimed evaluations are correct.
 *
 * @details For multipcs interleaving:
 *  1. Materialize interleaved group polynomials for precomputed, wires, and derived entities
 *  2. Batch groups with short scalars (one per group)
 *  3. Pass to Gemini/Shplemini with shift_exponent=BS
 *
 * For BS=1, materialization is identity and shift_exponent=1, so behavior is unchanged.
 */
void AvmProver::execute_pcs_rounds()
{
    BB_BENCH_NAME("AvmProver::execute_pcs_rounds");

    using OpeningClaim = ProverOpeningClaim<Curve>;
    using PolynomialBatcher = GeminiProver_<Curve>::PolynomialBatcher;
    using Challenges = Flavor::AllEntities<FF>;

    constexpr size_t BS = Flavor::INTERLEAVING_BATCH_SIZE;

    // Batch polynomials using short scalars to reduce ECCVM circuit size
    auto unshifted_polys = prover_polynomials.get_unshifted();
    auto shifted_polys = prover_polynomials.get_to_be_shifted();

    // Get short batching challenges from transcript
    Challenges challenges;
    auto unshifted_challenges_vec = transcript->template get_challenges<FF>(challenges.get_unshifted_labels());
    std::ranges::move(unshifted_challenges_vec, challenges.get_unshifted().begin());
    auto unshifted_challenges = challenges.get_unshifted();
    auto shifted_challenges = challenges.get_to_be_shifted();

    if constexpr (BS == 1) {
        // Non-interleaved path: original logic
        auto index_of_max_end_index = [](const auto& polys) {
            auto it = std::ranges::max_element(
                polys.begin(), polys.end(), [](const auto& a, const auto& b) { return a.end_index() < b.end_index(); });
            return static_cast<size_t>(std::distance(polys.begin(), it));
        };

        size_t max_idx = index_of_max_end_index(shifted_polys);
        Polynomial batched_shifted = std::move(shifted_polys[max_idx]);
        batched_shifted *= shifted_challenges[max_idx];
        for (size_t idx = 0; const auto [poly, challenge] : zip_view(shifted_polys, shifted_challenges)) {
            if (idx != max_idx) {
                batched_shifted.add_scaled(poly, challenge);
            }
            idx++;
        }

        max_idx = index_of_max_end_index(unshifted_polys);
        Polynomial batched_unshifted = std::move(unshifted_polys[max_idx]);
        batched_unshifted *= unshifted_challenges[max_idx];
        batched_unshifted += batched_shifted;
        for (size_t idx = 0; const auto [poly, challenge] : zip_view(unshifted_polys, unshifted_challenges)) {
            if (idx < WIRES_TO_BE_SHIFTED_START_IDX || idx >= WIRES_TO_BE_SHIFTED_END_IDX) {
                if (idx != max_idx) {
                    batched_unshifted.add_scaled(poly, challenge);
                }
            }
            idx++;
        }

        const size_t circuit_dyadic_size = numeric::round_up_power_2(batched_unshifted.end_index());

        PolynomialBatcher polynomial_batcher(circuit_dyadic_size);
        polynomial_batcher.set_unshifted(RefVector{ batched_unshifted });
        polynomial_batcher.set_to_be_shifted(RefVector{ batched_shifted });

        const OpeningClaim prover_opening_claim = ShpleminiProver_<Curve>::prove(
            circuit_dyadic_size, polynomial_batcher, sumcheck_output.challenge, commitment_key, transcript);

        PCS::compute_opening_proof(commitment_key, prover_opening_claim, transcript);
    } else {
        // Interleaved path: materialize group polynomials, batch, and use shift_exponent=BS
        auto precomputed_polys = prover_polynomials.get_precomputed();
        auto wire_polys = prover_polynomials.get_wires();
        auto derived_polys = prover_polynomials.get_derived();

        // Materialize interleaved group polynomials
        auto precomputed_groups = build_interleaved_groups<BS>(precomputed_polys, Flavor::NUM_PRECOMPUTED_GROUPS);
        auto wire_groups = build_interleaved_groups<BS>(wire_polys, Flavor::NUM_WIRE_GROUPS);
        auto derived_groups = build_interleaved_groups<BS>(derived_polys, Flavor::NUM_DERIVED_GROUPS);

        // Build shifted wire groups separately as shiftable (start_index=BS) for PCS
        auto shifted_polys = prover_polynomials.get_to_be_shifted();
        auto shifted_wire_groups =
            build_interleaved_groups<BS>(shifted_polys, Flavor::NUM_SHIFTED_GROUPS, /*shiftable=*/true);

        // Collect all unshifted groups: precomputed + wire + derived
        std::vector<Polynomial*> all_unshifted_groups;
        all_unshifted_groups.reserve(Flavor::NUM_UNSHIFTED_GROUPS);
        for (auto& g : precomputed_groups) {
            all_unshifted_groups.push_back(&g);
        }
        for (auto& g : wire_groups) {
            all_unshifted_groups.push_back(&g);
        }
        for (auto& g : derived_groups) {
            all_unshifted_groups.push_back(&g);
        }

        // Shifted groups are a contiguous subset of wire groups (thanks to BS-alignment)
        // The shifted wire range in individual entities: [WIRES_TO_BE_SHIFTED_START_IDX, WIRES_TO_BE_SHIFTED_END_IDX)
        // In group space: [WIRES_TO_BE_SHIFTED_START_IDX/BS, (WIRES_TO_BE_SHIFTED_END_IDX+BS-1)/BS)
        constexpr size_t SHIFTED_WIRE_GROUP_START = WIRES_TO_BE_SHIFTED_START_IDX / BS;
        constexpr size_t SHIFTED_WIRE_GROUP_END = (WIRES_TO_BE_SHIFTED_END_IDX + BS - 1) / BS;
        static_assert(SHIFTED_WIRE_GROUP_START * BS == WIRES_TO_BE_SHIFTED_START_IDX,
                      "WIRES_TO_BE_SHIFTED_START_IDX must be BS-aligned");

        // Batch unshifted groups with short scalars (one challenge per individual entity, combine BS per group)
        // Unshifted challenges are indexed per individual entity, not per group.
        // For group g, combine challenges[g*BS..g*BS+BS-1] using Lagrange basis at interleaving challenges.
        // But for PCS, we need a single challenge per group. We use the challenge of the first entity in the group.
        // Actually, the short-scalar batching is per-group for the interleaved path.
        // The simplest approach: batch the group polynomials directly, one challenge per group.

        // Get interleaving challenges (Fiat-Shamir)
        std::vector<FF> interleaving_challenges;
        for (size_t i = 0; i < Flavor::INTERLEAVING_LOG_K; i++) {
            interleaving_challenges.push_back(
                transcript->template get_challenge<FF>("interleaving_challenge_" + std::to_string(i)));
        }

        // Compute group-level challenges by combining per-entity challenges with Lagrange basis
        auto lagrange = compute_interleaving_lagrange_basis<BS>(
            std::span<const FF>(interleaving_challenges.data(), interleaving_challenges.size()));

        // For unshifted entities: combine per-entity challenges into per-group challenges
        std::vector<FF> group_unshifted_challenges(Flavor::NUM_UNSHIFTED_GROUPS, FF(0));
        for (size_t g = 0; g < Flavor::NUM_UNSHIFTED_GROUPS; g++) {
            for (size_t j = 0; j < BS && g * BS + j < unshifted_challenges.size(); j++) {
                group_unshifted_challenges[g] += unshifted_challenges[g * BS + j] * lagrange[j];
            }
        }

        // For shifted entities: combine per-entity challenges into per-group challenges
        std::vector<FF> group_shifted_challenges(Flavor::NUM_SHIFTED_GROUPS, FF(0));
        for (size_t g = 0; g < Flavor::NUM_SHIFTED_GROUPS; g++) {
            for (size_t j = 0; j < BS && g * BS + j < shifted_challenges.size(); j++) {
                group_shifted_challenges[g] += shifted_challenges[g * BS + j] * lagrange[j];
            }
        }

        // Batch shifted groups into a shiftable polynomial (first BS coefficients are zero)
        // We need the shifted batch to be shiftable by BS for Gemini.
        // Shifted wire groups have start_index=BS because individual polys have start_index=1.
        size_t shifted_max_end = 0;
        for (size_t g = 0; g < Flavor::NUM_SHIFTED_GROUPS; g++) {
            shifted_max_end = std::max(shifted_max_end, shifted_wire_groups[g].end_index());
        }
        const size_t group_virtual_size = numeric::round_up_power_2(shifted_max_end);
        Polynomial batched_shifted_group = Polynomial::shiftable(shifted_max_end, group_virtual_size, BS);
        for (size_t g = 0; g < Flavor::NUM_SHIFTED_GROUPS; g++) {
            batched_shifted_group.add_scaled(shifted_wire_groups[g], group_shifted_challenges[g]);
        }

        // Batch unshifted groups
        size_t unshifted_max_end = 0;
        for (size_t g = 0; g < Flavor::NUM_UNSHIFTED_GROUPS; g++) {
            unshifted_max_end = std::max(unshifted_max_end, all_unshifted_groups[g]->end_index());
        }
        const size_t unshifted_virtual_size = numeric::round_up_power_2(unshifted_max_end);
        Polynomial batched_unshifted_group(unshifted_max_end, unshifted_virtual_size);
        for (size_t g = 0; g < Flavor::NUM_UNSHIFTED_GROUPS; g++) {
            // Skip shifted wire groups since they'll be added via batched_shifted_group
            size_t wire_group_idx = g - Flavor::NUM_PRECOMPUTED_GROUPS;
            bool is_shifted_group = (g >= Flavor::NUM_PRECOMPUTED_GROUPS) &&
                                    (wire_group_idx >= SHIFTED_WIRE_GROUP_START) &&
                                    (wire_group_idx < SHIFTED_WIRE_GROUP_END);
            if (!is_shifted_group) {
                batched_unshifted_group.add_scaled(*all_unshifted_groups[g], group_unshifted_challenges[g]);
            }
        }
        // Add shifted contribution to unshifted batch (these wire groups overlap)
        batched_unshifted_group += batched_shifted_group;

        // The circuit size for interleaved groups.
        // Group polynomials have degree N*BS, so use the actual max end rounded up.
        const size_t group_circuit_size = std::max(unshifted_virtual_size, group_virtual_size);

        PolynomialBatcher polynomial_batcher(group_circuit_size, /*actual_data_size=*/0, /*shift_exponent=*/BS);
        polynomial_batcher.set_unshifted(RefVector{ batched_unshifted_group });
        polynomial_batcher.set_to_be_shifted(RefVector{ batched_shifted_group });

        // Extend the multilinear challenge with interleaving challenges.
        // Gemini needs log2(N*BS) = log2(N) + LOG_K rounds. The sumcheck challenge provides
        // log2(N) variables (for the original poly index). The interleaving challenges provide
        // LOG_K additional variables (for the position within each group).
        // Interleaving variables correspond to the LOWEST bits of the group poly index,
        // so they are APPENDED (processed last by Gemini).
        std::vector<FF> extended_challenge(sumcheck_output.challenge.begin(), sumcheck_output.challenge.end());
        for (const auto& ic : interleaving_challenges) {
            extended_challenge.push_back(ic);
        }

        const OpeningClaim prover_opening_claim = ShpleminiProver_<Curve>::prove(
            group_circuit_size, polynomial_batcher, extended_challenge, commitment_key, transcript);

        PCS::compute_opening_proof(commitment_key, prover_opening_claim, transcript);
    }
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

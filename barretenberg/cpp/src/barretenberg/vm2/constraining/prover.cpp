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
 * @brief Build a wire polynomial vector with zero-padding inserted before shifted wires.
 * @details When the shifted wire start isn't BS-aligned, we insert zero polynomials so that
 *          shifted wire groups align exactly with wire groups. The padding count is
 *          NUM_SHIFT_ALIGNMENT_PADDING (derived from entity counts and BS).
 */
template <size_t BS>
static std::vector<PolynomialSpan<const FF>> build_padded_wire_spans(std::span<Flavor::Polynomial> wires)
{
    constexpr size_t PAD = Flavor::NUM_SHIFT_ALIGNMENT_PADDING;
    constexpr size_t NON_SHIFTED = bb::avm2::NUM_NON_SHIFTED_WIRES;
    static Flavor::Polynomial zero_poly; // static zero poly for padding spans

    std::vector<PolynomialSpan<const FF>> result;
    result.reserve(wires.size() + PAD);
    for (size_t i = 0; i < NON_SHIFTED && i < wires.size(); i++) {
        result.push_back(wires[i]);
    }
    for (size_t i = 0; i < PAD; i++) {
        result.push_back(zero_poly);
    }
    for (size_t i = NON_SHIFTED; i < wires.size(); i++) {
        result.push_back(wires[i]);
    }
    return result;
}

/**
 * @brief Commit to groups of BS consecutive wire polynomials using interleaved commitments.
 * @details For BS=1, this degenerates to individual commits (identical to non-interleaved behavior).
 *          Inserts zero-padding before shifted wires so shifted groups align with wire groups.
 */
void AvmProver::execute_wire_commitments_round()
{
    BB_BENCH_NAME("AvmProver::execute_wire_commitments_round");
    constexpr size_t BS = Flavor::INTERLEAVING_BATCH_SIZE;
    auto wires = prover_polynomials.get_wires();
    auto padded = build_padded_wire_spans<BS>(wires);

    for (size_t g = 0; g < Flavor::NUM_WIRE_GROUPS; g++) {
        size_t start = g * BS;
        size_t count = std::min(BS, padded.size() - start);
        std::vector<PolynomialSpan<const FF>> chunks;
        chunks.reserve(count);
        for (size_t j = 0; j < count; j++) {
            chunks.push_back(padded[start + j]);
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
    // The group polynomial virtual_size must be circuit_size * BS so that Gemini
    // can fold over log2(circuit_size) + LOG_K rounds.
    // Virtual size is metadata-only (no memory impact). Use round_up_power_2 of actual data.
    // Gemini's circuit_size is determined later from the extended challenge.
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
        Polynomial interleaved = shiftable ? Polynomial::shiftable(interleaved_size, virtual_size, BS)
                                           : Polynomial(interleaved_size, virtual_size);
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

    auto shifted_polys = prover_polynomials.get_to_be_shifted();

    // Get short batching challenges from transcript
    Challenges challenges;
    auto unshifted_challenges_vec = transcript->template get_challenges<FF>(challenges.get_unshifted_labels());
    std::ranges::move(unshifted_challenges_vec, challenges.get_unshifted().begin());
    auto unshifted_challenges = challenges.get_unshifted();
    auto shifted_challenges = challenges.get_to_be_shifted();

    // ---- Materialize interleaved group polynomials ----
    // For BS=1 this is an identity (each group = 1 entity, no interleaving).
    // For BS>1, groups of BS consecutive polys are interleaved into one polynomial.

    auto precomputed_polys = prover_polynomials.get_precomputed();
    auto wire_polys = prover_polynomials.get_wires();
    auto derived_polys = prover_polynomials.get_derived();

    // Wire groups need zero-padding before shifted wires for BS-alignment (PAD=0 for BS=1).
    constexpr size_t PAD = Flavor::NUM_SHIFT_ALIGNMENT_PADDING;
    constexpr size_t NON_SHIFTED_WIRES = bb::avm2::NUM_NON_SHIFTED_WIRES;
    constexpr size_t PADDED_WIRE_COUNT = Flavor::NUM_WIRES + PAD;

    Polynomial zero_poly;
    auto get_padded_wire = [&](size_t padded_idx) -> Polynomial& {
        if (padded_idx < NON_SHIFTED_WIRES) {
            return wire_polys[padded_idx];
        } else if (padded_idx < NON_SHIFTED_WIRES + PAD) {
            return zero_poly;
        } else {
            return wire_polys[padded_idx - PAD];
        }
    };

    auto precomputed_groups = build_interleaved_groups<BS>(precomputed_polys, Flavor::NUM_PRECOMPUTED_GROUPS);

    std::vector<Polynomial> wire_groups;
    wire_groups.reserve(Flavor::NUM_WIRE_GROUPS);
    for (size_t g = 0; g < Flavor::NUM_WIRE_GROUPS; g++) {
        size_t start = g * BS;
        size_t max_end = 0;
        for (size_t j = 0; j < BS && start + j < PADDED_WIRE_COUNT; j++) {
            max_end = std::max(max_end, get_padded_wire(start + j).end_index());
        }
        const size_t interleaved_size = max_end * BS;
        const size_t virtual_size = numeric::round_up_power_2(std::max(interleaved_size, size_t(1)));
        Polynomial interleaved(interleaved_size, virtual_size);
        for (size_t j = 0; j < BS && start + j < PADDED_WIRE_COUNT; j++) {
            auto& p = get_padded_wire(start + j);
            for (size_t i = p.start_index(); i < p.end_index(); i++) {
                interleaved.at(i * BS + j) = p.at(i);
            }
        }
        wire_groups.push_back(std::move(interleaved));
    }

    auto derived_groups = build_interleaved_groups<BS>(derived_polys, Flavor::NUM_DERIVED_GROUPS);
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

    // ---- Combine per-entity challenges into per-group challenges ----

    constexpr size_t SHIFTED_WIRE_OFFSET = (WIRES_TO_BE_SHIFTED_START_IDX - WIRE_START_IDX) + PAD;
    constexpr size_t SHIFTED_WIRE_END_OFFSET = (WIRES_TO_BE_SHIFTED_END_IDX - WIRE_START_IDX) + PAD;
    constexpr size_t SHIFTED_WIRE_GROUP_START = SHIFTED_WIRE_OFFSET / BS;
    constexpr size_t SHIFTED_WIRE_GROUP_END = (SHIFTED_WIRE_END_OFFSET + BS - 1) / BS;
    static_assert(SHIFTED_WIRE_GROUP_START * BS == SHIFTED_WIRE_OFFSET, "Padded shifted start must be BS-aligned");

    // Get interleaving challenges (0 for BS=1)
    std::vector<FF> interleaving_challenges;
    for (size_t i = 0; i < Flavor::INTERLEAVING_LOG_K; i++) {
        interleaving_challenges.push_back(
            transcript->template get_challenge<FF>("interleaving_challenge_" + std::to_string(i)));
    }

    auto lagrange = compute_interleaving_lagrange_basis<BS>(
        std::span<const FF>(interleaving_challenges.data(), interleaving_challenges.size()));

    auto combine_section = [&](std::span<const FF> entity_challenges, size_t num_groups) {
        std::vector<FF> group_challenges(num_groups, FF(0));
        for (size_t g = 0; g < num_groups; g++) {
            for (size_t j = 0; j < BS && g * BS + j < entity_challenges.size(); j++) {
                group_challenges[g] += entity_challenges[g * BS + j] * lagrange[j];
            }
        }
        return group_challenges;
    };

    // Pad wire challenges and combine per section
    auto wire_challenges_raw = unshifted_challenges.subspan(Flavor::NUM_PRECOMPUTED_ENTITIES, Flavor::NUM_WIRES);
    std::vector<FF> padded_wire_challenges;
    padded_wire_challenges.reserve(Flavor::NUM_WIRES + PAD);
    padded_wire_challenges.insert(
        padded_wire_challenges.end(), wire_challenges_raw.begin(), wire_challenges_raw.begin() + NON_SHIFTED_WIRES);
    padded_wire_challenges.resize(padded_wire_challenges.size() + PAD, FF(0));
    padded_wire_challenges.insert(
        padded_wire_challenges.end(), wire_challenges_raw.begin() + NON_SHIFTED_WIRES, wire_challenges_raw.end());

    auto precomputed_group_challenges = combine_section(
        unshifted_challenges.subspan(0, Flavor::NUM_PRECOMPUTED_ENTITIES), Flavor::NUM_PRECOMPUTED_GROUPS);
    auto wire_group_challenges = combine_section(std::span<const FF>(padded_wire_challenges), Flavor::NUM_WIRE_GROUPS);
    auto derived_group_challenges =
        combine_section(unshifted_challenges.subspan(Flavor::NUM_PRECOMPUTED_ENTITIES + Flavor::NUM_WIRES,
                                                     Flavor::NUM_WITNESS_ENTITIES - Flavor::NUM_WIRES),
                        Flavor::NUM_DERIVED_GROUPS);

    std::vector<FF> group_unshifted_challenges;
    group_unshifted_challenges.reserve(Flavor::NUM_UNSHIFTED_GROUPS);
    group_unshifted_challenges.insert(
        group_unshifted_challenges.end(), precomputed_group_challenges.begin(), precomputed_group_challenges.end());
    group_unshifted_challenges.insert(
        group_unshifted_challenges.end(), wire_group_challenges.begin(), wire_group_challenges.end());
    group_unshifted_challenges.insert(
        group_unshifted_challenges.end(), derived_group_challenges.begin(), derived_group_challenges.end());

    auto group_shifted_challenges = combine_section(shifted_challenges, Flavor::NUM_SHIFTED_GROUPS);

    // ---- Batch group polynomials ----

    size_t shifted_max_end = 0;
    for (size_t g = 0; g < Flavor::NUM_SHIFTED_GROUPS; g++) {
        shifted_max_end = std::max(shifted_max_end, shifted_wire_groups[g].end_index());
    }
    Polynomial batched_shifted = Polynomial::shiftable(shifted_max_end, shifted_max_end, BS);
    for (size_t g = 0; g < Flavor::NUM_SHIFTED_GROUPS; g++) {
        batched_shifted.add_scaled(shifted_wire_groups[g], group_shifted_challenges[g]);
    }

    size_t unshifted_max_end = 0;
    for (size_t g = 0; g < Flavor::NUM_UNSHIFTED_GROUPS; g++) {
        unshifted_max_end = std::max(unshifted_max_end, all_unshifted_groups[g]->end_index());
    }
    Polynomial batched_unshifted(unshifted_max_end, unshifted_max_end);
    for (size_t g = 0; g < Flavor::NUM_UNSHIFTED_GROUPS; g++) {
        size_t wire_group_idx = g - Flavor::NUM_PRECOMPUTED_GROUPS;
        bool is_shifted_group = (g >= Flavor::NUM_PRECOMPUTED_GROUPS) && (wire_group_idx >= SHIFTED_WIRE_GROUP_START) &&
                                (wire_group_idx < SHIFTED_WIRE_GROUP_END);
        if (!is_shifted_group) {
            batched_unshifted.add_scaled(*all_unshifted_groups[g], group_unshifted_challenges[g]);
        }
    }
    batched_unshifted += batched_shifted;

    // ---- PCS opening ----

    const size_t group_circuit_size = numeric::round_up_power_2(batched_unshifted.end_index());

    PolynomialBatcher polynomial_batcher(group_circuit_size, /*actual_data_size=*/0, /*shift_exponent=*/BS);
    polynomial_batcher.set_unshifted(RefVector{ batched_unshifted });
    polynomial_batcher.set_to_be_shifted(RefVector{ batched_shifted });

    // Extended challenge: [interleaving_challenges || sumcheck_challenges]
    std::vector<FF> extended_challenge;
    extended_challenge.reserve(Flavor::INTERLEAVING_LOG_K + sumcheck_output.challenge.size());
    for (const auto& ic : interleaving_challenges) {
        extended_challenge.push_back(ic);
    }
    extended_challenge.insert(
        extended_challenge.end(), sumcheck_output.challenge.begin(), sumcheck_output.challenge.end());

    const OpeningClaim prover_opening_claim = ShpleminiProver_<Curve>::prove(
        group_circuit_size, polynomial_batcher, extended_challenge, commitment_key, transcript);

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

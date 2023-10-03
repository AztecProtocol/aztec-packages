#include "goblin_translator_prover.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/ecc/curves/bn254/g1.hpp"
#include "barretenberg/honk/pcs/claim.hpp"
#include "barretenberg/honk/pcs/commitment_key.hpp"
#include "barretenberg/honk/proof_system/grand_product_library.hpp"
#include "barretenberg/honk/proof_system/prover_library.hpp"
#include "barretenberg/honk/sumcheck/polynomials/univariate.hpp" // will go away
#include "barretenberg/honk/sumcheck/relations/lookup_relation.hpp"
#include "barretenberg/honk/sumcheck/relations/permutation_relation.hpp"
#include "barretenberg/honk/sumcheck/sumcheck.hpp"
#include "barretenberg/honk/utils/power_polynomial.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/transcript/transcript_wrappers.hpp"
#include <algorithm>
#include <array>
#include <cstddef>
#include <memory>
#include <span>
#include <string>
#include <utility>
#include <vector>

namespace proof_system::honk {

/**
 * Create GoblinTranslatorProver_ from proving key, witness and manifest.
 *
 * @param input_key Proving key.
 * @param input_manifest Input manifest
 *
 * @tparam settings Settings class.
 * */
template <typename Flavor>
GoblinTranslatorProver_<Flavor>::GoblinTranslatorProver_(std::shared_ptr<typename Flavor::ProvingKey> input_key,
                                                         std::shared_ptr<PCSCommitmentKey> commitment_key)
    : key(input_key)
    , queue(commitment_key, transcript)
    , pcs_commitment_key(commitment_key)
{
    // Copy all polynomials from the proving key
    prover_polynomials.op = key->op;
    prover_polynomials.x_lo_y_hi = key->x_lo_y_hi;
    prover_polynomials.x_hi_z_1 = key->x_hi_z_1;
    prover_polynomials.y_lo_z_2 = key->y_lo_z_2;
    prover_polynomials.p_x_low_limbs = key->p_x_low_limbs;
    prover_polynomials.p_x_low_limbs_range_constraint_0 = key->p_x_low_limbs_range_constraint_0;
    prover_polynomials.p_x_low_limbs_range_constraint_1 = key->p_x_low_limbs_range_constraint_1;
    prover_polynomials.p_x_low_limbs_range_constraint_2 = key->p_x_low_limbs_range_constraint_2;
    prover_polynomials.p_x_low_limbs_range_constraint_3 = key->p_x_low_limbs_range_constraint_3;
    prover_polynomials.p_x_low_limbs_range_constraint_4 = key->p_x_low_limbs_range_constraint_4;
    prover_polynomials.p_x_low_limbs_range_constraint_tail = key->p_x_low_limbs_range_constraint_tail;
    prover_polynomials.p_x_high_limbs = key->p_x_high_limbs;
    prover_polynomials.p_x_high_limbs_range_constraint_0 = key->p_x_high_limbs_range_constraint_0;
    prover_polynomials.p_x_high_limbs_range_constraint_1 = key->p_x_high_limbs_range_constraint_1;
    prover_polynomials.p_x_high_limbs_range_constraint_2 = key->p_x_high_limbs_range_constraint_2;
    prover_polynomials.p_x_high_limbs_range_constraint_3 = key->p_x_high_limbs_range_constraint_3;
    prover_polynomials.p_x_high_limbs_range_constraint_4 = key->p_x_high_limbs_range_constraint_4;
    prover_polynomials.p_x_high_limbs_range_constraint_tail = key->p_x_high_limbs_range_constraint_tail;
    prover_polynomials.p_y_low_limbs = key->p_y_low_limbs;
    prover_polynomials.p_y_low_limbs_range_constraint_0 = key->p_y_low_limbs_range_constraint_0;
    prover_polynomials.p_y_low_limbs_range_constraint_1 = key->p_y_low_limbs_range_constraint_1;
    prover_polynomials.p_y_low_limbs_range_constraint_2 = key->p_y_low_limbs_range_constraint_2;
    prover_polynomials.p_y_low_limbs_range_constraint_3 = key->p_y_low_limbs_range_constraint_3;
    prover_polynomials.p_y_low_limbs_range_constraint_4 = key->p_y_low_limbs_range_constraint_4;
    prover_polynomials.p_y_low_limbs_range_constraint_tail = key->p_y_low_limbs_range_constraint_tail;
    prover_polynomials.p_y_high_limbs = key->p_y_high_limbs;
    prover_polynomials.p_y_high_limbs_range_constraint_0 = key->p_y_high_limbs_range_constraint_0;
    prover_polynomials.p_y_high_limbs_range_constraint_1 = key->p_y_high_limbs_range_constraint_1;
    prover_polynomials.p_y_high_limbs_range_constraint_2 = key->p_y_high_limbs_range_constraint_2;
    prover_polynomials.p_y_high_limbs_range_constraint_3 = key->p_y_high_limbs_range_constraint_3;
    prover_polynomials.p_y_high_limbs_range_constraint_4 = key->p_y_high_limbs_range_constraint_4;
    prover_polynomials.p_y_high_limbs_range_constraint_tail = key->p_y_high_limbs_range_constraint_tail;
    prover_polynomials.z_lo_limbs = key->z_lo_limbs;
    prover_polynomials.z_lo_limbs_range_constraint_0 = key->z_lo_limbs_range_constraint_0;
    prover_polynomials.z_lo_limbs_range_constraint_1 = key->z_lo_limbs_range_constraint_1;
    prover_polynomials.z_lo_limbs_range_constraint_2 = key->z_lo_limbs_range_constraint_2;
    prover_polynomials.z_lo_limbs_range_constraint_3 = key->z_lo_limbs_range_constraint_3;
    prover_polynomials.z_lo_limbs_range_constraint_4 = key->z_lo_limbs_range_constraint_4;
    prover_polynomials.z_lo_limbs_range_constraint_tail = key->z_lo_limbs_range_constraint_tail;
    prover_polynomials.z_hi_limbs = key->z_hi_limbs;
    prover_polynomials.z_hi_limbs_range_constraint_0 = key->z_hi_limbs_range_constraint_0;
    prover_polynomials.z_hi_limbs_range_constraint_1 = key->z_hi_limbs_range_constraint_1;
    prover_polynomials.z_hi_limbs_range_constraint_2 = key->z_hi_limbs_range_constraint_2;
    prover_polynomials.z_hi_limbs_range_constraint_3 = key->z_hi_limbs_range_constraint_3;
    prover_polynomials.z_hi_limbs_range_constraint_4 = key->z_hi_limbs_range_constraint_4;
    prover_polynomials.z_hi_limbs_range_constraint_tail = key->z_hi_limbs_range_constraint_tail;
    prover_polynomials.accumulators_binary_limbs_0 = key->accumulators_binary_limbs_0;
    prover_polynomials.accumulators_binary_limbs_1 = key->accumulators_binary_limbs_1;
    prover_polynomials.accumulators_binary_limbs_2 = key->accumulators_binary_limbs_2;
    prover_polynomials.accumulators_binary_limbs_3 = key->accumulators_binary_limbs_3;
    prover_polynomials.accumulator_lo_limbs_range_constraint_0 = key->accumulator_lo_limbs_range_constraint_0;
    prover_polynomials.accumulator_lo_limbs_range_constraint_1 = key->accumulator_lo_limbs_range_constraint_1;
    prover_polynomials.accumulator_lo_limbs_range_constraint_2 = key->accumulator_lo_limbs_range_constraint_2;
    prover_polynomials.accumulator_lo_limbs_range_constraint_3 = key->accumulator_lo_limbs_range_constraint_3;
    prover_polynomials.accumulator_lo_limbs_range_constraint_4 = key->accumulator_lo_limbs_range_constraint_4;
    prover_polynomials.accumulator_lo_limbs_range_constraint_tail = key->accumulator_lo_limbs_range_constraint_tail;
    prover_polynomials.accumulator_hi_limbs_range_constraint_0 = key->accumulator_hi_limbs_range_constraint_0;
    prover_polynomials.accumulator_hi_limbs_range_constraint_1 = key->accumulator_hi_limbs_range_constraint_1;
    prover_polynomials.accumulator_hi_limbs_range_constraint_2 = key->accumulator_hi_limbs_range_constraint_2;
    prover_polynomials.accumulator_hi_limbs_range_constraint_3 = key->accumulator_hi_limbs_range_constraint_3;
    prover_polynomials.accumulator_hi_limbs_range_constraint_4 = key->accumulator_hi_limbs_range_constraint_4;
    prover_polynomials.accumulator_hi_limbs_range_constraint_tail = key->accumulator_hi_limbs_range_constraint_tail;
    prover_polynomials.quotient_lo_binary_limbs = key->quotient_lo_binary_limbs;
    prover_polynomials.quotient_hi_binary_limbs = key->quotient_hi_binary_limbs;
    prover_polynomials.quotient_lo_limbs_range_constraint_0 = key->quotient_lo_limbs_range_constraint_0;
    prover_polynomials.quotient_lo_limbs_range_constraint_1 = key->quotient_lo_limbs_range_constraint_1;
    prover_polynomials.quotient_lo_limbs_range_constraint_2 = key->quotient_lo_limbs_range_constraint_2;
    prover_polynomials.quotient_lo_limbs_range_constraint_3 = key->quotient_lo_limbs_range_constraint_3;
    prover_polynomials.quotient_lo_limbs_range_constraint_4 = key->quotient_lo_limbs_range_constraint_4;
    prover_polynomials.quotient_lo_limbs_range_constraint_tail = key->quotient_lo_limbs_range_constraint_tail;
    prover_polynomials.quotient_hi_limbs_range_constraint_0 = key->quotient_hi_limbs_range_constraint_0;
    prover_polynomials.quotient_hi_limbs_range_constraint_1 = key->quotient_hi_limbs_range_constraint_1;
    prover_polynomials.quotient_hi_limbs_range_constraint_2 = key->quotient_hi_limbs_range_constraint_2;
    prover_polynomials.quotient_hi_limbs_range_constraint_3 = key->quotient_hi_limbs_range_constraint_3;
    prover_polynomials.quotient_hi_limbs_range_constraint_4 = key->quotient_hi_limbs_range_constraint_4;
    prover_polynomials.quotient_hi_limbs_range_constraint_tail = key->quotient_hi_limbs_range_constraint_tail;
    prover_polynomials.relation_wide_limbs = key->relation_wide_limbs;
    prover_polynomials.relation_wide_limbs_range_constraint_0 = key->relation_wide_limbs_range_constraint_0;
    prover_polynomials.relation_wide_limbs_range_constraint_1 = key->relation_wide_limbs_range_constraint_1;
    prover_polynomials.relation_wide_limbs_range_constraint_2 = key->relation_wide_limbs_range_constraint_2;
    prover_polynomials.relation_wide_limbs_range_constraint_3 = key->relation_wide_limbs_range_constraint_3;
    prover_polynomials.concatenated_range_constraints_0 = key->concatenated_range_constraints_0;
    prover_polynomials.concatenated_range_constraints_1 = key->concatenated_range_constraints_1;
    prover_polynomials.concatenated_range_constraints_2 = key->concatenated_range_constraints_2;
    prover_polynomials.concatenated_range_constraints_3 = key->concatenated_range_constraints_3;
    prover_polynomials.ordered_range_constraints_0 = key->ordered_range_constraints_0;
    prover_polynomials.ordered_range_constraints_1 = key->ordered_range_constraints_1;
    prover_polynomials.ordered_range_constraints_2 = key->ordered_range_constraints_2;
    prover_polynomials.ordered_range_constraints_3 = key->ordered_range_constraints_3;
    prover_polynomials.ordered_range_constraints_4 = key->ordered_range_constraints_4;
    prover_polynomials.x_lo_y_hi_shift = key->x_lo_y_hi.shifted();
    prover_polynomials.x_hi_z_1_shift = key->x_hi_z_1.shifted();
    prover_polynomials.y_lo_z_2_shift = key->y_lo_z_2.shifted();
    prover_polynomials.p_x_low_limbs_shift = key->p_x_low_limbs.shifted();
    prover_polynomials.p_x_low_limbs_range_constraint_0_shift = key->p_x_low_limbs_range_constraint_0.shifted();
    prover_polynomials.p_x_low_limbs_range_constraint_1_shift = key->p_x_low_limbs_range_constraint_1.shifted();
    prover_polynomials.p_x_low_limbs_range_constraint_2_shift = key->p_x_low_limbs_range_constraint_2.shifted();
    prover_polynomials.p_x_low_limbs_range_constraint_3_shift = key->p_x_low_limbs_range_constraint_3.shifted();
    prover_polynomials.p_x_low_limbs_range_constraint_4_shift = key->p_x_low_limbs_range_constraint_4.shifted();
    prover_polynomials.p_x_low_limbs_range_constraint_tail_shift = key->p_x_low_limbs_range_constraint_tail.shifted();
    prover_polynomials.p_x_high_limbs_shift = key->p_x_high_limbs.shifted();
    prover_polynomials.p_x_high_limbs_range_constraint_0_shift = key->p_x_high_limbs_range_constraint_0.shifted();
    prover_polynomials.p_x_high_limbs_range_constraint_1_shift = key->p_x_high_limbs_range_constraint_1.shifted();
    prover_polynomials.p_x_high_limbs_range_constraint_2_shift = key->p_x_high_limbs_range_constraint_2.shifted();
    prover_polynomials.p_x_high_limbs_range_constraint_3_shift = key->p_x_high_limbs_range_constraint_3.shifted();
    prover_polynomials.p_x_high_limbs_range_constraint_4_shift = key->p_x_high_limbs_range_constraint_4.shifted();
    prover_polynomials.p_x_high_limbs_range_constraint_tail_shift = key->p_x_high_limbs_range_constraint_tail.shifted();
    prover_polynomials.p_y_low_limbs_shift = key->p_y_low_limbs.shifted();
    prover_polynomials.p_y_low_limbs_range_constraint_0_shift = key->p_y_low_limbs_range_constraint_0.shifted();
    prover_polynomials.p_y_low_limbs_range_constraint_1_shift = key->p_y_low_limbs_range_constraint_1.shifted();
    prover_polynomials.p_y_low_limbs_range_constraint_2_shift = key->p_y_low_limbs_range_constraint_2.shifted();
    prover_polynomials.p_y_low_limbs_range_constraint_3_shift = key->p_y_low_limbs_range_constraint_3.shifted();
    prover_polynomials.p_y_low_limbs_range_constraint_4_shift = key->p_y_low_limbs_range_constraint_4.shifted();
    prover_polynomials.p_y_low_limbs_range_constraint_tail_shift = key->p_y_low_limbs_range_constraint_tail.shifted();
    prover_polynomials.p_y_high_limbs_shift = key->p_y_high_limbs.shifted();
    prover_polynomials.p_y_high_limbs_range_constraint_0_shift = key->p_y_high_limbs_range_constraint_0.shifted();
    prover_polynomials.p_y_high_limbs_range_constraint_1_shift = key->p_y_high_limbs_range_constraint_1.shifted();
    prover_polynomials.p_y_high_limbs_range_constraint_2_shift = key->p_y_high_limbs_range_constraint_2.shifted();
    prover_polynomials.p_y_high_limbs_range_constraint_3_shift = key->p_y_high_limbs_range_constraint_3.shifted();
    prover_polynomials.p_y_high_limbs_range_constraint_4_shift = key->p_y_high_limbs_range_constraint_4.shifted();
    prover_polynomials.p_y_high_limbs_range_constraint_tail_shift = key->p_y_high_limbs_range_constraint_tail.shifted();
    prover_polynomials.z_lo_limbs_shift = key->z_lo_limbs.shifted();
    prover_polynomials.z_lo_limbs_range_constraint_0_shift = key->z_lo_limbs_range_constraint_0.shifted();
    prover_polynomials.z_lo_limbs_range_constraint_1_shift = key->z_lo_limbs_range_constraint_1.shifted();
    prover_polynomials.z_lo_limbs_range_constraint_2_shift = key->z_lo_limbs_range_constraint_2.shifted();
    prover_polynomials.z_lo_limbs_range_constraint_3_shift = key->z_lo_limbs_range_constraint_3.shifted();
    prover_polynomials.z_lo_limbs_range_constraint_4_shift = key->z_lo_limbs_range_constraint_4.shifted();
    prover_polynomials.z_lo_limbs_range_constraint_tail_shift = key->z_lo_limbs_range_constraint_tail.shifted();
    prover_polynomials.z_hi_limbs_shift = key->z_hi_limbs.shifted();
    prover_polynomials.z_hi_limbs_range_constraint_0_shift = key->z_hi_limbs_range_constraint_0.shifted();
    prover_polynomials.z_hi_limbs_range_constraint_1_shift = key->z_hi_limbs_range_constraint_1.shifted();
    prover_polynomials.z_hi_limbs_range_constraint_2_shift = key->z_hi_limbs_range_constraint_2.shifted();
    prover_polynomials.z_hi_limbs_range_constraint_3_shift = key->z_hi_limbs_range_constraint_3.shifted();
    prover_polynomials.z_hi_limbs_range_constraint_4_shift = key->z_hi_limbs_range_constraint_4.shifted();
    prover_polynomials.z_hi_limbs_range_constraint_tail_shift = key->z_hi_limbs_range_constraint_tail.shifted();
    prover_polynomials.accumulators_binary_limbs_0_shift = key->accumulators_binary_limbs_0.shifted();
    prover_polynomials.accumulators_binary_limbs_1_shift = key->accumulators_binary_limbs_1.shifted();
    prover_polynomials.accumulators_binary_limbs_2_shift = key->accumulators_binary_limbs_2.shifted();
    prover_polynomials.accumulators_binary_limbs_3_shift = key->accumulators_binary_limbs_3.shifted();
    prover_polynomials.accumulator_lo_limbs_range_constraint_0_shift =
        key->accumulator_lo_limbs_range_constraint_0.shifted();
    prover_polynomials.accumulator_lo_limbs_range_constraint_1_shift =
        key->accumulator_lo_limbs_range_constraint_1.shifted();
    prover_polynomials.accumulator_lo_limbs_range_constraint_2_shift =
        key->accumulator_lo_limbs_range_constraint_2.shifted();
    prover_polynomials.accumulator_lo_limbs_range_constraint_3_shift =
        key->accumulator_lo_limbs_range_constraint_3.shifted();
    prover_polynomials.accumulator_lo_limbs_range_constraint_4_shift =
        key->accumulator_lo_limbs_range_constraint_4.shifted();
    prover_polynomials.accumulator_lo_limbs_range_constraint_tail_shift =
        key->accumulator_lo_limbs_range_constraint_tail.shifted();
    prover_polynomials.accumulator_hi_limbs_range_constraint_0_shift =
        key->accumulator_hi_limbs_range_constraint_0.shifted();
    prover_polynomials.accumulator_hi_limbs_range_constraint_1_shift =
        key->accumulator_hi_limbs_range_constraint_1.shifted();
    prover_polynomials.accumulator_hi_limbs_range_constraint_2_shift =
        key->accumulator_hi_limbs_range_constraint_2.shifted();
    prover_polynomials.accumulator_hi_limbs_range_constraint_3_shift =
        key->accumulator_hi_limbs_range_constraint_3.shifted();
    prover_polynomials.accumulator_hi_limbs_range_constraint_4_shift =
        key->accumulator_hi_limbs_range_constraint_4.shifted();
    prover_polynomials.accumulator_hi_limbs_range_constraint_tail_shift =
        key->accumulator_hi_limbs_range_constraint_tail.shifted();
    prover_polynomials.quotient_lo_binary_limbs_shift = key->quotient_lo_binary_limbs.shifted();
    prover_polynomials.quotient_hi_binary_limbs_shift = key->quotient_hi_binary_limbs.shifted();
    prover_polynomials.quotient_lo_limbs_range_constraint_0_shift = key->quotient_lo_limbs_range_constraint_0.shifted();
    prover_polynomials.quotient_lo_limbs_range_constraint_1_shift = key->quotient_lo_limbs_range_constraint_1.shifted();
    prover_polynomials.quotient_lo_limbs_range_constraint_2_shift = key->quotient_lo_limbs_range_constraint_2.shifted();
    prover_polynomials.quotient_lo_limbs_range_constraint_3_shift = key->quotient_lo_limbs_range_constraint_3.shifted();
    prover_polynomials.quotient_lo_limbs_range_constraint_4_shift = key->quotient_lo_limbs_range_constraint_4.shifted();
    prover_polynomials.quotient_lo_limbs_range_constraint_tail_shift =
        key->quotient_lo_limbs_range_constraint_tail.shifted();
    prover_polynomials.quotient_hi_limbs_range_constraint_0_shift = key->quotient_hi_limbs_range_constraint_0.shifted();
    prover_polynomials.quotient_hi_limbs_range_constraint_1_shift = key->quotient_hi_limbs_range_constraint_1.shifted();
    prover_polynomials.quotient_hi_limbs_range_constraint_2_shift = key->quotient_hi_limbs_range_constraint_2.shifted();
    prover_polynomials.quotient_hi_limbs_range_constraint_3_shift = key->quotient_hi_limbs_range_constraint_3.shifted();
    prover_polynomials.quotient_hi_limbs_range_constraint_4_shift = key->quotient_hi_limbs_range_constraint_4.shifted();
    prover_polynomials.quotient_hi_limbs_range_constraint_tail_shift =
        key->quotient_hi_limbs_range_constraint_tail.shifted();
    prover_polynomials.relation_wide_limbs_shift = key->relation_wide_limbs.shifted();
    prover_polynomials.relation_wide_limbs_range_constraint_0_shift =
        key->relation_wide_limbs_range_constraint_0.shifted();
    prover_polynomials.relation_wide_limbs_range_constraint_1_shift =
        key->relation_wide_limbs_range_constraint_1.shifted();
    prover_polynomials.relation_wide_limbs_range_constraint_2_shift =
        key->relation_wide_limbs_range_constraint_2.shifted();
    prover_polynomials.relation_wide_limbs_range_constraint_3_shift =
        key->relation_wide_limbs_range_constraint_3.shifted();
    prover_polynomials.ordered_range_constraints_0_shift = key->ordered_range_constraints_0.shifted();
    prover_polynomials.ordered_range_constraints_1_shift = key->ordered_range_constraints_1.shifted();
    prover_polynomials.ordered_range_constraints_2_shift = key->ordered_range_constraints_2.shifted();
    prover_polynomials.ordered_range_constraints_3_shift = key->ordered_range_constraints_3.shifted();
    prover_polynomials.ordered_range_constraints_4_shift = key->ordered_range_constraints_4.shifted();
    prover_polynomials.lagrange_first = key->lagrange_first;
    prover_polynomials.lagrange_last = key->lagrange_last;
    prover_polynomials.lagrange_odd = key->lagrange_odd;
    prover_polynomials.lagrange_even = key->lagrange_even;
    prover_polynomials.lagrange_second_to_last_in_minicircuit = key->lagrange_second_to_last_in_minicircuit;
    prover_polynomials.ordered_extra_range_constraints_numerator = key->ordered_extra_range_constraints_numerator;

    // for (size_t i = 0; i < key->circuit_size; i += 2) {
    //     if ((prover_polynomials.p_x_high_limbs_range_constraint_3_shift[i + 1] * 64 -
    //          prover_polynomials.p_x_high_limbs_range_constraint_4_shift[i + 1]) != 0) {
    //         info("Expression fails at ", i);
    //     }
    // }
}

/**
 * @brief Add circuit size and values used in the relations to the transcript
 *
 */
template <typename Flavor> void GoblinTranslatorProver_<Flavor>::execute_preamble_round()
{
    const auto circuit_size = static_cast<uint32_t>(key->circuit_size);

    transcript.send_to_verifier("circuit_size", circuit_size);
    transcript.send_to_verifier("evaluation_input_x", key->evaluation_input_x);
    transcript.send_to_verifier("batching_challenge_v", key->batching_challenge_v);
}

/**
 * @brief Compute commitments to the first three wires
 *
 */
template <typename Flavor> void GoblinTranslatorProver_<Flavor>::execute_wire_and_sorted_constraints_commitments_round()
{
    // Commit to all wire polynomials
    auto wire_polys = key->get_wires();
    auto labels = commitment_labels.get_wires();
    for (size_t idx = 0; idx < wire_polys.size(); ++idx) {
        queue.add_commitment(wire_polys[idx], labels[idx]);
    }
}

/**
 * @brief Compute permutation and lookup grand product polynomials and commitments
 *
 */
template <typename Flavor> void GoblinTranslatorProver_<Flavor>::execute_grand_product_computation_round()
{
    // Compute and store parameters required by relations in Sumcheck
    auto [gamma] = transcript.get_challenges("gamma");
    const size_t NUM_LIMB_BITS = Flavor::NUM_LIMB_BITS;
    relation_parameters.beta = 0;
    relation_parameters.gamma = gamma;
    relation_parameters.public_input_delta = 0;
    relation_parameters.lookup_grand_product_delta = 0;
    auto uint_evaluation_input = uint256_t(key->evaluation_input_x);
    relation_parameters.evaluation_input_x = { uint_evaluation_input.slice(0, NUM_LIMB_BITS),
                                               uint_evaluation_input.slice(NUM_LIMB_BITS, NUM_LIMB_BITS * 2),
                                               uint_evaluation_input.slice(NUM_LIMB_BITS * 2, NUM_LIMB_BITS * 3),
                                               uint_evaluation_input.slice(NUM_LIMB_BITS * 3, NUM_LIMB_BITS * 4) };
    std::vector<uint256_t> uint_batching_challenge_powers;
    auto batching_challenge_v = key->batching_challenge_v;
    uint_batching_challenge_powers.emplace_back(batching_challenge_v);
    auto running_power = batching_challenge_v * batching_challenge_v;
    uint_batching_challenge_powers.emplace_back(running_power);
    running_power *= batching_challenge_v;
    uint_batching_challenge_powers.emplace_back(running_power);
    running_power *= batching_challenge_v;
    uint_batching_challenge_powers.emplace_back(running_power);

    for (size_t i = 0; i < 4; i++) {
        relation_parameters.batching_challenge_v[i] = {
            uint_batching_challenge_powers[i].slice(0, NUM_LIMB_BITS),
            uint_batching_challenge_powers[i].slice(NUM_LIMB_BITS, NUM_LIMB_BITS * 2),
            uint_batching_challenge_powers[i].slice(NUM_LIMB_BITS * 2, NUM_LIMB_BITS * 3),
            uint_batching_challenge_powers[i].slice(NUM_LIMB_BITS * 3, NUM_LIMB_BITS * 4),
        };
    }
    // Compute constraint permutation grand product
    grand_product_library::compute_grand_products<Flavor>(key, prover_polynomials, relation_parameters);

    queue.add_commitment(key->z_perm, commitment_labels.z_perm);
}

/**
 * @brief Run Sumcheck resulting in u = (u_1,...,u_d) challenges and all evaluations at u being calculated.
 *
 */
template <typename Flavor> void GoblinTranslatorProver_<Flavor>::execute_relation_check_rounds()
{
    using Sumcheck = sumcheck::SumcheckProver<Flavor>;

    auto sumcheck = Sumcheck(key->circuit_size, transcript);

    sumcheck_output = sumcheck.prove(prover_polynomials, relation_parameters);
}

/**
 * - Get rho challenge
 * - Compute d+1 Fold polynomials and their evaluations.
 *
 * */
template <typename Flavor> void GoblinTranslatorProver_<Flavor>::execute_univariatization_round()
{
    const size_t NUM_POLYNOMIALS = Flavor::NUM_ALL_ENTITIES;

    // Generate batching challenge ρ and powers 1,ρ,…,ρᵐ⁻¹
    rho = transcript.get_challenge("rho");
    std::vector<FF> rhos = pcs::gemini::powers_of_rho(rho, NUM_POLYNOMIALS);

    // Batch the unshifted polynomials and the to-be-shifted polynomials using ρ
    Polynomial batched_poly_unshifted(key->circuit_size); // batched unshifted polynomials
    size_t poly_idx = 0;                                  // TODO(#391) zip
    for (auto& unshifted_poly : prover_polynomials.get_unshifted()) {
        batched_poly_unshifted.add_scaled(unshifted_poly, rhos[poly_idx]);

        ++poly_idx;
    }

    Polynomial batched_poly_to_be_shifted(key->circuit_size); // batched to-be-shifted polynomials
    for (auto& to_be_shifted_poly : prover_polynomials.get_to_be_shifted()) {
        batched_poly_to_be_shifted.add_scaled(to_be_shifted_poly, rhos[poly_idx]);
        ++poly_idx;
    };

    Polynomial batched_poly_special(key->circuit_size);
    for (auto& special_polynomial : prover_polynomials.get_special()) {
        batched_poly_special.add_scaled(special_polynomial, rhos[poly_idx]);
        ++poly_idx;
    }
    batched_poly_unshifted += batched_poly_special;

    // We need to save the backup of this polynomial, because we'll need to update the first 2 polynomials
    fold_polynomial_backups.push_back(std::move(batched_poly_special));

    // Compute d-1 polynomials Fold^(i), i = 1, ..., d-1.
    fold_polynomials = Gemini::compute_fold_polynomials(
        sumcheck_output.challenge_point, std::move(batched_poly_unshifted), std::move(batched_poly_to_be_shifted));

    // Compute and add to trasnscript the commitments [Fold^(i)], i = 1, ..., d-1
    for (size_t l = 0; l < key->log_circuit_size - 1; ++l) {
        queue.add_commitment(fold_polynomials[l + 2], "Gemini:FOLD_" + std::to_string(l + 1));
    }
}

/**
 * - Do Fiat-Shamir to get "r" challenge
 * - Compute remaining two partially evaluated Fold polynomials Fold_{r}^(0) and Fold_{-r}^(0).
 * - Compute and aggregate opening pairs (challenge, evaluation) for each of d Fold polynomials.
 * - Add d-many Fold evaluations a_i, i = 0, ..., d-1 to the transcript, excluding eval of Fold_{r}^(0)
 * */
template <typename Flavor> void GoblinTranslatorProver_<Flavor>::execute_pcs_evaluation_round()
{

    const size_t NUM_POLYNOMIALS = Flavor::NUM_ALL_ENTITIES;
    const FF r_challenge = transcript.get_challenge("Gemini:r");

    auto r_to_the_mini_circuit_size = r_challenge.pow(Flavor::MINI_CIRCUIT_SIZE);
    // Compute {1, rᵐˢ, r²ᵐˢ, ... }
    auto powers_of_r = pcs::gemini::powers_of_rho(r_to_the_mini_circuit_size, Flavor::CONCATENATION_INDEX);

    std::vector<FF> rhos = pcs::gemini::powers_of_rho(rho, NUM_POLYNOMIALS);

    auto concatenation_groups = prover_polynomials.get_concatenation_groups();
    auto concatenated_polynomials = prover_polynomials.get_special();
    auto poly_idx = prover_polynomials.get_unshifted_then_shifted().size();

    // We don't commit to the concatenated polynomials, because we can simply open the sum of Commitments of their parts
    // multiplied by appropriate powers of r. However, originally the folding polynomials were constructed from
    // concatenated versions. While the actual folded polynomials have commitments to their exact coefficients, the
    // first 2 batched polynomials do not, so we have to replace the contribution of concatenated polynomials by the
    // appropriate contributions of original polynomials
    for (size_t i = 0; i < concatenated_polynomials.size(); i++) {
        for (size_t j = 0; j < concatenation_groups[i].size(); j++) {
            fold_polynomial_backups[0].add_scaled(concatenation_groups[i][j], -powers_of_r[j] * rhos[poly_idx]);
        }
        ++poly_idx;
    }
    fold_polynomials[0] -= fold_polynomial_backups[0];
    fold_polynomial_backups.clear();

    gemini_output = Gemini::compute_fold_polynomial_evaluations(
        sumcheck_output.challenge_point, std::move(fold_polynomials), r_challenge);

    for (size_t l = 0; l < key->log_circuit_size; ++l) {
        std::string label = "Gemini:a_" + std::to_string(l);
        const auto& evaluation = gemini_output.opening_pairs[l + 1].evaluation;
        transcript.send_to_verifier(label, evaluation);
    }
}

/**
 * - Do Fiat-Shamir to get "nu" challenge.
 * - Compute commitment [Q]_1
 * */
template <typename Flavor> void GoblinTranslatorProver_<Flavor>::execute_shplonk_batched_quotient_round()
{
    nu_challenge = transcript.get_challenge("Shplonk:nu");

    batched_quotient_Q =
        Shplonk::compute_batched_quotient(gemini_output.opening_pairs, gemini_output.witnesses, nu_challenge);

    // commit to Q(X) and add [Q] to the transcript
    queue.add_commitment(batched_quotient_Q, "Shplonk:Q");
}

/**
 * - Do Fiat-Shamir to get "z" challenge.
 * - Compute polynomial Q(X) - Q_z(X)
 * */
template <typename Flavor> void GoblinTranslatorProver_<Flavor>::execute_shplonk_partial_evaluation_round()
{
    const FF z_challenge = transcript.get_challenge("Shplonk:z");

    shplonk_output = Shplonk::compute_partially_evaluated_batched_quotient(
        gemini_output.opening_pairs, gemini_output.witnesses, std::move(batched_quotient_Q), nu_challenge, z_challenge);
}
/**
 * - Compute final PCS opening proof:
 * - For KZG, this is the quotient commitment [W]_1
 * - For IPA, the vectors L and R
 * */
template <typename Flavor> void GoblinTranslatorProver_<Flavor>::execute_final_pcs_round()
{
    PCS::compute_opening_proof(pcs_commitment_key, shplonk_output.opening_pair, shplonk_output.witness, transcript);
}

template <typename Flavor> plonk::proof& GoblinTranslatorProver_<Flavor>::export_proof()
{
    proof.proof_data = transcript.proof_data;
    return proof;
}

template <typename Flavor> plonk::proof& GoblinTranslatorProver_<Flavor>::construct_proof()
{
    // Add circuit size public input size and public inputs to transcript.
    execute_preamble_round();

    // Compute first three wire commitments
    execute_wire_and_sorted_constraints_commitments_round();
    queue.process_queue();

    // Fiat-Shamir: gamma
    // Compute grand product(s) and commitments.
    execute_grand_product_computation_round();
    queue.process_queue();

    // Fiat-Shamir: alpha
    // Run sumcheck subprotocol.
    execute_relation_check_rounds();

    // Fiat-Shamir: rho
    // Compute Fold polynomials and their commitments.
    execute_univariatization_round();
    queue.process_queue();

    // Fiat-Shamir: r
    // Compute Fold evaluations
    execute_pcs_evaluation_round();

    // execute_multikzg_opening_round();
    // return export_proof();
    //  Fiat-Shamir: nu
    //  Compute Shplonk batched quotient commitment Q
    execute_shplonk_batched_quotient_round();
    queue.process_queue();

    // Fiat-Shamir: z
    // Compute partial evaluation Q_z
    execute_shplonk_partial_evaluation_round();

    // Fiat-Shamir: z
    // Compute PCS opening proof (either KZG quotient commitment or IPA opening proof)
    execute_final_pcs_round();

    return export_proof();
}

template class GoblinTranslatorProver_<honk::flavor::GoblinTranslatorBasic>;
} // namespace proof_system::honk

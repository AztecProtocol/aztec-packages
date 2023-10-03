/**
 * @file goblin_translator_circuit_builder.cpp
 * @author @Rumata888
 * @brief Circuit Logic generation for Goblin Plonk translator (checks equivalence of Queues/Transcripts for ECCVM and
 * Recursive Circuits)
 *
 * @copyright Copyright (c) 2023
 *
 */
#include "goblin_translator_circuit_builder.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/plonk/proof_system/constants.hpp"
#include "barretenberg/proof_system/op_queue/ecc_op_queue.hpp"
#include <cstddef>
namespace proof_system {

typename GoblinTranslatorCircuitBuilder::RangeList GoblinTranslatorCircuitBuilder::create_range_list(
    const uint64_t target_range)
{
    RangeList result;
    const auto range_tag = get_new_tag(); // current_tag + 1;
    const auto tau_tag = get_new_tag();   // current_tag + 2;
    create_tag(range_tag, tau_tag);
    create_tag(tau_tag, range_tag);
    result.target_range = target_range;
    result.range_tag = range_tag;
    result.tau_tag = tau_tag;

    // uint64_t num_multiples_of_three = (target_range / DEFAULT_PLOOKUP_RANGE_STEP_SIZE);

    // result.variable_indices.reserve((uint32_t)num_multiples_of_three);
    // for (uint64_t i = 0; i <= num_multiples_of_three; ++i) {
    //     const uint32_t index = this->add_variable(i * DEFAULT_PLOOKUP_RANGE_STEP_SIZE);
    //     result.variable_indices.emplace_back(index);
    //     assign_tag(index, result.range_tag);
    // }
    // {
    //     const uint32_t index = this->add_variable(target_range);
    //     result.variable_indices.emplace_back(index);
    //     assign_tag(index, result.range_tag);
    // }
    // Need this because these variables will not appear in the witness otherwise
    // TODO: create dummy constraints later
    // create_dummy_constraints(result.variable_indices);

    return result;
}

/**
 * @brief Constrain a variable to a range
 *
 * @details Checks if the range [0, target_range] already exists. If it doesn't, then creates a new range. Then tags
 * variable as belonging to this set.
 *
 * @param variable_index
 * @param target_range
 */
void GoblinTranslatorCircuitBuilder::create_new_range_constraint(const uint32_t variable_index,
                                                                 const uint64_t target_range,
                                                                 std::string const msg)
{

    if (uint256_t(this->get_variable(variable_index)).data[0] > target_range) {
        if (!this->failed()) {
            this->failure(msg);
        }
    }
    if (range_lists.count(target_range) == 0) {
        range_lists.insert({ target_range, create_range_list(target_range) });
    }

    const auto existing_tag = this->real_variable_tags[this->real_variable_index[variable_index]];
    auto& list = range_lists[target_range];

    // If the variable's tag matches the target range list's tag, do nothing.
    if (existing_tag != list.range_tag) {
        // If the variable is 'untagged' (i.e., it has the dummy tag), assign it the appropriate tag.
        // Otherwise, find the range for which the variable has already been tagged.
        if (existing_tag != DUMMY_TAG) {
            bool found_tag = false;
            for (const auto& r : range_lists) {
                if (r.second.range_tag == existing_tag) {
                    found_tag = true;
                    if (r.first < target_range) {
                        // The variable already has a more restrictive range check, so do nothing.
                        return;
                    } else {
                        // The range constraint we are trying to impose is more restrictive than the existing range
                        // constraint. It would be difficult to remove an existing range check. Instead deep-copy the
                        // variable and apply a range check to new variable
                        const uint32_t copied_witness = this->add_variable(this->get_variable(variable_index));
                        create_add_gate({ .a = variable_index,
                                          .b = copied_witness,
                                          .c = this->zero_idx,
                                          .a_scaling = 1,
                                          .b_scaling = -1,
                                          .c_scaling = 0,
                                          .const_scaling = 0 });
                        // Recurse with new witness that has no tag attached.
                        create_new_range_constraint(copied_witness, target_range, msg);
                        return;
                    }
                }
            }
            ASSERT(found_tag == true);
        }
        assign_tag(variable_index, list.range_tag);
        list.variable_indices.emplace_back(variable_index);
    }
}

template <typename Fq, typename Fr>
GoblinTranslatorCircuitBuilder::AccumulationInput generate_witness_values(
    Fr op_code, Fr p_x_lo, Fr p_x_hi, Fr p_y_lo, Fr p_y_hi, Fr z_1, Fr z_2, Fq previous_accumulator, Fq v, Fq x)
{
    constexpr size_t NUM_LIMB_BITS = GoblinTranslatorCircuitBuilder::NUM_LIMB_BITS;
    constexpr size_t NUM_LAST_LIMB_BITS = GoblinTranslatorCircuitBuilder::NUM_LAST_LIMB_BITS;
    constexpr size_t MICRO_LIMB_BITS = GoblinTranslatorCircuitBuilder::MICRO_LIMB_BITS;
    constexpr size_t TOP_STANDARD_MICROLIMB_BITS = NUM_LAST_LIMB_BITS % MICRO_LIMB_BITS;
    constexpr size_t TOP_Z_MICROLIMB_BITS = (128 % NUM_LIMB_BITS) % MICRO_LIMB_BITS;
    constexpr size_t TOP_QUOTIENT_MICROLIMB_BITS = (256 % NUM_LIMB_BITS) % MICRO_LIMB_BITS;
    constexpr auto shift_1 = GoblinTranslatorCircuitBuilder::SHIFT_1;
    constexpr auto shift_2 = GoblinTranslatorCircuitBuilder::SHIFT_2;
    // constexpr auto modulus_u512 = GoblinTranslatorCircuitBuilder::MODULUS_U512;
    constexpr auto neg_modulus_limbs = GoblinTranslatorCircuitBuilder::NEGATIVE_MODULUS_LIMBS;
    constexpr auto shift_2_inverse = GoblinTranslatorCircuitBuilder::SHIFT_2_INVERSE;

    /**
     * @brief A small function to transform a native element Fq into its bigfield representation  in Fr scalars
     *
     */
    auto base_element_to_bigfield = [](Fq& original) {
        uint256_t original_uint = original;
        return std::array<Fr, 5>({ Fr(original_uint.slice(0, NUM_LIMB_BITS)),
                                   Fr(original_uint.slice(NUM_LIMB_BITS, 2 * NUM_LIMB_BITS)),
                                   Fr(original_uint.slice(2 * NUM_LIMB_BITS, 3 * NUM_LIMB_BITS)),
                                   Fr(original_uint.slice(3 * NUM_LIMB_BITS, 4 * NUM_LIMB_BITS)),
                                   Fr(original_uint) });
    };
    /**
     * @brief A small function to transform a uint512_t element into its bigfield representation  in Fr scalars
     *
     */
    auto uint512_t_to_bigfield = [&shift_2](uint512_t& original) {
        return std::make_tuple(Fr(original.slice(0, NUM_LIMB_BITS).lo),
                               Fr(original.slice(NUM_LIMB_BITS, 2 * NUM_LIMB_BITS).lo),
                               Fr(original.slice(2 * NUM_LIMB_BITS, 3 * NUM_LIMB_BITS).lo),
                               Fr(original.slice(3 * NUM_LIMB_BITS, 4 * NUM_LIMB_BITS).lo),
                               Fr(original.slice(0, NUM_LIMB_BITS * 2).lo) +
                                   Fr(original.slice(NUM_LIMB_BITS * 2, NUM_LIMB_BITS * 4).lo) * shift_2);
    };

    /**
     * @brief A method for splitting wide limbs (P_x_lo, P_y_hi, etc) into two limbs
     *
     */
    auto split_wide_limb_into_2_limbs = [](Fr& wide_limb) {
        return std::make_tuple(Fr(uint256_t(wide_limb).slice(0, NUM_LIMB_BITS)),
                               Fr(uint256_t(wide_limb).slice(NUM_LIMB_BITS, 2 * NUM_LIMB_BITS)));
    };
    /**
     * @brief A method to split a full 68-bit limb into 5 14-bit limb and 1 shifted limb for a more secure constraint
     *
     */
    auto split_standard_limb_into_micro_limbs = [](Fr& limb) {
        static_assert(MICRO_LIMB_BITS == 14);
        return std::array<Fr, 6>{
            uint256_t(limb).slice(0, MICRO_LIMB_BITS),
            uint256_t(limb).slice(MICRO_LIMB_BITS, 2 * MICRO_LIMB_BITS),
            uint256_t(limb).slice(2 * MICRO_LIMB_BITS, 3 * MICRO_LIMB_BITS),
            uint256_t(limb).slice(3 * MICRO_LIMB_BITS, 4 * MICRO_LIMB_BITS),
            uint256_t(limb).slice(4 * MICRO_LIMB_BITS, 5 * MICRO_LIMB_BITS),
            uint256_t(limb).slice(4 * MICRO_LIMB_BITS, 5 * MICRO_LIMB_BITS)
                << (MICRO_LIMB_BITS - (NUM_LIMB_BITS % MICRO_LIMB_BITS)),
        };
    };

    /**
     * @brief A method to split the top 50-bit limb into 4 14-bit limbs and 1 shifted limb for a more secure constraint
     * (plus there is 1 extra space for other constraints)
     *
     */
    // auto split_top_limb_into_micro_limbs = [](Fr& limb) {
    //     static_assert(MICRO_LIMB_BITS == 14);
    //     return std::array<Fr, 6>{ uint256_t(limb).slice(0, MICRO_LIMB_BITS),
    //                               uint256_t(limb).slice(MICRO_LIMB_BITS, 2 * MICRO_LIMB_BITS),
    //                               uint256_t(limb).slice(2 * MICRO_LIMB_BITS, 3 * MICRO_LIMB_BITS),
    //                               uint256_t(limb).slice(3 * MICRO_LIMB_BITS, 4 * MICRO_LIMB_BITS),
    //                               0, // uint256_t(limb).slice(4 * MICRO_LIMB_BITS, 5 * MICRO_LIMB_BITS),
    //                               0 };
    // };
    auto split_top_limb_into_micro_limbs = [](Fr& limb, size_t last_limb_bits) {
        static_assert(MICRO_LIMB_BITS == 14);
        return std::array<Fr, 6>{ uint256_t(limb).slice(0, MICRO_LIMB_BITS),
                                  uint256_t(limb).slice(MICRO_LIMB_BITS, 2 * MICRO_LIMB_BITS),
                                  uint256_t(limb).slice(2 * MICRO_LIMB_BITS, 3 * MICRO_LIMB_BITS),
                                  uint256_t(limb).slice(3 * MICRO_LIMB_BITS, 4 * MICRO_LIMB_BITS),
                                  uint256_t(limb).slice(3 * MICRO_LIMB_BITS, 4 * MICRO_LIMB_BITS)
                                      << (MICRO_LIMB_BITS - (last_limb_bits % MICRO_LIMB_BITS)),
                                  0 };
    };
    auto split_top_z_limb_into_micro_limbs = [](Fr& limb, size_t last_limb_bits) {
        static_assert(MICRO_LIMB_BITS == 14);
        return std::array<Fr, 6>{ uint256_t(limb).slice(0, MICRO_LIMB_BITS),
                                  uint256_t(limb).slice(MICRO_LIMB_BITS, 2 * MICRO_LIMB_BITS),
                                  uint256_t(limb).slice(2 * MICRO_LIMB_BITS, 3 * MICRO_LIMB_BITS),
                                  uint256_t(limb).slice(3 * MICRO_LIMB_BITS, 4 * MICRO_LIMB_BITS),
                                  uint256_t(limb).slice(4 * MICRO_LIMB_BITS, 5 * MICRO_LIMB_BITS),
                                  uint256_t(limb).slice(4 * MICRO_LIMB_BITS, 5 * MICRO_LIMB_BITS)
                                      << (MICRO_LIMB_BITS - (last_limb_bits % MICRO_LIMB_BITS)) };
    };
    // /**
    //  * @brief A method to split the top 50-bit limb into 4 14-bit limbs and 1 shifted limb for a more secure
    //  constraint
    //  * (plus there is 1 extra space for other constraints)
    //  *
    //  */
    // auto split_top_limb_into_micro_limbs = [](Fr& limb) {
    //     static_assert(MICRO_LIMB_BITS == 14);
    //     return std::array<Fr, 6>{ uint256_t(limb).slice(0, MICRO_LIMB_BITS),
    //                               uint256_t(limb).slice(MICRO_LIMB_BITS, 2 * MICRO_LIMB_BITS),
    //                               uint256_t(limb).slice(2 * MICRO_LIMB_BITS, 3 * MICRO_LIMB_BITS),
    //                               uint256_t(limb).slice(3 * MICRO_LIMB_BITS, 4 * MICRO_LIMB_BITS),
    //                               uint256_t(limb).slice(3 * MICRO_LIMB_BITS, 4 * MICRO_LIMB_BITS)
    //                                   << (MICRO_LIMB_BITS - (NUM_LAST_LIMB_BITS % MICRO_LIMB_BITS)),
    //                               0 };
    // };
    /**
     * @brief Split a 72-bit relation limb into 6 14-bit limbs (we can allow the slack here, since we only need to
     * ensure non-overflow of the modulus)
     *
     */
    auto split_relation_limb_into_micro_limbs = [](Fr& limb) {
        static_assert(MICRO_LIMB_BITS == 14);
        return std::array<Fr, 6>{
            uint256_t(limb).slice(0, MICRO_LIMB_BITS),
            uint256_t(limb).slice(MICRO_LIMB_BITS, 2 * MICRO_LIMB_BITS),
            uint256_t(limb).slice(2 * MICRO_LIMB_BITS, 3 * MICRO_LIMB_BITS),
            uint256_t(limb).slice(3 * MICRO_LIMB_BITS, 4 * MICRO_LIMB_BITS),
            uint256_t(limb).slice(4 * MICRO_LIMB_BITS, 5 * MICRO_LIMB_BITS),
            uint256_t(limb).slice(5 * MICRO_LIMB_BITS, 6 * MICRO_LIMB_BITS),
        };
    };
    //  x and powers of v are given to use in challenge form, so the verifier has to deal with this :)
    Fq v_squared;
    Fq v_cubed;
    Fq v_quarted;
    v_squared = v * v;
    v_cubed = v_squared * v;
    v_quarted = v_cubed * v;

    // Convert the accumulator, powers of v and x into "bigfield" form
    auto previous_accumulator_witnesses = base_element_to_bigfield(previous_accumulator);
    auto v_witnesses = base_element_to_bigfield(v);
    auto v_squared_witnesses = base_element_to_bigfield(v_squared);
    auto v_cubed_witnesses = base_element_to_bigfield(v_cubed);
    auto v_quarted_witnesses = base_element_to_bigfield(v_quarted);
    auto x_witnesses = base_element_to_bigfield(x);

    // To calculate the quotient, we need to evaluate the expression in integers. So we need uint512_t versions of all
    // elements involved
    auto uint_previous_accumulator = uint512_t(previous_accumulator);
    auto uint_x = uint512_t(x);
    auto uint_op = uint512_t(op_code);
    auto uint_p_x = uint512_t(uint256_t(p_x_lo) + (uint256_t(p_x_hi) << (NUM_LIMB_BITS << 1)));
    auto uint_p_y = uint512_t(uint256_t(p_y_lo) + (uint256_t(p_y_hi) << (NUM_LIMB_BITS << 1)));
    auto uint_z_1 = uint512_t(z_1);
    auto uint_z_2 = uint512_t(z_2);
    auto uint_v = uint512_t(v);
    auto uint_v_squared = uint512_t(v_squared);
    auto uint_v_cubed = uint512_t(v_cubed);
    auto uint_v_quarted = uint512_t(v_quarted);

    // Construct Fq for op, P.x, P.y, z_1, z_2 for use in witness computation
    Fq base_op = Fq(uint256_t(op_code));
    Fq base_p_x = Fq(uint256_t(p_x_lo) + (uint256_t(p_x_hi) << (NUM_LIMB_BITS << 1)));
    Fq base_p_y = Fq(uint256_t(p_y_lo) + (uint256_t(p_y_hi) << (NUM_LIMB_BITS << 1)));
    Fq base_z_1 = Fq(uint256_t(z_1));
    Fq base_z_2 = Fq(uint256_t(z_2));

    // Construct bigfield representations of P.x and P.y
    auto [p_x_0, p_x_1] = split_wide_limb_into_2_limbs(p_x_lo);
    auto [p_x_2, p_x_3] = split_wide_limb_into_2_limbs(p_x_hi);
    Fr p_x_prime = p_x_lo + p_x_hi * Fr(shift_2);
    std::array<Fr, 5> p_x_witnesses = { p_x_0, p_x_1, p_x_2, p_x_3, p_x_prime };
    auto [p_y_0, p_y_1] = split_wide_limb_into_2_limbs(p_y_lo);
    auto [p_y_2, p_y_3] = split_wide_limb_into_2_limbs(p_y_hi);
    Fr p_y_prime = p_y_lo + p_y_hi * Fr(shift_2);
    std::array<Fr, 5> p_y_witnesses = { p_y_0, p_y_1, p_y_2, p_y_3, p_y_prime };

    // Construct bigfield representations of z1 and z2 only using 2 limbs each
    // z_1 and z_2 are low enough to act as their own prime limbs
    auto [z_1_lo, z_1_hi] = split_wide_limb_into_2_limbs(z_1);
    auto [z_2_lo, z_2_hi] = split_wide_limb_into_2_limbs(z_2);

    // The formula is `accumulator = accumulator⋅x + (op + v⋅p.x + v²⋅p.y + v³⋅z₁ + v⁴z₂)`. We need to compute the
    // remainder (new accumulator value)

    Fq remainder = previous_accumulator * x + base_z_2 * v_quarted + base_z_1 * v_cubed + base_p_y * v_squared +
                   base_p_x * v + base_op;
    uint512_t quotient_by_modulus = uint_previous_accumulator * uint_x + uint_z_2 * uint_v_quarted +
                                    uint_z_1 * uint_v_cubed + uint_p_y * uint_v_squared + uint_p_x * uint_v + uint_op -
                                    uint512_t(remainder);

    uint512_t quotient = quotient_by_modulus / uint512_t(Fq::modulus);
    // constexpr uint512_t MAX_CONSTRAINED_SIZE = uint512_t(1) << 254;
    // constexpr uint512_t MAX_Z_SIZE = uint512_t(1) << (NUM_LIMB_BITS * 2);
    // numeric::uint1024_t max_quotient =
    //     (uint1024_t(MAX_CONSTRAINED_SIZE) * MAX_CONSTRAINED_SIZE * 3 + MAX_Z_SIZE * MAX_CONSTRAINED_SIZE * 2 + 4) /
    //     GoblinTranslatorCircuitBuilder::MODULUS_U512;
    // info("Max quotient: ", max_quotient);
    // info("Max quotient range constraint: ", max_quotient.get_msb() + 1);

    auto [remainder_0, remainder_1, remainder_2, remainder_3, remainder_prime] = base_element_to_bigfield(remainder);
    std::array<Fr, 5> remainder_witnesses = { remainder_0, remainder_1, remainder_2, remainder_3, remainder_prime };
    auto [quotient_0, quotient_1, quotient_2, quotient_3, quotient_prime] = uint512_t_to_bigfield(quotient);
    std::array<Fr, 5> quotient_witnesses = { quotient_0, quotient_1, quotient_2, quotient_3, quotient_prime };

    // We will divide by shift_2 instantly in the relation itself, but first we need to compute the low part (0*0) and
    // the high part (0*1, 1*0) multiplied by a signle limb shift
    Fr low_wide_relation_limb_part_1 =
        previous_accumulator_witnesses[0] * x_witnesses[0] + op_code + v_witnesses[0] * p_x_witnesses[0] +
        v_squared_witnesses[0] * p_y_witnesses[0] + v_cubed_witnesses[0] * z_1_lo + v_quarted_witnesses[0] * z_2_lo +
        quotient_witnesses[0] * neg_modulus_limbs[0] - remainder_witnesses[0]; // This covers the lowest limb
    // info("LW1:", low_wide_relation_limb_part_1);
    Fr low_wide_relation_limb =
        low_wide_relation_limb_part_1 +
        (previous_accumulator_witnesses[1] * x_witnesses[0] + previous_accumulator_witnesses[0] * x_witnesses[1] +
         v_witnesses[1] * p_x_witnesses[0] + p_x_witnesses[1] * v_witnesses[0] +
         v_squared_witnesses[1] * p_y_witnesses[0] + v_squared_witnesses[0] * p_y_witnesses[1] +
         v_cubed_witnesses[1] * z_1_lo + z_1_hi * v_cubed_witnesses[0] + v_quarted_witnesses[1] * z_2_lo +
         v_quarted_witnesses[0] * z_2_hi + quotient_witnesses[0] * neg_modulus_limbs[1] +
         quotient_witnesses[1] * neg_modulus_limbs[0] - remainder_witnesses[1]) *
            shift_1; // And this covers the limb shifted by 68
    // uint256_t mlb = (uint256_t(1) << 68) - 1;
    // uint256_t maximum_value_lwrl = ((mlb * mlb) * (uint256_t(1) << 68) * 12 + (mlb * mlb) * 6 + 3) >> 136;
    // We have free space for relations micro limbs in:
    // 1)p_x_hi_limb
    // 2)p_y_hi_limb
    // 3)accumulator_hi_limb
    // 4)quotient_hi_limb x 2
    // But this should be more than enough, since we can relax this for relation constraints
    // for (auto& limb : quotient_witnesses) {
    //     info("Q: ", limb);
    // }
    // Treating accumulator as 254-bit constrained value
    // constexpr auto max_limb_size = (uint512_t(1) << NUM_LIMB_BITS) - 1;
    // constexpr auto shift_1_u512 = uint512_t(shift_1);
    // constexpr auto op_max_size = uint512_t(4);
    // constexpr uint512_t low_wide_limb_maximum_value =
    //     op_max_size + (max_limb_size * max_limb_size) * ((shift_1_u512 * 12) + 6);
    // constexpr uint512_t low_wide_limb_maximum_value_constraint =
    //     (low_wide_limb_maximum_value >> (2 * NUM_LIMB_BITS)).lo +
    //     uint256_t(uint64_t((low_wide_limb_maximum_value % uint512_t(1) << (2 * NUM_LIMB_BITS)) != 0));
    // constexpr auto low_wide_limb_range_consraint_size = low_wide_limb_maximum_value_constraint.get_msb() + 1;
    // // info("Low limb range constraint: ", low_wide_limb_range_consraint_size);
    //   Low bits have to be zero
    ASSERT(uint256_t(low_wide_relation_limb).slice(0, 2 * NUM_LIMB_BITS) == 0);

    Fr low_wide_relation_limb_divided = low_wide_relation_limb * shift_2_inverse;
    // We need to range constrain the low_wide_relation_limb_divided
    // constexpr size_t NUM_LAST_BN254_LIMB_BITS =
    //     GoblinTranslatorCircuitBuilder::MODULUS_U512.get_msb() + 1 - NUM_LIMB_BITS * 3;

    // constexpr auto max_high_limb_size = (uint512_t(1) << NUM_LAST_BN254_LIMB_BITS) - 1;
    // constexpr uint512_t high_wide_limb_maximum_value =
    //     low_wide_limb_maximum_value_constraint + (max_limb_size * max_limb_size) * 16 +
    //     (max_limb_size * max_limb_size * 10 + max_limb_size * max_high_limb_size * 10) * shift_1_u512;
    // constexpr uint512_t high_wide_limb_maximum_value_constraint =
    //     (high_wide_limb_maximum_value >> (2 * NUM_LIMB_BITS)).lo +
    //     uint256_t(uint64_t((high_wide_limb_maximum_value % uint512_t(1) << (2 * NUM_LIMB_BITS)) != 0));
    // constexpr auto high_wide_limb_range_constraint_size = high_wide_limb_maximum_value_constraint.get_msb() + 1;
    // info(high_wide_limb_range_constraint_size);
    //   4 high combinations = 8 ml*ml + 8 ml*last_ml. 2 low combinations = 2*ml*ml + 2*ml*last_ml
    Fr high_wide_relation_limb =
        low_wide_relation_limb_divided + previous_accumulator_witnesses[2] * x_witnesses[0] +
        previous_accumulator_witnesses[1] * x_witnesses[1] + previous_accumulator_witnesses[0] * x_witnesses[2] +
        v_witnesses[2] * p_x_witnesses[0] + v_witnesses[1] * p_x_witnesses[1] + v_witnesses[0] * p_x_witnesses[2] +
        v_squared_witnesses[2] * p_y_witnesses[0] + v_squared_witnesses[1] * p_y_witnesses[1] +
        v_squared_witnesses[0] * p_y_witnesses[2] + v_cubed_witnesses[2] * z_1_lo + v_cubed_witnesses[1] * z_1_hi +
        v_quarted_witnesses[2] * z_2_lo + v_quarted_witnesses[1] * z_2_hi +
        quotient_witnesses[2] * neg_modulus_limbs[0] + quotient_witnesses[1] * neg_modulus_limbs[1] +
        quotient_witnesses[0] * neg_modulus_limbs[2] - remainder_witnesses[2] +
        (previous_accumulator_witnesses[3] * x_witnesses[0] + previous_accumulator_witnesses[2] * x_witnesses[1] +
         previous_accumulator_witnesses[1] * x_witnesses[2] + previous_accumulator_witnesses[0] * x_witnesses[3] +
         v_witnesses[3] * p_x_witnesses[0] + v_witnesses[2] * p_x_witnesses[1] + v_witnesses[1] * p_x_witnesses[2] +
         v_witnesses[0] * p_x_witnesses[3] + v_squared_witnesses[3] * p_y_witnesses[0] +
         v_squared_witnesses[2] * p_y_witnesses[1] + v_squared_witnesses[1] * p_y_witnesses[2] +
         v_squared_witnesses[0] * p_y_witnesses[3] + v_cubed_witnesses[3] * z_1_lo + v_cubed_witnesses[2] * z_1_hi +
         v_quarted_witnesses[3] * z_2_lo + v_quarted_witnesses[2] * z_2_hi +
         quotient_witnesses[3] * neg_modulus_limbs[0] + quotient_witnesses[2] * neg_modulus_limbs[1] +
         quotient_witnesses[1] * neg_modulus_limbs[2] + quotient_witnesses[0] * neg_modulus_limbs[3] -
         remainder_witnesses[3]) *
            shift_1;
    // info("Value: ", high_wide_relation_limb);
    // info("Value: ", high_wide_relation_limb * shift_2_inverse);
    ASSERT(uint256_t(high_wide_relation_limb).slice(0, 2 * NUM_LIMB_BITS) == 0);
    auto high_wide_relation_limb_divided = high_wide_relation_limb * shift_2_inverse;
    GoblinTranslatorCircuitBuilder::AccumulationInput input{
        .op_code = op_code,
        .P_x_lo = p_x_lo,
        .P_x_hi = p_x_hi,
        .P_x_limbs = p_x_witnesses,
        .P_x_microlimbs = {},
        .P_y_lo = p_y_lo,
        .P_y_hi = p_y_hi,
        .P_y_limbs = p_y_witnesses,
        .P_y_microlimbs = {},
        .z_1 = z_1,
        .z_1_limbs = { z_1_lo, z_1_hi },
        .z_1_microlimbs = {},
        .z_2 = z_2,
        .z_2_limbs = { z_2_lo, z_2_hi },
        .z_2_microlimbs = {},
        .previous_accumulator = previous_accumulator_witnesses,
        .current_accumulator = remainder_witnesses,
        .current_accumulator_microlimbs = {},
        .quotient_binary_limbs = quotient_witnesses,
        .quotient_microlimbs = {},
        .relation_wide_limbs = { low_wide_relation_limb_divided, high_wide_relation_limb_divided },
        .relation_wide_microlimbs = { split_relation_limb_into_micro_limbs(low_wide_relation_limb_divided),
                                      split_relation_limb_into_micro_limbs(high_wide_relation_limb_divided) },
        .x_limbs = x_witnesses,
        .v_limbs = v_witnesses,
        .v_squared_limbs = v_squared_witnesses,
        .v_cubed_limbs = v_cubed_witnesses,
        .v_quarted_limbs = v_quarted_witnesses,

    };

    auto last_limb_index = GoblinTranslatorCircuitBuilder::NUM_BINARY_LIMBS - 1;
    for (size_t i = 0; i < last_limb_index; i++) {
        input.P_x_microlimbs[i] = split_standard_limb_into_micro_limbs(input.P_x_limbs[i]);
    }
    input.P_x_microlimbs[last_limb_index] =
        split_top_limb_into_micro_limbs(input.P_x_limbs[last_limb_index], TOP_STANDARD_MICROLIMB_BITS);

    for (size_t i = 0; i < last_limb_index; i++) {
        input.P_y_microlimbs[i] = split_standard_limb_into_micro_limbs(input.P_y_limbs[i]);
    }
    input.P_y_microlimbs[last_limb_index] =
        split_top_limb_into_micro_limbs(input.P_y_limbs[last_limb_index], TOP_STANDARD_MICROLIMB_BITS);

    for (size_t i = 0; i < GoblinTranslatorCircuitBuilder::NUM_Z_LIMBS - 1; i++) {
        input.z_1_microlimbs[i] = split_standard_limb_into_micro_limbs(input.z_1_limbs[i]);
        input.z_2_microlimbs[i] = split_standard_limb_into_micro_limbs(input.z_2_limbs[i]);
    }
    input.z_1_microlimbs[GoblinTranslatorCircuitBuilder::NUM_Z_LIMBS - 1] = split_top_z_limb_into_micro_limbs(
        input.z_1_limbs[GoblinTranslatorCircuitBuilder::NUM_Z_LIMBS - 1], TOP_Z_MICROLIMB_BITS);
    input.z_2_microlimbs[GoblinTranslatorCircuitBuilder::NUM_Z_LIMBS - 1] = split_top_z_limb_into_micro_limbs(
        input.z_2_limbs[GoblinTranslatorCircuitBuilder::NUM_Z_LIMBS - 1], TOP_Z_MICROLIMB_BITS);
    for (size_t i = 0; i < last_limb_index; i++) {
        input.current_accumulator_microlimbs[i] = split_standard_limb_into_micro_limbs(input.current_accumulator[i]);
    }

    input.current_accumulator_microlimbs[last_limb_index] =
        split_top_limb_into_micro_limbs(input.current_accumulator[last_limb_index], TOP_STANDARD_MICROLIMB_BITS);
    // TODO(kesha): quotient has to be constrained even further
    for (size_t i = 0; i < last_limb_index; i++) {
        input.quotient_microlimbs[i] = split_standard_limb_into_micro_limbs(input.quotient_binary_limbs[i]);
        // info("Stored: ", single_accumulation_step.current_accumulator_microlimbs[i][5], " at ", i);
    }
    input.quotient_microlimbs[last_limb_index] =
        split_top_limb_into_micro_limbs(input.quotient_binary_limbs[last_limb_index], TOP_QUOTIENT_MICROLIMB_BITS);
    return input;
}

template <typename Fq>
GoblinTranslatorCircuitBuilder::AccumulationInput compute_witness_values_for_one_ecc_op(ECCOp ecc_op,
                                                                                        Fq previous_accumulator,
                                                                                        Fq v,
                                                                                        Fq x)
{
    using Fr = barretenberg::fr;
    Fr op(ecc_op.getOpcode());
    Fr p_x_lo(0);
    Fr p_x_hi(0);
    Fr p_y_lo(0);
    Fr p_y_hi(0);

    if (!ecc_op.reset) {
        p_x_lo = Fr(uint256_t(ecc_op.base_point.x).slice(0, 2 * GoblinTranslatorCircuitBuilder::NUM_LIMB_BITS));
        p_x_hi = Fr(uint256_t(ecc_op.base_point.x)
                        .slice(2 * GoblinTranslatorCircuitBuilder::NUM_LIMB_BITS,
                               4 * GoblinTranslatorCircuitBuilder::NUM_LIMB_BITS));
        p_y_lo = Fr(uint256_t(ecc_op.base_point.y).slice(0, 2 * GoblinTranslatorCircuitBuilder::NUM_LIMB_BITS));
        p_y_hi = Fr(uint256_t(ecc_op.base_point.y)
                        .slice(2 * GoblinTranslatorCircuitBuilder::NUM_LIMB_BITS,
                               4 * GoblinTranslatorCircuitBuilder::NUM_LIMB_BITS));
    }
    return generate_witness_values(
        op, p_x_lo, p_x_hi, p_y_lo, p_y_hi, Fr(ecc_op.scalar_1), Fr(ecc_op.scalar_2), previous_accumulator, v, x);
}
void GoblinTranslatorCircuitBuilder::feed_ecc_op_queue_into_circuit(ECCOpQueue& ecc_op_queue,
                                                                    barretenberg::fq v,
                                                                    barretenberg::fq x)
{
    using Fq = barretenberg::fq;
    std::vector<Fq> accumulator_trace;
    Fq current_accumulator(0);
    if (ecc_op_queue.raw_ops.empty()) {
        return;
    }
    for (size_t i = 0; i < ecc_op_queue.raw_ops.size(); i++) {
        auto& ecc_op = ecc_op_queue.raw_ops[ecc_op_queue.raw_ops.size() - 1 - i];
        current_accumulator *= x;
        current_accumulator +=
            (Fq(ecc_op.getOpcode()) +
             v * (ecc_op.base_point.x + v * (ecc_op.base_point.y + v * (ecc_op.scalar_1 + v * ecc_op.scalar_2))));
        accumulator_trace.push_back(current_accumulator);
    }

    accumulator_trace.pop_back();
    for (auto& raw_op : ecc_op_queue.raw_ops) {
        Fq previous_accumulator = 0;
        if (!accumulator_trace.empty()) {
            previous_accumulator = accumulator_trace.back();
            accumulator_trace.pop_back();
        }
        auto one_accumulation_step = compute_witness_values_for_one_ecc_op(raw_op, previous_accumulator, v, x);
        create_accumulation_gate(one_accumulation_step);
    }
}
template GoblinTranslatorCircuitBuilder::AccumulationInput generate_witness_values(
    barretenberg::fr op_code,
    barretenberg::fr p_x_lo,
    barretenberg::fr p_x_hi,
    barretenberg::fr p_y_lo,
    barretenberg::fr p_y_hi,
    barretenberg::fr z_1,
    barretenberg::fr z_2,
    barretenberg::fq previous_accumulator,
    barretenberg::fq v,
    barretenberg::fq x);
} // namespace proof_system
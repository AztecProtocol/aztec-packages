// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Suyash], commit: 553c5eb82901955c638b943065acd3e47fc918c0}
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
/**
 * Special case function for performing secp256k1 ecdsa signature verification group operations
 *
 * TODO: we should try to genericize this, but this method is super fiddly and we need it to be efficient!
 *
 **/
#include "barretenberg/stdlib/primitives/biggroup/biggroup.hpp"
namespace bb::stdlib::element_default {

template <typename C, class Fq, class Fr, class G>
template <typename, typename>
element<C, Fq, Fr, G> element<C, Fq, Fr, G>::secp256k1_ecdsa_mul(const element& pubkey, const Fr& u1, const Fr& u2)
{
    std::cout << "\n[secp256k1_ecdsa_mul] === START ===" << std::endl;
    std::cout << "[secp256k1_ecdsa_mul] u1 value: " << u1.get_value() << std::endl;
    std::cout << "[secp256k1_ecdsa_mul] u2 value: " << u2.get_value() << std::endl;
    std::cout << "[secp256k1_ecdsa_mul] pubkey X: " << pubkey.x().get_value() << std::endl;
    std::cout << "[secp256k1_ecdsa_mul] pubkey Y: " << pubkey.y().get_value() << std::endl;

    /**
     * Compute `out = u1.[1] + u2.[pubkey]
     *
     * Split scalar `u1` into 129-bit short scalars `u1_lo, u1_hi`, where `u1 = u1_lo * \lambda u1_hi`
     * (\lambda is the cube root of unity modulo the secp256k1 group order)
     *
     * Covert `u1_lo` and `u1_hi` into an 8-bit sliding window NAF. Our base point is the G1 generator.
     * We have a precomputed size-256 plookup table of the generator point, multiplied by all possible wNAF values
     *
     * We also split scalar `u2` using the secp256k1 endomorphism. Convert short scalars into 4-bit sliding window NAFs.
     * We will store the lookup table of all possible base-point wNAF states in a ROM table
     * (it's variable-base scalar multiplication in a SNARK with a lookup table! ho ho ho)
     *
     * The wNAFs `u1_lo_wnaf, u1_hi_wnaf, u2_lo_wnaf, u2_hi_wnaf` are each offset by 1 bit relative to each other.
     * i.e. we right-shift `u2_hi` by 1 bit before computing its wNAF
     *      we right-shift `u1_lo` by 2 bits
     *      we right-shift `u1_hi` by 3 bits
     *      we do not shift `u2_lo`
     *
     * We do this to ensure that we are never adding more than 1 point into our accumulator when performing our
     * double-and-add scalar multiplication. It is more efficient to use the montgomery ladder algorithm,
     * compared against doubling an accumulator and adding points into it.
     *
     * The bits removed by the right-shifts are stored in the wnaf's respective `least_significant_wnaf_fragment` member
     * variable
     *
     * We do NOT range constrain the wNAF entries, because we will use them to lookup in a ROM/regular table.
     * The ROM/regular table lookup implicitly enforces the range constraint
     */
    std::cout << "[secp256k1_ecdsa_mul] Computing wNAFs..." << std::endl;
    const auto [u1_lo_wnaf, u1_hi_wnaf] = compute_secp256k1_endo_wnaf<8, 2, 3>(u1, false);
    const auto [u2_lo_wnaf, u2_hi_wnaf] = compute_secp256k1_endo_wnaf<4, 0, 1>(u2, false);
    std::cout << "[secp256k1_ecdsa_mul] wNAFs computed" << std::endl;

    /**
     * Construct our 4-bit variable-base and 8-bit fixed base lookup tables
     **/
    auto P1 = element::one(pubkey.get_context());
    auto P2 = pubkey;
    const auto P1_table =
        element::eight_bit_fixed_base_table(element::eight_bit_fixed_base_table::CurveType::SECP256K1, false);
    const auto endoP1_table =
        element::eight_bit_fixed_base_table(element::eight_bit_fixed_base_table::CurveType::SECP256K1, true);
    const auto [P2_table, endoP2_table] = create_endo_pair_four_bit_table_plookup(P2);
    std::cout << "[secp256k1_ecdsa_mul] Lookup tables created" << std::endl;

    // Initialize our accumulator
    auto accumulator = P2_table[u2_lo_wnaf.wnaf[0]];
    std::cout << "[secp256k1_ecdsa_mul] Accumulator initialized with u2_lo_wnaf[0]" << std::endl;
    std::cout << "[secp256k1_ecdsa_mul] Initial accumulator X: " << accumulator.x().get_value() << std::endl;
    std::cout << "[secp256k1_ecdsa_mul] Initial accumulator Y: " << accumulator.y().get_value() << std::endl;
    std::cout << "[secp256k1_ecdsa_mul] Initial accumulator is_point_at_infinity: "
              << accumulator.is_point_at_infinity().get_value() << std::endl;

    /**
     * main double-and-add loop
     *
     * Acc = Acc + Acc
     * Acc = Acc + Acc
     * Acc = Acc + u2_hi_wnaf.[endoP2] + Acc
     * Acc = Acc + u2_lo_wnaf.[P2] + Acc
     * Acc = Acc + u1_hi_wnaf.[endoP1] + Acc
     * Acc = Acc + u1_lo_wnaf.[P1] + Acc
     * Acc = Acc + u2_hi_wnaf.[endoP2] + Acc
     * Acc = Acc + u2_lo_wnaf.[P2] + Acc
     *
     * We add u2 points into the accumulator twice per 'round' as we only have a 4-bit lookup table
     * (vs the 8-bit table for u1)
     *
     * At the conclusion of this loop, we will need to add a final contribution from `u2_hi, u1_lo, u1_hi`.
     * This is because we offset our wNAFs to take advantage of the montgomery ladder, but this means we
     * have doubled our accumulator AFTER adding our final wnaf contributions from u2_hi, u1_lo and u1_hi
     **/
    std::cout << "[secp256k1_ecdsa_mul] Starting main loop (16 iterations)..." << std::endl;
    for (size_t i = 0; i < 16; ++i) {
        std::cout << "\n[secp256k1_ecdsa_mul] === Iteration " << i << " ===" << std::endl;

        accumulator = accumulator.dbl();
        std::cout << "[secp256k1_ecdsa_mul] After 1st dbl, is_inf: " << accumulator.is_point_at_infinity().get_value()
                  << std::endl;

        accumulator = accumulator.dbl();
        std::cout << "[secp256k1_ecdsa_mul] After 2nd dbl, is_inf: " << accumulator.is_point_at_infinity().get_value()
                  << std::endl;

        // u2_hi_wnaf.wnaf[2 * i] is a field_t element (as are the other wnafs).
        // See `stdlib/memory/rom_table.hpp` for how indirect array accesses are implemented in Ultra
        const auto& add_1 = endoP2_table[u2_hi_wnaf.wnaf[2 * i]];
        const auto& add_2 = P2_table[u2_lo_wnaf.wnaf[2 * i + 1]];
        const auto& add_3 = endoP1_table[u1_hi_wnaf.wnaf[i]];
        const auto& add_4 = P1_table[u1_lo_wnaf.wnaf[i]];
        const auto& add_5 = endoP2_table[u2_hi_wnaf.wnaf[2 * i + 1]];
        const auto& add_6 = P2_table[u2_lo_wnaf.wnaf[2 * i + 2]];

        accumulator = accumulator.multiple_montgomery_ladder({ element::chain_add_accumulator(add_1),
                                                               element::chain_add_accumulator(add_2),
                                                               element::chain_add_accumulator(add_3) });
        std::cout << "[secp256k1_ecdsa_mul] After 1st montgomery_ladder (add_1, add_2, add_3), is_inf: "
                  << accumulator.is_point_at_infinity().get_value() << std::endl;

        accumulator = accumulator.multiple_montgomery_ladder({ element::chain_add_accumulator(add_4),
                                                               element::chain_add_accumulator(add_5),
                                                               element::chain_add_accumulator(add_6) });
        std::cout << "[secp256k1_ecdsa_mul] After 2nd montgomery_ladder (add_4, add_5, add_6), is_inf: "
                  << accumulator.is_point_at_infinity().get_value() << std::endl;

        if (accumulator.is_point_at_infinity().get_value()) {
            std::cout << "[secp256k1_ecdsa_mul] *** POINT AT INFINITY DETECTED AT ITERATION " << i << " ***"
                      << std::endl;
        }
    }

    std::cout << "\n[secp256k1_ecdsa_mul] Main loop completed" << std::endl;
    std::cout << "[secp256k1_ecdsa_mul] Accumulator after loop is_inf: "
              << accumulator.is_point_at_infinity().get_value() << std::endl;

    /**
     * Add the final contributions from `u2_hi, u1_lo, u1_hi`
     **/
    std::cout << "\n[secp256k1_ecdsa_mul] Adding stagger fragments..." << std::endl;
    const auto& add_1 = endoP1_table[u1_hi_wnaf.least_significant_wnaf_fragment];
    const auto& add_2 = endoP2_table[u2_hi_wnaf.least_significant_wnaf_fragment];
    const auto& add_3 = P1_table[u1_lo_wnaf.least_significant_wnaf_fragment];

    accumulator += add_1;
    std::cout << "[secp256k1_ecdsa_mul] After adding u1_hi stagger, is_inf: "
              << accumulator.is_point_at_infinity().get_value() << std::endl;

    accumulator += add_2;
    std::cout << "[secp256k1_ecdsa_mul] After adding u2_hi stagger, is_inf: "
              << accumulator.is_point_at_infinity().get_value() << std::endl;

    accumulator += add_3;
    std::cout << "[secp256k1_ecdsa_mul] After adding u1_lo stagger, is_inf: "
              << accumulator.is_point_at_infinity().get_value() << std::endl;

    /**
     * Handle wNAF skew.
     *
     * scalars represented via the non-adjacent form can only be odd. If our scalars are even, we must either
     * add or subtract the relevant base point into the accumulator
     **/
    std::cout << "\n[secp256k1_ecdsa_mul] Handling skew corrections..." << std::endl;
    std::cout << "[secp256k1_ecdsa_mul] u1_lo positive_skew: " << u1_lo_wnaf.positive_skew.get_value()
              << ", negative_skew: " << u1_lo_wnaf.negative_skew.get_value() << std::endl;
    std::cout << "[secp256k1_ecdsa_mul] u1_hi positive_skew: " << u1_hi_wnaf.positive_skew.get_value()
              << ", negative_skew: " << u1_hi_wnaf.negative_skew.get_value() << std::endl;
    std::cout << "[secp256k1_ecdsa_mul] u2_lo positive_skew: " << u2_lo_wnaf.positive_skew.get_value()
              << ", negative_skew: " << u2_lo_wnaf.negative_skew.get_value() << std::endl;
    std::cout << "[secp256k1_ecdsa_mul] u2_hi positive_skew: " << u2_hi_wnaf.positive_skew.get_value()
              << ", negative_skew: " << u2_hi_wnaf.negative_skew.get_value() << std::endl;

    const auto conditional_add = [](const element& accumulator,
                                    const element& base_point,
                                    const bool_ct& positive_skew,
                                    const bool_ct& negative_skew) {
        auto to_add = base_point;
        to_add._y = to_add._y.conditional_negate(negative_skew);
        element result = accumulator + to_add;

        // when computing the wNAF we have already validated that positive_skew and negative_skew cannot both be true
        bool_ct skew_combined = positive_skew ^ negative_skew;
        result = accumulator.conditional_select(result, skew_combined);
        return result;
    };

    accumulator = conditional_add(accumulator, P1, u1_lo_wnaf.positive_skew, u1_lo_wnaf.negative_skew);
    std::cout << "[secp256k1_ecdsa_mul] After u1_lo skew correction, is_inf: "
              << accumulator.is_point_at_infinity().get_value() << std::endl;

    std::cout << "\n[secp256k1_ecdsa_mul] === BEFORE u1_hi skew correction ===" << std::endl;
    std::cout << "[secp256k1_ecdsa_mul] Accumulator X: " << accumulator.x().get_value() << std::endl;
    std::cout << "[secp256k1_ecdsa_mul] Accumulator Y: " << accumulator.y().get_value() << std::endl;
    std::cout << "[secp256k1_ecdsa_mul] Accumulator is_inf: " << accumulator.is_point_at_infinity().get_value()
              << std::endl;
    std::cout << "[secp256k1_ecdsa_mul] u1_hi skew correction point (endoP1_table[128]) X: "
              << endoP1_table[128].x().get_value() << std::endl;
    std::cout << "[secp256k1_ecdsa_mul] u1_hi skew correction point Y: " << endoP1_table[128].y().get_value()
              << std::endl;
    std::cout << "[secp256k1_ecdsa_mul] u1_hi negative_skew (will negate Y): " << u1_hi_wnaf.negative_skew.get_value()
              << std::endl;
    if (u1_hi_wnaf.negative_skew.get_value()) {
        std::cout << "[secp256k1_ecdsa_mul] After negating Y for subtraction: -" << endoP1_table[128].y().get_value()
                  << std::endl;
    }

    accumulator = conditional_add(accumulator, endoP1_table[128], u1_hi_wnaf.positive_skew, u1_hi_wnaf.negative_skew);
    std::cout << "\n[secp256k1_ecdsa_mul] === AFTER u1_hi skew correction ===" << std::endl;
    std::cout << "[secp256k1_ecdsa_mul] Accumulator X: " << accumulator.x().get_value() << std::endl;
    std::cout << "[secp256k1_ecdsa_mul] Accumulator Y: " << accumulator.y().get_value() << std::endl;
    std::cout << "[secp256k1_ecdsa_mul] After u1_hi skew correction, is_inf: "
              << accumulator.is_point_at_infinity().get_value() << std::endl;

    accumulator = conditional_add(accumulator, P2, u2_lo_wnaf.positive_skew, u2_lo_wnaf.negative_skew);
    std::cout << "[secp256k1_ecdsa_mul] After u2_lo skew correction, is_inf: "
              << accumulator.is_point_at_infinity().get_value() << std::endl;

    accumulator = conditional_add(accumulator, endoP2_table[8], u2_hi_wnaf.positive_skew, u2_hi_wnaf.negative_skew);
    std::cout << "[secp256k1_ecdsa_mul] After u2_hi skew correction, is_inf: "
              << accumulator.is_point_at_infinity().get_value() << std::endl;

    std::cout << "\n[secp256k1_ecdsa_mul] === FINAL RESULT ===" << std::endl;
    std::cout << "[secp256k1_ecdsa_mul] Final accumulator X: " << accumulator.x().get_value() << std::endl;
    std::cout << "[secp256k1_ecdsa_mul] Final accumulator Y: " << accumulator.y().get_value() << std::endl;
    std::cout << "[secp256k1_ecdsa_mul] Final accumulator is_point_at_infinity: "
              << accumulator.is_point_at_infinity().get_value() << std::endl;
    std::cout << "[secp256k1_ecdsa_mul] === END ===" << std::endl;

    return accumulator;
}
} // namespace bb::stdlib::element_default

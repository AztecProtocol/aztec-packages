// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Suyash], commit: 553c5eb82901955c638b943065acd3e47fc918c0}
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/stdlib/primitives/biggroup/biggroup.hpp"
#include "barretenberg/stdlib/primitives/memory/twin_rom_table.hpp"
#include "barretenberg/stdlib_circuit_builders/plookup_tables/types.hpp"
namespace bb::stdlib::element_default {

using plookup::MultiTableId;

/**
 * @brief Constructs a ROM table to look up linear combinations of group elements
 *
 * @tparam C
 * @tparam Fq
 * @tparam Fr
 * @tparam G
 * @tparam num_elements
 * @tparam typename
 * @param rom_data the ROM table we are writing into
 * @param limb_max the maximum size of each limb in the ROM table.
 *
 * @details When reading a group element *out* of the ROM table, we must know the maximum value of each coordinate's
 * limbs. We take this value to be the maximum of the maximum values of the input limbs into the table!
 * @return std::array<twin_rom_table<C>, Fq::NUM_LIMBS + 1>
 */
template <typename C, class Fq, class Fr, class G>
template <size_t num_elements>
std::array<twin_rom_table<C>, Fq::NUM_LIMBS + 1> element<C, Fq, Fr, G>::create_group_element_rom_tables(
    const std::array<element, num_elements>& rom_data, std::array<uint256_t, Fq::NUM_LIMBS * 2>& limb_max)
{
    std::vector<std::array<field_ct, 2>> x_lo_limbs;
    std::vector<std::array<field_ct, 2>> x_hi_limbs;
    std::vector<std::array<field_ct, 2>> y_lo_limbs;
    std::vector<std::array<field_ct, 2>> y_hi_limbs;
    std::vector<std::array<field_ct, 2>> prime_limbs;

    for (size_t i = 0; i < num_elements; ++i) {
        limb_max[0] = std::max(limb_max[0], rom_data[i]._x.binary_basis_limbs[0].maximum_value);
        limb_max[1] = std::max(limb_max[1], rom_data[i]._x.binary_basis_limbs[1].maximum_value);
        limb_max[2] = std::max(limb_max[2], rom_data[i]._x.binary_basis_limbs[2].maximum_value);
        limb_max[3] = std::max(limb_max[3], rom_data[i]._x.binary_basis_limbs[3].maximum_value);
        limb_max[4] = std::max(limb_max[4], rom_data[i]._y.binary_basis_limbs[0].maximum_value);
        limb_max[5] = std::max(limb_max[5], rom_data[i]._y.binary_basis_limbs[1].maximum_value);
        limb_max[6] = std::max(limb_max[6], rom_data[i]._y.binary_basis_limbs[2].maximum_value);
        limb_max[7] = std::max(limb_max[7], rom_data[i]._y.binary_basis_limbs[3].maximum_value);

        x_lo_limbs.emplace_back(std::array<field_ct, 2>{ rom_data[i]._x.binary_basis_limbs[0].element,
                                                         rom_data[i]._x.binary_basis_limbs[1].element });
        x_hi_limbs.emplace_back(std::array<field_ct, 2>{ rom_data[i]._x.binary_basis_limbs[2].element,
                                                         rom_data[i]._x.binary_basis_limbs[3].element });
        y_lo_limbs.emplace_back(std::array<field_ct, 2>{ rom_data[i]._y.binary_basis_limbs[0].element,
                                                         rom_data[i]._y.binary_basis_limbs[1].element });
        y_hi_limbs.emplace_back(std::array<field_ct, 2>{ rom_data[i]._y.binary_basis_limbs[2].element,
                                                         rom_data[i]._y.binary_basis_limbs[3].element });
        prime_limbs.emplace_back(
            std::array<field_ct, 2>{ rom_data[i]._x.prime_basis_limb, rom_data[i]._y.prime_basis_limb });
    }
    std::array<twin_rom_table<C>, Fq::NUM_LIMBS + 1> output_tables;
    output_tables[0] = twin_rom_table<C>(x_lo_limbs);
    output_tables[1] = twin_rom_table<C>(x_hi_limbs);
    output_tables[2] = twin_rom_table<C>(y_lo_limbs);
    output_tables[3] = twin_rom_table<C>(y_hi_limbs);
    output_tables[4] = twin_rom_table<C>(prime_limbs);
    return output_tables;
}

template <typename C, class Fq, class Fr, class G>
template <size_t>
element<C, Fq, Fr, G> element<C, Fq, Fr, G>::read_group_element_rom_tables(
    const std::array<twin_rom_table<C>, Fq::NUM_LIMBS + 1>& tables,
    const field_ct& index,
    const std::array<uint256_t, Fq::NUM_LIMBS * 2>& limb_max)
{
    const auto xlo = tables[0][index];
    const auto xhi = tables[1][index];
    const auto ylo = tables[2][index];
    const auto yhi = tables[3][index];
    const auto xyprime = tables[4][index];

    // We assign maximum_value of each limb here, so we can use the unsafe API from element construction
    Fq x_fq = Fq::unsafe_construct_from_limbs(xlo[0], xlo[1], xhi[0], xhi[1], xyprime[0]);
    Fq y_fq = Fq::unsafe_construct_from_limbs(ylo[0], ylo[1], yhi[0], yhi[1], xyprime[1]);
    x_fq.binary_basis_limbs[0].maximum_value = limb_max[0];
    x_fq.binary_basis_limbs[1].maximum_value = limb_max[1];
    x_fq.binary_basis_limbs[2].maximum_value = limb_max[2];
    x_fq.binary_basis_limbs[3].maximum_value = limb_max[3];
    y_fq.binary_basis_limbs[0].maximum_value = limb_max[4];
    y_fq.binary_basis_limbs[1].maximum_value = limb_max[5];
    y_fq.binary_basis_limbs[2].maximum_value = limb_max[6];
    y_fq.binary_basis_limbs[3].maximum_value = limb_max[7];

    // ROM table points are precomputed and known to be valid, skip curve check.
    // Use 4-arg constructor with is_infinity=false (table lookups return valid, non-infinity points).
    const auto output = element(x_fq, y_fq, bool_ct(x_fq.get_context(), false), /*assert_on_curve=*/false);
    return output;
}

template <typename C, class Fq, class Fr, class G>
element<C, Fq, Fr, G>::four_bit_table_plookup::four_bit_table_plookup(const element& input)
{
    element d2 = input.dbl();

    element_table[8] = input;
    for (size_t i = 9; i < 16; ++i) {
        element_table[i] = element_table[i - 1] + d2;
    }
    for (size_t i = 0; i < 8; ++i) {
        element_table[i] = (-element_table[15 - i]);
    }

    coordinates = create_group_element_rom_tables<16>(element_table, limb_max);
}

template <typename C, class Fq, class Fr, class G>
element<C, Fq, Fr, G> element<C, Fq, Fr, G>::four_bit_table_plookup::operator[](const field_ct& index) const
{
    return read_group_element_rom_tables<16>(coordinates, index, limb_max);
}

template <class C, class Fq, class Fr, class G>
element<C, Fq, Fr, G> element<C, Fq, Fr, G>::eight_bit_fixed_base_table::operator[](const field_ct& index) const
{
    const auto get_plookup_tags = [this]() {
        switch (curve_type) {
        case CurveType::SECP256K1: {
            return std::array<MultiTableId, 5>{
                use_endomorphism ? MultiTableId::SECP256K1_XLO_ENDO : MultiTableId::SECP256K1_XLO,
                use_endomorphism ? MultiTableId::SECP256K1_XHI_ENDO : MultiTableId::SECP256K1_XHI,
                MultiTableId::SECP256K1_YLO,
                MultiTableId::SECP256K1_YHI,
                use_endomorphism ? MultiTableId::SECP256K1_XYPRIME_ENDO : MultiTableId::SECP256K1_XYPRIME,
            };
        }
        default: {
            throw_or_abort("eight_bit_fixed_base_table only supports SECP256K1 curve type");
        }
        }
    };

    const auto tags = get_plookup_tags();

    const auto xlo = plookup_read<C>::read_pair_from_table(tags[0], index);
    const auto xhi = plookup_read<C>::read_pair_from_table(tags[1], index);
    const auto ylo = plookup_read<C>::read_pair_from_table(tags[2], index);
    const auto yhi = plookup_read<C>::read_pair_from_table(tags[3], index);
    const auto xyprime = plookup_read<C>::read_pair_from_table(tags[4], index);

    // All the elements are precomputed constants so they are completely reduced, so the default maximum limb values are
    // appropriate
    Fq x = Fq::unsafe_construct_from_limbs(xlo.first, xlo.second, xhi.first, xhi.second, xyprime.first);
    Fq y = Fq::unsafe_construct_from_limbs(ylo.first, ylo.second, yhi.first, yhi.second, xyprime.second);

    if (use_endomorphism) {
        y = -y;
    }

    // Points from precomputed tables are known to be on the curve.
    // Use 4-arg constructor with is_infinity=false (table lookups return valid, non-infinity points).
    return element(x, y, bool_ct(x.get_context(), false), /*assert_on_curve=*/false);
}

template <typename C, class Fq, class Fr, class G>
element<C, Fq, Fr, G> element<C, Fq, Fr, G>::eight_bit_fixed_base_table::operator[](const size_t index) const
{
    return operator[](field_ct(index));
}

/**
 * lookup_table_plookup
 **/
template <typename C, class Fq, class Fr, class G>
template <size_t length>
element<C, Fq, Fr, G>::lookup_table_plookup<length>::lookup_table_plookup(const std::array<element, length>& inputs)
{
    static_assert(length <= 6, "lookup_table_plookup only supports up to 6 input elements");

    if constexpr (length == 2) {
        auto [A0, A1] = inputs[1].checked_unconditional_add_sub(inputs[0]);
        element_table[0] = A0;
        element_table[1] = A1;
    } else if constexpr (length == 3) {
        auto [R0, R1] = inputs[1].checked_unconditional_add_sub(inputs[0]); // B ± A

        auto [T0, T1] = inputs[2].checked_unconditional_add_sub(R0); // C ± (B + A)
        auto [T2, T3] = inputs[2].checked_unconditional_add_sub(R1); // C ± (B - A)

        element_table[0] = T0;
        element_table[1] = T2;
        element_table[2] = T3;
        element_table[3] = T1;
    } else if constexpr (length == 4) {
        auto [T0, T1] = inputs[1].checked_unconditional_add_sub(inputs[0]); // B ± A
        auto [T2, T3] = inputs[3].checked_unconditional_add_sub(inputs[2]); // D ± C

        auto [F0, F3] = T2.checked_unconditional_add_sub(T0); // (D + C) ± (B + A)
        auto [F1, F2] = T2.checked_unconditional_add_sub(T1); // (D + C) ± (B - A)
        auto [F4, F7] = T3.checked_unconditional_add_sub(T0); // (D - C) ± (B + A)
        auto [F5, F6] = T3.checked_unconditional_add_sub(T1); // (D - C) ± (B - A)

        element_table[0] = F0;
        element_table[1] = F1;
        element_table[2] = F2;
        element_table[3] = F3;
        element_table[4] = F4;
        element_table[5] = F5;
        element_table[6] = F6;
        element_table[7] = F7;
    } else if constexpr (length == 5) {
        auto [A0, A1] = inputs[1].checked_unconditional_add_sub(inputs[0]); // B ± A
        auto [T2, T3] = inputs[3].checked_unconditional_add_sub(inputs[2]); // D ± C

        auto [E0, E3] = inputs[4].checked_unconditional_add_sub(T2); // E ± (D + C)
        auto [E1, E2] = inputs[4].checked_unconditional_add_sub(T3); // E ± (D - C)

        auto [F0, F3] = E0.checked_unconditional_add_sub(A0);   // E + (D + C) ± (B + A)
        auto [F1, F2] = E0.checked_unconditional_add_sub(A1);   // E + (D + C) ± (B - A)
        auto [F4, F7] = E1.checked_unconditional_add_sub(A0);   // E + (D - C) ± (B + A)
        auto [F5, F6] = E1.checked_unconditional_add_sub(A1);   // E + (D - C) ± (B - A)
        auto [F8, F11] = E2.checked_unconditional_add_sub(A0);  // E - (D - C) ± (B + A)
        auto [F9, F10] = E2.checked_unconditional_add_sub(A1);  // E - (D - C) ± (B - A)
        auto [F12, F15] = E3.checked_unconditional_add_sub(A0); // E - (D + C) ± (B + A)
        auto [F13, F14] = E3.checked_unconditional_add_sub(A1); // E - (D + C) ± (B - A)

        element_table[0] = F0;
        element_table[1] = F1;
        element_table[2] = F2;
        element_table[3] = F3;
        element_table[4] = F4;
        element_table[5] = F5;
        element_table[6] = F6;
        element_table[7] = F7;
        element_table[8] = F8;
        element_table[9] = F9;
        element_table[10] = F10;
        element_table[11] = F11;
        element_table[12] = F12;
        element_table[13] = F13;
        element_table[14] = F14;
        element_table[15] = F15;
    } else if constexpr (length == 6) {
        // 44 adds! Only use this if it saves us adding another table to a multi-scalar-multiplication

        auto [A0, A1] = inputs[1].checked_unconditional_add_sub(inputs[0]);
        auto [E0, E1] = inputs[4].checked_unconditional_add_sub(inputs[3]);
        auto [C0, C3] = inputs[2].checked_unconditional_add_sub(A0);
        auto [C1, C2] = inputs[2].checked_unconditional_add_sub(A1);

        auto [F0, F3] = inputs[5].checked_unconditional_add_sub(E0);
        auto [F1, F2] = inputs[5].checked_unconditional_add_sub(E1);

        auto [R0, R7] = F0.checked_unconditional_add_sub(C0);
        auto [R1, R6] = F0.checked_unconditional_add_sub(C1);
        auto [R2, R5] = F0.checked_unconditional_add_sub(C2);
        auto [R3, R4] = F0.checked_unconditional_add_sub(C3);

        auto [S0, S7] = F1.checked_unconditional_add_sub(C0);
        auto [S1, S6] = F1.checked_unconditional_add_sub(C1);
        auto [S2, S5] = F1.checked_unconditional_add_sub(C2);
        auto [S3, S4] = F1.checked_unconditional_add_sub(C3);

        auto [U0, U7] = F2.checked_unconditional_add_sub(C0);
        auto [U1, U6] = F2.checked_unconditional_add_sub(C1);
        auto [U2, U5] = F2.checked_unconditional_add_sub(C2);
        auto [U3, U4] = F2.checked_unconditional_add_sub(C3);

        auto [W0, W7] = F3.checked_unconditional_add_sub(C0);
        auto [W1, W6] = F3.checked_unconditional_add_sub(C1);
        auto [W2, W5] = F3.checked_unconditional_add_sub(C2);
        auto [W3, W4] = F3.checked_unconditional_add_sub(C3);

        element_table[0] = R0;
        element_table[1] = R1;
        element_table[2] = R2;
        element_table[3] = R3;
        element_table[4] = R4;
        element_table[5] = R5;
        element_table[6] = R6;
        element_table[7] = R7;

        element_table[8] = S0;
        element_table[9] = S1;
        element_table[10] = S2;
        element_table[11] = S3;
        element_table[12] = S4;
        element_table[13] = S5;
        element_table[14] = S6;
        element_table[15] = S7;

        element_table[16] = U0;
        element_table[17] = U1;
        element_table[18] = U2;
        element_table[19] = U3;
        element_table[20] = U4;
        element_table[21] = U5;
        element_table[22] = U6;
        element_table[23] = U7;

        element_table[24] = W0;
        element_table[25] = W1;
        element_table[26] = W2;
        element_table[27] = W3;
        element_table[28] = W4;
        element_table[29] = W5;
        element_table[30] = W6;
        element_table[31] = W7;
    }
    for (size_t i = 0; i < table_size / 2; ++i) {
        element_table[i + (table_size / 2)] = (-element_table[(table_size / 2) - 1 - i]);
    }
    coordinates = create_group_element_rom_tables<table_size>(element_table, limb_max);
}

template <typename C, class Fq, class Fr, class G>
template <size_t length>
element<C, Fq, Fr, G> element<C, Fq, Fr, G>::lookup_table_plookup<length>::get(
    const std::array<bool_ct, length>& bits) const
{
    std::vector<field_ct> accumulators;
    for (size_t i = 0; i < length; ++i) {
        accumulators.emplace_back(field_ct(bits[i]) * (1ULL << i));
    }
    field_ct index = field_ct::accumulate(accumulators);
    return read_group_element_rom_tables<table_size>(coordinates, index, limb_max);
}

/**
 * @brief Create a endo pair four bit table for the given group element
 *
 * @tparam C
 * @tparam Fq
 * @tparam Fr
 * @tparam G
 * @param input
 * @return std::pair<four_bit_table_plookup, four_bit_table_plookup>
 *
 * @details
 *
 * | Index | P = (x, y) | Q = (β.x, y) |
 * |-------|------------|---------------|
 * | 0     | -15.P      | Q_0           |
 * | 1     | -13.P      | Q_1           |
 * | 2     | -11.P      | Q_2           |
 * | 3     | -9.P       | Q_3           |
 * | 4     | -7.P       | Q_4           |
 * | 5     | -5.P       | Q_5           |
 * | 6     | -3.P       | Q_6           |
 * | 7     | -1.P       | Q_7           |
 * | 8     | 1.P        | Q_8           |
 * | 9     | 3.P        | Q_9           |
 * | 10    | 5.P        | Q_10          |
 * | 11    | 7.P        | Q_11          |
 * | 12    | 9.P        | Q_12          |
 * | 13    | 11.P       | Q_13          |
 * | 14    | 13.P       | Q_14          |
 * | 15    | 15.P       | Q_15          |
 */
template <typename C, class Fq, class Fr, class G>
std::pair<typename element<C, Fq, Fr, G>::four_bit_table_plookup,
          typename element<C, Fq, Fr, G>::four_bit_table_plookup>
element<C, Fq, Fr, G>::create_endo_pair_four_bit_table_plookup(const element& input)
{
    four_bit_table_plookup P1;
    four_bit_table_plookup endoP1;
    element d2 = input.dbl();

    P1.element_table[8] = input;
    for (size_t i = 9; i < 16; ++i) {
        P1.element_table[i] = P1.element_table[i - 1] + d2;
    }
    for (size_t i = 0; i < 8; ++i) {
        P1.element_table[i] = (-P1.element_table[15 - i]);
    }
    for (size_t i = 0; i < 16; ++i) {
        endoP1.element_table[i]._y = P1.element_table[15 - i]._y;
    }
    uint256_t beta_val = bb::field<typename Fq::TParams>::cube_root_of_unity();
    Fq beta(bb::fr(beta_val.slice(0, 136)), bb::fr(beta_val.slice(136, 256)));
    for (size_t i = 0; i < 8; ++i) {
        endoP1.element_table[i]._x = P1.element_table[i]._x * beta;
        endoP1.element_table[15 - i]._x = endoP1.element_table[i]._x;
    }
    P1.coordinates = create_group_element_rom_tables<16>(P1.element_table, P1.limb_max);
    endoP1.coordinates = create_group_element_rom_tables<16>(endoP1.element_table, endoP1.limb_max);
    auto result = std::make_pair(four_bit_table_plookup(P1), four_bit_table_plookup(endoP1));
    return result;
}

/**
 * @brief Construct a fixed plookup table for k constant group elements.
 * @details Precomputes all 2^k sign-combinations natively, decomposes into 68-bit limb pairs,
 *          and registers 5 dynamic BasicTables (xlo, xhi, ylo, yhi, xyprime).
 *
 * Table layout: entry[i] = Σ_j sign_j * P_j, where sign_j = (bit j of i == 0) ? +1 : -1.
 * Built iteratively: after processing point j, the table doubles in size.
 */
template <typename C, class Fq, class Fr, class G>
element<C, Fq, Fr, G>::fixed_group_table::fixed_group_table(Builder* builder, const std::vector<element>& points)
    : num_points(points.size())
    , ctx(builder)
{
    BB_ASSERT(num_points > 0);
    for (const auto& p : points) {
        BB_ASSERT(p.is_fixed(), "biggroup: fixed_group_table requires constant or fixed-witness points as input");
    }

    const size_t table_size = 1ULL << num_points;

    // 1. Extract native affine points
    using NativeAffineElement = typename G::affine_element;
    using NativeElement = typename G::element;
    std::vector<NativeAffineElement> native_points(num_points);
    for (size_t i = 0; i < num_points; ++i) {
        native_points[i] = points[i].get_value();
    }

    // 2. Build all 2^k sign-combinations iteratively in projective coordinates.
    //    After processing point j, entries 0..2^j-1 include +P_j, entries 2^j..2^(j+1)-1 include -P_j.
    std::vector<NativeElement> projective_table;
    projective_table.reserve(table_size);
    projective_table.push_back(NativeElement(native_points[0]));  // index 0: +P_0
    projective_table.push_back(-NativeElement(native_points[0])); // index 1: -P_0

    for (size_t j = 1; j < num_points; ++j) {
        const NativeElement pj(native_points[j]);
        const size_t current_size = projective_table.size();
        // First, create new entries (bit j = 1 → subtract P_j)
        for (size_t i = 0; i < current_size; ++i) {
            projective_table.push_back(projective_table[i] - pj);
        }
        // Then add P_j to existing entries (bit j = 0 → add P_j)
        for (size_t i = 0; i < current_size; ++i) {
            projective_table[i] = projective_table[i] + pj;
        }
    }

    // 3. Batch convert to affine
    std::vector<NativeAffineElement> affine_table(table_size);
    // Use batch_normalize: convert projective → affine efficiently
    std::vector<NativeElement> proj_copy(projective_table.begin(), projective_table.end());
    NativeElement::batch_normalize(&proj_copy[0], table_size);
    for (size_t i = 0; i < table_size; ++i) {
        affine_table[i] = NativeAffineElement(proj_copy[i].x, proj_copy[i].y);
    }

    // 4. Decompose each affine point into 68-bit limb pairs and build 5 BasicTables.
    //    Each BasicTable has columns: (index, limb_lo, limb_hi) for one coordinate component.
    constexpr uint64_t NUM_LIMB_BITS = Fq::NUM_LIMB_BITS;
    constexpr uint64_t TOTAL_BITS = NUM_LIMB_BITS * 2; // 136 bits per limb pair

    // Component order: xlo, xhi, ylo, yhi, xyprime
    // xlo = (x_limb0, x_limb1), xhi = (x_limb2, x_limb3), ylo = (y_limb0, y_limb1), yhi = (y_limb2, y_limb3)
    // xyprime = (x_prime_basis, y_prime_basis) where prime_basis = x mod native_modulus

    // Helper: given a uint256_t coordinate, extract the j-th limb pair as (lo, hi) field elements
    auto extract_limb_pair = [](const uint256_t& coord, size_t pair_idx) -> std::pair<bb::fr, bb::fr> {
        const uint64_t shift = pair_idx * NUM_LIMB_BITS * 2;
        const uint256_t lo = coord.slice(shift, shift + NUM_LIMB_BITS);
        const uint256_t hi = coord.slice(shift + NUM_LIMB_BITS, shift + TOTAL_BITS);
        return { bb::fr(lo), bb::fr(hi) };
    };

    // Track max limb values for safe Fq reconstruction
    for (auto& m : limb_max) {
        m = 0;
    }

    // Build the 5 BasicTables
    std::array<plookup::BasicTable, 5> basic_tables;
    for (size_t t = 0; t < 5; ++t) {
        basic_tables[t].id = plookup::BasicTableId::DYNAMIC_TABLE;
        basic_tables[t].use_twin_keys = false;
        basic_tables[t].column_1_step_size = 0;
        basic_tables[t].column_2_step_size = 0;
        basic_tables[t].column_3_step_size = 0;
        basic_tables[t].get_values_from_key = nullptr; // Not used for dynamic tables with direct ReadData
        basic_tables[t].column_1.reserve(table_size);
        basic_tables[t].column_2.reserve(table_size);
        basic_tables[t].column_3.reserve(table_size);
    }

    for (size_t i = 0; i < table_size; ++i) {
        const uint256_t x_val(affine_table[i].x);
        const uint256_t y_val(affine_table[i].y);

        // xlo pair (limbs 0,1), xhi pair (limbs 2,3), ylo pair (limbs 0,1), yhi pair (limbs 2,3)
        auto [xlo_0, xlo_1] = extract_limb_pair(x_val, 0);
        auto [xhi_0, xhi_1] = extract_limb_pair(x_val, 1);
        auto [ylo_0, ylo_1] = extract_limb_pair(y_val, 0);
        auto [yhi_0, yhi_1] = extract_limb_pair(y_val, 1);

        // Prime basis limbs: coordinate mod native field modulus
        bb::fr x_prime = bb::fr(x_val);
        bb::fr y_prime = bb::fr(y_val);

        // Track max limb values
        limb_max[0] = std::max(limb_max[0], uint256_t(xlo_0));
        limb_max[1] = std::max(limb_max[1], uint256_t(xlo_1));
        limb_max[2] = std::max(limb_max[2], uint256_t(xhi_0));
        limb_max[3] = std::max(limb_max[3], uint256_t(xhi_1));
        limb_max[4] = std::max(limb_max[4], uint256_t(ylo_0));
        limb_max[5] = std::max(limb_max[5], uint256_t(ylo_1));
        limb_max[6] = std::max(limb_max[6], uint256_t(yhi_0));
        limb_max[7] = std::max(limb_max[7], uint256_t(yhi_1));

        const bb::fr key(i);
        // Table 0: xlo (key, xlo_0, xlo_1)
        basic_tables[0].column_1.push_back(key);
        basic_tables[0].column_2.push_back(xlo_0);
        basic_tables[0].column_3.push_back(xlo_1);
        // Table 1: xhi
        basic_tables[1].column_1.push_back(key);
        basic_tables[1].column_2.push_back(xhi_0);
        basic_tables[1].column_3.push_back(xhi_1);
        // Table 2: ylo
        basic_tables[2].column_1.push_back(key);
        basic_tables[2].column_2.push_back(ylo_0);
        basic_tables[2].column_3.push_back(ylo_1);
        // Table 3: yhi
        basic_tables[3].column_1.push_back(key);
        basic_tables[3].column_2.push_back(yhi_0);
        basic_tables[3].column_3.push_back(yhi_1);
        // Table 4: xyprime
        basic_tables[4].column_1.push_back(key);
        basic_tables[4].column_2.push_back(x_prime);
        basic_tables[4].column_3.push_back(y_prime);
    }

    // 5. Register BasicTables and build MultiTables
    for (size_t t = 0; t < 5; ++t) {
        const size_t idx = ctx->register_basic_table(std::move(basic_tables[t]));
        // Single-slice MultiTable: coefficients = {1}, one lookup per read
        multi_tables[t] = plookup::MultiTable({ bb::fr(1) }, { bb::fr(1) }, { bb::fr(1) });
        multi_tables[t].slice_sizes = { table_size };
        multi_tables[t].basic_table_indices = { idx };
        // get_table_values not needed — we construct ReadData directly in get()
        multi_tables[t].get_table_values = {};
    }
}

/**
 * @brief Look up the group element corresponding to k NAF bits.
 * @details Computes index = Σ bit_j * 2^j, performs 5 plookup reads, reconstructs Fq coordinates.
 */
template <typename C, class Fq, class Fr, class G>
element<C, Fq, Fr, G> element<C, Fq, Fr, G>::fixed_group_table::get(const std::vector<bool_ct>& naf_bits) const
{
    BB_ASSERT(naf_bits.size() == num_points);

    // Compute witness index from NAF bits
    std::vector<field_ct> accumulators;
    for (size_t i = 0; i < num_points; ++i) {
        accumulators.emplace_back(field_ct(naf_bits[i]) * (1ULL << i));
    }
    field_ct index = field_ct::accumulate(accumulators);

    // Helper: perform a single-slice plookup read from a dynamic table.
    // Since our MultiTable has get_table_values = {}, we manually construct ReadData
    // by looking up values from the builder's registered BasicTable.
    auto read_pair = [this](const plookup::MultiTable& mt, const field_ct& key) -> std::pair<field_ct, field_ct> {
        using ColumnIdx = plookup::ColumnIdx;

        // Get the key's native value to look up the result
        const bb::fr key_val = key.get_value();
        const size_t key_idx = static_cast<size_t>(static_cast<uint64_t>(uint256_t(key_val)));

        // Look up values from the builder's registered BasicTable
        const size_t table_idx = mt.basic_table_indices[0];
        const auto& basic_table = ctx->get_lookup_tables()[table_idx];
        const bb::fr val_c2 = basic_table.column_2[key_idx];
        const bb::fr val_c3 = basic_table.column_3[key_idx];

        // Construct ReadData for a single-slice lookup
        plookup::ReadData<bb::fr> lookup_data;
        lookup_data[ColumnIdx::C1].push_back(key_val);
        lookup_data[ColumnIdx::C2].push_back(val_c2);
        lookup_data[ColumnIdx::C3].push_back(val_c3);
        lookup_data.lookup_entries.push_back(
            { { uint256_t(key_val).data[0], 0 }, { val_c2, val_c3 } });

        // Create gates if key is a witness, else return constants
        if (key.is_constant()) {
            return { field_ct(ctx, val_c2), field_ct(ctx, val_c3) };
        }

        // Create lookup gate using builder
        const auto result_indices =
            ctx->create_gates_from_plookup_accumulators(mt, lookup_data, key.get_witness_index());

        return { field_ct::from_witness_index(ctx, result_indices[ColumnIdx::C2][0]),
                 field_ct::from_witness_index(ctx, result_indices[ColumnIdx::C3][0]) };
    };

    // Perform 5 plookup reads
    const auto [xlo_0, xlo_1] = read_pair(multi_tables[0], index);
    const auto [xhi_0, xhi_1] = read_pair(multi_tables[1], index);
    const auto [ylo_0, ylo_1] = read_pair(multi_tables[2], index);
    const auto [yhi_0, yhi_1] = read_pair(multi_tables[3], index);
    const auto [xprime, yprime] = read_pair(multi_tables[4], index);

    // Reconstruct Fq elements from limbs (using unsafe constructor — table entries are known valid)
    Fq x_fq = Fq::unsafe_construct_from_limbs(xlo_0, xlo_1, xhi_0, xhi_1, xprime);
    Fq y_fq = Fq::unsafe_construct_from_limbs(ylo_0, ylo_1, yhi_0, yhi_1, yprime);
    x_fq.binary_basis_limbs[0].maximum_value = limb_max[0];
    x_fq.binary_basis_limbs[1].maximum_value = limb_max[1];
    x_fq.binary_basis_limbs[2].maximum_value = limb_max[2];
    x_fq.binary_basis_limbs[3].maximum_value = limb_max[3];
    y_fq.binary_basis_limbs[0].maximum_value = limb_max[4];
    y_fq.binary_basis_limbs[1].maximum_value = limb_max[5];
    y_fq.binary_basis_limbs[2].maximum_value = limb_max[6];
    y_fq.binary_basis_limbs[3].maximum_value = limb_max[7];

    return element(x_fq, y_fq, bool_ct(ctx, false), /*assert_on_curve=*/false);
}

/**
 * @brief Same as get() but returns a chain_add_accumulator for efficient multi-table accumulation.
 */
template <typename C, class Fq, class Fr, class G>
typename element<C, Fq, Fr, G>::chain_add_accumulator element<C, Fq, Fr, G>::fixed_group_table::get_chain_accumulator(
    const std::vector<bool_ct>& naf_bits) const
{
    return chain_add_accumulator(get(naf_bits));
}

} // namespace bb::stdlib::element_default

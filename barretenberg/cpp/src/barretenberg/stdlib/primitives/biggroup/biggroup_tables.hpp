// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
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
    std::vector<std::array<field_t<C>, 2>> x_lo_limbs;
    std::vector<std::array<field_t<C>, 2>> x_hi_limbs;
    std::vector<std::array<field_t<C>, 2>> y_lo_limbs;
    std::vector<std::array<field_t<C>, 2>> y_hi_limbs;
    std::vector<std::array<field_t<C>, 2>> prime_limbs;

    for (size_t i = 0; i < num_elements; ++i) {
        limb_max[0] = std::max(limb_max[0], rom_data[i].x.binary_basis_limbs[0].maximum_value);
        limb_max[1] = std::max(limb_max[1], rom_data[i].x.binary_basis_limbs[1].maximum_value);
        limb_max[2] = std::max(limb_max[2], rom_data[i].x.binary_basis_limbs[2].maximum_value);
        limb_max[3] = std::max(limb_max[3], rom_data[i].x.binary_basis_limbs[3].maximum_value);
        limb_max[4] = std::max(limb_max[4], rom_data[i].y.binary_basis_limbs[0].maximum_value);
        limb_max[5] = std::max(limb_max[5], rom_data[i].y.binary_basis_limbs[1].maximum_value);
        limb_max[6] = std::max(limb_max[6], rom_data[i].y.binary_basis_limbs[2].maximum_value);
        limb_max[7] = std::max(limb_max[7], rom_data[i].y.binary_basis_limbs[3].maximum_value);

        x_lo_limbs.emplace_back(std::array<field_t<C>, 2>{ rom_data[i].x.binary_basis_limbs[0].element,
                                                           rom_data[i].x.binary_basis_limbs[1].element });
        x_hi_limbs.emplace_back(std::array<field_t<C>, 2>{ rom_data[i].x.binary_basis_limbs[2].element,
                                                           rom_data[i].x.binary_basis_limbs[3].element });
        y_lo_limbs.emplace_back(std::array<field_t<C>, 2>{ rom_data[i].y.binary_basis_limbs[0].element,
                                                           rom_data[i].y.binary_basis_limbs[1].element });
        y_hi_limbs.emplace_back(std::array<field_t<C>, 2>{ rom_data[i].y.binary_basis_limbs[2].element,
                                                           rom_data[i].y.binary_basis_limbs[3].element });
        prime_limbs.emplace_back(
            std::array<field_t<C>, 2>{ rom_data[i].x.prime_basis_limb, rom_data[i].y.prime_basis_limb });
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
    const field_t<C>& index,
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

    const auto output = element(x_fq, y_fq);
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
element<C, Fq, Fr, G> element<C, Fq, Fr, G>::four_bit_table_plookup::operator[](const field_t<C>& index) const
{
    return read_group_element_rom_tables<16>(coordinates, index, limb_max);
}

template <class C, class Fq, class Fr, class G>
element<C, Fq, Fr, G> element<C, Fq, Fr, G>::eight_bit_fixed_base_table::operator[](const field_t<C>& index) const
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
        case CurveType::BN254: {
            return std::array<MultiTableId, 5>{
                use_endomorphism ? MultiTableId::BN254_XLO_ENDO : MultiTableId::BN254_XLO,
                use_endomorphism ? MultiTableId::BN254_XHI_ENDO : MultiTableId::BN254_XHI,
                MultiTableId::BN254_YLO,
                MultiTableId::BN254_YHI,
                use_endomorphism ? MultiTableId::BN254_XYPRIME_ENDO : MultiTableId::BN254_XYPRIME,
            };
        }
        default: {
            return std::array<MultiTableId, 5>{
                use_endomorphism ? MultiTableId::BN254_XLO_ENDO : MultiTableId::BN254_XLO,
                use_endomorphism ? MultiTableId::BN254_XHI_ENDO : MultiTableId::BN254_XHI,
                MultiTableId::BN254_YLO,
                MultiTableId::BN254_YHI,
                use_endomorphism ? MultiTableId::BN254_XYPRIME_ENDO : MultiTableId::BN254_XYPRIME,
            };
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

    return element(x, y);
}

template <typename C, class Fq, class Fr, class G>
element<C, Fq, Fr, G> element<C, Fq, Fr, G>::eight_bit_fixed_base_table::operator[](const size_t index) const
{
    return operator[](field_t<C>(index));
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
    std::vector<field_t<C>> accumulators;
    for (size_t i = 0; i < length; ++i) {
        accumulators.emplace_back(field_t<C>(bits[i]) * (1ULL << i));
    }
    field_t<C> index = field_t<C>::accumulate(accumulators);
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
        endoP1.element_table[i].y = P1.element_table[15 - i].y;
    }
    uint256_t beta_val = bb::field<typename Fq::TParams>::cube_root_of_unity();
    Fq beta(bb::fr(beta_val.slice(0, 136)), bb::fr(beta_val.slice(136, 256)));
    for (size_t i = 0; i < 8; ++i) {
        endoP1.element_table[i].x = P1.element_table[i].x * beta;
        endoP1.element_table[15 - i].x = endoP1.element_table[i].x;
    }
    P1.coordinates = create_group_element_rom_tables<16>(P1.element_table, P1.limb_max);
    endoP1.coordinates = create_group_element_rom_tables<16>(endoP1.element_table, endoP1.limb_max);
    auto result = std::make_pair(four_bit_table_plookup(P1), four_bit_table_plookup(endoP1));
    return result;
}

} // namespace bb::stdlib::element_default

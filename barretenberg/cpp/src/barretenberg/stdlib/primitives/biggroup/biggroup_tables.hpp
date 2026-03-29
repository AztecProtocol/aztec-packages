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
    static_assert(length <= 7, "lookup_table_plookup only supports up to 7 input elements");

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
    } else if constexpr (length == 7) {
        // 82 adds (41 add_sub ops). Split inputs as (3-point)+(4-point), build subtables, cross-combine.
        //
        // Index encoding: index = bits[6]*64 + bits[5]*32 + bits[4]*16 + bits[3]*8 + bits[2]*4 + bits[1]*2 + bits[0]
        // Convention: bit[i]=0 → +inputs[i],  bit[i]=1 → -inputs[i]
        // First 64 entries (bit[6]=0): inputs[6] positive.  Upper 64 filled by negation loop.
        //
        // 3-point subtable for inputs[0,1,2] → C0..C3 (bits[2..0] ∈ {000,001,010,011})
        // C4=-C3, C5=-C2, C6=-C1, C7=-C0  (used implicitly via the cross-product pairing below)
        auto [R0, R1] = inputs[1].checked_unconditional_add_sub(inputs[0]); // R0=A+B, R1=A-B
        auto [C0, C3] = inputs[2].checked_unconditional_add_sub(R0);        // C0=+A+B+C, C3=-A-B+C
        auto [C1, C2] = inputs[2].checked_unconditional_add_sub(R1);        // C1=-A+B+C, C2=+A-B+C

        // 4-point subtable for inputs[3..6] → D0..D7 (bits[6..3] with bit[6]=0)
        auto [T0, T1] = inputs[4].checked_unconditional_add_sub(inputs[3]); // T0=D+E, T1=D-E
        auto [T2, T3] = inputs[6].checked_unconditional_add_sub(inputs[5]); // T2=F+G, T3=F-G
        auto [D0, D3] = T2.checked_unconditional_add_sub(T0);               // D0=+D+E+F+G, D3=-D-E+F+G
        auto [D1, D2] = T2.checked_unconditional_add_sub(T1);               // D1=-D+E+F+G, D2=+D-E+F+G
        auto [D4, D7] = T3.checked_unconditional_add_sub(T0);               // D4=+D+E-F+G, D7=-D-E-F+G
        auto [D5, D6] = T3.checked_unconditional_add_sub(T1);               // D5=-D+E-F+G, D6=+D-E-F+G

        // Cross-combine: each D_d ± C{0,1,2,3} covers indices [8*d..8*d+7]
        // D_d + C0 → index 8*d+0,  D_d - C0 → index 8*d+7  (since -C0 = C7)
        // D_d + C1 → index 8*d+1,  D_d - C1 → index 8*d+6  (since -C1 = C6)
        // D_d + C2 → index 8*d+2,  D_d - C2 → index 8*d+5  (since -C2 = C5)
        // D_d + C3 → index 8*d+3,  D_d - C3 → index 8*d+4  (since -C3 = C4)
        auto [E00, E07] = D0.checked_unconditional_add_sub(C0);
        auto [E01, E06] = D0.checked_unconditional_add_sub(C1);
        auto [E02, E05] = D0.checked_unconditional_add_sub(C2);
        auto [E03, E04] = D0.checked_unconditional_add_sub(C3);

        auto [E10, E17] = D1.checked_unconditional_add_sub(C0);
        auto [E11, E16] = D1.checked_unconditional_add_sub(C1);
        auto [E12, E15] = D1.checked_unconditional_add_sub(C2);
        auto [E13, E14] = D1.checked_unconditional_add_sub(C3);

        auto [E20, E27] = D2.checked_unconditional_add_sub(C0);
        auto [E21, E26] = D2.checked_unconditional_add_sub(C1);
        auto [E22, E25] = D2.checked_unconditional_add_sub(C2);
        auto [E23, E24] = D2.checked_unconditional_add_sub(C3);

        auto [E30, E37] = D3.checked_unconditional_add_sub(C0);
        auto [E31, E36] = D3.checked_unconditional_add_sub(C1);
        auto [E32, E35] = D3.checked_unconditional_add_sub(C2);
        auto [E33, E34] = D3.checked_unconditional_add_sub(C3);

        auto [E40, E47] = D4.checked_unconditional_add_sub(C0);
        auto [E41, E46] = D4.checked_unconditional_add_sub(C1);
        auto [E42, E45] = D4.checked_unconditional_add_sub(C2);
        auto [E43, E44] = D4.checked_unconditional_add_sub(C3);

        auto [E50, E57] = D5.checked_unconditional_add_sub(C0);
        auto [E51, E56] = D5.checked_unconditional_add_sub(C1);
        auto [E52, E55] = D5.checked_unconditional_add_sub(C2);
        auto [E53, E54] = D5.checked_unconditional_add_sub(C3);

        auto [E60, E67] = D6.checked_unconditional_add_sub(C0);
        auto [E61, E66] = D6.checked_unconditional_add_sub(C1);
        auto [E62, E65] = D6.checked_unconditional_add_sub(C2);
        auto [E63, E64] = D6.checked_unconditional_add_sub(C3);

        auto [E70, E77] = D7.checked_unconditional_add_sub(C0);
        auto [E71, E76] = D7.checked_unconditional_add_sub(C1);
        auto [E72, E75] = D7.checked_unconditional_add_sub(C2);
        auto [E73, E74] = D7.checked_unconditional_add_sub(C3);

        element_table[0] = E00;
        element_table[1] = E01;
        element_table[2] = E02;
        element_table[3] = E03;
        element_table[4] = E04;
        element_table[5] = E05;
        element_table[6] = E06;
        element_table[7] = E07;
        element_table[8] = E10;
        element_table[9] = E11;
        element_table[10] = E12;
        element_table[11] = E13;
        element_table[12] = E14;
        element_table[13] = E15;
        element_table[14] = E16;
        element_table[15] = E17;
        element_table[16] = E20;
        element_table[17] = E21;
        element_table[18] = E22;
        element_table[19] = E23;
        element_table[20] = E24;
        element_table[21] = E25;
        element_table[22] = E26;
        element_table[23] = E27;
        element_table[24] = E30;
        element_table[25] = E31;
        element_table[26] = E32;
        element_table[27] = E33;
        element_table[28] = E34;
        element_table[29] = E35;
        element_table[30] = E36;
        element_table[31] = E37;
        element_table[32] = E40;
        element_table[33] = E41;
        element_table[34] = E42;
        element_table[35] = E43;
        element_table[36] = E44;
        element_table[37] = E45;
        element_table[38] = E46;
        element_table[39] = E47;
        element_table[40] = E50;
        element_table[41] = E51;
        element_table[42] = E52;
        element_table[43] = E53;
        element_table[44] = E54;
        element_table[45] = E55;
        element_table[46] = E56;
        element_table[47] = E57;
        element_table[48] = E60;
        element_table[49] = E61;
        element_table[50] = E62;
        element_table[51] = E63;
        element_table[52] = E64;
        element_table[53] = E65;
        element_table[54] = E66;
        element_table[55] = E67;
        element_table[56] = E70;
        element_table[57] = E71;
        element_table[58] = E72;
        element_table[59] = E73;
        element_table[60] = E74;
        element_table[61] = E75;
        element_table[62] = E76;
        element_table[63] = E77;
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

} // namespace bb::stdlib::element_default

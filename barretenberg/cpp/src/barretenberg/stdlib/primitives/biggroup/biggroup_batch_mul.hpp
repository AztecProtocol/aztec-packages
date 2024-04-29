#pragma once

#include "barretenberg/stdlib/primitives/biggroup/biggroup.hpp"
#include <cstddef>
namespace bb::stdlib {

/**
 * only works for Plookup (otherwise falls back on batch_mul)! Multiscalar multiplication that utilizes 4-bit wNAF
 * lookup tables is more efficient than points-as-linear-combinations lookup tables, if the number of points is 3 or
 * fewer
 * TODO: when we nuke standard and turbo plonk we should remove the fallback batch mul method!
 */
template <typename C, class Fq, class Fr, class G>
template <size_t max_num_bits>
element<C, Fq, Fr, G> element<C, Fq, Fr, G>::wnaf_batch_mul(const std::vector<element>& _points,
                                                            const std::vector<Fr>& _scalars)
{
    constexpr size_t WNAF_SIZE = 4;
    ASSERT(_points.size() == _scalars.size());
    if constexpr (!HasPlookup<C>) {
        return batch_mul(_points, _scalars, max_num_bits);
    }

    // treat inputs for points at infinity.
    // if a base point is at infinity, we substitute for element::one, and set the scalar multiplier to 0
    // this (partially) ensures the mul algorithm does not need to account for points at infinity
    std::vector<element> points;
    std::vector<Fr> scalars;
    element one = element::one(nullptr);
    for (size_t i = 0; i < points.size(); ++i) {
        bool_t is_point_at_infinity = points[i].is_point_at_infinity();
        if (is_point_at_infinity.get_value() && static_cast<bool>(is_point_at_infinity.is_constant())) {
            // if point is at infinity and a circuit constant we can just skip.
            continue;
        }
        if (_scalars[i].get_value() == 0 && _scalars[i].is_constant()) {
            // if scalar multiplier is 0 and also a constant, we can skip
            continue;
        }
        element point(_points[i]);
        point.x = Fq::conditional_assign(is_point_at_infinity, one.x, point.x);
        point.y = Fq::conditional_assign(is_point_at_infinity, one.y, point.y);
        Fr scalar = Fr::conditional_assign(is_point_at_infinity, 0, _scalars[i]);
        points.push_back(point);
        scalars.push_back(scalar);

        // TODO: if both point and scalar are constant, don't bother adding constraints
    }

    std::vector<four_bit_table_plookup<>> point_tables;
    for (const auto& point : points) {
        point_tables.emplace_back(four_bit_table_plookup<>(point));
    }

    std::vector<std::vector<field_t<C>>> wnaf_entries;
    for (const auto& scalar : scalars) {
        wnaf_entries.emplace_back(compute_wnaf<max_num_bits>(scalar));
    }

    constexpr size_t num_bits = (max_num_bits == 0) ? (Fr::modulus.get_msb() + 1) : (max_num_bits);
    constexpr size_t num_rounds = ((num_bits + WNAF_SIZE - 1) / WNAF_SIZE);
    const auto offset_generators = compute_offset_generators(num_rounds * 4 - 3);

    element accumulator = offset_generators.first + point_tables[0][wnaf_entries[0][0]];
    for (size_t i = 1; i < points.size(); ++i) {
        accumulator += point_tables[i][wnaf_entries[i][0]];
    }

    for (size_t i = 1; i < num_rounds; ++i) {
        accumulator = accumulator.dbl();
        accumulator = accumulator.dbl();
        std::vector<element> to_add;
        for (size_t j = 0; j < points.size(); ++j) {
            to_add.emplace_back(point_tables[j][wnaf_entries[j][i]]);
        }
        accumulator = accumulator.quadruple_and_add(to_add);
    }

    for (size_t i = 0; i < points.size(); ++i) {
        element skew = accumulator - points[i];
        Fq out_x = accumulator.x.conditional_select(skew.x, bool_t(wnaf_entries[i][num_rounds]));
        Fq out_y = accumulator.y.conditional_select(skew.y, bool_t(wnaf_entries[i][num_rounds]));
        accumulator = element(out_x, out_y);
    }
    accumulator -= offset_generators.second;
    return accumulator;
}
} // namespace bb::stdlib
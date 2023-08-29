#include "../field/field.hpp"
#include "barretenberg/crypto/pedersen_commitment/pedersen.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"

#include "../../hash/pedersen/pedersen.hpp"
#include "../../hash/pedersen/pedersen_gates.hpp"

#include "./cycle_group.hpp"
#include "barretenberg/proof_system/plookup_tables/types.hpp"
#include "barretenberg/stdlib/primitives/plookup/plookup.hpp"
namespace proof_system::plonk::stdlib {

template <typename Composer> Composer* cycle_group<Composer>::get_context(const cycle_group& other) const
{
    if (get_context() != nullptr) {
        return get_context();
    }
    if (other.get_context() != nullptr) {
        return other.get_context();
    }
    return nullptr;
}

/**
 * @brief Evaluates a doubling
 *
 * @tparam Composer
 * @return cycle_group<Composer>
 */
template <typename Composer> cycle_group<Composer> cycle_group<Composer>::dbl() const
{
    // n.b. if p1 is point at infinity, calling p1.dbl() does not give us an output that satisfies the double gate :o)
    // (native code just checks out of the dbl() method if point is at infinity)
    auto x1 = x.get_value();
    auto y1 = y.get_value();
    auto lambda = (x1 * x1 * 3) / (y1 + y1);
    auto x3 = lambda * lambda - x1 - x1;
    auto y3 = lambda * (x1 - x3) - y1;
    affine_element p3(x3, y3);

    if (is_constant()) {
        return cycle_group<Composer>(p3);
    }

    auto context = get_context();

    cycle_group result = cycle_group<Composer>::from_witness(context, p3);
    result.is_infinity = is_point_at_infinity();
    proof_system::ecc_dbl_gate_<FF> dbl_gate{
        .x1 = x.get_witness_index(),
        .y1 = y.get_witness_index(),
        .x3 = result.x.get_witness_index(),
        .y3 = result.y.get_witness_index(),
    };

    context->create_ecc_dbl_gate(dbl_gate);
    return result;
}

/**
 * @brief Will evaluate ECC point addition over `*this` and `other`.
 *        Incomplete addition formula edge cases are *NOT* checked!
 *        Only use this method if you know the x-coordinates of the operands cannot collide
 *
 * @tparam Composer
 * @param other
 * @return cycle_group<Composer>
 */
template <typename Composer>
cycle_group<Composer> cycle_group<Composer>::unconditional_add(const cycle_group& other) const
{
    auto context = get_context(other);

    const bool lhs_constant = is_constant();
    const bool rhs_constant = other.is_constant();
    if (lhs_constant && !rhs_constant) {
        auto lhs = cycle_group<Composer>::from_witness(context, get_value());
        return lhs.unconditional_add(other);
    }
    if (!lhs_constant && rhs_constant) {
        auto rhs = cycle_group<Composer>::from_witness(context, other.get_value());
        return unconditional_add(rhs);
    }

    const auto p1 = get_value();
    const auto p2 = other.get_value();
    affine_element p3(element(p1) + element(p2));
    if (lhs_constant && rhs_constant) {
        return cycle_group(p3);
    }
    cycle_group result = cycle_group<Composer>::from_witness(context, p3);

    proof_system::ecc_add_gate_<FF> add_gate{
        .x1 = x.get_witness_index(),
        .y1 = y.get_witness_index(),
        .x2 = other.x.get_witness_index(),
        .y2 = other.y.get_witness_index(),
        .x3 = result.x.get_witness_index(),
        .y3 = result.y.get_witness_index(),
        .endomorphism_coefficient = 1,
        .sign_coefficient = 1,
    };
    context->create_ecc_add_gate(add_gate);

    return result;
}

/**
 * @brief will evaluate ECC point subtraction over `*this` and `other`.
 *        Incomplete addition formula edge cases are *NOT* checked!
 *        Only use this method if you know the x-coordinates of the operands cannot collide
 *
 * @tparam Composer
 * @param other
 * @return cycle_group<Composer>
 */
template <typename Composer>
cycle_group<Composer> cycle_group<Composer>::unconditional_subtract(const cycle_group& other) const
{
    auto context = get_context(other);

    const bool lhs_constant = is_constant();
    const bool rhs_constant = other.is_constant();

    if (lhs_constant && !rhs_constant) {
        auto lhs = cycle_group<Composer>::from_witness(context, get_value());
        return lhs.unconditional_subtract(other);
    }
    if (!lhs_constant && rhs_constant) {
        auto rhs = cycle_group<Composer>::from_witness(context, other.get_value());
        return unconditional_subtract(rhs);
    }
    auto p1 = get_value();
    auto p2 = other.get_value();
    affine_element p3(element(p1) - element(p2));
    if (lhs_constant && rhs_constant) {
        return cycle_group(p3);
    }
    cycle_group result = cycle_group<Composer>::from_witness(context, p3);

    proof_system::ecc_add_gate_<FF> add_gate{
        .x1 = x.get_witness_index(),
        .y1 = y.get_witness_index(),
        .x2 = other.x.get_witness_index(),
        .y2 = other.y.get_witness_index(),
        .x3 = result.x.get_witness_index(),
        .y3 = result.y.get_witness_index(),
        .endomorphism_coefficient = 1,
        .sign_coefficient = -1,
    };
    context->create_ecc_add_gate(add_gate);

    return result;
}

/**
 * @brief Will evaluate ECC point addition over `*this` and `other`.
 *        Uses incomplete addition formula
 *        If incomplete addition formula edge cases are triggered (x-coordinates of operands collide),
 *        the constraints produced by this method will be unsatisfiable.
 *        Useful when an honest prover will not produce a point collision with overwhelming probability,
 *        but a cheating prover will be able to.
 *
 * @tparam Composer
 * @param other
 * @return cycle_group<Composer>
 */
template <typename Composer>
cycle_group<Composer> cycle_group<Composer>::constrained_unconditional_add(const cycle_group& other) const
{
    field_t x_delta = x - other.x;
    x_delta.assert_is_not_zero("cycle_group::constrained_unconditional_add, x-coordinate collision");
    return unconditional_add(other);
}

/**
 * @brief Will evaluate ECC point subtraction over `*this` and `other`.
 *        Uses incomplete addition formula
 *        If incomplete addition formula edge cases are triggered (x-coordinates of operands collide),
 *        the constraints produced by this method will be unsatisfiable.
 *        Useful when an honest prover will not produce a point collision with overwhelming probability,
 *        but a cheating prover will be able to.
 *
 * @tparam Composer
 * @param other
 * @return cycle_group<Composer>
 */
template <typename Composer>
cycle_group<Composer> cycle_group<Composer>::constrained_unconditional_subtract(const cycle_group& other) const
{
    field_t x_delta = x - other.x;
    x_delta.assert_is_not_zero("cycle_group::constrained_unconditional_subtract, x-coordinate collision");
    return unconditional_subtract(other);
}

/**
 * @brief Will evaluate ECC point addition over `*this` and `other`.
 *        This method uses complete addition i.e. is compatible with edge cases.
 *        Method is expensive due to needing to evaluate both an addition, a doubling,
 *        plus conditional logic to handle points at infinity.
 *
 * @tparam Composer
 * @param other
 * @return cycle_group<Composer>
 */
template <typename Composer> cycle_group<Composer> cycle_group<Composer>::operator+(const cycle_group& other) const
{
    Composer* context = get_context(other);
    const bool_t x_coordinates_match = (x == other.x);
    const bool_t y_coordinates_match = (y == other.y);
    const bool_t double_predicate = (x_coordinates_match && y_coordinates_match);
    const bool_t infinity_predicate = (x_coordinates_match && !y_coordinates_match);

    auto x1 = x;
    auto y1 = y;
    auto x2 = other.x;
    auto y2 = other.y;
    auto x_diff = x2.add_two(-x1, x_coordinates_match); // todo document this oddity
    auto lambda = (y2 - y1) / x_diff;
    auto x3 = lambda.madd(lambda, -(x2 + x1));
    auto y3 = lambda.madd(x1 - x3, -y1);
    cycle_group add_result(context, x3, y3, x_coordinates_match);

    auto dbl_result = dbl();

    // dbl if x_match, y_match
    // infinity if x_match, !y_match
    cycle_group result(context);
    result.x = field_t::conditional_assign(double_predicate, dbl_result.x, add_result.x);
    result.y = field_t::conditional_assign(double_predicate, dbl_result.y, add_result.y);

    const bool_t lhs_infinity = is_point_at_infinity();
    const bool_t rhs_infinity = other.is_point_at_infinity();
    // if lhs infinity, return rhs
    result.x = field_t::conditional_assign(lhs_infinity, other.x, result.x);
    result.y = field_t::conditional_assign(lhs_infinity, other.y, result.y);

    // if rhs infinity, return lhs
    result.x = field_t::conditional_assign(rhs_infinity, x, result.x);
    result.y = field_t::conditional_assign(rhs_infinity, y, result.y);

    // is result point at infinity?
    // yes = infinity_predicate && !lhs_infinity && !rhs_infinity
    // yes = lhs_infinity && rhs_infinity
    // n.b. can likely optimise this
    bool_t result_is_infinity = infinity_predicate && (!lhs_infinity && !rhs_infinity);
    result_is_infinity = result_is_infinity || (lhs_infinity && rhs_infinity);
    result.is_infinity = result_is_infinity;
    return result;
}

/**
 * @brief Will evaluate ECC point subtraction over `*this` and `other`.
 *        This method uses complete addition i.e. is compatible with edge cases.
 *        Method is expensive due to needing to evaluate both an addition, a doubling,
 *        plus conditional logic to handle points at infinity.
 *
 * @tparam Composer
 * @param other
 * @return cycle_group<Composer>
 */
template <typename Composer> cycle_group<Composer> cycle_group<Composer>::operator-(const cycle_group& other) const
{

    Composer* context = get_context(other);
    const bool_t x_coordinates_match = (x == other.x);
    const bool_t y_coordinates_match = (y == other.y);
    const bool_t double_predicate = (x_coordinates_match && !y_coordinates_match).normalize();
    const bool_t infinity_predicate = (x_coordinates_match && y_coordinates_match).normalize();

    auto x1 = x;
    auto y1 = y;
    auto x2 = other.x;
    auto y2 = other.y;
    auto x_diff = x2.add_two(-x1, x_coordinates_match);
    auto lambda = (-y2 - y1) / x_diff;
    auto x3 = lambda.madd(lambda, -(x2 + x1));
    auto y3 = lambda.madd(x1 - x3, -y1);
    cycle_group add_result(context, x3, y3, x_coordinates_match);

    auto dbl_result = dbl();

    // dbl if x_match, !y_match
    // infinity if x_match, y_match
    cycle_group result(context);
    result.x = field_t::conditional_assign(double_predicate, dbl_result.x, add_result.x);
    result.y = field_t::conditional_assign(double_predicate, dbl_result.y, add_result.y);

    const bool_t lhs_infinity = is_point_at_infinity();
    const bool_t rhs_infinity = other.is_point_at_infinity();
    // if lhs infinity, return -rhs
    result.x = field_t::conditional_assign(lhs_infinity, other.x, result.x);
    result.y = field_t::conditional_assign(lhs_infinity, (-other.y).normalize(), result.y);

    // if rhs infinity, return lhs
    result.x = field_t::conditional_assign(rhs_infinity, x, result.x);
    result.y = field_t::conditional_assign(rhs_infinity, y, result.y);

    // is result point at infinity?
    // yes = infinity_predicate && !lhs_infinity && !rhs_infinity
    // yes = lhs_infinity && rhs_infinity
    // n.b. can likely optimise this
    bool_t result_is_infinity = infinity_predicate && (!lhs_infinity && !rhs_infinity);
    result_is_infinity = result_is_infinity || (lhs_infinity && rhs_infinity);
    result.is_infinity = result_is_infinity;

    return result;
}

template <typename Composer> cycle_group<Composer>& cycle_group<Composer>::operator+=(const cycle_group& other)
{
    *this = *this + other;
    return *this;
}

template <typename Composer> cycle_group<Composer>& cycle_group<Composer>::operator-=(const cycle_group& other)
{
    *this = *this - other;
    return *this;
}

template <typename Composer> cycle_group<Composer>::offset_generators::offset_generators(size_t num_points)
{
    auto generator_temp = G1::template derive_generators<300>(); // hmm bad
    const size_t num_generators = num_points + 1;
    for (size_t i = 0; i < num_generators; ++i) {
        generators.emplace_back(generator_temp[i]);
    }

    auto init_generator = generators[0];
}
template <typename Composer>
cycle_group<Composer>::cycle_scalar::cycle_scalar(const field_t& _lo, const field_t& _hi)
    : lo(_lo)
    , hi(_hi)
{}

template <typename Composer> cycle_group<Composer>::cycle_scalar::cycle_scalar(const field_t& _in)
{
    const uint256_t value(_in.get_value());
    const uint256_t lo_v = value.slice(0, LO_BITS);
    const uint256_t hi_v = value.slice(LO_BITS, HI_BITS);
    constexpr uint256_t shift = uint256_t(1) << LO_BITS;
    if (_in.is_constant()) {
        lo = lo_v;
        hi = hi_v;
    } else {
        lo = witness_t(_in.get_context(), lo_v);
        hi = witness_t(_in.get_context(), hi_v);
        (lo + hi * shift).assert_equal(_in);
    }
}

template <typename Composer> cycle_group<Composer>::cycle_scalar::cycle_scalar(const ScalarField& _in)
{
    const uint256_t value(_in);
    const uint256_t lo_v = value.slice(0, LO_BITS);
    const uint256_t hi_v = value.slice(LO_BITS, HI_BITS);
    lo = lo_v;
    hi = hi_v;
}

template <typename Composer>
typename cycle_group<Composer>::cycle_scalar cycle_group<Composer>::cycle_scalar::from_witness(Composer* context,
                                                                                               const ScalarField& value)
{
    const uint256_t value_u256(value);
    const uint256_t lo_v = value_u256.slice(0, LO_BITS);
    const uint256_t hi_v = value_u256.slice(LO_BITS, HI_BITS);
    field_t lo = witness_t(context, lo_v);
    field_t hi = witness_t(context, hi_v);
    return cycle_scalar(lo, hi);
}

template <typename Composer> bool cycle_group<Composer>::cycle_scalar::is_constant() const
{
    return (lo.is_constant() && hi.is_constant());
}

template <typename Composer>
typename cycle_group<Composer>::cycle_scalar::ScalarField cycle_group<Composer>::cycle_scalar::get_value() const
{
    uint256_t lo_v(lo.get_value());
    uint256_t hi_v(hi.get_value());
    return ScalarField(lo_v + (hi_v << LO_BITS));
}

template <typename Composer>
cycle_group<Composer>::straus_scalar_slice::straus_scalar_slice(Composer* context,
                                                                const cycle_scalar& scalar,
                                                                const size_t table_bits)
    : _table_bits(table_bits)
{
    // convert an input cycle_scalar object into a vector of slices, each containing `table_bits` bits.
    // this also performs an implicit range check on the input slices
    const auto slice_scalar = [&](const field_t& scalar, const size_t num_bits) {
        std::vector<field_t> result;
        if (scalar.is_constant()) {
            const size_t num_slices = (num_bits + table_bits - 1) / table_bits;
            const uint64_t table_mask = (1ULL << table_bits) - 1ULL;
            uint256_t raw_value = scalar.get_value();
            for (size_t i = 0; i < num_slices; ++i) {
                uint64_t slice_v = static_cast<uint64_t>(raw_value.data[0]) & table_mask;
                result.push_back(field_t(slice_v));
                raw_value = raw_value >> table_bits;
            }
            return result;
        }
        if constexpr (IS_ULTRA) {
            const auto slice_indices =
                context->decompose_into_default_range(scalar.normalize().get_witness_index(),
                                                      num_bits,
                                                      table_bits,
                                                      "straus_scalar_slice decompose_into_default_range");
            for (auto& idx : slice_indices) {
                result.emplace_back(field_t::from_witness_index(context, idx));
            }
        } else {
            uint256_t raw_value = scalar.get_value();
            const uint64_t table_mask = (1ULL << table_bits) - 1ULL;
            const size_t num_slices = (num_bits + table_bits - 1) / table_bits;
            for (size_t i = 0; i < num_slices; ++i) {
                uint64_t slice_v = static_cast<uint64_t>(raw_value.data[0]) & table_mask;
                field_t slice(witness_t(context, slice_v));

                context->create_range_constraint(
                    slice.get_witness_index(), table_bits, "straus_scalar_slice create_range_constraint");

                result.emplace_back(slice);
                raw_value = raw_value >> table_bits;
            }
            std::vector<field_t> linear_elements;
            FF scaling_factor = 1;
            for (size_t i = 0; i < num_slices; ++i) {
                linear_elements.emplace_back(result[i] * scaling_factor);
                scaling_factor += scaling_factor;
            }
            field_t::accumulate(linear_elements).assert_equal(scalar);
        }
        return result;
    };

    auto hi_slices = slice_scalar(scalar.hi, cycle_scalar::HI_BITS);
    auto lo_slices = slice_scalar(scalar.lo, cycle_scalar::LO_BITS);

    if (!scalar.is_constant()) {
        // Check that scalar.hi * 2^LO_BITS + scalar.lo < cycle_group_modulus when evaluated over the integers
        constexpr uint256_t cycle_group_modulus = cycle_scalar::ScalarField::modulus;
        constexpr uint256_t r_lo = cycle_group_modulus.slice(0, cycle_scalar::LO_BITS);
        constexpr uint256_t r_hi = cycle_group_modulus.slice(cycle_scalar::LO_BITS, cycle_scalar::HI_BITS);

        bool need_borrow = uint256_t(scalar.lo.get_value()) > r_lo;
        field_t borrow = scalar.lo.is_constant() ? need_borrow : field_t::from_witness(context, need_borrow);

        // directly call `create_new_range_constraint` to avoid creating an arithmetic gate
        if (!scalar.lo.is_constant()) {
            if constexpr (IS_ULTRA) {
                context->create_new_range_constraint(borrow.get_witness_index(), 1, "borrow");
            } else {
                borrow.assert_equal(borrow * borrow);
            }
        }
        // Hi range check = r_hi - y_hi - borrow
        // Lo range check = r_lo - y_lo + borrow * 2^{126}
        field_t hi = (-scalar.hi + r_hi) - borrow;
        field_t lo = (-scalar.lo + r_lo) + (borrow * (uint256_t(1) << cycle_scalar::LO_BITS));

        hi.create_range_constraint(cycle_scalar::HI_BITS);
        lo.create_range_constraint(cycle_scalar::LO_BITS);
    }

    std::copy(lo_slices.begin(), lo_slices.end(), std::back_inserter(slices));
    std::copy(hi_slices.begin(), hi_slices.end(), std::back_inserter(slices));
}

template <typename Composer> field_t<Composer> cycle_group<Composer>::straus_scalar_slice::read(size_t index)
{
    ASSERT(slices.size() > index);
    return slices[index];
}

template <typename Composer>
cycle_group<Composer>::straus_lookup_table::straus_lookup_table(Composer* context,
                                                                const cycle_group& base_point,
                                                                const cycle_group& generator_point,
                                                                size_t table_bits)
    : _table_bits(table_bits)
    , _context(context)
{
    const size_t table_size = 1UL << table_bits;

    point_table.resize(table_size);
    point_table[0] = generator_point;

    // We want to support the case where input points are points at infinity.
    // If base point is at infinity, we want every point in the table to just be `generator_point`.
    // We achieve this via the following:
    // 1: We create a "work_point" that is base_point if not at infinity, otherwise is just 1
    // 2: When computing the point table, we use "work_point" in additions instead of the "base_point" (to prevent
    //    x-coordinate collisions in honest case) 3: When assigning to the point table, we conditionally assign either
    //    the output of the point addition (if not at infinity) or the generator point (if at infinity)
    // Note: if `base_point.is_point_at_infinity()` is constant, these conditional assigns produce zero gate overhead
    cycle_group fallback_point(G1::affine_one);
    field_t modded_x = field_t::conditional_assign(base_point.is_point_at_infinity(), fallback_point.x, base_point.x);
    field_t modded_y = field_t::conditional_assign(base_point.is_point_at_infinity(), fallback_point.y, base_point.y);
    cycle_group modded_base_point(context, modded_x, modded_y, false);
    for (size_t i = 1; i < table_size; ++i) {

        auto add_output = point_table[i - 1].constrained_unconditional_add(modded_base_point);
        field_t x = field_t::conditional_assign(base_point.is_point_at_infinity(), generator_point.x, add_output.x);
        field_t y = field_t::conditional_assign(base_point.is_point_at_infinity(), generator_point.y, add_output.y);
        point_table[i] = cycle_group(context, x, y, false);
    }

    if constexpr (IS_ULTRA) {
        rom_id = context->create_ROM_array(table_size);
        for (size_t i = 0; i < table_size; ++i) {
            if (point_table[i].is_constant()) {
                auto element = point_table[i].get_value();
                point_table[i] = cycle_group::from_witness(_context, element);
                point_table[i].x.assert_equal(element.x);
                point_table[i].y.assert_equal(element.y);
            }
            context->set_ROM_element_pair(
                rom_id,
                i,
                std::array<uint32_t, 2>{ point_table[i].x.get_witness_index(), point_table[i].y.get_witness_index() });
        }
    } else {
        ASSERT(table_bits == 1);
    }
}

template <typename Composer>
cycle_group<Composer> cycle_group<Composer>::straus_lookup_table::read(const field_t& _index)
{
    if constexpr (IS_ULTRA) {
        field_t index(_index);
        if (index.is_constant()) {
            index = witness_t(_context, _index.get_value());
            index.assert_equal(_index.get_value());
        }
        auto output_indices = _context->read_ROM_array_pair(rom_id, index.get_witness_index());
        field_t x = field_t::from_witness_index(_context, output_indices[0]);
        field_t y = field_t::from_witness_index(_context, output_indices[1]);
        return cycle_group(_context, x, y, false);
    }
    // idx * point_table[1] + (1 - idx) * point_table[0]
    // idx (point_table[1] - point_table[0]) + point_table[0]
    field_t x = _index * (point_table[1].x - point_table[0].x) + point_table[0].x;
    field_t y = _index * (point_table[1].y - point_table[0].y) + point_table[0].y;
    return cycle_group(_context, x, y, false);
}

template <typename Composer>
typename cycle_group<Composer>::batch_mul_internal_output cycle_group<Composer>::_batch_mul_internal(
    const std::vector<cycle_scalar>& _scalars,
    const std::vector<cycle_group>& _base_points,
    const bool unconditional_add)
{
    ASSERT(_scalars.size() == _base_points.size());

    Composer* context = nullptr;
    for (auto& scalar : _scalars) {
        if (scalar.lo.get_context() != nullptr) {
            context = scalar.get_context();
            break;
        }
    }
    for (auto& point : _base_points) {
        if (point.get_context() != nullptr) {
            context = point.get_context();
            break;
        }
    }

    std::vector<cycle_scalar> scalars;
    std::vector<cycle_group> base_points;
    bool has_constant_component = false;
    bool has_non_constant_component = false;
    element constant_component = G1::point_at_infinity;
    for (size_t i = 0; i < _scalars.size(); ++i) {
        if (_scalars[i].is_constant() && _base_points[i].is_constant()) {
            has_constant_component = true;
            constant_component += _base_points[i].get_value() * _scalars[i].get_value();
        } else {
            has_non_constant_component = true;
            scalars.emplace_back(_scalars[i]);
            base_points.emplace_back(_base_points[i]);
        }
    }
    if (!has_non_constant_component) {
        return { cycle_group(constant_component), G1::affine_point_at_infinity };
    }
    // core algorithm
    // define a `table_bits` size lookup table
    const size_t num_points = scalars.size();

    auto generators = offset_generators(num_points);
    std::vector<straus_scalar_slice> scalar_slices;
    std::vector<straus_lookup_table> point_tables;
    for (size_t i = 0; i < num_points; ++i) {
        scalar_slices.emplace_back(straus_scalar_slice(context, scalars[i], table_bits));
        point_tables.emplace_back(
            straus_lookup_table(context, base_points[i], generators.generators[i + 1], table_bits));
    }

    element offset_generator_accumulator = generators.generators[0];
    cycle_group accumulator = generators.generators[0];

    for (size_t i = 0; i < num_rounds; ++i) {
        if (i != 0) {
            for (size_t j = 0; j < table_bits; ++j) {
                accumulator = accumulator.dbl();
                offset_generator_accumulator = offset_generator_accumulator.dbl();
            }
        }

        for (size_t j = 0; j < num_points; ++j) {
            const field_t scalar_slice = scalar_slices[j].read(num_rounds - i - 1);
            const cycle_group point = point_tables[j].read(scalar_slice);
            accumulator = unconditional_add ? accumulator.unconditional_add(point)
                                            : accumulator.constrained_unconditional_add(point);
            offset_generator_accumulator = offset_generator_accumulator + element(generators.generators[j + 1]);
        }
    }

    if (has_constant_component) {
        // we subtract off the offset_generator_accumulator, so subtract constant component from the accumulator!
        offset_generator_accumulator -= constant_component;
    }
    // cycle_group offset_generator_delta(affine_element(-offset_generator_accumulator));
    // // use a full conditional add here in case we end with a point at infinity or a point doubling.
    // // e.g. x[P] + x[P], or x[P] + -x[P]
    // accumulator = accumulator + offset_generator_delta;

    return { accumulator, affine_element(-offset_generator_accumulator) };
}

template <typename Composer>
cycle_group<Composer> cycle_group<Composer>::variable_base_batch_mul(const std::vector<cycle_scalar>& _scalars,
                                                                     const std::vector<cycle_group>& _base_points)
{
    ASSERT(_scalars.size() == _base_points.size());

    auto [accumulator, offset_generator_accumulator] = _batch_mul_internal(_scalars, _base_points, false);
    // use a full conditional add here in case we end with a point at infinity or a point doubling.
    // e.g. x[P] + x[P], or x[P] + -x[P]
    if (!offset_generator_accumulator.is_point_at_infinity()) {
        return accumulator + (cycle_group(offset_generator_accumulator));
    }
    return accumulator;
}

template <typename Composer>
cycle_group<Composer> cycle_group<Composer>::fixed_base_batch_mul(
    const std::vector<cycle_scalar>& _scalars,
    const std::vector<affine_element>& _base_points) requires SupportsLookupTables<Composer>
{
    ASSERT(_scalars.size() == _base_points.size());

    Composer* context = nullptr;
    for (auto& scalar : _scalars) {
        if (scalar.get_context() != nullptr) {
            context = scalar.get_context();
            break;
        }
    }

    std::vector<cycle_scalar> scalars;
    std::vector<affine_element> base_points;
    bool has_constant_component = false;
    bool has_non_constant_component = false;
    element constant_component = G1::point_at_infinity;
    for (size_t i = 0; i < _scalars.size(); ++i) {
        if (_scalars[i].is_constant() && (uint256_t(_scalars[i].get_value()) != 0)) {
            has_constant_component = true;
            constant_component += _base_points[i] * _scalars[i].get_value();
        } else {
            has_non_constant_component = true;
            scalars.emplace_back(_scalars[i]);
            base_points.emplace_back(_base_points[i]);
        }
    }
    if (!has_non_constant_component) {
        return cycle_group(constant_component);
    }

    const size_t num_points = base_points.size();
    using MultiTableId = plookup::MultiTableId;
    using ColumnIdx = plookup::ColumnIdx;

    std::vector<MultiTableId> plookup_table_ids;
    std::vector<affine_element> plookup_base_points;
    std::vector<field_t> plookup_scalars;
    std::vector<cycle_scalar> leftover_scalars;
    std::vector<cycle_group> leftover_base_points;

    for (size_t i = 0; i < num_points; ++i) {
        std::optional<std::array<MultiTableId, 2>> table_id =
            plookup::fixed_base::table::get_lookup_table_ids_for_point(base_points[i]);
        if (table_id.has_value()) {
            plookup_table_ids.emplace_back(table_id.value()[0]);
            plookup_table_ids.emplace_back(table_id.value()[1]);
            plookup_base_points.emplace_back(base_points[i]);
            plookup_base_points.emplace_back(element(base_points[i]) * (uint256_t(1) << 128));
            plookup_scalars.emplace_back(scalars[i].lo);
            plookup_scalars.emplace_back(scalars[i].hi);

        } else {
            leftover_base_points.emplace_back(base_points[i]);
            leftover_scalars.emplace_back(scalars[i]);
        }
        ASSERT(table_id.has_value());
    }

    std::vector<cycle_group> lookup_points;
    element offset_generator_accumulator = G1::point_at_infinity;
    for (size_t i = 0; i < plookup_scalars.size(); ++i) {
        plookup::ReadData<field_t> lookup_data =
            plookup_read<Composer>::get_lookup_accumulators(plookup_table_ids[i], plookup_scalars[i]);
        for (size_t j = 0; j < lookup_data[ColumnIdx::C2].size(); ++j) {
            const auto x = lookup_data[ColumnIdx::C2][j];
            const auto y = lookup_data[ColumnIdx::C3][j];
            lookup_points.emplace_back(cycle_group(context, x, y, false));
        }

        std::optional<affine_element> offset_1 =
            plookup::fixed_base::table::get_generator_offset_for_table_id(plookup_table_ids[i]);

        ASSERT(offset_1.has_value());
        offset_generator_accumulator += offset_1.value();
    }
    cycle_group accumulator;
    if (!leftover_scalars.empty()) {
        auto [var_accumulator, var_offset_generator] =
            _batch_mul_internal(leftover_scalars, leftover_base_points, true);
        accumulator = var_accumulator;
        // todo explain subtract
        if (!var_offset_generator.is_point_at_infinity()) {
            offset_generator_accumulator -= var_offset_generator;
        }
    }
    for (size_t i = 0; i < lookup_points.size(); ++i) {
        if (i == 0) {
            if (leftover_scalars.empty()) {
                accumulator = lookup_points[i];
            } else {
                accumulator = accumulator.unconditional_add(lookup_points[i]);
            }
        } else {
            accumulator = accumulator.unconditional_add(lookup_points[i]);
        }
    }

    if (has_constant_component) {
        // we subtract off the offset_generator_accumulator, so subtract constant component from the accumulator!
        offset_generator_accumulator -= constant_component;
        cycle_group offset_generator_delta(affine_element(-offset_generator_accumulator));
        // Assuming independent generators, existence of constant component = cannot hit edge cases
        return accumulator.unconditional_add(offset_generator_delta);
    }
    cycle_group offset_generator_delta(affine_element(-offset_generator_accumulator));
    accumulator = accumulator + (offset_generator_delta);
    return accumulator;
}

template <typename Composer>
cycle_group<Composer> cycle_group<Composer>::fixed_base_batch_mul(
    const std::vector<cycle_scalar>& _scalars,
    const std::vector<affine_element>& _base_points) requires DoesNotSupportLookupTables<Composer>

{
    ASSERT(_scalars.size() == _base_points.size());
    static constexpr size_t FIXED_BASE_TABLE_BITS = 1;

    Composer* context = nullptr;
    for (auto& scalar : _scalars) {
        if (scalar.get_context() != nullptr) {
            context = scalar.get_context();
            break;
        }
    }

    std::vector<cycle_scalar> scalars;
    std::vector<affine_element> base_points;
    bool has_constant_component = false;
    bool has_non_constant_component = false;
    element constant_component = G1::point_at_infinity;
    for (size_t i = 0; i < _scalars.size(); ++i) {
        if (_scalars[i].is_constant()) {
            has_constant_component = true;
            constant_component += _base_points[i] * _scalars[i].get_value();
        } else {
            has_non_constant_component = true;
            scalars.emplace_back(_scalars[i]);
            base_points.emplace_back(_base_points[i]);
        }
    }
    if (!has_non_constant_component) {
        return cycle_group(constant_component);
    }
    // core algorithm
    // define a `table_bits` size lookup table
    const size_t num_points = scalars.size();

    auto generators = offset_generators(num_points);
    std::vector<straus_scalar_slice> scalar_slices;
    // std::vector<straus_lookup_table> point_tables;

    using straus_round_tables = std::vector<straus_lookup_table>;
    std::vector<straus_round_tables> point_tables(num_points);

    // creating these point tables should cost 0 constraints if base points are constant
    for (size_t i = 0; i < num_points; ++i) {
        std::vector<element> round_points(num_rounds);
        std::vector<element> round_offset_generators(num_rounds);
        round_points[0] = base_points[i];
        round_offset_generators[0] = generators.generators[i + 1];
        for (size_t j = 1; j < num_rounds; ++j) {
            round_points[j] = round_points[j - 1].dbl();
            round_offset_generators[j] = round_offset_generators[j - 1].dbl();
        }
        element::batch_normalize(&round_points[0], num_rounds);
        element::batch_normalize(&round_offset_generators[0], num_rounds);
        point_tables[i].resize(num_rounds);
        for (size_t j = 0; j < num_rounds; ++j) {
            point_tables[i][j] = straus_lookup_table(
                context, cycle_group(round_points[j]), cycle_group(round_offset_generators[j]), FIXED_BASE_TABLE_BITS);
        }
    }

    for (size_t i = 0; i < num_points; ++i) {
        scalar_slices.emplace_back(straus_scalar_slice(context, scalars[i], FIXED_BASE_TABLE_BITS));
    }

    element offset_generator_accumulator = generators.generators[0];
    cycle_group accumulator = cycle_group(element(generators.generators[0]) * (uint256_t(1) << 253));
    for (size_t i = 0; i < num_rounds; ++i) {

        if (i > 0) {
            offset_generator_accumulator = offset_generator_accumulator.dbl();
        }
        for (size_t j = 0; j < num_points; ++j) {
            auto& point_table = point_tables[j][i];

            const field_t scalar_slice = scalar_slices[j].read(i);

            const cycle_group point = point_table.read(scalar_slice);
            accumulator = accumulator.unconditional_add(point);
            offset_generator_accumulator = offset_generator_accumulator + element(generators.generators[j + 1]);
        }
    }

    if (has_constant_component) {
        // we subtract off the offset_generator_accumulator, so subtract constant component from the accumulator!
        offset_generator_accumulator -= constant_component;
    }
    cycle_group offset_generator_delta(affine_element(-offset_generator_accumulator));
    // use a full conditional add here in case we end with a point at infinity or a point doubling.
    // e.g. x[P] + x[P], or x[P] + -x[P]
    accumulator = accumulator + offset_generator_delta;

    return accumulator;
}

INSTANTIATE_STDLIB_TYPE(cycle_group);

} // namespace proof_system::plonk::stdlib

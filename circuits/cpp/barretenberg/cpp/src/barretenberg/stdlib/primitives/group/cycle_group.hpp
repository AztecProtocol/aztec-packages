#pragma once

#include "../field/field.hpp"
#include "barretenberg/crypto/pedersen_commitment/pedersen.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"

#include "../../hash/pedersen/pedersen.hpp"
#include "../../hash/pedersen/pedersen_gates.hpp"
#include <optional>

namespace proof_system::plonk::stdlib {

using namespace barretenberg;
using namespace crypto::generators;

template <typename Composer> concept SupportsLookupTables = (Composer::CIRCUIT_TYPE == CircuitType::ULTRA);

template <typename Composer> concept DoesNotSupportLookupTables = (Composer::CIRCUIT_TYPE != CircuitType::ULTRA);

/**
 * @brief cycle_group represents a group element of the proving system's embedded curve
 *        i.e. a curve with a cofactor 1 defined over a field equal to the circuit's native field Composer::FF
 *
 *        (todo @zac-williamson) once the pedersen refactor project is finished, this class will supercede
 * `stdlib::group`
 *
 * @tparam Composer
 */
template <typename Composer> class cycle_group {
  public:
    using field_t = field_t<Composer>;
    using bool_t = bool_t<Composer>;
    using witness_t = witness_t<Composer>;
    using FF = typename Composer::FF;
    using G1 = typename Composer::EmbeddedCurve;
    using element = typename G1::element;
    using affine_element = typename G1::affine_element;

    static constexpr bool IS_ULTRA = Composer::CIRCUIT_TYPE == CircuitType::ULTRA;
    static constexpr size_t table_bits = IS_ULTRA ? 4 : 1;
    static constexpr size_t num_bits = FF::modulus.get_msb() + 1;
    static constexpr size_t num_rounds = (num_bits + table_bits - 1) / table_bits;

    Composer* get_context(const cycle_group& other) const;

    cycle_group(Composer* _context = nullptr)
        : context(_context)
        , x(0)
        , y(0)
        , is_infinity(true)
        , _is_constant(true)
    {}

    cycle_group(Composer* _context, field_t _x, field_t _y, bool_t _is_infinity)
        : context(_context)
        , x(_x.normalize())
        , y(_y.normalize())
        , is_infinity(_is_infinity)
        , _is_constant(_x.is_constant() && _y.is_constant() && _is_infinity.is_constant())
    {}

    cycle_group(const FF& _x, const FF& _y, bool _is_infinity)
        : context(nullptr)
        , x(_x)
        , y(_y)
        , is_infinity(_is_infinity)
        , _is_constant(true)
    {}

    cycle_group(const affine_element& _in)
        : context(nullptr)
        , x(_in.x)
        , y(_in.y)
        , is_infinity(_in.is_point_at_infinity())
        , _is_constant(true)
    {}

    /**
     * @brief
     *
     * N.B. make sure _in is not the point at infinity!
     * (todo: shoul we validate on curve?)
     * @param _context
     * @param _in
     * @return cycle_group
     */
    static cycle_group from_witness(Composer* _context, const affine_element& _in)
    {
        cycle_group result(_context);
        result.x = field_t(witness_t(_context, _in.x));
        result.y = field_t(witness_t(_context, _in.y));
        result.is_infinity = false;
        result._is_constant = false;
        return result;
    }

    Composer* get_context() const { return context; }
    [[nodiscard]] bool is_constant() const { return _is_constant; }

    affine_element get_value() const
    {
        affine_element result(x.get_value(), y.get_value());
        if (is_infinity.get_value()) {
            result.self_set_infinity();
        }
        return result;
    }

    bool_t is_point_at_infinity() const { return is_infinity; }
    void validate_is_on_curve() const
    {
        auto xx = x * x;
        auto xxx = xx * x;
        auto res = y.madd(y, -xxx - G1::curve_b);
        res *= is_point_at_infinity();
        res.assert_is_zero();
    }
    cycle_group dbl() const;
    cycle_group unconditional_add(const cycle_group& other) const;
    cycle_group constrained_unconditional_add(const cycle_group& other) const;
    cycle_group conditional_add(const cycle_group& other) const;
    cycle_group operator+(const cycle_group& other) const;
    cycle_group unconditional_subtract(const cycle_group& other) const;
    cycle_group constrained_unconditional_subtract(const cycle_group& other) const;
    cycle_group operator-(const cycle_group& other) const;
    cycle_group& operator+=(const cycle_group& other);
    cycle_group& operator-=(const cycle_group& other);

    class offset_generators {
      public:
        offset_generators(size_t num_points);
        // cycle_group get_generator(size_t generator_idx);
        // cycle_group get_final_generator_offset();
        std::vector<affine_element> generators;
    };

    struct cycle_scalar {
        using ScalarField = typename G1::subgroup_field;
        static constexpr size_t LO_BITS = 128;
        static constexpr size_t HI_BITS = ScalarField::modulus.get_msb() + 1 - LO_BITS;
        static cycle_scalar from_witness(Composer* context, const ScalarField& value);
        cycle_scalar(const ScalarField& _in);
        cycle_scalar(const field_t& _lo, const field_t& _hi);
        cycle_scalar(const field_t& _in);
        [[nodiscard]] bool is_constant() const;
        ScalarField get_value() const;
        field_t lo;
        field_t hi;

        Composer* get_context() const { return lo.get_context() != nullptr ? lo.get_context() : hi.get_context(); }
    };
    class straus_scalar_slice {
      public:
        straus_scalar_slice(Composer* context, const cycle_scalar& scalars, size_t table_bits);
        field_t read(size_t index);
        size_t _table_bits;
        std::vector<field_t> slices;
    };
    class straus_lookup_table {
      public:
        straus_lookup_table() = default;
        straus_lookup_table(Composer* context,
                            const cycle_group& base_point,
                            const cycle_group& generator_point,
                            size_t table_bits);
        cycle_group read(const field_t& index);
        size_t _table_bits;
        Composer* _context;
        std::vector<cycle_group> point_table;
        size_t rom_id = 0;
    };

    static cycle_group<Composer> fixed_base_batch_mul(
        const std::vector<cycle_scalar>& _scalars,
        const std::vector<affine_element>& _base_points) requires SupportsLookupTables<Composer>;

    static cycle_group<Composer> fixed_base_batch_mul(
        const std::vector<cycle_scalar>& _scalars,
        const std::vector<affine_element>& _base_points) requires DoesNotSupportLookupTables<Composer>;

    // static cycle_group fixed_base_batch_mul(const std::vector<cycle_scalar>& scalars,
    //                                         const std::vector<affine_element>& base_points)
    //     requires(!cycle_group<Composer>::IS_ULTRA);

    static cycle_group variable_base_batch_mul(const std::vector<cycle_scalar>& scalars,
                                               const std::vector<cycle_group>& base_points);

    Composer* context;
    field_t x;
    field_t y;
    bool_t is_infinity;
    bool _is_constant;
};

// template <typename Composer>
//     requires(cycle_group<Composer>::IS_ULTRA)
// class cycle_group_upper : public cycle_group<Composer> {
//     using cycle_scalar = typename cycle_group<Composer>::cycle_scalar;
//     using affine_element = typename cycle_group<Composer>::affine_element;

//     static cycle_group<Composer> fixed_base_batch_mul(const std::vector<cycle_scalar>& _scalars,
//                                                       const std::vector<affine_element>& _base_points);
// };

template <typename ComposerContext>
inline std::ostream& operator<<(std::ostream& os, cycle_group<ComposerContext> const& v)
{
    return os << v.get_value();
}

EXTERN_STDLIB_TYPE(cycle_group);

} // namespace proof_system::plonk::stdlib

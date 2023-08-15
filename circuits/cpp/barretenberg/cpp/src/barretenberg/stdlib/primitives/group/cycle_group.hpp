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

    Composer* get_context(const cycle_group& other);

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

    cycle_group dbl();
    cycle_group unconditional_add(const cycle_group& other);
    cycle_group constrained_unconditional_add(const cycle_group& other);
    cycle_group operator+(const cycle_group& other);
    cycle_group unconditional_subtract(const cycle_group& other);
    cycle_group constrained_unconditional_subtract(const cycle_group& other);
    cycle_group operator-(const cycle_group& other);
    cycle_group& operator+=(const cycle_group& other);
    cycle_group& operator-=(const cycle_group& other);

    static cycle_group fixed_base_batch_mul(const std::vector<field_t>& scalars,
                                            const std::vector<size_t>& generator_indices);
    static cycle_group variable_base_batch_mul(const std::vector<field_t>& scalars,
                                               const std::vector<cycle_group>& base_points);

    Composer* context;
    field_t x;
    field_t y;
    bool_t is_infinity;
    bool _is_constant;
};

template <typename ComposerContext>
inline std::ostream& operator<<(std::ostream& os, cycle_group<ComposerContext> const& v)
{
    return os << v.get_value();
}

EXTERN_STDLIB_TYPE(cycle_group);

} // namespace proof_system::plonk::stdlib

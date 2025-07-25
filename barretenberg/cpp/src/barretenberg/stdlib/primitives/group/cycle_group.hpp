// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/crypto/pedersen_commitment/pedersen.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/stdlib/primitives/bigfield/bigfield.hpp"
#include "barretenberg/stdlib/primitives/bool/bool.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include "barretenberg/stdlib_circuit_builders/plookup_tables/fixed_base/fixed_base_params.hpp"
#include "barretenberg/transcript/origin_tag.hpp"
#include <optional>

namespace bb::stdlib {

template <typename Builder>
concept IsUltraArithmetic = (Builder::CIRCUIT_TYPE == CircuitType::ULTRA);
template <typename Builder>
concept IsNotUltraArithmetic = (Builder::CIRCUIT_TYPE != CircuitType::ULTRA);

/**
 * @brief cycle_group represents a group Element of the proving system's embedded curve
 *        i.e. a curve with a cofactor 1 defined over a field equal to the circuit's native field Builder::FF
 *
 *        (todo @zac-williamson) once the pedersen refactor project is finished, this class will supercede
 * `stdlib::group`
 *
 * @tparam Builder
 */
template <typename Builder> class cycle_group {
  public:
    using field_t = stdlib::field_t<Builder>;
    using bool_t = stdlib::bool_t<Builder>;
    using witness_t = stdlib::witness_t<Builder>;
    using FF = typename Builder::FF;
    using Curve = typename Builder::EmbeddedCurve;
    using Group = typename Curve::Group;
    using Element = typename Curve::Element;
    using AffineElement = typename Curve::AffineElement;
    using GeneratorContext = crypto::GeneratorContext<Curve>;
    using ScalarField = typename Curve::ScalarField;
    using BigScalarField = stdlib::bigfield<Builder, typename ScalarField::Params>;

    static constexpr size_t STANDARD_NUM_TABLE_BITS = 1;
    static constexpr size_t ULTRA_NUM_TABLE_BITS = 4;
    static constexpr bool IS_ULTRA = Builder::CIRCUIT_TYPE == CircuitType::ULTRA;
    static constexpr size_t TABLE_BITS = IS_ULTRA ? ULTRA_NUM_TABLE_BITS : STANDARD_NUM_TABLE_BITS;
    static constexpr size_t NUM_BITS = ScalarField::modulus.get_msb() + 1;
    static constexpr size_t NUM_ROUNDS = (NUM_BITS + TABLE_BITS - 1) / TABLE_BITS;
    inline static constexpr std::string_view OFFSET_GENERATOR_DOMAIN_SEPARATOR = "cycle_group_offset_generator";

    // Since the cycle_group base field is the circuit's native field, it can be stored using two public inputs.
    static constexpr size_t PUBLIC_INPUTS_SIZE = 2;

  private:
  public:
    /**
     * @brief cycle_scalar represents a member of the cycle curve SCALAR FIELD.
     *        This is NOT the native circuit field type.
     *        i.e. for a BN254 circuit, cycle_group will be Grumpkin and cycle_scalar will be Grumpkin::ScalarField
     *        (BN254 native field is BN254::ScalarField == Grumpkin::BaseField)
     *
     * @details We convert scalar multiplication inputs into cycle_scalars to enable scalar multiplication to be
     * *complete* i.e. Grumpkin points multiplied by BN254 scalars does not produce a cyclic group
     * as BN254::ScalarField < Grumpkin::ScalarField
     * This complexity *should* not leak outside the cycle_group / cycle_scalar implementations, as cycle_scalar
     * performs all required conversions if the input scalars are stdlib::field_t elements
     *
     * @note We opted to create a new class to represent `cycle_scalar` instead of using `bigfield`,
     * as `bigfield` is inefficient in this context. All required range checks for `cycle_scalar` can be obtained for
     * free from the `batch_mul` algorithm, making the range checks performed by `bigfield` largely redundant.
     */
    struct cycle_scalar {
        static constexpr size_t LO_BITS = field_t::native::Params::MAX_BITS_PER_ENDOMORPHISM_SCALAR;
        static constexpr size_t HI_BITS = NUM_BITS - LO_BITS;
        field_t lo;
        field_t hi;

      private:
        size_t _num_bits = NUM_BITS;
        bool _skip_primality_test = false;
        // if our scalar multiplier is a bn254 FF scalar (e.g. pedersen hash),
        // we want to validate the cycle_scalar < bn254::fr::modulus *not* grumpkin::fr::modulus
        bool _use_bn254_scalar_field_for_primality_test = false;

      public:
        cycle_scalar(const field_t& _lo,
                     const field_t& _hi,
                     const size_t bits,
                     const bool skip_primality_test,
                     const bool use_bn254_scalar_field_for_primality_test)
            : lo(_lo)
            , hi(_hi)
            , _num_bits(bits)
            , _skip_primality_test(skip_primality_test)
            , _use_bn254_scalar_field_for_primality_test(use_bn254_scalar_field_for_primality_test){};
        cycle_scalar(const ScalarField& _in = 0);
        cycle_scalar(const field_t& _lo, const field_t& _hi);
        cycle_scalar(const field_t& _in);
        static cycle_scalar from_witness(Builder* context, const ScalarField& value);
        static cycle_scalar from_witness_bitstring(Builder* context, const uint256_t& bitstring, size_t num_bits);
        static cycle_scalar create_from_bn254_scalar(const field_t& _in, bool skip_primality_test = false);
        [[nodiscard]] bool is_constant() const;
        ScalarField get_value() const;
        Builder* get_context() const { return lo.get_context() != nullptr ? lo.get_context() : hi.get_context(); }
        [[nodiscard]] size_t num_bits() const { return _num_bits; }
        [[nodiscard]] bool skip_primality_test() const { return _skip_primality_test; }
        [[nodiscard]] bool use_bn254_scalar_field_for_primality_test() const
        {
            return _use_bn254_scalar_field_for_primality_test;
        }
        void validate_scalar_is_in_field() const;

        explicit cycle_scalar(BigScalarField&);
        /**
         * @brief Get the origin tag of the cycle_scalar (a merge of the lo and hi tags)
         *
         * @return OriginTag
         */
        OriginTag get_origin_tag() const { return OriginTag(lo.get_origin_tag(), hi.get_origin_tag()); }
        /**
         * @brief Set the origin tag of lo and hi members of cycle scalar
         *
         * @param tag
         */
        void set_origin_tag(const OriginTag& tag) const
        {
            lo.set_origin_tag(tag);
            hi.set_origin_tag(tag);
        }
        /**
         * @brief Set the free witness flag for the cycle scalar's tags
         */
        void set_free_witness_tag()
        {
            lo.set_free_witness_tag();
            hi.set_free_witness_tag();
        }
        /**
         * @brief Unset the free witness flag for the cycle scalar's tags
         */
        void unset_free_witness_tag()
        {
            lo.unset_free_witness_tag();
            hi.unset_free_witness_tag();
        }
    };

    /**
     * @brief straus_scalar_slice decomposes an input scalar into `table_bits` bit-slices.
     * Used in `batch_mul`, which ses the Straus multiscalar multiplication algorithm.
     *
     */
    struct straus_scalar_slice {
        straus_scalar_slice(Builder* context, const cycle_scalar& scalars, size_t table_bits);
        std::optional<field_t> read(size_t index);
        size_t _table_bits;
        std::vector<field_t> slices;
        std::vector<uint64_t> slices_native;
    };

    /**
     * @brief straus_lookup_table computes a lookup table of size 1 << table_bits
     *
     * @details for an input base_point [P] and offset_generator point [G], where N = 1 << table_bits, the following is
     * computed:
     *
     * { [G] + 0.[P], [G] + 1.[P], ..., [G] + (N - 1).[P] }
     *
     * The point [G] is used to ensure that we do not have to handle the point at infinity associated with 0.[P].
     *
     * For an HONEST Prover, the probability of [G] and [P] colliding is equivalent to solving the dlog problem.
     * This allows us to partially ignore the incomplete addition formula edge-cases for short Weierstrass curves.
     *
     * When adding group elements in `batch_mul`, we can constrain+assert the x-coordinates of the operand points do not
     * match. An honest prover will never trigger the case where x-coordinates match due to the above. Validating
     * x-coordinates do not match is much cheaper than evaluating the full complete addition formulae for short
     * Weierstrass curves.
     *
     * @note For the case of fixed-base scalar multipliation, all input points are defined at circuit compile.
     * We can ensure that all Provers cannot create point collisions between the base points and offset generators.
     * For this restricted case we can skip the x-coordiante collision checks when performing group operations.
     *
     * @note straus_lookup_table uses Ultra ROM tables if available. If not, we use simple conditional assignment
     * constraints and restrict the table size to be 1 bit.
     */
    struct straus_lookup_table {
      public:
        static std::vector<Element> compute_straus_lookup_table_hints(const Element& base_point,
                                                                      const Element& offset_generator,
                                                                      size_t table_bits);

        straus_lookup_table() = default;
        straus_lookup_table(Builder* context,
                            const cycle_group& base_point,
                            const cycle_group& offset_generator,
                            size_t table_bits,
                            std::optional<std::span<AffineElement>> hints = std::nullopt);
        cycle_group read(const field_t& index);
        size_t _table_bits;
        Builder* _context;
        std::vector<cycle_group> point_table;
        size_t rom_id = 0;
        OriginTag tag{};
    };

  private:
    /**
     * @brief Stores temporary variables produced by internal multiplication algorithms
     *
     */
    struct batch_mul_internal_output {
        cycle_group accumulator;
        AffineElement offset_generator_delta;
    };

  public:
    cycle_group(Builder* _context = nullptr);
    cycle_group(field_t _x, field_t _y, bool_t _is_infinity);
    cycle_group(const FF& _x, const FF& _y, bool _is_infinity);
    cycle_group(const AffineElement& _in);
    static cycle_group one(Builder* _context);
    static cycle_group from_witness(Builder* _context, const AffineElement& _in);
    static cycle_group from_constant_witness(Builder* _context, const AffineElement& _in);
    Builder* get_context(const cycle_group& other) const;
    Builder* get_context() const { return context; }
    AffineElement get_value() const;
    [[nodiscard]] bool is_constant() const { return _is_constant; }
    bool_t is_point_at_infinity() const { return _is_infinity; }
    void set_point_at_infinity(const bool_t& is_infinity);
    void standardize();
    bool is_standard() const { return this->_is_standard; };
    cycle_group get_standard_form();
    void validate_is_on_curve() const;
    cycle_group dbl(const std::optional<AffineElement> hint = std::nullopt) const
        requires IsUltraArithmetic<Builder>;
    cycle_group dbl(const std::optional<AffineElement> hint = std::nullopt) const
        requires IsNotUltraArithmetic<Builder>;
    cycle_group unconditional_add(const cycle_group& other,
                                  const std::optional<AffineElement> hint = std::nullopt) const
        requires IsUltraArithmetic<Builder>;
    cycle_group unconditional_add(const cycle_group& other,
                                  const std::optional<AffineElement> hint = std::nullopt) const
        requires IsNotUltraArithmetic<Builder>;
    cycle_group unconditional_subtract(const cycle_group& other,
                                       const std::optional<AffineElement> hint = std::nullopt) const;
    cycle_group checked_unconditional_add(const cycle_group& other,
                                          const std::optional<AffineElement> hint = std::nullopt) const;
    cycle_group checked_unconditional_subtract(const cycle_group& other,
                                               const std::optional<AffineElement> hint = std::nullopt) const;
    cycle_group operator+(const cycle_group& other) const;
    cycle_group operator-(const cycle_group& other) const;
    cycle_group operator-() const;
    cycle_group& operator+=(const cycle_group& other);
    cycle_group& operator-=(const cycle_group& other);
    static cycle_group batch_mul(const std::vector<cycle_group>& base_points,
                                 const std::vector<BigScalarField>& scalars,
                                 GeneratorContext context = {})
    {
        std::vector<cycle_scalar> cycle_scalars;
        for (auto scalar : scalars) {
            cycle_scalars.emplace_back(scalar);
        }
        return batch_mul(base_points, cycle_scalars, context);
    }
    static cycle_group batch_mul(const std::vector<cycle_group>& base_points,
                                 const std::vector<cycle_scalar>& scalars,
                                 GeneratorContext context = {});
    cycle_group operator*(const cycle_scalar& scalar) const;
    cycle_group& operator*=(const cycle_scalar& scalar);
    cycle_group operator*(const BigScalarField& scalar) const;
    cycle_group& operator*=(const BigScalarField& scalar);
    bool_t operator==(cycle_group& other);
    void assert_equal(cycle_group& other, std::string const& msg = "cycle_group::assert_equal");
    static cycle_group conditional_assign(const bool_t& predicate, const cycle_group& lhs, const cycle_group& rhs);
    cycle_group operator/(const cycle_group& other) const;

    /**
     * @brief Set the origin tag for x, y and _is_infinity members of cycle_group
     *
     * @param tag
     */
    void set_origin_tag(OriginTag tag) const
    {
        x.set_origin_tag(tag);
        y.set_origin_tag(tag);
        _is_infinity.set_origin_tag(tag);
    }
    /**
     * @brief Get the origin tag of cycle_group (a merege of origin tags of x, y and _is_infinity members)
     *
     * @return OriginTag
     */
    OriginTag get_origin_tag() const
    {
        return OriginTag(x.get_origin_tag(), y.get_origin_tag(), _is_infinity.get_origin_tag());
    }

    /**
     * @brief Set the free witness flag for the cycle_group's tags
     */
    void set_free_witness_tag()
    {
        x.set_free_witness_tag();
        y.set_free_witness_tag();
        _is_infinity.set_free_witness_tag();
    }

    /**
     * @brief Unset the free witness flag for the cycle_group's tags
     */
    void unset_free_witness_tag()
    {
        x.unset_free_witness_tag();
        y.unset_free_witness_tag();
        _is_infinity.unset_free_witness_tag();
    }

    /**
     * Fix a witness. The value of the witness is constrained with a selector
     **/
    void fix_witness()
    {
        // Origin tags should be updated within
        x.fix_witness();
        y.fix_witness();
        _is_infinity.fix_witness();

        // This is now effectively a constant
        unset_free_witness_tag();
    }
    /**
     * @brief Set the witness indices representing the cycle_group to public
     *
     * @return uint32_t Index into the public inputs array at which the representation is stored
     */
    uint32_t set_public()
    {
        uint32_t start_idx = x.set_public();
        y.set_public();
        return start_idx;
    }

    /**
     * @brief Reconstruct a cycle_group from limbs (generally stored in the public inputs)
     * @details The base field of the cycle_group curve is the same as the circuit's native field so each coordinate is
     * represented by a single "limb".
     *
     * @param limbs The coordinates of the cycle_group element
     * @return cycle_group
     */
    static cycle_group reconstruct_from_public(const std::span<const field_t, 2>& limbs)
    {
        return cycle_group(limbs[0], limbs[1], false);
    }

    field_t x;
    field_t y;

  private:
    bool_t _is_infinity;
    bool _is_constant;
    // The point is considered to be `standard` or in `standard form` when:
    // - It's not a point at infinity, and the coordinates belong to the curve
    // - It's a point at infinity and both of the coordinates are set to be 0. (0, 0)
    // Most of the time it is true, so we won't need to do extra conditional_assign
    // during `get_standard_form`, `assert_equal` or `==` calls
    // However sometimes it won't be the case(due to some previous design choices),
    // so we can handle these cases using this flag
    bool _is_standard;
    Builder* context;

    static batch_mul_internal_output _variable_base_batch_mul_internal(std::span<cycle_scalar> scalars,
                                                                       std::span<cycle_group> base_points,
                                                                       std::span<AffineElement const> offset_generators,
                                                                       bool unconditional_add);

    static batch_mul_internal_output _fixed_base_batch_mul_internal(std::span<cycle_scalar> scalars,
                                                                    std::span<AffineElement> base_points,
                                                                    std::span<AffineElement const> offset_generators)
        requires IsUltraArithmetic<Builder>;
    static batch_mul_internal_output _fixed_base_batch_mul_internal(std::span<cycle_scalar> scalars,
                                                                    std::span<AffineElement> base_points,
                                                                    std::span<AffineElement const> offset_generators)
        requires IsNotUltraArithmetic<Builder>;
};

template <typename Builder> inline std::ostream& operator<<(std::ostream& os, cycle_group<Builder> const& v)
{
    return os << "{ " << v.x << ", " << v.y << " }";
}
} // namespace bb::stdlib

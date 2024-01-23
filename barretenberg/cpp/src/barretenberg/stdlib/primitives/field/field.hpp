#pragma once
#include "../circuit_builders/circuit_builders_fwd.hpp"
#include "../witness/witness.hpp"
#include "barretenberg/common/assert.hpp"
#include <functional>

namespace bb::stdlib {

template <typename Builder> class bool_t;
template <typename Builder> class field_t {
  public:
    using View = field_t;

    field_t(Builder* parent_context = nullptr);
    field_t(Builder* parent_context, const bb::fr& value);

    field_t(const int value)
        : context(nullptr)
        , witness_index(IS_CONSTANT)
    {
        additive_constant = bb::fr(value);
        multiplicative_constant = bb::fr(0);
    }

    // NOLINTNEXTLINE(google-runtime-int) intended behavior
    field_t(const unsigned long long value)
        : context(nullptr)
        , witness_index(IS_CONSTANT)
    {
        additive_constant = bb::fr(value);
        multiplicative_constant = bb::fr(0);
    }

    field_t(const unsigned int value)
        : context(nullptr)
        , witness_index(IS_CONSTANT)
    {
        additive_constant = bb::fr(value);
        multiplicative_constant = bb::fr(0);
    }

    // NOLINTNEXTLINE(google-runtime-int) intended behavior
    field_t(const unsigned long value)
        : context(nullptr)
        , witness_index(IS_CONSTANT)
    {
        additive_constant = bb::fr(value);
        multiplicative_constant = bb::fr(0);
    }

    field_t(const bb::fr& value)
        : context(nullptr)
        , additive_constant(value)
        , multiplicative_constant(bb::fr(1))
        , witness_index(IS_CONSTANT)
    {}

    field_t(const uint256_t& value)
        : context(nullptr)
        , additive_constant(value)
        , multiplicative_constant(bb::fr(1))
        , witness_index(IS_CONSTANT)
    {}

    field_t(const witness_t<Builder>& value);

    field_t(const field_t& other)
        : context(other.context)
        , additive_constant(other.additive_constant)
        , multiplicative_constant(other.multiplicative_constant)
        , witness_index(other.witness_index)
    {}

    field_t(field_t&& other) noexcept
        : context(other.context)
        , additive_constant(other.additive_constant)
        , multiplicative_constant(other.multiplicative_constant)
        , witness_index(other.witness_index)
    {}

    field_t(const bool_t<Builder>& other);

    ~field_t() = default;

    static constexpr bool is_composite = false;
    static constexpr uint256_t modulus = bb::fr::modulus;

    static field_t from_witness_index(Builder* parent_context, uint32_t witness_index);

    explicit operator bool_t<Builder>() const;

    field_t& operator=(const field_t& other)
    {
        if (this == &other) {
            return *this;
        }
        additive_constant = other.additive_constant;
        multiplicative_constant = other.multiplicative_constant;
        witness_index = other.witness_index;
        context = (other.context == nullptr ? nullptr : other.context);
        return *this;
    }

    field_t& operator=(field_t&& other) noexcept
    {
        additive_constant = other.additive_constant;
        multiplicative_constant = other.multiplicative_constant;
        witness_index = other.witness_index;
        context = (other.context == nullptr ? nullptr : other.context);
        return *this;
    }

    static field_t copy_as_new_witness(Builder& context, field_t const& other)
    {
        auto result = field_t<Builder>(witness_t<Builder>(&context, other.get_value()));
        result.assert_equal(other, "field_t::copy_as_new_witness, assert_equal");
        return result;
    }

    field_t operator+(const field_t& other) const;
    field_t operator-(const field_t& other) const;
    field_t operator*(const field_t& other) const;
    field_t operator/(const field_t& other) const;
    field_t divide_no_zero_check(const field_t& other) const;

    field_t sqr() const { return operator*(*this); }

    // N.B. we implicitly range-constrain 'other' to be a 32-bit integer!
    field_t pow(const field_t& exponent) const;

    field_t operator+=(const field_t& other)
    {
        *this = *this + other;
        return *this;
    }
    field_t operator-=(const field_t& other)
    {
        *this = *this - other;
        return *this;
    }
    field_t operator*=(const field_t& other)
    {
        *this = *this * other;
        return *this;
    }
    field_t operator/=(const field_t& other)
    {
        *this = *this / other;
        return *this;
    }

    // Prefix increment (++x)
    field_t& operator++()
    {
        *this = *this + 1;
        return *this;
    };

    // Postfix increment (x++)
    // NOLINTNEXTLINE
    field_t operator++(const int)
    {
        field_t this_before_operation = field_t(*this);
        *this = *this + 1;
        return this_before_operation;
    };

    field_t invert() const { return (field_t(1) / field_t(*this)).normalize(); }

    static field_t coset_generator(const size_t generator_idx)
    {
        return field_t(bb::fr::coset_generator(generator_idx));
    }

    static field_t external_coset_generator() { return field_t(bb::fr::external_coset_generator()); }

    field_t operator-() const
    {
        field_t result(*this);
        result.multiplicative_constant = -multiplicative_constant;
        result.additive_constant = -additive_constant;

        return result;
    }

    field_t conditional_negate(const bool_t<Builder>& predicate) const;

    void assert_equal(const field_t& rhs, std::string const& msg = "field_t::assert_equal") const;

    void assert_not_equal(const field_t& rhs, std::string const& msg = "field_t::assert_not_equal") const;

    void assert_is_in_set(const std::vector<field_t>& set, std::string const& msg = "field_t::assert_not_in_set") const;

    static field_t conditional_assign(const bool_t<Builder>& predicate, const field_t& lhs, const field_t& rhs);

    static std::array<field_t, 4> preprocess_two_bit_table(const field_t& T0,
                                                           const field_t& T1,
                                                           const field_t& T2,
                                                           const field_t& T3);
    static field_t select_from_two_bit_table(const std::array<field_t, 4>& table,
                                             const bool_t<Builder>& t1,
                                             const bool_t<Builder>& t0);

    static std::array<field_t, 8> preprocess_three_bit_table(const field_t& T0,
                                                             const field_t& T1,
                                                             const field_t& T2,
                                                             const field_t& T3,
                                                             const field_t& T4,
                                                             const field_t& T5,
                                                             const field_t& T6,
                                                             const field_t& T7);
    static field_t select_from_three_bit_table(const std::array<field_t, 8>& table,
                                               const bool_t<Builder>& t2,
                                               const bool_t<Builder>& t1,
                                               const bool_t<Builder>& t0);

    static void evaluate_linear_identity(const field_t& a, const field_t& b, const field_t& c, const field_t& d);
    static void evaluate_polynomial_identity(const field_t& a, const field_t& b, const field_t& c, const field_t& d);

    static field_t accumulate(const std::vector<field_t>& to_add);

    /**
     * multiply *this by `to_mul` and add `to_add`
     * One `madd` call costs 1 constraint for Ultra plonk
     * */
    field_t madd(const field_t& to_mul, const field_t& to_add) const;

    // add_two costs 1 constraint for ultra plonk
    field_t add_two(const field_t& add_a, const field_t& add_b) const;
    bool_t<Builder> operator==(const field_t& other) const;
    bool_t<Builder> operator!=(const field_t& other) const;

    /**
     * normalize returns a field_t element with equivalent value to `this`, but where `multiplicative_constant = 1` and
     *`additive_constant = 0`.
     * I.e. the returned value is defined entirely by the builder variable that `witness_index` points to (no scaling
     * factors).
     *
     * If the witness_index of `this` is ever needed, `normalize` should be called first.
     *
     * Will cost 1 constraint if the field element is not already normalized, as a new witness value would need to be
     * created.
     * Constants do not need to be normalized, as there is no underlying 'witness'; a constant's value is
     * wholly tracked by `this.additive_constant`, so we definitely don't want to set that to 0!
     **/
    field_t normalize() const;

    bb::fr get_value() const;

    Builder* get_context() const { return context; }

    /**
     * Slices a `field_t` at given indices (msb, lsb) both included in the slice,
     * returns three parts: [low, slice, high].
     */
    std::array<field_t, 3> slice(uint8_t msb, uint8_t lsb) const;

    /**
     * is_zero will return a bool_t, and add constraints that enforce its correctness
     * N.B. If you want to ENFORCE that a field_t object is zero, use `assert_is_zero`
     **/
    bool_t<Builder> is_zero() const;

    void create_range_constraint(size_t num_bits, std::string const& msg = "field_t::range_constraint") const;
    void assert_is_not_zero(std::string const& msg = "field_t::assert_is_not_zero") const;
    void assert_is_zero(std::string const& msg = "field_t::assert_is_zero") const;
    bool is_constant() const { return witness_index == IS_CONSTANT; }
    void set_public() const { context->set_public_input(normalize().witness_index); }

    /**
     * Create a witness form a constant. This way the value of the witness is fixed and public (public, because the
     * value becomes hard-coded as an element of the q_c selector vector).
     */
    void convert_constant_to_fixed_witness(Builder* ctx)
    {
        ASSERT(witness_index == IS_CONSTANT);
        context = ctx;
        (*this) = field_t<Builder>(witness_t<Builder>(context, get_value()));
        context->fix_witness(witness_index, get_value());
    }

    static field_t from_witness(Builder* ctx, const bb::fr& input) { return field_t(witness_t<Builder>(ctx, input)); }

    /**
     * Fix a witness. The value of the witness is constrained with a selector
     * */
    void fix_witness()
    {
        ASSERT(witness_index != IS_CONSTANT);
        auto context = get_context();
        ASSERT(context != nullptr);
        context->fix_witness(witness_index, get_value());
    }

    uint32_t get_witness_index() const { return witness_index; }

    std::vector<bool_t<Builder>> decompose_into_bits(
        size_t num_bits = 256,
        std::function<witness_t<Builder>(Builder* ctx, uint64_t, uint256_t)> get_bit =
            [](Builder* ctx, uint64_t j, const uint256_t& val) {
                return witness_t<Builder>(ctx, val.get_bit(j));
            }) const;

    /**
     * @brief Return (a < b) as bool circuit type.
     *        This method *assumes* that both a and b are < 2^{input_bits} - 1
     *        i.e. it is not checked here, we assume this has been done previously
     *
     * @tparam Builder
     * @tparam input_bits
     * @param a
     * @param b
     * @return bool_t<Builder>
     */
    template <size_t num_bits> bool_t<Builder> ranged_less_than(const field_t<Builder>& other) const
    {
        const auto& a = (*this);
        const auto& b = other;
        auto* ctx = a.context ? a.context : b.context;
        if (a.is_constant() && b.is_constant()) {
            return uint256_t(a.get_value()) < uint256_t(b.get_value());
        }

        // a < b
        // both a and b are < K where K = 2^{input_bits} - 1
        // if a < b, this implies b - a - 1 < K
        // if a >= b, this implies b - a + K - 1 < K
        // i.e. (b - a - 1) * q + (b - a + K - 1) * (1 - q) = r < K
        // q.(b - a - b + a) + b - a + K - 1 - (K - 1).q - q = r
        // b - a + (K - 1) - (K).q = r
        uint256_t range_constant = (uint256_t(1) << num_bits);
        bool predicate_witness = uint256_t(a.get_value()) < uint256_t(b.get_value());
        bool_t<Builder> predicate(witness_t<Builder>(ctx, predicate_witness));
        field_t predicate_valid = b.add_two(-(a) + range_constant - 1, -field_t(predicate) * range_constant);
        predicate_valid.create_range_constraint(num_bits);
        return predicate;
    }

    mutable Builder* context = nullptr;

    /**
     * `additive_constant` and `multiplicative_constant` are constant scaling factors applied to a field_t object.
     *
     * The 'value' represented by a field_t is calculated as:
     *   - For `field_t`s with `witness_index = IS_CONSTANT`:
     *       `this.additive_constant`
     *   - For non-constant `field_t`s:
     *       `this.context->variables[this.witness_index] * this.multiplicative_constant + this.additive_constant`
     *
     * We track these scaling factors, because we can apply the same scaling factors to Plonk wires when creating
     * gates. I.e. if we want to multiply a wire by a constant, or add a constant, we do not need to add extra gates
     * to do this. Instead, we track the scaling factors, and apply them to the relevant wires when adding
     * constraints.
     *
     * This also makes constant field_t objects effectively free. (Where 'constant' is a circuit constant, not a C++
     * constant!).
     * E.g. the following 3 lines of code add 0 constraints into a circuit:
     *
     *    field_t foo = 1;
     *    field_t bar = 5;
     *    field_t bar *= foo;
     *
     * Similarly if we add in:
     *
     *    field_t zip = witness_t(context, 10);
     *    zip *= bar + foo;
     *
     * The above adds 0 constraints, the only effect is that `zip`'s scaling factors have been modified. However if
     * we now add:
     *
     *    field_t zap = witness_t(context, 50);
     *    zip *= zap;
     *
     * This will add a constraint, as both zip and zap map to circuit witnesses.
     **/
    mutable bb::fr additive_constant;
    mutable bb::fr multiplicative_constant;

    /**
     * Every builder object contains a vector `variables` (a.k.a. 'witnesses'); circuit variables that can be
     * assigned to wires when creating constraints. `witness_index` describes a location in this container. I.e. it
     * 'points' to a circuit variable.
     *
     * A witness is not the same thing as a 'wire' in a circuit. Multiple wires can be assigned to the same witness via
     * Plonk's copy constraints. Alternatively, a witness might not be assigned to any wires! This case would be similar
     * to an unused variable in a regular program
     *
     * E.g. if we write `field_t foo = witness_t(context, 100)`, this will add the value `100` into `context`'s list of
     * circuit `variables`. However if we do not use `foo` in any operations, then this value will never be assigned to
     * a wire in a circuit.
     *
     * For a more in depth example, consider the following code:
     *
     * field_t foo = witness_t(context, 10);
     * field_t bar = witness_t(context, 50);
     * field_t baz = foo * (bar + 7);
     *
     * This will add 3 new circuit witnesses (10, 50, 570) to `variables`. One constraint will also be created, that
     * validates `baz` has been correctly constructed. The builder will assign `foo, bar, baz` to wires `w_1, w_2, w_3`
     * in a new gate which checks that:
     *
     *      w_1 * w_2 + w_1 * 7 - w_3 = 0
     *
     * If any of `foo, bar, baz` are used in future arithmetic, copy constraints will be automatically applied,
     * this ensure that all gate wires that map to `foo`, for example, will contain the same value.
     *
     * If witness_index == IS_CONSTANT, the object represents a constant value.
     * i.e. a value that's hardcoded in the circuit, that a prover cannot change by modifying their witness transcript.
     *
     * A Plonk gate is a mix of witness values and selector values. e.g. the regular PLONK arithmetic gate checks that:
     *
     *      w_1 * w_2 * q_m + w_1 * q_1 + w_2 * w_2 + w_3 * q_3 + q_c = 0
     *
     * The `w` value are wires, the `q` values are selector constants. If a field object contains a `witness_index`, it
     * will be assigned to `w` values when constraints are applied. If it's a circuit constant, it will be assigned to
     * `q` values.
     *
     * TLDR: witness_index is a pseudo pointer to a circuit witness
     **/
    mutable uint32_t witness_index = IS_CONSTANT;
};

template <typename Builder> inline std::ostream& operator<<(std::ostream& os, field_t<Builder> const& v)
{
    return os << v.get_value();
}
} // namespace bb::stdlib

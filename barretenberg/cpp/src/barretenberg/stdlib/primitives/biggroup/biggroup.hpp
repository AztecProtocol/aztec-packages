// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "../bigfield/bigfield.hpp"
#include "../bigfield/goblin_field.hpp"
#include "../byte_array/byte_array.hpp"
#include "../circuit_builders/circuit_builders_fwd.hpp"
#include "../field/field.hpp"
#include "../memory/rom_table.hpp"
#include "../memory/twin_rom_table.hpp"
#include "barretenberg/ecc/curves/bn254/g1.hpp"
#include "barretenberg/ecc/curves/secp256k1/secp256k1.hpp"
#include "barretenberg/ecc/curves/secp256r1/secp256r1.hpp"
#include "barretenberg/stdlib/primitives/biggroup/biggroup_goblin.hpp"

namespace bb::stdlib::element_default {

// ( ͡° ͜ʖ ͡°)
template <class Builder, class Fq, class Fr, class NativeGroup> class element {
  public:
    using bool_ct = stdlib::bool_t<Builder>;
    using biggroup_tag = element; // Facilitates a constexpr check IsBigGroup
    using BaseField = Fq;

    // Number of bb::fr field elements used to represent a goblin element in the public inputs
    static constexpr size_t PUBLIC_INPUTS_SIZE = Fq::PUBLIC_INPUTS_SIZE * 2;
    struct secp256k1_wnaf {
        std::vector<field_t<Builder>> wnaf;
        field_t<Builder> positive_skew;
        field_t<Builder> negative_skew;
        field_t<Builder> least_significant_wnaf_fragment;
        bool has_wnaf_fragment = false;
    };
    struct secp256k1_wnaf_pair {
        secp256k1_wnaf klo;
        secp256k1_wnaf khi;
    };

    element();
    element(const typename NativeGroup::affine_element& input);
    element(const Fq& x, const Fq& y);

    element(const element& other);
    element(element&& other) noexcept;

    static std::array<fr, PUBLIC_INPUTS_SIZE> construct_dummy()
    {
        const typename NativeGroup::affine_element& native_val = NativeGroup::affine_element::one();
        element val(native_val);
        size_t idx = 0;
        std::array<fr, PUBLIC_INPUTS_SIZE> limb_vals;
        for (auto& limb : val.x.binary_basis_limbs) {
            limb_vals[idx++] = limb.element.get_value();
        }
        for (auto& limb : val.y.binary_basis_limbs) {
            limb_vals[idx++] = limb.element.get_value();
        }
        BB_ASSERT_EQ(idx, PUBLIC_INPUTS_SIZE);
        return limb_vals;
    }
    /**
     * @brief Set the witness indices for the x and y coordinates to public
     *
     * @return uint32_t Index at which the representation is stored in the public inputs
     */
    uint32_t set_public() const
    {
        const uint32_t start_idx = x.set_public();
        y.set_public();

        return start_idx;
    }

    /**
     * @brief Reconstruct a biggroup element from limbs of its coordinates (generally stored in the public inputs)
     *
     * @param limbs
     * @return element
     */
    static element reconstruct_from_public(const std::span<const Fr, PUBLIC_INPUTS_SIZE>& limbs)
    {
        const size_t FRS_PER_FQ = Fq::PUBLIC_INPUTS_SIZE;
        std::span<const Fr, FRS_PER_FQ> x_limbs{ limbs.data(), FRS_PER_FQ };
        std::span<const Fr, FRS_PER_FQ> y_limbs{ limbs.data() + FRS_PER_FQ, FRS_PER_FQ };

        return { Fq::reconstruct_from_public(x_limbs), Fq::reconstruct_from_public(y_limbs) };
    }

    static element from_witness(Builder* ctx, const typename NativeGroup::affine_element& input)
    {
        element out;
        if (input.is_point_at_infinity()) {
            Fq x = Fq::from_witness(ctx, NativeGroup::affine_one.x);
            Fq y = Fq::from_witness(ctx, NativeGroup::affine_one.y);
            out.x = x;
            out.y = y;
        } else {
            Fq x = Fq::from_witness(ctx, input.x);
            Fq y = Fq::from_witness(ctx, input.y);
            out.x = x;
            out.y = y;
        }
        out.set_point_at_infinity(witness_t<Builder>(ctx, input.is_point_at_infinity()));

        // Mark the element as coming out of nowhere
        out.set_free_witness_tag();
        out.validate_on_curve();
        return out;
    }

    void validate_on_curve() const
    {
        Fq b(get_context(), uint256_t(NativeGroup::curve_b));
        Fq _b = Fq::conditional_assign(is_point_at_infinity(), Fq::zero(), b);
        Fq _x = Fq::conditional_assign(is_point_at_infinity(), Fq::zero(), x);
        Fq _y = Fq::conditional_assign(is_point_at_infinity(), Fq::zero(), y);
        if constexpr (!NativeGroup::has_a) {
            // we validate y^2 = x^3 + b by setting "fix_remainder_zero = true" when calling mult_madd
            Fq::mult_madd({ _x.sqr(), _y }, { _x, -_y }, { _b }, true);
        } else {
            Fq a(get_context(), uint256_t(NativeGroup::curve_a));
            Fq _a = Fq::conditional_assign(is_point_at_infinity(), Fq::zero(), a);
            // we validate y^2 = x^3 + ax + b by setting "fix_remainder_zero = true" when calling mult_madd
            Fq::mult_madd({ _x.sqr(), _x, _y }, { _x, _a, -_y }, { _b }, true);
        }
    }

    /**
     * @brief Creates fixed witnesses from a constant element.
     **/
    void convert_constant_to_fixed_witness(Builder* builder)
    {
        this->x.convert_constant_to_fixed_witness(builder);
        this->y.convert_constant_to_fixed_witness(builder);
        // Origin tags should be unset after fixing the witness
        unset_free_witness_tag();
    }

    /**
     * Fix a witness. The value of the witness is constrained with a selector
     **/
    void fix_witness()
    {
        // Origin tags should be updated within
        this->x.fix_witness();
        this->y.fix_witness();

        // This is now effectively a constant
        unset_free_witness_tag();
    }

    static element one(Builder* ctx)
    {
        uint256_t x = uint256_t(NativeGroup::one.x);
        uint256_t y = uint256_t(NativeGroup::one.y);
        Fq x_fq(ctx, x);
        Fq y_fq(ctx, y);
        return element(x_fq, y_fq);
    }

    element& operator=(const element& other);
    element& operator=(element&& other) noexcept;

    byte_array<Builder> to_byte_array() const
    {
        byte_array<Builder> result(get_context());
        result.write(y.to_byte_array());
        result.write(x.to_byte_array());
        return result;
    }

    element checked_unconditional_add(const element& other) const;
    element checked_unconditional_subtract(const element& other) const;

    element operator+(const element& other) const;
    element operator-(const element& other) const;
    element operator-() const
    {
        element result(*this);
        result.y = -result.y;
        return result;
    }
    element operator+=(const element& other)
    {
        *this = *this + other;
        return *this;
    }
    element operator-=(const element& other)
    {
        *this = *this - other;
        return *this;
    }
    std::array<element, 2> checked_unconditional_add_sub(const element&) const;

    element operator*(const Fr& other) const;

    element conditional_negate(const bool_ct& predicate) const
    {
        element result(*this);
        result.y = result.y.conditional_negate(predicate);
        return result;
    }

    element normalize() const
    {
        element result(*this);
        result.x.assert_is_in_field();
        result.y.assert_is_in_field();
        return result;
    }
    element scalar_mul(const Fr& scalar, const size_t max_num_bits = 0) const;

    element reduce() const
    {
        element result(*this);
        result.x.self_reduce();
        result.y.self_reduce();
        return result;
    }

    element dbl() const;

    // we use this data structure to add together a sequence of points.
    // By tracking the previous values of x_1, y_1, \lambda, we can avoid
    // computing the output y-coordinate of intermediate additions
    struct chain_add_accumulator {
        Fq x1_prev;
        Fq y1_prev;
        Fq lambda_prev;
        Fq x3_prev;
        Fq y3_prev;
        bool is_element = false;

        chain_add_accumulator(){};
        explicit chain_add_accumulator(const element& input)
        {
            x3_prev = input.x;
            y3_prev = input.y;
            is_element = true;
        }
        chain_add_accumulator(const chain_add_accumulator& other) = default;
        chain_add_accumulator(chain_add_accumulator&& other) = default;
        chain_add_accumulator& operator=(const chain_add_accumulator& other) = default;
        chain_add_accumulator& operator=(chain_add_accumulator&& other) = default;
    };

    /**
     * We can chain repeated point additions together, where we only require 2 non-native field multiplications per
     * point addition, instead of 3
     **/
    static chain_add_accumulator chain_add_start(const element& p1, const element& p2);
    static chain_add_accumulator chain_add(const element& p1, const chain_add_accumulator& accumulator);
    static element chain_add_end(const chain_add_accumulator& accumulator);
    element montgomery_ladder(const element& other) const;
    element montgomery_ladder(const chain_add_accumulator& accumulator);
    element multiple_montgomery_ladder(const std::vector<chain_add_accumulator>& to_add) const;
    element quadruple_and_add(const std::vector<element>& to_add) const;

    typename NativeGroup::affine_element get_value() const
    {
        uint512_t x_val = x.get_value() % Fq::modulus_u512;
        uint512_t y_val = y.get_value() % Fq::modulus_u512;
        auto result = typename NativeGroup::affine_element(x_val.lo, y_val.lo);
        if (is_point_at_infinity().get_value()) {
            result.self_set_infinity();
        }
        return result;
    }

    static std::pair<std::vector<element>, std::vector<Fr>> mask_points(const std::vector<element>& _points,
                                                                        const std::vector<Fr>& _scalars);

    static std::pair<std::vector<element>, std::vector<Fr>> handle_points_at_infinity(
        const std::vector<element>& _points, const std::vector<Fr>& _scalars);

    // compute a multi-scalar-multiplication by creating a precomputed lookup table for each point,
    // splitting each scalar multiplier up into a 4-bit sliding window wNAF.
    // more efficient than batch_mul if num_points < 4
    // only works with Plookup!
    template <size_t max_num_bits = 0>
    static element wnaf_batch_mul(const std::vector<element>& points, const std::vector<Fr>& scalars);
    static element batch_mul(const std::vector<element>& points,
                             const std::vector<Fr>& scalars,
                             const size_t max_num_bits = 0,
                             const bool with_edgecases = false);

    // we want to conditionally compile this method iff our curve params are the BN254 curve.
    // This is a bit tricky to do with `std::enable_if`, because `bn254_endo_batch_mul` is a member function of a class
    // template
    // && the compiler can't perform partial template specialization on member functions of class templates
    // => our template parameter cannot be a value but must instead by a type
    // Our input to `std::enable_if` is a comparison between two types (NativeGroup and bb::g1), which
    // resolves to either `true/false`.
    // If `std::enable_if` resolves to `true`, it resolves to a `typedef` that equals `void`
    // If `std::enable_if` resolves to `false`, there is no member typedef
    // We want to take the *type* of the output typedef of `std::enable_if`
    // i.e. for the bn254 curve, the template param is `typename = void`
    // for any other curve, there is no template param
    template <typename X = NativeGroup, typename = typename std::enable_if_t<std::is_same<X, bb::g1>::value>>
        requires(IsNotMegaBuilder<Builder>)
    static element bn254_endo_batch_mul(const std::vector<element>& big_points,
                                        const std::vector<Fr>& big_scalars,
                                        const std::vector<element>& small_points,
                                        const std::vector<Fr>& small_scalars,
                                        const size_t max_num_small_bits);

    template <typename X = NativeGroup, typename = typename std::enable_if_t<std::is_same<X, bb::g1>::value>>
        requires(IsNotMegaBuilder<Builder>)
    static element bn254_endo_batch_mul_with_generator(const std::vector<element>& big_points,
                                                       const std::vector<Fr>& big_scalars,
                                                       const std::vector<element>& small_points,
                                                       const std::vector<Fr>& small_scalars,
                                                       const Fr& generator_scalar,
                                                       const size_t max_num_small_bits);

    template <typename X = NativeGroup, typename = typename std::enable_if_t<std::is_same<X, secp256k1::g1>::value>>
    static element secp256k1_ecdsa_mul(const element& pubkey, const Fr& u1, const Fr& u2);

    static std::vector<bool_ct> compute_naf(const Fr& scalar, const size_t max_num_bits = 0);

    template <size_t max_num_bits = 0, size_t WNAF_SIZE = 4>
    static std::vector<field_t<Builder>> compute_wnaf(const Fr& scalar);

    template <size_t wnaf_size, size_t staggered_lo_offset = 0, size_t staggered_hi_offset = 0>
    static secp256k1_wnaf_pair compute_secp256k1_endo_wnaf(const Fr& scalar);

    Builder* get_context() const
    {
        if (x.context != nullptr) {
            return x.context;
        }
        if (y.context != nullptr) {
            return y.context;
        }
        return nullptr;
    }

    Builder* get_context(const element& other) const
    {
        if (x.context != nullptr) {
            return x.context;
        }
        if (y.context != nullptr) {
            return y.context;
        }
        if (other.x.context != nullptr) {
            return other.x.context;
        }
        if (other.y.context != nullptr) {
            return other.y.context;
        }
        return nullptr;
    }

    bool_ct is_point_at_infinity() const { return _is_infinity; }
    void set_point_at_infinity(const bool_ct& is_infinity) { _is_infinity = is_infinity; }
    element get_standard_form() const;

    void set_origin_tag(OriginTag tag) const
    {
        x.set_origin_tag(tag);
        y.set_origin_tag(tag);
        _is_infinity.set_origin_tag(tag);
    }

    OriginTag get_origin_tag() const
    {
        return OriginTag(x.get_origin_tag(), y.get_origin_tag(), _is_infinity.get_origin_tag());
    }

    /**
     * @brief Unset the free witness flag for the element's tags
     */
    void unset_free_witness_tag()
    {
        x.unset_free_witness_tag();
        y.unset_free_witness_tag();
        _is_infinity.unset_free_witness_tag();
    }

    /**
     * @brief Set the free witness flag for the element's tags
     */
    void set_free_witness_tag()
    {
        x.set_free_witness_tag();
        y.set_free_witness_tag();
        _is_infinity.set_free_witness_tag();
    }

    Fq x;
    Fq y;

  private:
    bool_ct _is_infinity;

    template <size_t num_elements>
    static std::array<twin_rom_table<Builder>, 5> create_group_element_rom_tables(
        const std::array<element, num_elements>& elements, std::array<uint256_t, 8>& limb_max);

    template <size_t num_elements>
    static element read_group_element_rom_tables(const std::array<twin_rom_table<Builder>, 5>& tables,
                                                 const field_t<Builder>& index,
                                                 const std::array<uint256_t, 8>& limb_max);

    static std::pair<element, element> compute_offset_generators(const size_t num_rounds);
    static typename NativeGroup::affine_element compute_table_offset_generator();

    struct four_bit_table_plookup {
        four_bit_table_plookup(){};
        four_bit_table_plookup(const element& input);

        four_bit_table_plookup(const four_bit_table_plookup& other) = default;
        four_bit_table_plookup& operator=(const four_bit_table_plookup& other) = default;

        element operator[](const field_t<Builder>& index) const;
        element operator[](const size_t idx) const { return element_table[idx]; }
        std::array<element, 16> element_table;
        std::array<twin_rom_table<Builder>, 5> coordinates;
        std::array<uint256_t, 8> limb_max; // tracks the maximum limb size represented in each element_table entry
    };

    struct eight_bit_fixed_base_table {
        enum CurveType { BN254, SECP256K1, SECP256R1 };
        eight_bit_fixed_base_table(const CurveType input_curve_type, bool use_endo)
            : curve_type(input_curve_type)
            , use_endomorphism(use_endo){};

        eight_bit_fixed_base_table(const eight_bit_fixed_base_table& other) = default;
        eight_bit_fixed_base_table& operator=(const eight_bit_fixed_base_table& other) = default;

        element operator[](const field_t<Builder>& index) const;

        element operator[](const size_t idx) const;

        CurveType curve_type;
        bool use_endomorphism;
    };

    static std::pair<four_bit_table_plookup, four_bit_table_plookup> create_endo_pair_four_bit_table_plookup(
        const element& input)
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
        Fq beta(bb::fr(beta_val.slice(0, 136)), bb::fr(beta_val.slice(136, 256)), false);
        for (size_t i = 0; i < 8; ++i) {
            endoP1.element_table[i].x = P1.element_table[i].x * beta;
            endoP1.element_table[15 - i].x = endoP1.element_table[i].x;
        }
        P1.coordinates = create_group_element_rom_tables<16>(P1.element_table, P1.limb_max);
        endoP1.coordinates = create_group_element_rom_tables<16>(endoP1.element_table, endoP1.limb_max);
        auto result = std::make_pair(four_bit_table_plookup(P1), four_bit_table_plookup(endoP1));
        return result;
    }

    /**
     * Creates a lookup table for a set of 2, 3 or 4 points
     *
     * The lookup table computes linear combinations of all of the points
     *
     * e.g. for 3 points A, B, C, the table represents the following values:
     *
     * 0 0 0 ->  C+B+A
     * 0 0 1 ->  C+B-A
     * 0 1 0 ->  C-B+A
     * 0 1 1 ->  C-B-A
     * 1 0 0 -> -C+B+A
     * 1 0 1 -> -C+B-A
     * 1 1 0 -> -C-B+A
     * 1 1 1 -> -C-B-A
     *
     * The table KEY is 3 1-bit NAF entries that correspond to scalar multipliers for
     * base points A, B, C
     **/
    template <size_t length> struct lookup_table_base {
        static constexpr size_t table_size = (1ULL << (length - 1));
        lookup_table_base(const std::array<element, length>& inputs);
        lookup_table_base(const lookup_table_base& other) = default;
        lookup_table_base& operator=(const lookup_table_base& other) = default;

        element get(const std::array<bool_ct, length>& bits) const;

        element operator[](const size_t idx) const { return element_table[idx]; }

        std::array<field_t<Builder>, table_size> x_b0_table;
        std::array<field_t<Builder>, table_size> x_b1_table;
        std::array<field_t<Builder>, table_size> x_b2_table;
        std::array<field_t<Builder>, table_size> x_b3_table;

        std::array<field_t<Builder>, table_size> y_b0_table;
        std::array<field_t<Builder>, table_size> y_b1_table;
        std::array<field_t<Builder>, table_size> y_b2_table;
        std::array<field_t<Builder>, table_size> y_b3_table;
        element twin0;
        element twin1;
        std::array<element, table_size> element_table;
    };

    /**
     * The Plookup version of the above lookup table
     *
     * Uses ROM tables to efficiently access lookup table
     **/
    template <size_t length> struct lookup_table_plookup {
        static constexpr size_t table_size = (1ULL << (length));
        lookup_table_plookup() {}
        lookup_table_plookup(const std::array<element, length>& inputs);
        lookup_table_plookup(const lookup_table_plookup& other) = default;
        lookup_table_plookup& operator=(const lookup_table_plookup& other) = default;

        element get(const std::array<bool_ct, length>& bits) const;

        element operator[](const size_t idx) const { return element_table[idx]; }

        std::array<element, table_size> element_table;
        std::array<twin_rom_table<Builder>, 5> coordinates;
        std::array<uint256_t, 8> limb_max;
    };

    using twin_lookup_table = lookup_table_plookup<2>;

    using triple_lookup_table = lookup_table_plookup<3>;

    using quad_lookup_table = lookup_table_plookup<4>;

    /**
     * Creates a pair of 4-bit lookup tables, the former corresponding to 4 input points,
     * the latter corresponding to the endomorphism equivalent of the 4 input points (e.g. x -> \beta * x, y -> -y)
     **/
    static std::pair<quad_lookup_table, quad_lookup_table> create_endo_pair_quad_lookup_table(
        const std::array<element, 4>& inputs)
    {
        quad_lookup_table base_table(inputs);
        quad_lookup_table endo_table;
        uint256_t beta_val = bb::field<typename Fq::TParams>::cube_root_of_unity();
        Fq beta(bb::fr(beta_val.slice(0, 136)), bb::fr(beta_val.slice(136, 256)), false);
        for (size_t i = 0; i < 8; ++i) {
            endo_table.element_table[i + 8].x = base_table[7 - i].x * beta;
            endo_table.element_table[i + 8].y = base_table[7 - i].y;

            endo_table.element_table[7 - i] = (-endo_table.element_table[i + 8]);
        }

        endo_table.coordinates = create_group_element_rom_tables<16>(endo_table.element_table, endo_table.limb_max);
        return std::make_pair<quad_lookup_table, quad_lookup_table>((quad_lookup_table)base_table,
                                                                    (quad_lookup_table)endo_table);
    }

    /**
     * Creates a pair of 5-bit lookup tables, the former corresponding to 5 input points,
     * the latter corresponding to the endomorphism equivalent of the 5 input points (e.g. x -> \beta * x, y -> -y)
     **/
    static std::pair<lookup_table_plookup<5>, lookup_table_plookup<5>> create_endo_pair_five_lookup_table(
        const std::array<element, 5>& inputs)
    {
        lookup_table_plookup<5> base_table(inputs);
        lookup_table_plookup<5> endo_table;
        uint256_t beta_val = bb::field<typename Fq::TParams>::cube_root_of_unity();
        Fq beta(bb::fr(beta_val.slice(0, 136)), bb::fr(beta_val.slice(136, 256)), false);
        for (size_t i = 0; i < 16; ++i) {
            endo_table.element_table[i + 16].x = base_table[15 - i].x * beta;
            endo_table.element_table[i + 16].y = base_table[15 - i].y;

            endo_table.element_table[15 - i] = (-endo_table.element_table[i + 16]);
        }

        endo_table.coordinates = create_group_element_rom_tables<32>(endo_table.element_table, endo_table.limb_max);

        return std::make_pair<lookup_table_plookup<5>, lookup_table_plookup<5>>((lookup_table_plookup<5>)base_table,
                                                                                (lookup_table_plookup<5>)endo_table);
    }

    /**
     * Helper class to split a set of points into lookup table subsets
     *
     * Ultra version
     **/
    struct batch_lookup_table_plookup {
        batch_lookup_table_plookup(const std::vector<element>& points)
        {
            num_points = points.size();
            num_fives = num_points / 5;
            num_sixes = 0;
            // size-6 table is expensive and only benefits us if creating them reduces the number of total tables
            if (num_points == 1) {
                num_fives = 0;
                num_sixes = 0;
            } else if (num_fives * 5 == (num_points - 1)) {
                num_fives -= 1;
                num_sixes = 1;
            } else if (num_fives * 5 == (num_points - 2) && num_fives >= 2) {
                num_fives -= 2;
                num_sixes = 2;
            } else if (num_fives * 5 == (num_points - 3) && num_fives >= 3) {
                num_fives -= 3;
                num_sixes = 3;
            }

            has_quad = ((num_fives * 5 + num_sixes * 6) < num_points - 3) && (num_points >= 4);

            has_triple = ((num_fives * 5 + num_sixes * 6 + (size_t)has_quad * 4) < num_points - 2) && (num_points >= 3);

            has_twin =
                ((num_fives * 5 + num_sixes * 6 + (size_t)has_quad * 4 + (size_t)has_triple * 3) < num_points - 1) &&
                (num_points >= 2);

            has_singleton = num_points != ((num_fives * 5 + num_sixes * 6) + ((size_t)has_quad * 4) +
                                           ((size_t)has_triple * 3) + ((size_t)has_twin * 2));

            size_t offset = 0;
            for (size_t i = 0; i < num_sixes; ++i) {
                six_tables.push_back(lookup_table_plookup<6>({
                    points[offset + 6 * i],
                    points[offset + 6 * i + 1],
                    points[offset + 6 * i + 2],
                    points[offset + 6 * i + 3],
                    points[offset + 6 * i + 4],
                    points[offset + 6 * i + 5],
                }));
            }
            offset += 6 * num_sixes;
            for (size_t i = 0; i < num_fives; ++i) {
                five_tables.push_back(lookup_table_plookup<5>({
                    points[offset + 5 * i],
                    points[offset + 5 * i + 1],
                    points[offset + 5 * i + 2],
                    points[offset + 5 * i + 3],
                    points[offset + 5 * i + 4],
                }));
            }
            offset += 5 * num_fives;

            if (has_quad) {
                quad_tables.push_back(
                    quad_lookup_table({ points[offset], points[offset + 1], points[offset + 2], points[offset + 3] }));
            }

            if (has_triple) {
                triple_tables.push_back(
                    triple_lookup_table({ points[offset], points[offset + 1], points[offset + 2] }));
            }
            if (has_twin) {
                twin_tables.push_back(twin_lookup_table({ points[offset], points[offset + 1] }));
            }

            if (has_singleton) {
                singletons.push_back(points[points.size() - 1]);
            }
        }

        element get_initial_entry() const
        {
            std::vector<element> add_accumulator;
            for (size_t i = 0; i < num_sixes; ++i) {
                add_accumulator.push_back(six_tables[i][0]);
            }
            for (size_t i = 0; i < num_fives; ++i) {
                add_accumulator.push_back(five_tables[i][0]);
            }
            if (has_quad) {
                add_accumulator.push_back(quad_tables[0][0]);
            }
            if (has_twin) {
                add_accumulator.push_back(twin_tables[0][0]);
            }
            if (has_triple) {
                add_accumulator.push_back(triple_tables[0][0]);
            }
            if (has_singleton) {
                add_accumulator.push_back(singletons[0]);
            }

            element accumulator = add_accumulator[0];
            for (size_t i = 1; i < add_accumulator.size(); ++i) {
                accumulator = accumulator + add_accumulator[i];
            }
            return accumulator;
        }

        chain_add_accumulator get_chain_initial_entry() const
        {
            std::vector<element> add_accumulator;
            for (size_t i = 0; i < num_sixes; ++i) {
                add_accumulator.push_back(six_tables[i][0]);
            }
            for (size_t i = 0; i < num_fives; ++i) {
                add_accumulator.push_back(five_tables[i][0]);
            }
            if (has_quad) {
                add_accumulator.push_back(quad_tables[0][0]);
            }
            if (has_twin) {
                add_accumulator.push_back(twin_tables[0][0]);
            }
            if (has_triple) {
                add_accumulator.push_back(triple_tables[0][0]);
            }
            if (has_singleton) {
                add_accumulator.push_back(singletons[0]);
            }
            if (add_accumulator.size() >= 2) {
                chain_add_accumulator output = element::chain_add_start(add_accumulator[0], add_accumulator[1]);
                for (size_t i = 2; i < add_accumulator.size(); ++i) {
                    output = element::chain_add(add_accumulator[i], output);
                }
                return output;
            }
            return chain_add_accumulator(add_accumulator[0]);
        }

        element::chain_add_accumulator get_chain_add_accumulator(std::vector<bool_ct>& naf_entries) const
        {
            std::vector<element> round_accumulator;
            for (size_t j = 0; j < num_sixes; ++j) {
                round_accumulator.push_back(six_tables[j].get({ naf_entries[6 * j],
                                                                naf_entries[6 * j + 1],
                                                                naf_entries[6 * j + 2],
                                                                naf_entries[6 * j + 3],
                                                                naf_entries[6 * j + 4],
                                                                naf_entries[6 * j + 5] }));
            }
            size_t offset = num_sixes * 6;
            for (size_t j = 0; j < num_fives; ++j) {
                round_accumulator.push_back(five_tables[j].get({ naf_entries[offset + j * 5],
                                                                 naf_entries[offset + j * 5 + 1],
                                                                 naf_entries[offset + j * 5 + 2],
                                                                 naf_entries[offset + j * 5 + 3],
                                                                 naf_entries[offset + j * 5 + 4] }));
            }
            offset += num_fives * 5;
            if (has_quad) {
                round_accumulator.push_back(quad_tables[0].get({ naf_entries[offset],
                                                                 naf_entries[offset + 1],
                                                                 naf_entries[offset + 2],
                                                                 naf_entries[offset + 3] }));
            }

            if (has_triple) {
                round_accumulator.push_back(
                    triple_tables[0].get({ naf_entries[offset], naf_entries[offset + 1], naf_entries[offset + 2] }));
            }
            if (has_twin) {
                round_accumulator.push_back(twin_tables[0].get({ naf_entries[offset], naf_entries[offset + 1] }));
            }
            if (has_singleton) {
                round_accumulator.push_back(singletons[0].conditional_negate(naf_entries[num_points - 1]));
            }

            element::chain_add_accumulator accumulator;
            if (round_accumulator.size() == 1) {
                return element::chain_add_accumulator(round_accumulator[0]);
            } else if (round_accumulator.size() == 2) {
                return element::chain_add_start(round_accumulator[0], round_accumulator[1]);
            } else {
                accumulator = element::chain_add_start(round_accumulator[0], round_accumulator[1]);
                for (size_t j = 2; j < round_accumulator.size(); ++j) {
                    accumulator = element::chain_add(round_accumulator[j], accumulator);
                }
            }
            return (accumulator);
        }

        element get(std::vector<bool_ct>& naf_entries) const
        {
            std::vector<element> round_accumulator;
            for (size_t j = 0; j < num_sixes; ++j) {
                round_accumulator.push_back(six_tables[j].get({ naf_entries[6 * j],
                                                                naf_entries[6 * j + 1],
                                                                naf_entries[6 * j + 2],
                                                                naf_entries[6 * j + 3],
                                                                naf_entries[6 * j + 4],
                                                                naf_entries[6 * j + 5] }));
            }
            size_t offset = num_sixes * 6;

            for (size_t j = 0; j < num_fives; ++j) {
                round_accumulator.push_back(five_tables[j].get({ naf_entries[offset + 5 * j],
                                                                 naf_entries[offset + 5 * j + 1],
                                                                 naf_entries[offset + 5 * j + 2],
                                                                 naf_entries[offset + 5 * j + 3],
                                                                 naf_entries[offset + 5 * j + 4] }));
            }

            offset += num_fives * 5;

            if (has_quad) {
                round_accumulator.push_back(quad_tables[0].get(
                    naf_entries[offset], naf_entries[offset + 1], naf_entries[offset + 2], naf_entries[offset + 3]));
            }

            if (has_triple) {
                round_accumulator.push_back(
                    triple_tables[0].get(naf_entries[offset], naf_entries[offset + 1], naf_entries[offset + 2]));
            }
            if (has_twin) {
                round_accumulator.push_back(twin_tables[0].get(naf_entries[offset], naf_entries[offset + 1]));
            }
            if (has_singleton) {
                round_accumulator.push_back(singletons[0].conditional_negate(naf_entries[num_points - 1]));
            }

            element result = round_accumulator[0];
            element::chain_add_accumulator accumulator;
            if (round_accumulator.size() == 1) {
                return result;
            } else if (round_accumulator.size() == 2) {
                return result + round_accumulator[1];
            } else {
                accumulator = element::chain_add_start(round_accumulator[0], round_accumulator[1]);
                for (size_t j = 2; j < round_accumulator.size(); ++j) {
                    accumulator = element::chain_add(round_accumulator[j], accumulator);
                }
            }
            return element::chain_add_end(accumulator);
        }

        std::vector<lookup_table_plookup<6>> six_tables;
        std::vector<lookup_table_plookup<5>> five_tables;
        std::vector<quad_lookup_table> quad_tables;
        std::vector<triple_lookup_table> triple_tables;
        std::vector<twin_lookup_table> twin_tables;
        std::vector<element> singletons;
        size_t num_points;

        size_t num_sixes;
        size_t num_fives;
        bool has_quad;
        bool has_triple;
        bool has_twin;
        bool has_singleton;
    };

    /**
     * Helper class to split a set of points into lookup table subsets
     *
     **/
    struct batch_lookup_table_base {
        batch_lookup_table_base(const std::vector<element>& points)
        {
            num_points = points.size();
            num_quads = num_points / 4;

            has_triple = ((num_quads * 4) < num_points - 2) && (num_points >= 3);

            has_twin = ((num_quads * 4 + (size_t)has_triple * 3) < num_points - 1) && (num_points >= 2);

            has_singleton = num_points != (num_quads * 4 + ((size_t)has_triple * 3) + ((size_t)has_twin * 2));

            for (size_t i = 0; i < num_quads; ++i) {
                quad_tables.push_back(
                    quad_lookup_table({ points[4 * i], points[4 * i + 1], points[4 * i + 2], points[4 * i + 3] }));
            }

            if (has_triple) {
                triple_tables.push_back(triple_lookup_table(
                    { points[4 * num_quads], points[4 * num_quads + 1], points[4 * num_quads + 2] }));
            }
            if (has_twin) {
                twin_tables.push_back(twin_lookup_table({ points[4 * num_quads], points[4 * num_quads + 1] }));
            }

            if (has_singleton) {
                singletons.push_back(points[points.size() - 1]);
            }
        }

        element get_initial_entry() const
        {
            std::vector<element> add_accumulator;
            for (size_t i = 0; i < num_quads; ++i) {
                add_accumulator.push_back(quad_tables[i][0]);
            }
            if (has_twin) {
                add_accumulator.push_back(twin_tables[0][0]);
            }
            if (has_triple) {
                add_accumulator.push_back(triple_tables[0][0]);
            }
            if (has_singleton) {
                add_accumulator.push_back(singletons[0]);
            }

            element accumulator = add_accumulator[0];
            for (size_t i = 1; i < add_accumulator.size(); ++i) {
                accumulator = accumulator + add_accumulator[i];
            }
            return accumulator;
        }

        chain_add_accumulator get_chain_initial_entry() const
        {
            std::vector<element> add_accumulator;
            for (size_t i = 0; i < num_quads; ++i) {
                add_accumulator.push_back(quad_tables[i][0]);
            }
            if (has_twin) {
                add_accumulator.push_back(twin_tables[0][0]);
            }
            if (has_triple) {
                add_accumulator.push_back(triple_tables[0][0]);
            }
            if (has_singleton) {
                add_accumulator.push_back(singletons[0]);
            }
            if (add_accumulator.size() >= 2) {
                chain_add_accumulator output = element::chain_add_start(add_accumulator[0], add_accumulator[1]);
                for (size_t i = 2; i < add_accumulator.size(); ++i) {
                    output = element::chain_add(add_accumulator[i], output);
                }
                return output;
            }
            return chain_add_accumulator(add_accumulator[0]);
        }

        element::chain_add_accumulator get_chain_add_accumulator(std::vector<bool_ct>& naf_entries) const
        {
            std::vector<element> round_accumulator;
            for (size_t j = 0; j < num_quads; ++j) {
                round_accumulator.push_back(quad_tables[j].get(std::array<bool_ct, 4>{
                    naf_entries[4 * j], naf_entries[4 * j + 1], naf_entries[4 * j + 2], naf_entries[4 * j + 3] }));
            }

            if (has_triple) {
                round_accumulator.push_back(triple_tables[0].get(std::array<bool_ct, 3>{
                    naf_entries[num_quads * 4], naf_entries[num_quads * 4 + 1], naf_entries[num_quads * 4 + 2] }));
            }
            if (has_twin) {
                round_accumulator.push_back(twin_tables[0].get(
                    std::array<bool_ct, 2>{ naf_entries[num_quads * 4], naf_entries[num_quads * 4 + 1] }));
            }
            if (has_singleton) {
                round_accumulator.push_back(singletons[0].conditional_negate(naf_entries[num_points - 1]));
            }

            element::chain_add_accumulator accumulator;
            if (round_accumulator.size() == 1) {
                accumulator.x3_prev = round_accumulator[0].x;
                accumulator.y3_prev = round_accumulator[0].y;
                accumulator.is_element = true;
                return accumulator;
            } else if (round_accumulator.size() == 2) {
                return element::chain_add_start(round_accumulator[0], round_accumulator[1]);
            } else {
                accumulator = element::chain_add_start(round_accumulator[0], round_accumulator[1]);
                for (size_t j = 2; j < round_accumulator.size(); ++j) {
                    accumulator = element::chain_add(round_accumulator[j], accumulator);
                }
            }
            return (accumulator);
        }

        element get(std::vector<bool_ct>& naf_entries) const
        {
            std::vector<element> round_accumulator;
            for (size_t j = 0; j < num_quads; ++j) {
                round_accumulator.push_back(quad_tables[j].get(
                    { naf_entries[4 * j], naf_entries[4 * j + 1], naf_entries[4 * j + 2], naf_entries[4 * j + 3] }));
            }

            if (has_triple) {
                round_accumulator.push_back(triple_tables[0].get(std::array<bool_ct, 3>{
                    naf_entries[num_quads * 4], naf_entries[num_quads * 4 + 1], naf_entries[num_quads * 4 + 2] }));
            }
            if (has_twin) {
                round_accumulator.push_back(
                    twin_tables[0].get({ naf_entries[num_quads * 4], naf_entries[num_quads * 4 + 1] }));
            }
            if (has_singleton) {
                round_accumulator.push_back(singletons[0].conditional_negate(naf_entries[num_points - 1]));
            }

            element result = round_accumulator[0];
            element::chain_add_accumulator accumulator;
            if (round_accumulator.size() == 1) {
                return result;
            } else if (round_accumulator.size() == 2) {
                return result + round_accumulator[1];
            } else {
                accumulator = element::chain_add_start(round_accumulator[0], round_accumulator[1]);
                for (size_t j = 2; j < round_accumulator.size(); ++j) {
                    accumulator = element::chain_add(round_accumulator[j], accumulator);
                }
            }
            return element::chain_add_end(accumulator);
        }

        std::vector<quad_lookup_table> quad_tables;
        std::vector<triple_lookup_table> triple_tables;
        std::vector<twin_lookup_table> twin_tables;
        std::vector<element> singletons;
        size_t num_points;

        size_t num_quads;
        bool has_triple;
        bool has_twin;
        bool has_singleton;
    };

    using batch_lookup_table = batch_lookup_table_plookup;
};

template <typename C, typename Fq, typename Fr, typename G>
inline std::ostream& operator<<(std::ostream& os, element<C, Fq, Fr, G> const& v)
{
    return os << "{ " << v.x << " , " << v.y << " }";
}
} // namespace bb::stdlib::element_default

namespace bb::stdlib {
template <typename T>
concept IsBigGroup = std::is_same_v<typename T::biggroup_tag, T>;

template <typename Builder, class Fq, class Fr, class NativeGroup>
concept IsGoblinBigGroup =
    IsMegaBuilder<Builder> && std::same_as<Fq, bb::stdlib::bigfield<Builder, bb::Bn254FqParams>> &&
    std::same_as<Fr, bb::stdlib::field_t<Builder>> && std::same_as<NativeGroup, bb::g1>;

/**
 * @brief element wraps either element_default::element or element_goblin::goblin_element depending on parametrisation
 * @details if C = MegaBuilder, G = bn254, Fq = bigfield<C, bb::Bn254FqParams>, Fr = field_t then we're cooking
 */
template <typename C, typename Fq, typename Fr, typename G>
using element = std::conditional_t<IsGoblinBigGroup<C, Fq, Fr, G>,
                                   element_goblin::goblin_element<C, goblin_field<C>, Fr, G>,
                                   element_default::element<C, Fq, Fr, G>>;
} // namespace bb::stdlib
#include "biggroup_batch_mul.hpp"
#include "biggroup_bn254.hpp"
#include "biggroup_goblin.hpp"
#include "biggroup_impl.hpp"
#include "biggroup_nafs.hpp"
#include "biggroup_secp256k1.hpp"
#include "biggroup_tables.hpp"

#include "barretenberg/stdlib/primitives/bigfield/bigfield.hpp"
#include "barretenberg/numeric/random/engine.hpp"

#include "barretenberg/ecc/curves/bn254/fq.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"

#include "../bool/bool.hpp"
#include "../byte_array/byte_array.hpp"
#include "../field/field.hpp"
#include "./bigfield.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/numeric/uintx/uintx.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib/primitives/curves/secp256k1.hpp"
#include "barretenberg/stdlib/primitives/curves/secp256r1.hpp"
#include "barretenberg/transcript/origin_tag.hpp"
#include <gtest/gtest.h>
#include <memory>
#include <utility>

using namespace bb;

namespace {
auto& engine = numeric::get_debug_randomness();
}

enum struct InputType {
    WITNESS,
    CONSTANT,
};

constexpr InputType operator!(InputType type)
{
    return (type == InputType::WITNESS) ? InputType::CONSTANT : InputType::WITNESS;
}

// Helper to extract Builder and Params from bigfield<Builder, Params>
template <typename T> struct extract_builder;
template <typename T> struct extract_fq_params;

template <template <typename, typename> class BigField, typename Builder, typename Params>
struct extract_builder<BigField<Builder, Params>> {
    using type = Builder;
};

template <template <typename, typename> class BigField, typename Builder, typename Params>
struct extract_fq_params<BigField<Builder, Params>> {
    using type = Params;
};

template <typename BigField> using builder_t = typename extract_builder<BigField>::type;
template <typename BigField> using params_t = typename extract_fq_params<BigField>::type;

STANDARD_TESTING_TAGS
template <typename BigField> class stdlib_bigfield : public testing::Test {

    using Builder = builder_t<BigField>;                            // extract builder from BigField
    using fr_ct = typename bb::stdlib::bn254<Builder>::ScalarField; // native circuit field
    using fq_native = bb::field<params_t<BigField>>;                // native bigfield type
    using fq_ct = BigField;                                         // non-native field (circuit type)
    using witness_ct = stdlib::witness_t<Builder>;                  // circuit witness type
    using bool_ct = stdlib::bool_t<Builder>;                        // circuit boolean type
    using byte_array_ct = stdlib::byte_array<Builder>;              // circuit byte array type

  public:
    static void test_add_to_lower_limb_regression()
    {
        auto builder = Builder();
        fq_ct constant = fq_ct(1);
        fq_ct var = fq_ct::create_from_u512_as_witness(&builder, 1);
        fr_ct small_var = witness_ct(&builder, fr(1));
        fq_ct mixed = fq_ct(1).add_to_lower_limb(small_var, 1);
        fq_ct r;

        r = mixed + mixed;
        r = mixed - mixed;
        r = mixed + var;
        r = mixed + constant;
        r = mixed - var;
        r = mixed - constant;
        r = var - mixed;

        r = var * constant;
        r = constant / var;
        r = constant * constant;
        r = constant / constant;

        r = mixed * var;
        r = mixed / var;
        r = mixed * mixed;
        r = mixed * constant;
        bool result = CircuitChecker::check(builder);
        EXPECT_EQ(result, true);
    }

    // The bug happens when we are applying the CRT formula to a*b < r, which can happen when using the division
    // operator
    static void test_division_formula_bug()
    {
        auto builder = Builder();
        uint256_t value(2);
        fq_ct tval = fq_ct::create_from_u512_as_witness(&builder, value);
        fq_ct tval1 = tval - tval;
        fq_ct tval2 = tval1 / tval;
        (void)tval2;
        bool result = CircuitChecker::check(builder);
        EXPECT_EQ(result, true);
    }

    static void test_bad_mul()
    {
        auto builder = Builder();
        uint256_t value(2);
        fq_ct tval = fq_ct::create_from_u512_as_witness(&builder, value);
        fq_ct tval1 = tval - tval;
        fq_ct tval2 = tval1 / tval;
        (void)tval2;
        bool result = CircuitChecker::check(builder);
        EXPECT_EQ(result, true);
    }

    // Gets a random bigfield element that is a circuit-witness
    static std::pair<fq_native, fq_ct> get_random_witness(Builder* builder, bool reduce_input = false)
    {
        fq_native elt_native = fq_native::random_element();
        if (reduce_input) {
            elt_native = elt_native.reduce_once().reduce_once();
        }
        fr elt_native_lo = fr(uint256_t(elt_native).slice(0, fq_ct::NUM_LIMB_BITS * 2));
        fr elt_native_hi = fr(uint256_t(elt_native).slice(fq_ct::NUM_LIMB_BITS * 2, fq_ct::NUM_LIMB_BITS * 4));
        fq_ct elt_ct(witness_ct(builder, elt_native_lo), witness_ct(builder, elt_native_hi));
        // UNset free witness tag so we don't have to unset it in every test
        elt_ct.unset_free_witness_tag();
        return std::make_pair(elt_native, elt_ct);
    }

    // Gets a random bigfield element that is a circuit-constant
    static std::pair<fq_native, fq_ct> get_random_constant(Builder* builder, bool reduce_input = false)
    {
        fq_native elt_native = fq_native::random_element();
        if (reduce_input) {
            elt_native = elt_native.reduce_once().reduce_once();
        }
        fq_ct elt_ct(builder, uint256_t(elt_native));
        return std::make_pair(elt_native, elt_ct);
    }

    // Gets a random bigfield element that may be either circuit-witness or cirucit-constant
    static std::pair<fq_native, fq_ct> get_random_element(Builder* builder, bool reduce_input = false)
    {
        return (engine.get_random_uint8() & 1) == 1 ? get_random_witness(builder, reduce_input)
                                                    : get_random_constant(builder, reduce_input);
    }

    static std::pair<fq_native, fq_ct> get_random_element(Builder* builder, InputType type, bool reduce_input = false)
    {
        if (type == InputType::WITNESS) {
            return get_random_witness(builder, reduce_input);
        }
        return get_random_constant(builder, reduce_input);
    }

    static std::pair<std::vector<fq_native>, std::vector<fq_ct>> get_random_witnesses(Builder* builder,
                                                                                      size_t num,
                                                                                      bool reduce_input = false)
    {
        std::vector<fq_native> elts(num);
        std::vector<fq_ct> big_elts(num);
        for (size_t i = 0; i < num; ++i) {
            auto [elt, big_elt] = get_random_witness(builder, reduce_input);
            elts[i] = elt;
            big_elts[i] = big_elt;
        }
        return std::make_pair(elts, big_elts);
    }

    static std::pair<std::vector<fq_native>, std::vector<fq_ct>> get_random_constants(Builder* builder,
                                                                                      size_t num,
                                                                                      bool reduce_input = false)
    {
        std::vector<fq_native> elts(num);
        std::vector<fq_ct> big_elts(num);
        for (size_t i = 0; i < num; ++i) {
            auto [elt, big_elt] = get_random_constant(builder, reduce_input);
            elts[i] = elt;
            big_elts[i] = big_elt;
        }
        return std::make_pair(elts, big_elts);
    }

    static std::pair<std::vector<fq_native>, std::vector<fq_ct>> get_random_elements(Builder* builder,
                                                                                     InputType type,
                                                                                     size_t num,
                                                                                     bool reduce_input = false)
    {
        std::vector<fq_native> elts(num);
        std::vector<fq_ct> big_elts(num);
        for (size_t i = 0; i < num; ++i) {
            auto [elt, big_elt] = get_random_element(builder, type, reduce_input);
            elts[i] = elt;
            big_elts[i] = big_elt;
        }
        return std::make_pair(elts, big_elts);
    }

    static void test_basic_tag_logic()
    {
        auto builder = Builder();
        auto [a_native, a_ct] = get_random_witness(&builder); // fq_native, fq_ct

        a_ct.binary_basis_limbs[0].element.set_origin_tag(submitted_value_origin_tag);
        a_ct.binary_basis_limbs[1].element.set_origin_tag(challenge_origin_tag);
        a_ct.prime_basis_limb.set_origin_tag(next_challenge_tag);

        EXPECT_EQ(a_ct.get_origin_tag(), first_second_third_merged_tag);

        a_ct.set_origin_tag(clear_tag);
        EXPECT_EQ(a_ct.binary_basis_limbs[0].element.get_origin_tag(), clear_tag);
        EXPECT_EQ(a_ct.binary_basis_limbs[1].element.get_origin_tag(), clear_tag);
        EXPECT_EQ(a_ct.binary_basis_limbs[2].element.get_origin_tag(), clear_tag);
        EXPECT_EQ(a_ct.binary_basis_limbs[3].element.get_origin_tag(), clear_tag);
        EXPECT_EQ(a_ct.prime_basis_limb.get_origin_tag(), clear_tag);

#ifndef NDEBUG
        a_ct.set_origin_tag(instant_death_tag);
        EXPECT_THROW(a_ct + a_ct, std::runtime_error);
#endif
    }

    static void test_constructor_from_two_elements()
    {
        auto builder = Builder();
        {
            fr elt_native_lo = fr(uint256_t(fr::random_element()).slice(0, fq_ct::NUM_LIMB_BITS * 2)); // 136 bits
            fr elt_native_hi = fr(uint256_t(fr::random_element()).slice(0, fq_ct::NUM_LIMB_BITS * 2)); // 136 bits
            fq_ct elt_witness_ct =
                fq_ct(witness_ct(&builder, elt_native_lo), witness_ct(&builder, elt_native_hi), true);
            fq_ct elt_constant_ct = fq_ct(fr_ct(&builder, elt_native_lo), fr_ct(&builder, elt_native_hi), true);
        }
        {
            fr elt_native_lo = fr(uint256_t(fr::random_element()).slice(0, fq_ct::NUM_LIMB_BITS * 2));     // 136 bits
            fr elt_native_hi = fr(uint256_t(fr::random_element()).slice(0, fq_ct::NUM_LIMB_BITS * 2 - 3)); // 133 bits
            fq_ct elt_witness_ct = fq_ct(witness_ct(&builder, elt_native_lo),
                                         witness_ct(&builder, elt_native_hi),
                                         false, // can_overflow must be false as max_bitlength is provided
                                         4 * fq_ct::NUM_LIMB_BITS - 3);
            fq_ct elt_constant_ct = fq_ct(fr_ct(&builder, elt_native_lo),
                                          fr_ct(&builder, elt_native_hi),
                                          false, // can_overflow must be false as max_bitlength is provided
                                          4 * fq_ct::NUM_LIMB_BITS - 3);
        }
        bool result = CircuitChecker::check(builder);
        EXPECT_EQ(result, true);
    }

    static void test_unsafe_construct_from_limbs()
    {
        auto builder = Builder();
        fr limb_1_native = fr(uint256_t(fr::random_element()).slice(0, fq_ct::NUM_LIMB_BITS + 10)); // 78 bits
        fr limb_2_native = fr(uint256_t(fr::random_element()).slice(0, fq_ct::NUM_LIMB_BITS + 10)); // 78 bits
        fr limb_3_native = fr(uint256_t(fr::random_element()).slice(0, fq_ct::NUM_LIMB_BITS + 10)); // 78 bits
        fr limb_4_native = fr(uint256_t(fr::random_element()).slice(0, fq_ct::NUM_LIMB_BITS + 12)); // 80 bits

        fr_ct limb_1_ct = fr_ct(witness_ct(&builder, limb_1_native));
        fr_ct limb_2_ct = fr_ct(witness_ct(&builder, limb_2_native));
        fr_ct limb_3_ct = fr_ct(witness_ct(&builder, limb_3_native));
        fr_ct limb_4_ct = fr_ct(witness_ct(&builder, limb_4_native));

        // This does not add any range constraints on the limbs, so virtually any limb values are valid.
        // It does however correctly compute the prime basis limb (from the supplied limbs).
        fq_ct result = fq_ct::unsafe_construct_from_limbs(limb_1_ct, limb_2_ct, limb_3_ct, limb_4_ct);

        fr expected_prime_limb = limb_1_native;
        expected_prime_limb += (limb_2_native * fq_ct::shift_1);
        expected_prime_limb += (limb_3_native * fq_ct::shift_2);
        expected_prime_limb += (limb_4_native * fq_ct::shift_3);
        EXPECT_EQ(expected_prime_limb, result.prime_basis_limb.get_value());

        // The other constructor takes in the prime limb as well (without any checks).
        fq_ct result_1 = fq_ct::unsafe_construct_from_limbs(
            limb_1_ct, limb_2_ct, limb_3_ct, limb_4_ct, witness_ct(&builder, fr::random_element()));
        EXPECT_EQ(result.binary_basis_limbs[0].element.get_value(), result_1.binary_basis_limbs[0].element.get_value());

        bool result_check = CircuitChecker::check(builder);
        EXPECT_EQ(result_check, true);
    }

    static void test_construct_from_limbs()
    {
        auto builder = Builder();
        fr limb_1_native = fr(uint256_t(fr::random_element()).slice(0, fq_ct::NUM_LIMB_BITS));      // 68 bits
        fr limb_2_native = fr(uint256_t(fr::random_element()).slice(0, fq_ct::NUM_LIMB_BITS));      // 68 bits
        fr limb_3_native = fr(uint256_t(fr::random_element()).slice(0, fq_ct::NUM_LIMB_BITS));      // 68 bits
        fr limb_4_native = fr(uint256_t(fr::random_element()).slice(0, fq_ct::NUM_LAST_LIMB_BITS)); // |p|-3*68 bits

        fr_ct limb_1_ct = fr_ct(witness_ct(&builder, limb_1_native));
        fr_ct limb_2_ct = fr_ct(witness_ct(&builder, limb_2_native));
        fr_ct limb_3_ct = fr_ct(witness_ct(&builder, limb_3_native));
        fr_ct limb_4_ct = fr_ct(witness_ct(&builder, limb_4_native));

        // This does add range constraints on the limbs, so the limbs must be in range.
        // It also correctly computes the prime basis limb (from the supplied limbs).
        fq_ct result = fq_ct::construct_from_limbs(limb_1_ct, limb_2_ct, limb_3_ct, limb_4_ct);

        fr expected_prime_limb = limb_1_native;
        expected_prime_limb += (limb_2_native * fq_ct::shift_1);
        expected_prime_limb += (limb_3_native * fq_ct::shift_2);
        expected_prime_limb += (limb_4_native * fq_ct::shift_3);
        EXPECT_EQ(expected_prime_limb, result.prime_basis_limb.get_value());

        // All four limbs as 68-bit range constrained (fourth limb is set equal to limb_3)
        fq_ct result_1 = fq_ct::construct_from_limbs(limb_1_ct, limb_2_ct, limb_3_ct, limb_3_ct, /*can_overflow=*/true);
        EXPECT_EQ(result.binary_basis_limbs[0].element.get_value(), result_1.binary_basis_limbs[0].element.get_value());

        bool result_check = CircuitChecker::check(builder);
        EXPECT_EQ(result_check, true);
    }

    static void test_construct_from_limbs_fails()
    {
        auto builder = Builder();
        fr limb_1_native = fr(uint256_t(fr::random_element()).slice(0, fq_ct::NUM_LIMB_BITS));      // 68 bits
        fr limb_2_native = fr(uint256_t(fr::random_element()).slice(0, fq_ct::NUM_LIMB_BITS));      // 68 bits
        fr limb_3_native = fr(uint256_t(fr::random_element()).slice(0, fq_ct::NUM_LIMB_BITS));      // 68 bits
        fr limb_4_native = fr(uint256_t(fr::random_element()).slice(0, fq_ct::NUM_LAST_LIMB_BITS)); // |p|-3*68 bits

        // Make limb_1 out of range
        limb_1_native = uint256_t(limb_1_native) + (uint256_t(1) << fq_ct::NUM_LIMB_BITS);

        fr_ct limb_1_ct = fr_ct(witness_ct(&builder, limb_1_native));
        fr_ct limb_2_ct = fr_ct(witness_ct(&builder, limb_2_native));
        fr_ct limb_3_ct = fr_ct(witness_ct(&builder, limb_3_native));
        fr_ct limb_4_ct = fr_ct(witness_ct(&builder, limb_4_native));

        // This will fail because limb_1 is out of range
        fq_ct result = fq_ct::construct_from_limbs(limb_1_ct, limb_2_ct, limb_3_ct, limb_4_ct);
        fr expected_prime_limb = limb_1_native;
        expected_prime_limb += (limb_2_native * fq_ct::shift_1);
        expected_prime_limb += (limb_3_native * fq_ct::shift_2);
        expected_prime_limb += (limb_4_native * fq_ct::shift_3);
        EXPECT_EQ(expected_prime_limb, result.prime_basis_limb.get_value());

        bool result_check = CircuitChecker::check(builder);
        EXPECT_EQ(result_check, false);
        EXPECT_EQ(builder.err(), "bigfield::construct_from_limbs: limb 0 or 1 too large: lo limb.");
    }

    static void test_add_two(InputType a_type, InputType b_type, InputType c_type)
    {
        auto builder = Builder();
        size_t num_repetitions = 10;
        for (size_t i = 0; i < num_repetitions; ++i) {
            auto [a_native, a_ct] = get_random_element(&builder, a_type); // fq, fq_ct
            auto [b_native, b_ct] = get_random_element(&builder, b_type); // fq, fq_ct
            auto [c_native, c_ct] = get_random_element(&builder, c_type); // fq, fq_ct

            a_ct.set_origin_tag(submitted_value_origin_tag);
            b_ct.set_origin_tag(challenge_origin_tag);

            fq_ct d_ct;
            if (i == num_repetitions - 1) {
                BENCH_GATE_COUNT_START(builder, "ADD_TWO");
                d_ct = a_ct.add_two(b_ct, c_ct);
                BENCH_GATE_COUNT_END(builder, "ADD_TWO");
            } else {
                d_ct = a_ct.add_two(b_ct, c_ct);
            }
            d_ct.self_reduce();

            // Addition merges tags
            EXPECT_EQ(d_ct.get_origin_tag(), first_two_merged_tag);

            fq_native expected = (a_native + b_native + c_native).reduce_once().reduce_once();
            expected = expected.from_montgomery_form();
            uint512_t result = d_ct.get_value();

            EXPECT_EQ(result.lo.data[0], expected.data[0]);
            EXPECT_EQ(result.lo.data[1], expected.data[1]);
            EXPECT_EQ(result.lo.data[2], expected.data[2]);
            EXPECT_EQ(result.lo.data[3], expected.data[3]);
            EXPECT_EQ(result.hi.data[0], 0ULL);
            EXPECT_EQ(result.hi.data[1], 0ULL);
            EXPECT_EQ(result.hi.data[2], 0ULL);
            EXPECT_EQ(result.hi.data[3], 0ULL);
        }
        bool result = CircuitChecker::check(builder);
        EXPECT_EQ(result, true);
    }

    static void test_sum(InputType a_type, bool mixed_inputs = false)
    {
        auto builder = Builder();
        std::vector<size_t> num_elements_to_sum = { 1, 2, 10, 20 };

        for (size_t num_elements : num_elements_to_sum) {
            auto [a_native, a_ct] = get_random_elements(&builder, a_type, num_elements);  // fq, fq_ct
            auto [b_native, b_ct] = get_random_elements(&builder, !a_type, num_elements); // fq, fq_ct

            std::vector<fq_ct> to_sum;
            for (size_t j = 0; j < num_elements; ++j) {
                to_sum.push_back(a_ct[j]);
                to_sum.back().set_origin_tag(submitted_value_origin_tag);

                if (mixed_inputs) {
                    to_sum.push_back(b_ct[j]);
                    to_sum.back().set_origin_tag(challenge_origin_tag);
                }
            }

            fq_ct c_ct;
            if (num_elements == 20) {
                BENCH_GATE_COUNT_START(builder, "SUM");
                c_ct = fq_ct::sum(to_sum);
                BENCH_GATE_COUNT_END(builder, "SUM");
            } else {
                c_ct = fq_ct::sum(to_sum);
            }

            // Need to self-reduce as we are summing potentially many elements
            c_ct.self_reduce();

            // Sum merges tags
            const auto output_tag = (mixed_inputs) ? first_two_merged_tag : submitted_value_origin_tag;
            EXPECT_EQ(c_ct.get_origin_tag(), output_tag);

            fq_native expected = fq_native::zero();
            for (size_t j = 0; j < num_elements; ++j) {
                expected += a_native[j];

                if (mixed_inputs) {
                    expected += b_native[j];
                }
            }
            expected = expected.from_montgomery_form();
            uint512_t result = c_ct.get_value();

            EXPECT_EQ(result.lo.data[0], expected.data[0]);
            EXPECT_EQ(result.lo.data[1], expected.data[1]);
            EXPECT_EQ(result.lo.data[2], expected.data[2]);
            EXPECT_EQ(result.lo.data[3], expected.data[3]);
            EXPECT_EQ(result.hi.data[0], 0ULL);
            EXPECT_EQ(result.hi.data[1], 0ULL);
            EXPECT_EQ(result.hi.data[2], 0ULL);
            EXPECT_EQ(result.hi.data[3], 0ULL);
        }

        bool result = CircuitChecker::check(builder);
        EXPECT_EQ(result, true);
    }

    // Generic binary operator test function
    template <typename CircuitOpFunc, typename NativeOpFunc>
    static void test_binary_operator_generic(InputType a_type,
                                             InputType b_type,
                                             CircuitOpFunc circuit_op,
                                             NativeOpFunc native_op,
                                             const char* op_name,
                                             size_t num_repetitions = 10,
                                             bool need_reduced_inputs = false,
                                             bool need_reduction_after = false,
                                             bool do_tags_merge = true)
    {
        auto builder = Builder();
        for (size_t i = 0; i < num_repetitions; ++i) {
            auto [a_native, a_ct] = get_random_element(&builder, a_type, need_reduced_inputs); // fq_native, fq_ct
            auto [b_native, b_ct] = get_random_element(&builder, b_type, need_reduced_inputs); // fq_native, fq_ct
            a_ct.set_origin_tag(submitted_value_origin_tag);
            b_ct.set_origin_tag(challenge_origin_tag);

            fq_ct c_ct;
            if (i == num_repetitions - 1) {
                std::string bench_name = std::string(op_name);
                BENCH_GATE_COUNT_START(builder, bench_name.c_str());
                c_ct = circuit_op(a_ct, b_ct);
                BENCH_GATE_COUNT_END(builder, bench_name.c_str());
            } else {
                c_ct = circuit_op(a_ct, b_ct);
            }

            // Some operations (add, sub, div) may need a self-reduction to get back into the field range
            if (need_reduction_after) {
                c_ct.self_reduce();
            }

            if (do_tags_merge) {
                // Binary operations merge tags
                EXPECT_EQ(c_ct.get_origin_tag(), first_two_merged_tag);
            }

            fq_native expected = native_op(a_native, b_native);
            if (need_reduction_after) {
                expected = expected.reduce_once().reduce_once();
            }
            expected = expected.from_montgomery_form();
            uint512_t result = c_ct.get_value();

            EXPECT_EQ(result.lo.data[0], expected.data[0]);
            EXPECT_EQ(result.lo.data[1], expected.data[1]);
            EXPECT_EQ(result.lo.data[2], expected.data[2]);
            EXPECT_EQ(result.lo.data[3], expected.data[3]);
            EXPECT_EQ(result.hi.data[0], 0ULL);
            EXPECT_EQ(result.hi.data[1], 0ULL);
            EXPECT_EQ(result.hi.data[2], 0ULL);
            EXPECT_EQ(result.hi.data[3], 0ULL);
        }
        bool result = CircuitChecker::check(builder);
        EXPECT_EQ(result, true);
    }

#define BINARY_OP_TEST(op_name, bench_name, op_symbol, repetitions, reduced_inputs, reduction_after)                   \
    static void test_##op_name(InputType a_type, InputType b_type)                                                     \
    {                                                                                                                  \
        test_binary_operator_generic(                                                                                  \
            a_type,                                                                                                    \
            b_type,                                                                                                    \
            [](const fq_ct& a, const fq_ct& b) { return a op_symbol b; },                                              \
            [](const fq_native& a, const fq_native& b) { return a op_symbol b; },                                      \
            #bench_name,                                                                                               \
            repetitions,                                                                                               \
            reduced_inputs,                                                                                            \
            reduction_after);                                                                                          \
    }

    BINARY_OP_TEST(mul, MUL, *, 10, false, false)
    BINARY_OP_TEST(add, ADD, +, 10, false, true)
    BINARY_OP_TEST(sub, SUB, -, 10, false, true)
    BINARY_OP_TEST(div, DIV, /, 10, true, true)

    static void test_negate(InputType a_type)
    {
        test_binary_operator_generic(
            a_type,
            InputType::CONSTANT, // b is unused
            [](const fq_ct& a, const fq_ct&) { return -a; },
            [](const fq_native& a, const fq_native&) { return -a; },
            "NEGATE",
            10,
            false, // need_reduced_inputs
            true,  // need_reduction_after
            false  // check_output_tag
        );
    }

    static void test_sqr(InputType a_type)
    {
        test_binary_operator_generic(
            a_type,
            InputType::CONSTANT, // b is unused
            [](const fq_ct& a, const fq_ct&) { return a.sqr(); },
            [](const fq_native& a, const fq_native&) { return a.sqr(); },
            "SQR",
            10,
            false,
            false,
            false);
    }

    // Generic assignment operator test function
    template <typename CircuitOpFunc, typename NativeOpFunc>
    static void test_assign_operator_generic(InputType a_type,
                                             InputType b_type,
                                             CircuitOpFunc circuit_op,
                                             NativeOpFunc native_op,
                                             const char* op_name,
                                             size_t num_repetitions = 4,
                                             bool need_reduced_inputs = false,
                                             bool need_reduction_after = false)
    {
        auto builder = Builder();
        for (size_t i = 0; i < num_repetitions; ++i) {
            auto [a_native, a_ct] = get_random_element(&builder, a_type, need_reduced_inputs); // fq, fq_ct
            auto [b_native, b_ct] = get_random_element(&builder, b_type, need_reduced_inputs); // fq, fq_ct
            a_ct.set_origin_tag(submitted_value_origin_tag);
            b_ct.set_origin_tag(challenge_origin_tag);

            if (i == num_repetitions - 1) {
                std::string bench_name = std::string(op_name);
                BENCH_GATE_COUNT_START(builder, bench_name.c_str());
                circuit_op(a_ct, b_ct);
                BENCH_GATE_COUNT_END(builder, bench_name.c_str());
            } else {
                circuit_op(a_ct, b_ct);
            }

            // Need to self-reduce as assignment operators do not automatically reduce
            a_ct.self_reduce();

            // Assignment operations merge tags
            EXPECT_EQ(a_ct.get_origin_tag(), first_two_merged_tag);

            fq_native expected = native_op(a_native, b_native);
            if (need_reduction_after) {
                expected = expected.reduce_once().reduce_once();
            }
            expected = expected.from_montgomery_form();
            uint512_t result = a_ct.get_value();

            EXPECT_EQ(result.lo.data[0], expected.data[0]);
            EXPECT_EQ(result.lo.data[1], expected.data[1]);
            EXPECT_EQ(result.lo.data[2], expected.data[2]);
            EXPECT_EQ(result.lo.data[3], expected.data[3]);
            EXPECT_EQ(result.hi.data[0], 0ULL);
            EXPECT_EQ(result.hi.data[1], 0ULL);
            EXPECT_EQ(result.hi.data[2], 0ULL);
            EXPECT_EQ(result.hi.data[3], 0ULL);
        }
        bool result = CircuitChecker::check(builder);
        EXPECT_EQ(result, true);
    }

#define ASSIGNMENT_OP_TEST(op_name, bench_name, op_symbol, repetitions, reduced_inputs, reduction_after)               \
    static void test_##op_name(InputType a_type, InputType b_type)                                                     \
    {                                                                                                                  \
        test_assign_operator_generic(                                                                                  \
            a_type,                                                                                                    \
            b_type,                                                                                                    \
            [](fq_ct& a, const fq_ct& b) { a op_symbol## = b; },                                                       \
            [](const fq_native& a, const fq_native& b) { return a op_symbol b; },                                      \
            #bench_name,                                                                                               \
            repetitions,                                                                                               \
            reduced_inputs,                                                                                            \
            reduction_after);                                                                                          \
    }

    // Generate assignment operator tests using the macro
    ASSIGNMENT_OP_TEST(mul_assign, MUL_ASSIGN, *, 10, false, false)
    ASSIGNMENT_OP_TEST(add_assign, ADD_ASSIGN, +, 10, false, true)
    ASSIGNMENT_OP_TEST(sub_assign, SUB_ASSIGN, -, 10, false, true)
    ASSIGNMENT_OP_TEST(div_assign, DIV_ASSIGN, /, 10, true, true)

    static void test_madd(InputType a_type, InputType b_type, InputType c_type)
    {
        auto builder = Builder();
        size_t num_repetitions = 4;
        for (size_t i = 0; i < num_repetitions; ++i) {
            auto [a_native, a_ct] = get_random_element(&builder, a_type); // fq_native, fq_ct
            auto [b_native, b_ct] = get_random_element(&builder, b_type); // fq_native, fq_ct
            auto [c_native, c_ct] = get_random_element(&builder, c_type); // fq_native, fq_ct
            a_ct.set_origin_tag(challenge_origin_tag);
            b_ct.set_origin_tag(submitted_value_origin_tag);
            c_ct.set_origin_tag(next_challenge_tag);

            fq_ct d_ct;
            if (i == num_repetitions - 1) {
                BENCH_GATE_COUNT_START(builder, "MADD");
                d_ct = a_ct.madd(b_ct, { c_ct });
                BENCH_GATE_COUNT_END(builder, "MADD");
            } else {
                d_ct = a_ct.madd(b_ct, { c_ct });
            }

            // Madd merges tags
            EXPECT_EQ(d_ct.get_origin_tag(), first_second_third_merged_tag);

            fq_native expected = (a_native * b_native) + c_native;
            expected = expected.from_montgomery_form();
            uint512_t result = d_ct.get_value();

            EXPECT_EQ(result.lo.data[0], expected.data[0]);
            EXPECT_EQ(result.lo.data[1], expected.data[1]);
            EXPECT_EQ(result.lo.data[2], expected.data[2]);
            EXPECT_EQ(result.lo.data[3], expected.data[3]);
            EXPECT_EQ(result.hi.data[0], 0ULL);
            EXPECT_EQ(result.hi.data[1], 0ULL);
            EXPECT_EQ(result.hi.data[2], 0ULL);
            EXPECT_EQ(result.hi.data[3], 0ULL);
        }
        bool result = CircuitChecker::check(builder);
        EXPECT_EQ(result, true);
    }

    static void test_sqradd(InputType a_type, InputType b_type)
    {
        auto builder = Builder();
        size_t num_repetitions = 4;
        for (size_t i = 0; i < num_repetitions; ++i) {
            auto [a_native, a_ct] = get_random_element(&builder, a_type); // fq_native, fq_ct
            auto [b_native, b_ct] = get_random_element(&builder, b_type); // fq_native, fq_ct
            a_ct.set_origin_tag(challenge_origin_tag);
            b_ct.set_origin_tag(submitted_value_origin_tag);

            fq_ct c_ct;
            if (i == num_repetitions - 1) {
                BENCH_GATE_COUNT_START(builder, "SQRADD");
                c_ct = a_ct.sqradd({ b_ct });
                BENCH_GATE_COUNT_END(builder, "SQRADD");
            } else {
                c_ct = a_ct.sqradd({ b_ct });
            }
            c_ct.self_reduce();

            fq_native expected = (a_native.sqr()) + b_native;
            expected = expected.from_montgomery_form();
            uint512_t result = c_ct.get_value();

            EXPECT_EQ(result.lo.data[0], expected.data[0]);
            EXPECT_EQ(result.lo.data[1], expected.data[1]);
            EXPECT_EQ(result.lo.data[2], expected.data[2]);
            EXPECT_EQ(result.lo.data[3], expected.data[3]);
            EXPECT_EQ(result.hi.data[0], 0ULL);
            EXPECT_EQ(result.hi.data[1], 0ULL);
            EXPECT_EQ(result.hi.data[2], 0ULL);
            EXPECT_EQ(result.hi.data[3], 0ULL);
        }
        bool result = CircuitChecker::check(builder);
        EXPECT_EQ(result, true);
    }

    static void test_mult_madd(InputType left_type, InputType right_type, InputType to_add_type, bool edge_case = false)
    {
        auto builder = Builder();
        size_t num_repetitions = 1;
        const size_t number_of_madds = 16;
        for (size_t i = 0; i < num_repetitions; ++i) {
            // Get random witnesses for the multiplicands and the to_add values
            auto [mul_left_native, mul_left_ct] =
                get_random_elements(&builder, left_type, number_of_madds); // std::vector<fq_native>, std::vector<fq_ct>
            auto [mul_right_native, mul_right_ct] = get_random_elements(
                &builder, right_type, number_of_madds); // std::vector<fq_native>, std::vector<fq_ct>
            auto [to_add_native, to_add_ct] = get_random_elements(
                &builder, to_add_type, number_of_madds); // std::vector<fq_native>, std::vector<fq_ct>

            if (edge_case) {
                // Replace last element in the multiplicands and summand with element of the opposite type
                // This is to test the edge case where we have a mix of witness and constant types
                auto [extra_left_native, extra_left_ct] = get_random_element(&builder, !left_type);       // fq, fq_ct
                auto [extra_right_native, extra_right_ct] = get_random_element(&builder, !right_type);    // fq, fq_ct
                auto [extra_to_add_native, extra_to_add_ct] = get_random_element(&builder, !to_add_type); // fq, fq_ct
                mul_right_native[number_of_madds - 1] = extra_right_native;
                mul_left_native[number_of_madds - 1] = extra_left_native;
                to_add_native[number_of_madds - 1] = extra_to_add_native;
                mul_left_ct[number_of_madds - 1] = extra_left_ct;
                mul_right_ct[number_of_madds - 1] = extra_right_ct;
                to_add_ct[number_of_madds - 1] = extra_to_add_ct;
            }

            // Set the origin tags of the last multiplicands and summand
            mul_left_ct[number_of_madds - 1].set_origin_tag(submitted_value_origin_tag);
            mul_right_ct[number_of_madds - 1].set_origin_tag(challenge_origin_tag);
            to_add_ct[number_of_madds - 1].set_origin_tag(next_challenge_tag);

            fq_ct f_ct;
            if (i == num_repetitions - 1) {
                BENCH_GATE_COUNT_START(builder, "MULT_MADD");
                f_ct = fq_ct::mult_madd(mul_left_ct, mul_right_ct, to_add_ct);
                BENCH_GATE_COUNT_END(builder, "MULT_MADD");
            } else {
                f_ct = fq_ct::mult_madd(mul_left_ct, mul_right_ct, to_add_ct);
            }

            // mult_madd merges tags
            EXPECT_EQ(f_ct.get_origin_tag(), first_second_third_merged_tag);

            // Compute expected value
            fq_native expected(0);
            for (size_t j = 0; j < number_of_madds; j++) {
                expected += mul_left_native[j] * mul_right_native[j];
                expected += to_add_native[j];
            }
            expected = expected.from_montgomery_form();
            uint512_t result = f_ct.get_value();

            EXPECT_EQ(result.lo.data[0], expected.data[0]);
            EXPECT_EQ(result.lo.data[1], expected.data[1]);
            EXPECT_EQ(result.lo.data[2], expected.data[2]);
            EXPECT_EQ(result.lo.data[3], expected.data[3]);
            EXPECT_EQ(result.hi.data[0], 0ULL);
            EXPECT_EQ(result.hi.data[1], 0ULL);
            EXPECT_EQ(result.hi.data[2], 0ULL);
            EXPECT_EQ(result.hi.data[3], 0ULL);
        }
        if (builder.failed()) {
            info("Builder failed with error: ", builder.err());
        };
        bool result = CircuitChecker::check(builder);
        EXPECT_EQ(result, true);
    }

    static void test_dual_madd()
    {
        auto builder = Builder();
        size_t num_repetitions = 1;
        for (size_t i = 0; i < num_repetitions; ++i) {
            auto [a_native, a_ct] = get_random_witness(&builder); // fq_native, fq_ct
            auto [b_native, b_ct] = get_random_witness(&builder); // fq_native, fq_ct
            auto [c_native, c_ct] = get_random_witness(&builder); // fq_native, fq_ct
            auto [d_native, d_ct] = get_random_witness(&builder); // fq_native, fq_ct
            auto [e_native, e_ct] = get_random_witness(&builder); // fq_native, fq_ct

            a_ct.set_origin_tag(submitted_value_origin_tag);
            d_ct.set_origin_tag(challenge_origin_tag);
            e_ct.set_origin_tag(next_challenge_tag);

            fq_ct f_ct;
            if (i == num_repetitions - 1) {
                BENCH_GATE_COUNT_START(builder, "DUAL_MADD");
                f_ct = fq_ct::dual_madd(a_ct, b_ct, c_ct, d_ct, { e_ct });
                BENCH_GATE_COUNT_END(builder, "DUAL_MADD");
            } else {
                f_ct = fq_ct::dual_madd(a_ct, b_ct, c_ct, d_ct, { e_ct });
            }

            // dual_madd merges tags
            EXPECT_EQ(f_ct.get_origin_tag(), first_second_third_merged_tag);

            fq_native expected = (a_native * b_native) + (c_native * d_native) + e_native;
            expected = expected.from_montgomery_form();
            uint512_t result = f_ct.get_value();

            EXPECT_EQ(result.lo.data[0], expected.data[0]);
            EXPECT_EQ(result.lo.data[1], expected.data[1]);
            EXPECT_EQ(result.lo.data[2], expected.data[2]);
            EXPECT_EQ(result.lo.data[3], expected.data[3]);
            EXPECT_EQ(result.hi.data[0], 0ULL);
            EXPECT_EQ(result.hi.data[1], 0ULL);
            EXPECT_EQ(result.hi.data[2], 0ULL);
            EXPECT_EQ(result.hi.data[3], 0ULL);
        }
        if (builder.failed()) {
            info("Builder failed with error: ", builder.err());
        };
        bool result = CircuitChecker::check(builder);
        EXPECT_EQ(result, true);
    }

    static void test_div_without_denominator_check(InputType a_type, InputType b_type)
    {
        auto builder = Builder();
        size_t num_repetitions = 10;
        for (size_t i = 0; i < num_repetitions; ++i) {
            // We need reduced inputs for division.
            auto [a_native, a_ct] = get_random_element(&builder, a_type, true); // reduced fq_native, fq_ct
            auto [b_native, b_ct] = get_random_element(&builder, b_type, true); // reduced fq_native, fq_ct
            a_ct.set_origin_tag(submitted_value_origin_tag);
            b_ct.set_origin_tag(challenge_origin_tag);

            fq_ct c_ct;
            if (i == num_repetitions - 1) {
                BENCH_GATE_COUNT_START(builder, "DIV_DENOM_NO_CHECK");
                c_ct = a_ct.div_without_denominator_check(b_ct);
                BENCH_GATE_COUNT_END(builder, "DIV_DENOM_NO_CHECK");
            } else {
                c_ct = a_ct.div_without_denominator_check(b_ct);
            }

            // Division without denominator check merges tags
            EXPECT_EQ(c_ct.get_origin_tag(), first_two_merged_tag);

            fq_native expected = (a_native / b_native);
            expected = expected.reduce_once().reduce_once();
            expected = expected.from_montgomery_form();
            uint512_t result = c_ct.get_value();

            EXPECT_EQ(result.lo.data[0], expected.data[0]);
            EXPECT_EQ(result.lo.data[1], expected.data[1]);
            EXPECT_EQ(result.lo.data[2], expected.data[2]);
            EXPECT_EQ(result.lo.data[3], expected.data[3]);
            EXPECT_EQ(result.hi.data[0], 0ULL);
            EXPECT_EQ(result.hi.data[1], 0ULL);
            EXPECT_EQ(result.hi.data[2], 0ULL);
            EXPECT_EQ(result.hi.data[3], 0ULL);
        }
        bool result = CircuitChecker::check(builder);
        EXPECT_EQ(result, true);
    }

    static void test_add_and_div()
    {
        auto builder = Builder();
        size_t num_repetitions = 1;
        for (size_t i = 0; i < num_repetitions; ++i) {

            auto [a_native, a_ct] = get_random_witness(&builder); // fq_native, fq_ct
            auto [b_native, b_ct] = get_random_witness(&builder); // fq_native, fq_ct
            auto [c_native, c_ct] = get_random_witness(&builder); // fq_native, fq_ct
            auto [d_native, d_ct] = get_random_witness(&builder); // fq_native, fq_ct
            b_ct.set_origin_tag(submitted_value_origin_tag);
            c_ct.set_origin_tag(challenge_origin_tag);
            d_ct.set_origin_tag(next_challenge_tag);

            fq_ct e = (a_ct + b_ct) / (c_ct + d_ct);
            EXPECT_EQ(e.get_origin_tag(), first_second_third_merged_tag);

            fq_native expected = (a_native + b_native) / (c_native + d_native);
            expected = expected.reduce_once().reduce_once();
            expected = expected.from_montgomery_form();
            uint512_t result = e.get_value();

            EXPECT_EQ(result.lo.data[0], expected.data[0]);
            EXPECT_EQ(result.lo.data[1], expected.data[1]);
            EXPECT_EQ(result.lo.data[2], expected.data[2]);
            EXPECT_EQ(result.lo.data[3], expected.data[3]);
            EXPECT_EQ(result.hi.data[0], 0ULL);
            EXPECT_EQ(result.hi.data[1], 0ULL);
            EXPECT_EQ(result.hi.data[2], 0ULL);
            EXPECT_EQ(result.hi.data[3], 0ULL);
        }
        bool result = CircuitChecker::check(builder);
        EXPECT_EQ(result, true);
    }

    static void test_add_and_mul(InputType summand_type)
    {
        auto builder = Builder();
        size_t num_repetitions = 10;
        for (size_t i = 0; i < num_repetitions; ++i) {

            auto [a_native, a_ct] = get_random_witness(&builder);               // fq_native, fq_ct
            auto [b_native, b_ct] = get_random_element(&builder, summand_type); // fq_native, fq_ct
            auto [c_native, c_ct] = get_random_witness(&builder);               // fq_native, fq_ct
            auto [d_native, d_ct] = get_random_element(&builder, summand_type); // fq_native, fq_ct
            b_ct.set_origin_tag(submitted_value_origin_tag);
            c_ct.set_origin_tag(challenge_origin_tag);
            d_ct.set_origin_tag(next_challenge_tag);

            fq_ct e = (a_ct + b_ct) * (c_ct + d_ct);

            EXPECT_EQ(e.get_origin_tag(), first_second_third_merged_tag);
            fq_native expected = (a_native + b_native) * (c_native + d_native);
            expected = expected.from_montgomery_form();
            uint512_t result = e.get_value();

            EXPECT_EQ(result.lo.data[0], expected.data[0]);
            EXPECT_EQ(result.lo.data[1], expected.data[1]);
            EXPECT_EQ(result.lo.data[2], expected.data[2]);
            EXPECT_EQ(result.lo.data[3], expected.data[3]);
            EXPECT_EQ(result.hi.data[0], 0ULL);
            EXPECT_EQ(result.hi.data[1], 0ULL);
            EXPECT_EQ(result.hi.data[2], 0ULL);
            EXPECT_EQ(result.hi.data[3], 0ULL);
        }
        bool result = CircuitChecker::check(builder);
        EXPECT_EQ(result, true);
    }

    static void test_sub_and_mul(InputType subtrahend_type)
    {
        auto builder = Builder();
        size_t num_repetitions = 10;
        for (size_t i = 0; i < num_repetitions; ++i) {
            auto [a_native, a_ct] = get_random_witness(&builder);                  // fq_native, fq_ct
            auto [b_native, b_ct] = get_random_element(&builder, subtrahend_type); // fq_native, fq_ct
            auto [c_native, c_ct] = get_random_witness(&builder);                  // fq_native, fq_ct
            auto [d_native, d_ct] = get_random_element(&builder, subtrahend_type); // fq_native, fq_ct

            b_ct.set_origin_tag(submitted_value_origin_tag);
            c_ct.set_origin_tag(challenge_origin_tag);
            d_ct.set_origin_tag(next_challenge_tag);

            fq_ct e = (a_ct - b_ct) * (c_ct - d_ct);

            EXPECT_EQ(e.get_origin_tag(), first_second_third_merged_tag);
            fq_native expected = (a_native - b_native) * (c_native - d_native);

            expected = expected.from_montgomery_form();
            uint512_t result = e.get_value();

            EXPECT_EQ(result.lo.data[0], expected.data[0]);
            EXPECT_EQ(result.lo.data[1], expected.data[1]);
            EXPECT_EQ(result.lo.data[2], expected.data[2]);
            EXPECT_EQ(result.lo.data[3], expected.data[3]);
            EXPECT_EQ(result.hi.data[0], 0ULL);
            EXPECT_EQ(result.hi.data[1], 0ULL);
            EXPECT_EQ(result.hi.data[2], 0ULL);
            EXPECT_EQ(result.hi.data[3], 0ULL);
        }
        bool result = CircuitChecker::check(builder);
        EXPECT_EQ(result, true);
    }

    static void test_msub_div(InputType multiplicand_type, InputType to_sub_type, InputType divisor_type)
    {
        size_t num_repetitions = 8;
        for (size_t i = 0; i < num_repetitions; ++i) {
            auto builder = Builder();
            auto [mul_l, mul_l_ct] = get_random_element(&builder, multiplicand_type);
            auto [mul_r1, mul_r1_ct] = get_random_element(&builder, multiplicand_type);
            auto [mul_r2, mul_r2_ct] = get_random_element(&builder, multiplicand_type);
            auto [divisor1, divisor1_ct] = get_random_element(&builder, divisor_type);
            auto [divisor2, divisor2_ct] = get_random_element(&builder, divisor_type);
            auto [to_sub1, to_sub1_ct] = get_random_element(&builder, to_sub_type);
            auto [to_sub2, to_sub2_ct] = get_random_element(&builder, to_sub_type);

            mul_l_ct.set_origin_tag(submitted_value_origin_tag);
            mul_r1_ct.set_origin_tag(challenge_origin_tag);
            divisor1_ct.set_origin_tag(next_submitted_value_origin_tag);
            to_sub1_ct.set_origin_tag(next_challenge_tag);

            fq_ct result_ct;
            if (i == num_repetitions - 1) {
                BENCH_GATE_COUNT_START(builder, "MSUB_DIV");
                result_ct = fq_ct::msub_div(
                    { mul_l_ct }, { mul_r1_ct - mul_r2_ct }, divisor1_ct - divisor2_ct, { to_sub1_ct, to_sub2_ct });
                BENCH_GATE_COUNT_END(builder, "MSUB_DIV");
            } else {
                result_ct = fq_ct::msub_div(
                    { mul_l_ct }, { mul_r1_ct - mul_r2_ct }, divisor1_ct - divisor2_ct, { to_sub1_ct, to_sub2_ct });
            }

            EXPECT_EQ(result_ct.get_origin_tag(), first_to_fourth_merged_tag);
            fq_native expected = (-(mul_l * (mul_r1 - mul_r2) + to_sub1 + to_sub2)) / (divisor1 - divisor2);
            EXPECT_EQ(result_ct.get_value().lo, uint256_t(expected));
            EXPECT_EQ(result_ct.get_value().hi, uint256_t(0));

            bool result = CircuitChecker::check(builder);
            EXPECT_EQ(result, true);
        }
    }

    static void test_conditional_assign(InputType a_type, InputType b_type, InputType predicate_type)
    {
        auto builder = Builder();
        size_t num_repetitions = 1;
        for (size_t i = 0; i < num_repetitions; ++i) {

            auto [a_native, a_ct] = get_random_element(&builder, a_type); // fq_native, fq_ct
            auto [b_native, b_ct] = get_random_element(&builder, b_type); // fq_native, fq_ct
            a_ct.set_origin_tag(submitted_value_origin_tag);
            b_ct.set_origin_tag(challenge_origin_tag);

            bool_ct predicate_a;
            if (predicate_type == InputType::WITNESS) {
                predicate_a = bool_ct(witness_ct(&builder, true));
            } else {
                predicate_a = bool_ct(&builder, true);
            }
            predicate_a.set_origin_tag(next_challenge_tag);

            fq_ct c = fq_ct::conditional_assign(predicate_a, a_ct, b_ct);
            fq_ct d = fq_ct::conditional_assign(!predicate_a, a_ct, b_ct);

            // Conditional assign merges tags (even if predicate is a constant)
            EXPECT_EQ(c.get_origin_tag(), first_second_third_merged_tag);
            EXPECT_EQ(d.get_origin_tag(), first_second_third_merged_tag);

            fq_ct e = c + d;
            e.self_reduce();
            uint512_t c_out = c.get_value();
            uint512_t d_out = d.get_value();
            uint512_t e_out = e.get_value();

            fq_native result_c(c_out.lo);
            fq_native result_d(d_out.lo);
            fq_native result_e(e_out.lo);

            EXPECT_EQ(result_c, a_native);
            EXPECT_EQ(result_d, b_native);
            EXPECT_EQ(result_e, fq_native(a_native + b_native));
        }
        bool result = CircuitChecker::check(builder);
        EXPECT_EQ(result, true);
    }

    static void test_conditional_select(InputType a_type, InputType b_type, InputType predicate_type)
    {
        auto builder = Builder();
        size_t num_repetitions = 1;
        for (size_t i = 0; i < num_repetitions; ++i) {

            auto [a_native, a_ct] = get_random_element(&builder, a_type); // fq_native, fq_ct
            auto [b_native, b_ct] = get_random_element(&builder, b_type); // fq_native, fq_ct
            a_ct.set_origin_tag(submitted_value_origin_tag);
            b_ct.set_origin_tag(challenge_origin_tag);

            bool_ct predicate_a;
            if (predicate_type == InputType::WITNESS) {
                predicate_a = bool_ct(witness_ct(&builder, true));
            } else {
                predicate_a = bool_ct(&builder, true);
            }
            predicate_a.set_origin_tag(next_challenge_tag);

            fq_ct c = a_ct.conditional_select(b_ct, predicate_a);
            fq_ct d = a_ct.conditional_select(b_ct, !predicate_a);

            // Conditional select merges tags (even if predicate is a constant)
            EXPECT_EQ(c.get_origin_tag(), first_second_third_merged_tag);
            EXPECT_EQ(d.get_origin_tag(), first_second_third_merged_tag);

            fq_ct e = c + d;
            e.self_reduce();
            uint512_t c_out = c.get_value();
            uint512_t d_out = d.get_value();
            uint512_t e_out = e.get_value();

            fq_native result_c(c_out.lo);
            fq_native result_d(d_out.lo);
            fq_native result_e(e_out.lo);

            EXPECT_EQ(result_c, b_native);
            EXPECT_EQ(result_d, a_native);
            EXPECT_EQ(result_e, fq_native(a_native + b_native));
        }
        bool result = CircuitChecker::check(builder);
        EXPECT_EQ(result, true);
    }

    static void test_conditional_negate(InputType a_type, InputType predicate_type)
    {
        auto builder = Builder();
        size_t num_repetitions = 1;
        for (size_t i = 0; i < num_repetitions; ++i) {

            auto [a_native, a_ct] = get_random_element(&builder, a_type); // fq_native, fq_ct
            a_ct.set_origin_tag(submitted_value_origin_tag);

            bool_ct predicate_a;
            if (predicate_type == InputType::WITNESS) {
                predicate_a = bool_ct(witness_ct(&builder, true));
            } else {
                predicate_a = bool_ct(&builder, true);
            }
            predicate_a.set_origin_tag(challenge_origin_tag);

            fq_ct c = a_ct.conditional_negate(predicate_a);
            fq_ct d = a_ct.conditional_negate(!predicate_a);

            // Conditional negate merges tags
            EXPECT_EQ(c.get_origin_tag(), first_two_merged_tag);
            EXPECT_EQ(d.get_origin_tag(), first_two_merged_tag);

            fq_ct e = c + d;
            c.self_reduce();
            d.self_reduce();
            e.self_reduce();
            uint512_t c_out = c.get_value();
            uint512_t d_out = d.get_value();
            uint512_t e_out = e.get_value();

            fq_native result_c(c_out.lo);
            fq_native result_d(d_out.lo);
            fq_native result_e(e_out.lo);

            fq_native expected_c = (-a_native);
            fq_native expected_d = a_native;

            EXPECT_EQ(result_c, expected_c);
            EXPECT_EQ(result_d, expected_d);
            EXPECT_EQ(result_e, fq_native(0));
        }
        bool result = CircuitChecker::check(builder);
        EXPECT_EQ(result, true);
    }

    static void test_group_operations()
    {
        auto builder = Builder();
        size_t num_repetitions = 1;
        for (size_t i = 0; i < num_repetitions; ++i) {
            // Note: we're using g1 = bn254 here. not tested for other curves.
            g1::affine_element P1(g1::element::random_element());
            g1::affine_element P2(g1::element::random_element());

            fq_ct x1(
                witness_ct(&builder, fr(uint256_t(P1.x).slice(0, fq_ct::NUM_LIMB_BITS * 2))),
                witness_ct(&builder, fr(uint256_t(P1.x).slice(fq_ct::NUM_LIMB_BITS * 2, fq_ct::NUM_LIMB_BITS * 4))));
            fq_ct y1(
                witness_ct(&builder, fr(uint256_t(P1.y).slice(0, fq_ct::NUM_LIMB_BITS * 2))),
                witness_ct(&builder, fr(uint256_t(P1.y).slice(fq_ct::NUM_LIMB_BITS * 2, fq_ct::NUM_LIMB_BITS * 4))));
            fq_ct x2(
                witness_ct(&builder, fr(uint256_t(P2.x).slice(0, fq_ct::NUM_LIMB_BITS * 2))),
                witness_ct(&builder, fr(uint256_t(P2.x).slice(fq_ct::NUM_LIMB_BITS * 2, fq_ct::NUM_LIMB_BITS * 4))));
            fq_ct y2(
                witness_ct(&builder, fr(uint256_t(P2.y).slice(0, fq_ct::NUM_LIMB_BITS * 2))),
                witness_ct(&builder, fr(uint256_t(P2.y).slice(fq_ct::NUM_LIMB_BITS * 2, fq_ct::NUM_LIMB_BITS * 4))));

            uint64_t before = builder.get_estimated_num_finalized_gates();
            fq_ct lambda = (y2 - y1) / (x2 - x1);
            fq_ct x3 = lambda.sqr() - (x2 + x1);
            fq_ct y3 = (x1 - x3) * lambda - y1;
            uint64_t after = builder.get_estimated_num_finalized_gates();
            std::cerr << "added gates = " << after - before << std::endl;

            // Check the result against the native group addition
            g1::affine_element P3(g1::element(P1) + g1::element(P2));
            fq expected_x = P3.x;
            fq expected_y = P3.y;
            expected_x = expected_x.from_montgomery_form();
            expected_y = expected_y.from_montgomery_form();
            uint512_t result_x = x3.get_value() % fq_ct::modulus_u512;
            uint512_t result_y = y3.get_value() % fq_ct::modulus_u512;
            EXPECT_EQ(result_x.lo.data[0], expected_x.data[0]);
            EXPECT_EQ(result_x.lo.data[1], expected_x.data[1]);
            EXPECT_EQ(result_x.lo.data[2], expected_x.data[2]);
            EXPECT_EQ(result_x.lo.data[3], expected_x.data[3]);
            EXPECT_EQ(result_y.lo.data[0], expected_y.data[0]);
            EXPECT_EQ(result_y.lo.data[1], expected_y.data[1]);
            EXPECT_EQ(result_y.lo.data[2], expected_y.data[2]);
            EXPECT_EQ(result_y.lo.data[3], expected_y.data[3]);
        }
        bool result = CircuitChecker::check(builder);
        EXPECT_EQ(result, true);
    }

    static void test_reduce()
    {
        auto builder = Builder();
        size_t num_repetitions = 10;
        for (size_t i = 0; i < num_repetitions; ++i) {
            auto [a_native, a_ct] = get_random_witness(&builder); // fq_native, fq_ct
            auto [b_native, b_ct] = get_random_witness(&builder); // fq_native, fq_ct

            fq_ct c_ct = a_ct;
            fq_native expected = a_native;
            for (size_t i = 0; i < 16; ++i) {
                c_ct = b_ct * b_ct + c_ct;
                expected = b_native * b_native + expected;
            }

            c_ct.set_origin_tag(challenge_origin_tag);
            c_ct.self_reduce();

            // self_reduce preserves tags
            EXPECT_EQ(c_ct.get_origin_tag(), challenge_origin_tag);

            fq_native result = fq_native(c_ct.get_value().lo);
            EXPECT_EQ(result, expected);
            EXPECT_EQ(c_ct.get_value().get_msb() < (fq_ct::modulus.get_msb() + 1), true);
        }
        bool result = CircuitChecker::check(builder);
        EXPECT_EQ(result, true);
    }

    static void test_equality_operator(InputType a_type, InputType b_type)
    {
        auto builder = Builder();
        size_t num_repetitions = 10;
        for (size_t i = 0; i < num_repetitions; ++i) {

            auto [a_native, a_ct] = get_random_element(&builder, a_type); // fq_native, fq_ct
            auto [b_native, b_ct] = get_random_element(&builder, b_type); // fq_native, fq_ct

            // Construct witness from a_native
            fq_ct another_a_ct = fq_ct::create_from_u512_as_witness(&builder, uint512_t(a_native), true);
            bool_ct equality_with_self = (a_ct == another_a_ct);
            EXPECT_EQ(equality_with_self.get_value(), true);

            // Check against b
            bool expected = (a_native == b_native);
            bool_ct result = (a_ct == b_ct);
            EXPECT_EQ(result.get_value(), expected);
        }
        bool result = CircuitChecker::check(builder);
        EXPECT_EQ(result, true);
    }

    static void test_assert_is_in_field_success()
    {
        auto builder = Builder();
        size_t num_repetitions = 10;
        for (size_t i = 0; i < num_repetitions; ++i) {

            // Get unreduced inputs
            auto [a_native, a_ct] = get_random_witness(&builder); // fq_native, fq_ct
            auto [b_native, b_ct] = get_random_witness(&builder); // fq_native, fq_ct

            // Get a reduced input
            auto [d_native, d_ct] = get_random_witness(&builder, true); // fq_native, fq_ct

            // c_ct will be unreduced while performing operations
            fq_ct c_ct = a_ct;
            fq_native expected = a_native;
            for (size_t i = 0; i < 16; ++i) {
                c_ct = b_ct * b_ct + c_ct;
                expected = b_native * b_native + expected;
            }

            c_ct.set_origin_tag(challenge_origin_tag);

            // We need to reduce before calling assert_is_in_field
            c_ct.self_reduce();
            c_ct.assert_is_in_field();

            // We can directly call assert_is_in_field on a reduced element
            d_ct.set_origin_tag(challenge_origin_tag);
            d_ct.assert_is_in_field();

            // assert_is_in_field preserves tags
            EXPECT_EQ(c_ct.get_origin_tag(), challenge_origin_tag);
            EXPECT_EQ(d_ct.get_origin_tag(), challenge_origin_tag);

            uint256_t result = (c_ct.get_value().lo);
            EXPECT_EQ(result, uint256_t(expected));
            EXPECT_EQ(c_ct.get_value().get_msb() < (fq_ct::modulus.get_msb() + 1), true);
        }
        bool result = CircuitChecker::check(builder);
        EXPECT_EQ(result, true);
    }

    static void test_assert_is_in_field_fails()
    {
        auto builder = Builder();
        size_t num_repetitions = 10;
        fq_ct c_ct = fq_ct::zero();
        fq_native expected = fq_native::zero();
        for (size_t i = 0; i < num_repetitions; ++i) {

            auto [a_native, a_ct] = get_random_witness(&builder); // fq_native, fq_ct
            auto [b_native, b_ct] = get_random_witness(&builder); // fq_native, fq_ct

            for (size_t i = 0; i < 16; ++i) {
                c_ct += a_ct * b_ct;
                expected += a_native * b_native;
            }
        }

        // Ensure that c has exceeded p (as mul and add have been performed without reduction so far)
        EXPECT_EQ(c_ct.get_value() >= fq_ct::modulus, true);

        // this will fail because mult and add have been performed without reduction
        c_ct.assert_is_in_field();

        // results must match (reduction called after assert_is_in_field)
        c_ct.self_reduce();
        uint256_t result_val = c_ct.get_value().lo;
        EXPECT_EQ(result_val, uint256_t(expected));

        bool result = CircuitChecker::check(builder);
        EXPECT_EQ(result, false);
    }

    static void test_assert_less_than_success()
    {
        auto builder = Builder();
        size_t num_repetitions = 10;
        constexpr size_t num_bits = 200;
        constexpr uint256_t bit_mask = (uint256_t(1) << num_bits) - 1;
        for (size_t i = 0; i < num_repetitions; ++i) {

            uint256_t a_u256 = uint256_t(fq_native::random_element()) & bit_mask;
            uint256_t b_u256 = uint256_t(fq_native::random_element()) & bit_mask;

            // Construct 200-bit bigfield elements
            fq_ct a_ct(witness_ct(&builder, fr(a_u256.slice(0, fq_ct::NUM_LIMB_BITS * 2))),
                       witness_ct(&builder, fr(a_u256.slice(fq_ct::NUM_LIMB_BITS * 2, fq_ct::NUM_LIMB_BITS * 4))));
            fq_ct b_ct(witness_ct(&builder, fr(b_u256.slice(0, fq_ct::NUM_LIMB_BITS * 2))),
                       witness_ct(&builder, fr(b_u256.slice(fq_ct::NUM_LIMB_BITS * 2, fq_ct::NUM_LIMB_BITS * 4))));

            // Assert a, b < 2^200
            a_ct.assert_less_than(bit_mask + 1);
            b_ct.assert_less_than(bit_mask + 1);
            EXPECT_EQ(a_ct.get_value().get_msb() < num_bits, true);
            EXPECT_EQ(b_ct.get_value().get_msb() < num_bits, true);
        }
        bool result = CircuitChecker::check(builder);
        EXPECT_EQ(result, true);
    }

    static void test_assert_less_than_fails()
    {
        auto builder = Builder();
        size_t num_repetitions = 10;
        constexpr size_t num_bits = 200;
        constexpr uint256_t bit_mask = (uint256_t(1) << num_bits) - 1;

        fq_ct c_ct = fq_ct::zero();
        fq_native expected = fq_native::zero();
        for (size_t i = 0; i < num_repetitions; ++i) {

            uint256_t a_u256 = uint256_t(fq_native::random_element()) & bit_mask;
            uint256_t b_u256 = uint256_t(fq_native::random_element()) & bit_mask;

            // Construct 200-bit bigfield elements
            fq_ct a_ct(witness_ct(&builder, fr(a_u256.slice(0, fq_ct::NUM_LIMB_BITS * 2))),
                       witness_ct(&builder, fr(a_u256.slice(fq_ct::NUM_LIMB_BITS * 2, fq_ct::NUM_LIMB_BITS * 4))));
            fq_ct b_ct(witness_ct(&builder, fr(b_u256.slice(0, fq_ct::NUM_LIMB_BITS * 2))),
                       witness_ct(&builder, fr(b_u256.slice(fq_ct::NUM_LIMB_BITS * 2, fq_ct::NUM_LIMB_BITS * 4))));

            // Mul and add without reduction to exceed 200 bits
            for (size_t i = 0; i < 16; ++i) {
                c_ct += a_ct * b_ct;
                expected += fq_native(a_u256) * fq_native(b_u256);
            }
        }

        // Ensure that c has exceeded 200 bits
        EXPECT_EQ(c_ct.get_value().get_msb() >= num_bits, true);

        // check that assert_less_than fails
        c_ct.assert_less_than(bit_mask + 1);

        // results must match (reduction called after assert_is_in_field)
        c_ct.self_reduce();
        uint256_t result_val = c_ct.get_value().lo;
        EXPECT_EQ(result_val, uint256_t(expected));

        bool result = CircuitChecker::check(builder);
        EXPECT_EQ(result, false);
    }

    static void test_reduce_mod_target_modulus()
    {
        auto builder = Builder();
        size_t num_repetitions = 10;
        for (size_t i = 0; i < num_repetitions; ++i) {

            // Get unreduced inputs
            auto [a_native, a_ct] = get_random_witness(&builder); // fq_native, fq_ct
            auto [b_native, b_ct] = get_random_witness(&builder); // fq_native, fq_ct

            // c_ct will be unreduced while performing operations
            fq_ct c_ct = a_ct;
            fq_native expected = a_native;
            for (size_t i = 0; i < 16; ++i) {
                c_ct = b_ct * b_ct + c_ct;
                expected = b_native * b_native + expected;
            }

            c_ct.set_origin_tag(challenge_origin_tag);

            // reduce c to [0, p)
            // count gates for the last iteration only
            if (i == num_repetitions - 1) {
                BENCH_GATE_COUNT_START(builder, "REDUCE_MOD_P");
                c_ct.reduce_mod_target_modulus();
                BENCH_GATE_COUNT_END(builder, "REDUCE_MOD_P");
            } else {
                c_ct.reduce_mod_target_modulus();
            }

            // reduce_mod_target_modulus preserves tags
            EXPECT_EQ(c_ct.get_origin_tag(), challenge_origin_tag);

            uint256_t result = (c_ct.get_value().lo);
            EXPECT_EQ(result, uint256_t(expected));
            EXPECT_EQ(c_ct.get_value() < fq_ct::modulus, true);
        }
        bool result = CircuitChecker::check(builder);
        EXPECT_EQ(result, true);
    }

    static void test_byte_array_constructors()
    {
        auto builder = Builder();
        size_t num_repetitions = 10;
        for (size_t i = 0; i < num_repetitions; ++i) {

            fq_native a_native = fq_native::random_element();
            fq_native b_native = fq_native::random_element();

            std::vector<uint8_t> input_a(sizeof(fq_native));
            fq_native::serialize_to_buffer(a_native, &input_a[0]);
            std::vector<uint8_t> input_b(sizeof(fq_native));
            fq_native::serialize_to_buffer(b_native, &input_b[0]);

            stdlib::byte_array<Builder> input_arr_a(&builder, input_a);
            stdlib::byte_array<Builder> input_arr_b(&builder, input_b);

            input_arr_a.set_origin_tag(submitted_value_origin_tag);
            input_arr_b.set_origin_tag(challenge_origin_tag);

            fq_ct a_ct(input_arr_a);
            fq_ct b_ct(input_arr_b);

            fq_ct c_ct = a_ct * b_ct;

            EXPECT_EQ(c_ct.get_origin_tag(), first_two_merged_tag);

            fq_native expected = a_native * b_native;
            uint256_t result = (c_ct.get_value().lo);
            EXPECT_EQ(result, uint256_t(expected));
        }
        bool result = CircuitChecker::check(builder);
        EXPECT_EQ(result, true);
    }

    static void test_to_byte_array()
    {
        auto builder = Builder();
        size_t num_repetitions = 10;
        for (size_t i = 0; i < num_repetitions; ++i) {
            auto [a_native, a_ct] = get_random_witness(&builder, true); // fq_native, fq_ct
            byte_array_ct a_bytes_ct = a_ct.to_byte_array();

            std::vector<fr_ct> actual_bytes = a_bytes_ct.bytes();
            EXPECT_EQ(actual_bytes.size(), 32);

            for (size_t j = 0; j < actual_bytes.size(); ++j) {
                const uint256_t expected = (uint256_t(a_native) >> (8 * j)).slice(0, 8);
                EXPECT_EQ(actual_bytes[32 - 1 - j].get_value(), expected);
            }
        }
        bool result = CircuitChecker::check(builder);
        EXPECT_EQ(result, true);
    }

    // This check tests if elements are reduced to fit quotient into range proof
    static void test_quotient_completeness()
    {
        auto builder = Builder();
        const uint256_t input =
            uint256_t(0xfffffffffffffffe, 0xffffffffffffffff, 0xffffffffffffffff, 0x3fffffffffffffff);

        fq_ct a(witness_ct(&builder, fr(uint256_t(input).slice(0, fq_ct::NUM_LIMB_BITS * 2))),
                witness_ct(&builder, fr(uint256_t(input).slice(fq_ct::NUM_LIMB_BITS * 2, fq_ct::NUM_LIMB_BITS * 4))),
                false);
        auto a1 = a;
        auto a2 = a;
        auto a3 = a;
        auto a4 = a;

        for (auto i = 0; i < 8; i++) {
            a = a + a;
            a1 = a1 + a1;
            a2 = a2 + a2;
            a3 = a3 + a3;
            a4 = a4 + a4;
        }

        auto b = a * a;
        (void)b;

        auto c = a1.sqr();
        (void)c;

        auto d = a2.sqradd({});
        (void)d;

        auto e = a3.madd(a3, {});
        (void)e;

        auto f = fq_ct::mult_madd({ a4 }, { a4 }, {}, false);
        (void)f;

        bool result = CircuitChecker::check(builder);
        EXPECT_EQ(result, true);
    }

    static void test_conditional_select_regression()
    {
        auto builder = Builder();
        fq_native a(0);
        fq_native b(1);
        fq_ct a_ct(&builder, a);
        fq_ct b_ct(&builder, b);
        fq_ct selected = a_ct.conditional_select(b_ct, bool_ct(&builder, true));
        EXPECT_EQ(fq_native((selected.get_value() % uint512_t(fq_native::modulus)).lo), b);
    }

    static void test_division_context()
    {
        auto builder = Builder();
        fq_native a(1);
        fq_ct a_ct(&builder, a);
        fq_ct ret = fq_ct::div_check_denominator_nonzero({}, a_ct);
        EXPECT_NE(ret.get_context(), nullptr);
    }

    static void test_inversion()
    {
        fq_ct a = fq_ct(-7);
        fq_ct a_inverse = a.invert();
        fq_ct a_inverse_division = fq_ct(1) / a;

        fq_native a_native = fq_native(-7);
        fq_native a_native_inverse = a_native.invert();
        EXPECT_EQ(fq_native((a.get_value() % uint512_t(fq_native::modulus)).lo), a_native);
        EXPECT_EQ(fq_native((a_inverse.get_value() % uint512_t(fq_native::modulus)).lo), a_native_inverse);
        EXPECT_EQ(fq_native((a_inverse_division.get_value() % uint512_t(fq_native::modulus)).lo), a_native_inverse);
    }

    static void test_assert_equal_not_equal()
    {
        auto builder = Builder();
        size_t num_repetitions = 10;
        for (size_t i = 0; i < num_repetitions; ++i) {
            auto [a_native, a_ct] = get_random_witness(&builder); // fq_native, fq_ct
            auto [c_native, c_ct] = get_random_witness(&builder); // fq_native, fq_ct
            auto [d_native, d_ct] = get_random_witness(&builder); // fq_native, fq_ct

            fq_ct two_ct = fq_ct::unsafe_construct_from_limbs(witness_ct(&builder, fr(2)),
                                                              witness_ct(&builder, fr(0)),
                                                              witness_ct(&builder, fr(0)),
                                                              witness_ct(&builder, fr(0)));
            fq_ct t0 = a_ct + a_ct;
            fq_ct t1 = a_ct * two_ct;

            t0.assert_equal(t1);
            t0.assert_is_not_equal(c_ct);
            t0.assert_is_not_equal(d_ct);
            stdlib::bool_t<Builder> is_equal_a = t0 == t1;
            stdlib::bool_t<Builder> is_equal_b = t0 == c_ct;
            EXPECT_TRUE(is_equal_a.get_value());
            EXPECT_FALSE(is_equal_b.get_value());
        }
        bool result = CircuitChecker::check(builder);
        EXPECT_EQ(result, true);
    }

    static void test_pow()
    {
        Builder builder;

        fq_native base_val(engine.get_random_uint256());
        uint32_t exponent_val = engine.get_random_uint32();
        // Set the high bit
        exponent_val |= static_cast<uint32_t>(1) << 31;
        fq_ct base_constant(&builder, static_cast<uint256_t>(base_val));
        fq_ct base_witness_ct = fq_ct::from_witness(&builder, static_cast<uint256_t>(base_val));
        // This also tests for the case where the exponent is zero
        for (size_t i = 0; i <= 32; i += 4) {
            uint32_t current_exponent_val = exponent_val >> i;
            fq_native expected = base_val.pow(current_exponent_val);

            // Check for constant bigfield element with constant exponent
            fq_ct result_constant_base = base_constant.pow(current_exponent_val);
            EXPECT_EQ(fq_native(result_constant_base.get_value()), expected);

            // Check for witness base with constant exponent
            fq_ct result_witness_base = base_witness_ct.pow(current_exponent_val);
            EXPECT_EQ(fq_native(result_witness_base.get_value()), expected);

            base_witness_ct.set_origin_tag(submitted_value_origin_tag);
        }

        bool check_result = CircuitChecker::check(builder);
        EXPECT_EQ(check_result, true);
    }

    static void test_pow_one()
    {
        Builder builder;

        fq_native base_val(engine.get_random_uint256());

        uint32_t current_exponent_val = 1;
        fq_ct base_constant_ct(&builder, static_cast<uint256_t>(base_val));
        fq_ct base_witness_ct = fq_ct::from_witness(&builder, static_cast<uint256_t>(base_val));
        fq_native expected = base_val.pow(current_exponent_val);

        // Check for constant bigfield element with constant exponent
        fq_ct result_constant_base = base_constant_ct.pow(current_exponent_val);
        EXPECT_EQ(fq_native(result_constant_base.get_value()), expected);

        // Check for witness base with constant exponent
        fq_ct result_witness_base = base_witness_ct.pow(current_exponent_val);
        EXPECT_EQ(fq_native(result_witness_base.get_value()), expected);

        bool check_result = CircuitChecker::check(builder);
        EXPECT_EQ(check_result, true);
    }

    static void test_unsafe_assert_less_than()
    {
        auto builder = Builder();
        size_t num_repetitions = 10;
        constexpr size_t num_bits = 200;
        constexpr uint256_t bit_mask = (uint256_t(1) << num_bits) - 1;
        for (size_t i = 0; i < num_repetitions; ++i) {

            uint256_t a_u256 = uint256_t(fq_native::random_element()) & bit_mask;
            uint256_t b_u256 = uint256_t(fq_native::random_element()) & bit_mask;

            // Construct 200-bit bigfield elements
            fq_ct a_ct(witness_ct(&builder, fr(a_u256.slice(0, fq_ct::NUM_LIMB_BITS * 2))),
                       witness_ct(&builder, fr(a_u256.slice(fq_ct::NUM_LIMB_BITS * 2, fq_ct::NUM_LIMB_BITS * 4))));
            fq_ct b_ct(witness_ct(&builder, fr(b_u256.slice(0, fq_ct::NUM_LIMB_BITS * 2))),
                       witness_ct(&builder, fr(b_u256.slice(fq_ct::NUM_LIMB_BITS * 2, fq_ct::NUM_LIMB_BITS * 4))));

            // Assert a, b < 2^200
            stdlib::bigfield_test_access::unsafe_assert_less_than(a_ct, bit_mask + 1);
            stdlib::bigfield_test_access::unsafe_assert_less_than(b_ct, bit_mask + 1);
            EXPECT_EQ(a_ct.get_value().get_msb() < num_bits, true);
            EXPECT_EQ(b_ct.get_value().get_msb() < num_bits, true);
        }

        // Also test when: p < a < bound
        // define a = p + small_random_value
        uint256_t small_mask = (uint256_t(1) << 16) - 1;
        uint256_t a_u256 = uint256_t(fq_native::random_element()) & small_mask;
        a_u256 += uint256_t(fq_native::modulus);

        // upper bound must be greater than p + 2^16: we set it to p + 2^30
        uint256_t upper_bound = (uint256_t(1) << 30) + uint256_t(fq_native::modulus);

        // Construct bigfield element
        fq_ct a_ct(witness_ct(&builder, fr(a_u256.slice(0, fq_ct::NUM_LIMB_BITS * 2))),
                   witness_ct(&builder, fr(a_u256.slice(fq_ct::NUM_LIMB_BITS * 2, fq_ct::NUM_LIMB_BITS * 4))),
                   /*can_overflow*/ true);

        // Assert a < bound
        stdlib::bigfield_test_access::unsafe_assert_less_than(a_ct, upper_bound);
        EXPECT_EQ(a_ct.get_value() > uint512_t(fq_native::modulus), true);

        // Combined circuit should pass
        bool result = CircuitChecker::check(builder);
        EXPECT_EQ(result, true);
    }

    static void test_unsafe_assert_less_than_fails()
    {
        {
            // Test a case when the value is exactly equal to the limit
            auto builder = Builder();
            constexpr size_t num_bits = 200;
            constexpr uint256_t bit_mask = (uint256_t(1) << num_bits) - 1;
            fq_ct a_ct(witness_ct(&builder, fr(bit_mask.slice(0, fq_ct::NUM_LIMB_BITS * 2))),
                       witness_ct(&builder, fr(bit_mask.slice(fq_ct::NUM_LIMB_BITS * 2, fq_ct::NUM_LIMB_BITS * 4))));

            // check that unsafe_assert_less_than fails when we try to check a < a.
            stdlib::bigfield_test_access::unsafe_assert_less_than(a_ct, a_ct.get_value().lo);

            bool result = CircuitChecker::check(builder);
            EXPECT_EQ(result, false);
        }
        {
            // Test a case when the value is (B + 2) but the bound is B.
            auto builder = Builder();
            constexpr size_t num_bits = 200;
            constexpr uint256_t bit_mask = (uint256_t(1) << num_bits) - 1;
            const uint256_t upper_bound = uint256_t(fq_native::random_element()) & bit_mask;
            const uint256_t a_value = upper_bound + uint256_t(2);
            fq_ct a_ct(witness_ct(&builder, fr(a_value.slice(0, fq_ct::NUM_LIMB_BITS * 2))),
                       witness_ct(&builder, fr(a_value.slice(fq_ct::NUM_LIMB_BITS * 2, fq_ct::NUM_LIMB_BITS * 4))));

            // check that unsafe_assert_less_than fails when we try to check (B + 2) < B.
            stdlib::bigfield_test_access::unsafe_assert_less_than(a_ct, upper_bound);

            bool result = CircuitChecker::check(builder);
            EXPECT_EQ(result, false);
        }
        {
            // Test a case when p < bound < a
            auto builder = Builder();
            uint256_t small_mask = (uint256_t(1) << 32) - 1;
            uint256_t a_u256 = uint256_t(fq_native::random_element()) & small_mask;
            a_u256 += uint256_t(fq_native::modulus);

            // upper bound must be greater than p but smaller than a
            uint256_t upper_bound = uint256_t(fq_native::modulus) + uint256_t(1);

            // Construct bigfield element
            fq_ct a_ct(witness_ct(&builder, fr(a_u256.slice(0, fq_ct::NUM_LIMB_BITS * 2))),
                       witness_ct(&builder, fr(a_u256.slice(fq_ct::NUM_LIMB_BITS * 2, fq_ct::NUM_LIMB_BITS * 4))),
                       /*can_overflow*/ true);

            // check that unsafe_assert_less_than fails when we try to check a < bound.
            stdlib::bigfield_test_access::unsafe_assert_less_than(a_ct, upper_bound);

            bool result = CircuitChecker::check(builder);
            EXPECT_EQ(result, false);
        }
    }

    static void test_unsafe_evaluate_multiply_add()
    {
        Builder builder;

        // The circuit enforces:
        // a * b + (c0 + c1 + ...) = q * p + (r0 + r1 + ...) mod 2^T
        // a * b + (c0 + c1 + ...) = q * p + (r0 + r1 + ...) mod n

        // Single addend and remainder
        auto [a_native, a_ct] = get_random_witness(&builder);
        auto [b_native, b_ct] = get_random_witness(&builder);
        auto [c_native, c_ct] = get_random_witness(&builder);

        // Get quotient and remainder for (a * b + c) from native values
        uint1024_t native_sum = uint1024_t(a_native) * uint1024_t(b_native) + uint1024_t(c_native);
        auto [q_native_1024, r_native_1024] = native_sum.divmod(uint1024_t(fq_ct::modulus));
        const uint512_t q_native_512 = q_native_1024.lo;
        const uint512_t r_native_512 = r_native_1024.lo;
        fq_ct q_ct = fq_ct::create_from_u512_as_witness(&builder, q_native_512, true);
        fq_ct r_ct = fq_ct::create_from_u512_as_witness(&builder, r_native_512, true);

        // Call unsafe_evaluate_multiply_add (via friendly class)
        stdlib::bigfield_test_access::unsafe_evaluate_multiply_add(a_ct, b_ct, { c_ct }, q_ct, { r_ct });

        // The above function does not protect against CRT overflows, i.e., check if lhs and rhs are less than
        // M = (2^T * n). Verify that adding a multiple of M to both sides does not result in an unsatisfiable circuit.
        uint512_t big_M = uint512_t(fr::modulus) * fq_ct::binary_basis.modulus;
        uint512_t modified_c_native = uint512_t(c_native) + big_M;
        uint512_t modified_r_native = uint512_t(r_native_512) + big_M;
        fq_ct modified_c_ct = fq_ct::create_from_u512_as_witness(&builder, modified_c_native, true);
        fq_ct modified_r_ct = fq_ct::create_from_u512_as_witness(&builder, modified_r_native, true);

        // Call unsafe_evaluate_multiply_add (via friendly class)
        stdlib::bigfield_test_access::unsafe_evaluate_multiply_add(
            a_ct, b_ct, { modified_c_ct }, q_ct, { modified_r_ct });

        // Native verification mod p
        fq_native expected_lhs = a_native * b_native + c_native;
        fq_native expected_rhs = fq_native(q_native_512) * fq_ct::modulus + fq_native(r_native_512);
        EXPECT_EQ(expected_lhs, expected_rhs);

        // Native verification mod 2^T
        uint1024_t lhs_1024 = uint512_t(a_native) * uint512_t(b_native) + uint512_t(c_native);
        uint1024_t rhs_1024 = q_native_512 * fq_ct::modulus + r_native_512;
        auto [quotient_lhs, remainder_lhs] = lhs_1024.divmod(fq_ct::binary_basis.modulus);
        auto [quotient_rhs, remainder_rhs] = rhs_1024.divmod(fq_ct::binary_basis.modulus);
        EXPECT_EQ(remainder_lhs, remainder_rhs);

        // Native verification mod n
        fr expected_lhs_fr = fr(a_native) * fr(b_native) + fr(c_native);
        fr expected_rhs_fr = fr(q_native_512) * fr(fq_ct::modulus) + fr(r_native_512);
        EXPECT_EQ(expected_lhs_fr, expected_rhs_fr);

        // Check circuit correctness
        bool result = CircuitChecker::check(builder);
        EXPECT_EQ(result, true);
    }

    static void test_unsafe_evaluate_multiply_add_fails()
    {
        auto builder = Builder();

        // The circuit enforces:
        // a * b + (c0 + c1 + ...) = q * p + (r0 + r1 + ...) mod 2^T
        // a * b + (c0 + c1 + ...) = q * p + (r0 + r1 + ...) mod n

        // Single addend and remainder
        auto [a_native, a_ct] = get_random_witness(&builder);
        auto [b_native, b_ct] = get_random_witness(&builder);
        auto [c_native, c_ct] = get_random_witness(&builder);

        // Get quotient and remainder for (a * b + c) from native values
        uint512_t native_sum = uint512_t(a_native) * uint512_t(b_native) + uint512_t(c_native);
        auto [q_native_uint512_t, r_native_uint512_t] = native_sum.divmod(uint512_t(fq_ct::modulus));
        fq_ct q_ct = fq_ct::create_from_u512_as_witness(
            &builder, q_native_uint512_t + uint512_t(1), true); // Intentionally poisoned
        fq_ct r_ct = fq_ct::create_from_u512_as_witness(&builder, r_native_uint512_t, true);

        // Call unsafe_evaluate_multiply_add (via friendly class)
        stdlib::bigfield_test_access::unsafe_evaluate_multiply_add(a_ct, b_ct, { c_ct }, q_ct, { r_ct });

        // Check circuit correctness
        bool result = CircuitChecker::check(builder);
        EXPECT_EQ(result, false);
        EXPECT_EQ(builder.err(), "bigfield: prime limb identity failed");
    }

    static void test_unsafe_multiple_multiply_add()
    {
        Builder builder;

        // The circuit enforces:
        // a1 * b1 + a2 * b2 + ... + (c0 + c1 + ...) = q * p + (r0 + r1 + ...) mod 2^T
        // a1 * b1 + a2 * b2 + ... + (c0 + c1 + ...) = q * p + (r0 + r1 + ...) mod n
        size_t num_terms = 3;
        std::vector<fq_native> a_natives;
        std::vector<fq_native> b_natives;
        std::vector<fq_ct> a_cts;
        std::vector<fq_ct> b_cts;

        for (size_t i = 0; i < num_terms; ++i) {
            auto [a_native, a_ct] = get_random_witness(&builder);
            auto [b_native, b_ct] = get_random_witness(&builder);
            a_natives.push_back(a_native);
            b_natives.push_back(b_native);
            a_cts.push_back(a_ct);
            b_cts.push_back(b_ct);
        }

        auto [c_native, c_ct] = get_random_witness(&builder);

        // Get quotient and remainder for (sum of ai * bi + c) from native values
        uint1024_t native_sum = uint1024_t(c_native);
        for (size_t i = 0; i < num_terms; ++i) {
            native_sum += uint1024_t(a_natives[i]) * uint1024_t(b_natives[i]);
        }
        auto [q_native_1024, r_native_1024] = native_sum.divmod(uint512_t(fq_ct::modulus));
        const uint512_t q_native_512 = q_native_1024.lo;
        const uint512_t r_native_512 = r_native_1024.lo;
        fq_ct q_ct = fq_ct::create_from_u512_as_witness(&builder, q_native_512, true);
        fq_ct r_ct = fq_ct::create_from_u512_as_witness(&builder, r_native_512, true);

        // Call unsafe_evaluate_multiply_add (via friendly class)
        stdlib::bigfield_test_access::unsafe_evaluate_multiple_multiply_add(a_cts, b_cts, { c_ct }, q_ct, { r_ct });

        // Native verification mod p
        fq_native expected_lhs = fq_native(c_native);
        for (size_t i = 0; i < num_terms; ++i) {
            expected_lhs += fq_native(a_natives[i]) * fq_native(b_natives[i]);
        }
        fq_native expected_rhs = fq_native(q_native_512) * fq_ct::modulus + fq_native(r_native_512);
        EXPECT_EQ(expected_lhs, expected_rhs);

        // Native verification mod 2^T
        uint1024_t lhs_1024 = uint1024_t(c_native);
        for (size_t i = 0; i < num_terms; ++i) {
            lhs_1024 += uint1024_t(a_natives[i]) * uint1024_t(b_natives[i]);
        }
        uint1024_t rhs_1024 = q_native_512 * fq_ct::modulus + r_native_512;
        auto [quotient_lhs, remainder_lhs] = lhs_1024.divmod(fq_ct::binary_basis.modulus);
        auto [quotient_rhs, remainder_rhs] = rhs_1024.divmod(fq_ct::binary_basis.modulus);
        EXPECT_EQ(remainder_lhs, remainder_rhs);

        // Native verification mod n
        fr expected_lhs_fr = fr(c_native);
        for (size_t i = 0; i < num_terms; ++i) {
            expected_lhs_fr += fr(a_natives[i]) * fr(b_natives[i]);
        }
        fr expected_rhs_fr = fr(q_native_512) * fr(fq_ct::modulus) + fr(r_native_512);
        EXPECT_EQ(expected_lhs_fr, expected_rhs_fr);

        // Check circuit correctness
        bool result = CircuitChecker::check(builder);
        EXPECT_EQ(result, true);
    }

    static void test_unsafe_multiple_multiply_add_fails()
    {
        Builder builder;

        // The circuit enforces:
        // a1 * b1 + a2 * b2 + ... + (c0 + c1 + ...) = q * p + (r0 + r1 + ...) mod 2^T
        // a1 * b1 + a2 * b2 + ... + (c0 + c1 + ...) = q * p + (r0 + r1 + ...) mod n
        size_t num_terms = 3;
        std::vector<fq_native> a_natives;
        std::vector<fq_native> b_natives;
        std::vector<fq_ct> a_cts;
        std::vector<fq_ct> b_cts;

        for (size_t i = 0; i < num_terms; ++i) {
            auto [a_native, a_ct] = get_random_witness(&builder);
            auto [b_native, b_ct] = get_random_witness(&builder);
            a_natives.push_back(a_native);
            b_natives.push_back(b_native);
            a_cts.push_back(a_ct);
            b_cts.push_back(b_ct);
        }

        auto [c_native, c_ct] = get_random_witness(&builder);

        // Get quotient and remainder for (sum of ai * bi + c) from native values
        uint1024_t native_sum = uint1024_t(c_native);
        for (size_t i = 0; i < num_terms; ++i) {
            native_sum += uint1024_t(a_natives[i]) * uint1024_t(b_natives[i]);
        }
        auto [q_native_1024, r_native_1024] = native_sum.divmod(uint1024_t(fq_ct::modulus));
        fq_ct q_ct = fq_ct::create_from_u512_as_witness(
            &builder, q_native_1024.lo + uint512_t(1), true); // Intentionally poisoned
        fq_ct r_ct = fq_ct::create_from_u512_as_witness(&builder, r_native_1024.lo, true);

        // Call unsafe_evaluate_multiply_add (via friendly class)
        stdlib::bigfield_test_access::unsafe_evaluate_multiple_multiply_add(a_cts, b_cts, { c_ct }, q_ct, { r_ct });

        // Check circuit correctness
        bool result = CircuitChecker::check(builder);
        EXPECT_EQ(result, false);
        EXPECT_EQ(builder.err(), "bigfield: prime limb identity failed");
    }

    static void test_nonnormalized_field_bug_regression()
    {
        auto builder = Builder();
        fr_ct zero = witness_ct::create_constant_witness(&builder, fr::zero());
        uint256_t two_to_68 = uint256_t(1) << fq_ct::NUM_LIMB_BITS;
        // construct bigfield where the low limb has a non-trivial `additive_constant`
        fq_ct z(zero + two_to_68, zero);
        // assert invariant for every limb: actual value <= maximum value
        // Failed in the past for for StandardCircuitBuilder
        for (auto zi : z.binary_basis_limbs) {
            EXPECT_LE(uint256_t(zi.element.get_value()), zi.maximum_value);
        }
    }

    static void test_msub_div_ctx_crash_regression()
    {
        auto builder = Builder();
        fq_ct witness_one = fq_ct::create_from_u512_as_witness(&builder, uint256_t(1));
        fq_ct constant_one(1);
        fq_ct::msub_div({ witness_one }, { witness_one }, constant_one, { witness_one }, true);
        bool result = CircuitChecker::check(builder);
        EXPECT_EQ(result, true);
    }

    static void test_internal_div_regression()
    {
        typedef stdlib::bool_t<Builder> bool_t;
        auto builder = Builder();

        fq_ct w0 = fq_ct::from_witness(&builder, 1);
        w0 = w0.conditional_negate(bool_t(&builder, true));
        w0 = w0.conditional_negate(bool_t(&builder, false));
        w0 = w0.conditional_negate(bool_t(&builder, true));
        w0 = w0.conditional_negate(bool_t(&builder, true));
        fq_ct w4 = w0.conditional_negate(bool_t(&builder, false));
        w4 = w4.conditional_negate(bool_t(&builder, true));
        w4 = w4.conditional_negate(bool_t(&builder, true));
        fq_ct w5 = w4 - w0;
        fq_ct w6 = w5 / 1;
        (void)(w6);
        EXPECT_TRUE(CircuitChecker::check(builder));
    }

    static void test_internal_div_regression2()
    {
        auto builder = Builder();

        fq_ct numerator = fq_ct::create_from_u512_as_witness(&builder, uint256_t(1) << (68 + 67));
        numerator.binary_basis_limbs[0].maximum_value = 0;
        numerator.binary_basis_limbs[1].maximum_value = uint256_t(1) << 67;
        numerator.binary_basis_limbs[2].maximum_value = 0;
        numerator.binary_basis_limbs[3].maximum_value = 0;

        for (size_t i = 0; i < 9; i++) {
            numerator = numerator + numerator;
        }
        fq_ct denominator = fq_ct::create_from_u512_as_witness(&builder, uint256_t(1));
        fq_ct result = numerator / denominator;
        (void)(result);
        EXPECT_TRUE(CircuitChecker::check(builder));
    }

    static void test_internal_div_regression3()
    {
        Builder builder;
        uint256_t dlimb0_value = uint256_t("0x00000000000000000000000000000000000000000000000bef7fa109038857fc");
        uint256_t dlimb0_max = uint256_t("0x00000000000000000000000000000000000000000000000fffffffffffffffff");
        uint256_t dlimb1_value = uint256_t("0x0000000000000000000000000000000000000000000000056f10535779f56339");
        uint256_t dlimb1_max = uint256_t("0x00000000000000000000000000000000000000000000000fffffffffffffffff");
        uint256_t dlimb2_value = uint256_t("0x00000000000000000000000000000000000000000000000c741f60a1ec4e114e");
        uint256_t dlimb2_max = uint256_t("0x00000000000000000000000000000000000000000000000fffffffffffffffff");
        uint256_t dlimb3_value = uint256_t("0x000000000000000000000000000000000000000000000000000286b3cd344d8b");
        uint256_t dlimb3_max = uint256_t("0x0000000000000000000000000000000000000000000000000003ffffffffffff");
        uint256_t dlimb_prime = uint256_t("0x286b3cd344d8bc741f60a1ec4e114e56f10535779f56339bef7fa109038857fc");

        uint256_t nlimb0_value = uint256_t("0x00000000000000000000000000000000000000000000080a84d9bea2b012417c");
        uint256_t nlimb0_max = uint256_t("0x000000000000000000000000000000000000000000000ff7c7469df4081b61fc");
        uint256_t nlimb1_value = uint256_t("0x00000000000000000000000000000000000000000000080f50ee84526e8e5ba7");
        uint256_t nlimb1_max = uint256_t("0x000000000000000000000000000000000000000000000ffef965c67ba5d5893c");
        uint256_t nlimb2_value = uint256_t("0x00000000000000000000000000000000000000000000080aba136ca8eaf6dc1b");
        uint256_t nlimb2_max = uint256_t("0x000000000000000000000000000000000000000000000ff8171d22fd607249ea");
        uint256_t nlimb3_value = uint256_t("0x00000000000000000000000000000000000000000000000001f0042419843c29");
        uint256_t nlimb3_max = uint256_t("0x00000000000000000000000000000000000000000000000003e00636264659ff");
        uint256_t nlimb_prime = uint256_t("0x000000000000000000000000000000474da776b8ee19a56b08186bdcf01240d8");

        fq_ct w0 = fq_ct::from_witness(&builder, fq_native(0));
        w0.binary_basis_limbs[0].element = witness_ct(&builder, dlimb0_value);
        w0.binary_basis_limbs[1].element = witness_ct(&builder, dlimb1_value);
        w0.binary_basis_limbs[2].element = witness_ct(&builder, dlimb2_value);
        w0.binary_basis_limbs[3].element = witness_ct(&builder, dlimb3_value);
        w0.binary_basis_limbs[0].maximum_value = dlimb0_max;
        w0.binary_basis_limbs[1].maximum_value = dlimb1_max;
        w0.binary_basis_limbs[2].maximum_value = dlimb2_max;
        w0.binary_basis_limbs[3].maximum_value = dlimb3_max;
        w0.prime_basis_limb = witness_ct(&builder, dlimb_prime);

        fq_ct w1 = fq_ct::from_witness(&builder, fq_native(0));
        w1.binary_basis_limbs[0].element = witness_ct(&builder, nlimb0_value);
        w1.binary_basis_limbs[1].element = witness_ct(&builder, nlimb1_value);
        w1.binary_basis_limbs[2].element = witness_ct(&builder, nlimb2_value);
        w1.binary_basis_limbs[3].element = witness_ct(&builder, nlimb3_value);
        w1.binary_basis_limbs[0].maximum_value = nlimb0_max;
        w1.binary_basis_limbs[1].maximum_value = nlimb1_max;
        w1.binary_basis_limbs[2].maximum_value = nlimb2_max;
        w1.binary_basis_limbs[3].maximum_value = nlimb3_max;
        w1.prime_basis_limb = witness_ct(&builder, nlimb_prime);

        fq_ct w2 = w1 / w0;
        (void)w2;
        EXPECT_TRUE(CircuitChecker::check(builder));
    }

    static void test_assert_not_equal_regression()
    {
        auto builder = Builder();
        fq_ct zero = fq_ct::create_from_u512_as_witness(&builder, uint256_t(0));
        fq_ct alsozero = fq_ct::create_from_u512_as_witness(&builder, fq_ct::modulus_u512);
        for (size_t i = 0; i < 4; i++) {
            zero.binary_basis_limbs[i].maximum_value = zero.binary_basis_limbs[i].element.get_value();
            alsozero.binary_basis_limbs[i].maximum_value = alsozero.binary_basis_limbs[i].element.get_value();
        }
        zero.assert_is_not_equal(alsozero);
        bool result = CircuitChecker::check(builder);
        EXPECT_EQ(result, false);
    }
};

// Define types for which the above tests will be constructed.
using CircuitTypes = testing::Types<typename bb::stdlib::bn254<UltraCircuitBuilder>::BaseField,
                                    typename bb::stdlib::secp256k1<UltraCircuitBuilder>::fq_ct,
                                    typename bb::stdlib::secp256k1<UltraCircuitBuilder>::bigfr_ct,
                                    typename bb::stdlib::secp256r1<UltraCircuitBuilder>::fq_ct,
                                    typename bb::stdlib::secp256r1<UltraCircuitBuilder>::bigfr_ct>;
// Define the suite of tests.
TYPED_TEST_SUITE(stdlib_bigfield, CircuitTypes);

TYPED_TEST(stdlib_bigfield, assert_not_equal_regression)
{
    TestFixture::test_assert_not_equal_regression();
}

TYPED_TEST(stdlib_bigfield, add_to_lower_limb_regression)
{
    TestFixture::test_add_to_lower_limb_regression();
}
TYPED_TEST(stdlib_bigfield, badmul)
{
    TestFixture::test_bad_mul();
}

TYPED_TEST(stdlib_bigfield, division_formula_regression)
{
    TestFixture::test_division_formula_bug();
}
TYPED_TEST(stdlib_bigfield, basic_tag_logic)
{
    TestFixture::test_basic_tag_logic();
}
TYPED_TEST(stdlib_bigfield, test_constructor)
{
    TestFixture::test_constructor_from_two_elements();
}
TYPED_TEST(stdlib_bigfield, test_unsafe_construct_from_limbs)
{
    TestFixture::test_unsafe_construct_from_limbs();
}
TYPED_TEST(stdlib_bigfield, test_construct_from_limbs)
{
    TestFixture::test_construct_from_limbs();
}
TYPED_TEST(stdlib_bigfield, test_construct_from_limbs_fails)
{
    TestFixture::test_construct_from_limbs_fails();
}
TYPED_TEST(stdlib_bigfield, add_two)
{
    TestFixture::test_add_two(InputType::WITNESS, InputType::WITNESS, InputType::WITNESS);
}
TYPED_TEST(stdlib_bigfield, add_two_with_constants)
{
    TestFixture::test_add_two(InputType::WITNESS, InputType::WITNESS, InputType::CONSTANT);
    TestFixture::test_add_two(InputType::WITNESS, InputType::CONSTANT, InputType::WITNESS);
    TestFixture::test_add_two(InputType::WITNESS, InputType::CONSTANT, InputType::CONSTANT);
    TestFixture::test_add_two(InputType::CONSTANT, InputType::WITNESS, InputType::WITNESS);
    TestFixture::test_add_two(InputType::CONSTANT, InputType::WITNESS, InputType::CONSTANT);
    TestFixture::test_add_two(InputType::CONSTANT, InputType::CONSTANT, InputType::WITNESS);
    TestFixture::test_add_two(InputType::CONSTANT, InputType::CONSTANT, InputType::CONSTANT);
}
TYPED_TEST(stdlib_bigfield, sum)
{
    TestFixture::test_sum(InputType::WITNESS);
}
TYPED_TEST(stdlib_bigfield, sum_with_mixed_inputs)
{
    TestFixture::test_sum(InputType::WITNESS, true);
}
TYPED_TEST(stdlib_bigfield, sum_with_constant)
{
    TestFixture::test_sum(InputType::CONSTANT);
}
TYPED_TEST(stdlib_bigfield, mul)
{
    TestFixture::test_mul(InputType::WITNESS, InputType::WITNESS);
}
TYPED_TEST(stdlib_bigfield, mul_with_constant)
{
    TestFixture::test_mul(InputType::WITNESS, InputType::CONSTANT);
    TestFixture::test_mul(InputType::CONSTANT, InputType::WITNESS);
    TestFixture::test_mul(InputType::CONSTANT, InputType::CONSTANT);
}
TYPED_TEST(stdlib_bigfield, sub)
{
    TestFixture::test_sub(InputType::WITNESS, InputType::WITNESS);
}
TYPED_TEST(stdlib_bigfield, sub_with_constant)
{
    TestFixture::test_sub(InputType::WITNESS, InputType::CONSTANT);
    TestFixture::test_sub(InputType::CONSTANT, InputType::WITNESS);
    TestFixture::test_sub(InputType::CONSTANT, InputType::CONSTANT);
}
TYPED_TEST(stdlib_bigfield, add)
{
    TestFixture::test_add(InputType::WITNESS, InputType::WITNESS);
}
TYPED_TEST(stdlib_bigfield, add_with_constant)
{
    TestFixture::test_add(InputType::WITNESS, InputType::CONSTANT);
    TestFixture::test_add(InputType::CONSTANT, InputType::WITNESS);
    TestFixture::test_add(InputType::CONSTANT, InputType::CONSTANT);
}
TYPED_TEST(stdlib_bigfield, div)
{
    TestFixture::test_div(InputType::WITNESS, InputType::WITNESS); // w / w
}
TYPED_TEST(stdlib_bigfield, div_with_constant)
{
    TestFixture::test_div(InputType::WITNESS, InputType::CONSTANT);  // w / c
    TestFixture::test_div(InputType::CONSTANT, InputType::WITNESS);  // c / w
    TestFixture::test_div(InputType::CONSTANT, InputType::CONSTANT); // c / c
}
TYPED_TEST(stdlib_bigfield, sqr)
{
    TestFixture::test_sqr(InputType::WITNESS);
}
TYPED_TEST(stdlib_bigfield, sqr_with_constant)
{
    TestFixture::test_sqr(InputType::CONSTANT);
}
TYPED_TEST(stdlib_bigfield, negate)
{
    TestFixture::test_negate(InputType::WITNESS);
}
TYPED_TEST(stdlib_bigfield, mul_assignment)
{
    TestFixture::test_mul_assign(InputType::WITNESS, InputType::WITNESS);
}
TYPED_TEST(stdlib_bigfield, mul_assignment_with_constant)
{
    TestFixture::test_mul_assign(InputType::WITNESS, InputType::CONSTANT);
    TestFixture::test_mul_assign(InputType::CONSTANT, InputType::WITNESS);
    TestFixture::test_mul_assign(InputType::CONSTANT, InputType::CONSTANT);
}
TYPED_TEST(stdlib_bigfield, add_assignment)
{
    TestFixture::test_add_assign(InputType::WITNESS, InputType::WITNESS);
}
TYPED_TEST(stdlib_bigfield, add_assignment_with_constant)
{
    TestFixture::test_add_assign(InputType::WITNESS, InputType::CONSTANT);
    TestFixture::test_add_assign(InputType::CONSTANT, InputType::WITNESS);
    TestFixture::test_add_assign(InputType::CONSTANT, InputType::CONSTANT);
}
TYPED_TEST(stdlib_bigfield, sub_assignment)
{
    TestFixture::test_sub_assign(InputType::WITNESS, InputType::WITNESS);
}
TYPED_TEST(stdlib_bigfield, sub_assignment_with_constant)
{
    TestFixture::test_sub_assign(InputType::WITNESS, InputType::CONSTANT);
    TestFixture::test_sub_assign(InputType::CONSTANT, InputType::WITNESS);
    TestFixture::test_sub_assign(InputType::CONSTANT, InputType::CONSTANT);
}
TYPED_TEST(stdlib_bigfield, div_assignment)
{
    TestFixture::test_div_assign(InputType::WITNESS, InputType::WITNESS); // w / w
}
TYPED_TEST(stdlib_bigfield, div_assignment_with_constant)
{
    TestFixture::test_div_assign(InputType::WITNESS, InputType::CONSTANT);  // w / c
    TestFixture::test_div_assign(InputType::CONSTANT, InputType::WITNESS);  // c / w
    TestFixture::test_div_assign(InputType::CONSTANT, InputType::CONSTANT); // c / c
}
TYPED_TEST(stdlib_bigfield, madd)
{
    TestFixture::test_madd(InputType::WITNESS, InputType::WITNESS, InputType::CONSTANT); // w * w + w
}
TYPED_TEST(stdlib_bigfield, madd_with_constants)
{
    TestFixture::test_madd(InputType::WITNESS, InputType::WITNESS, InputType::CONSTANT);  // w * w + c
    TestFixture::test_madd(InputType::WITNESS, InputType::CONSTANT, InputType::WITNESS);  // w * c + w
    TestFixture::test_madd(InputType::WITNESS, InputType::CONSTANT, InputType::CONSTANT); // w * c + c
    TestFixture::test_madd(InputType::CONSTANT, InputType::WITNESS, InputType::WITNESS);  // c * w + w
    TestFixture::test_madd(InputType::CONSTANT, InputType::WITNESS, InputType::CONSTANT); // c * w + c
    TestFixture::test_madd(InputType::WITNESS, InputType::WITNESS, InputType::CONSTANT);  // w * w + c
    TestFixture::test_madd(InputType::WITNESS, InputType::CONSTANT, InputType::WITNESS);  // w * c + w
    TestFixture::test_madd(InputType::CONSTANT, InputType::WITNESS, InputType::CONSTANT); // c * w + c
}
TYPED_TEST(stdlib_bigfield, sqradd)
{
    TestFixture::test_sqradd(InputType::WITNESS, InputType::WITNESS); // w^2 + w
}
TYPED_TEST(stdlib_bigfield, sqradd_with_constant)
{
    TestFixture::test_sqradd(InputType::WITNESS, InputType::CONSTANT);  // w^2 + c
    TestFixture::test_sqradd(InputType::CONSTANT, InputType::WITNESS);  // c^2 + w
    TestFixture::test_sqradd(InputType::CONSTANT, InputType::CONSTANT); // c^2 + c
}
TYPED_TEST(stdlib_bigfield, mult_madd)
{
    TestFixture::test_mult_madd(InputType::WITNESS, InputType::WITNESS, InputType::WITNESS); // ∑ (w * w + w)
}
TYPED_TEST(stdlib_bigfield, mult_madd_with_constants)
{
    TestFixture::test_mult_madd(InputType::WITNESS, InputType::WITNESS, InputType::CONSTANT);   // ∑ (w * w + c)
    TestFixture::test_mult_madd(InputType::WITNESS, InputType::CONSTANT, InputType::WITNESS);   // ∑ (w * c + w)
    TestFixture::test_mult_madd(InputType::WITNESS, InputType::CONSTANT, InputType::CONSTANT);  // ∑ (w * c + c)
    TestFixture::test_mult_madd(InputType::CONSTANT, InputType::CONSTANT, InputType::CONSTANT); // ∑ (c * c + c)
}
TYPED_TEST(stdlib_bigfield, mult_madd_edge_cases)
{
    // all witness except the last one
    TestFixture::test_mult_madd(InputType::WITNESS, InputType::WITNESS, InputType::WITNESS, true);
    // all constant except the last one
    TestFixture::test_mult_madd(InputType::CONSTANT, InputType::CONSTANT, InputType::CONSTANT, true);
}
TYPED_TEST(stdlib_bigfield, dual_madd)
{
    TestFixture::test_dual_madd();
}
TYPED_TEST(stdlib_bigfield, div_without_denominator_check)
{
    TestFixture::test_div_without_denominator_check(InputType::WITNESS, InputType::WITNESS); // w / w
}
TYPED_TEST(stdlib_bigfield, div_without_denominator_check_with_constant)
{
    TestFixture::test_div_without_denominator_check(InputType::WITNESS, InputType::CONSTANT);  // w / c
    TestFixture::test_div_without_denominator_check(InputType::CONSTANT, InputType::WITNESS);  // c / w
    TestFixture::test_div_without_denominator_check(InputType::CONSTANT, InputType::CONSTANT); // c / c
}
TYPED_TEST(stdlib_bigfield, add_and_div)
{
    TestFixture::test_add_and_div();
}
TYPED_TEST(stdlib_bigfield, add_and_mul)
{
    TestFixture::test_add_and_mul(InputType::WITNESS); // (w + w) * (w + w)
}
TYPED_TEST(stdlib_bigfield, add_and_mul_with_constants)
{
    TestFixture::test_add_and_mul(InputType::CONSTANT); // (w + c) * (w + c)
}
TYPED_TEST(stdlib_bigfield, sub_and_mul)
{
    TestFixture::test_sub_and_mul(InputType::WITNESS); // (w - w) * (w - w)
}
TYPED_TEST(stdlib_bigfield, sub_and_mul_with_constants)
{
    TestFixture::test_sub_and_mul(InputType::CONSTANT); // (w - c) * (w - c)
}
TYPED_TEST(stdlib_bigfield, msub_div)
{
    TestFixture::test_msub_div(
        InputType::WITNESS, InputType::WITNESS, InputType::WITNESS); // (-w * w - w - w) / (w - w)
}
TYPED_TEST(stdlib_bigfield, msub_div_with_constants)
{
    TestFixture::test_msub_div(
        InputType::WITNESS, InputType::WITNESS, InputType::CONSTANT); // (-w * w - w - c) / (w - w)
    TestFixture::test_msub_div(
        InputType::WITNESS, InputType::CONSTANT, InputType::WITNESS); // (-w * c - w - w) / (w - w)
    TestFixture::test_msub_div(
        InputType::WITNESS, InputType::CONSTANT, InputType::CONSTANT); // (-w * c - w - c) / (w - w)
    TestFixture::test_msub_div(
        InputType::CONSTANT, InputType::WITNESS, InputType::WITNESS); // (-c * w - c - w) / (w - w)
    TestFixture::test_msub_div(
        InputType::CONSTANT, InputType::WITNESS, InputType::CONSTANT); // (-c * w - c - c) / (w - w)
    TestFixture::test_msub_div(
        InputType::CONSTANT, InputType::CONSTANT, InputType::CONSTANT); // (-c * c - c - c) / (w - w)
}
TYPED_TEST(stdlib_bigfield, conditional_assign)
{
    TestFixture::test_conditional_assign(InputType::WITNESS, InputType::WITNESS, InputType::WITNESS); // w ? w : w
}
TYPED_TEST(stdlib_bigfield, conditional_assign_with_constants)
{
    TestFixture::test_conditional_assign(InputType::WITNESS, InputType::WITNESS, InputType::CONSTANT);   // w ? w : c
    TestFixture::test_conditional_assign(InputType::WITNESS, InputType::CONSTANT, InputType::WITNESS);   // w ? c : w
    TestFixture::test_conditional_assign(InputType::WITNESS, InputType::CONSTANT, InputType::CONSTANT);  // w ? c : c
    TestFixture::test_conditional_assign(InputType::CONSTANT, InputType::WITNESS, InputType::WITNESS);   // c ? w : w
    TestFixture::test_conditional_assign(InputType::CONSTANT, InputType::WITNESS, InputType::CONSTANT);  // c ? w : c
    TestFixture::test_conditional_assign(InputType::CONSTANT, InputType::CONSTANT, InputType::CONSTANT); // c ? c : c
}
TYPED_TEST(stdlib_bigfield, conditional_select)
{
    TestFixture::test_conditional_select(InputType::WITNESS, InputType::WITNESS, InputType::WITNESS); // w ? w : w
}
TYPED_TEST(stdlib_bigfield, conditional_select_with_constants)
{
    TestFixture::test_conditional_select(InputType::WITNESS, InputType::WITNESS, InputType::CONSTANT);   // w ? w : c
    TestFixture::test_conditional_select(InputType::WITNESS, InputType::CONSTANT, InputType::WITNESS);   // w ? c : w
    TestFixture::test_conditional_select(InputType::WITNESS, InputType::CONSTANT, InputType::CONSTANT);  // w ? c : c
    TestFixture::test_conditional_select(InputType::CONSTANT, InputType::WITNESS, InputType::WITNESS);   // c ? w : w
    TestFixture::test_conditional_select(InputType::CONSTANT, InputType::WITNESS, InputType::CONSTANT);  // c ? w : c
    TestFixture::test_conditional_select(InputType::CONSTANT, InputType::CONSTANT, InputType::CONSTANT); // c ? c : c
}
TYPED_TEST(stdlib_bigfield, msb_div_ctx_crash_regression)
{
    TestFixture::test_msub_div_ctx_crash_regression();
}
TYPED_TEST(stdlib_bigfield, conditional_negate)
{
    TestFixture::test_conditional_negate(InputType::WITNESS, InputType::WITNESS); // w ? -w : w
}
TYPED_TEST(stdlib_bigfield, conditional_negate_with_constants)
{
    TestFixture::test_conditional_negate(InputType::WITNESS, InputType::CONSTANT);  // w ? -c : w
    TestFixture::test_conditional_negate(InputType::CONSTANT, InputType::WITNESS);  // c ? -w : w
    TestFixture::test_conditional_negate(InputType::CONSTANT, InputType::CONSTANT); // c ? -c : c
}
TYPED_TEST(stdlib_bigfield, group_operations)
{
    // skip this test if the field is not bn254 base field
    if constexpr (!std::is_same_v<TypeParam, typename bb::stdlib::bn254<UltraCircuitBuilder>::BaseField>) {
        GTEST_SKIP() << "skipping group operations test for non-bn254 base field";
    }
    TestFixture::test_group_operations();
}
TYPED_TEST(stdlib_bigfield, reduce)
{
    TestFixture::test_reduce();
}
TYPED_TEST(stdlib_bigfield, equality)
{
    TestFixture::test_equality_operator(InputType::WITNESS, InputType::WITNESS); // w == w
}
TYPED_TEST(stdlib_bigfield, equality_with_constants)
{
    TestFixture::test_equality_operator(InputType::WITNESS, InputType::CONSTANT);  // w == c
    TestFixture::test_equality_operator(InputType::CONSTANT, InputType::WITNESS);  // c == w
    TestFixture::test_equality_operator(InputType::CONSTANT, InputType::CONSTANT); // c == c
}

TYPED_TEST(stdlib_bigfield, unsafe_assert_less_than)
{
    TestFixture::test_unsafe_assert_less_than();
}
TYPED_TEST(stdlib_bigfield, unsafe_assert_less_than_fails)
{
    TestFixture::test_unsafe_assert_less_than_fails();
}
TYPED_TEST(stdlib_bigfield, unsafe_evaluate_multiply_add)
{
    TestFixture::test_unsafe_evaluate_multiply_add();
}
TYPED_TEST(stdlib_bigfield, unsafe_evaluate_multiply_add_fails)
{
    TestFixture::test_unsafe_evaluate_multiply_add_fails();
}
TYPED_TEST(stdlib_bigfield, unsafe_evaluate_multiple_multiply_add)
{
    TestFixture::test_unsafe_multiple_multiply_add();
}
TYPED_TEST(stdlib_bigfield, unsafe_evaluate_multiple_multiply_add_fails)
{
    TestFixture::test_unsafe_multiple_multiply_add_fails();
}

TYPED_TEST(stdlib_bigfield, assert_is_in_field_success)
{
    TestFixture::test_assert_is_in_field_success();
}
TYPED_TEST(stdlib_bigfield, assert_is_in_field_fails)
{
    TestFixture::test_assert_is_in_field_fails();
}
TYPED_TEST(stdlib_bigfield, assert_less_than_success)
{
    TestFixture::test_assert_less_than_success();
}
TYPED_TEST(stdlib_bigfield, assert_less_than_fails)
{
    TestFixture::test_assert_less_than_fails();
}
TYPED_TEST(stdlib_bigfield, reduce_mod_target_modulus)
{
    TestFixture::test_reduce_mod_target_modulus();
}
TYPED_TEST(stdlib_bigfield, byte_array_constructors)
{
    TestFixture::test_byte_array_constructors();
}
TYPED_TEST(stdlib_bigfield, to_byte_array)
{
    TestFixture::test_to_byte_array();
}
TYPED_TEST(stdlib_bigfield, quotient_completeness_regression)
{
    TestFixture::test_quotient_completeness();
}

TYPED_TEST(stdlib_bigfield, conditional_select_regression)
{
    TestFixture::test_conditional_select_regression();
}

TYPED_TEST(stdlib_bigfield, division_context)
{
    TestFixture::test_division_context();
}

TYPED_TEST(stdlib_bigfield, inverse)
{
    TestFixture::test_inversion();
}

TYPED_TEST(stdlib_bigfield, assert_equal_not_equal)
{
    TestFixture::test_assert_equal_not_equal();
}

TYPED_TEST(stdlib_bigfield, pow)
{
    TestFixture::test_pow();
}

TYPED_TEST(stdlib_bigfield, pow_one)
{
    TestFixture::test_pow_one();
}
TYPED_TEST(stdlib_bigfield, nonnormalized_field_bug_regression)
{
    TestFixture::test_nonnormalized_field_bug_regression();
}

TYPED_TEST(stdlib_bigfield, internal_div_bug_regression)
{
    TestFixture::test_internal_div_regression();
    TestFixture::test_internal_div_regression2();
    TestFixture::test_internal_div_regression3();
}

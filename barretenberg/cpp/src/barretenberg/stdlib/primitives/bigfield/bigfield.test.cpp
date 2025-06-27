#include "barretenberg/stdlib/primitives/bigfield/bigfield.hpp"
#include "barretenberg/numeric/random/engine.hpp"

#include "barretenberg/ecc/curves/bn254/fq.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"

#include "../bool/bool.hpp"
#include "../byte_array/byte_array.hpp"
#include "../field/field.hpp"
#include "./bigfield.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/transcript/origin_tag.hpp"
#include <gtest/gtest.h>
#include <memory>
#include <utility>

using namespace bb;

/* A note regarding Plookup:
   stdlib_bigfield_plookup tests were present when this file was standardized
   to be more proving system-agnostic. Those tests are commented out  below, but modified
   in the following ways:
     - pbigfield_t was replaced by bn254::BaseField;
     - pwitness_t  was replaced by bn254::witness_ct.
*/

namespace {
auto& engine = numeric::get_debug_randomness();
}

STANDARD_TESTING_TAGS
template <typename Builder> class stdlib_bigfield : public testing::Test {

    typedef stdlib::bn254<Builder> bn254;

    typedef typename bn254::ScalarField fr_ct;
    typedef typename bn254::BaseField fq_ct;
    typedef typename bn254::public_witness_ct public_witness_ct;
    typedef typename bn254::witness_ct witness_ct;

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

    static std::pair<fq, fq_ct> get_random_element(Builder* ctx)
    {
        fq elt = fq::random_element();
        return std::make_pair(elt, fq_ct::from_witness(ctx, elt));
    }

    static std::pair<std::vector<fq>, std::vector<fq_ct>> get_random_elements(Builder* ctx, size_t num)
    {
        std::vector<fq> elts(num);
        std::vector<fq_ct> big_elts(num);
        for (size_t i = 0; i < num; ++i) {
            auto [elt, big_elt] = get_random_element(ctx);
            elts[i] = elt;
            big_elts[i] = big_elt;
        }
        return std::make_pair(elts, big_elts);
    }

  public:
    static void test_basic_tag_logic()
    {
        auto builder = Builder();
        auto input = fq::random_element();
        fq_ct a(witness_ct(&builder, fr(uint256_t(input).slice(0, fq_ct::NUM_LIMB_BITS * 2))),
                witness_ct(&builder, fr(uint256_t(input).slice(fq_ct::NUM_LIMB_BITS * 2, fq_ct::NUM_LIMB_BITS * 4))));
        a.binary_basis_limbs[0].element.set_origin_tag(submitted_value_origin_tag);
        a.binary_basis_limbs[1].element.set_origin_tag(challenge_origin_tag);
        a.prime_basis_limb.set_origin_tag(next_challenge_tag);

        EXPECT_EQ(a.get_origin_tag(), first_second_third_merged_tag);

        a.set_origin_tag(clear_tag);
        EXPECT_EQ(a.binary_basis_limbs[0].element.get_origin_tag(), clear_tag);
        EXPECT_EQ(a.binary_basis_limbs[1].element.get_origin_tag(), clear_tag);
        EXPECT_EQ(a.binary_basis_limbs[2].element.get_origin_tag(), clear_tag);
        EXPECT_EQ(a.binary_basis_limbs[3].element.get_origin_tag(), clear_tag);
        EXPECT_EQ(a.prime_basis_limb.get_origin_tag(), clear_tag);

#ifndef NDEBUG
        a.set_origin_tag(instant_death_tag);
        EXPECT_THROW(a + a, std::runtime_error);
#endif
    }
    static void test_mul()
    {
        auto builder = Builder();
        size_t num_repetitions = 4;
        for (size_t i = 0; i < num_repetitions; ++i) {
            fq inputs[3]{ fq::random_element(), fq::random_element(), fq::random_element() };
            fq_ct a(witness_ct(&builder, fr(uint256_t(inputs[0]).slice(0, fq_ct::NUM_LIMB_BITS * 2))),
                    witness_ct(&builder,
                               fr(uint256_t(inputs[0]).slice(fq_ct::NUM_LIMB_BITS * 2, fq_ct::NUM_LIMB_BITS * 4))));
            a.set_origin_tag(submitted_value_origin_tag);
            fq_ct b(witness_ct(&builder, fr(uint256_t(inputs[1]).slice(0, fq_ct::NUM_LIMB_BITS * 2))),
                    witness_ct(&builder,
                               fr(uint256_t(inputs[1]).slice(fq_ct::NUM_LIMB_BITS * 2, fq_ct::NUM_LIMB_BITS * 4))));
            b.set_origin_tag(challenge_origin_tag);

            uint64_t before = builder.get_estimated_num_finalized_gates();
            fq_ct c = a * b;
            EXPECT_EQ(c.get_origin_tag(), first_two_merged_tag);
            uint64_t after = builder.get_estimated_num_finalized_gates();
            // Don't profile 1st repetition. It sets up a lookup table, cost is not representative of a typical mul
            if (i == num_repetitions - 2) {
                std::cerr << "num gates per mul = " << after - before << std::endl;
                benchmark_info(Builder::NAME_STRING, "Bigfield", "MUL", "Gate Count", after - before);
            }

            fq expected = (inputs[0] * inputs[1]);
            expected = expected.from_montgomery_form();
            uint512_t result = c.get_value();

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

    static void test_sqr()
    {
        auto builder = Builder();
        size_t num_repetitions = 10;
        for (size_t i = 0; i < num_repetitions; ++i) {
            fq inputs[3]{ fq::random_element(), fq::random_element(), fq::random_element() };
            fq_ct a(witness_ct(&builder, fr(uint256_t(inputs[0]).slice(0, fq_ct::NUM_LIMB_BITS * 2))),
                    witness_ct(&builder,
                               fr(uint256_t(inputs[0]).slice(fq_ct::NUM_LIMB_BITS * 2, fq_ct::NUM_LIMB_BITS * 4))));
            a.set_origin_tag(next_challenge_tag);

            uint64_t before = builder.get_estimated_num_finalized_gates();
            fq_ct c = a.sqr();

            // Squaring preserves tags
            EXPECT_EQ(a.get_origin_tag(), next_challenge_tag);
            uint64_t after = builder.get_estimated_num_finalized_gates();
            if (i == num_repetitions - 1) {
                std::cerr << "num gates per mul = " << after - before << std::endl;
                benchmark_info(Builder::NAME_STRING, "Bigfield", "SQR", "Gate Count", after - before);
            }

            fq expected = (inputs[0].sqr());
            expected = expected.from_montgomery_form();
            uint512_t result = c.get_value();

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

    static void test_madd()
    {
        auto builder = Builder();
        size_t num_repetitions = 1;
        for (size_t i = 0; i < num_repetitions; ++i) {
            fq inputs[3]{ fq::random_element(), fq::random_element(), fq::random_element() };
            fq_ct a(witness_ct(&builder, fr(uint256_t(inputs[0]).slice(0, fq_ct::NUM_LIMB_BITS * 2))),
                    witness_ct(&builder,
                               fr(uint256_t(inputs[0]).slice(fq_ct::NUM_LIMB_BITS * 2, fq_ct::NUM_LIMB_BITS * 4))));
            fq_ct b(witness_ct(&builder, fr(uint256_t(inputs[1]).slice(0, fq_ct::NUM_LIMB_BITS * 2))),
                    witness_ct(&builder,
                               fr(uint256_t(inputs[1]).slice(fq_ct::NUM_LIMB_BITS * 2, fq_ct::NUM_LIMB_BITS * 4))));

            fq_ct c(witness_ct(&builder, fr(uint256_t(inputs[2]).slice(0, fq_ct::NUM_LIMB_BITS * 2))),
                    witness_ct(&builder,
                               fr(uint256_t(inputs[2]).slice(fq_ct::NUM_LIMB_BITS * 2, fq_ct::NUM_LIMB_BITS * 4))));
            a.set_origin_tag(challenge_origin_tag);
            b.set_origin_tag(submitted_value_origin_tag);
            c.set_origin_tag(next_challenge_tag);
            uint64_t before = builder.get_estimated_num_finalized_gates();
            fq_ct d = a.madd(b, { c });

            // Madd merges tags
            EXPECT_EQ(d.get_origin_tag(), first_second_third_merged_tag);
            uint64_t after = builder.get_estimated_num_finalized_gates();
            if (i == num_repetitions - 1) {
                std::cerr << "num gates per mul = " << after - before << std::endl;
                benchmark_info(Builder::NAME_STRING, "Bigfield", "MADD", "Gate Count", after - before);
            }

            fq expected = (inputs[0] * inputs[1]) + inputs[2];
            expected = expected.from_montgomery_form();
            uint512_t result = d.get_value();

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

    static void test_mult_madd()
    {
        auto builder = Builder();
        size_t num_repetitions = 1;
        const size_t number_of_madds = 16;
        for (size_t i = 0; i < num_repetitions; ++i) {
            fq mul_left_values[number_of_madds];
            fq mul_right_values[number_of_madds];
            fq to_add_values[number_of_madds];

            fq expected(0);

            std::vector<fq_ct> mul_left;
            std::vector<fq_ct> mul_right;
            std::vector<fq_ct> to_add;
            mul_left.reserve(number_of_madds);
            mul_right.reserve(number_of_madds);
            to_add.reserve(number_of_madds);
            for (size_t j = 0; j < number_of_madds; j++) {
                mul_left_values[j] = fq::random_element();
                mul_right_values[j] = fq::random_element();
                expected += mul_left_values[j] * mul_right_values[j];
                mul_left.emplace_back(
                    fq_ct::create_from_u512_as_witness(&builder, uint512_t(uint256_t(mul_left_values[j]))));
                mul_right.emplace_back(
                    fq_ct::create_from_u512_as_witness(&builder, uint512_t(uint256_t(mul_right_values[j]))));
                to_add_values[j] = fq::random_element();
                expected += to_add_values[j];
                to_add.emplace_back(
                    fq_ct::create_from_u512_as_witness(&builder, uint512_t(uint256_t(to_add_values[j]))));

                // Since this test uses  create_from_u512_as_witness, the tags are set to free_witness_tag
                // We need to unset them so that we can test the tag propagation logic without interference
                mul_left[j].unset_free_witness_tag();
                mul_right[j].unset_free_witness_tag();
                to_add[j].unset_free_witness_tag();
            }
            mul_left[number_of_madds - 1].set_origin_tag(submitted_value_origin_tag);
            mul_right[number_of_madds - 1].set_origin_tag(challenge_origin_tag);
            to_add[number_of_madds - 1].set_origin_tag(next_challenge_tag);
            uint64_t before = builder.get_estimated_num_finalized_gates();
            fq_ct f = fq_ct::mult_madd(mul_left, mul_right, to_add);
            // mult_madd merges tags
            EXPECT_EQ(f.get_origin_tag(), first_second_third_merged_tag);
            uint64_t after = builder.get_estimated_num_finalized_gates();
            if (i == num_repetitions - 1) {
                std::cerr << "num gates with mult_madd = " << after - before << std::endl;
                benchmark_info(Builder::NAME_STRING, "Bigfield", "MULT_MADD", "Gate Count", after - before);
            }

            expected = expected.from_montgomery_form();
            uint512_t result = f.get_value();

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

    static void test_mult_madd_with_constants()
    {
        auto builder = Builder();
        size_t num_repetitions = 1;
        const size_t number_of_madds = 16;
        for (size_t i = 0; i < num_repetitions; ++i) {
            fq mul_left_values[number_of_madds];
            fq mul_right_values[number_of_madds];
            fq to_add_values[number_of_madds];

            fq expected(0);

            std::vector<fq_ct> mul_left;
            std::vector<fq_ct> mul_right;
            std::vector<fq_ct> to_add;
            mul_left.reserve(number_of_madds);
            mul_right.reserve(number_of_madds);
            to_add.reserve(number_of_madds);
            for (size_t j = 0; j < number_of_madds; j++) {
                mul_left_values[j] = fq::random_element();
                mul_right_values[j] = fq::random_element();
                expected += mul_left_values[j] * mul_right_values[j];

                // Left and right multiplicands are constants
                fq_ct left_const = fq_ct(&builder, uint256_t(mul_left_values[j]));
                fq_ct right_const = fq_ct(&builder, uint256_t(mul_right_values[j]));
                mul_left.emplace_back(left_const);
                mul_right.emplace_back(right_const);
                mul_left[j].set_origin_tag(submitted_value_origin_tag);
                mul_right[j].set_origin_tag(challenge_origin_tag);

                // to_add are witnesses
                to_add_values[j] = fq::random_element();
                expected += to_add_values[j];
                to_add.emplace_back(
                    fq_ct::create_from_u512_as_witness(&builder, uint512_t(uint256_t(to_add_values[j]))));

                // Since this test uses  create_from_u512_as_witness, the tags are set to free_witness_tag
                // We need to unset them so that we can test the tag propagation logic without interference
                to_add[j].unset_free_witness_tag();
            }

            uint64_t before = builder.get_estimated_num_finalized_gates();
            fq_ct f = fq_ct::mult_madd(mul_left, mul_right, to_add);

            // result might not be reduced, so we need to reduce it
            f.self_reduce();

            // mult_madd merges tags
            EXPECT_EQ(f.get_origin_tag(), first_two_merged_tag);
            uint64_t after = builder.get_estimated_num_finalized_gates();
            if (i == num_repetitions - 1) {
                std::cerr << "num gates with mult_madd = " << after - before << std::endl;
                benchmark_info(Builder::NAME_STRING, "Bigfield", "MULT_MADD", "Gate Count", after - before);
            }

            expected = expected.reduce_once().reduce_once();
            expected = expected.from_montgomery_form();
            uint512_t result = f.get_value();

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
            fq inputs[5]{ -1, -2, -3, -4, -5 };
            fq_ct a(witness_ct(&builder, fr(uint256_t(inputs[0]).slice(0, fq_ct::NUM_LIMB_BITS * 2))),
                    witness_ct(&builder,
                               fr(uint256_t(inputs[0]).slice(fq_ct::NUM_LIMB_BITS * 2, fq_ct::NUM_LIMB_BITS * 4))));
            fq_ct b(witness_ct(&builder, fr(uint256_t(inputs[1]).slice(0, fq_ct::NUM_LIMB_BITS * 2))),
                    witness_ct(&builder,
                               fr(uint256_t(inputs[1]).slice(fq_ct::NUM_LIMB_BITS * 2, fq_ct::NUM_LIMB_BITS * 4))));

            fq_ct c(witness_ct(&builder, fr(uint256_t(inputs[2]).slice(0, fq_ct::NUM_LIMB_BITS * 2))),
                    witness_ct(&builder,
                               fr(uint256_t(inputs[2]).slice(fq_ct::NUM_LIMB_BITS * 2, fq_ct::NUM_LIMB_BITS * 4))));

            fq_ct d(witness_ct(&builder, fr(uint256_t(inputs[3]).slice(0, fq_ct::NUM_LIMB_BITS * 2))),
                    witness_ct(&builder,
                               fr(uint256_t(inputs[3]).slice(fq_ct::NUM_LIMB_BITS * 2, fq_ct::NUM_LIMB_BITS * 4))));
            fq_ct e(witness_ct(&builder, fr(uint256_t(inputs[4]).slice(0, fq_ct::NUM_LIMB_BITS * 2))),
                    witness_ct(&builder,
                               fr(uint256_t(inputs[4]).slice(fq_ct::NUM_LIMB_BITS * 2, fq_ct::NUM_LIMB_BITS * 4))));

            a.set_origin_tag(submitted_value_origin_tag);
            d.set_origin_tag(challenge_origin_tag);
            e.set_origin_tag(next_challenge_tag);
            uint64_t before = builder.get_estimated_num_finalized_gates();
            fq_ct f = fq_ct::dual_madd(a, b, c, d, { e });
            // dual_madd merges tags
            EXPECT_EQ(f.get_origin_tag(), first_second_third_merged_tag);
            uint64_t after = builder.get_estimated_num_finalized_gates();
            if (i == num_repetitions - 1) {
                std::cerr << "num gates per mul = " << after - before << std::endl;
            }

            fq expected = (inputs[0] * inputs[1]) + (inputs[2] * inputs[3]) + inputs[4];
            expected = expected.from_montgomery_form();
            uint512_t result = f.get_value();

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

    static void test_div()
    {
        auto builder = Builder();
        size_t num_repetitions = 10;
        for (size_t i = 0; i < num_repetitions; ++i) {
            fq inputs[3]{ fq::random_element(), fq::random_element(), fq::random_element() };
            inputs[0] = inputs[0].reduce_once().reduce_once();
            inputs[1] = inputs[1].reduce_once().reduce_once();
            fq_ct a(witness_ct(&builder, fr(uint256_t(inputs[0]).slice(0, fq_ct::NUM_LIMB_BITS * 2))),
                    witness_ct(&builder,
                               fr(uint256_t(inputs[0]).slice(fq_ct::NUM_LIMB_BITS * 2, fq_ct::NUM_LIMB_BITS * 4))));
            fq_ct b(witness_ct(&builder, fr(uint256_t(inputs[1]).slice(0, fq_ct::NUM_LIMB_BITS * 2))),
                    witness_ct(&builder,
                               fr(uint256_t(inputs[1]).slice(fq_ct::NUM_LIMB_BITS * 2, fq_ct::NUM_LIMB_BITS * 4))));
            a.set_origin_tag(submitted_value_origin_tag);
            b.set_origin_tag(challenge_origin_tag);
            uint64_t before = builder.get_estimated_num_finalized_gates();
            fq_ct c = a / b;
            EXPECT_EQ(c.get_origin_tag(), first_two_merged_tag);
            uint64_t after = builder.get_estimated_num_finalized_gates();
            if (i == num_repetitions - 1) {
                std::cout << "num gates per div = " << after - before << std::endl;
                benchmark_info(Builder::NAME_STRING, "Bigfield", "DIV", "Gate Count", after - before);
            }

            fq expected = (inputs[0] / inputs[1]);
            expected = expected.reduce_once().reduce_once();
            expected = expected.from_montgomery_form();
            uint512_t result = c.get_value();

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

    static void test_div_with_constant()
    {
        auto builder = Builder();
        size_t num_repetitions = 10;
        for (size_t i = 0; i < num_repetitions; ++i) {
            fq inputs[3]{ fq::random_element(), fq::random_element(), fq::random_element() };
            inputs[0] = inputs[0].reduce_once().reduce_once();
            inputs[1] = inputs[1].reduce_once().reduce_once();
            inputs[2] = inputs[2].reduce_once().reduce_once();

            // numerator is witness, denominator is constant
            fq_ct a(witness_ct(&builder, fr(uint256_t(inputs[0]).slice(0, fq_ct::NUM_LIMB_BITS * 2))),
                    witness_ct(&builder,
                               fr(uint256_t(inputs[0]).slice(fq_ct::NUM_LIMB_BITS * 2, fq_ct::NUM_LIMB_BITS * 4))));
            fq_ct b(&builder, uint256_t(inputs[1]));

            a.set_origin_tag(submitted_value_origin_tag);
            b.set_origin_tag(challenge_origin_tag);
            uint64_t before = builder.get_estimated_num_finalized_gates();
            fq_ct c = a / b;
            EXPECT_EQ(c.get_origin_tag(), first_two_merged_tag);
            uint64_t after = builder.get_estimated_num_finalized_gates();
            if (i == num_repetitions - 1) {
                std::cout << "num gates per div of witness/constant = " << after - before << std::endl;
                benchmark_info(Builder::NAME_STRING, "Bigfield", "DIV_CONSTANT", "Gate Count", after - before);
            }

            fq expected = (inputs[0] / inputs[1]);
            expected = expected.reduce_once().reduce_once();
            expected = expected.from_montgomery_form();
            uint512_t result = c.get_value();

            EXPECT_EQ(result.lo.data[0], expected.data[0]);
            EXPECT_EQ(result.lo.data[1], expected.data[1]);
            EXPECT_EQ(result.lo.data[2], expected.data[2]);
            EXPECT_EQ(result.lo.data[3], expected.data[3]);
            EXPECT_EQ(result.hi.data[0], 0ULL);
            EXPECT_EQ(result.hi.data[1], 0ULL);
            EXPECT_EQ(result.hi.data[2], 0ULL);
            EXPECT_EQ(result.hi.data[3], 0ULL);

            // numerator is constant, denominator is witness
            fq_ct e(&builder, uint256_t(inputs[2]));
            e.set_origin_tag(challenge_origin_tag);
            uint64_t before_e = builder.get_estimated_num_finalized_gates();
            fq_ct d = e / a;
            EXPECT_EQ(d.get_origin_tag(), first_two_merged_tag);
            uint64_t after_e = builder.get_estimated_num_finalized_gates();
            if (i == num_repetitions - 1) {
                std::cout << "num gates per div of constant/witness = " << after_e - before_e << std::endl;
                benchmark_info(Builder::NAME_STRING, "Bigfield", "DIV_CONSTANT", "Gate Count", after_e - before_e);
            }

            fq expected_e = (inputs[2] / inputs[0]);
            expected_e = expected_e.reduce_once().reduce_once();
            expected_e = expected_e.from_montgomery_form();
            uint512_t result_e = d.get_value();

            EXPECT_EQ(result_e.lo.data[0], expected_e.data[0]);
            EXPECT_EQ(result_e.lo.data[1], expected_e.data[1]);
            EXPECT_EQ(result_e.lo.data[2], expected_e.data[2]);
            EXPECT_EQ(result_e.lo.data[3], expected_e.data[3]);
            EXPECT_EQ(result_e.hi.data[0], 0ULL);
            EXPECT_EQ(result_e.hi.data[1], 0ULL);
            EXPECT_EQ(result_e.hi.data[2], 0ULL);
            EXPECT_EQ(result_e.hi.data[3], 0ULL);
        }
        bool result = CircuitChecker::check(builder);
        EXPECT_EQ(result, true);
    }

    static void test_add_and_div()
    {
        auto builder = Builder();
        size_t num_repetitions = 1;
        for (size_t i = 0; i < num_repetitions; ++i) {
            fq inputs[4]{ fq::random_element(), fq::random_element(), fq::random_element() };
            fq_ct a(witness_ct(&builder, fr(uint256_t(inputs[0]).slice(0, fq_ct::NUM_LIMB_BITS * 2))),
                    witness_ct(&builder,
                               fr(uint256_t(inputs[0]).slice(fq_ct::NUM_LIMB_BITS * 2, fq_ct::NUM_LIMB_BITS * 4))));
            fq_ct b(witness_ct(&builder, fr(uint256_t(inputs[1]).slice(0, fq_ct::NUM_LIMB_BITS * 2))),
                    witness_ct(&builder,
                               fr(uint256_t(inputs[1]).slice(fq_ct::NUM_LIMB_BITS * 2, fq_ct::NUM_LIMB_BITS * 4))));
            fq_ct c(witness_ct(&builder, fr(uint256_t(inputs[2]).slice(0, fq_ct::NUM_LIMB_BITS * 2))),
                    witness_ct(&builder,
                               fr(uint256_t(inputs[2]).slice(fq_ct::NUM_LIMB_BITS * 2, fq_ct::NUM_LIMB_BITS * 4))));
            fq_ct d(witness_ct(&builder, fr(uint256_t(inputs[3]).slice(0, fq_ct::NUM_LIMB_BITS * 2))),
                    witness_ct(&builder,
                               fr(uint256_t(inputs[3]).slice(fq_ct::NUM_LIMB_BITS * 2, fq_ct::NUM_LIMB_BITS * 4))));
            b.set_origin_tag(submitted_value_origin_tag);
            c.set_origin_tag(challenge_origin_tag);
            d.set_origin_tag(next_challenge_tag);
            fq_ct e = (a + b) / (c + d);
            EXPECT_EQ(e.get_origin_tag(), first_second_third_merged_tag);

            fq expected = (inputs[0] + inputs[1]) / (inputs[2] + inputs[3]);
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

    static void test_add_and_mul()
    {
        auto builder = Builder();
        size_t num_repetitions = 10;
        for (size_t i = 0; i < num_repetitions; ++i) {
            fq inputs[4]{ fq::random_element(), fq::random_element(), fq::random_element(), fq::random_element() };

            fq_ct a(witness_ct(&builder, fr(uint256_t(inputs[0]).slice(0, fq_ct::NUM_LIMB_BITS * 2))),
                    witness_ct(&builder,
                               fr(uint256_t(inputs[0]).slice(fq_ct::NUM_LIMB_BITS * 2, fq_ct::NUM_LIMB_BITS * 4))));
            fq_ct b(witness_ct(&builder, fr(uint256_t(inputs[1]).slice(0, fq_ct::NUM_LIMB_BITS * 2))),
                    witness_ct(&builder,
                               fr(uint256_t(inputs[1]).slice(fq_ct::NUM_LIMB_BITS * 2, fq_ct::NUM_LIMB_BITS * 4))));
            fq_ct c(witness_ct(&builder, fr(uint256_t(inputs[2]).slice(0, fq_ct::NUM_LIMB_BITS * 2))),
                    witness_ct(&builder,
                               fr(uint256_t(inputs[2]).slice(fq_ct::NUM_LIMB_BITS * 2, fq_ct::NUM_LIMB_BITS * 4))));
            fq_ct d(witness_ct(&builder, fr(uint256_t(inputs[3]).slice(0, fq_ct::NUM_LIMB_BITS * 2))),
                    witness_ct(&builder,
                               fr(uint256_t(inputs[3]).slice(fq_ct::NUM_LIMB_BITS * 2, fq_ct::NUM_LIMB_BITS * 4))));

            b.set_origin_tag(submitted_value_origin_tag);
            c.set_origin_tag(challenge_origin_tag);
            d.set_origin_tag(next_challenge_tag);

            fq_ct e = (a + b) * (c + d);

            EXPECT_EQ(e.get_origin_tag(), first_second_third_merged_tag);
            fq expected = (inputs[0] + inputs[1]) * (inputs[2] + inputs[3]);
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

    static void test_add_and_mul_with_constants()
    {
        auto builder = Builder();
        size_t num_repetitions = 10;
        for (size_t i = 0; i < num_repetitions; ++i) {
            fq inputs[2]{ fq::random_element(), fq::random_element() };
            uint256_t constants[2]{ engine.get_random_uint256() % fq_ct::modulus,
                                    engine.get_random_uint256() % fq_ct::modulus };
            fq_ct a(witness_ct(&builder, fr(uint256_t(inputs[0]).slice(0, fq_ct::NUM_LIMB_BITS * 2))),
                    witness_ct(&builder,
                               fr(uint256_t(inputs[0]).slice(fq_ct::NUM_LIMB_BITS * 2, fq_ct::NUM_LIMB_BITS * 4))));
            fq_ct b(&builder, constants[0]);
            fq_ct c(witness_ct(&builder, fr(uint256_t(inputs[1]).slice(0, fq_ct::NUM_LIMB_BITS * 2))),
                    witness_ct(&builder,
                               fr(uint256_t(inputs[1]).slice(fq_ct::NUM_LIMB_BITS * 2, fq_ct::NUM_LIMB_BITS * 4))));
            fq_ct d(&builder, constants[1]);
            b.set_origin_tag(submitted_value_origin_tag);
            c.set_origin_tag(challenge_origin_tag);
            d.set_origin_tag(next_challenge_tag);

            fq_ct e = (a + b) * (c + d);

            EXPECT_EQ(e.get_origin_tag(), first_second_third_merged_tag);
            fq expected = (inputs[0] + constants[0]) * (inputs[1] + constants[1]);
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

    static void test_sub_and_mul()
    {
        auto builder = Builder();
        size_t num_repetitions = 10;
        for (size_t i = 0; i < num_repetitions; ++i) {
            fq inputs[4]{ fq::random_element(), fq::random_element(), fq::random_element(), fq::random_element() };

            fq_ct a(witness_ct(&builder, fr(uint256_t(inputs[0]).slice(0, fq_ct::NUM_LIMB_BITS * 2))),
                    witness_ct(&builder,
                               fr(uint256_t(inputs[0]).slice(fq_ct::NUM_LIMB_BITS * 2, fq_ct::NUM_LIMB_BITS * 4))));
            fq_ct b(witness_ct(&builder, fr(uint256_t(inputs[1]).slice(0, fq_ct::NUM_LIMB_BITS * 2))),
                    witness_ct(&builder,
                               fr(uint256_t(inputs[1]).slice(fq_ct::NUM_LIMB_BITS * 2, fq_ct::NUM_LIMB_BITS * 4))));
            fq_ct c(witness_ct(&builder, fr(uint256_t(inputs[2]).slice(0, fq_ct::NUM_LIMB_BITS * 2))),
                    witness_ct(&builder,
                               fr(uint256_t(inputs[2]).slice(fq_ct::NUM_LIMB_BITS * 2, fq_ct::NUM_LIMB_BITS * 4))));
            fq_ct d(witness_ct(&builder, fr(uint256_t(inputs[3]).slice(0, fq_ct::NUM_LIMB_BITS * 2))),
                    witness_ct(&builder,
                               fr(uint256_t(inputs[3]).slice(fq_ct::NUM_LIMB_BITS * 2, fq_ct::NUM_LIMB_BITS * 4))));

            b.set_origin_tag(submitted_value_origin_tag);
            c.set_origin_tag(challenge_origin_tag);
            d.set_origin_tag(next_challenge_tag);

            fq_ct e = (a - b) * (c - d);

            EXPECT_EQ(e.get_origin_tag(), first_second_third_merged_tag);
            fq expected = (inputs[0] - inputs[1]) * (inputs[2] - inputs[3]);

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

    static void test_msub_div()
    {
        size_t num_repetitions = 8;
        for (size_t i = 0; i < num_repetitions; ++i) {
            auto builder = Builder();
            auto [mul_l, mul_l_ct] = get_random_element(&builder);
            auto [mul_r1, mul_r1_ct] = get_random_element(&builder);
            auto [mul_r2, mul_r2_ct] = get_random_element(&builder);
            auto [divisor1, divisor1_ct] = get_random_element(&builder);
            auto [divisor2, divisor2_ct] = get_random_element(&builder);
            auto [to_sub1, to_sub1_ct] = get_random_element(&builder);
            auto [to_sub2, to_sub2_ct] = get_random_element(&builder);

            mul_l_ct.set_origin_tag(submitted_value_origin_tag);
            mul_r1_ct.set_origin_tag(challenge_origin_tag);
            divisor1_ct.set_origin_tag(next_submitted_value_origin_tag);
            to_sub1_ct.set_origin_tag(next_challenge_tag);

            mul_r2_ct.unset_free_witness_tag();
            divisor2_ct.unset_free_witness_tag();
            to_sub2_ct.unset_free_witness_tag();

            fq_ct result_ct = fq_ct::msub_div(
                { mul_l_ct }, { mul_r1_ct - mul_r2_ct }, divisor1_ct - divisor2_ct, { to_sub1_ct, to_sub2_ct });
            EXPECT_EQ(result_ct.get_origin_tag(), first_to_fourth_merged_tag);
            fq expected = (-(mul_l * (mul_r1 - mul_r2) + to_sub1 + to_sub2)) / (divisor1 - divisor2);
            EXPECT_EQ(result_ct.get_value().lo, uint256_t(expected));
            EXPECT_EQ(result_ct.get_value().hi, uint256_t(0));

            bool result = CircuitChecker::check(builder);
            EXPECT_EQ(result, true);
        }
    }

    static void test_conditional_negate()
    {
        auto builder = Builder();
        size_t num_repetitions = 1;
        for (size_t i = 0; i < num_repetitions; ++i) {

            fq inputs[4]{ fq::random_element(), fq::random_element(), fq::random_element(), fq::random_element() };

            fq_ct a(witness_ct(&builder, fr(uint256_t(inputs[0]).slice(0, fq_ct::NUM_LIMB_BITS * 2))),
                    witness_ct(&builder,
                               fr(uint256_t(inputs[0]).slice(fq_ct::NUM_LIMB_BITS * 2, fq_ct::NUM_LIMB_BITS * 4))));

            a.set_origin_tag(submitted_value_origin_tag);

            typename bn254::bool_ct predicate_a(witness_ct(&builder, true));

            predicate_a.set_origin_tag(challenge_origin_tag);

            fq_ct c = a.conditional_negate(predicate_a);

            // Conditional negate merges tags
            EXPECT_EQ(c.get_origin_tag(), first_two_merged_tag);

            fq_ct d = a.conditional_negate(!predicate_a);
            fq_ct e = c + d;
            uint512_t c_out = c.get_value();
            uint512_t d_out = d.get_value();
            uint512_t e_out = e.get_value();

            fq result_c(c_out.lo);
            fq result_d(d_out.lo);
            fq result_e(e_out.lo);

            fq expected_c = (-inputs[0]);
            fq expected_d = inputs[0];

            EXPECT_EQ(result_c, expected_c);
            EXPECT_EQ(result_d, expected_d);
            EXPECT_EQ(result_e, fq(0));
        }
        bool result = CircuitChecker::check(builder);
        EXPECT_EQ(result, true);
    }

    static void test_group_operations()
    {
        auto builder = Builder();
        size_t num_repetitions = 1;
        for (size_t i = 0; i < num_repetitions; ++i) {
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

            fq inputs[4]{ fq::random_element(), fq::random_element(), fq::random_element(), fq::random_element() };

            fq_ct a(witness_ct(&builder, fr(uint256_t(inputs[0]).slice(0, fq_ct::NUM_LIMB_BITS * 2))),
                    witness_ct(&builder,
                               fr(uint256_t(inputs[0]).slice(fq_ct::NUM_LIMB_BITS * 2, fq_ct::NUM_LIMB_BITS * 4))));
            fq_ct b(witness_ct(&builder, fr(uint256_t(inputs[1]).slice(0, fq_ct::NUM_LIMB_BITS * 2))),
                    witness_ct(&builder,
                               fr(uint256_t(inputs[1]).slice(fq_ct::NUM_LIMB_BITS * 2, fq_ct::NUM_LIMB_BITS * 4))));

            fq_ct c = a;
            fq expected = inputs[0];
            for (size_t i = 0; i < 16; ++i) {
                c = b * b + c;
                expected = inputs[1] * inputs[1] + expected;
            }

            c.set_origin_tag(challenge_origin_tag);
            // fq_ct c = a + a + a + a - b - b - b - b;
            c.self_reduce();
            // self_reduce preserves tags
            EXPECT_EQ(c.get_origin_tag(), challenge_origin_tag);
            fq result = fq(c.get_value().lo);
            EXPECT_EQ(result, expected);
            EXPECT_EQ(c.get_value().get_msb() < 254, true);
        }
        bool result = CircuitChecker::check(builder);
        EXPECT_EQ(result, true);
    }

    static void test_assert_is_in_field_success()
    {
        auto builder = Builder();
        size_t num_repetitions = 10;
        for (size_t i = 0; i < num_repetitions; ++i) {

            fq inputs[4]{ fq::random_element(), fq::random_element(), fq::random_element(), fq::random_element() };

            fq_ct a(witness_ct(&builder, fr(uint256_t(inputs[0]).slice(0, fq_ct::NUM_LIMB_BITS * 2))),
                    witness_ct(&builder,
                               fr(uint256_t(inputs[0]).slice(fq_ct::NUM_LIMB_BITS * 2, fq_ct::NUM_LIMB_BITS * 4))));
            fq_ct b(witness_ct(&builder, fr(uint256_t(inputs[1]).slice(0, fq_ct::NUM_LIMB_BITS * 2))),
                    witness_ct(&builder,
                               fr(uint256_t(inputs[1]).slice(fq_ct::NUM_LIMB_BITS * 2, fq_ct::NUM_LIMB_BITS * 4))));

            fq_ct c = a;
            fq expected = inputs[0];
            for (size_t i = 0; i < 16; ++i) {
                c = b * b + c;
                expected = inputs[1] * inputs[1] + expected;
            }
            // fq_ct c = a + a + a + a - b - b - b - b;
            c.assert_is_in_field();
            uint256_t result = (c.get_value().lo);
            EXPECT_EQ(result, uint256_t(expected));
            EXPECT_EQ(c.get_value().get_msb() < 254, true);
        }
        bool result = CircuitChecker::check(builder);
        EXPECT_EQ(result, true);
    }

    static void test_assert_less_than_success()
    {
        auto builder = Builder();
        size_t num_repetitions = 10;
        constexpr size_t num_bits = 200;
        constexpr uint256_t bit_mask = (uint256_t(1) << num_bits) - 1;
        for (size_t i = 0; i < num_repetitions; ++i) {

            fq inputs[4]{ uint256_t(fq::random_element()) && bit_mask,
                          uint256_t(fq::random_element()) && bit_mask,
                          uint256_t(fq::random_element()) && bit_mask,
                          uint256_t(fq::random_element()) && bit_mask };

            fq_ct a(witness_ct(&builder, fr(uint256_t(inputs[0]).slice(0, fq_ct::NUM_LIMB_BITS * 2))),
                    witness_ct(&builder,
                               fr(uint256_t(inputs[0]).slice(fq_ct::NUM_LIMB_BITS * 2, fq_ct::NUM_LIMB_BITS * 4))));
            fq_ct b(witness_ct(&builder, fr(uint256_t(inputs[1]).slice(0, fq_ct::NUM_LIMB_BITS * 2))),
                    witness_ct(&builder,
                               fr(uint256_t(inputs[1]).slice(fq_ct::NUM_LIMB_BITS * 2, fq_ct::NUM_LIMB_BITS * 4))));

            fq_ct c = a;
            fq expected = inputs[0];
            for (size_t i = 0; i < 16; ++i) {
                c = b * b + c;
                expected = inputs[1] * inputs[1] + expected;
            }
            // fq_ct c = a + a + a + a - b - b - b - b;
            c.assert_less_than(bit_mask + 1);
            uint256_t result = (c.get_value().lo);
            EXPECT_EQ(result, uint256_t(expected));
            EXPECT_EQ(c.get_value().get_msb() < num_bits, true);
        }
        bool result = CircuitChecker::check(builder);
        EXPECT_EQ(result, true);
        // Checking edge conditions
        fq random_input = fq::random_element();
        fq_ct a(witness_ct(&builder, fr(uint256_t(random_input).slice(0, fq_ct::NUM_LIMB_BITS * 2))),
                witness_ct(&builder,
                           fr(uint256_t(random_input).slice(fq_ct::NUM_LIMB_BITS * 2, fq_ct::NUM_LIMB_BITS * 4))));

        a.assert_less_than(random_input + 1);
        EXPECT_EQ(CircuitChecker::check(builder), true);

        a.assert_less_than(random_input);
        EXPECT_EQ(CircuitChecker::check(builder), false);
    }

    static void test_byte_array_constructors()
    {
        auto builder = Builder();
        size_t num_repetitions = 10;
        for (size_t i = 0; i < num_repetitions; ++i) {

            fq inputs[4]{ fq::random_element(), fq::random_element(), fq::random_element(), fq::random_element() };
            std::vector<uint8_t> input_a(sizeof(fq));
            fq::serialize_to_buffer(inputs[0], &input_a[0]);
            std::vector<uint8_t> input_b(sizeof(fq));
            fq::serialize_to_buffer(inputs[1], &input_b[0]);

            stdlib::byte_array<Builder> input_arr_a(&builder, input_a);
            stdlib::byte_array<Builder> input_arr_b(&builder, input_b);

            input_arr_a.set_origin_tag(submitted_value_origin_tag);
            input_arr_b.set_origin_tag(challenge_origin_tag);

            fq_ct a(input_arr_a);
            fq_ct b(input_arr_b);

            fq_ct c = a * b;

            EXPECT_EQ(c.get_origin_tag(), first_two_merged_tag);

            fq expected = inputs[0] * inputs[1];
            uint256_t result = (c.get_value().lo);
            EXPECT_EQ(result, uint256_t(expected));
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
        fq a(0);
        fq b(1);
        fq_ct a_ct(&builder, a);
        fq_ct b_ct(&builder, b);
        fq_ct selected = a_ct.conditional_select(b_ct, typename bn254::bool_ct(&builder, true));
        EXPECT_EQ(fq((selected.get_value() % uint512_t(bb::fq::modulus)).lo), b);
    }

    static void test_division_context()
    {
        auto builder = Builder();
        fq a(1);
        fq_ct a_ct(&builder, a);
        fq_ct ret = fq_ct::div_check_denominator_nonzero({}, a_ct);
        EXPECT_NE(ret.get_context(), nullptr);
    }

    static void test_inversion()
    {
        fq_ct a = fq_ct(-7);
        fq_ct a_inverse = a.invert();
        fq_ct a_inverse_division = fq_ct(1) / a;

        fq a_native = fq(-7);
        fq a_native_inverse = a_native.invert();
        EXPECT_EQ(bb::fq((a.get_value() % uint512_t(bb::fq::modulus)).lo), a_native);
        EXPECT_EQ(bb::fq((a_inverse.get_value() % uint512_t(bb::fq::modulus)).lo), a_native_inverse);
        EXPECT_EQ(bb::fq((a_inverse_division.get_value() % uint512_t(bb::fq::modulus)).lo), a_native_inverse);
    }

    static void test_assert_equal_not_equal()
    {
        auto builder = Builder();
        size_t num_repetitions = 10;
        for (size_t i = 0; i < num_repetitions; ++i) {
            fq inputs[4]{ fq::random_element(), fq::random_element(), fq::random_element(), fq::random_element() };

            fq_ct a(witness_ct(&builder, fr(uint256_t(inputs[0]).slice(0, fq_ct::NUM_LIMB_BITS * 2))),
                    witness_ct(&builder,
                               fr(uint256_t(inputs[0]).slice(fq_ct::NUM_LIMB_BITS * 2, fq_ct::NUM_LIMB_BITS * 4))));
            fq_ct b(witness_ct(&builder, fr(uint256_t(inputs[1]).slice(0, fq_ct::NUM_LIMB_BITS * 2))),
                    witness_ct(&builder,
                               fr(uint256_t(inputs[1]).slice(fq_ct::NUM_LIMB_BITS * 2, fq_ct::NUM_LIMB_BITS * 4))));
            fq_ct c(witness_ct(&builder, fr(uint256_t(inputs[2]).slice(0, fq_ct::NUM_LIMB_BITS * 2))),
                    witness_ct(&builder,
                               fr(uint256_t(inputs[2]).slice(fq_ct::NUM_LIMB_BITS * 2, fq_ct::NUM_LIMB_BITS * 4))));
            fq_ct d(witness_ct(&builder, fr(uint256_t(inputs[3]).slice(0, fq_ct::NUM_LIMB_BITS * 2))),
                    witness_ct(&builder,
                               fr(uint256_t(inputs[3]).slice(fq_ct::NUM_LIMB_BITS * 2, fq_ct::NUM_LIMB_BITS * 4))));

            fq_ct two = fq_ct::unsafe_construct_from_limbs(witness_ct(&builder, fr(2)),
                                                           witness_ct(&builder, fr(0)),
                                                           witness_ct(&builder, fr(0)),
                                                           witness_ct(&builder, fr(0)));
            fq_ct t0 = a + a;
            fq_ct t1 = a * two;

            t0.assert_equal(t1);
            t0.assert_is_not_equal(c);
            t0.assert_is_not_equal(d);
            stdlib::bool_t<Builder> is_equal_a = t0 == t1;
            stdlib::bool_t<Builder> is_equal_b = t0 == c;
            EXPECT_TRUE(is_equal_a.get_value());
            EXPECT_FALSE(is_equal_b.get_value());
        }
        bool result = CircuitChecker::check(builder);
        EXPECT_EQ(result, true);
    }

    static void test_pow()
    {
        Builder builder;

        fq base_val(engine.get_random_uint256());
        uint32_t exponent_val = engine.get_random_uint32();
        // Set the high bit
        exponent_val |= static_cast<uint32_t>(1) << 31;
        fq_ct base_constant(&builder, static_cast<uint256_t>(base_val));
        auto base_witness = fq_ct::from_witness(&builder, static_cast<uint256_t>(base_val));
        // This also tests for the case where the exponent is zero
        for (size_t i = 0; i <= 32; i += 4) {
            auto current_exponent_val = exponent_val >> i;
            fq expected = base_val.pow(current_exponent_val);

            // Check for constant bigfield element with constant exponent
            fq_ct result_constant_base = base_constant.pow(current_exponent_val);
            EXPECT_EQ(fq(result_constant_base.get_value()), expected);

            // Check for witness base with constant exponent
            fq_ct result_witness_base = base_witness.pow(current_exponent_val);
            EXPECT_EQ(fq(result_witness_base.get_value()), expected);

            base_witness.set_origin_tag(submitted_value_origin_tag);
        }

        bool check_result = CircuitChecker::check(builder);
        EXPECT_EQ(check_result, true);
    }

    static void test_pow_one()
    {
        Builder builder;

        fq base_val(engine.get_random_uint256());

        uint32_t current_exponent_val = 1;
        fq_ct base_constant(&builder, static_cast<uint256_t>(base_val));
        auto base_witness = fq_ct::from_witness(&builder, static_cast<uint256_t>(base_val));
        fq expected = base_val.pow(current_exponent_val);

        // Check for constant bigfield element with constant exponent
        fq_ct result_constant_base = base_constant.pow(current_exponent_val);
        EXPECT_EQ(fq(result_constant_base.get_value()), expected);

        // Check for witness base with constant exponent
        fq_ct result_witness_base = base_witness.pow(current_exponent_val);
        EXPECT_EQ(fq(result_witness_base.get_value()), expected);

        bool check_result = CircuitChecker::check(builder);
        EXPECT_EQ(check_result, true);
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

        fq_ct w0 = fq_ct::from_witness(&builder, bb::fq(0));
        w0.binary_basis_limbs[0].element = witness_ct(&builder, dlimb0_value);
        w0.binary_basis_limbs[1].element = witness_ct(&builder, dlimb1_value);
        w0.binary_basis_limbs[2].element = witness_ct(&builder, dlimb2_value);
        w0.binary_basis_limbs[3].element = witness_ct(&builder, dlimb3_value);
        w0.binary_basis_limbs[0].maximum_value = dlimb0_max;
        w0.binary_basis_limbs[1].maximum_value = dlimb1_max;
        w0.binary_basis_limbs[2].maximum_value = dlimb2_max;
        w0.binary_basis_limbs[3].maximum_value = dlimb3_max;
        w0.prime_basis_limb = witness_ct(&builder, dlimb_prime);

        fq_ct w1 = fq_ct::from_witness(&builder, bb::fq(0));
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
using CircuitTypes = testing::Types<bb::UltraCircuitBuilder>;
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
TYPED_TEST(stdlib_bigfield, mul)
{
    TestFixture::test_mul();
}
TYPED_TEST(stdlib_bigfield, sqr)
{
    TestFixture::test_sqr();
}
TYPED_TEST(stdlib_bigfield, madd)
{
    TestFixture::test_madd();
}
TYPED_TEST(stdlib_bigfield, mult_madd)
{
    TestFixture::test_mult_madd();
}
TYPED_TEST(stdlib_bigfield, mult_madd_with_constants)
{
    TestFixture::test_mult_madd_with_constants();
}
TYPED_TEST(stdlib_bigfield, dual_madd)
{
    TestFixture::test_dual_madd();
}
TYPED_TEST(stdlib_bigfield, div_without_denominator_check)
{
    TestFixture::test_div();
}
TYPED_TEST(stdlib_bigfield, div_with_constant)
{
    TestFixture::test_div_with_constant();
}
TYPED_TEST(stdlib_bigfield, add_and_div)
{
    TestFixture::test_add_and_div();
}
TYPED_TEST(stdlib_bigfield, add_and_mul)
{
    TestFixture::test_add_and_mul();
}
TYPED_TEST(stdlib_bigfield, add_and_mul_with_constants)
{
    TestFixture::test_add_and_mul_with_constants();
}
TYPED_TEST(stdlib_bigfield, sub_and_mul)
{
    TestFixture::test_sub_and_mul();
}
TYPED_TEST(stdlib_bigfield, msub_div)
{
    TestFixture::test_msub_div();
}
TYPED_TEST(stdlib_bigfield, msb_div_ctx_crash_regression)
{
    TestFixture::test_msub_div_ctx_crash_regression();
}
TYPED_TEST(stdlib_bigfield, conditional_negate)
{
    TestFixture::test_conditional_negate();
}
TYPED_TEST(stdlib_bigfield, group_operations)
{
    TestFixture::test_group_operations();
}
TYPED_TEST(stdlib_bigfield, reduce)
{
    TestFixture::test_reduce();
}
TYPED_TEST(stdlib_bigfield, assert_is_in_field_succes)
{
    TestFixture::test_assert_is_in_field_success();
}
TYPED_TEST(stdlib_bigfield, assert_less_than_success)
{
    TestFixture::test_assert_less_than_success();
}
TYPED_TEST(stdlib_bigfield, byte_array_constructors)
{
    TestFixture::test_byte_array_constructors();
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

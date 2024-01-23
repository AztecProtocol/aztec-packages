#include <gtest/gtest.h>

#include "barretenberg/numeric/random/engine.hpp"

#include "barretenberg/ecc/curves/bn254/fq.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"

#include "../bool/bool.hpp"
#include "../byte_array/byte_array.hpp"
#include "../field/field.hpp"
#include "./bigfield.hpp"
#include "barretenberg/plonk/proof_system/prover/prover.hpp"
#include "barretenberg/plonk/proof_system/verifier/verifier.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"

#include "barretenberg/polynomials/polynomial_arithmetic.hpp"
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

template <typename Builder> class stdlib_bigfield : public testing::Test {

    typedef stdlib::bn254<Builder> bn254;

    typedef typename bn254::ScalarField fr_ct;
    typedef typename bn254::BaseField fq_ct;
    typedef typename bn254::public_witness_ct public_witness_ct;
    typedef typename bn254::witness_ct witness_ct;

  public:
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
        bool result = builder.check_circuit();
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
        bool result = builder.check_circuit();
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
    static void test_mul()
    {
        auto builder = Builder();
        size_t num_repetitions = 4;
        for (size_t i = 0; i < num_repetitions; ++i) {
            fq inputs[3]{ fq::random_element(), fq::random_element(), fq::random_element() };
            fq_ct a(witness_ct(&builder, fr(uint256_t(inputs[0]).slice(0, fq_ct::NUM_LIMB_BITS * 2))),
                    witness_ct(&builder,
                               fr(uint256_t(inputs[0]).slice(fq_ct::NUM_LIMB_BITS * 2, fq_ct::NUM_LIMB_BITS * 4))));
            fq_ct b(witness_ct(&builder, fr(uint256_t(inputs[1]).slice(0, fq_ct::NUM_LIMB_BITS * 2))),
                    witness_ct(&builder,
                               fr(uint256_t(inputs[1]).slice(fq_ct::NUM_LIMB_BITS * 2, fq_ct::NUM_LIMB_BITS * 4))));
            uint64_t before = builder.get_num_gates();
            fq_ct c = a * b;
            uint64_t after = builder.get_num_gates();
            // Don't profile 1st repetition. It sets up a lookup table, cost is not representative of a typical mul
            if (i == num_repetitions - 2) {
                std::cerr << "num gates per mul = " << after - before << std::endl;
                benchmark_info(Builder::NAME_STRING, "Bigfield", "MUL", "Gate Count", after - before);
            }
            // uint256_t modulus{ Bn254FqParams::modulus_0,
            //                    Bn254FqParams::modulus_1,
            //                    Bn254FqParams::modulus_2,
            //                    Bn254FqParams::modulus_3 };

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
        bool result = builder.check_circuit();
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
            uint64_t before = builder.get_num_gates();
            fq_ct c = a.sqr();
            uint64_t after = builder.get_num_gates();
            if (i == num_repetitions - 1) {
                std::cerr << "num gates per mul = " << after - before << std::endl;
                benchmark_info(Builder::NAME_STRING, "Bigfield", "SQR", "Gate Count", after - before);
            }
            // uint256_t modulus{ Bn254FqParams::modulus_0,
            //                    Bn254FqParams::modulus_1,
            //                    Bn254FqParams::modulus_2,
            //                    Bn254FqParams::modulus_3 };

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
        bool result = builder.check_circuit();
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

            uint64_t before = builder.get_num_gates();
            fq_ct d = a.madd(b, { c });
            uint64_t after = builder.get_num_gates();
            if (i == num_repetitions - 1) {
                std::cerr << "num gates per mul = " << after - before << std::endl;
                benchmark_info(Builder::NAME_STRING, "Bigfield", "MADD", "Gate Count", after - before);
            }
            // uint256_t modulus{ Bn254FqParams::modulus_0,
            //                    Bn254FqParams::modulus_1,
            //                    Bn254FqParams::modulus_2,
            //                    Bn254FqParams::modulus_3 };

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
        bool result = builder.check_circuit();
        EXPECT_EQ(result, true);
    }

    static void test_mult_madd()
    {
        auto builder = Builder();
        size_t num_repetitions = 1;
        const size_t number_of_madds = 32;
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
            }
            uint64_t before = builder.get_num_gates();
            fq_ct f = fq_ct::mult_madd(mul_left, mul_right, to_add);
            uint64_t after = builder.get_num_gates();
            if (i == num_repetitions - 1) {
                std::cerr << "num gates with mult_madd = " << after - before << std::endl;
                benchmark_info(Builder::NAME_STRING, "Bigfield", "MULT_MADD", "Gate Count", after - before);
            }
            /**
            before = builder.get_num_gates();
            fq_ct f1(0);
            for (size_t j = 0; j < number_of_madds; j++) {
                f1 += mul_left[j] * mul_right[j] + to_add[j];
            }
            after = builder.get_num_gates();
            if (i == num_repetitions - 1) {
                std::cerr << "num gates with regular multiply_add = " << after - before << std::endl;
            }
            **/

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
        bool result = builder.check_circuit();
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

            uint64_t before = builder.get_num_gates();
            fq_ct f = fq_ct::dual_madd(a, b, c, d, { e });
            uint64_t after = builder.get_num_gates();
            if (i == num_repetitions - 1) {
                std::cerr << "num gates per mul = " << after - before << std::endl;
            }
            // uint256_t modulus{ Bn254FqParams::modulus_0,
            //                    Bn254FqParams::modulus_1,
            //                    Bn254FqParams::modulus_2,
            //                    Bn254FqParams::modulus_3 };

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
        bool result = builder.check_circuit();
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
            uint64_t before = builder.get_num_gates();
            fq_ct c = a / b;
            uint64_t after = builder.get_num_gates();
            if (i == num_repetitions - 1) {
                std::cout << "num gates per div = " << after - before << std::endl;
                benchmark_info(Builder::NAME_STRING, "Bigfield", "DIV", "Gate Count", after - before);
            }
            // uint256_t modulus{ Bn254FqParams::modulus_0,
            //                    Bn254FqParams::modulus_1,
            //                    Bn254FqParams::modulus_2,
            //                    Bn254FqParams::modulus_3 };

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
        bool result = builder.check_circuit();
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
            fq_ct e = (a + b) / (c + d);
            // uint256_t modulus{ Bn254FqParams::modulus_0,
            //                    Bn254FqParams::modulus_1,
            //                    Bn254FqParams::modulus_2,
            //                    Bn254FqParams::modulus_3 };

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
        bool result = builder.check_circuit();
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
            fq_ct e = (a + b) * (c + d);
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
        bool result = builder.check_circuit();
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
            fq_ct e = (a + b) * (c + d);
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
        bool result = builder.check_circuit();
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
            fq_ct e = (a - b) * (c - d);
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
        bool result = builder.check_circuit();
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

            fq_ct result_ct = fq_ct::msub_div(
                { mul_l_ct }, { mul_r1_ct - mul_r2_ct }, divisor1_ct - divisor2_ct, { to_sub1_ct, to_sub2_ct });
            fq expected = (-(mul_l * (mul_r1 - mul_r2) + to_sub1 + to_sub2)) / (divisor1 - divisor2);
            EXPECT_EQ(result_ct.get_value().lo, uint256_t(expected));
            EXPECT_EQ(result_ct.get_value().hi, uint256_t(0));

            bool result = builder.check_circuit();
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
            // fq_ct b(witness_ct(&builder,
            // fr(uint256_t(inputs[1]).slice(0, fq_ct::NUM_LIMB_BITS * 2))),
            //            witness_ct(&builder,
            //            fr(uint256_t(inputs[1]).slice(fq_ct::NUM_LIMB_BITS * 2,
            //            fq_ct::NUM_LIMB_BITS * 4))));

            typename bn254::bool_ct predicate_a(witness_ct(&builder, true));
            // bool_ct predicate_b(witness_ct(&builder, false));

            fq_ct c = a.conditional_negate(predicate_a);
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
        bool result = builder.check_circuit();
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
            uint64_t before = builder.get_num_gates();

            fq_ct lambda = (y2 - y1) / (x2 - x1);
            fq_ct x3 = lambda.sqr() - (x2 + x1);
            fq_ct y3 = (x1 - x3) * lambda - y1;
            uint64_t after = builder.get_num_gates();
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
        bool result = builder.check_circuit();
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
            // fq_ct c = a + a + a + a - b - b - b - b;
            c.self_reduce();
            fq result = fq(c.get_value().lo);
            EXPECT_EQ(result, expected);
            EXPECT_EQ(c.get_value().get_msb() < 254, true);
        }
        bool result = builder.check_circuit();
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
        bool result = builder.check_circuit();
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
        bool result = builder.check_circuit();
        EXPECT_EQ(result, true);
        // Checking edge conditions
        fq random_input = fq::random_element();
        fq_ct a(witness_ct(&builder, fr(uint256_t(random_input).slice(0, fq_ct::NUM_LIMB_BITS * 2))),
                witness_ct(&builder,
                           fr(uint256_t(random_input).slice(fq_ct::NUM_LIMB_BITS * 2, fq_ct::NUM_LIMB_BITS * 4))));

        a.assert_less_than(random_input + 1);
        EXPECT_EQ(builder.check_circuit(), true);

        a.assert_less_than(random_input);
        EXPECT_EQ(builder.check_circuit(), false);
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

            fq_ct a(input_arr_a);
            fq_ct b(input_arr_b);

            fq_ct c = a * b;

            fq expected = inputs[0] * inputs[1];
            uint256_t result = (c.get_value().lo);
            EXPECT_EQ(result, uint256_t(expected));
        }
        bool result = builder.check_circuit();
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

        bool result = builder.check_circuit();
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
};

// Define types for which the above tests will be constructed.
typedef testing::Types<bb::StandardCircuitBuilder, bb::UltraCircuitBuilder> CircuitTypes;
// Define the suite of tests.
TYPED_TEST_SUITE(stdlib_bigfield, CircuitTypes);
TYPED_TEST(stdlib_bigfield, badmul)
{
    TestFixture::test_division_formula_bug();
}
TYPED_TEST(stdlib_bigfield, mul)
{
    TestFixture::test_mul();
}
TYPED_TEST(stdlib_bigfield, sqr)
{
    TestFixture::test_sqr();
}
TYPED_TEST(stdlib_bigfield, mult_madd)
{
    TestFixture::test_mult_madd();
}
TYPED_TEST(stdlib_bigfield, dual_madd)
{
    TestFixture::test_dual_madd();
}
TYPED_TEST(stdlib_bigfield, div_without_denominator_check)
{
    TestFixture::test_div();
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

// // This test was disabled before the refactor to use TYPED_TEST's/
// TEST(stdlib_bigfield, DISABLED_test_div_against_constants)
// {
//     auto builder = Builder();
//     size_t num_repetitions = 1;
//     for (size_t i = 0; i < num_repetitions; ++i) {
//         fq inputs[3]{ fq::random_element(), fq::random_element(), fq::random_element() };
//         fq_ct a(witness_ct(&builder, bb::fr(uint256_t(inputs[0]).slice(0,
//         fq_ct::NUM_LIMB_BITS * 2))),
//                 witness_ct(
//                     &builder,
//                     fr(uint256_t(inputs[0]).slice(fq_ct::NUM_LIMB_BITS * 2,
//                     fq_ct::NUM_LIMB_BITS * 4))));
//         fq_ct b1(&builder, uint256_t(inputs[1]));
//         fq_ct b2(&builder, uint256_t(inputs[2]));
//         fq_ct c = a / (b1 - b2);
//         // uint256_t modulus{ bb::Bn254FqParams::modulus_0,
//         //                    Bn254FqParams::modulus_1,
//         //                    Bn254FqParams::modulus_2,
//         //                    Bn254FqParams::modulus_3 };

//         fq expected = (inputs[0] / (inputs[1] - inputs[2]));
//         std::cerr << "denominator = " << inputs[1] - inputs[2] << std::endl;
//         std::cerr << "expected = " << expected << std::endl;
//         expected = expected.from_montgomery_form();
//         uint512_t result = c.get_value();

//         EXPECT_EQ(result.lo.data[0], expected.data[0]);
//         EXPECT_EQ(result.lo.data[1], expected.data[1]);
//         EXPECT_EQ(result.lo.data[2], expected.data[2]);
//         EXPECT_EQ(result.lo.data[3], expected.data[3]);
//         EXPECT_EQ(result.hi.data[0], 0ULL);
//         EXPECT_EQ(result.hi.data[1], 0ULL);
//         EXPECT_EQ(result.hi.data[2], 0ULL);
//         EXPECT_EQ(result.hi.data[3], 0ULL);
//     }
//     auto prover = composer.create_prover();
//     auto verifier = composer.create_verifier();
//     plonk::proof proof = prover.construct_proof();
//     bool result = verifier.verify_proof(proof);
//     EXPECT_EQ(result, true);
// }

// // PLOOKUP TESTS
// TEST(stdlib_bigfield_plookup, test_mul)
// {
//     plonk::UltraPlonkBuilder builder = plonk::UltraPlonkBuilder();
//     size_t num_repetitions = 1;
//     for (size_t i = 0; i < num_repetitions; ++i) {
//         fq inputs[3]{ fq::random_element(), fq::random_element(), fq::random_element() };
//         fq_ct a(
//             witness_ct(&builder, bb::fr(uint256_t(inputs[0]).slice(0,
//             fq_ct::NUM_LIMB_BITS * 2))), witness_ct(&builder,
//                        fr(
//                            uint256_t(inputs[0]).slice(fq_ct::NUM_LIMB_BITS * 2, fq_ct::NUM_LIMB_BITS *
//                            4))));
//         fq_ct b(
//             witness_ct(&builder, bb::fr(uint256_t(inputs[1]).slice(0,
//             fq_ct::NUM_LIMB_BITS * 2))), witness_ct(&builder,
//                        fr(
//                            uint256_t(inputs[1]).slice(fq_ct::NUM_LIMB_BITS * 2, fq_ct::NUM_LIMB_BITS *
//                            4))));
//         std::cerr << "starting mul" << std::endl;
//         uint64_t before = builder.get_num_gates();
//         fq_ct c = a * b;
//         uint64_t after = builder.get_num_gates();
//         if (i == num_repetitions - 1) {
//             std::cerr << "num gates per mul = " << after - before << std::endl;
//         }

//         fq expected = (inputs[0] * inputs[1]);
//         expected = expected.from_montgomery_form();
//         uint512_t result = c.get_value();

//         EXPECT_EQ(result.lo.data[0], expected.data[0]);
//         EXPECT_EQ(result.lo.data[1], expected.data[1]);
//         EXPECT_EQ(result.lo.data[2], expected.data[2]);
//         EXPECT_EQ(result.lo.data[3], expected.data[3]);
//         EXPECT_EQ(result.hi.data[0], 0ULL);
//         EXPECT_EQ(result.hi.data[1], 0ULL);
//         EXPECT_EQ(result.hi.data[2], 0ULL);
//         EXPECT_EQ(result.hi.data[3], 0ULL);
//     }
//     builder.process_range_lists();
//     plonk::PlookupProver prover = composer.create_prover();
//     plonk::PlookupVerifier verifier = composer.create_verifier();
//     plonk::proof proof = prover.construct_proof();
//     bool result = verifier.verify_proof(proof);
//     EXPECT_EQ(result, true);
// }

// TEST(stdlib_bigfield_plookup, test_sqr)
// {
//     plonk::UltraPlonkBuilder builder = plonk::UltraPlonkBuilder();
//     size_t num_repetitions = 10;
//     for (size_t i = 0; i < num_repetitions; ++i) {
//         fq inputs[3]{ fq::random_element(), fq::random_element(), fq::random_element() };
//         fq_ct a(
//             witness_ct(&builder, bb::fr(uint256_t(inputs[0]).slice(0,
//             fq_ct::NUM_LIMB_BITS * 2))), witness_ct(&builder,
//                        fr(
//                            uint256_t(inputs[0]).slice(fq_ct::NUM_LIMB_BITS * 2, fq_ct::NUM_LIMB_BITS *
//                            4))));
//         uint64_t before = builder.get_num_gates();
//         fq_ct c = a.sqr();
//         uint64_t after = builder.get_num_gates();
//         if (i == num_repetitions - 1) {
//             std::cerr << "num gates per sqr = " << after - before << std::endl;
//         }

//         fq expected = (inputs[0].sqr());
//         expected = expected.from_montgomery_form();
//         uint512_t result = c.get_value();

//         EXPECT_EQ(result.lo.data[0], expected.data[0]);
//         EXPECT_EQ(result.lo.data[1], expected.data[1]);
//         EXPECT_EQ(result.lo.data[2], expected.data[2]);
//         EXPECT_EQ(result.lo.data[3], expected.data[3]);
//         EXPECT_EQ(result.hi.data[0], 0ULL);
//         EXPECT_EQ(result.hi.data[1], 0ULL);
//         EXPECT_EQ(result.hi.data[2], 0ULL);
//         EXPECT_EQ(result.hi.data[3], 0ULL);
//     }
//     composer.process_range_lists();
//     plonk::PlookupProver prover = composer.create_prover();
//     plonk::PlookupVerifier verifier = composer.create_verifier();
//     plonk::proof proof = prover.construct_proof();
//     bool result = verifier.verify_proof(proof);
//     EXPECT_EQ(result, true);
// }

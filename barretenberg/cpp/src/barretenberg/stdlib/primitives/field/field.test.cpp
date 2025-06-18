#include "field.hpp"
#include "../bool/bool.hpp"
#include "array.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/streams.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders.hpp"
#include <gtest/gtest.h>
#include <utility>

using namespace bb;

namespace {
auto& engine = numeric::get_debug_randomness();
}

template <class T> void ignore_unused(T&) {} // use to ignore unused variables in lambdas

using namespace bb;

template <typename Builder> class stdlib_field : public testing::Test {
    using bool_ct = stdlib::bool_t<Builder>;
    using field_ct = stdlib::field_t<Builder>;
    using witness_ct = stdlib::witness_t<Builder>;
    using public_witness_ct = stdlib::public_witness_t<Builder>;

    static uint64_t fidget(Builder& builder)
    {
        field_ct a(public_witness_ct(&builder, fr::one())); // a is a legit wire value in our circuit
        field_ct b(&builder,
                   (fr::one())); // b is just a constant, and should not turn up as a wire value in our circuit
        const size_t num_gates = builder.get_estimated_num_finalized_gates();

        // This shouldn't create a constraint - we just need to scale the addition/multiplication gates that `a` is
        // involved in, `c` should have the same witness index as `a`, i.e. point to the same wire value
        field_ct c = a + b;
        EXPECT_TRUE(c.witness_index == a.witness_index);
        EXPECT_TRUE(builder.get_estimated_num_finalized_gates() == num_gates);
        field_ct d(&builder, fr::coset_generator(0)); // like b, d is just a constant and not a wire value

        // by this point, we shouldn't have added any constraints in our circuit
        for (size_t i = 0; i < 17; ++i) {
            c = c * d; // shouldn't create a constraint - just scales up c (which points to same wire value as a)
            c = c - d; // shouldn't create a constraint - just adds a constant term into c's gates
            c = c * a; // will create a constraint - both c and a are wires in our circuit (the same wire actually, so
                       // this is a square-ish gate)
        }

        // run the same computation using normal types so we can compare the output
        uint64_t aa = 1;
        uint64_t bb = 1;
        uint64_t cc = aa + bb;
        uint64_t dd = 5;
        for (size_t i = 0; i < 17; ++i) {
            cc = cc * dd;
            cc = cc - dd;
            cc = cc * aa;
        }
        return cc;
    }

    static void build_test_circuit(Builder& builder, size_t num_gates)
    {
        field_ct a(public_witness_ct(&builder, bb::fr::random_element()));
        field_ct b(public_witness_ct(&builder, bb::fr::random_element()));

        field_ct c(&builder);
        for (size_t i = 0; i < (num_gates / 4) - 4; ++i) {
            c = a + b;
            c = a * c;
            a = b * b;
            b = c * c;
        }
    }

  public:
    static void test_constructor_from_witness()
    {
        bb::fr val = fr::random_element();
        Builder builder = Builder();
        field_ct elt(witness_ct(&builder, val));
        // Ensure the value is correct
        EXPECT_EQ(elt.get_value(), val);
        // Ensure that the context is not missing
        EXPECT_FALSE(elt.is_constant());
    }
    static void test_add()
    {
        Builder builder = Builder();
        // Case 1: both summands are witnesses
        field_ct a(witness_ct(&builder, fr::random_element()));
        field_ct b(witness_ct(&builder, fr::random_element()));
        field_ct sum = a + b;
        EXPECT_TRUE(sum.get_value() == a.get_value() + b.get_value());
        EXPECT_FALSE(sum.is_constant());

        // Case 2: second summand is a constant
        field_ct c(fr::random_element());
        field_ct sum_with_constant = sum + c;
        EXPECT_TRUE(sum_with_constant.get_value() == sum.get_value() + c.get_value());
        EXPECT_TRUE(sum.witness_index == sum_with_constant.witness_index);

        // Case 3: first summand is a constant
        sum_with_constant = c + sum;
        EXPECT_TRUE(sum_with_constant.get_value() == sum.get_value() + c.get_value());
        EXPECT_TRUE(sum.witness_index == sum_with_constant.witness_index);

        // Case 4: both summands are witnesses with matching indices
        field_ct sum_with_same_witness_index = sum_with_constant + sum;
        EXPECT_TRUE(sum_with_same_witness_index.get_value() == sum.get_value() + sum_with_constant.get_value());
        EXPECT_TRUE((sum_with_same_witness_index.witness_index == sum_with_constant.witness_index) &&
                    (sum_with_same_witness_index.witness_index == sum.witness_index));

        // Case 5: both summands are constant
        field_ct d(fr::random_element());
        field_ct constant_sum = c + d;
        EXPECT_TRUE(constant_sum.is_constant());
        EXPECT_TRUE(constant_sum.get_value() == d.get_value() + c.get_value());
    }
    static void create_range_constraint()
    {
        auto run_test = [&](fr elt, size_t num_bits, bool expect_verified) {
            Builder builder = Builder();
            field_ct a(witness_ct(&builder, elt));
            a.create_range_constraint(num_bits, "field_tests: range_constraint on a fails");

            bool verified = CircuitChecker::check(builder);
            EXPECT_EQ(verified, expect_verified);
            if (verified != expect_verified) {
                info("Range constraint malfunction on ", elt, " with num_bits ", num_bits);
            }
        };

        run_test(2, 1, false);
        run_test(2, 2, true);
        run_test(3, 2, true);
        // 130 = 0b10000010, 8 bits
        for (size_t num_bits = 1; num_bits < 17; num_bits++) {
            run_test(130, num_bits, num_bits >= 8);
        }

        // -1 has maximum bit length
        run_test(-1, fr::modulus.get_msb(), false);
        run_test(-1, 128, false);
        run_test(-1, fr::modulus.get_msb() + 1, true);
    }

    static void test_bool_conversion()
    {
        // Test the conversion from field_t to bool_t.

        std::array<bb::fr, 5> input_array{ 0, 1, 0, 1, bb::fr::random_element() };
        // Cases 0,1: Constant  0, 1
        // Cases 2,3: Witnesses 0, 1
        for (size_t idx = 0; idx < 4; idx++) {
            bool expected_to_be_constant = (idx < 2);
            Builder builder = Builder();
            field_ct field_elt = (expected_to_be_constant) ? field_ct(input_array[idx])
                                                           : field_ct(witness_ct(&builder, input_array[idx]));
            bool_ct converted(field_elt);
            EXPECT_TRUE(converted.is_constant() == expected_to_be_constant);
            EXPECT_TRUE(field_elt.get_value() == converted.get_value());

            if (!expected_to_be_constant) {
                EXPECT_TRUE(CircuitChecker::check(builder));
                EXPECT_TRUE(converted.witness_index == field_elt.witness_index);
            }
        }
#ifndef NDEBUG
        // Check that the conversion aborts in the case of random field elements.
        bool_ct invalid_bool;
        // Case 4: Invalid constant conversion
        EXPECT_DEATH(invalid_bool = bool_ct(field_ct(input_array.back())),
                     "Assertion failed: (additive_constant == bb::fr::one() || additive_constant == bb::fr::zero())");
        // Case 5: Invalid witness conversion
        Builder builder = Builder();
        EXPECT_DEATH(invalid_bool = bool_ct(field_ct(witness_ct(&builder, input_array.back()))),
                     "Assertion failed: ((witness == bb::fr::zero()) || (witness == bb::fr::one()) == true)");
#endif
    }
    /**
     * @brief Test that bool is converted correctly
     *
     */
    static void test_bool_conversion_regression()
    {
        Builder builder = Builder();
        field_ct one = field_ct(witness_ct(&builder, 1));
        bool_ct b_false = bool_ct(one * field_ct(0));
        EXPECT_FALSE(b_false.get_value());
    }

    /**
     * @brief Test that conditional assign doesn't produce a new witness if lhs and rhs are constant
     *
     */
    static void test_conditional_assign_regression()
    {

        auto check_that_conditional_assign_result_is_constant = [](bool_ct& predicate) {
            field_ct x(2);
            field_ct y(2);
            field_ct z(1);
            field_ct alpha = x.madd(y, -z);
            field_ct beta(3);
            field_ct zeta = field_ct::conditional_assign(predicate, alpha, beta);

            EXPECT_TRUE(zeta.is_constant());
        };

        Builder builder = Builder();
        // Populate predicate array, ensure that both constant and witness predicates are present
        std::array<bool_ct, 4> predicates{
            bool_ct(true), bool_ct(false), bool_ct(witness_ct(&builder, true)), bool_ct(witness_ct(&builder, false))
        };

        for (auto& predicate : predicates) {
            check_that_conditional_assign_result_is_constant(predicate);
        }
    }

    /**
     * @brief Test that multiplicative_constant of constants is no longer affected
     * by any arithimetic operation
     *
     */
    static void test_multiplicative_constant_regression()
    {
        Builder builder = Builder();

        field_ct a(1);
        field_ct b(1);
        EXPECT_TRUE(a.multiplicative_constant == bb::fr::one());
        EXPECT_TRUE(b.multiplicative_constant == bb::fr::one());
        auto c = a + b;
        EXPECT_TRUE(c.multiplicative_constant == bb::fr::one());
        c = a - b;
        EXPECT_TRUE(c.multiplicative_constant == bb::fr::one());
        c = -c;
        EXPECT_TRUE(c.multiplicative_constant == bb::fr::one());
    }

    /**
     * @brief Demonstrate current behavior of assert_equal.
     */
    static void test_assert_equal()
    {
        auto run_test = [](bool constrain, bool true_when_y_val_zero = true) {
            Builder builder = Builder();
            field_ct x = witness_ct(&builder, 1);
            field_ct y = witness_ct(&builder, 0);

            // With no constraints, the proof verification will pass even though
            // we assert x and y are equal.
            bool expected_result = true;

            if (constrain) {
                /* The fact that we have a passing test in both cases that follow tells us
                 * that the failure in the first case comes from the additive constraint,
                 * not from a copy constraint. That failure is because the assert_equal
                 * below says that 'the value of y was always x'--the value 1 is substituted
                 * for x when evaluating the gate identity.
                 */
                if (true_when_y_val_zero) {
                    // constraint: 0*x + 1*y + 0*0 + 0 == 0

                    builder.create_add_gate({ .a = x.witness_index,
                                              .b = y.witness_index,
                                              .c = builder.zero_idx,
                                              .a_scaling = 0,
                                              .b_scaling = 1,
                                              .c_scaling = 0,
                                              .const_scaling = 0 });
                    expected_result = false;
                } else {
                    // constraint: 0*x + 1*y + 0*0 - 1 == 0

                    builder.create_add_gate({ .a = x.witness_index,
                                              .b = y.witness_index,
                                              .c = builder.zero_idx,
                                              .a_scaling = 0,
                                              .b_scaling = 1,
                                              .c_scaling = 0,
                                              .const_scaling = -1 });
                    expected_result = true;
                }
            }

            x.assert_equal(y);

            // both field elements have real value 1 now
            EXPECT_EQ(x.get_value(), 1);
            EXPECT_EQ(y.get_value(), 1);

            bool result = CircuitChecker::check(builder);

            EXPECT_EQ(result, expected_result);
        };

        run_test(false);
        run_test(true, true);
        run_test(true, false);
    }

    static void test_add_mul_with_constants()
    {
        Builder builder = Builder();
        auto gates_before = builder.get_estimated_num_finalized_gates();
        uint64_t expected = fidget(builder);
        auto gates_after = builder.get_estimated_num_finalized_gates();
        auto& block = builder.blocks.arithmetic;
        EXPECT_EQ(builder.get_variable(block.w_o()[block.size() - 1]), fr(expected));
        info("Number of gates added", gates_after - gates_before);
        bool result = CircuitChecker::check(builder);
        EXPECT_EQ(result, true);
    }

    static void test_div()
    {
        Builder builder = Builder();

        field_ct a = witness_ct(&builder, bb::fr::random_element());
        a *= fr::random_element();
        a += fr::random_element();

        field_ct b = witness_ct(&builder, bb::fr::random_element());
        b *= fr::random_element();
        b += fr::random_element();

        // Case 0: Numerator = const, denominator != const
        field_ct out = field_ct(&builder, b.get_value()) / a;
        EXPECT_EQ(out.get_value(), b.get_value() / a.get_value());
        EXPECT_FALSE(out.is_constant());
        // Check that the result is normalized in this case
        EXPECT_TRUE(out.multiplicative_constant == 1 && out.additive_constant == 0);

        // Case 1: Numerator and denominator != const
        out = b / a;
        EXPECT_EQ(out.get_value(), b.get_value() / a.get_value());

        // Case 2: Numerator != const, denominator = const,
        out = a / b.get_value();
        EXPECT_EQ(out.get_value(), a.get_value() / b.get_value());
        EXPECT_EQ(out.witness_index, a.witness_index);

        // Case 3: Numerator = const 0.
        out = field_ct(0) / b;
        EXPECT_EQ(out.get_value(), 0);
        EXPECT_EQ(out.is_constant(), true);

        bool result = CircuitChecker::check(builder);
        EXPECT_EQ(result, true);
    }

    static void test_div_edge_cases()
    {
        // Case 0. Numerator = const, denominator = const. Check the correctness of the value and that the result is
        // constant.
        field_ct a(bb::fr::random_element());
        field_ct b(bb::fr::random_element());
        field_ct q = a / b;
        EXPECT_TRUE(q.is_constant());
        EXPECT_EQ(a.get_value() / b.get_value(), q.get_value());

#ifndef NDEBUG
        {
            // Case 1. Numerator = const, denominator = const 0. Check that the division is aborted
            b = 0;
            EXPECT_DEATH(a / b, ".*");
        }
        { // Case 2. Numerator != const, denominator = const 0. Check that the division is aborted
            Builder builder = Builder();
            field_ct a = witness_ct(&builder, bb::fr::random_element());
            b = 0;
            EXPECT_DEATH(a / b, ".*");
        }
#endif
        {
            // Case 3. Numerator != const, denominator = witness 0 . Check that the circuit fails.
            Builder builder = Builder();
            field_ct a = witness_ct(&builder, bb::fr::random_element());
            b = witness_ct(&builder, bb::fr::zero());
            q = a / b;
            EXPECT_FALSE(CircuitChecker::check(builder));
        }
        {
            // Case 4. Numerator = const, denominator = witness 0 . Check that the circuit fails.
            Builder builder = Builder();
            field_ct a(bb::fr::random_element());
            b = witness_ct(&builder, bb::fr::zero());
            q = a / b;
            EXPECT_FALSE(CircuitChecker::check(builder));
        }
    }
    static void test_invert()
    {
        // Test constant case
        field_ct a(bb::fr::random_element());
        field_ct b = a.invert();
        // Check that the result is constant and correct
        EXPECT_TRUE(a.is_constant() && (b.get_value() * a.get_value() == 1));

        // Test non-constant case
        Builder builder = Builder();
        a = witness_ct(&builder, a.get_value());
        b = a.invert();
        // Check that the result is normalized
        EXPECT_TRUE((b.multiplicative_constant == 1) && (b.additive_constant == 0));
        // Check that the result is correct
        EXPECT_TRUE(a.get_value() * b.get_value() == 1);
    }
    static void test_postfix_increment()
    {
        Builder builder = Builder();

        field_ct a = witness_ct(&builder, 10);

        field_ct b = a++;

        EXPECT_EQ(b.get_value(), 10);
        EXPECT_EQ(a.get_value(), 11);
        EXPECT_TRUE(!b.is_constant());

        EXPECT_TRUE(CircuitChecker::check(builder));
    }

    static void test_prefix_increment()
    {
        Builder builder = Builder();

        field_ct a = witness_ct(&builder, 10);

        field_ct b = ++a;

        EXPECT_EQ(b.get_value(), 11);
        EXPECT_EQ(a.get_value(), 11);

        bool result = CircuitChecker::check(builder);
        EXPECT_EQ(result, true);
    }

    static void test_field_fibbonaci()
    {
        Builder builder = Builder();
        field_ct a(witness_ct(&builder, fr::one()));
        field_ct b(witness_ct(&builder, fr::one()));

        field_ct c = a + b;

        for (size_t i = 0; i < 16; ++i) {
            b = a;
            a = c;
            c = a + b;
        }

        EXPECT_EQ(c.get_value(), fr(4181));

        bool result = CircuitChecker::check(builder);
        EXPECT_EQ(result, true);
    }

    static void test_field_pythagorean()
    {
        Builder builder = Builder();

        field_ct a(witness_ct(&builder, 3));
        field_ct b(witness_ct(&builder, 4));
        field_ct c(witness_ct(&builder, 5));

        field_ct a_sqr = a * a;
        field_ct b_sqr = b * b;
        field_ct c_sqr = c * c;
        c_sqr.set_public();
        field_ct sum_sqrs = a_sqr + b_sqr;

        // builder.assert_equal(sum_sqrs.witness_index, c_sqr.witness_index, "triple is not pythagorean");
        c_sqr.assert_equal(sum_sqrs);

        bool verified = CircuitChecker::check(builder);

        ASSERT_TRUE(verified);
    }

    static void test_equality()
    {
        Builder builder = Builder();
        auto gates_before = builder.get_estimated_num_finalized_gates();
        field_ct a(witness_ct(&builder, 4));
        field_ct b(witness_ct(&builder, 4));
        bool_ct r = a == b;

        auto gates_after = builder.get_estimated_num_finalized_gates();
        EXPECT_EQ(r.get_value(), true);

        fr x = r.get_value();
        EXPECT_EQ(x, fr(1));
        // Using a == b, when both a and b are witnesses, adds 4 constraints:
        // 1) compute a - b;
        // 2) ensure r is bool;
        // 3) (a - b) * I + r - 1 = 0;
        // 4) -I * r + r = 0.
        EXPECT_EQ(gates_after - gates_before, 4UL);

        bool result = CircuitChecker::check(builder);
        EXPECT_EQ(result, true);
    }

    static void test_equality_false()
    {
        Builder builder = Builder();

        auto gates_before = builder.get_estimated_num_finalized_gates();
        field_ct a(witness_ct(&builder, 4));
        field_ct b(witness_ct(&builder, 3));
        bool_ct r = a == b;
        auto gates_after = builder.get_estimated_num_finalized_gates();

        EXPECT_FALSE(r.get_value());

        // Using a == b, when both a and b are witnesses, adds 4 constraints:
        // 1) compute a - b;
        // 2) ensure r is bool;
        // 3) (a - b) * I + r - 1 = 0;
        // 4) -I * r + r = 0
        EXPECT_EQ(gates_after - gates_before, 4UL);
        EXPECT_TRUE(CircuitChecker::check(builder));
    }

    static void test_equality_with_constants()
    {
        Builder builder = Builder();
        field_ct a(witness_ct(&builder, 4));

        auto gates_before = builder.get_estimated_num_finalized_gates();
        field_ct b = 3;
        field_ct c = 7;
        // Note that the lhs is constant, hence (rhs - lhs) can be computed without adding new gates, using == in this
        // case requires 3 constraints
        // 1) ensure r is bool;
        // 2) (a - b) * I + r - 1 = 0;
        // 3) -I * r + r = 0
        bool_ct r = (a * c) == (b * c + c);
        auto gates_after = builder.get_estimated_num_finalized_gates();
        EXPECT_EQ(gates_after - gates_before, 3UL);
        r = r && (b + 1 == a);
        EXPECT_EQ(r.get_value(), true);
        // The situation is as above, but we also applied && to bool_t witnesses, which adds an extra gate.
        EXPECT_EQ(builder.get_estimated_num_finalized_gates() - gates_after, 4UL);
        EXPECT_TRUE(CircuitChecker::check(builder));
    }

    static void test_larger_circuit()
    {
        size_t n = 16384;
        Builder builder;

        build_test_circuit(builder, n);

        bool result = CircuitChecker::check(builder);
        EXPECT_EQ(result, true);
    }

    static void test_is_zero()
    {
        Builder builder = Builder();
        // Create constant elements
        field_ct d(&builder, fr::zero());
        field_ct e(&builder, fr::one());
        // Validate that `is_zero()` check does not add any gates in this case
        const size_t old_n = builder.get_estimated_num_finalized_gates();
        bool_ct d_zero = d.is_zero();
        bool_ct e_zero = e.is_zero();
        const size_t new_n = builder.get_estimated_num_finalized_gates();
        EXPECT_EQ(old_n, new_n);

        // Create witnesses
        field_ct a = (public_witness_ct(&builder, fr::random_element()));
        field_ct b = (public_witness_ct(&builder, fr::neg_one()));
        // Create constants
        field_ct c_1(&builder, engine.get_random_uint256());
        field_ct c_2(&builder, engine.get_random_uint256());
        field_ct c_3(&builder, bb::fr::one());
        field_ct c_4 = c_1 + c_2;

        // Ensure that `a` and `b` are not normalized
        a = a * c_4 + c_4;
        b = b * c_4 + c_4;         // = -c_4 + c_4
        b = (b - c_1 - c_2) / c_4; // = (-c_1 - c_2 )/c_4 = -1
        b = b + c_3;               //  = -1 + 1 = 0
        EXPECT_TRUE(a.additive_constant != 0 || a.multiplicative_constant != 1);
        EXPECT_TRUE(b.additive_constant != 0 || b.multiplicative_constant != 1);

        bool_ct a_zero = a.is_zero();
        bool_ct b_zero = b.is_zero();

        bool_ct a_normalized_zero = a.normalize().is_zero();
        bool_ct b_normalized_zero = b.normalize().is_zero();

        EXPECT_EQ(a_zero.get_value(), false);
        EXPECT_EQ(b_zero.get_value(), true);
        EXPECT_EQ(a_normalized_zero.get_value(), false);
        EXPECT_EQ(b_normalized_zero.get_value(), true);
        EXPECT_EQ(d_zero.get_value(), true);
        EXPECT_EQ(e_zero.get_value(), false);

        bool result = CircuitChecker::check(builder);
        EXPECT_EQ(result, true);
    }

    static void madd()
    {
        Builder builder = Builder();

        field_ct a(witness_ct(&builder, fr::random_element()));
        field_ct b(witness_ct(&builder, fr::random_element()));
        field_ct c(witness_ct(&builder, fr::random_element()));
        field_ct ma(&builder, fr::random_element());
        field_ct ca(&builder, fr::random_element());
        field_ct mb(&builder, fr::random_element());
        field_ct cb(&builder, fr::random_element());
        field_ct mc(&builder, fr::random_element());
        field_ct cc(&builder, fr::random_element());

        // test madd when all operands are witnesses
        field_ct d = a * ma + ca;
        field_ct e = b * mb + cb;
        field_ct f = c * mc + cc;
        field_ct g = d.madd(e, f);
        field_ct h = d * e + f;
        h = h.normalize();
        g = g.normalize();
        EXPECT_EQ(g.get_value(), h.get_value());

        // test madd when to_add = constant
        field_ct i = a.madd(b, ma);
        field_ct j = a * b + ma;
        i = i.normalize();
        j = j.normalize();
        EXPECT_EQ(i.get_value(), j.get_value());

        // test madd when to_mul = constant
        field_ct k = a.madd(mb, c);
        field_ct l = a * mb + c;
        k = k.normalize();
        l = l.normalize();
        EXPECT_EQ(k.get_value(), l.get_value());

        // test madd when lhs is constant
        field_ct m = ma.madd(b, c);
        field_ct n = ma * b + c;
        m = m.normalize();
        n = n.normalize();
        EXPECT_EQ(m.get_value(), n.get_value());

        bool result = CircuitChecker::check(builder);
        EXPECT_EQ(result, true);
    }
    static void test_conditional_negate()
    {
        Builder builder = Builder();
        std::array<bool_ct, 4> predicates{
            bool_ct(true), bool_ct(false), bool_ct(witness_ct(&builder, true)), bool_ct(witness_ct(&builder, false))
        };
        field_ct constant_summand(bb::fr::random_element());
        field_ct witness_summand(witness_ct(&builder, bb::fr::random_element()));
        for (auto& predicate : predicates) {

            const bool predicate_is_witness = !predicate.is_constant();

            // Conditionally negate a constant
            size_t num_gates_before = builder.get_estimated_num_finalized_gates();
            auto result = constant_summand.conditional_negate(predicate);
            auto expected_result = predicate.get_value() ? -constant_summand.get_value() : constant_summand.get_value();
            EXPECT_TRUE(result.get_value() == expected_result);
            // Check that `result` is constant if and only if both the predicate and (*this) are constant.
            EXPECT_TRUE(result.is_constant() == predicate.is_constant());
            // A gate is only added if the predicate is a witness
            EXPECT_TRUE(builder.get_estimated_num_finalized_gates() - num_gates_before == predicate_is_witness);

            // Conditionally negate a witness
            num_gates_before = builder.get_estimated_num_finalized_gates();
            result = witness_summand.conditional_negate(predicate);
            expected_result = predicate.get_value() ? -witness_summand.get_value() : witness_summand.get_value();
            EXPECT_TRUE(result.get_value() == expected_result);
            // The result must be a witness
            EXPECT_FALSE(result.is_constant());
            // A gate is only added if the predicate is a witness
            EXPECT_TRUE(builder.get_estimated_num_finalized_gates() - num_gates_before == predicate_is_witness);
        }
    }
    static void two_bit_table()
    {
        Builder builder = Builder();
        field_ct a(witness_ct(&builder, fr::random_element()));
        field_ct b(witness_ct(&builder, fr::random_element()));
        field_ct c(witness_ct(&builder, fr::random_element()));
        field_ct d(witness_ct(&builder, fr::random_element()));

        std::array<field_ct, 4> table = field_ct::preprocess_two_bit_table(a, b, c, d);

        bool_ct zero(witness_ct(&builder, false));
        bool_ct one(witness_ct(&builder, true));

        field_ct result_a = field_ct::select_from_two_bit_table(table, zero, zero).normalize();
        field_ct result_b = field_ct::select_from_two_bit_table(table, zero, one).normalize();
        field_ct result_c = field_ct::select_from_two_bit_table(table, one, zero).normalize();
        field_ct result_d = field_ct::select_from_two_bit_table(table, one, one).normalize();

        EXPECT_EQ(result_a.get_value(), a.get_value());
        EXPECT_EQ(result_b.get_value(), b.get_value());
        EXPECT_EQ(result_c.get_value(), c.get_value());
        EXPECT_EQ(result_d.get_value(), d.get_value());

        bool result = CircuitChecker::check(builder);
        EXPECT_EQ(result, true);
    }

    static void test_slice()
    {
        Builder builder = Builder();
        // 0b11110110101001011
        //         ^      ^
        //        msb    lsb
        //        10      3
        // hi=0x111101, lo=0x011, slice=0x10101001
        //
        field_ct a(witness_ct(&builder, fr(126283)));
        auto slice_data = a.slice(10, 3);
        EXPECT_EQ(slice_data[0].get_value(), fr(3));
        EXPECT_EQ(slice_data[1].get_value(), fr(169));
        EXPECT_EQ(slice_data[2].get_value(), fr(61));

        EXPECT_TRUE(CircuitChecker::check(builder));
    }

    static void test_slice_equal_msb_lsb()
    {
        Builder builder = Builder();
        // 0b11110110101001011
        //             ^
        //         msb = lsb
        //             6
        // hi=0b1111011010, lo=0b001011, slice=0b1
        //
        field_ct a(witness_ct(&builder, fr(126283)));
        auto slice_data = a.slice(6, 6);

        EXPECT_EQ(slice_data[0].get_value(), fr(11));
        EXPECT_EQ(slice_data[1].get_value(), fr(1));
        EXPECT_EQ(slice_data[2].get_value(), fr(986));

        bool result = CircuitChecker::check(builder);
        EXPECT_EQ(result, true);
    }

    static void test_slice_random()
    {
        Builder builder = Builder();

        uint8_t lsb = 106;
        uint8_t msb = 189;
        fr a_ = fr(engine.get_random_uint256() && ((uint256_t(1) << 252) - 1));
        field_ct a(witness_ct(&builder, a_));
        auto slice = a.slice(msb, lsb);

        const uint256_t expected0 = uint256_t(a_) & ((uint256_t(1) << lsb) - 1);
        const uint256_t expected1 = (uint256_t(a_) >> lsb) & ((uint256_t(1) << (msb - lsb + 1)) - 1);
        const uint256_t expected2 = (uint256_t(a_) >> (msb + 1)) & ((uint256_t(1) << (252 - msb - 1)) - 1);

        EXPECT_EQ(slice[0].get_value(), fr(expected0));
        EXPECT_EQ(slice[1].get_value(), fr(expected1));
        EXPECT_EQ(slice[2].get_value(), fr(expected2));

        EXPECT_TRUE(CircuitChecker::check(builder));

        // Check that attempting to slice a full uint256_t value leads to a circuit failure.
        while (static_cast<uint256_t>(a.get_value()).get_msb() < grumpkin::MAX_NO_WRAP_INTEGER_BIT_LENGTH + 1) {
            a = witness_ct(&builder, engine.get_random_uint256());
        }
        info(static_cast<uint256_t>(a.get_value()).get_msb());
        slice = a.slice(msb, lsb);
        EXPECT_FALSE(CircuitChecker::check(builder));
        EXPECT_TRUE(builder.err() == "slice: hi value too large.");
    }

    static void three_bit_table()
    {
        Builder builder = Builder();
        field_ct a(witness_ct(&builder, fr::random_element()));
        field_ct b(witness_ct(&builder, fr::random_element()));
        field_ct c(witness_ct(&builder, fr::random_element()));
        field_ct d(witness_ct(&builder, fr::random_element()));
        field_ct e(witness_ct(&builder, fr::random_element()));
        field_ct f(witness_ct(&builder, fr::random_element()));
        field_ct g(witness_ct(&builder, fr::random_element()));
        field_ct h(witness_ct(&builder, fr::random_element()));

        std::array<field_ct, 8> table = field_ct::preprocess_three_bit_table(a, b, c, d, e, f, g, h);

        bool_ct zero(witness_ct(&builder, false));
        bool_ct one(witness_ct(&builder, true));

        field_ct result_a = field_ct::select_from_three_bit_table(table, zero, zero, zero).normalize();
        field_ct result_b = field_ct::select_from_three_bit_table(table, zero, zero, one).normalize();
        field_ct result_c = field_ct::select_from_three_bit_table(table, zero, one, zero).normalize();
        field_ct result_d = field_ct::select_from_three_bit_table(table, zero, one, one).normalize();
        field_ct result_e = field_ct::select_from_three_bit_table(table, one, zero, zero).normalize();
        field_ct result_f = field_ct::select_from_three_bit_table(table, one, zero, one).normalize();
        field_ct result_g = field_ct::select_from_three_bit_table(table, one, one, zero).normalize();
        field_ct result_h = field_ct::select_from_three_bit_table(table, one, one, one).normalize();

        EXPECT_EQ(result_a.get_value(), a.get_value());
        EXPECT_EQ(result_b.get_value(), b.get_value());
        EXPECT_EQ(result_c.get_value(), c.get_value());
        EXPECT_EQ(result_d.get_value(), d.get_value());
        EXPECT_EQ(result_e.get_value(), e.get_value());
        EXPECT_EQ(result_f.get_value(), f.get_value());
        EXPECT_EQ(result_g.get_value(), g.get_value());
        EXPECT_EQ(result_h.get_value(), h.get_value());

        bool result = CircuitChecker::check(builder);
        EXPECT_EQ(result, true);
    }

    /**
     * @brief Test success and failure cases for decompose_into_bits.
     *
     * @details The target function constructs `sum` from a supplied collection of bits and compares it with a value
     * `val_256`. We supply bit vectors to test some failure cases.
     */

    static void test_decompose_into_bits()
    {
        using witness_supplier_type = std::function<witness_ct(Builder * ctx, uint64_t, uint256_t)>;

        // check that constraints are satisfied for a variety of inputs
        auto run_success_test = [&](size_t num_bits) {
            Builder builder = Builder();

            uint256_t random_val(engine.get_random_uint256());
            // For big values (num_bits>=254), ensure that they can't overflow by shifting by 4 bits.
            uint256_t scalar_raw = (num_bits < 254) ? random_val >> (256 - num_bits) : random_val >> 4;
            field_ct a = witness_ct(&builder, scalar_raw);
            std::vector<bool_ct> c = a.decompose_into_bits(num_bits);
            uint256_t bit_sum = 0;
            for (size_t i = 0; i < c.size(); i++) {
                uint256_t scaling_factor_value(uint256_t(1) << i);
                bit_sum += fr(c[i].get_value()) * scaling_factor_value;
            }
            EXPECT_EQ(bit_sum, scalar_raw);

            ASSERT_TRUE(CircuitChecker::check(builder));
        };

        // Now try to supply unintended witness values and test for failure.
        // Fr::modulus is equivalent to zero in Fr, but this should be forbidden by a range constraint.
        witness_supplier_type supply_modulus_bits = [](Builder* ctx, uint64_t j, uint256_t val_256) {
            ignore_unused(val_256);
            // use this to get `sum` to be fr::modulus.
            return witness_ct(ctx, fr::modulus.get_bit(j));
        };

        // design a bit vector that will pass all range constraints, but it fails the copy constraint.
        witness_supplier_type supply_half_modulus_bits = [](Builder* ctx, uint64_t j, uint256_t val_256) {
            // use this to fit y_hi into 128 bits
            if (j > 127) {
                return witness_ct(ctx, val_256.get_bit(j));
            };

            return witness_ct(ctx, (fr::modulus).get_bit(j));
        };

        auto run_failure_test = [&](witness_supplier_type witness_supplier, std::string err_msg) {
            Builder builder = Builder();

            fr a_expected = 0;
            field_ct a = witness_ct(&builder, a_expected);
            std::vector<bool_ct> c = a.decompose_into_bits(256, witness_supplier);

            bool verified = CircuitChecker::check(builder);
            ASSERT_FALSE(verified);
            EXPECT_TRUE(err_msg == builder.err());
        };

        for (size_t idx = 1; idx <= 256; idx++) {
            run_success_test(idx);
        }

        run_failure_test(supply_modulus_bits, "field_t: bit decomposition fails: y_hi is too large.");
        run_failure_test(supply_half_modulus_bits, "field_t: bit decomposition_fails: copy constraint");
    }

    static void test_assert_is_in_set()
    {
        Builder builder = Builder();

        field_ct a(witness_ct(&builder, fr(1)));
        field_ct b(witness_ct(&builder, fr(2)));
        field_ct c(witness_ct(&builder, fr(3)));
        field_ct d(witness_ct(&builder, fr(4)));
        field_ct e(witness_ct(&builder, fr(5)));
        std::vector<field_ct> set = { a, b, c, d, e };

        a.assert_is_in_set(set);
        info("num gates = ", builder.get_estimated_num_finalized_gates());

        bool result = CircuitChecker::check(builder);
        EXPECT_EQ(result, true);
    }

    static void test_assert_is_in_set_fails()
    {
        Builder builder = Builder();

        field_ct a(witness_ct(&builder, fr(1)));
        field_ct b(witness_ct(&builder, fr(2)));
        field_ct c(witness_ct(&builder, fr(3)));
        field_ct d(witness_ct(&builder, fr(4)));
        field_ct e(witness_ct(&builder, fr(5)));
        std::vector<field_ct> set = { a, b, c, d, e };

        field_ct f(witness_ct(&builder, fr(6)));
        f.assert_is_in_set(set);

        info("num gates = ", builder.get_estimated_num_finalized_gates());
        bool result = CircuitChecker::check(builder);
        EXPECT_EQ(result, false);
    }

    static void test_pow()
    {
        Builder builder = Builder();

        std::array<uint32_t, 3> const_exponent_values{ 0, 1, engine.get_random_uint32() };
        std::array<field_ct, 3> witness_exponent_values{ witness_ct(&builder, 0),
                                                         witness_ct(&builder, 1),
                                                         witness_ct(&builder, engine.get_random_uint32()) };

        std::array<uint256_t, 3> base_values{ 0, 1, engine.get_random_uint256() };
        for (auto& base : base_values) {
            for (auto& exponent : const_exponent_values) {
                // Test constant base && integer exponent cases
                field_ct result = field_ct(base).pow(exponent);
                EXPECT_TRUE(result.is_constant());
                EXPECT_EQ(result.get_value(), bb::fr(base).pow(exponent));
                // Test witness base && integer exponent cases
                field_ct witness_base(witness_ct(&builder, base));
                result = witness_base.pow(exponent);

                if (exponent != 0) {
                    EXPECT_TRUE(!result.is_constant());
                } else {
                    EXPECT_TRUE(result.is_constant());
                }

                EXPECT_EQ(result.get_value(), bb::fr(base).pow(exponent));

                EXPECT_TRUE(CircuitChecker::check(builder));
            }
            for (auto& exponent : witness_exponent_values) {

                // Test constant base && witness exponent cases
                field_ct result = field_ct(base).pow(exponent);
                // Normalized witness == 1 leads to constant results in `conditional_assign(predicate, 1, 1)`
                EXPECT_EQ(result.is_constant(), base == 1);

                EXPECT_EQ(result.get_value(), bb::fr(base).pow(exponent.get_value()));
                // Test witness base && witness exponent cases
                field_ct witness_base(witness_ct(&builder, base));
                result = witness_base.pow(exponent);

                EXPECT_TRUE(!result.is_constant());
                EXPECT_EQ(result.get_value(), bb::fr(base).pow(exponent.get_value()));

                EXPECT_TRUE(CircuitChecker::check(builder));
            }
        }
    }

    static void test_pow_exponent_out_of_range()
    {
        Builder builder = Builder();

        fr base_val(engine.get_random_uint256());
        uint64_t exponent_val = engine.get_random_uint32();
        exponent_val += (uint64_t(1) << 32);

        field_ct base = witness_ct(&builder, base_val);
        field_ct exponent = witness_ct(&builder, exponent_val);
        field_ct result = base.pow(exponent);
        fr expected = base_val.pow(exponent_val);

        EXPECT_NE(result.get_value(), expected);
        EXPECT_EQ(builder.failed(), true);
        EXPECT_EQ(builder.err(), "field_t::pow exponent accumulator incorrect");

        exponent = field_ct(exponent_val);
#ifndef NDEBUG
        EXPECT_DEATH(base.pow(exponent), "Assertion failed: \\(exponent_value.get_msb\\(\\) < 32\\)");
#endif
    };

    static void test_copy_as_new_witness()
    {
        Builder builder = Builder();

        fr value(engine.get_random_uint256());
        field_ct value_ct = witness_ct(&builder, value);

        field_ct first_copy = witness_ct(&builder, value_ct.get_value());
        field_ct second_copy = field_ct::copy_as_new_witness(builder, value_ct);

        EXPECT_EQ(value_ct.get_value(), value);
        EXPECT_EQ(first_copy.get_value(), value);
        EXPECT_EQ(second_copy.get_value(), value);

        EXPECT_EQ(value_ct.get_witness_index() + 1, first_copy.get_witness_index());
        EXPECT_EQ(value_ct.get_witness_index() + 2, second_copy.get_witness_index());
        info("num gates = ", builder.get_estimated_num_finalized_gates());

        bool result = CircuitChecker::check(builder);
        EXPECT_EQ(result, true);
    }

    static void test_assert_is_zero()
    {
        // Create a constant 0, `assert_is_zero()` does nothing in-circuit in this case
        field_ct elt = bb::fr::zero();
        elt.assert_is_zero();
        // If we apply `assert_is_zero()` to a non-zero constant, we hit an ASSERT failure
        elt = bb::fr::random_element();
#ifndef NDEBUG

        if (elt.get_value() != 0) {
            EXPECT_DEATH(elt.assert_is_zero(), "field_t::assert_is_zero");
        }
#endif
        // Create a witness 0
        Builder builder = Builder();
        elt = witness_ct(&builder, bb::fr::zero());
        elt.assert_is_zero();
        // The circuit must be correct
        EXPECT_TRUE(CircuitChecker::check(builder));

        // If we apply `assert_is_zero()` to a non-zero witness, an unsatisfiable `poly_gate` constraint is created
        field_ct non_zero_elt = witness_ct(&builder, bb::fr::random_element());
        if (non_zero_elt.get_value() != 0) {
            non_zero_elt.assert_is_zero();
            EXPECT_FALSE(CircuitChecker::check(builder));
        }
    }

    static void test_accumulate()
    {
        for (size_t max_vector_length = 1; max_vector_length < 100; max_vector_length++) {
            Builder builder = Builder();
            std::vector<bb::fr> native_input(max_vector_length, 0);
            for (auto& entry : native_input) {
                entry = bb::fr::random_element();
            }

            // Compute the native sum
            bb::fr native_sum = std::accumulate(native_input.begin(), native_input.end(), bb::fr::zero());
            std::vector<field_ct> input(max_vector_length);
            size_t idx = 0;
            // Convert native vector to a vector of field_t elements. Every 5th element is set to be constant.
            for (auto& native_entry : native_input) {
                field_ct entry = ((idx % 5) == 0) ? field_ct(native_entry) : witness_ct(&builder, native_entry);
                input.emplace_back(entry);
                idx++;
            }
            // Compute the accumulation result
            field_ct sum = field_ct::accumulate(input);
            EXPECT_EQ(native_sum, sum.get_value());

            // Check that the result is normalized
            if (!sum.is_constant()) {
                EXPECT_TRUE(sum.multiplicative_constant == 1 && sum.additive_constant == 0);
            }

            EXPECT_TRUE(CircuitChecker::check(builder));

            // Check that the number of gates is as expected
            size_t num_witnesses = max_vector_length - (max_vector_length + 4) / 5;
            size_t padding = (3 - (num_witnesses % 3)) % 3;
            size_t expected_num_gates = (num_witnesses + padding) / 3;

            EXPECT_EQ(builder.get_estimated_num_finalized_gates() - 1, expected_num_gates);

            // Check that the accumulation of constant entries does not create a witness
            std::vector<field_ct> constant_input;
            for (auto& entry : input) {
                if (entry.is_constant()) {
                    constant_input.emplace_back(entry);
                }
            }
            field_ct constant_sum = field_ct::accumulate(constant_input);
            EXPECT_TRUE(constant_sum.is_constant());
        }
        // Test edge cases
        // 1. Accumulating an empty vector should lead to constant zero.
        std::vector<field_ct> empty_input;
        field_ct result(field_ct::accumulate(empty_input));
        EXPECT_TRUE(result.is_constant() && result.get_value() == bb::fr::zero());
        // 2. Check that the result of accumulating a single witness summand is correct and normalized.
        Builder builder = Builder();
        field_ct single_summand = witness_ct(&builder, bb::fr::random_element());
        single_summand += field_ct(bb::fr(3));
        single_summand *= field_ct(bb::fr(2));
        // `single_summand` isn't normalized anymore
        EXPECT_TRUE(single_summand.additive_constant != 0 && single_summand.multiplicative_constant != 1);
        std::vector<field_ct> single_element_input{ single_summand };
        // The accumulation result is expected to be normalized
        result = field_ct::accumulate(single_element_input);
        EXPECT_TRUE(result.get_value() == single_summand.get_value() && result.additive_constant == 0 &&
                    result.multiplicative_constant == 1);
    }

    static void test_fix_witness()
    {
        Builder builder = Builder();

        field_ct witness = witness_ct(&builder, bb::fr::random_element());
        witness.fix_witness();
        // Validate that the negated value of the witness is recorded in q_c.
        EXPECT_TRUE(builder.blocks.arithmetic.q_c().back() == -witness.get_value());
    }

    static void test_ranged_less_than()
    {
        Builder builder = Builder();

        for (size_t i = 0; i < 10; ++i) {
            int a_val = static_cast<int>(engine.get_random_uint8());
            int b_val = 0;
            switch (i) {
            case 0: {
                b_val = a_val;
                break;
            }
            case 1: {
                b_val = a_val + 1;
                break;
            }
            case 2: {
                b_val = a_val - 1;
                break;
            }
            default: {
                b_val = static_cast<int>(engine.get_random_uint8());
                break;
            }
            }
            if (b_val < 0) {
                b_val = 255;
            }
            if (b_val > 255) {
                b_val = 0;
            }
            field_ct a = witness_ct(&builder, static_cast<uint64_t>(a_val));
            field_ct b = witness_ct(&builder, static_cast<uint64_t>(b_val));
            a.create_range_constraint(8);
            b.create_range_constraint(8);
            bool_ct result = a.template ranged_less_than<8>(b);
            bool expected = a_val < b_val;

            EXPECT_EQ(result.get_value(), expected);
        }
        bool check_result = CircuitChecker::check(builder);
        EXPECT_EQ(check_result, true);
    }

    static void test_add_two()
    {
        Builder builder = Builder();
        auto x_1 = bb::fr::random_element();
        auto x_2 = bb::fr::random_element();
        auto x_3 = bb::fr::random_element();

        field_ct x_1_ct = witness_ct(&builder, x_1);
        field_ct x_2_ct = witness_ct(&builder, x_2);
        field_ct x_3_ct = witness_ct(&builder, x_3);

        auto sum_ct = x_1_ct.add_two(x_2_ct, x_3_ct);

        EXPECT_EQ(sum_ct.get_value(), x_1 + x_2 + x_3);

        bool circuit_checks = CircuitChecker::check(builder);
        EXPECT_TRUE(circuit_checks);
    }
    static void test_origin_tag_consistency()
    {
        Builder builder = Builder();
        auto a = field_ct(witness_ct(&builder, bb::fr::random_element()));
        auto b = field_ct(witness_ct(&builder, bb::fr::random_element()));
        EXPECT_TRUE(a.get_origin_tag().is_empty());
        EXPECT_TRUE(b.get_origin_tag().is_empty());
        const size_t parent_id = 0;

        const auto submitted_value_origin_tag = OriginTag(parent_id, /*round_id=*/0, /*is_submitted=*/true);
        const auto challenge_origin_tag = OriginTag(parent_id, /*round_id=*/0, /*is_submitted=*/false);
        const auto next_challenge_tag = OriginTag(parent_id, /*round_id=*/1, /*submitted=*/false);

        const auto first_two_merged_tag = OriginTag(submitted_value_origin_tag, challenge_origin_tag);
        const auto first_and_third_merged_tag = OriginTag(submitted_value_origin_tag, next_challenge_tag);
        const auto first_second_third_merged_tag = OriginTag(first_two_merged_tag, next_challenge_tag);

        a.set_origin_tag(submitted_value_origin_tag);
        b.set_origin_tag(challenge_origin_tag);

        EXPECT_EQ(a.get_origin_tag(), submitted_value_origin_tag);
        EXPECT_EQ(b.get_origin_tag(), challenge_origin_tag);

        // Basic additon merges tags
        auto c = a + b;
        EXPECT_EQ(c.get_origin_tag(), first_two_merged_tag);

        // Basic multiplication merges tags
        auto d = a * b;
        EXPECT_EQ(d.get_origin_tag(), first_two_merged_tag);

        // Basic subtraction merges tags
        auto e = a - b;
        EXPECT_EQ(e.get_origin_tag(), first_two_merged_tag);

        // Division merges tags

        auto f = a / b;
        EXPECT_EQ(f.get_origin_tag(), first_two_merged_tag);

        // Exponentiation merges tags

        auto exponent = field_ct(witness_ct(&builder, 10));
        exponent.set_origin_tag(challenge_origin_tag);
        auto g = a.pow(exponent);
        EXPECT_EQ(g.get_origin_tag(), first_two_merged_tag);

        // Madd merges tags
        auto h = field_ct(witness_ct(&builder, bb::fr::random_element()));
        h.set_origin_tag(next_challenge_tag);
        auto i = a.madd(b, h);
        EXPECT_EQ(i.get_origin_tag(), first_second_third_merged_tag);

        // add_two merges tags
        auto j = a.add_two(b, h);
        EXPECT_EQ(j.get_origin_tag(), first_second_third_merged_tag);

        // Normalize preserves tag

        EXPECT_EQ(j.normalize().get_origin_tag(), j.get_origin_tag());

        // is_zero preserves tag

        EXPECT_EQ(a.is_zero().get_origin_tag(), a.get_origin_tag());

        // equals/not equals operator merges tags

        EXPECT_EQ((a == b).get_origin_tag(), first_two_merged_tag);
        EXPECT_EQ((a != b).get_origin_tag(), first_two_merged_tag);

        // Conditionals merge tags

        auto k = bool_ct(witness_ct(&builder, 1));
        k.set_origin_tag(next_challenge_tag);
        auto l = a.conditional_negate(k);
        EXPECT_EQ(l.get_origin_tag(), first_and_third_merged_tag);

        auto m = field_ct::conditional_assign(k, a, b);
        EXPECT_EQ(m.get_origin_tag(), first_second_third_merged_tag);

        // Accumulate merges tags
        const size_t MAX_ACCUMULATED_ELEMENTS = 16;
        std::vector<field_ct> elements;
        std::vector<OriginTag> accumulated_tags;
        for (size_t index = 0; index < MAX_ACCUMULATED_ELEMENTS; index++) {
            const auto current_tag = OriginTag(parent_id, index >> 1, !(index & 1));
            if (index == 0) {
                accumulated_tags.push_back(current_tag);
            } else {
                accumulated_tags.emplace_back(accumulated_tags[index - 1], current_tag);
            }
            auto element = field_ct(witness_ct(&builder, bb::fr::random_element()));
            element.set_origin_tag(current_tag);
            elements.emplace_back(element);
        }

        for (size_t index = MAX_ACCUMULATED_ELEMENTS - 1; index > 0; index--) {
            EXPECT_EQ(field_ct::accumulate(elements).get_origin_tag(), accumulated_tags[index]);
            elements.pop_back();
        }

        // Slice preserves tags
        auto n = a.slice(1, 0);
        for (const auto& element : n) {
            EXPECT_EQ(element.get_origin_tag(), submitted_value_origin_tag);
        }

        // Decomposition preserves tags

        auto decomposed_bits = a.decompose_into_bits();
        for (const auto& bit : decomposed_bits) {
            EXPECT_EQ(bit.get_origin_tag(), submitted_value_origin_tag);
        }

        // Conversions

        auto o = field_ct(witness_ct(&builder, 1));
        o.set_origin_tag(submitted_value_origin_tag);
        auto p = bool_ct(o);
        EXPECT_EQ(p.get_origin_tag(), submitted_value_origin_tag);

        o.set_origin_tag(challenge_origin_tag);
        o = field_ct(p);

        EXPECT_EQ(o.get_origin_tag(), submitted_value_origin_tag);

        auto q = field_ct(witness_ct(&builder, fr::random_element()));
        auto poisoned_tag = challenge_origin_tag;
        poisoned_tag.poison();
        q.set_origin_tag(poisoned_tag);
#ifndef NDEBUG
        EXPECT_THROW(q + q, std::runtime_error);
#endif
    }
};

using CircuitTypes = testing::Types<bb::UltraCircuitBuilder>;

TYPED_TEST_SUITE(stdlib_field, CircuitTypes);

TYPED_TEST(stdlib_field, test_constructor_from_witness)
{
    TestFixture::test_constructor_from_witness();
}

TYPED_TEST(stdlib_field, test_add)
{
    TestFixture::test_add();
}
TYPED_TEST(stdlib_field, test_create_range_constraint)
{
    TestFixture::create_range_constraint();
}
TYPED_TEST(stdlib_field, test_conditional_assign_regression)
{
    TestFixture::test_conditional_assign_regression();
}
TYPED_TEST(stdlib_field, test_multiplicative_constant_regression)
{
    TestFixture::test_multiplicative_constant_regression();
}
TYPED_TEST(stdlib_field, test_assert_equal)
{
    TestFixture::test_assert_equal();
}
TYPED_TEST(stdlib_field, test_bool_conversion)
{
    TestFixture::test_bool_conversion();
}

TYPED_TEST(stdlib_field, test_bool_conversion_regression)
{
    TestFixture::test_bool_conversion_regression();
}
TYPED_TEST(stdlib_field, test_div)
{
    TestFixture::test_div();
}
TYPED_TEST(stdlib_field, test_div_edge_cases)
{
    TestFixture::test_div_edge_cases();
}
TYPED_TEST(stdlib_field, test_invert)
{
    TestFixture::test_invert();
}
TYPED_TEST(stdlib_field, test_postfix_increment)
{
    TestFixture::test_postfix_increment();
}
TYPED_TEST(stdlib_field, test_prefix_increment)
{
    TestFixture::test_prefix_increment();
}
TYPED_TEST(stdlib_field, test_field_fibbonaci)
{
    TestFixture::test_field_fibbonaci();
}
TYPED_TEST(stdlib_field, test_field_pythagorean)
{
    TestFixture::test_field_pythagorean();
}
TYPED_TEST(stdlib_field, test_equality)
{
    TestFixture::test_equality();
}
TYPED_TEST(stdlib_field, test_equality_false)
{
    TestFixture::test_equality_false();
}
TYPED_TEST(stdlib_field, test_equality_with_constants)
{
    TestFixture::test_equality_with_constants();
}
TYPED_TEST(stdlib_field, test_larger_circuit)
{
    TestFixture::test_larger_circuit();
}
TYPED_TEST(stdlib_field, test_is_zero)
{
    TestFixture::test_is_zero();
}
TYPED_TEST(stdlib_field, test_fix_witness)
{
    TestFixture::test_fix_witness();
}
TYPED_TEST(stdlib_field, madd)
{
    TestFixture::madd();
}
TYPED_TEST(stdlib_field, two_bit_table)
{
    TestFixture::two_bit_table();
}
TYPED_TEST(stdlib_field, test_slice)
{
    TestFixture::test_slice();
}
TYPED_TEST(stdlib_field, test_slice_equal_msb_lsb)
{
    TestFixture::test_slice_equal_msb_lsb();
}
TYPED_TEST(stdlib_field, test_slice_random)
{
    TestFixture::test_slice_random();
}
TYPED_TEST(stdlib_field, three_bit_table)
{
    TestFixture::three_bit_table();
}
TYPED_TEST(stdlib_field, test_decompose_into_bits)
{
    TestFixture::test_decompose_into_bits();
}
TYPED_TEST(stdlib_field, test_assert_is_in_set)
{
    TestFixture::test_assert_is_in_set();
}
TYPED_TEST(stdlib_field, test_assert_is_in_set_fails)
{
    TestFixture::test_assert_is_in_set_fails();
}
TYPED_TEST(stdlib_field, test_pow)
{
    TestFixture::test_pow();
}
TYPED_TEST(stdlib_field, test_pow_exponent_out_of_range)
{
    TestFixture::test_pow_exponent_out_of_range();
}
TYPED_TEST(stdlib_field, test_copy_as_new_witness)
{
    TestFixture::test_copy_as_new_witness();
}
TYPED_TEST(stdlib_field, test_ranged_less_than)
{
    TestFixture::test_ranged_less_than();
}

TYPED_TEST(stdlib_field, test_origin_tag_consistency)
{
    TestFixture::test_origin_tag_consistency();
}

TYPED_TEST(stdlib_field, test_add_two)
{
    TestFixture::test_add_two();
}

TYPED_TEST(stdlib_field, test_add_mul_with_constants)
{
    TestFixture::test_add_mul_with_constants();
}

TYPED_TEST(stdlib_field, test_assert_is_zero)
{
    TestFixture::test_assert_is_zero();
}
TYPED_TEST(stdlib_field, test_accumulate)
{
    TestFixture::test_accumulate();
}

TYPED_TEST(stdlib_field, test_conditional_negate)
{
    TestFixture::test_conditional_negate();
}

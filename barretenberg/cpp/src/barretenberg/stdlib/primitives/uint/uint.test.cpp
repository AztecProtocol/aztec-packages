#include "uint.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include <functional>
#include <gtest/gtest.h>

using namespace bb;

namespace {
auto& engine = numeric::get_debug_randomness();
}

// TestType template for uint tests with Builder and NativeType parameters
template <typename _Builder, typename _NativeType> struct TestType {
  public:
    using Builder = _Builder;
    using NativeType = _NativeType;

    // Define the stdlib types based on the template parameters
    using uint_ct = stdlib::uint<Builder, NativeType>;
    using bool_ct = stdlib::bool_t<Builder>;
    using witness_ct = stdlib::witness_t<Builder>;
    using field_ct = stdlib::field_t<Builder>;
    using byte_array_ct = stdlib::byte_array<Builder>;
};

template <typename TestType> class stdlib_uint : public testing::Test {
  public:
    using TestFixture = stdlib_uint<TestType>;

  private:
    using Builder = typename TestType::Builder;
    using uint_ct = typename TestType::uint_ct;
    using bool_ct = typename TestType::bool_ct;
    using witness_ct = typename TestType::witness_ct;
    using byte_array_ct = typename TestType::byte_array_ct;
    using uint_native = typename TestType::NativeType;
    static constexpr size_t uint_native_width = sizeof(uint_native) * 8;
    static constexpr uint_native uint_native_max =
        static_cast<uint_native>((static_cast<uint256_t>(1) << uint_native_width) - 1);

    static inline std::vector<uint_native> special_values{
        0U,
        1U,
        2U,
        static_cast<uint_native>(static_cast<uint64_t>(1) << uint_native_width / 4),
        static_cast<uint_native>(static_cast<uint64_t>(1) << uint_native_width / 2),
        static_cast<uint_native>((static_cast<uint64_t>(1) << uint_native_width / 2) + 1),
        uint_native_max
    };

    static std::vector<uint_ct> get_special_uints(Builder* ctx)
    {
        std::vector<uint_ct> special_uints;
        for (size_t i = 0; i != special_values.size(); ++i) {
            special_uints.emplace_back(witness_ct(ctx, special_values[i]));
        };
        return special_uints;
    };

    static uint_native get_random() { return static_cast<uint_native>(engine.get_random_uint64()); };

    static std::vector<uint_native> get_several_random(size_t num)
    {
        std::vector<uint_native> result;
        for (size_t i = 0; i < num; ++i) {
            result.emplace_back(get_random());
        }
        return result;
    }

    /**
     * @brief Utility function for testing the uint_ct comparison operators
     *
     * @details Given a uint_ct a and a constant const_b, this  allows to create a
     * uint_ct b having a desired relation to a (either >. = or <).
     */
    static uint_native impose_comparison(uint_native const_a,
                                         uint_native const_b,
                                         uint_native a_val,
                                         bool force_equal = false,
                                         bool force_gt = false,
                                         bool force_lt = false)
    {
        uint_native b_val;
        if (force_equal) {
            b_val = a_val + const_a - const_b;
        } else if (force_lt) { // forcing b < a
            // if   a_val + const_a != const_b, then we set up b_val + const_b = a_val + const_a - 1
            // elif a_val + const_a  = const_b, then we set up b_val + const_b = a_val + const_a
            //   and we increment a by 1, leading to           a_val + const_a = b_val + const_b + 1.
            b_val = (a_val + const_a - const_b) ? a_val + const_a - const_b - 1 : const_a - const_b + (a_val++);
        } else if (force_gt) { // forcing b > a
            // set b_val + const_b = a_val + const_a + 1 unless that would wrap, in which case we instead
            // set b_val + const_b = a then decrease a by 1.
            b_val = (a_val + const_a - const_b) == uint_native_width ? const_a - const_b + (a_val--)
                                                                     : a_val + const_a - const_b + 1;
        } else {
            b_val = get_random();
        }
        return b_val;
    }

  public:
    static void test_weak_normalize()
    {
        auto run_test = [](bool constant_only, bool add_constant) {
            Builder builder = Builder();
            uint_ct a;
            uint_native a_val = get_random();
            uint_native const_a = get_random();
            uint_native expected;

            if (constant_only) {
                a = const_a;
                expected = const_a;
            } else {
                a = witness_ct(&builder, a_val);
                expected = a_val;
                if (add_constant) {
                    a += const_a;
                    expected += const_a;
                }
            };

            EXPECT_EQ(uint256_t(expected), a.get_value());
            bool verified = CircuitChecker::check(builder);
            EXPECT_EQ(verified, true);
        };

        run_test(true, false);
        run_test(false, false);
        run_test(false, true);
    }

    static void test_byte_array_conversion()
    {
        Builder builder = Builder();
        uint_ct a = witness_ct(&builder, 0x7f6f5f4f10111213);
        std::string longest_expected = { 0x7f, 0x6f, 0x5f, 0x4f, 0x10, 0x11, 0x12, 0x13 };
        // truncate, so we are running different tests for different choices of uint_native
        std::string expected = longest_expected.substr(longest_expected.length() - sizeof(uint_native));
        byte_array_ct arr(&builder);
        arr.write(static_cast<byte_array_ct>(a));

        EXPECT_EQ(arr.size(), sizeof(uint_native));
        EXPECT_EQ(arr.get_string(), expected);
    }

    static void test_input_output_consistency()
    {
        Builder builder = Builder();

        for (size_t i = 1; i < 1024; i *= 2) {
            uint_native a_expected = static_cast<uint_native>(i);
            uint_native b_expected = static_cast<uint_native>(i);

            uint_ct a = witness_ct(&builder, a_expected);
            uint_ct b = witness_ct(&builder, b_expected);

            byte_array_ct arr(&builder);

            arr.write(static_cast<byte_array_ct>(a));
            arr.write(static_cast<byte_array_ct>(b));

            EXPECT_EQ(arr.size(), 2 * sizeof(uint_native));

            uint_ct a_result(arr.slice(0, sizeof(uint_native)));
            uint_ct b_result(arr.slice(sizeof(uint_native)));

            EXPECT_EQ(a_result.get_value(), a_expected);
            EXPECT_EQ(b_result.get_value(), b_expected);
        }
    }

    static void test_create_from_wires()
    {
        Builder builder = Builder();

        uint_ct a = uint_ct(&builder,
                            std::vector<bool_ct>{
                                bool_ct(false),
                                bool_ct(false),
                                bool_ct(false),
                                bool_ct(false),
                                bool_ct(false),
                                bool_ct(false),
                                bool_ct(false),
                                witness_ct(&builder, true),
                            });

        EXPECT_EQ(static_cast<uint32_t>(a.get_value()), 128U);
    }

    /**
     * @brief Test addition of special values.
     * */
    static void test_add_special()
    {
        Builder builder = Builder();

        witness_ct first_input(&builder, 1U);
        witness_ct second_input(&builder, 0U);

        uint_ct a = first_input;
        uint_ct b = second_input;
        uint_ct c = a + b;
        /**
         * Fibbonacci sequence a(0) = 0, a(1), ..., a(2 + 32) = 5702887
         * a | 1 | 1 | 2 | 3 | 5 | ...
         * b | 0 | 1 | 1 | 2 | 3 | ...
         * c | 1 | 2 | 3 | 5 | 8 | ...
         */
        for (size_t i = 0; i < uint_native_width; ++i) {
            b = a;
            a = c;
            c = a + b;
        }

        auto special_uints = get_special_uints(&builder);
        for (size_t i = 0; i != special_values.size(); ++i) {
            uint_native x = special_values[i];
            uint_ct x_ct = special_uints[i];

            for (size_t j = i; j != special_values.size(); ++j) {
                uint_native y = special_values[j];
                uint_ct y_ct = special_uints[j];

                uint_native expected_value = x + y;
                uint_ct z_ct = x_ct + y_ct;
                uint_native value = static_cast<uint_native>(z_ct.get_value());

                EXPECT_EQ(value, expected_value);
            }
        };

        bool result = CircuitChecker::check(builder);
        EXPECT_EQ(result, true);
    }

    static void test_sub_special()
    {
        Builder builder = Builder();

        witness_ct a_val(&builder, static_cast<uint_native>(4));
        // witness_ct b_val(&builder, static_cast<uint_native>(5));
        uint_native const_a = 1;
        uint_native const_b = 2;
        uint_ct a = uint_ct(a_val) + const_a;
        // uint_ct b = uint_ct(b_val) + const_b;
        uint_ct b = const_b;
        uint_ct diff = a - b;

        auto special_uints = get_special_uints(&builder);
        for (size_t i = 0; i != special_values.size(); ++i) {
            uint_native x = special_values[i];
            uint_ct x_ct = special_uints[i];

            for (size_t j = i; j != special_values.size(); ++j) {
                uint_native y = special_values[j];
                uint_ct y_ct = special_uints[j];

                uint_native expected_value = x - y;
                uint_ct z_ct = x_ct - y_ct;
                uint_native value = static_cast<uint_native>(z_ct.get_value());

                EXPECT_EQ(value, expected_value);
            }
        };

        bool verified = CircuitChecker::check(builder);

        EXPECT_EQ(verified, true);
    }

    static void test_add_with_constants()
    {
        size_t n = 8;
        std::vector<uint_native> witnesses = get_several_random(3 * n);
        std::array<uint_native, 8> expected;
        for (size_t i = 2; i < n; ++i) {
            expected[0] = witnesses[3 * i];
            expected[1] = witnesses[3 * i + 1];
            expected[2] = witnesses[3 * i + 2];
            expected[3] = expected[0] + expected[1];
            expected[4] = expected[1] + expected[0];
            expected[5] = expected[1] + expected[2];
            expected[6] = expected[3] + expected[4];
            expected[7] = expected[4] + expected[5];
        }
        Builder builder = Builder();
        std::array<uint_ct, 8> result;
        for (size_t i = 2; i < n; ++i) {
            result[0] = uint_ct(&builder, witnesses[3 * i]);
            result[1] = (witness_ct(&builder, witnesses[3 * i + 1]));
            result[2] = (witness_ct(&builder, witnesses[3 * i + 2]));
            result[3] = result[0] + result[1];
            result[4] = result[1] + result[0];
            result[5] = result[1] + result[2];
            result[6] = result[3] + result[4];
            result[7] = result[4] + result[5];
        }

        for (size_t i = 0; i < n; ++i) {
            EXPECT_EQ(result[i].get_value(), expected[i]);
        }

        bool proof_valid = CircuitChecker::check(builder);
        EXPECT_EQ(proof_valid, true);
    }

    static void test_mul_special()
    {
        uint_native a_expected = 1U;
        uint_native b_expected = 2U;
        uint_native c_expected = a_expected + b_expected;
        for (size_t i = 0; i < 100; ++i) {
            b_expected = a_expected;
            a_expected = c_expected;
            c_expected = a_expected * b_expected;
        }

        Builder builder = Builder();

        witness_ct first_input(&builder, 1U);
        witness_ct second_input(&builder, 2U);

        uint_ct a = first_input;
        uint_ct b = second_input;
        uint_ct c = a + b;
        for (size_t i = 0; i < 100; ++i) {
            b = a;
            a = c;
            c = a * b;
        }
        uint_native c_result = static_cast<uint_native>(c.get_value());
        EXPECT_EQ(c_result, c_expected);

        auto special_uints = get_special_uints(&builder);
        for (size_t i = 0; i != special_values.size(); ++i) {
            uint_native x = special_values[i];
            uint_ct x_ct = special_uints[i];

            for (size_t j = i; j != special_values.size(); ++j) {
                uint_native y = special_values[j];
                uint_ct y_ct = special_uints[j];

                uint_native expected_value = x * y;
                uint_ct z_ct = x_ct * y_ct;
                uint_native value = static_cast<uint_native>(z_ct.get_value());

                EXPECT_EQ(value, expected_value);
            }
        };

        bool result = CircuitChecker::check(builder);
        EXPECT_EQ(result, true);
    }

    static void test_mul_big()
    {
        uint_native max = uint_native_max;

        Builder builder = Builder();
        uint_ct a = witness_ct(&builder, max);
        a = a + max;
        uint_ct b = a;
        uint_ct c = a * b;

        bool result = CircuitChecker::check(builder);
        EXPECT_EQ(result, true);
    }

    static void test_gt_special()
    {
        const auto run_test = [](bool lhs_constant, bool rhs_constant, int type = 0) {
            uint_native a_expected = static_cast<uint_native>(0x10000000a3b10422);
            uint_native b_expected;
            switch (type) {
            case 0: {
                b_expected = static_cast<uint_native>(0x20000000bac21343); // a < b
                break;
            }
            case 1: {
                b_expected = static_cast<uint_native>(0x0000000000002f12); // a > b
                break;
            }
            case 2: {
                b_expected = static_cast<uint_native>(0x10000000a3b10422); // a = b
                break;
            }
            default: {
                b_expected = static_cast<uint_native>(0x20000000bac21343); // a < b
            }
            }
            bool c_expected = a_expected > b_expected;

            Builder builder = Builder();

            uint_ct a;
            uint_ct b;
            if (lhs_constant) {
                a = uint_ct(nullptr, a_expected);
            } else {
                a = witness_ct(&builder, a_expected);
            }
            if (rhs_constant) {
                b = uint_ct(nullptr, b_expected);
            } else {
                b = witness_ct(&builder, b_expected);
            }
            // mix in some constant terms for good measure
            a *= uint_ct(&builder, 2);
            a += uint_ct(&builder, 1);
            b *= uint_ct(&builder, 2);
            b += uint_ct(&builder, 1);

            bool_ct c = a > b;

            bool c_result = static_cast<bool>(c.get_value());
            EXPECT_EQ(c_result, c_expected);

            bool result = CircuitChecker::check(builder);
            EXPECT_EQ(result, true);
        };

        run_test(false, false, 0);
        run_test(false, true, 0);
        run_test(true, false, 0);
        run_test(true, true, 0);
        run_test(false, false, 1);
        run_test(false, true, 1);
        run_test(true, false, 1);
        run_test(true, true, 1);
        run_test(false, false, 2);
        run_test(false, true, 2);
        run_test(true, false, 2);
        run_test(true, true, 2);
    }

    // BELOW HERE ARE TESTS FORMERLY MARKED AS TURBO

    /**
     * @brief Test addition of random uint's, trying all combinations of (constant, witness).
     */
    static void test_add()
    {
        Builder builder = Builder();

        const auto add_integers = [&builder](bool lhs_constant = false, bool rhs_constant = false) {
            uint_native a_val = get_random();
            uint_native b_val = get_random();
            uint_native expected = a_val + b_val;
            uint_ct a = lhs_constant ? uint_ct(&builder, a_val) : witness_ct(&builder, a_val);
            uint_ct b = rhs_constant ? uint_ct(&builder, b_val) : witness_ct(&builder, b_val);
            uint_ct c = a + b;
            c = c.normalize();

            uint_native result = uint_native(c.get_value());

            EXPECT_EQ(result, expected);
        };

        add_integers(false, false);
        add_integers(false, true);
        add_integers(true, false);
        add_integers(true, true);

        bool proof_result = CircuitChecker::check(builder);
        EXPECT_EQ(proof_result, true);
    }

    static void test_sub()
    {
        Builder builder = Builder();

        const auto sub_integers = [&builder](bool lhs_constant = false, bool rhs_constant = false) {
            uint_native a_val = get_random();
            uint_native b_val = get_random();
            uint_native const_shift_val = get_random();
            uint_native expected = a_val - (b_val + const_shift_val);
            uint_ct a = lhs_constant ? uint_ct(&builder, a_val) : witness_ct(&builder, a_val);
            uint_ct b = rhs_constant ? uint_ct(&builder, b_val) : witness_ct(&builder, b_val);
            uint_ct b_shift = uint_ct(&builder, const_shift_val);
            uint_ct c = b + b_shift;
            uint_ct d = a - c;
            d = d.normalize();

            uint_native result = uint_native(d.get_value());

            EXPECT_EQ(result, expected);
        };

        sub_integers(false, false);
        sub_integers(false, true);
        sub_integers(true, false);
        sub_integers(true, true);

        printf("builder gates = %zu\n", builder.get_estimated_num_finalized_gates());

        bool proof_result = CircuitChecker::check(builder);
        EXPECT_EQ(proof_result, true);
    }

    static void test_mul()
    {
        Builder builder = Builder();

        const auto mul_integers = [&builder](bool lhs_constant = false, bool rhs_constant = false) {
            uint_native a_val = get_random();
            uint_native b_val = get_random();
            uint_native const_a = get_random();
            uint_native const_b = get_random();
            uint_native expected =
                static_cast<uint_native>(a_val + const_a) * static_cast<uint_native>(b_val + const_b);
            uint_ct a = lhs_constant ? uint_ct(&builder, a_val) : witness_ct(&builder, a_val);
            uint_ct b = rhs_constant ? uint_ct(&builder, b_val) : witness_ct(&builder, b_val);
            uint_ct a_shift = uint_ct(&builder, const_a);
            uint_ct b_shift = uint_ct(&builder, const_b);
            uint_ct c = a + a_shift;
            uint_ct d = b + b_shift;
            uint_ct e = c * d;
            e = e.normalize();

            uint_native result = uint_native(e.get_value());

            EXPECT_EQ(result, expected);
        };

        mul_integers(false, false);
        mul_integers(false, true);
        mul_integers(true, false);
        mul_integers(true, true);

        printf("builder gates = %zu\n", builder.get_estimated_num_finalized_gates());

        bool proof_result = CircuitChecker::check(builder);
        EXPECT_EQ(proof_result, true);
    }

    static void test_divide()
    {
        Builder builder = Builder();

        const auto divide_integers = [&builder](bool lhs_constant = false,
                                                bool rhs_constant = false,
                                                bool dividend_is_divisor = false,
                                                bool dividend_zero = false,
                                                bool divisor_zero = false) {
            uint_native a_val = get_random();
            uint_native b_val = dividend_is_divisor ? a_val : get_random();
            uint_native const_a = dividend_zero ? 0 - a_val : get_random();
            uint_native const_b = divisor_zero ? 0 - b_val : (dividend_is_divisor ? const_a : get_random());
            uint_native expected =
                static_cast<uint_native>(a_val + const_a) / static_cast<uint_native>(b_val + const_b);
            uint_ct a = lhs_constant ? uint_ct(&builder, a_val) : witness_ct(&builder, a_val);
            uint_ct b = rhs_constant ? uint_ct(&builder, b_val) : witness_ct(&builder, b_val);
            uint_ct a_shift = uint_ct(&builder, const_a);
            uint_ct b_shift = uint_ct(&builder, const_b);
            uint_ct c = a + a_shift;
            uint_ct d = b + b_shift;
            uint_ct e = c / d;
            e = e.normalize();

            uint_native result = static_cast<uint_native>(e.get_value());

            EXPECT_EQ(result, expected);
        };

        divide_integers(false, false, false, false, false);
        divide_integers(false, false, false, false, false);
        divide_integers(false, false, false, false, false);
        divide_integers(false, false, false, false, false);
        divide_integers(false, false, false, false, false);

        divide_integers(false, true, false, false, false);
        divide_integers(true, false, false, false, false);
        divide_integers(true, true, false, false, false); // fails; 0 != 1

        divide_integers(false, false, true, false, false);
        divide_integers(false, true, true, false, false);
        divide_integers(true, false, true, false, false);
        divide_integers(true, true, true, false, false);

        divide_integers(false, false, false, true, false);
        divide_integers(false, true, false, true, false); // fails; 0 != 1
        divide_integers(true, false, false, true, false);
        divide_integers(true, true, false, true, false);

        printf("builder gates = %zu\n", builder.get_estimated_num_finalized_gates());

        bool proof_result = CircuitChecker::check(builder);
        EXPECT_EQ(proof_result, true);
    }

    static void test_modulo()
    {
        Builder builder = Builder();

        const auto mod_integers = [&builder](bool lhs_constant = false,
                                             bool rhs_constant = false,
                                             bool dividend_is_divisor = false,
                                             bool dividend_zero = false,
                                             bool divisor_zero = false) {
            uint_native a_val = get_random();
            uint_native b_val = dividend_is_divisor ? a_val : get_random();
            uint_native const_a = dividend_zero ? 0 - a_val : get_random();
            uint_native const_b = divisor_zero ? 0 - b_val : (dividend_is_divisor ? const_a : get_random());
            uint_native expected =
                static_cast<uint_native>(a_val + const_a) % static_cast<uint_native>(b_val + const_b);
            uint_ct a = lhs_constant ? uint_ct(&builder, a_val) : witness_ct(&builder, a_val);
            uint_ct b = rhs_constant ? uint_ct(&builder, b_val) : witness_ct(&builder, b_val);
            uint_ct a_shift = uint_ct(&builder, const_a);
            uint_ct b_shift = uint_ct(&builder, const_b);
            uint_ct c = a + a_shift;
            uint_ct d = b + b_shift;
            uint_ct e = c % d;
            e = e.normalize();

            uint_native result = uint_native(e.get_value());

            EXPECT_EQ(result, expected);
        };

        mod_integers(false, false, false, false, false);
        mod_integers(false, true, false, false, false);
        mod_integers(true, false, false, false, false);
        mod_integers(true, true, false, false, false);

        mod_integers(false, false, true, false, false);
        mod_integers(false, true, true, false, false);
        mod_integers(true, false, true, false, false);
        mod_integers(true, true, true, false, false);

        mod_integers(false, false, false, true, false);
        mod_integers(false, true, false, true, false);
        mod_integers(true, false, false, true, false);
        mod_integers(true, true, false, true, false);

        printf("builder gates = %zu\n", builder.get_estimated_num_finalized_gates());

        bool proof_result = CircuitChecker::check(builder);
        EXPECT_EQ(proof_result, true);
    }

    static void test_divide_by_zero_fails()
    {

        const auto divide_integers = [](bool lhs_constant = false,
                                        bool rhs_constant = false,
                                        bool dividend_is_divisor = false,
                                        bool dividend_zero = false,
                                        bool divisor_zero = false) {
            Builder builder = Builder();

            uint_native a_val = get_random();
            uint_native b_val = dividend_is_divisor ? a_val : get_random();
            uint_native const_a = dividend_zero ? 0 - a_val : get_random();
            uint_native const_b = divisor_zero ? 0 - b_val : (dividend_is_divisor ? const_a : get_random());
            uint_ct a = lhs_constant ? uint_ct(&builder, a_val) : witness_ct(&builder, a_val);
            uint_ct b = rhs_constant ? uint_ct(&builder, b_val) : witness_ct(&builder, b_val);
            uint_ct a_shift = uint_ct(&builder, const_a);
            uint_ct b_shift = uint_ct(&builder, const_b);
            uint_ct c = a + a_shift;
            uint_ct d = b + b_shift;

            // If both dividend and divisor are constants and divisor is zero, we expect an exception to be thrown.
            if (divisor_zero && (lhs_constant && rhs_constant)) {
                EXPECT_THROW_OR_ABORT(c / d, "divide by zero with constant dividend and divisor");
                return;
            }

            uint_ct e = c / d;
            e = e.normalize();

            bool proof_result = CircuitChecker::check(builder);
            EXPECT_EQ(proof_result, false);
        };

        divide_integers(/*lhs_constant=*/false,
                        /*rhs_constant=*/false,
                        /*dividend_is_divisor=*/false,
                        /*dividend_zero=*/false,
                        /*divisor_zero=*/true);
        divide_integers(/*lhs_constant=*/false,
                        /*rhs_constant=*/false,
                        /*dividend_is_divisor=*/false,
                        /*dividend_zero=*/true,
                        /*divisor_zero=*/true);
        divide_integers(/*lhs_constant=*/true,
                        /*rhs_constant=*/true,
                        /*dividend_is_divisor=*/false,
                        /*dividend_zero=*/false,
                        /*divisor_zero=*/true);
        divide_integers(/*lhs_constant=*/true,
                        /*rhs_constant=*/true,
                        /*dividend_is_divisor=*/false,
                        /*dividend_zero=*/true,
                        /*divisor_zero=*/true);
    }

    static void test_divide_special()
    {
        Builder builder = Builder();

        auto special_uints = get_special_uints(&builder);

        for (size_t i = 0; i != special_values.size(); ++i) {
            uint_native x = special_values[i];
            uint_ct x_ct = special_uints[i];

            for (size_t j = i; j != special_values.size(); ++j) {
                uint_native y = special_values[j];
                uint_ct y_ct = special_uints[j];

                // uint_native hits this error when trying to divide by zero:
                // Stop reason: signal SIGFPE: integer divide by zero
                uint_native expected_value;
                uint_ct z_ct;
                uint_native value;
                if (y != 0) {
                    expected_value = x / y;
                    z_ct = x_ct / y_ct;
                    value = static_cast<uint_native>(z_ct.get_value());
                    EXPECT_EQ(value, expected_value);
                }
            }
        };

        bool result = CircuitChecker::check(builder);
        EXPECT_EQ(result, true);
    }

    /**
     * @brief Make sure we prevent proving v / v = 0 by setting the divison remainder to be v.
     * TODO: This is lifted from the implementation. Should rewrite this test after introducing framework that
     separates
     * circuit construction from witness generation.

     */
    static void div_remainder_constraint()
    {
        Builder builder = Builder();

        uint_native val = get_random();

        uint_ct a = witness_ct(&builder, val);
        uint_ct b = witness_ct(&builder, val);

        const uint32_t dividend_idx = a.get_witness_index();
        const uint32_t divisor_idx = b.get_witness_index();

        const uint256_t divisor = b.get_value();

        const uint256_t q = 0;
        const uint256_t r = val;

        const uint32_t quotient_idx = builder.add_variable(q);
        const uint32_t remainder_idx = builder.add_variable(r);

        // In this example there are no additive constaints, so we just replace them by zero below.

        // constraint: qb + const_b q + 0 b - a + r - const_a == 0
        // i.e., a + const_a = q(b + const_b) + r
        builder.create_big_mul_gate({ .a = quotient_idx,  // q
                                      .b = divisor_idx,   // b
                                      .c = dividend_idx,  // a
                                      .d = remainder_idx, // r
                                      .mul_scaling = fr::one(),
                                      .a_scaling = b.get_additive_constant(),
                                      .b_scaling = fr::zero(),
                                      .c_scaling = fr::neg_one(),
                                      .d_scaling = fr::one(),
                                      .const_scaling = -a.get_additive_constant() });

        // set delta = (b + const_b - r)

        // constraint: b - r - delta + const_b == 0
        const uint256_t delta = divisor - r - 1;
        const uint32_t delta_idx = builder.add_variable(delta);

        builder.create_add_gate({
            .a = divisor_idx,   // b
            .b = remainder_idx, // r
            .c = delta_idx,     // d
            .a_scaling = fr::one(),
            .b_scaling = fr::neg_one(),
            .c_scaling = fr::neg_one(),
            .const_scaling = b.get_additive_constant(),
        });

        // validate delta is in the correct range
        stdlib::field_t<Builder>::from_witness_index(&builder, delta_idx)
            .create_range_constraint(uint_native_width,
                                     "delta range constraint fails in div_remainder_constraint test");

        // normalize witness quotient and remainder
        // minimal bit range for quotient: from 0 (in case a = b-1) to width (when b = 1).
        uint_ct quotient(&builder);
        builder.create_range_constraint(
            quotient_idx, uint_native_width, "quotient range constraint fails in div_remainder_constraint test");

        // constrain remainder to lie in [0, 2^width-1]
        uint_ct remainder(&builder);
        builder.create_range_constraint(
            remainder_idx, uint_native_width, "remainder range constraint fails in div_remainder_constraint test");

        bool result = CircuitChecker::check(builder);
        EXPECT_EQ(result, false);
    }

    static void test_gt()
    {
        Builder builder = Builder();
        const auto compare_integers =
            [&builder](bool force_equal = false, bool force_gt = false, bool force_lt = false) {
                uint_native const_a = get_random();
                uint_native const_b = get_random();
                uint_native a_val = get_random();
                uint_native b_val = impose_comparison(const_a, const_b, a_val, force_equal, force_gt, force_lt);

                bool expected = static_cast<uint_native>(b_val + const_b) > static_cast<uint_native>(a_val + const_a);
                uint_ct a = witness_ct(&builder, a_val);
                uint_ct b = witness_ct(&builder, b_val);
                uint_ct a_shift = uint_ct(&builder, const_a);
                uint_ct b_shift = uint_ct(&builder, const_b);
                uint_ct c = a + a_shift;
                uint_ct d = b + b_shift;
                bool_ct e = d > c;
                bool result = bool(e.get_value());

                EXPECT_EQ(result, expected);
            };

        compare_integers(false, false, false); // both are random
        compare_integers(false, false, false); //       ''
        compare_integers(false, false, false); //       ''
        compare_integers(false, false, false); //       ''
        compare_integers(false, false, true);  //      b < a
        compare_integers(false, true, false);  //      b > a
        compare_integers(true, false, false);  //      b = a
        compare_integers(false, true, false);  //      b > a
        compare_integers(true, false, false);  //      b = a

        printf("builder gates = %zu\n", builder.get_estimated_num_finalized_gates());

        bool proof_result = CircuitChecker::check(builder);
        EXPECT_EQ(proof_result, true);
    }

    static void test_lt()
    {
        Builder builder = Builder();

        const auto compare_integers =
            [&builder](bool force_equal = false, bool force_gt = false, bool force_lt = false) {
                uint_native const_a = get_random();
                uint_native const_b = get_random();
                uint_native a_val = get_random();
                uint_native b_val = impose_comparison(const_a, const_b, a_val, force_equal, force_gt, force_lt);

                bool expected = static_cast<uint_native>(b_val + const_b) < static_cast<uint_native>(a_val + const_a);
                uint_ct a = witness_ct(&builder, a_val);
                uint_ct b = witness_ct(&builder, b_val);
                uint_ct a_shift = uint_ct(&builder, const_a);
                uint_ct b_shift = uint_ct(&builder, const_b);
                uint_ct c = a + a_shift;
                uint_ct d = b + b_shift;
                bool_ct e = d < c;
                bool result = bool(e.get_value());

                EXPECT_EQ(result, expected);
            };

        compare_integers(false, false, false);
        compare_integers(false, false, false);
        compare_integers(false, false, false);
        compare_integers(false, false, false);
        compare_integers(false, false, true);
        compare_integers(false, true, false);
        compare_integers(true, false, false);
        compare_integers(false, false, true);
        compare_integers(false, true, false);
        compare_integers(true, false, false);

        printf("builder gates = %zu\n", builder.get_estimated_num_finalized_gates());

        bool proof_result = CircuitChecker::check(builder);
        EXPECT_EQ(proof_result, true);
    }

    static void test_gte()
    {
        Builder builder = Builder();

        const auto compare_integers =
            [&builder](bool force_equal = false, bool force_gt = false, bool force_lt = false) {
                uint_native const_a = get_random();
                uint_native const_b = get_random();
                uint_native a_val = get_random();
                uint_native b_val = impose_comparison(const_a, const_b, a_val, force_equal, force_gt, force_lt);

                bool expected = static_cast<uint_native>(b_val + const_b) >= static_cast<uint_native>(a_val + const_a);
                uint_ct a = witness_ct(&builder, a_val);
                uint_ct b = witness_ct(&builder, b_val);
                uint_ct a_shift = uint_ct(&builder, const_a);
                uint_ct b_shift = uint_ct(&builder, const_b);
                uint_ct c = a + a_shift;
                uint_ct d = b + b_shift;
                bool_ct e = d >= c;
                bool result = bool(e.get_value());
                EXPECT_EQ(result, expected);
            };

        compare_integers(false, false, false);
        compare_integers(false, false, false);
        compare_integers(false, false, false);
        compare_integers(false, false, false);
        compare_integers(false, false, true);
        compare_integers(false, true, false);
        compare_integers(true, false, false);
        compare_integers(false, false, true);
        compare_integers(false, true, false);
        compare_integers(true, false, false);

        printf("builder gates = %zu\n", builder.get_estimated_num_finalized_gates());

        bool proof_result = CircuitChecker::check(builder);
        EXPECT_EQ(proof_result, true);
    }

    static void test_lte()
    {
        Builder builder = Builder();

        const auto compare_integers =
            [&builder](bool force_equal = false, bool force_gt = false, bool force_lt = false) {
                uint_native const_a = get_random();
                uint_native const_b = get_random();
                uint_native a_val = get_random();
                uint_native b_val = impose_comparison(const_a, const_b, a_val, force_equal, force_gt, force_lt);

                bool expected = static_cast<uint_native>(b_val + const_b) <= static_cast<uint_native>(a_val + const_a);
                uint_ct a = witness_ct(&builder, a_val);
                uint_ct b = witness_ct(&builder, b_val);
                uint_ct a_shift = uint_ct(&builder, const_a);
                uint_ct b_shift = uint_ct(&builder, const_b);
                uint_ct c = a + a_shift;
                uint_ct d = b + b_shift;
                bool_ct e = d <= c;
                bool result = bool(e.get_value());

                EXPECT_EQ(result, expected);
            };

        compare_integers(false, false, false);
        compare_integers(false, false, false);
        compare_integers(false, false, false);
        compare_integers(false, false, false);
        compare_integers(false, false, true);
        compare_integers(false, true, false);
        compare_integers(true, false, false);
        compare_integers(false, false, true);
        compare_integers(false, true, false);
        compare_integers(true, false, false);

        printf("builder gates = %zu\n", builder.get_estimated_num_finalized_gates());

        bool proof_result = CircuitChecker::check(builder);
        EXPECT_EQ(proof_result, true);
    }

    static void test_equality_operator()
    {
        Builder builder = Builder();

        const auto compare_integers =
            [&builder](bool force_equal = false, bool force_gt = false, bool force_lt = false) {
                uint_native const_a = get_random();
                uint_native const_b = get_random();
                uint_native a_val = get_random();
                uint_native b_val = impose_comparison(const_a, const_b, a_val, force_equal, force_gt, force_lt);

                bool expected = static_cast<uint_native>(b_val + const_b) == static_cast<uint_native>(a_val + const_a);
                uint_ct a = witness_ct(&builder, a_val);
                uint_ct b = witness_ct(&builder, b_val);
                uint_ct a_shift = uint_ct(&builder, const_a);
                uint_ct b_shift = uint_ct(&builder, const_b);
                uint_ct c = a + a_shift;
                uint_ct d = b + b_shift;
                bool_ct e = d == c;
                bool result = bool(e.get_value());

                EXPECT_EQ(result, expected);
            };

        compare_integers(false, false, false);
        compare_integers(false, false, false);
        compare_integers(false, false, false);
        compare_integers(false, false, false);
        compare_integers(false, false, true);
        compare_integers(false, true, false);
        compare_integers(true, false, false);
        compare_integers(false, false, true);
        compare_integers(false, true, false);
        compare_integers(true, false, false);

        printf("builder gates = %zu\n", builder.get_estimated_num_finalized_gates());

        bool proof_result = CircuitChecker::check(builder);
        EXPECT_EQ(proof_result, true);
    }

    static void test_not_equality_operator()
    {
        Builder builder = Builder();

        const auto compare_integers =
            [&builder](bool force_equal = false, bool force_gt = false, bool force_lt = false) {
                uint_native const_a = get_random();
                uint_native const_b = get_random();
                uint_native a_val = get_random();
                uint_native b_val = impose_comparison(const_a, const_b, a_val, force_equal, force_gt, force_lt);

                bool expected = static_cast<uint_native>(b_val + const_b) != static_cast<uint_native>(a_val + const_a);
                uint_ct a = witness_ct(&builder, a_val);
                uint_ct b = witness_ct(&builder, b_val);
                uint_ct a_shift = uint_ct(&builder, const_a);
                uint_ct b_shift = uint_ct(&builder, const_b);
                uint_ct c = a + a_shift;
                uint_ct d = b + b_shift;
                bool_ct e = d != c;
                bool result = bool(e.get_value());

                EXPECT_EQ(result, expected);
            };

        compare_integers(false, false, false);
        compare_integers(false, false, false);
        compare_integers(false, false, false);
        compare_integers(false, false, false);
        compare_integers(false, false, true);
        compare_integers(false, true, false);
        compare_integers(true, false, false);
        compare_integers(false, false, true);
        compare_integers(false, true, false);
        compare_integers(true, false, false);

        printf("builder gates = %zu\n", builder.get_estimated_num_finalized_gates());

        bool proof_result = CircuitChecker::check(builder);
        EXPECT_EQ(proof_result, true);
    }

    static void test_logical_not()
    {
        Builder builder = Builder();

        const auto not_integer = [&builder](bool force_zero) {
            uint_native const_a = get_random();
            uint_native a_val = force_zero ? 0 - const_a : get_random();
            bool expected = !static_cast<uint_native>(const_a + a_val);
            uint_ct a = witness_ct(&builder, a_val);
            uint_ct a_shift = uint_ct(&builder, const_a);
            uint_ct c = a + a_shift;
            bool_ct e = !c;
            bool result = bool(e.get_value());

            EXPECT_EQ(result, expected);
        };

        not_integer(true);
        not_integer(true);
        not_integer(false);
        not_integer(false);

        printf("builder gates = %zu\n", builder.get_estimated_num_finalized_gates());

        bool proof_result = CircuitChecker::check(builder);
        EXPECT_EQ(proof_result, true);
    }

    static void test_right_shift()
    {
        Builder builder = Builder();

        const auto shift_integer = [&builder](const bool is_constant, const uint_native shift) {
            uint_native const_a = get_random();
            uint_native a_val = get_random();
            uint_native expected = static_cast<uint_native>(a_val + const_a) >> shift;
            uint_ct a = is_constant ? uint_ct(&builder, a_val) : witness_ct(&builder, a_val);
            uint_ct a_shift = uint_ct(&builder, const_a);
            uint_ct c = a + a_shift;
            uint_ct d = c >> shift;
            uint_native result = uint_native(d.get_value());

            EXPECT_EQ(result, expected);
        };

        for (uint_native i = 0; i < uint_native_width; ++i) {
            shift_integer(false, i);
            shift_integer(true, i);
        }

        printf("builder gates = %zu\n", builder.get_estimated_num_finalized_gates());

        bool proof_result = CircuitChecker::check(builder);
        EXPECT_EQ(proof_result, true);
    }

    static void test_left_shift()
    {
        Builder builder = Builder();

        const auto shift_integer = [&builder](const bool is_constant, const uint_native shift) {
            uint_native const_a = get_random();
            uint_native a_val = get_random();
            uint_native expected = static_cast<uint_native>((a_val + const_a) << shift);
            uint_ct a = is_constant ? uint_ct(&builder, a_val) : witness_ct(&builder, a_val);
            uint_ct a_shift = uint_ct(&builder, const_a);
            uint_ct c = a + a_shift;
            uint_ct d = c << shift;
            uint_native result = uint_native(d.get_value());

            EXPECT_EQ(result, expected);
        };

        for (uint_native i = 0; i < uint_native_width; ++i) {
            shift_integer(true, i);
            shift_integer(false, i);
        }

        printf("builder gates = %zu\n", builder.get_estimated_num_finalized_gates());

        bool proof_result = CircuitChecker::check(builder);
        EXPECT_EQ(proof_result, true);
    }

    static void test_ror()
    {
        Builder builder = Builder();

        const auto ror_integer = [&builder](const bool is_constant, const uint_native rotation) {
            const auto ror = [](const uint_native in, const uint_native rval) {
                return rval ? (in >> rval) | (in << (uint_native_width - rval)) : in;
            };

            uint_native const_a = get_random();
            uint_native a_val = get_random();
            uint_native expected = static_cast<uint_native>(ror(static_cast<uint_native>(const_a + a_val), rotation));
            uint_ct a = is_constant ? uint_ct(&builder, a_val) : witness_ct(&builder, a_val);
            uint_ct a_shift = uint_ct(&builder, const_a);
            uint_ct c = a + a_shift;
            uint_ct d = c.ror(rotation);
            uint_native result = uint_native(d.get_value());

            EXPECT_EQ(result, expected);
        };

        for (uint_native i = 0; i < uint_native_width; ++i) {
            ror_integer(true, i);
            ror_integer(false, i);
        }

        printf("builder gates = %zu\n", builder.get_estimated_num_finalized_gates());

        bool proof_result = CircuitChecker::check(builder);
        EXPECT_EQ(proof_result, true);
    }

    static void test_rol()
    {
        Builder builder = Builder();

        const auto rol_integer = [&builder](const bool is_constant, const uint_native rotation) {
            const auto rol = [](const uint_native in, const uint_native rval) {
                return rval ? (in << rval) | (in >> (uint_native_width - rval)) : in;
            };

            uint_native const_a = get_random();
            uint_native a_val = get_random();
            uint_native expected = static_cast<uint_native>(rol(static_cast<uint_native>(const_a + a_val), rotation));
            uint_ct a = is_constant ? uint_ct(&builder, a_val) : witness_ct(&builder, a_val);
            uint_ct a_shift = uint_ct(&builder, const_a);
            uint_ct c = a + a_shift;
            uint_ct d = c.rol(rotation);
            uint_native result = uint_native(d.get_value());

            EXPECT_EQ(result, expected);
        };

        for (uint_native i = 0; i < uint_native_width; ++i) {
            rol_integer(true, i);
            rol_integer(false, i);
        }

        printf("builder gates = %zu\n", builder.get_estimated_num_finalized_gates());

        bool proof_result = CircuitChecker::check(builder);
        EXPECT_EQ(proof_result, true);
    }
};

// Define the test types for all combinations
using CircuitTypes = testing::Types<TestType<bb::UltraCircuitBuilder, uint8_t>,
                                    TestType<bb::UltraCircuitBuilder, uint16_t>,
                                    TestType<bb::UltraCircuitBuilder, uint32_t>,
                                    TestType<bb::UltraCircuitBuilder, uint64_t>>;

TYPED_TEST_SUITE(stdlib_uint, CircuitTypes);

TYPED_TEST(stdlib_uint, test_weak_normalize)
{
    TestFixture::test_weak_normalize();
}
TYPED_TEST(stdlib_uint, test_byte_array_conversion)
{
    TestFixture::test_byte_array_conversion();
}
TYPED_TEST(stdlib_uint, test_input_output_consistency)
{
    TestFixture::test_input_output_consistency();
}
TYPED_TEST(stdlib_uint, test_create_from_wires)
{
    TestFixture::test_create_from_wires();
}
TYPED_TEST(stdlib_uint, test_add_special)
{
    TestFixture::test_add_special();
}
TYPED_TEST(stdlib_uint, test_sub_special)
{
    TestFixture::test_sub_special();
}
TYPED_TEST(stdlib_uint, test_add_with_constants)
{
    TestFixture::test_add_with_constants();
}
TYPED_TEST(stdlib_uint, test_mul_special)
{
    TestFixture::test_mul_special();
}
TYPED_TEST(stdlib_uint, test_mul_big)
{
    TestFixture::test_mul_big();
}
TYPED_TEST(stdlib_uint, test_gt_special)
{
    TestFixture::test_gt_special();
}
// BELOW HERE ARE TESTS FORMERLY MARKED AS TURBO
TYPED_TEST(stdlib_uint, test_add)
{
    TestFixture::test_add();
}
TYPED_TEST(stdlib_uint, test_sub)
{
    TestFixture::test_sub();
}
TYPED_TEST(stdlib_uint, test_mul)
{
    TestFixture::test_mul();
}
TYPED_TEST(stdlib_uint, test_divide)
{
    TestFixture::test_divide();
}
TYPED_TEST(stdlib_uint, test_modulo)
{
    TestFixture::test_modulo();
}
TYPED_TEST(stdlib_uint, test_divide_by_zero_fails)
{
    TestFixture::test_divide_by_zero_fails();
}
TYPED_TEST(stdlib_uint, test_divide_special)
{
    TestFixture::test_divide_special();
}
TYPED_TEST(stdlib_uint, div_remainder_constraint)
{
    TestFixture::div_remainder_constraint();
}
TYPED_TEST(stdlib_uint, test_gt)
{
    TestFixture::test_gt();
}
TYPED_TEST(stdlib_uint, test_lt)
{
    TestFixture::test_lt();
}
TYPED_TEST(stdlib_uint, test_gte)
{
    TestFixture::test_gte();
}
TYPED_TEST(stdlib_uint, test_lte)
{
    TestFixture::test_lte();
}
TYPED_TEST(stdlib_uint, test_equality_operator)
{
    TestFixture::test_equality_operator();
}
TYPED_TEST(stdlib_uint, test_not_equality_operator)
{
    TestFixture::test_not_equality_operator();
}
TYPED_TEST(stdlib_uint, test_logical_not)
{
    TestFixture::test_logical_not();
}
TYPED_TEST(stdlib_uint, test_right_shift)
{
    TestFixture::test_right_shift();
}
TYPED_TEST(stdlib_uint, test_left_shift)
{
    TestFixture::test_left_shift();
}
TYPED_TEST(stdlib_uint, test_ror)
{
    TestFixture::test_ror();
}
TYPED_TEST(stdlib_uint, test_rol)
{
    TestFixture::test_rol();
}

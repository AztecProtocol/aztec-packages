#include "barretenberg/common/assert.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/numeric/random/engine.hpp"

#include "barretenberg/ecc/curves/bn254/fq.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"

#include "../bool/bool.hpp"
#include "../byte_array/byte_array.hpp"
#include "../field/field.hpp"
#include "./bigfield.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/numeric/uintx/uintx.hpp"
#include "barretenberg/stdlib/primitives/bigfield/constants.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders_fwd.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib/primitives/curves/secp256k1.hpp"
#include "barretenberg/stdlib/primitives/curves/secp256r1.hpp"
#include "barretenberg/transcript/origin_tag.hpp"
#include <array>
#include <cstdint>
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
template <typename BigField> class stdlib_bigfield_edge_cases : public testing::Test {

    using Builder = builder_t<BigField>;                            // extract builder from BigField
    using fr_ct = typename bb::stdlib::bn254<Builder>::ScalarField; // native circuit field
    using fq_native = bb::field<params_t<BigField>>;                // native bigfield type
    using fq_ct = BigField;                                         // non-native field (circuit type)
    using witness_ct = stdlib::witness_t<Builder>;                  // circuit witness type
    using bool_ct = stdlib::bool_t<Builder>;                        // circuit boolean type
    using byte_array_ct = stdlib::byte_array<Builder>;              // circuit byte array type

  public:
    // Declare edge case values
    constexpr static std::array<uint512_t, 5> edge_case_values = {
        uint512_t(uint256_t(0)),                  // 0
        uint512_t(uint256_t(1)),                  // 1
        uint512_t(fr::modulus) - 1,               // n - 1
        uint512_t(fr::modulus),                   // n
        uint512_t(fq_ct::modulus) - uint512_t(1), // p - 1
    };

    inline static const std::array<uint512_t, 10> values_larger_than_bigfield = {
        uint512_t(fq_ct::modulus),                                             // p
        uint512_t(fq_ct::modulus) + uint512_t(1),                              // p + 1
        uint512_t(fq_ct::modulus) + uint512_t(fr::modulus),                    // p + n
        (uint512_t(1) << 256) - 1,                                             // 2^256 - 1
        (uint512_t(1) << 256),                                                 // 2^256
        (uint512_t(1) << 256) + 1,                                             // 2^256 + 1
        uint512_t(fq_ct::get_maximum_unreduced_value()) - 1,                   // max unreduced - 1
        uint512_t(fq_ct::get_maximum_unreduced_value()),                       // max unreduced
        uint512_t(fq_ct::get_maximum_unreduced_value()) + 1,                   // max unreduced + 1
        (uint512_t(1) << (stdlib::NUM_LIMB_BITS_IN_FIELD_SIMULATION * 4)) - 1, // 2^272 - 1
    };

    constexpr static uint512_t reduction_upper_bound = uint512_t(1) << (fq_ct::modulus.get_msb() + 1); // p < 2^s

    static void test_larger_than_bigfield_allowed()
    {
        auto builder = Builder();
        for (const auto& value : values_larger_than_bigfield) {
            fq_ct val = fq_ct::create_from_u512_as_witness(&builder, value, true);
            EXPECT_EQ(val.get_value() >= fq_ct::modulus, true);
        }
        auto result_check = CircuitChecker::check(builder);
        EXPECT_EQ(result_check, true);
    }

    static void test_reduction_check_works()
    {
        // Create four limbs, first three with 68 bits each and the last with 61 bits
        auto builder = Builder();
        const uint256_t valid_mask = (uint256_t(1) << fq_ct::NUM_LIMB_BITS) - 1;
        const uint256_t limb_0_native = uint256_t(fr::random_element()) & valid_mask;
        fr_ct limb_0 = witness_ct(&builder, limb_0_native);
        const uint256_t limb_1_native = uint256_t(fr::random_element()) & valid_mask;
        fr_ct limb_1 = witness_ct(&builder, limb_1_native);
        const uint256_t limb_2_native = uint256_t(fr::random_element()) & valid_mask;
        fr_ct limb_2 = witness_ct(&builder, limb_2_native);

        // last limb has only 61 bits
        const uint256_t other_mask = (uint256_t(1) << 61) - 1;
        uint256_t limb_3_native = uint256_t(fr::random_element()) & other_mask;
        limb_3_native |= (uint256_t(1) << 60); // set 61st bit to 1 to ensure the combined value is > 2^265
        fr_ct limb_3 = witness_ct(&builder, limb_3_native);

        // Create a bigfield from them (without range constraints on limbs)
        fq_ct combined_a = fq_ct::unsafe_construct_from_limbs(limb_0, limb_1, limb_2, limb_3, true);
        combined_a.binary_basis_limbs[3].maximum_value = other_mask;

        // Check that individual limbs are ≤ than maximum unreduced limb value
        const bool limbs_less_than_max = (limb_0_native <= fq_ct::get_maximum_unreduced_limb_value()) &&
                                         (limb_1_native <= fq_ct::get_maximum_unreduced_limb_value()) &&
                                         (limb_2_native <= fq_ct::get_maximum_unreduced_limb_value()) &&
                                         (limb_3_native <= fq_ct::get_maximum_unreduced_limb_value());
        EXPECT_EQ(limbs_less_than_max, true);

        // Check that the combined max value is greater than the maximum unreduced bigfield value
        EXPECT_GT(combined_a.get_maximum_value(),      // 2^68 * 2^68 * 2^68 * 2^61 = 2^265
                  fq_ct::get_maximum_unreduced_value() // sqrt(2^272 * |Fr|) ≈ (2^(263) - 1) or (2^(264) - 1)
        );

        // Squaring op must perform self-reduction
        EXPECT_EQ(combined_a.get_value() > fq_ct::modulus, true); // unreduced value > modulus
        combined_a.sqr();

        // Check that original combined value is now reduced
        EXPECT_EQ(combined_a.get_value() < reduction_upper_bound, true); // reduced value < 2^s
        EXPECT_EQ(combined_a.get_maximum_value() <= fq_ct::get_maximum_unreduced_value(), true);

        bool result = CircuitChecker::check(builder);
        EXPECT_EQ(result, true);
    }

    static void test_reduction_works_on_limb_overflow()
    {
        // Create four limbs, first three limbs with 68 bits and last one with 50 bits
        auto builder = Builder();
        const uint256_t valid_mask = (uint256_t(1) << fq_ct::NUM_LIMB_BITS) - 1;
        const uint256_t limb_0_native = uint256_t(fr::random_element()) & valid_mask;
        fr_ct limb_0 = witness_ct(&builder, limb_0_native);
        const uint256_t limb_1_native = uint256_t(fr::random_element()) & valid_mask;
        fr_ct limb_1 = witness_ct(&builder, limb_1_native);
        const uint256_t limb_2_native = uint256_t(fr::random_element()) & valid_mask;
        fr_ct limb_2 = witness_ct(&builder, limb_2_native);

        // last limb has 50 bits
        const uint256_t other_mask = (uint256_t(1) << 50) - 1;
        const uint256_t limb_3_native = uint256_t(fr::random_element()) & other_mask;
        fr_ct limb_3 = witness_ct(&builder, limb_3_native);

        // Create a bigfield from them (without range constraints on limbs)
        // The max values are set to defaults max values.
        fq_ct combined_a = fq_ct::unsafe_construct_from_limbs(limb_0, limb_1, limb_2, limb_3);

        // Increase the max value of the first limb to cause overflow, this should trigger reduction
        combined_a.binary_basis_limbs[0].maximum_value =
            (uint256_t(1) << fq_ct::MAX_UNREDUCED_LIMB_BITS) + 1000; // > 2^78

        // Check that the combined max value is less than the maximum unreduced bigfield value
        EXPECT_EQ(combined_a.get_maximum_value() <= fq_ct::get_maximum_unreduced_value(), true);

        // Perform a squaring which should trigger reduction
        combined_a.sqr();

        // Check that the original combined value is now reduced
        EXPECT_EQ(combined_a.get_value() < reduction_upper_bound, true);
        EXPECT_EQ(combined_a.get_maximum_value() <= fq_ct::get_maximum_unreduced_value(), true);

        // Check the circuit is valid
        bool result = CircuitChecker::check(builder);
        EXPECT_EQ(result, true);
    }

    static void test_maximum_value_tracking_during_addition()
    {
        // Create four limbs, first three limbs with 68 bits and last one with 40 bits
        auto builder = Builder();

        const uint256_t valid_mask = (uint256_t(1) << fq_ct::NUM_LIMB_BITS) - 1;
        const uint256_t limb_0_native = uint256_t(fr::random_element()) & valid_mask;
        fr_ct limb_0 = witness_ct(&builder, limb_0_native);
        const uint256_t limb_1_native = uint256_t(fr::random_element()) & valid_mask;
        fr_ct limb_1 = witness_ct(&builder, limb_1_native);
        const uint256_t limb_2_native = uint256_t(fr::random_element()) & valid_mask;
        fr_ct limb_2 = witness_ct(&builder, limb_2_native);

        // Last limb has 40 bits.
        // We want the last limb to be small enough such that even after 10 doublings
        // the overall max value is still less than the max allowed unreduced value.
        const uint256_t other_mask = (uint256_t(1) << 40) - 1;
        const uint256_t limb_3_native = uint256_t(fr::random_element()) & other_mask;
        fr_ct limb_3 = witness_ct(&builder, limb_3_native);

        // Create a bigfield from them (without range constraints on limbs)
        // The max values are set to defaults values of (2^68 - 1) for first three limbs and (2^40 - 1) for last limb
        fq_ct combined_a = fq_ct::unsafe_construct_from_limbs(limb_0, limb_1, limb_2, limb_3);
        combined_a.binary_basis_limbs[3].maximum_value = other_mask;

        // Add this value to itself before any reduction is triggered
        // 11 doublings should be possible before exceeding the max unreduced value
        for (size_t i = 0; i < 11; ++i) {
            const uint64_t msb_index_before = combined_a.binary_basis_limbs[0].maximum_value.get_msb();
            combined_a = combined_a + combined_a;
            const uint64_t msb_index_after = combined_a.binary_basis_limbs[0].maximum_value.get_msb();

            // should increase max value by 1 bit for each doubling
            EXPECT_EQ(msb_index_after, msb_index_before + 1ULL);
        }
        EXPECT_EQ(combined_a.binary_basis_limbs[0].maximum_value.get_msb(), fq_ct::MAX_UNREDUCED_LIMB_BITS);
        EXPECT_EQ(combined_a.binary_basis_limbs[0].maximum_value > fq_ct::get_maximum_unreduced_limb_value(), true);

        // If we perform one more doubling, reduction should be triggered
        combined_a = combined_a + combined_a;
        EXPECT_EQ(combined_a.binary_basis_limbs[0].maximum_value.get_msb(), fq_ct::NUM_LIMB_BITS);

        // Check the circuit
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
        return std::make_pair(elt_native, elt_ct);
    }

    static void check_invariants(const fq_ct& field_element, const std::string& operation_name)
    {
        // Invariant 1: Limb maximum values should be >= actual witness values
        for (size_t i = 0; i < 4; ++i) {
            uint256_t witness_value = uint256_t(field_element.binary_basis_limbs[i].element.get_value());
            uint256_t max_value = field_element.binary_basis_limbs[i].maximum_value;

            EXPECT_GE(max_value, witness_value)
                << "invariant violation in " << operation_name << ":\n  limb[" << i << "] max_value:\n  " << max_value
                << " < \n  witness_value\n  " << witness_value;
        }

        // Invariant 2: Prime limb should be consistent with binary limbs
        uint256_t computed_prime = field_element.binary_basis_limbs[0].element.get_value();
        computed_prime += field_element.binary_basis_limbs[1].element.get_value() * fq_ct::shift_1;
        computed_prime += field_element.binary_basis_limbs[2].element.get_value() * fq_ct::shift_2;
        computed_prime += field_element.binary_basis_limbs[3].element.get_value() * fq_ct::shift_3;
        uint256_t actual_prime = field_element.prime_basis_limb.get_value();

        EXPECT_EQ(fr(computed_prime), fr(actual_prime))
            << "invariant violation in " << operation_name << ":\n  computed prime:\n  " << fr(computed_prime)
            << " != \n  actual prime:\n  " << fr(actual_prime);

        // Invariant 3: Maximum values should have fewer bits than PROHIBITED_LIMB_BITS
        for (size_t i = 0; i < 4; ++i) {
            uint64_t max_bits = field_element.binary_basis_limbs[i].maximum_value.get_msb() + 1;

            EXPECT_LT(max_bits, fq_ct::PROHIBITED_LIMB_BITS)
                << "invariant violation in " << operation_name << ":\n  limb[" << i << "] has " << max_bits
                << " bits, which exceeds PROHIBITED_LIMB_BITS (" << fq_ct::PROHIBITED_LIMB_BITS << ")";
        }
    }

    // Generic test for binary operations (add, sub, mul) with native checks and invariant checks
    template <typename BinaryOp, typename NativeOp>
    static void test_invariants_during_binary_operation(BinaryOp binary_op,
                                                        NativeOp native_op,
                                                        const std::string& operation_name,
                                                        const bool skip_zero = false)
    {
        // Create two random bigfield elements with their native counterparts
        auto builder = Builder();
        auto [a_native, a_ct] = get_random_witness(&builder, false);
        auto [b_native, b_ct] = get_random_witness(&builder, false);

        // Perform the binary operation on both circuit and native values
        fq_ct c_ct = binary_op(a_ct, b_ct);
        fq_native c_native = native_op(a_native, b_native);

        check_invariants(c_ct, operation_name + " (initial)");

        // Test operation with edge case values
        for (const auto& edge_value : edge_case_values) {
            const bool is_fq_value_zero = (fq_native(edge_value) == fq_native(0));
            const bool is_fr_value_zero = (fr(uint256_t(fq_native(edge_value))) == fr(0));
            if (skip_zero && (is_fq_value_zero || is_fr_value_zero)) {
                // if denominator is p, native division will fail (because we check a mod p != 0 for denominator a)
                // if denominator is n (mod p), circuit division will fail (because we check a mod n != 0 for
                // denominator a)
                continue;
            }
            fq_ct edge_case = fq_ct::create_from_u512_as_witness(&builder, edge_value, true);
            fq_native edge_native = fq_native(edge_value);

            fq_ct result_ct = binary_op(c_ct, edge_case);
            fq_native result_native = native_op(c_native, edge_native);

            check_invariants(result_ct, operation_name + " with edge case");
            c_ct = result_ct; // Chain operations
            c_native = result_native;
        }

        // Test operation with values larger than bigfield
        for (const auto& large_value : values_larger_than_bigfield) {
            const bool is_fq_value_zero = (fq_native(large_value) == fq_native(0));
            const bool is_fr_value_zero = (fr(uint256_t(fq_native(large_value))) == fr(0));
            if (skip_zero && (is_fq_value_zero || is_fr_value_zero)) {
                // if denominator is p, native division will fail (because we check a mod p != 0 for denominator a)
                // if denominator is n (mod p), circuit division will fail (because we check a mod n != 0 for
                // denominator a)
                continue;
            }
            fq_ct large_case = fq_ct::create_from_u512_as_witness(&builder, large_value, true);
            fq_native large_native = fq_native(large_value);

            fq_ct result_ct = binary_op(c_ct, large_case);
            fq_native result_native = native_op(c_native, large_native);

            check_invariants(result_ct, operation_name + " with large value");
            c_ct = result_ct; // Chain operations
            c_native = result_native;
        }

        // Check invariants on the final result
        check_invariants(c_ct, operation_name + " (final)");

        // Final native check
        c_ct.self_reduce();
        EXPECT_EQ(c_ct.get_value(), uint512_t(c_native)) << "native check failed for " << operation_name << " (final)";

        // Check the circuit is valid
        bool result = CircuitChecker::check(builder);
        EXPECT_EQ(result, true);
    }

#define INVARIANT_BINARY_OP_TEST(op_name, op_symbol, skip_zero)                                                        \
    static void test_invariants_during_##op_name()                                                                     \
    {                                                                                                                  \
        test_invariants_during_binary_operation([](const fq_ct& a, const fq_ct& b) { return a op_symbol b; },          \
                                                [](const fq_native& a, const fq_native& b) { return a op_symbol b; },  \
                                                #op_name,                                                              \
                                                skip_zero);                                                            \
    }

    // Generate invariant test functions for all binary operations
    INVARIANT_BINARY_OP_TEST(addition, +, false)
    INVARIANT_BINARY_OP_TEST(subtraction, -, false)
    INVARIANT_BINARY_OP_TEST(multiplication, *, false)
    INVARIANT_BINARY_OP_TEST(division, /, true) // skip zero for division

    static void test_invariants_during_squaring()
    {
        test_invariants_during_binary_operation([](const fq_ct& a, const fq_ct&) { return a.sqr(); },
                                                [](const fq_native& a, const fq_native&) { return a.sqr(); },
                                                "squaring",
                                                false);
    }

    static void test_invariants_during_negation()
    {
        test_invariants_during_binary_operation([](const fq_ct& a, const fq_ct&) { return -a; },
                                                [](const fq_native& a, const fq_native&) { return -a; },
                                                "negation",
                                                false);
    }

    static void test_assert_is_in_field()
    {
        Builder builder = Builder();
        for (const auto& value : edge_case_values) {
            fq_ct edge_case = fq_ct::create_from_u512_as_witness(&builder, value, /*can_overflow*/ false);

            // This should pass for values strictly less than modulus
            edge_case.assert_is_in_field();
        }

        bool result = CircuitChecker::check(builder);
        EXPECT_EQ(result, true);
    }

    static void test_assert_is_in_field_fails()
    {
        for (const auto& large_value : values_larger_than_bigfield) {
            // Checks each large value individually in its own circuit
            Builder builder = Builder();

            // For values larger than the field modulus, it should trigger a circuit error.
            fq_ct large_case = fq_ct::create_from_u512_as_witness(&builder, large_value, true);
            large_case.assert_is_in_field();

            bool result = CircuitChecker::check(builder);
            EXPECT_EQ(result, false);

            if (large_value < reduction_upper_bound) {
                // If the value is less than 2^s (i.e., it is reduced), then the error should appear in the borrow
                // checks (during subtraction).
                EXPECT_EQ(builder.err(), "bigfield::unsafe_assert_less_than: r2 or r3 too large: hi limb.");
            } else {
                // If the value is greater than 2^s, the error appears earlier while performing the range constraint
                // checks on the limbs.
                EXPECT_EQ(builder.err(), "bigfield::assert_less_than: limb 2 or 3 too large: hi limb.");
            }
        }
    }

    static void test_assert_less_than()
    {
        Builder builder = Builder();

        for (size_t i = 0; i < edge_case_values.size() - 1; ++i) {
            // Check against all larger edge case values
            for (size_t j = i + 1; j < edge_case_values.size(); ++j) {
                fq_ct edge_case_small = fq_ct::create_from_u512_as_witness(&builder, edge_case_values[i], true);

                // This should always pass since edge_case_values is sorted in ascending order
                edge_case_small.assert_less_than(edge_case_values[j].lo);
            }
        }

        bool result = CircuitChecker::check(builder);
        EXPECT_EQ(result, true);
    }

    static void test_assert_less_than_fails()
    {
        for (size_t i = 2; i < edge_case_values.size(); ++i) {
            // Checks each large value individually in its own circuit
            Builder builder = Builder();

            // This should fail since values in edge_case_values are sorted in ascending order
            fq_ct larger_value = fq_ct::create_from_u512_as_witness(&builder, edge_case_values[i], true);
            uint256_t smaller_value = edge_case_values[i - 1].lo;
            larger_value.assert_less_than(smaller_value);

            bool result = CircuitChecker::check(builder);
            EXPECT_EQ(result, false);
            EXPECT_EQ(builder.err(), "bigfield::unsafe_assert_less_than: r2 or r3 too large: hi limb.");
        }
    }

    static void test_reduce_mod_target_modulus()
    {
        Builder builder = Builder();

        // Check that both edge case values as well as values larger than bigfield are reduced correctly
        for (const auto& value : edge_case_values) {
            fq_ct edge_case = fq_ct::create_from_u512_as_witness(&builder, value, false);
            fq_native edge_case_native = fq_native(value);

            edge_case.reduce_mod_target_modulus();
            edge_case_native = edge_case_native.reduce_once().reduce_once();

            EXPECT_EQ(edge_case.get_value() < fq_ct::modulus, true);
            EXPECT_EQ(edge_case.get_value(), uint512_t(edge_case_native));
        }

        for (const auto& large_value : values_larger_than_bigfield) {
            fq_ct large_case = fq_ct::create_from_u512_as_witness(&builder, large_value, true);
            fq_native large_case_native = fq_native(large_value);

            large_case.reduce_mod_target_modulus();
            large_case_native = large_case_native.reduce_once().reduce_once();

            EXPECT_EQ(large_case.get_value() < fq_ct::modulus, true);
            EXPECT_EQ(large_case.get_value(), uint512_t(large_case_native));
        }

        bool result = CircuitChecker::check(builder);
        EXPECT_EQ(result, true);
    }

    static void test_assert_equal_edge_case()
    {
        Builder builder = Builder();

        // One is n, other is (p + n)
        fq_ct value_n = fq_ct::create_from_u512_as_witness(&builder, edge_case_values[3], true);
        fq_ct value_p_plus_n = fq_ct::create_from_u512_as_witness(&builder, values_larger_than_bigfield[2], true);

        // Both should be equal to n mod p
        value_p_plus_n.assert_equal(value_n);

        // Create random bigfield element and add p to it
        auto [random_native, random_ct] = get_random_witness(&builder, false);
        fq_ct random_plus_p =
            fq_ct::create_from_u512_as_witness(&builder, uint512_t(random_native) + uint512_t(fq_ct::modulus), true);
        random_plus_p.assert_equal(random_ct);

        bool result = CircuitChecker::check(builder);
        EXPECT_EQ(result, true);
    }

    static void test_divide_by_zero_fails()
    {
        {
            Builder builder = Builder();

            // numerator and denominator both are witnesses
            auto [a_native, a_ct] = get_random_witness(&builder, false);
            fq_ct zero = fq_ct::create_from_u512_as_witness(&builder, uint512_t(0), true);
            fq_ct zero_modulus = fq_ct::create_from_u512_as_witness(&builder, uint512_t(fq_ct::modulus), true);

            // Division by zero should trigger an assertion failure
            fq_ct output = a_ct / zero;
            fq_ct output_modulus = a_ct / zero_modulus;

            // outputs are irrelevant
            EXPECT_EQ(output.get_value(), 0);
            EXPECT_EQ(output_modulus.get_value(), 0);

            bool result = CircuitChecker::check(builder);
            EXPECT_EQ(result, false);
            EXPECT_EQ(builder.err(), "bigfield: prime limb diff is zero, but expected non-zero");
        }
        {
            Builder builder = Builder();

            // numerator is constant, denominator is witness
            fq_native a_native = fq_native::random_element();
            fq_ct a_ct(&builder, uint256_t(a_native));
            fq_ct zero = fq_ct::create_from_u512_as_witness(&builder, uint512_t(0), true);

            // Division by zero should trigger an assertion failure
            fq_ct output = a_ct / zero;

            // outputs are irrelevant
            EXPECT_EQ(output.get_value(), 0);

            bool result = CircuitChecker::check(builder);
            EXPECT_EQ(result, false);
            EXPECT_EQ(builder.err(), "bigfield: prime limb diff is zero, but expected non-zero");
        }
        {
            Builder builder = Builder();

            // numerator is empty, denominator is witness
            fq_ct zero = fq_ct::create_from_u512_as_witness(&builder, uint512_t(0), true);

            // Division by zero should trigger an assertion failure
            fq_ct output = fq_ct::div_check_denominator_nonzero({}, zero);

            // outputs are irrelevant
            EXPECT_EQ(output.get_value(), 0);

            bool result = CircuitChecker::check(builder);
            EXPECT_EQ(result, false);
            EXPECT_EQ(builder.err(), "bigfield: prime limb diff is zero, but expected non-zero");
        }
        {
            Builder builder = Builder();

            // numerator is witness, denominator is constant
            [[maybe_unused]] auto [a_native, a_ct] = get_random_witness(&builder, false);
            fq_ct constant_zero = fq_ct(&builder, uint256_t(0));

#ifndef NDEBUG
            // In debug mode, we should hit an assertion failure
            EXPECT_THROW_OR_ABORT(a_ct / constant_zero, "bigfield: prime limb diff is zero, but expected non-zero");
#endif
        }
        {
            Builder builder = Builder();

            // numerator and denominator both are constant
            fq_native a_native = fq_native::random_element();
            fq_ct a_ct(&builder, uint256_t(a_native));

#ifndef NDEBUG
            fq_ct constant_zero = fq_ct(&builder, uint256_t(0));
            EXPECT_THROW_OR_ABORT(a_ct / constant_zero, "bigfield: division by zero in constant division");
#endif
        }
        {
            Builder builder = Builder();

            // numerator is empty, denominator is constant
#ifndef NDEBUG
            fq_ct constant_zero = fq_ct(&builder, uint256_t(0));
            EXPECT_THROW_OR_ABORT(fq_ct::div_check_denominator_nonzero({}, constant_zero),
                                  "bigfield: prime limb diff is zero, but expected non-zero");
#endif
        }
    }
};

// Define types for which the above tests will be constructed.
using CircuitTypes = testing::Types<typename bb::stdlib::bn254<UltraCircuitBuilder>::BaseField,
                                    typename bb::stdlib::secp256k1<UltraCircuitBuilder>::fq_ct,
                                    typename bb::stdlib::secp256k1<UltraCircuitBuilder>::bigfr_ct,
                                    typename bb::stdlib::secp256r1<UltraCircuitBuilder>::fq_ct,
                                    typename bb::stdlib::secp256r1<UltraCircuitBuilder>::bigfr_ct>;

// Define the suite of tests.
TYPED_TEST_SUITE(stdlib_bigfield_edge_cases, CircuitTypes);

TYPED_TEST(stdlib_bigfield_edge_cases, larger_than_bigfield_allowed)
{
    TestFixture::test_larger_than_bigfield_allowed();
}
TYPED_TEST(stdlib_bigfield_edge_cases, reduction_check_works)
{
    TestFixture::test_reduction_check_works();
}
TYPED_TEST(stdlib_bigfield_edge_cases, reduction_works_on_limb_overflow)
{
    TestFixture::test_reduction_works_on_limb_overflow();
}
TYPED_TEST(stdlib_bigfield_edge_cases, max_value_tracking_during_addition)
{
    TestFixture::test_maximum_value_tracking_during_addition();
}

// invariant checks during operations
TYPED_TEST(stdlib_bigfield_edge_cases, invariants_during_addition)
{
    TestFixture::test_invariants_during_addition();
}
TYPED_TEST(stdlib_bigfield_edge_cases, invariants_during_subtraction)
{
    TestFixture::test_invariants_during_subtraction();
}
TYPED_TEST(stdlib_bigfield_edge_cases, invariants_during_multiplication)
{
    TestFixture::test_invariants_during_multiplication();
}
TYPED_TEST(stdlib_bigfield_edge_cases, invariants_during_division)
{
    TestFixture::test_invariants_during_division();
}
TYPED_TEST(stdlib_bigfield_edge_cases, invariants_during_squaring)
{
    TestFixture::test_invariants_during_squaring();
}
TYPED_TEST(stdlib_bigfield_edge_cases, invariants_during_negation)
{
    TestFixture::test_invariants_during_negation();
}

// assert related checks
TYPED_TEST(stdlib_bigfield_edge_cases, assert_is_in_field)
{
    TestFixture::test_assert_is_in_field();
}
TYPED_TEST(stdlib_bigfield_edge_cases, assert_is_in_field_fails)
{
    TestFixture::test_assert_is_in_field_fails();
}
TYPED_TEST(stdlib_bigfield_edge_cases, assert_less_than)
{
    TestFixture::test_assert_less_than();
}
TYPED_TEST(stdlib_bigfield_edge_cases, assert_less_than_fails)
{
    TestFixture::test_assert_less_than_fails();
}
TYPED_TEST(stdlib_bigfield_edge_cases, reduce_mod_target_modulus)
{
    TestFixture::test_reduce_mod_target_modulus();
}
TYPED_TEST(stdlib_bigfield_edge_cases, assert_equal_edge_case)
{
    TestFixture::test_assert_equal_edge_case();
}

TYPED_TEST(stdlib_bigfield_edge_cases, divide_by_zero_fails)
{
    TestFixture::test_divide_by_zero_fails();
}

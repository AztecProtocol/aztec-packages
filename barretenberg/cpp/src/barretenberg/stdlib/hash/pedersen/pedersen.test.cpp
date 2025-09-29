#include "barretenberg/crypto/pedersen_commitment/pedersen.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib/primitives/test_utils.hpp"
#include "barretenberg/stdlib_circuit_builders/plookup_tables/fixed_base/fixed_base.hpp"
#include "pedersen.hpp"

using namespace bb;
using bb::stdlib::test_utils::check_circuit_and_gate_count;
namespace {
auto& engine = numeric::get_debug_randomness();
}

template <typename Builder> class StdlibPedersen : public testing::Test {
    using _curve = stdlib::bn254<Builder>;

    using byte_array_ct = typename _curve::byte_array_ct;
    using fr_ct = typename _curve::ScalarField;
    using witness_ct = typename _curve::witness_ct;
    using public_witness_ct = typename _curve::public_witness_ct;
    using pedersen_hash = typename stdlib::pedersen_hash<Builder>;
    using cycle_group = typename stdlib::cycle_group<Builder>;

  public:
    static void test_pedersen_two()
    {

        Builder builder;

        fr left_in = fr::random_element();
        fr right_in = fr::random_element();

        // ensure left has skew 1, right has skew 0
        if ((left_in.from_montgomery_form().data[0] & 1) == 1) {
            left_in += fr::one();
        }
        if ((right_in.from_montgomery_form().data[0] & 1) == 0) {
            right_in += fr::one();
        }

        fr_ct left = public_witness_ct(&builder, left_in);
        fr_ct right = witness_ct(&builder, right_in);

        builder.fix_witness(left.witness_index, left.get_value());
        builder.fix_witness(right.witness_index, right.get_value());

        fr_ct out = pedersen_hash::hash({ left, right });

        fr hash_native = crypto::pedersen_hash::hash({ left.get_value(), right.get_value() });
        EXPECT_EQ(out.get_value(), hash_native);

        check_circuit_and_gate_count(builder, 2897);
    }

    static void test_pedersen_edge_cases()
    {
        Builder builder;

        fr zero_fr = fr::zero();
        fr one_fr = fr::one();
        fr r_minus_one_fr = fr::modulus - 1;
        fr r_minus_two_fr = fr::modulus - 2;
        fr r_fr = fr::modulus;

        fr_ct zero = witness_ct(&builder, zero_fr);
        fr_ct one = witness_ct(&builder, one_fr);
        fr_ct r_minus_one = witness_ct(&builder, r_minus_one_fr);
        fr_ct r_minus_two = witness_ct(&builder, r_minus_two_fr);
        fr_ct r = witness_ct(&builder, r_fr);

        fr_ct out_1_with_zero = pedersen_hash::hash({ zero, one });
        fr_ct out_1_with_r = pedersen_hash::hash({ r, one });
        fr_ct out_2 = pedersen_hash::hash({ r_minus_one, r_minus_two });
        fr_ct out_with_zero = pedersen_hash::hash({ out_1_with_zero, out_2 });
        fr_ct out_with_r = pedersen_hash::hash({ out_1_with_r, out_2 });

        EXPECT_EQ(bool(out_1_with_zero.get_value() == out_1_with_r.get_value()), true);

        fr hash_native_1_with_zero = crypto::pedersen_hash::hash({ zero.get_value(), one.get_value() });
        fr hash_native_1_with_r = crypto::pedersen_hash::hash({ r.get_value(), one.get_value() });
        fr hash_native_2 = crypto::pedersen_hash::hash({ r_minus_one.get_value(), r_minus_two.get_value() });
        fr hash_native_with_zero = crypto::pedersen_hash::hash({ out_1_with_zero.get_value(), out_2.get_value() });
        fr hash_native_with_r = crypto::pedersen_hash::hash({ out_1_with_r.get_value(), out_2.get_value() });

        EXPECT_EQ(out_1_with_zero.get_value(), hash_native_1_with_zero);
        EXPECT_EQ(out_1_with_r.get_value(), hash_native_1_with_r);
        EXPECT_EQ(out_2.get_value(), hash_native_2);
        EXPECT_EQ(out_with_zero.get_value(), hash_native_with_zero);
        EXPECT_EQ(out_with_r.get_value(), hash_native_with_r);
        EXPECT_EQ(hash_native_with_zero, hash_native_with_r);

        check_circuit_and_gate_count(builder, 3482);
    }

    static void test_pedersen_large()
    {
        Builder builder;

        fr left_in = fr::random_element();
        fr right_in = fr::random_element();
        // ensure left has skew 1, right has skew 0
        if ((left_in.from_montgomery_form().data[0] & 1) == 1) {
            left_in += fr::one();
        }
        if ((right_in.from_montgomery_form().data[0] & 1) == 0) {
            right_in += fr::one();
        }
        fr_ct left = witness_ct(&builder, left_in);
        fr_ct right = witness_ct(&builder, right_in);

        for (size_t i = 0; i < 256; ++i) {
            left = pedersen_hash::hash({ left, right });
        }

        builder.set_public_input(left.witness_index);

        check_circuit_and_gate_count(builder, 40379);
    }

    static void test_multi_hash()
    {
        Builder builder;

        for (size_t i = 0; i < 7; ++i) {
            std::vector<fr> inputs;
            inputs.push_back(bb::fr::random_element());
            inputs.push_back(bb::fr::random_element());
            inputs.push_back(bb::fr::random_element());
            inputs.push_back(bb::fr::random_element());

            if (i == 1) {
                inputs[0] = fr(0);
            }
            if (i == 2) {
                inputs[1] = fr(0);
                inputs[2] = fr(0);
            }
            if (i == 3) {
                inputs[3] = fr(0);
            }
            if (i == 4) {
                inputs[0] = fr(0);
                inputs[3] = fr(0);
            }
            if (i == 5) {
                inputs[0] = fr(0);
                inputs[1] = fr(0);
                inputs[2] = fr(0);
                inputs[3] = fr(0);
            }
            if (i == 6) {
                inputs[1] = fr(1);
            }
            std::vector<fr_ct> witnesses;
            for (auto input : inputs) {
                witnesses.push_back(witness_ct(&builder, input));
            }

            fr expected = crypto::pedersen_hash::hash(inputs);

            fr_ct result = pedersen_hash::hash(witnesses);
            EXPECT_EQ(result.get_value(), expected);
        }

        // Note: gate count delta is an illusion due to extra constants added by default in the Mega builder which then
        // get resused as ROM indices in the underlying batch mul algorithm (only applies for num_inputs > 2).
        if constexpr (std::is_same_v<Builder, bb::UltraCircuitBuilder>) {
            check_circuit_and_gate_count(builder, 9724);
        } else {
            check_circuit_and_gate_count(builder, 9721);
        }
    }

    static void test_hash_eight()
    {
        Builder builder;

        std::vector<grumpkin::fq> inputs;
        inputs.reserve(8);
        std::vector<stdlib::field_t<Builder>> witness_inputs;

        for (size_t i = 0; i < 8; ++i) {
            inputs.emplace_back(bb::fr::random_element());
            witness_inputs.emplace_back(witness_ct(&builder, inputs[i]));
        }

        constexpr size_t hash_idx = 10;
        grumpkin::fq expected = crypto::pedersen_hash::hash(inputs, hash_idx);
        auto result = pedersen_hash::hash(witness_inputs, hash_idx);

        EXPECT_EQ(result.get_value(), expected);

        // Note: gate count delta is an illusion due to extra constants added by default in the Mega builder which then
        // get resused as ROM indices in the underlying batch mul algorithm (only applies for num_inputs > 2).
        if constexpr (std::is_same_v<Builder, bb::UltraCircuitBuilder>) {
            check_circuit_and_gate_count(builder, 5417);
        } else {
            check_circuit_and_gate_count(builder, 5414);
        }
    }

    static void test_hash_constants()
    {
        Builder builder;

        std::vector<fr> inputs;
        std::vector<stdlib::field_t<Builder>> witness_inputs;

        for (size_t i = 0; i < 8; ++i) {
            inputs.push_back(bb::fr::random_element());
            if (i % 2 == 1) {
                witness_inputs.push_back(witness_ct(&builder, inputs[i]));
            } else {
                witness_inputs.push_back(fr_ct(&builder, inputs[i]));
            }
        }

        fr expected = crypto::pedersen_hash::hash(inputs);
        auto result = pedersen_hash::hash(witness_inputs);

        EXPECT_EQ(result.get_value(), expected);

        // Note: gate count delta is an illusion due to extra constants added by default in the Mega builder which then
        // get resused as ROM indices in the underlying batch mul algorithm (only applies for num_inputs > 2).
        if constexpr (std::is_same_v<Builder, bb::UltraCircuitBuilder>) {
            check_circuit_and_gate_count(builder, 3997);
        } else {
            check_circuit_and_gate_count(builder, 3994);
        }
    }

    static void test_empty_input()
    {
        Builder builder;
        std::vector<fr> empty_inputs_native;
        std::vector<fr_ct> empty_inputs;

        [[maybe_unused]] auto native_result = crypto::pedersen_hash::hash(empty_inputs_native);
        auto stdlib_result = pedersen_hash::hash(empty_inputs);

        EXPECT_EQ(stdlib_result.get_value(), fr::zero());

        // NOTE: Empty input handling differs between native and stdlib implementations because the representation of
        // the point at infinity differs
        // EXPECT_NE(stdlib_result.get_value(), native_result); // They are different!

        check_circuit_and_gate_count(builder, 0); // Empty input returns 0
    }

    static void test_single_input()
    {
        Builder builder;

        fr value = fr::random_element();
        fr_ct witness = witness_ct(&builder, value);

        auto result = pedersen_hash::hash({ witness });
        auto expected = crypto::pedersen_hash::hash({ value });

        EXPECT_EQ(result.get_value(), expected);

        check_circuit_and_gate_count(builder, 2823);
    }

    static void test_large_inputs()
    {
        Builder builder;
        std::vector<fr> native_inputs;
        std::vector<fr_ct> witness_inputs;

        constexpr size_t size = 200;
        for (size_t i = 0; i < size; ++i) {
            native_inputs.push_back(fr::random_element());
            witness_inputs.push_back(witness_ct(&builder, native_inputs.back()));
        }

        auto result = pedersen_hash::hash(witness_inputs);
        auto expected = crypto::pedersen_hash::hash(native_inputs);

        EXPECT_EQ(result.get_value(), expected);

        // Note: gate count delta is an illusion due to extra constants added by default in the Mega builder which then
        // get resused as ROM indices in the underlying batch mul algorithm (only applies for num_inputs > 2).
        if constexpr (std::is_same_v<Builder, bb::UltraCircuitBuilder>) {
            check_circuit_and_gate_count(builder, 62376);
        } else {
            check_circuit_and_gate_count(builder, 62373);
        }
    }

    static void test_generator_contexts()
    {
        using GeneratorContext = typename crypto::GeneratorContext<typename cycle_group::Curve>;

        Builder builder;

        std::vector<fr> inputs;
        std::vector<fr_ct> witness_inputs;

        for (size_t i = 0; i < 5; ++i) {
            inputs.push_back(fr::random_element());
            witness_inputs.push_back(witness_ct(&builder, inputs.back()));
        }

        // Test 1: Implicit conversion from size_t to GeneratorContext
        // When passing a size_t, it becomes GeneratorContext(offset) with default domain separator
        for (size_t hash_idx : { size_t(0), size_t(1), size_t(10), size_t(100), size_t(1000) }) {
            // This implicitly creates GeneratorContext(hash_idx)
            GeneratorContext ctx{ hash_idx }; // For native comparison
            auto result = pedersen_hash::hash(witness_inputs, ctx);
            auto expected = crypto::pedersen_hash::hash(inputs, ctx);

            EXPECT_EQ(result.get_value(), expected);
        }

        // Test 2: Verify that different offsets produce different results
        auto result_offset_0 = pedersen_hash::hash(witness_inputs, 0);
        auto result_offset_1 = pedersen_hash::hash(witness_inputs, 1);
        EXPECT_NE(result_offset_0.get_value(), result_offset_1.get_value());

        // Test 3: Explicit GeneratorContext with custom domain separators
        // Different domain separators should produce different generators and thus different hashes
        GeneratorContext ctx_domain_a(0, "domain_a");
        GeneratorContext ctx_domain_b(0, "domain_b");
        GeneratorContext ctx_default(0); // Uses default domain separator

        auto result_domain_a = pedersen_hash::hash(witness_inputs, ctx_domain_a);
        auto result_domain_b = pedersen_hash::hash(witness_inputs, ctx_domain_b);
        auto result_default = pedersen_hash::hash(witness_inputs, ctx_default);

        // Verify native implementation matches
        auto expected_domain_a = crypto::pedersen_hash::hash(inputs, ctx_domain_a);
        auto expected_domain_b = crypto::pedersen_hash::hash(inputs, ctx_domain_b);
        auto expected_default = crypto::pedersen_hash::hash(inputs, ctx_default);

        EXPECT_EQ(result_domain_a.get_value(), expected_domain_a);
        EXPECT_EQ(result_domain_b.get_value(), expected_domain_b);
        EXPECT_EQ(result_default.get_value(), expected_default);

        // Different domain separators should produce different results
        EXPECT_NE(result_domain_a.get_value(), result_domain_b.get_value());
        EXPECT_NE(result_domain_a.get_value(), result_default.get_value());
        EXPECT_NE(result_domain_b.get_value(), result_default.get_value());

        // Test 4: Same domain separator with different offsets
        GeneratorContext ctx_offset_10(10, "domain_test");
        GeneratorContext ctx_offset_20(20, "domain_test");

        auto result_offset_10 = pedersen_hash::hash(witness_inputs, ctx_offset_10);
        auto result_offset_20 = pedersen_hash::hash(witness_inputs, ctx_offset_20);

        // Different offsets with same domain should produce different results
        EXPECT_NE(result_offset_10.get_value(), result_offset_20.get_value());

        // Note: gate count delta is an illusion due to extra constants added by default in the Mega builder which then
        // get resused as ROM indices in the underlying batch mul algorithm (only applies for num_inputs > 2).
        if constexpr (std::is_same_v<Builder, bb::UltraCircuitBuilder>) {
            check_circuit_and_gate_count(builder, 21845);
        } else {
            check_circuit_and_gate_count(builder, 21842);
        }
    }

    static void test_determinism()
    {
        Builder builder;

        std::vector<fr> inputs;
        std::vector<fr_ct> witness_inputs;

        for (size_t i = 0; i < 5; ++i) {
            inputs.push_back(fr::random_element());
            witness_inputs.push_back(witness_ct(&builder, inputs.back()));
        }

        // Hash the same inputs multiple times
        auto result1 = pedersen_hash::hash(witness_inputs);
        auto result2 = pedersen_hash::hash(witness_inputs);
        auto result3 = pedersen_hash::hash(witness_inputs);

        // All should produce the same result
        EXPECT_EQ(result1.get_value(), result2.get_value());
        EXPECT_EQ(result2.get_value(), result3.get_value());

        // Also verify against native implementation
        auto expected = crypto::pedersen_hash::hash(inputs);
        EXPECT_EQ(result1.get_value(), expected);

        // Note: gate count delta is an illusion due to extra constants added by default in the Mega builder which then
        // get resused as ROM indices in the underlying batch mul algorithm (only applies for num_inputs > 2).
        if constexpr (std::is_same_v<Builder, bb::UltraCircuitBuilder>) {
            check_circuit_and_gate_count(builder, 6645);
        } else {
            check_circuit_and_gate_count(builder, 6642);
        }
    }
};

using CircuitTypes = testing::Types<bb::UltraCircuitBuilder, bb::MegaCircuitBuilder>;

TYPED_TEST_SUITE(StdlibPedersen, CircuitTypes);

TYPED_TEST(StdlibPedersen, TestHash)
{
    using Builder = TypeParam;
    using field_ct = stdlib::field_t<Builder>;
    using witness_ct = stdlib::witness_t<Builder>;
    auto builder = Builder();

    const size_t num_inputs = 10;

    std::vector<field_ct> inputs;
    std::vector<fr> inputs_native;

    for (size_t i = 0; i < num_inputs; ++i) {
        const auto element = fr::random_element(&engine);
        inputs_native.emplace_back(element);
        inputs.emplace_back(field_ct(witness_ct(&builder, element)));
    }

    auto result = stdlib::pedersen_hash<Builder>::hash(inputs);
    auto expected = crypto::pedersen_hash::hash(inputs_native);

    EXPECT_EQ(result.get_value(), expected);

    // Note: gate count delta is an illusion due to extra constants added by default in the Mega builder which then
    // get resused as ROM indices in the underlying batch mul algorithm (only applies for num_inputs > 2).
    if constexpr (std::is_same_v<Builder, bb::UltraCircuitBuilder>) {
        check_circuit_and_gate_count(builder, 5565);
    } else {
        check_circuit_and_gate_count(builder, 5562);
    }
}

TYPED_TEST(StdlibPedersen, Small)
{
    TestFixture::test_pedersen_two();
};

TYPED_TEST(StdlibPedersen, EdgeCases)
{
    TestFixture::test_pedersen_edge_cases();
};

HEAVY_TYPED_TEST(StdlibPedersen, Large)
{
    TestFixture::test_pedersen_large();
};

TYPED_TEST(StdlibPedersen, MultiHash)
{
    TestFixture::test_multi_hash();
};

TYPED_TEST(StdlibPedersen, HashEight)
{
    TestFixture::test_hash_eight();
};

TYPED_TEST(StdlibPedersen, HashConstants)
{
    TestFixture::test_hash_constants();
};

TYPED_TEST(StdlibPedersen, EmptyInput)
{
    TestFixture::test_empty_input();
};

TYPED_TEST(StdlibPedersen, SingleInput)
{
    TestFixture::test_single_input();
};

TYPED_TEST(StdlibPedersen, LargeInputs)
{
    TestFixture::test_large_inputs();
};

TYPED_TEST(StdlibPedersen, GeneratorContexts)
{
    TestFixture::test_generator_contexts();
};

TYPED_TEST(StdlibPedersen, Determinism)
{
    TestFixture::test_determinism();
};

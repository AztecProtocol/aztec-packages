#include "barretenberg/crypto/pedersen_commitment/pedersen.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/crypto/pedersen_commitment/c_bind.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib/primitives/test_utils.hpp"
#include "pedersen.hpp"

using namespace bb;
using bb::stdlib::test_utils::check_circuit_and_gate_count;
namespace {
auto& engine = numeric::get_debug_randomness();
}

template <typename Builder> class StdlibPedersen : public testing::Test {
    using _curve = stdlib::bn254<Builder>;

    using fr_ct = typename _curve::ScalarField;
    using witness_ct = typename _curve::witness_ct;
    using public_witness_ct = typename _curve::public_witness_ct;
    using pedersen_commitment = typename stdlib::pedersen_commitment<Builder>;

    // Helper to verify pedersen commitment against native implementation
    static void verify_commitment(Builder& builder [[maybe_unused]],
                                  const std::vector<stdlib::field_t<Builder>>& inputs,
                                  crypto::GeneratorContext<curve::Grumpkin> context = {})
    {
        // Extract native values from circuit inputs
        std::vector<fr> input_vals;
        for (const auto& input : inputs) {
            input_vals.push_back(input.get_value());
        }

        auto result = pedersen_commitment::commit(inputs, context);
        auto expected = crypto::pedersen_commitment::commit_native(input_vals, context);

        EXPECT_EQ(result.x.get_value(), expected.x);
        EXPECT_EQ(result.y.get_value(), expected.y);
    }

  public:
    static void test_pedersen()
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

        std::vector<stdlib::field_t<Builder>> inputs = { left, right };

        verify_commitment(builder, inputs);

        check_circuit_and_gate_count(builder, 2912);
    }

    static void test_mixed_witnesses_and_constants()
    {
        Builder builder;
        std::vector<stdlib::field_t<Builder>> inputs;

        for (size_t i = 0; i < 8; ++i) {
            fr value = fr::random_element();
            if (i % 2 == 0) {
                inputs.push_back(fr_ct(&builder, value));
            } else {
                inputs.push_back(witness_ct(&builder, value));
            }
        }

        verify_commitment(builder, inputs);

        // Gate count different for Mega because it adds constants for ECC op codes that get reused in ROM table access
        if constexpr (std::is_same_v<Builder, bb::MegaCircuitBuilder>) {
            check_circuit_and_gate_count(builder, 3994);
        } else {
            check_circuit_and_gate_count(builder, 3997);
        }
    }

    static void test_empty_input()
    {
        Builder builder;
        std::vector<fr> inputs;
        std::vector<stdlib::field_t<Builder>> witness_inputs;

        // Empty input should return the zero/identity point
        auto result = pedersen_commitment::commit(witness_inputs);

        // For empty inputs, the circuit returns (0, 0) which is the identity point
        EXPECT_EQ(result.x.get_value(), fr::zero());
        EXPECT_EQ(result.y.get_value(), fr::zero());

        check_circuit_and_gate_count(builder, 0);
    }

    static void test_single_input()
    {
        Builder builder;
        fr input = fr::random_element();
        std::vector<stdlib::field_t<Builder>> circuit_inputs = { witness_ct(&builder, input) };

        verify_commitment(builder, circuit_inputs);
        check_circuit_and_gate_count(builder, 2838);

        // Expect table size to be 14340 for single input
        // i.e. 254 bit scalars handled via 28 9-bit tables (size 2^9) plus one 2-bit table (size 2^2)
        // i.e. (28*2^9) + (1*2^2) = 14340
        EXPECT_EQ(builder.get_tables_size(), 14340);
    }

    // Test demonstrates lookup table optimization for 2 inputs
    static void test_two_inputs()
    {
        Builder builder;
        std::vector<stdlib::field_t<Builder>> circuit_inputs;

        for (size_t i = 0; i < 2; ++i) {
            circuit_inputs.push_back(witness_ct(&builder, fr::random_element()));
        }

        verify_commitment(builder, circuit_inputs);
        check_circuit_and_gate_count(builder, 2910);

        // Expect table size to be 28680 = 2*14340 for two inputs
        // Each input uses one Multitable of size 14340
        EXPECT_EQ(builder.get_tables_size(), 28680);
    }

    // Test demonstrates gate count jump when lookup tables can't be used (3+ inputs)
    static void test_three_inputs()
    {
        Builder builder;
        std::vector<stdlib::field_t<Builder>> circuit_inputs;

        for (size_t i = 0; i < 3; ++i) {
            circuit_inputs.push_back(witness_ct(&builder, fr::random_element()));
        }

        verify_commitment(builder, circuit_inputs);

        // Gate count different for Mega because it adds constants for ECC op codes that get reused in ROM table access
        if constexpr (std::is_same_v<Builder, bb::MegaCircuitBuilder>) {
            check_circuit_and_gate_count(builder, 3485);
        } else {
            check_circuit_and_gate_count(builder, 3488);
        }

        // Lookup tables size is same as 2 inputs since only the first 2 inputs use lookup tables
        EXPECT_EQ(builder.get_tables_size(), 28680);
    }

    static void test_large_input()
    {
        Builder builder;
        std::vector<stdlib::field_t<Builder>> circuit_inputs;

        for (size_t i = 0; i < 32; ++i) {
            circuit_inputs.push_back(witness_ct(&builder, fr::random_element()));
        }

        verify_commitment(builder, circuit_inputs);

        // Gate count different for Mega because it adds constants for ECC op codes that get reused in ROM table access
        if constexpr (std::is_same_v<Builder, bb::MegaCircuitBuilder>) {
            check_circuit_and_gate_count(builder, 12156);
        } else {
            check_circuit_and_gate_count(builder, 12159);
        }
    }

    static void test_zero_values()
    {
        Builder builder;

        // Mix of witness and constant zeros/non-zeros
        std::vector<stdlib::field_t<Builder>> circuit_inputs = {
            witness_ct(&builder, fr::zero()),
            witness_ct(&builder, fr::random_element()),
            fr_ct(&builder, fr::zero()),          // constant zero
            fr_ct(&builder, fr::random_element()) // constant non-zero
        };

        verify_commitment(builder, circuit_inputs);
    }

    static void test_custom_generator_context()
    {
        Builder builder;
        std::vector<stdlib::field_t<Builder>> circuit_inputs;

        for (size_t i = 0; i < 4; ++i) {
            circuit_inputs.push_back(witness_ct(&builder, fr::random_element()));
        }

        crypto::GeneratorContext<curve::Grumpkin> context;
        context.offset = 10;

        verify_commitment(builder, circuit_inputs, context);
    }

    static void test_all_constants()
    {
        Builder builder;
        std::vector<stdlib::field_t<Builder>> circuit_inputs;

        for (size_t i = 0; i < 6; ++i) {
            circuit_inputs.push_back(fr_ct(&builder, fr::random_element()));
        }

        verify_commitment(builder, circuit_inputs);
        check_circuit_and_gate_count(builder, 0);
    }

    static void test_special_field_element()
    {
        Builder builder;

        std::vector<stdlib::field_t<Builder>> circuit_inputs = { witness_ct(&builder,
                                                                            fr(-1)), // p-1, the maximum field element
                                                                 witness_ct(&builder, fr(-2)), // p-2
                                                                 witness_ct(&builder, fr::random_element()) };

        verify_commitment(builder, circuit_inputs);
    }

    static void test_determinism()
    {
        Builder builder;
        std::vector<fr> inputs;
        std::vector<stdlib::field_t<Builder>> witness_inputs;

        for (size_t i = 0; i < 5; ++i) {
            inputs.push_back(fr::random_element());
            witness_inputs.push_back(witness_ct(&builder, inputs[i]));
        }

        // Commit twice with same inputs
        auto result1 = pedersen_commitment::commit(witness_inputs);
        auto result2 = pedersen_commitment::commit(witness_inputs);

        // Should produce identical results
        EXPECT_EQ(result1.x.get_value(), result2.x.get_value());
        EXPECT_EQ(result1.y.get_value(), result2.y.get_value());

        auto expected = crypto::pedersen_commitment::commit_native(inputs);
        EXPECT_EQ(result1.x.get_value(), expected.x);
        EXPECT_EQ(result1.y.get_value(), expected.y);

        bool check_result = CircuitChecker::check(builder);
        EXPECT_EQ(check_result, true);
    }
};

using CircuitTypes = testing::Types<bb::UltraCircuitBuilder, bb::MegaCircuitBuilder>;

TYPED_TEST_SUITE(StdlibPedersen, CircuitTypes);

TYPED_TEST(StdlibPedersen, Small)
{
    TestFixture::test_pedersen();
};

TYPED_TEST(StdlibPedersen, MixedWitnessesAndConstants)
{
    TestFixture::test_mixed_witnesses_and_constants();
};

TYPED_TEST(StdlibPedersen, EmptyInput)
{
    TestFixture::test_empty_input();
};

TYPED_TEST(StdlibPedersen, SingleInput)
{
    TestFixture::test_single_input();
};

TYPED_TEST(StdlibPedersen, TwoInputs)
{
    TestFixture::test_two_inputs();
};

TYPED_TEST(StdlibPedersen, ThreeInputs)
{
    TestFixture::test_three_inputs();
};

TYPED_TEST(StdlibPedersen, LargeInput)
{
    TestFixture::test_large_input();
};

TYPED_TEST(StdlibPedersen, ZeroValues)
{
    TestFixture::test_zero_values();
};

TYPED_TEST(StdlibPedersen, CustomGeneratorContext)
{
    TestFixture::test_custom_generator_context();
};

TYPED_TEST(StdlibPedersen, AllConstants)
{
    TestFixture::test_all_constants();
};

TYPED_TEST(StdlibPedersen, SpecialFieldElement)
{
    TestFixture::test_special_field_element();
};

TYPED_TEST(StdlibPedersen, Determinism)
{
    TestFixture::test_determinism();
};

#include "padding_indicator_array.hpp"
#include "../witness/witness.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders.hpp"

#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"

using namespace bb;
namespace {
auto& engine = numeric::get_debug_randomness();

template <typename Curve_, typename Builder_> struct PaddingTestParams {
    using Curve = Curve_;
    using Builder = Builder_;
};

template <typename Param> class PaddingIndicatorArrayTest : public testing::Test {
  public:
    using Curve = typename Param::Curve;
    using Fr = typename Curve::ScalarField;
    using Builder = typename Param::Builder;

    static constexpr size_t domain_size = 25;

    void test_value_in_range()
    {
        for (size_t idx = 1; idx <= domain_size; idx++) {
            Builder builder;
            Fr x = Fr::from_witness(&builder, idx);

            auto result = compute_padding_indicator_array<Curve, domain_size>(x);
            EXPECT_TRUE(result[idx - 1].get_value() == 1);

            info("num gates = ", builder.get_estimated_num_finalized_gates());
            // Check that the sum of indicators is indeed x
            Fr sum_of_indicators = std::accumulate(result.begin(), result.end(), Fr{ 0 });
            EXPECT_TRUE((sum_of_indicators == x).get_value());
            // Create a witness = 2^idx
            Fr exponent = Fr::from_witness(&builder, 1 << idx);
            // Using the indicator values, compute 2^idx in-circuit.
            stdlib::constrain_log_circuit_size(result, exponent);
            // Check the correctness of the circuit
            EXPECT_TRUE(CircuitChecker::check(builder));
        }
    }

    void test_edge_cases()
    {

        // Check that log_circuit_size is constrained to be != 0
        {
            Builder builder;

            Fr zero = Fr::from_witness(&builder, 0);

            compute_padding_indicator_array<Curve, domain_size>(zero);
            info("num gates = ", builder.get_estimated_num_finalized_gates());

            EXPECT_FALSE(CircuitChecker::check(builder));
        }

        // Check that log_circuit_size can take the max possible value
        {
            Builder builder;

            Fr N = Fr::from_witness(&builder, domain_size);

            compute_padding_indicator_array<Curve, domain_size>(N);
            info("num gates = ", builder.get_estimated_num_finalized_gates());

            EXPECT_TRUE(CircuitChecker::check(builder));
        }
    }

    void test_value_not_in_range()
    {
        for (size_t idx = 1; idx < domain_size; idx++) {
            Builder builder;
            uint256_t scalar_raw = engine.get_random_uint256();

            Fr x = Fr::from_witness(&builder, scalar_raw);

            compute_padding_indicator_array<Curve, domain_size>(x);
            info("num gates = ", builder.get_estimated_num_finalized_gates());

            EXPECT_FALSE(CircuitChecker::check(builder));
        }
    }

    void test_gate_count_independence()
    {
        auto get_gate_count = [](const uint32_t& scalar_raw) -> size_t {
            Builder builder;
            Fr x = Fr::from_witness(&builder, scalar_raw);
            auto result = compute_padding_indicator_array<Curve, domain_size>(x);

            size_t gate_count = builder.get_estimated_num_finalized_gates();
            // Create a witness = 2^(idx)
            Fr exponent = Fr::from_witness(&builder, 1UL << scalar_raw);
            // Using the indicator values, compute 2^idx in-circuit.
            stdlib::constrain_log_circuit_size(result, exponent);
            return gate_count;
        };

        // Valid input: x in [1, domain_size - 1]
        uint32_t x_in_range = (domain_size - 1) / 2;
        size_t gates_in_range = get_gate_count(x_in_range);

        // Random input
        uint32_t random_scalar = engine.get_random_uint32();
        size_t gates_random = get_gate_count(random_scalar);

        EXPECT_EQ(gates_in_range, gates_random);
    }

    void test_log_constraint_failure()
    {
        for (size_t idx = 1; idx <= domain_size; idx++) {
            Builder builder;
            Fr x = Fr::from_witness(&builder, idx);

            auto result = compute_padding_indicator_array<Curve, domain_size>(x);
            EXPECT_TRUE(result[idx - 1].get_value() == 1);

            info("num gates = ", builder.get_estimated_num_finalized_gates());
            // Check that the sum of indicators is indeed x
            Fr sum_of_indicators = std::accumulate(result.begin(), result.end(), Fr{ 0 });
            EXPECT_TRUE((sum_of_indicators == x).get_value());
            // Check the correctness of the circuit
            EXPECT_TRUE(CircuitChecker::check(builder));
            // Create a witness = 2^idx
            Fr exponent = Fr::from_witness(&builder, (1 << idx) + 1);
            // Using the indicator values, compute tampered "2^idx" in-circuit.
            stdlib::constrain_log_circuit_size(result, exponent);
            // Circuit check must fail as 2^(log_n) != n
            EXPECT_FALSE(CircuitChecker::check(builder));
        }
    }
};

using TestTypes = testing::Types<
    PaddingTestParams<bb::stdlib::bn254<bb::MegaCircuitBuilder_<bb::field<bb::Bn254FrParams>>>, bb::MegaCircuitBuilder>,
    PaddingTestParams<stdlib::bn254<bb::UltraCircuitBuilder>, bb::UltraCircuitBuilder>>;

TYPED_TEST_SUITE(PaddingIndicatorArrayTest, TestTypes);

TYPED_TEST(PaddingIndicatorArrayTest, TestValueInRange)
{
    TestFixture::test_value_in_range();
}

TYPED_TEST(PaddingIndicatorArrayTest, TestEdgeCases)
{
    TestFixture::test_edge_cases();
}
TYPED_TEST(PaddingIndicatorArrayTest, TestValueNotInrange)
{
    TestFixture::test_value_not_in_range();
}
TYPED_TEST(PaddingIndicatorArrayTest, TestGateCountIndependence)
{
    TestFixture::test_gate_count_independence();
}
TYPED_TEST(PaddingIndicatorArrayTest, TestLogConstraintFailure)
{
    TestFixture::test_log_constraint_failure();
}
} // namespace

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

template <typename Fr_, typename Builder_> struct PaddingTestParams {
    using Fr = Fr_;
    using Builder = Builder_;
};

template <typename Param> class PaddingIndicatorArrayTest : public testing::Test {
  public:
    using Fr = typename Param::Fr;
    using Builder = typename Param::Builder;

    static constexpr size_t domain_size = 25;

  public:
    void test_value_in_range()
    {
        for (size_t idx = 2; idx <= domain_size; idx++) {
            Builder builder;
            Fr x = Fr::from_witness(&builder, idx);

            auto result = compute_padding_indicator_array<Fr, Builder, domain_size>(x);
            EXPECT_TRUE(result[idx - 1].get_value() == 1);

            info("num gates = ", builder.get_estimated_num_finalized_gates());
            // Check that the sum of indicators is indeed x
            Fr sum_of_indicators = std::accumulate(result.begin(), result.end(), Fr{ 0 });
            EXPECT_TRUE((sum_of_indicators == x).get_value());
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

            [[maybe_unused]] auto result = compute_padding_indicator_array<Fr, Builder, domain_size>(zero);
            info("num gates = ", builder.get_estimated_num_finalized_gates());

            EXPECT_FALSE(CircuitChecker::check(builder));
        }

        // Check that log_circuit_size can take the max possible value
        {
            Builder builder;

            Fr N = Fr::from_witness(&builder, domain_size);

            [[maybe_unused]] auto result = compute_padding_indicator_array<Fr, Builder, domain_size>(N);
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

            [[maybe_unused]] auto result = compute_padding_indicator_array<Fr, Builder, domain_size>(x);
            info("num gates = ", builder.get_estimated_num_finalized_gates());

            EXPECT_FALSE(CircuitChecker::check(builder));
        }
    }

    void test_gate_count_independence()
    {
        auto get_gate_count = [](const uint256_t& scalar_raw) -> size_t {
            Builder builder;
            Fr x = Fr::from_witness(&builder, scalar_raw);
            [[maybe_unused]] auto result = compute_padding_indicator_array<Fr, Builder, domain_size>(x);

            size_t gate_count = builder.get_estimated_num_finalized_gates();
            return gate_count;
        };

        // Valid input: x in [1, domain_size - 1]
        uint256_t x_in_range = (domain_size - 1) / 2;
        size_t gates_in_range = get_gate_count(x_in_range);

        // Random input
        uint256_t random_scalar = engine.get_random_uint256();
        size_t gates_random = get_gate_count(random_scalar);

        EXPECT_EQ(gates_in_range, gates_random);
    }
};

using TestTypes = testing::Types<
    PaddingTestParams<bb::stdlib::bn254<bb::MegaCircuitBuilder_<bb::field<bb::Bn254FrParams>>>::ScalarField,
                      bb::MegaCircuitBuilder>,
    PaddingTestParams<stdlib::bn254<bb::UltraCircuitBuilder>::ScalarField, bb::UltraCircuitBuilder>>;

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
} // namespace

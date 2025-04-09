#include "bit_by_bit.hpp"
#include "../circuit_builders/circuit_builders_fwd.hpp"
#include "../witness/witness.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders.hpp"
#include "barretenberg/transcript/origin_tag.hpp"
#include <gtest/gtest.h>

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
        for (size_t idx = 1; idx < domain_size; idx++) {
            Builder builder;
            Fr x = Fr::from_witness(&builder, idx);

            auto result = compute_padding_indicator_array<Fr, Builder, domain_size>(x);
            info("num gates = ", builder.get_estimated_num_finalized_gates());

            EXPECT_TRUE(CircuitChecker::check(builder));
        }
    }

    void test_edge_cases()
    {

        // Check that log_circuit_size is constrained to be != 0
        {
            Builder builder;

            Fr zero = Fr::from_witness(&builder, 0);

            auto result = compute_padding_indicator_array<Fr, Builder, domain_size>(zero);
            info("num gates = ", builder.get_estimated_num_finalized_gates());

            EXPECT_FALSE(CircuitChecker::check(builder));
        }

        // Check that log_circuit_size can take the max possible value
        {
            Builder builder;

            Fr N = Fr::from_witness(&builder, domain_size);

            auto result = compute_padding_indicator_array<Fr, Builder, domain_size>(N);
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

            auto result = compute_padding_indicator_array<Fr, Builder, domain_size>(x);
            info("num gates = ", builder.get_estimated_num_finalized_gates());

            EXPECT_FALSE(CircuitChecker::check(builder));
        }
    }
};
} // namespace

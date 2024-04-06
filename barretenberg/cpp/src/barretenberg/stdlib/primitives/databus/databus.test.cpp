
#include <gtest/gtest.h>

#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/stdlib_circuit_builders/goblin_ultra_circuit_builder.hpp"
#include "databus.hpp"

using Builder = GoblinUltraCircuitBuilder;
using field_ct = stdlib::field_t<Builder>;
using witness_ct = stdlib::witness_t<Builder>;
using databus_ct = stdlib::databus<Builder>;

namespace {
auto& engine = numeric::get_debug_randomness();
}

TEST(Databus, CallDataAndReturnData)
{
    Builder builder;

    std::array<bb::fr, 4> raw_calldata_values = { 4, 5, 6, 7 };
    std::array<bb::fr, 3> raw_return_data_values = { 4, 5, 13 };

    // Instantiate bus vector with values
    databus_ct databus;

    // Populate calldata
    std::vector<field_ct> calldata_values;
    for (auto& value : raw_calldata_values) {
        calldata_values.emplace_back(witness_ct(&builder, value));
    }
    databus.calldata.set_values(calldata_values);

    // Populate return data
    std::vector<field_ct> return_data_values;
    for (auto& value : raw_return_data_values) {
        return_data_values.emplace_back(witness_ct(&builder, value));
    }
    databus.return_data.set_values(return_data_values);

    // Read the last two entries in calldata and compute their sum
    field_ct idx_1(witness_ct(&builder, 2));
    field_ct idx_2(witness_ct(&builder, 3));
    field_ct sum = databus.calldata[idx_1] + databus.calldata[idx_2];

    info("idx_1 = ", idx_1.get_value());
    info("idx_2 = ", idx_2.get_value());
    info("sum = ", sum.get_value());

    // Establish that the return data value at the appropriate index is equal to the sum of the last two calldata
    // values. Note: The assert_equal expression below establishes the correct formation of the return data at the final
    // index via: (1) linking the {index, value} witness pair in the return data read gate (created via operator[]) to
    // the corresponding values in the return data bus column, then (2) asserting equality (via a copy constraint)
    // between the 'value' component of the read gate and the computed sum.
    field_ct idx(witness_ct(&builder, 2));
    field_ct read_result = databus.return_data[idx];

    info("idx = ", idx.get_value());
    info("read_result = ", read_result.get_value());
    EXPECT_EQ(sum.get_value(), read_result.get_value());

    sum.assert_equal(read_result);

    // WORKTODO: I think if we update check circuit to check the databus reads then this will fail if we make a bad
    // assert equal. (It would also fail when verifying of course). When we go to check the read, the databus value will
    // differ from the read. Check this!

    EXPECT_TRUE(CircuitChecker::check(builder));
}

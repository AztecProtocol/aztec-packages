#include "barretenberg/vm/avm/trace/common.hpp"
#include "barretenberg/vm/avm/trace/helper.hpp"
#include "barretenberg/vm/avm/trace/kernel_trace.hpp"
#include "barretenberg/vm/avm/trace/public_inputs.hpp"
#include "barretenberg/vm/constants.hpp"
#include "common.test.hpp"

namespace tests_avm {
using namespace bb;
using namespace bb::avm_trace;

class AvmGasTests : public ::testing::Test {
  protected:
    // TODO(640): The Standard Honk on Grumpkin test suite fails unless the SRS is initialised for every test.
    void SetUp() override { srs::init_crs_factory(bb::srs::get_ignition_crs_path()); };
};

class AvmGasPositiveTests : public AvmGasTests {};
class AvmGasNegativeTests : public AvmGasTests {
  protected:
    void SetUp() override { GTEST_SKIP(); }
};

// Helper to set the initial gas parameters for each test
struct StartGas {
    uint32_t l2_gas;
    uint32_t da_gas;
};

// TODO: migrate to helper
// Template helper function to apply boilerplate around gas tests
template <typename OpcodesFunc, typename CheckFunc>
void test_gas(StartGas startGas, OpcodesFunc apply_opcodes, CheckFunc check_trace)
{
    AvmPublicInputs public_inputs;

    public_inputs.gas_settings.gas_limits.l2_gas = startGas.l2_gas;
    public_inputs.gas_settings.gas_limits.da_gas = startGas.da_gas;

    auto trace_builder =
        AvmTraceBuilder(public_inputs).set_full_precomputed_tables(false).set_range_check_required(false);

    // We should return a value of 1 for the sender, as it exists at index 0
    apply_opcodes(trace_builder);

    trace_builder.op_set(0, 0, 100, AvmMemoryTag::U32);
    trace_builder.op_return(0, 0, 100);

    auto trace = trace_builder.finalize();

    check_trace(trace);

    // log_avm_trace(trace, 0, 10);
    validate_trace(std::move(trace), public_inputs);
}

TEST_F(AvmGasPositiveTests, gasMov)
{
    StartGas start_gas = {
        .l2_gas = 3000,
        .da_gas = 10,
    };

    auto apply_opcodes = [=](AvmTraceBuilder& trace_builder) { trace_builder.op_mov(0, 1, 2); };

    auto checks = [=](const std::vector<Row>& trace) {
        auto sender_row =
            std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.main_sel_op_mov == FF(1); });
        EXPECT_TRUE(sender_row != trace.end());
    };

    test_gas(start_gas, apply_opcodes, checks);
}

} // namespace tests_avm

#include "avm_common.test.hpp"
#include "barretenberg/vm/avm_trace/avm_common.hpp"
#include "barretenberg/vm/avm_trace/avm_kernel_trace.hpp"
#include "barretenberg/vm/avm_trace/constants.hpp"
namespace tests_avm {
using namespace bb::avm_trace;

class AvmGasTests : public ::testing::Test {

  protected:
    // TODO(640): The Standard Honk on Grumpkin test suite fails unless the SRS is initialised for every test.
    void SetUp() override { srs::init_crs_factory("../srs_db/ignition"); };
};

class AvmGasPositiveTests : public AvmGasTests {};
class AvmGasNegativeTests : public AvmGasTests {};

using KernelInputs = std::array<FF, KERNEL_INPUTS_LENGTH>;

// Helper to set the initial gas paramters for each test
struct StartGas {
    uint32_t l2_gas;
    uint32_t da_gas;
};

// TODO: migrate to helper
// Template helper function to apply boilerplate around the kernel lookup tests
template <typename OpcodesFunc, typename CheckFunc>
void test_lookup(StartGas startGas, OpcodesFunc apply_opcodes, CheckFunc check_trace)
{
    KernelInputs kernel_inputs = {};

    kernel_inputs[L2_GAS_LEFT_CONTEXT_INPUTS_OFFSET] = FF(startGas.l2_gas);
    kernel_inputs[DA_GAS_LEFT_CONTEXT_INPUTS_OFFSET] = FF(startGas.da_gas);

    AvmTraceBuilder trace_builder(kernel_inputs);

    // We should return a value of 1 for the sender, as it exists at index 0
    apply_opcodes(trace_builder);

    trace_builder.halt();

    auto trace = trace_builder.finalize();

    check_trace(trace);

    validate_trace(std::move(trace), kernel_inputs);
}

TEST_F(AvmGasPositiveTests, gasAdd)
{
    StartGas start_gas = {
        .l2_gas = 300,
        .da_gas = 300,
    };

    // We test that the sender opcode is included at index 0 in the public inputs
    auto apply_opcodes = [=](AvmTraceBuilder& trace_builder) {
        // trace_builder.set()
        trace_builder.op_add(0, 1, 2, 3, AvmMemoryTag::FF);
    };
    auto checks = [=](const std::vector<Row>& trace) {
        std::vector<Row>::const_iterator sender_row =
            std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.avm_main_sel_op_add == FF(1); });
        EXPECT_TRUE(sender_row != trace.end());

        // Show the first few rows and see if the correct gas values are populated
        for (size_t i = 1; i < 5; i++) {
            info("Row ",
                 i,
                 " opcode active ",
                 trace[i].avm_main_opcode_active,
                 " l2 gas op: ",
                 trace[i].avm_main_l2_gas_op,
                 " | da gas op: ",
                 trace[i].avm_main_da_gas_op,
                 " | l2_rem ",
                 trace[i].avm_main_l2_gas_remaining,
                 " | da_rem ",
                 trace[i].avm_main_da_gas_remaining);
        }

        info("\n");
        info("\n");
        info("\n");
        for (size_t i = 1; i < 5; i++) {
            info("opcode val ", trace[i].avm_main_opcode_val);
            info("Row ",
                 i,
                 " l2_gas ",
                 trace[i].avm_main_l2_gas_op,
                 " table op: ",
                 trace[i].avm_gas_l2_gas_fixed_table,
                 " | da gas op: ",
                 trace[i].avm_main_da_gas_op,
                 " | da_rem ",
                 trace[i].avm_gas_da_gas_fixed_table);
        }
    };

    test_lookup(start_gas, apply_opcodes, checks);
}

} // namespace tests_avm
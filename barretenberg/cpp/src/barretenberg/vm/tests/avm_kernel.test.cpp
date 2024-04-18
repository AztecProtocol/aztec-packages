
#include "avm_common.test.hpp"
#include "barretenberg/vm/avm_trace/avm_kernel_trace.hpp"
#include "barretenberg/vm/avm_trace/constants.hpp"

namespace tests_avm {
using namespace bb::avm_trace;

class AvmEnvironmentTests : public ::testing::Test {

  protected:
    // TODO(640): The Standard Honk on Grumpkin test suite fails unless the SRS is initialised for every test.
    void SetUp() override { srs::init_crs_factory("../srs_db/ignition"); };
};

using KernelInputs = std::array<FF, KERNEL_INPUTS_LENGTH>;
KernelInputs get_kernel_inputs()
{
    std::array<FF, KERNEL_INPUTS_LENGTH> kernel_inputs;
    for (size_t i = 0; i < KERNEL_INPUTS_LENGTH; i++) {
        kernel_inputs[i] = FF(i + 1);
    }
    return kernel_inputs;
}

// Template helper function to apply boilerplate around the kernel lookup tests
template <typename OpcodesFunc, typename CheckFunc>
void test_kernel_lookup(OpcodesFunc apply_opcodes, CheckFunc check_trace)
{
    KernelInputs kernel_inputs = get_kernel_inputs();
    AvmTraceBuilder trace_builder(kernel_inputs);

    // We should return a value of 1 for the sender, as it exists at index 0
    apply_opcodes(trace_builder);

    trace_builder.halt();

    auto trace = trace_builder.finalize();

    check_trace(trace);

    validate_trace(std::move(trace), kernel_inputs);
}

/*
 * Helper function to assert row values for a kernel lookup opcode
 */
void expect_row(std::vector<Row>::const_iterator row, FF selector, FF ia, FF mem_idx_a)
{
    // Checks dependent on the opcode
    EXPECT_EQ(row->avm_kernel_kernel_sel, selector);
    EXPECT_EQ(row->avm_main_ia, ia);
    EXPECT_EQ(row->avm_main_mem_idx_a, mem_idx_a);

    // Checks that are fixed for kernel inputs
    EXPECT_EQ(row->avm_main_rwa, FF(1));
    EXPECT_EQ(row->avm_main_ind_a, FF(0));
    EXPECT_EQ(row->avm_mem_op_a, FF(1));
    // TODO: below should really be a field element for each type
    EXPECT_EQ(row->avm_main_w_in_tag, static_cast<uint32_t>(AvmMemoryTag::U32));
    EXPECT_EQ(row->avm_main_q_kernel_lookup, FF(1));
}

TEST_F(AvmEnvironmentTests, kernelSender)
{
    uint32_t dst_offset = 42;
    // We test that the sender opcode is inlcuded at index x in the public inputs
    auto apply_opcodes = [=](AvmTraceBuilder& trace_builder) { trace_builder.op_sender(dst_offset); };
    auto checks = [=](const std::vector<Row>& trace) {
        // When the sender selector is active, we should expect all of the memory operations to write in the expected
        // registers
        std::vector<Row>::const_iterator sender_row =
            std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.avm_main_sel_op_sender == FF(1); });
        EXPECT_TRUE(sender_row != trace.end());

        expect_row(sender_row,
                   /*kernel_sel=*/SENDER_SELECTOR,
                   /*ia=*/SENDER_SELECTOR +
                       1, // Note the value generated above for public inputs is the same as the index read + 1
                   /*mem_idx_a*/ dst_offset);
    };

    test_kernel_lookup(apply_opcodes, checks);
}

TEST_F(AvmEnvironmentTests, kernelAddress)
{
    uint32_t dst_offset = 42;
    auto apply_opcodes = [=](AvmTraceBuilder& trace_builder) { trace_builder.op_address(dst_offset); };
    auto checks = [=](const std::vector<Row>& trace) {
        // When the sender selector is active, we should expect all of the memory operations to write in the expected
        // registers
        std::vector<Row>::const_iterator address_row =
            std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.avm_main_sel_op_address == FF(1); });
        EXPECT_TRUE(address_row != trace.end());

        expect_row(address_row,
                   /*kernel_sel=*/ADDRESS_SELECTOR,
                   /*ia=*/ADDRESS_SELECTOR +
                       1, // Note the value generated above for public inputs is the same as the index read + 1
                   /*mem_idx_a*/ dst_offset);
    };
    test_kernel_lookup(apply_opcodes, checks);
}

TEST_F(AvmEnvironmentTests, kernelPortal)
{
    uint32_t dst_offset = 42;
    auto apply_opcodes = [=](AvmTraceBuilder& trace_builder) { trace_builder.op_portal(dst_offset); };
    auto checks = [=](const std::vector<Row>& trace) {
        // When the sender selector is active, we should expect all of the memory operations to write in the expected
        // registers
        std::vector<Row>::const_iterator portal_row =
            std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.avm_main_sel_op_portal == FF(1); });
        EXPECT_TRUE(portal_row != trace.end());

        expect_row(portal_row,
                   /*kernel_sel=*/PORTAL_SELECTOR,
                   /*ia=*/PORTAL_SELECTOR +
                       1, // Note the value generated above for public inputs is the same as the index read + 1
                   /*mem_idx_a*/ dst_offset);
    };
    test_kernel_lookup(apply_opcodes, checks);
}

TEST_F(AvmEnvironmentTests, kernelFunction)
{
    uint32_t dst_offset = 42;
    auto apply_opcodes = [=](AvmTraceBuilder& trace_builder) { trace_builder.op_function(dst_offset); };
    auto checks = [=](const std::vector<Row>& trace) {
        // When the sender selector is active, we should expect all of the memory operations to write in the expected
        // registers
        std::vector<Row>::const_iterator function_row = std::ranges::find_if(
            trace.begin(), trace.end(), [](Row r) { return r.avm_main_sel_op_function_selector == FF(1); });
        EXPECT_TRUE(function_row != trace.end());

        expect_row(function_row,
                   /*kernel_sel=*/FUNCTION_SELECTOR,
                   /*ia=*/FUNCTION_SELECTOR +
                       1, // Note the value generated above for public inputs is the same as the index read + 1
                   /*mem_idx_a*/ dst_offset);
    };
    test_kernel_lookup(apply_opcodes, checks);
}

TEST_F(AvmEnvironmentTests, kernelFeePerDa)
{
    uint32_t dst_offset = 42;
    auto apply_opcodes = [=](AvmTraceBuilder& trace_builder) { trace_builder.op_fee_per_da_gas(dst_offset); };
    auto checks = [=](const std::vector<Row>& trace) {
        // When the sender selector is active, we should expect all of the memory operations to write in the expected
        // registers
        std::vector<Row>::const_iterator fee_row = std::ranges::find_if(
            trace.begin(), trace.end(), [](Row r) { return r.avm_main_sel_op_fee_per_da_gas == FF(1); });
        EXPECT_TRUE(fee_row != trace.end());

        expect_row(fee_row,
                   /*kernel_sel=*/FEE_PER_DA_GAS_SELECTOR,
                   /*ia=*/FEE_PER_DA_GAS_SELECTOR +
                       1, // Note the value generated above for public inputs is the same as the index read + 1
                   /*mem_idx_a*/ dst_offset);
    };
    test_kernel_lookup(apply_opcodes, checks);
}

TEST_F(AvmEnvironmentTests, kernelFeePerL1)
{
    uint32_t dst_offset = 42;
    auto apply_opcodes = [=](AvmTraceBuilder& trace_builder) { trace_builder.op_fee_per_l1_gas(dst_offset); };
    auto checks = [=](const std::vector<Row>& trace) {
        // When the sender selector is active, we should expect all of the memory operations to write in the expected
        // registers
        std::vector<Row>::const_iterator fee_row = std::ranges::find_if(
            trace.begin(), trace.end(), [](Row r) { return r.avm_main_sel_op_fee_per_l1_gas == FF(1); });
        EXPECT_TRUE(fee_row != trace.end());

        expect_row(fee_row,
                   /*kernel_sel=*/FEE_PER_L1_GAS_SELECTOR,
                   /*ia=*/FEE_PER_L1_GAS_SELECTOR +
                       1, // Note the value generated above for public inputs is the same as the index read + 1
                   /*mem_idx_a*/ dst_offset);
    };
    test_kernel_lookup(apply_opcodes, checks);
}

TEST_F(AvmEnvironmentTests, kernelFeePerL2)
{
    uint32_t dst_offset = 42;
    auto apply_opcodes = [=](AvmTraceBuilder& trace_builder) { trace_builder.op_fee_per_l2_gas(dst_offset); };
    auto checks = [=](const std::vector<Row>& trace) {
        // When the sender selector is active, we should expect all of the memory operations to write in the expected
        // registers
        std::vector<Row>::const_iterator fee_row = std::ranges::find_if(
            trace.begin(), trace.end(), [](Row r) { return r.avm_main_sel_op_fee_per_l2_gas == FF(1); });
        EXPECT_TRUE(fee_row != trace.end());

        expect_row(fee_row,
                   /*kernel_sel=*/FEE_PER_L2_GAS_SELECTOR,
                   /*ia=*/FEE_PER_L2_GAS_SELECTOR +
                       1, // Note the value generated above for public inputs is the same as the index read + 1
                   /*mem_idx_a*/ dst_offset);
    };
    test_kernel_lookup(apply_opcodes, checks);
}

} // namespace tests_avm
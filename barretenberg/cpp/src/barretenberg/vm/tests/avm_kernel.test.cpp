
#include "avm_common.test.hpp"
#include "barretenberg/vm/avm_trace/avm_common.hpp"
#include "barretenberg/vm/avm_trace/avm_kernel_trace.hpp"
#include "barretenberg/vm/avm_trace/constants.hpp"
#include "barretenberg/vm/tests/helpers.test.hpp"

namespace tests_avm {
using namespace bb;
using namespace bb::avm_trace;

class AvmKernelTests : public ::testing::Test {

  protected:
    // TODO(640): The Standard Honk on Grumpkin test suite fails unless the SRS is initialised for every test.
    void SetUp() override { srs::init_crs_factory("../srs_db/ignition"); };
};

class AvmKernelPositiveTests : public ::testing::Test {};
class AvmKernelNegativeTests : public ::testing::Test {};

using KernelInputs = std::array<FF, KERNEL_INPUTS_LENGTH>;

VmPublicInputs get_public_inputs()
{
    VmPublicInputs public_inputs = {};

    std::array<FF, KERNEL_INPUTS_LENGTH> kernel_inputs;
    for (size_t i = 0; i < KERNEL_INPUTS_LENGTH; i++) {
        kernel_inputs[i] = FF(i + 1);
    }

    // Copy the kernel inputs into the public inputs object
    std::get<0>(public_inputs) = kernel_inputs;

    return public_inputs;
}

// Template helper function to apply boilerplate around the kernel lookup tests
template <typename OpcodesFunc, typename CheckFunc>
void test_kernel_lookup(OpcodesFunc apply_opcodes, CheckFunc check_trace)
{
    VmPublicInputs public_inputs = get_public_inputs();

    AvmTraceBuilder trace_builder(public_inputs);

    // We should return a value of 1 for the sender, as it exists at index 0
    apply_opcodes(trace_builder);

    trace_builder.halt();

    auto trace = trace_builder.finalize();

    check_trace(trace);

    validate_trace(std::move(trace), public_inputs);
}

/*
 * Helper function to assert row values for a kernel lookup opcode
 */
void expect_row(std::vector<Row>::const_iterator row, FF selector, FF ia, FF mem_idx_a, AvmMemoryTag w_in_tag)
{
    // Checks dependent on the opcode
    EXPECT_EQ(row->avm_kernel_kernel_in_offset, selector);
    EXPECT_EQ(row->avm_main_ia, ia);
    EXPECT_EQ(row->avm_main_mem_idx_a, mem_idx_a);

    // Checks that are fixed for kernel inputs
    EXPECT_EQ(row->avm_main_rwa, FF(1));
    EXPECT_EQ(row->avm_main_ind_a, FF(0));
    EXPECT_EQ(row->avm_mem_op_a, FF(1));
    EXPECT_EQ(row->avm_main_w_in_tag, static_cast<uint32_t>(w_in_tag));
    EXPECT_EQ(row->avm_main_q_kernel_lookup, FF(1));
}

void expect_output_table_row(std::vector<Row>::const_iterator row,
                             FF selector,
                             FF ia,
                             FF mem_idx_a,
                             AvmMemoryTag w_in_tag,
                             uint32_t side_effect_counter)
{
    // Checks dependent on the opcode
    EXPECT_EQ(row->avm_kernel_kernel_out_offset, selector);
    EXPECT_EQ(row->avm_main_ia, ia);
    EXPECT_EQ(row->avm_main_mem_idx_a, mem_idx_a);

    // Checks that are fixed for kernel inputs
    EXPECT_EQ(row->avm_main_rwa, FF(0));
    EXPECT_EQ(row->avm_main_ind_a, FF(0));
    EXPECT_EQ(row->avm_main_mem_op_a, FF(1));
    EXPECT_EQ(row->avm_main_r_in_tag, static_cast<uint32_t>(w_in_tag));
    EXPECT_EQ(row->avm_main_q_kernel_output_lookup, FF(1));

    EXPECT_EQ(row->avm_kernel_side_effect_counter, FF(side_effect_counter));
}

void expect_output_table_row_with_metadata(std::vector<Row>::const_iterator row,
                                           FF selector,
                                           FF ia,
                                           FF mem_idx_a,
                                           FF ib,
                                           FF mem_idx_b,
                                           AvmMemoryTag w_in_tag,
                                           uint32_t side_effect_counter)
{
    expect_output_table_row(row, selector, ia, mem_idx_a, w_in_tag, side_effect_counter);

    EXPECT_EQ(row->avm_main_ib, ib);
    EXPECT_EQ(row->avm_main_mem_idx_b, mem_idx_b);

    // Checks that are fixed for kernel inputs
    EXPECT_EQ(row->avm_main_rwb, FF(0));
    EXPECT_EQ(row->avm_main_ind_b, FF(0));
    EXPECT_EQ(row->avm_main_mem_op_b, FF(1));
}

void expect_output_table_row_with_exists_metadata(std::vector<Row>::const_iterator row,
                                                  FF selector,
                                                  FF ia,
                                                  FF mem_idx_a,
                                                  FF ib,
                                                  FF mem_idx_b,
                                                  AvmMemoryTag w_in_tag,
                                                  uint32_t side_effect_counter)
{
    expect_output_table_row(row, selector, ia, mem_idx_a, w_in_tag, side_effect_counter);

    EXPECT_EQ(row->avm_main_ib, ib);
    EXPECT_EQ(row->avm_main_mem_idx_b, mem_idx_b);

    // Checks that are fixed for kernel inputs
    EXPECT_EQ(row->avm_main_rwb, FF(1));
    EXPECT_EQ(row->avm_main_ind_b, FF(0));
    EXPECT_EQ(row->avm_main_mem_op_b, FF(1));
}

void check_kernel_outputs(const Row& row, FF value, FF side_effect_counter, FF metadata)
{
    EXPECT_EQ(row.avm_kernel_kernel_value_out__is_public, value);
    EXPECT_EQ(row.avm_kernel_kernel_side_effect_out__is_public, side_effect_counter);
    EXPECT_EQ(row.avm_kernel_kernel_metadata_out__is_public, metadata);
}

TEST_F(AvmKernelPositiveTests, kernelSender)
{
    uint32_t dst_offset = 42;
    // We test that the sender opcode is included at index 0 in the public inputs
    auto apply_opcodes = [=](AvmTraceBuilder& trace_builder) { trace_builder.op_sender(dst_offset); };
    auto checks = [=](const std::vector<Row>& trace) {
        std::vector<Row>::const_iterator row =
            std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.avm_main_sel_op_sender == FF(1); });
        EXPECT_TRUE(row != trace.end());

        expect_row(row,
                   /*kernel_in_offset=*/SENDER_SELECTOR,
                   /*ia=*/SENDER_SELECTOR +
                       1, // Note the value generated above for public inputs is the same as the index read + 1
                   /*mem_idx_a=*/dst_offset,
                   /*w_in_tag=*/AvmMemoryTag::FF);
    };

    test_kernel_lookup(apply_opcodes, checks);
}

TEST_F(AvmKernelPositiveTests, kernelAddress)
{
    uint32_t dst_offset = 42;
    auto apply_opcodes = [=](AvmTraceBuilder& trace_builder) { trace_builder.op_address(dst_offset); };
    auto checks = [=](const std::vector<Row>& trace) {
        std::vector<Row>::const_iterator address_row =
            std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.avm_main_sel_op_address == FF(1); });
        EXPECT_TRUE(address_row != trace.end());

        expect_row(address_row,
                   /*kernel_in_offset=*/ADDRESS_SELECTOR,
                   /*ia=*/ADDRESS_SELECTOR +
                       1, // Note the value generated above for public inputs is the same as the index read + 1
                   /*mem_idx_a=*/dst_offset,
                   /*w_in_tag=*/AvmMemoryTag::FF);
    };
    test_kernel_lookup(apply_opcodes, checks);
}

TEST_F(AvmKernelPositiveTests, kernelFeePerDa)
{
    uint32_t dst_offset = 42;
    auto apply_opcodes = [=](AvmTraceBuilder& trace_builder) { trace_builder.op_fee_per_da_gas(dst_offset); };
    auto checks = [=](const std::vector<Row>& trace) {
        std::vector<Row>::const_iterator fee_row = std::ranges::find_if(
            trace.begin(), trace.end(), [](Row r) { return r.avm_main_sel_op_fee_per_da_gas == FF(1); });
        EXPECT_TRUE(fee_row != trace.end());

        expect_row(fee_row,
                   /*kernel_in_offset=*/FEE_PER_DA_GAS_SELECTOR,
                   /*ia=*/FEE_PER_DA_GAS_SELECTOR +
                       1, // Note the value generated above for public inputs is the same as the index read + 1
                   /*mem_idx_a=*/dst_offset,
                   /*w_in_tag=*/AvmMemoryTag::FF);
    };
    test_kernel_lookup(apply_opcodes, checks);
}

TEST_F(AvmKernelPositiveTests, kernelFeePerL2)
{
    uint32_t dst_offset = 42;
    auto apply_opcodes = [=](AvmTraceBuilder& trace_builder) { trace_builder.op_fee_per_l2_gas(dst_offset); };
    auto checks = [=](const std::vector<Row>& trace) {
        std::vector<Row>::const_iterator fee_row = std::ranges::find_if(
            trace.begin(), trace.end(), [](Row r) { return r.avm_main_sel_op_fee_per_l2_gas == FF(1); });
        EXPECT_TRUE(fee_row != trace.end());

        expect_row(fee_row,
                   /*kernel_in_offset=*/FEE_PER_L2_GAS_SELECTOR,
                   /*ia=*/FEE_PER_L2_GAS_SELECTOR +
                       1, // Note the value generated above for public inputs is the same as the index read + 1
                   /*mem_idx_a=*/dst_offset,
                   /*w_in_tag=*/AvmMemoryTag::FF);
    };
    test_kernel_lookup(apply_opcodes, checks);
}

TEST_F(AvmKernelPositiveTests, kernelTransactionFee)
{
    uint32_t dst_offset = 42;
    auto apply_opcodes = [=](AvmTraceBuilder& trace_builder) { trace_builder.op_transaction_fee(dst_offset); };
    auto checks = [=](const std::vector<Row>& trace) {
        std::vector<Row>::const_iterator fee_row = std::ranges::find_if(
            trace.begin(), trace.end(), [](Row r) { return r.avm_main_sel_op_transaction_fee == FF(1); });
        EXPECT_TRUE(fee_row != trace.end());

        expect_row(fee_row,
                   /*kernel_in_offset=*/TRANSACTION_FEE_SELECTOR,
                   /*ia=*/TRANSACTION_FEE_SELECTOR +
                       1, // Note the value generated above for public inputs is the same as the index read + 1
                   /*mem_idx_a=*/dst_offset,
                   /*w_in_tag=*/AvmMemoryTag::FF);
    };
    test_kernel_lookup(apply_opcodes, checks);
}

TEST_F(AvmKernelPositiveTests, kernelChainId)
{
    uint32_t dst_offset = 42;
    auto apply_opcodes = [=](AvmTraceBuilder& trace_builder) { trace_builder.op_chain_id(dst_offset); };
    auto checks = [=](const std::vector<Row>& trace) {
        std::vector<Row>::const_iterator fee_row =
            std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.avm_main_sel_op_chain_id == FF(1); });
        EXPECT_TRUE(fee_row != trace.end());

        expect_row(fee_row,
                   /*kernel_in_offset=*/CHAIN_ID_SELECTOR,
                   /*ia=*/CHAIN_ID_SELECTOR +
                       1, // Note the value generated above for public inputs is the same as the index read + 1
                   /*mem_idx_a=*/dst_offset,
                   /*w_in_tag=*/AvmMemoryTag::FF);
    };
    test_kernel_lookup(apply_opcodes, checks);
}

TEST_F(AvmKernelPositiveTests, kernelVersion)
{
    uint32_t dst_offset = 42;
    auto apply_opcodes = [=](AvmTraceBuilder& trace_builder) { trace_builder.op_version(dst_offset); };
    auto checks = [=](const std::vector<Row>& trace) {
        std::vector<Row>::const_iterator fee_row =
            std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.avm_main_sel_op_version == FF(1); });
        EXPECT_TRUE(fee_row != trace.end());

        expect_row(fee_row,
                   /*kernel_in_offset=*/VERSION_SELECTOR,
                   /*ia=*/VERSION_SELECTOR +
                       1, // Note the value generated above for public inputs is the same as the index read + 1
                   /*mem_idx_a=*/dst_offset,
                   /*w_in_tag=*/AvmMemoryTag::FF);
    };
    test_kernel_lookup(apply_opcodes, checks);
}

TEST_F(AvmKernelPositiveTests, kernelBlockNumber)
{
    uint32_t dst_offset = 42;
    auto apply_opcodes = [=](AvmTraceBuilder& trace_builder) { trace_builder.op_block_number(dst_offset); };
    auto checks = [=](const std::vector<Row>& trace) {
        std::vector<Row>::const_iterator fee_row = std::ranges::find_if(
            trace.begin(), trace.end(), [](Row r) { return r.avm_main_sel_op_block_number == FF(1); });
        EXPECT_TRUE(fee_row != trace.end());

        expect_row(fee_row,
                   /*kernel_in_offset=*/BLOCK_NUMBER_SELECTOR,
                   /*ia=*/BLOCK_NUMBER_SELECTOR +
                       1, // Note the value generated above for public inputs is the same as the index read + 1
                   /*mem_idx_a=*/dst_offset,
                   /*w_in_tag=*/AvmMemoryTag::FF);
    };
    test_kernel_lookup(apply_opcodes, checks);
}

TEST_F(AvmKernelPositiveTests, kernelCoinbase)
{
    uint32_t dst_offset = 42;
    auto apply_opcodes = [=](AvmTraceBuilder& trace_builder) { trace_builder.op_coinbase(dst_offset); };
    auto checks = [=](const std::vector<Row>& trace) {
        std::vector<Row>::const_iterator fee_row =
            std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.avm_main_sel_op_coinbase == FF(1); });
        EXPECT_TRUE(fee_row != trace.end());

        expect_row(fee_row,
                   /*kernel_in_offset=*/COINBASE_SELECTOR,
                   /*ia=*/COINBASE_SELECTOR +
                       1, // Note the value generated above for public inputs is the same as the index read + 1
                   /*mem_idx_a*/ dst_offset,
                   /*w_in_tag=*/AvmMemoryTag::FF);
    };
    test_kernel_lookup(apply_opcodes, checks);
}

TEST_F(AvmKernelPositiveTests, kernelTimestamp)
{
    uint32_t dst_offset = 42;
    auto apply_opcodes = [=](AvmTraceBuilder& trace_builder) { trace_builder.op_timestamp(dst_offset); };
    auto checks = [=](const std::vector<Row>& trace) {
        std::vector<Row>::const_iterator fee_row = std::ranges::find_if(
            trace.begin(), trace.end(), [](Row r) { return r.avm_main_sel_op_timestamp == FF(1); });
        EXPECT_TRUE(fee_row != trace.end());

        expect_row(fee_row,
                   /*kernel_in_offset=*/TIMESTAMP_SELECTOR,
                   /*ia=*/TIMESTAMP_SELECTOR +
                       1, // Note the value generated above for public inputs is the same as the index read + 1
                   /*mem_idx_a*/ dst_offset,
                   /*w_in_tag=*/AvmMemoryTag::U64);
    };
    test_kernel_lookup(apply_opcodes, checks);
}

/**
 * Negative Tests
 */

// Template helper function to apply boilerplate
template <typename OpcodesFunc, typename CheckFunc>
void negative_test_incorrect_ia_kernel_lookup(OpcodesFunc apply_opcodes,
                                              CheckFunc check_trace,
                                              FF incorrect_ia,
                                              auto expected_message)
{
    VmPublicInputs public_inputs = get_public_inputs();
    AvmTraceBuilder trace_builder(public_inputs);

    // We should return a value of 1 for the sender, as it exists at index 0
    apply_opcodes(trace_builder);

    trace_builder.halt();

    auto trace = trace_builder.finalize();

    // Change IA to be a value not in the lookup
    // Change the first row, as that will be where each of the opcodes are in the test
    auto& ta = trace.at(1);

    ta.avm_main_ia = incorrect_ia;

    check_trace(trace);

    EXPECT_THROW_WITH_MESSAGE(validate_trace_check_circuit(std::move(trace), public_inputs), expected_message);
}

TEST_F(AvmKernelNegativeTests, incorrectIaSender)
{
    uint32_t dst_offset = 42;
    FF incorrect_ia = FF(69);

    // We test that the sender opcode is inlcuded at index x in the public inputs
    auto apply_opcodes = [=](AvmTraceBuilder& trace_builder) { trace_builder.op_sender(dst_offset); };
    auto checks = [=](const std::vector<Row>& trace) {
        std::vector<Row>::const_iterator row =
            std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.avm_main_sel_op_sender == FF(1); });
        EXPECT_TRUE(row != trace.end());

        expect_row(
            row,
            /*kernel_in_offset=*/SENDER_SELECTOR,
            /*ia=*/incorrect_ia, // Note the value generated above for public inputs is the same as the index read + 1
            /*mem_idx_a=*/dst_offset,
            /*w_in_tag=*/AvmMemoryTag::FF);
    };

    negative_test_incorrect_ia_kernel_lookup(apply_opcodes, checks, incorrect_ia, "PERM_MAIN_MEM_A");
}

TEST_F(AvmKernelNegativeTests, incorrectIaAddress)
{
    uint32_t dst_offset = 42;
    FF incorrect_ia = FF(69);

    // We test that the sender opcode is inlcuded at index x in the public inputs
    auto apply_opcodes = [=](AvmTraceBuilder& trace_builder) { trace_builder.op_address(dst_offset); };
    auto checks = [=](const std::vector<Row>& trace) {
        std::vector<Row>::const_iterator row =
            std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.avm_main_sel_op_address == FF(1); });
        EXPECT_TRUE(row != trace.end());

        expect_row(
            row,
            /*kernel_in_offset=*/ADDRESS_SELECTOR,
            /*ia=*/incorrect_ia, // Note the value generated above for public inputs is the same as the index read + 1
            /*mem_idx_a=*/dst_offset,
            /*w_in_tag=*/AvmMemoryTag::FF);
    };

    negative_test_incorrect_ia_kernel_lookup(apply_opcodes, checks, incorrect_ia, "PERM_MAIN_MEM_A");
}

TEST_F(AvmKernelNegativeTests, incorrectIaDaGas)
{
    uint32_t dst_offset = 42;
    FF incorrect_ia = FF(69);

    // We test that the sender opcode is inlcuded at index x in the public inputs
    auto apply_opcodes = [=](AvmTraceBuilder& trace_builder) { trace_builder.op_fee_per_da_gas(dst_offset); };
    auto checks = [=](const std::vector<Row>& trace) {
        std::vector<Row>::const_iterator row = std::ranges::find_if(
            trace.begin(), trace.end(), [](Row r) { return r.avm_main_sel_op_fee_per_da_gas == FF(1); });
        EXPECT_TRUE(row != trace.end());

        expect_row(
            row,
            /*kernel_in_offset=*/FEE_PER_DA_GAS_SELECTOR,
            /*ia=*/incorrect_ia, // Note the value generated above for public inputs is the same as the index read + 1
            /*mem_idx_a=*/dst_offset,
            /*w_in_tag=*/AvmMemoryTag::FF);
    };

    negative_test_incorrect_ia_kernel_lookup(apply_opcodes, checks, incorrect_ia, "PERM_MAIN_MEM_A");
}

TEST_F(AvmKernelNegativeTests, incorrectIal2Gas)
{
    uint32_t dst_offset = 42;
    FF incorrect_ia = FF(69);

    // We test that the sender opcode is inlcuded at index x in the public inputs
    auto apply_opcodes = [=](AvmTraceBuilder& trace_builder) { trace_builder.op_fee_per_l2_gas(dst_offset); };
    auto checks = [=](const std::vector<Row>& trace) {
        std::vector<Row>::const_iterator row = std::ranges::find_if(
            trace.begin(), trace.end(), [](Row r) { return r.avm_main_sel_op_fee_per_l2_gas == FF(1); });
        EXPECT_TRUE(row != trace.end());

        expect_row(
            row,
            /*kernel_in_offset=*/FEE_PER_L2_GAS_SELECTOR,
            /*ia=*/incorrect_ia, // Note the value generated above for public inputs is the same as the index read + 1
            /*mem_idx_a=*/dst_offset,
            /*w_in_tag=*/AvmMemoryTag::FF);
    };

    negative_test_incorrect_ia_kernel_lookup(apply_opcodes, checks, incorrect_ia, "PERM_MAIN_MEM_A");
}

TEST_F(AvmKernelNegativeTests, incorrectIaTransactionFee)
{
    uint32_t dst_offset = 42;
    FF incorrect_ia = FF(69);

    // We test that the sender opcode is inlcuded at index x in the public inputs
    auto apply_opcodes = [=](AvmTraceBuilder& trace_builder) { trace_builder.op_transaction_fee(dst_offset); };
    auto checks = [=](const std::vector<Row>& trace) {
        std::vector<Row>::const_iterator row = std::ranges::find_if(
            trace.begin(), trace.end(), [](Row r) { return r.avm_main_sel_op_transaction_fee == FF(1); });
        EXPECT_TRUE(row != trace.end());

        expect_row(
            row,
            /*kernel_in_offset=*/TRANSACTION_FEE_SELECTOR,
            /*ia=*/incorrect_ia, // Note the value generated above for public inputs is the same as the index read + 1
            /*mem_idx_a=*/dst_offset,
            /*w_in_tag=*/AvmMemoryTag::FF);
    };

    negative_test_incorrect_ia_kernel_lookup(apply_opcodes, checks, incorrect_ia, "PERM_MAIN_MEM_A");
}

TEST_F(AvmKernelNegativeTests, incorrectIaChainId)
{
    uint32_t dst_offset = 42;
    FF incorrect_ia = FF(69);

    // We test that the sender opcode is inlcuded at index x in the public inputs
    auto apply_opcodes = [=](AvmTraceBuilder& trace_builder) { trace_builder.op_chain_id(dst_offset); };
    auto checks = [=](const std::vector<Row>& trace) {
        std::vector<Row>::const_iterator row =
            std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.avm_main_sel_op_chain_id == FF(1); });
        EXPECT_TRUE(row != trace.end());

        expect_row(
            row,
            /*kernel_in_offset=*/CHAIN_ID_SELECTOR,
            /*ia=*/incorrect_ia, // Note the value generated above for public inputs is the same as the index read + 1
            /*mem_idx_a=*/dst_offset,
            /*w_in_tag=*/AvmMemoryTag::FF);
    };

    negative_test_incorrect_ia_kernel_lookup(apply_opcodes, checks, incorrect_ia, "PERM_MAIN_MEM_A");
}

TEST_F(AvmKernelNegativeTests, incorrectIaVersion)
{
    uint32_t dst_offset = 42;
    FF incorrect_ia = FF(69);

    // We test that the sender opcode is inlcuded at index x in the public inputs
    auto apply_opcodes = [=](AvmTraceBuilder& trace_builder) { trace_builder.op_version(dst_offset); };
    auto checks = [=](const std::vector<Row>& trace) {
        std::vector<Row>::const_iterator row =
            std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.avm_main_sel_op_version == FF(1); });
        EXPECT_TRUE(row != trace.end());

        expect_row(
            row,
            /*kernel_in_offset=*/VERSION_SELECTOR,
            /*ia=*/incorrect_ia, // Note the value generated above for public inputs is the same as the index read + 1
            /*mem_idx_a=*/dst_offset,
            /*w_in_tag=*/AvmMemoryTag::FF);
    };

    negative_test_incorrect_ia_kernel_lookup(apply_opcodes, checks, incorrect_ia, "PERM_MAIN_MEM_A");
}

TEST_F(AvmKernelNegativeTests, incorrectIaBlockNumber)
{
    uint32_t dst_offset = 42;
    FF incorrect_ia = FF(69);

    // We test that the sender opcode is inlcuded at index x in the public inputs
    auto apply_opcodes = [=](AvmTraceBuilder& trace_builder) { trace_builder.op_block_number(dst_offset); };
    auto checks = [=](const std::vector<Row>& trace) {
        std::vector<Row>::const_iterator row = std::ranges::find_if(
            trace.begin(), trace.end(), [](Row r) { return r.avm_main_sel_op_block_number == FF(1); });
        EXPECT_TRUE(row != trace.end());

        expect_row(
            row,
            /*kernel_in_offset=*/BLOCK_NUMBER_SELECTOR,
            /*ia=*/incorrect_ia, // Note the value generated above for public inputs is the same as the index read + 1
            /*mem_idx_a=*/dst_offset,
            /*w_in_tag=*/AvmMemoryTag::FF);
    };

    negative_test_incorrect_ia_kernel_lookup(apply_opcodes, checks, incorrect_ia, "PERM_MAIN_MEM_A");
}

TEST_F(AvmKernelNegativeTests, incorrectIaTimestamp)
{
    uint32_t dst_offset = 42;
    FF incorrect_ia = FF(69);

    // We test that the sender opcode is inlcuded at index x in the public inputs
    auto apply_opcodes = [=](AvmTraceBuilder& trace_builder) { trace_builder.op_timestamp(dst_offset); };
    auto checks = [=](const std::vector<Row>& trace) {
        std::vector<Row>::const_iterator row = std::ranges::find_if(
            trace.begin(), trace.end(), [](Row r) { return r.avm_main_sel_op_timestamp == FF(1); });
        EXPECT_TRUE(row != trace.end());

        expect_row(
            row,
            /*kernel_in_offset=*/TIMESTAMP_SELECTOR,
            /*ia=*/incorrect_ia, // Note the value generated above for public inputs is the same as the index read + 1
            /*mem_idx_a*/ dst_offset,
            /*w_in_tag=*/AvmMemoryTag::U64);
    };

    negative_test_incorrect_ia_kernel_lookup(apply_opcodes, checks, incorrect_ia, "PERM_MAIN_MEM_A");
}

TEST_F(AvmKernelNegativeTests, incorrectIaCoinbase)
{
    uint32_t dst_offset = 42;
    FF incorrect_ia = FF(69);

    // We test that the sender opcode is inlcuded at index x in the public inputs
    auto apply_opcodes = [=](AvmTraceBuilder& trace_builder) { trace_builder.op_coinbase(dst_offset); };
    auto checks = [=](const std::vector<Row>& trace) {
        std::vector<Row>::const_iterator row =
            std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.avm_main_sel_op_coinbase == FF(1); });
        EXPECT_TRUE(row != trace.end());

        expect_row(
            row,
            /*kernel_in_offset=*/COINBASE_SELECTOR,
            /*ia=*/incorrect_ia, // Note the value generated above for public inputs is the same as the index read + 1
            /*mem_idx_a=*/dst_offset,
            /*w_in_tag=*/AvmMemoryTag::FF);
    };

    negative_test_incorrect_ia_kernel_lookup(apply_opcodes, checks, incorrect_ia, "PERM_MAIN_MEM_A");
}

// KERNEL OUTPUTS
class AvmKernelOutputPositiveTests : public ::testing::Test {};
class AvmKernelOutputNegativeTests : public ::testing::Test {};

TEST_F(AvmKernelOutputPositiveTests, kernelEmitNoteHash)
{
    uint32_t offset = 42;
    // We write the note hash into memory
    auto apply_opcodes = [=](AvmTraceBuilder& trace_builder) {
        trace_builder.op_set(0, 1234, offset, AvmMemoryTag::FF);
        trace_builder.op_emit_note_hash(offset);
    };
    auto checks = [=](const std::vector<Row>& trace) {
        std::vector<Row>::const_iterator row = std::ranges::find_if(
            trace.begin(), trace.end(), [](Row r) { return r.avm_main_sel_op_emit_note_hash == FF(1); });
        EXPECT_TRUE(row != trace.end());

        // Check the outputs of the trace
        uint32_t output_offset = AvmKernelTraceBuilder::START_EMIT_NOTE_HASH_WRITE_OFFSET;

        expect_output_table_row(
            row,
            /*kernel_in_offset=*/output_offset,
            /*ia=*/1234, // Note the value generated above for public inputs is the same as the index read + 1
            /*mem_idx_a=*/offset,
            /*w_in_tag=*/AvmMemoryTag::FF,
            /*side_effect_counter=*/0);

        check_kernel_outputs(trace.at(output_offset + 1), 1234, /*side_effect_counter=*/0, /*metadata=*/0);
    };

    test_kernel_lookup(apply_opcodes, checks);
}

TEST_F(AvmKernelOutputPositiveTests, kernelEmitNullifier)
{
    uint32_t offset = 42;
    auto apply_opcodes = [=](AvmTraceBuilder& trace_builder) {
        trace_builder.op_set(0, 1234, offset, AvmMemoryTag::FF);
        trace_builder.op_emit_nullifier(offset);
    };
    auto checks = [=](const std::vector<Row>& trace) {
        std::vector<Row>::const_iterator row = std::ranges::find_if(
            trace.begin(), trace.end(), [](Row r) { return r.avm_main_sel_op_emit_nullifier == FF(1); });
        EXPECT_TRUE(row != trace.end());

        // Check the outputs of the trace
        uint32_t output_offset = AvmKernelTraceBuilder::START_EMIT_NULLIFIER_WRITE_OFFSET;

        expect_output_table_row(
            row,
            /*kernel_in_offset=*/output_offset,
            /*ia=*/1234, // Note the value generated above for public inputs is the same as the index read + 1
            /*mem_idx_a=*/offset,
            /*w_in_tag=*/AvmMemoryTag::FF,
            /*side_effect_counter=*/0);

        // Validate lookup and counts
        // Plus 1 as we have a padded empty first row
        check_kernel_outputs(trace.at(output_offset + 1), 1234, /*side_effect_counter=*/0, /*metadata=*/0);
    };

    test_kernel_lookup(apply_opcodes, checks);
}

TEST_F(AvmKernelOutputPositiveTests, kernelEmitL2ToL1Msg)
{
    uint32_t offset = 42;
    auto apply_opcodes = [=](AvmTraceBuilder& trace_builder) {
        trace_builder.op_set(0, 1234, offset, AvmMemoryTag::FF);
        trace_builder.op_emit_l2_to_l1_msg(offset);
    };
    auto checks = [=](const std::vector<Row>& trace) {
        std::vector<Row>::const_iterator row = std::ranges::find_if(
            trace.begin(), trace.end(), [](Row r) { return r.avm_main_sel_op_emit_l2_to_l1_msg == FF(1); });
        EXPECT_TRUE(row != trace.end());

        // Check the outputs of the trace
        uint32_t output_offset = AvmKernelTraceBuilder::START_L2_TO_L1_MSG_WRITE_OFFSET;

        expect_output_table_row(
            row,
            /*kernel_in_offset=*/output_offset,
            /*ia=*/1234, // Note the value generated above for public inputs is the same as the index read + 1
            /*mem_idx_a=*/offset,
            /*w_in_tag=*/AvmMemoryTag::FF,
            /*side_effect_counter=*/0

        );

        check_kernel_outputs(trace.at(output_offset + 1), 1234, /*side_effect_counter=*/0, /*metadata=*/0);
    };

    test_kernel_lookup(apply_opcodes, checks);
}

TEST_F(AvmKernelOutputPositiveTests, kernelEmitUnencryptedLog)
{
    uint32_t offset = 42;
    auto apply_opcodes = [=](AvmTraceBuilder& trace_builder) {
        trace_builder.op_set(0, 1234, offset, AvmMemoryTag::FF);
        trace_builder.op_emit_unencrypted_log(offset);
    };
    auto checks = [=](const std::vector<Row>& trace) {
        std::vector<Row>::const_iterator row = std::ranges::find_if(
            trace.begin(), trace.end(), [](Row r) { return r.avm_main_sel_op_emit_unencrypted_log == FF(1); });
        EXPECT_TRUE(row != trace.end());

        // Check the outputs of the trace
        uint32_t output_offset = AvmKernelTraceBuilder::START_EMIT_UNENCRYPTED_LOG_WRITE_OFFSET;

        expect_output_table_row(
            row,
            /*kernel_in_offset=*/output_offset,
            /*ia=*/1234, // Note the value generated above for public inputs is the same as the index read + 1
            /*mem_idx_a=*/offset,
            /*w_in_tag=*/AvmMemoryTag::FF,
            /*side_effect_counter=*/0);

        check_kernel_outputs(trace.at(output_offset + 1), 1234, 0, 0);
    };

    test_kernel_lookup(apply_opcodes, checks);
}

TEST_F(AvmKernelOutputPositiveTests, kernelSload)
{
    uint32_t value_offset = 42;
    auto value = 1234;
    uint32_t metadata_offset = 420;
    auto slot = 12345;

    auto apply_opcodes = [=](AvmTraceBuilder& trace_builder) {
        trace_builder.op_set(0, static_cast<uint128_t>(value), value_offset, AvmMemoryTag::FF);
        trace_builder.op_set(0, static_cast<uint128_t>(slot), metadata_offset, AvmMemoryTag::FF);
        trace_builder.op_sload(metadata_offset, value_offset);
    };
    auto checks = [=](const std::vector<Row>& trace) {
        std::vector<Row>::const_iterator row =
            std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.avm_main_sel_op_sload == FF(1); });
        EXPECT_TRUE(row != trace.end());

        // Check the outputs of the trace
        uint32_t output_offset = AvmKernelTraceBuilder::START_SLOAD_WRITE_OFFSET;

        expect_output_table_row_with_metadata(
            row,
            /*kernel_in_offset=*/output_offset,
            /*ia=*/value, // Note the value generated above for public inputs is the same as the index read + 1
            /*mem_idx_a=*/value_offset,
            /*ib=*/slot,
            /*mem_idx_b=*/metadata_offset,
            /*w_in_tag=*/AvmMemoryTag::FF,
            /*side_effect_counter=*/0

        );

        check_kernel_outputs(trace.at(output_offset + 1), value, /*side_effect_counter=*/0, slot);
    };

    test_kernel_lookup(apply_opcodes, checks);
}

TEST_F(AvmKernelOutputPositiveTests, kernelSstore)
{
    uint32_t value_offset = 42;
    auto value = 1234;
    uint32_t metadata_offset = 420;
    auto slot = 12345;

    auto apply_opcodes = [=](AvmTraceBuilder& trace_builder) {
        trace_builder.op_set(0, static_cast<uint128_t>(value), value_offset, AvmMemoryTag::FF);
        trace_builder.op_set(0, static_cast<uint128_t>(slot), metadata_offset, AvmMemoryTag::FF);
        trace_builder.op_sstore(metadata_offset, value_offset);
    };
    auto checks = [=](const std::vector<Row>& trace) {
        std::vector<Row>::const_iterator row =
            std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.avm_main_sel_op_sstore == FF(1); });
        EXPECT_TRUE(row != trace.end());

        // Check the outputs of the trace
        uint32_t output_offset = AvmKernelTraceBuilder::START_SSTORE_WRITE_OFFSET;

        expect_output_table_row_with_metadata(
            row,
            /*kernel_in_offset=*/output_offset,
            /*ia=*/value, // Note the value generated above for public inputs is the same as the index read + 1
            /*mem_idx_a=*/value_offset,
            /*ib=*/slot,
            /*mem_idx_b=*/metadata_offset,
            /*w_in_tag=*/AvmMemoryTag::FF,
            /*side_effect_counter=*/0);

        check_kernel_outputs(trace.at(output_offset + 1), value, /*side_effect_counter=*/0, slot);
    };

    test_kernel_lookup(apply_opcodes, checks);
}

TEST_F(AvmKernelOutputPositiveTests, kernelNoteHashExists)
{
    uint32_t value_offset = 42;
    auto value = 1234;
    uint32_t metadata_offset = 420;
    auto exists = 1;

    auto apply_opcodes = [=](AvmTraceBuilder& trace_builder) {
        trace_builder.op_set(0, static_cast<uint128_t>(value), value_offset, AvmMemoryTag::FF);
        trace_builder.op_note_hash_exists(value_offset, metadata_offset);
    };
    auto checks = [=](const std::vector<Row>& trace) {
        std::vector<Row>::const_iterator row = std::ranges::find_if(
            trace.begin(), trace.end(), [](Row r) { return r.avm_main_sel_op_note_hash_exists == FF(1); });
        EXPECT_TRUE(row != trace.end());

        // Check the outputs of the trace
        uint32_t output_offset = AvmKernelTraceBuilder::START_NOTE_HASH_EXISTS_WRITE_OFFSET;

        expect_output_table_row_with_exists_metadata(
            row,
            /*kernel_in_offset=*/output_offset,
            /*ia=*/value, // Note the value generated above for public inputs is the same as the index read + 1
            /*mem_idx_a=*/value_offset,
            /*ib=*/exists,
            /*mem_idx_b=*/metadata_offset,
            /*w_in_tag=*/AvmMemoryTag::FF,

            /*side_effect_counter=*/0);

        check_kernel_outputs(trace.at(output_offset + 1), value, /*side_effect_counter=*/0, exists);
    };

    test_kernel_lookup(apply_opcodes, checks);
}

TEST_F(AvmKernelOutputPositiveTests, kernelNullifierExists)
{
    uint32_t value_offset = 42;
    auto value = 1234;
    uint32_t metadata_offset = 420;
    auto exists = 1;

    auto apply_opcodes = [=](AvmTraceBuilder& trace_builder) {
        trace_builder.op_set(0, static_cast<uint128_t>(value), value_offset, AvmMemoryTag::FF);
        trace_builder.op_nullifier_exists(value_offset, metadata_offset);
    };
    auto checks = [=](const std::vector<Row>& trace) {
        std::vector<Row>::const_iterator row = std::ranges::find_if(
            trace.begin(), trace.end(), [](Row r) { return r.avm_main_sel_op_nullifier_exists == FF(1); });
        EXPECT_TRUE(row != trace.end());

        // Check the outputs of the trace
        uint32_t output_offset = AvmKernelTraceBuilder::START_NULLIFIER_EXISTS_OFFSET;

        expect_output_table_row_with_exists_metadata(
            row,
            /*kernel_in_offset=*/output_offset,
            /*ia=*/value, // Note the value generated above for public inputs is the same as the index read + 1
            /*mem_idx_a=*/value_offset,
            /*ib=*/exists,
            /*mem_idx_b=*/metadata_offset,
            /*w_in_tag=*/AvmMemoryTag::FF,
            /*side_effect_counter=*/0);

        check_kernel_outputs(trace.at(output_offset + 1), value, /*side_effect_counter=*/0, exists);
    };

    test_kernel_lookup(apply_opcodes, checks);
}

TEST_F(AvmKernelOutputPositiveTests, kernelL1ToL2MsgExists)
{
    uint32_t value_offset = 42;
    auto value = 1234;
    uint32_t metadata_offset = 420;
    auto exists = 1;

    auto apply_opcodes = [=](AvmTraceBuilder& trace_builder) {
        trace_builder.op_set(0, static_cast<uint128_t>(value), value_offset, AvmMemoryTag::FF);
        trace_builder.op_l1_to_l2_msg_exists(value_offset, metadata_offset);
    };
    auto checks = [=](const std::vector<Row>& trace) {
        std::vector<Row>::const_iterator row = std::ranges::find_if(
            trace.begin(), trace.end(), [](Row r) { return r.avm_main_sel_op_l1_to_l2_msg_exists == FF(1); });
        EXPECT_TRUE(row != trace.end());

        // Check the outputs of the trace
        uint32_t output_offset = AvmKernelTraceBuilder::START_L1_TO_L2_MSG_EXISTS_WRITE_OFFSET;

        expect_output_table_row_with_exists_metadata(
            row,
            /*kernel_in_offset=*/output_offset,
            /*ia=*/value, // Note the value generated above for public inputs is the same as the index read + 1
            /*mem_idx_a=*/value_offset,
            /*ib=*/exists,
            /*mem_idx_b=*/metadata_offset,
            /*w_in_tag=*/AvmMemoryTag::FF,
            /*side_effect_counter=*/0);

        check_kernel_outputs(trace.at(output_offset + 1), value, /*side_effect_counter=*/0, exists);
    };

    test_kernel_lookup(apply_opcodes, checks);
}

} // namespace tests_avm
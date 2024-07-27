#include <functional>
#include <vector>

#include "avm_common.test.hpp"
#include "barretenberg/vm/avm_trace/avm_common.hpp"
#include "barretenberg/vm/avm_trace/avm_kernel_trace.hpp"
#include "barretenberg/vm/avm_trace/aztec_constants.hpp"
#include "barretenberg/vm/avm_trace/constants.hpp"
#include "barretenberg/vm/tests/helpers.test.hpp"

namespace tests_avm {

using namespace bb;
using namespace bb::avm_trace;

auto const BAD_LOOKUP = "LOOKUP_INTO_KERNEL";

using CheckFunc = std::function<void(bool, const std::vector<Row>&)>;
using OpcodesFuncWithDest = std::function<void(AvmTraceBuilder&, bool indirect, uint32_t dst_offset)>;
using ExecuteExistsOpcode =
    std::function<void(AvmTraceBuilder&, bool indirect, uint32_t value_offset, uint32_t metadata_offset)>;
using OpcodesFunc = std::function<void(AvmTraceBuilder&)>;
using GetSelectorFunc = std::function<FF(Row&)>;
using InitExecutionHints = std::function<ExecutionHints(std::vector<std::pair<FF, FF>>)>;

struct ContextGetter {
    std::string name;
    OpcodesFuncWithDest op_fn;
    GetSelectorFunc get_sel_in_main_fn;
    uint32_t context_input_sel;
    AvmMemoryTag mem_tag = AvmMemoryTag::FF;
};

struct ContextGetterWithIndirect : ContextGetter {
    bool indirect;

    ContextGetterWithIndirect(ContextGetter getter, bool indirect)
        : ContextGetter(std::move(getter))
        , indirect(indirect)
    {}
};

struct SomethingExistsOp {
    std::string name;
    ExecuteExistsOpcode op_fn;
    GetSelectorFunc get_sel_in_main_fn;
    uint32_t kernel_output_sel;
    InitExecutionHints init_hints_fn;
};

struct SomethingExistsOpWithIndirectAndExists : SomethingExistsOp {
    bool indirect;
    FF exists;

    SomethingExistsOpWithIndirectAndExists(SomethingExistsOp exists_op, bool indirect, FF exists)
        : SomethingExistsOp(std::move(exists_op))
        , indirect(indirect)
        , exists(exists)
    {}
};

class AvmKernelOutputPositiveTests : public ::testing::Test {
  protected:
    // TODO(640): The Standard Honk on Grumpkin test suite fails unless the SRS is initialised for every test.
    void SetUp() override { srs::init_crs_factory("../srs_db/ignition"); };
};
template <typename ParamType> class AvmKernelIOTests : public ::testing::TestWithParam<ParamType> {
  protected:
    // TODO(640): The Standard Honk on Grumpkin test suite fails unless the SRS is initialised for every test.
    void SetUp() override { srs::init_crs_factory("../srs_db/ignition"); };
};
class AvmContextGetterPositiveTests : public AvmKernelIOTests<ContextGetterWithIndirect> {};
class AvmContextGetterNegativeTests : public AvmKernelIOTests<ContextGetter> {};
class AvmKernelOutputExistenceCheckTests : public AvmKernelIOTests<SomethingExistsOpWithIndirectAndExists> {};

std::string GetterTestNameGenerator(const ::testing::TestParamInfo<ContextGetter>& info)
{
    return "Getter_" + info.param.name;
}
std::string GetterWithIndirectTestNameGenerator(const ::testing::TestParamInfo<ContextGetterWithIndirect>& info)
{
    return "Getter_" + info.param.name + "_indirect_" + (info.param.indirect ? "true" : "false");
}
std::string ExistsTestNameGenerator(const ::testing::TestParamInfo<SomethingExistsOpWithIndirectAndExists>& info)
{
    std::string exists_str = info.param.exists == 0 ? "false" : "true";
    return "Exists_" + info.param.name + "_indirect_" + (info.param.indirect ? "true" : "false") + "_exists_" +
           exists_str;
}

std::vector<ContextGetter> const getters = {
    ContextGetter{
        .name = "ADDRESS",
        .op_fn = [](AvmTraceBuilder& trace_builder,
                    bool indirect,
                    uint32_t dst_offset) { trace_builder.op_address(indirect ? 1 : 0, dst_offset); },
        .get_sel_in_main_fn = [](Row& row) { return row.main_sel_op_address; },
        .context_input_sel = ADDRESS_SELECTOR,
    },
    ContextGetter{
        .name = "STORAGE_ADDRESS",
        .op_fn = [](AvmTraceBuilder& trace_builder,
                    bool indirect,
                    uint32_t dst_offset) { trace_builder.op_storage_address(indirect ? 1 : 0, dst_offset); },
        .get_sel_in_main_fn = [](Row& row) { return row.main_sel_op_storage_address; },
        .context_input_sel = STORAGE_ADDRESS_SELECTOR,
    },
    {
        .name = "SENDER",
        .op_fn = [](AvmTraceBuilder& trace_builder,
                    bool indirect,
                    uint32_t dst_offset) { trace_builder.op_sender(indirect ? 1 : 0, dst_offset); },
        .get_sel_in_main_fn = [](Row& row) { return row.main_sel_op_sender; },
        .context_input_sel = SENDER_SELECTOR,
    },
    ContextGetter{
        .name = "FUNCTION_SELECTOR",
        .op_fn = [](AvmTraceBuilder& trace_builder,
                    bool indirect,
                    uint32_t dst_offset) { trace_builder.op_function_selector(indirect ? 1 : 0, dst_offset); },
        .get_sel_in_main_fn = [](Row& row) { return row.main_sel_op_function_selector; },
        .context_input_sel = FUNCTION_SELECTOR_SELECTOR,
        .mem_tag = AvmMemoryTag::U32,
    },
    ContextGetter{
        .name = "TRANSACTION_FEE",
        .op_fn = [](AvmTraceBuilder& trace_builder,
                    bool indirect,
                    uint32_t dst_offset) { trace_builder.op_transaction_fee(indirect ? 1 : 0, dst_offset); },
        .get_sel_in_main_fn = [](Row& row) { return row.main_sel_op_transaction_fee; },
        .context_input_sel = TRANSACTION_FEE_SELECTOR,
    },
    ContextGetter{
        .name = "CHAINID",
        .op_fn = [](AvmTraceBuilder& trace_builder,
                    bool indirect,
                    uint32_t dst_offset) { trace_builder.op_chain_id(indirect ? 1 : 0, dst_offset); },
        .get_sel_in_main_fn = [](Row& row) { return row.main_sel_op_chain_id; },
        .context_input_sel = CHAIN_ID_SELECTOR,
    },
    ContextGetter{
        .name = "VERSION",
        .op_fn = [](AvmTraceBuilder& trace_builder,
                    bool indirect,
                    uint32_t dst_offset) { trace_builder.op_version(indirect ? 1 : 0, dst_offset); },
        .get_sel_in_main_fn = [](Row& row) { return row.main_sel_op_version; },
        .context_input_sel = VERSION_SELECTOR,
    },
    ContextGetter{
        .name = "BLOCK_NUMBER",
        .op_fn = [](AvmTraceBuilder& trace_builder,
                    bool indirect,
                    uint32_t dst_offset) { trace_builder.op_block_number(indirect ? 1 : 0, dst_offset); },
        .get_sel_in_main_fn = [](Row& row) { return row.main_sel_op_block_number; },
        .context_input_sel = BLOCK_NUMBER_SELECTOR,
    },
    ContextGetter{
        .name = "TIMESTAMP",
        .op_fn = [](AvmTraceBuilder& trace_builder,
                    bool indirect,
                    uint32_t dst_offset) { trace_builder.op_timestamp(indirect ? 1 : 0, dst_offset); },
        .get_sel_in_main_fn = [](Row& row) { return row.main_sel_op_timestamp; },
        .context_input_sel = TIMESTAMP_SELECTOR,
        .mem_tag = AvmMemoryTag::U64,
    },
    ContextGetter{
        .name = "COINBASE",
        .op_fn = [](AvmTraceBuilder& trace_builder,
                    bool indirect,
                    uint32_t dst_offset) { trace_builder.op_coinbase(indirect ? 1 : 0, dst_offset); },
        .get_sel_in_main_fn = [](Row& row) { return row.main_sel_op_coinbase; },
        .context_input_sel = COINBASE_SELECTOR,
    },
    ContextGetter{
        .name = "FEEPERL2GAS",
        .op_fn = [](AvmTraceBuilder& trace_builder,
                    bool indirect,
                    uint32_t dst_offset) { trace_builder.op_fee_per_l2_gas(indirect ? 1 : 0, dst_offset); },
        .get_sel_in_main_fn = [](Row& row) { return row.main_sel_op_fee_per_l2_gas; },
        .context_input_sel = FEE_PER_L2_GAS_SELECTOR,
    },
    ContextGetter{
        .name = "FEEPERDAGAS",
        .op_fn = [](AvmTraceBuilder& trace_builder,
                    bool indirect,
                    uint32_t dst_offset) { trace_builder.op_fee_per_da_gas(indirect ? 1 : 0, dst_offset); },
        .get_sel_in_main_fn = [](Row& row) { return row.main_sel_op_fee_per_da_gas; },
        .context_input_sel = FEE_PER_DA_GAS_SELECTOR,
    },
};

std::vector<SomethingExistsOp> const exists_ops = {
    SomethingExistsOp{
        .name = "NOTEHASHEXISTS",
        .op_fn =
            [](AvmTraceBuilder& trace_builder, bool indirect, uint32_t value_offset, uint32_t metadata_offset) {
                trace_builder.op_note_hash_exists(indirect ? 3 : 0, value_offset, metadata_offset);
            },
        .get_sel_in_main_fn = [](Row& row) { return row.main_sel_op_note_hash_exists; },
        .kernel_output_sel = START_NOTE_HASH_EXISTS_WRITE_OFFSET,
        .init_hints_fn =
            [](std::vector<std::pair<FF, FF>> hints) {
                return ExecutionHints().with_note_hash_exists_hints(std::move(hints));
            },
    },
    SomethingExistsOp{
        .name = "NULLIFIEREXISTS",
        .op_fn =
            [](AvmTraceBuilder& trace_builder, bool indirect, uint32_t value_offset, uint32_t metadata_offset) {
                trace_builder.op_nullifier_exists(indirect ? 3 : 0, value_offset, metadata_offset);
            },
        .get_sel_in_main_fn = [](Row& row) { return row.main_sel_op_nullifier_exists; },
        .kernel_output_sel = START_NULLIFIER_EXISTS_OFFSET,
        .init_hints_fn =
            [](std::vector<std::pair<FF, FF>> hints) {
                return ExecutionHints().with_nullifier_exists_hints(std::move(hints));
            },
    },
    SomethingExistsOp{
        .name = "L1TOL2MSGEXISTS",
        .op_fn =
            [](AvmTraceBuilder& trace_builder, bool indirect, uint32_t value_offset, uint32_t metadata_offset) {
                trace_builder.op_l1_to_l2_msg_exists(indirect ? 3 : 0, value_offset, metadata_offset);
            },
        .get_sel_in_main_fn = [](Row& row) { return row.main_sel_op_l1_to_l2_msg_exists; },
        .kernel_output_sel = START_L1_TO_L2_MSG_EXISTS_WRITE_OFFSET,
        .init_hints_fn =
            [](std::vector<std::pair<FF, FF>> hints) {
                return ExecutionHints().with_l1_to_l2_message_exists_hints(std::move(hints));
            },
    },
};

std::vector<ContextGetterWithIndirect> getters_with_indirect()
{
    std::vector<ContextGetterWithIndirect> with_indirect;
    for (const auto& op : getters) {
        with_indirect.emplace_back(op, /*indirect=*/false);
        with_indirect.emplace_back(op, /*indirect=*/true);
    }
    return with_indirect;
}

std::vector<SomethingExistsOpWithIndirectAndExists> exists_ops_with_indirect_and_exists()
{
    std::vector<SomethingExistsOpWithIndirectAndExists> with_indirect_and_exists;
    for (const auto& op : exists_ops) {
        with_indirect_and_exists.emplace_back(op, /*indirect=*/true, /*exists=*/1);
        with_indirect_and_exists.emplace_back(op, /*indirect=*/false, /*exists=*/1);
        SomethingExistsOpWithIndirectAndExists direct_non_existent(op, /*indirect=*/false, /*exists=*/0);
        if (op.kernel_output_sel == START_NULLIFIER_EXISTS_OFFSET) {
            // if exists is false for nullifiers, offset is different
            direct_non_existent.kernel_output_sel = START_NULLIFIER_NON_EXISTS_OFFSET;
        }
        with_indirect_and_exists.emplace_back(direct_non_existent);
    }
    return with_indirect_and_exists;
}

INSTANTIATE_TEST_SUITE_P(AvmKernelTests,
                         AvmContextGetterPositiveTests,
                         ::testing::ValuesIn(getters_with_indirect()),
                         GetterWithIndirectTestNameGenerator);

INSTANTIATE_TEST_SUITE_P(AvmKernelTests,
                         AvmContextGetterNegativeTests,
                         ::testing::ValuesIn(getters),
                         GetterTestNameGenerator);

INSTANTIATE_TEST_SUITE_P(AvmKernelTests,
                         AvmKernelOutputExistenceCheckTests,
                         ::testing::ValuesIn(exists_ops_with_indirect_and_exists()),
                         ExistsTestNameGenerator);

/*
 * Helper function to assert row values for a kernel lookup opcode
 */
void expect_row(auto row, FF selector, FF ia, FF ind_a, FF mem_addr_a, AvmMemoryTag w_in_tag)
{
    // Checks dependent on the opcode
    EXPECT_EQ(row->kernel_kernel_in_offset, selector);
    EXPECT_EQ(row->main_ia, ia);
    EXPECT_EQ(row->main_mem_addr_a, mem_addr_a);

    // Checks that are fixed for kernel inputs
    EXPECT_EQ(row->main_rwa, FF(1));
    EXPECT_EQ(row->main_ind_addr_a, ind_a);
    EXPECT_EQ(row->main_sel_resolve_ind_addr_a, FF(ind_a != 0));
    EXPECT_EQ(row->main_sel_mem_op_a, FF(1));
    EXPECT_EQ(row->main_w_in_tag, static_cast<uint32_t>(w_in_tag));
    EXPECT_EQ(row->main_sel_q_kernel_lookup, FF(1));
}

TEST_P(AvmContextGetterPositiveTests, GetterWorks)
{
    ContextGetterWithIndirect getter = GetParam();
    uint32_t dst_offset = 42;
    uint32_t indirect_dst_offset = 69;
    VmPublicInputs public_inputs = generate_base_public_inputs(/*assign_kernel_inputs=*/true);
    ExecutionHints execution_hints = {};
    AvmTraceBuilder trace_builder(public_inputs, std::move(execution_hints));

    if (getter.indirect) {
        trace_builder.op_set(
            /*indirect*/ 0, // false
            /*value*/ dst_offset,
            /*dst_offset*/ indirect_dst_offset,
            AvmMemoryTag::U32);
        getter.op_fn(trace_builder, /*indirect*/ true, indirect_dst_offset);
    } else {
        getter.op_fn(trace_builder, /*indirect=*/false, dst_offset);
    }

    trace_builder.halt();

    auto trace = trace_builder.finalize();

    auto row = std::ranges::find_if(
        trace.begin(), trace.end(), [getter](Row r) { return getter.get_sel_in_main_fn(r) == FF(1); });
    EXPECT_TRUE(row != trace.end());

    expect_row(row,
               /*selector=*/getter.context_input_sel,
               // Note the value generated above for public inputs is the same as the index read + 1
               /*ia=*/getter.context_input_sel + 1,
               /*ind_a*/ getter.indirect ? indirect_dst_offset : 0,
               /*mem_addr_a*/ dst_offset,
               /*w_in_tag=*/getter.mem_tag);

    validate_trace(std::move(trace), public_inputs);
}

TEST_P(AvmContextGetterNegativeTests, GetterFailsOnBadLookup)
{
    ContextGetter getter = GetParam();
    uint32_t dst_offset = 42;
    FF incorrect_ia = FF(69);
    VmPublicInputs public_inputs = generate_base_public_inputs(/*assign_kernel_inputs=*/true);
    AvmTraceBuilder trace_builder(public_inputs);

    getter.op_fn(trace_builder, /*indirect=*/false, dst_offset);

    trace_builder.halt();

    auto trace = trace_builder.finalize();

    // Change IA to be a value not in the lookup
    // Change the first row, as that will be where each of the opcodes are in the test
    auto& ta = trace.at(1);
    ta.main_ia = incorrect_ia;
    // memory trace should only have one row for these tests as well, so first row has looked-up val
    ta.mem_val = incorrect_ia;

    auto row = std::ranges::find_if(
        trace.begin(), trace.end(), [getter](Row r) { return getter.get_sel_in_main_fn(r) == FF(1); });
    EXPECT_TRUE(row != trace.end());

    expect_row(
        row,
        /*selector=*/getter.context_input_sel,
        /*ia=*/incorrect_ia, // Note the value generated above for public inputs is the same as the index read + 1
        /*ind_a*/ 0,         // indirect = false
        /*mem_addr_a=*/dst_offset,
        /*w_in_tag=*/getter.mem_tag);

    EXPECT_THROW_WITH_MESSAGE(validate_trace_check_circuit(std::move(trace)), BAD_LOOKUP);
}

VmPublicInputs get_public_inputs_with_output(uint32_t output_offset, FF value, FF side_effect_counter, FF metadata)
{
    VmPublicInputs public_inputs = generate_base_public_inputs(/*assign_kernel_inputs=*/true);

    std::get<KERNEL_OUTPUTS_VALUE>(public_inputs)[output_offset] = value;
    std::get<KERNEL_OUTPUTS_SIDE_EFFECT_COUNTER>(public_inputs)[output_offset] = side_effect_counter;
    std::get<KERNEL_OUTPUTS_METADATA>(public_inputs)[output_offset] = metadata;

    return public_inputs;
}

// Template helper function to apply boilerplate around the kernel lookup tests
void test_kernel_lookup(bool indirect,
                        OpcodesFunc apply_opcodes,
                        CheckFunc check_trace,
                        VmPublicInputs public_inputs = generate_base_public_inputs(/*assign_kernel_inputs=*/true),
                        ExecutionHints execution_hints = {})
{
    AvmTraceBuilder trace_builder(public_inputs, std::move(execution_hints));

    apply_opcodes(trace_builder);

    trace_builder.halt();

    auto trace = trace_builder.finalize();

    check_trace(indirect, trace);

    validate_trace(std::move(trace), public_inputs);
}

void expect_output_table_row(auto row,
                             FF selector,
                             FF ia,
                             FF mem_addr_a,
                             FF ind_a,
                             AvmMemoryTag r_in_tag,
                             uint32_t side_effect_counter,
                             uint32_t rwa = 0)
{
    // Checks dependent on the opcode
    EXPECT_EQ(row->kernel_kernel_out_offset, selector);
    EXPECT_EQ(row->main_ia, ia);
    EXPECT_EQ(row->main_mem_addr_a, mem_addr_a);

    // Checks that are fixed for kernel inputs
    EXPECT_EQ(row->main_rwa, FF(rwa));
    EXPECT_EQ(row->main_ind_addr_a, ind_a);
    EXPECT_EQ(row->main_sel_resolve_ind_addr_a, FF(ind_a != 0));
    EXPECT_EQ(row->main_sel_mem_op_a, FF(1));
    EXPECT_EQ(row->main_r_in_tag, static_cast<uint32_t>(r_in_tag));
    EXPECT_EQ(row->main_sel_q_kernel_output_lookup, FF(1));

    EXPECT_EQ(row->kernel_side_effect_counter, FF(side_effect_counter));
}

void expect_output_table_row_with_metadata(auto row,
                                           FF selector,
                                           FF ia,
                                           FF mem_addr_a,
                                           FF ind_a,
                                           FF ib,
                                           FF mem_addr_b,
                                           FF ind_b,
                                           AvmMemoryTag r_in_tag,
                                           uint32_t side_effect_counter,
                                           uint32_t rwa = 0,
                                           bool no_b = false)
{
    expect_output_table_row(row, selector, ia, mem_addr_a, ind_a, r_in_tag, side_effect_counter, rwa);

    EXPECT_EQ(row->main_ib, ib);
    EXPECT_EQ(row->main_mem_addr_b, mem_addr_b);

    // Checks that are fixed for kernel inputs
    EXPECT_EQ(row->main_rwb, FF(0));

    if (!no_b) {
        EXPECT_EQ(row->main_ind_addr_b, ind_b);
        EXPECT_EQ(row->main_sel_resolve_ind_addr_b, FF(ind_b != 0));
        EXPECT_EQ(row->main_sel_mem_op_b, FF(1));
    }
}

void expect_output_table_row_with_exists_metadata(auto row,
                                                  FF selector,
                                                  FF ia,
                                                  FF mem_addr_a,
                                                  FF ind_a,
                                                  FF ib,
                                                  FF mem_addr_b,
                                                  FF ind_b,
                                                  AvmMemoryTag w_in_tag,
                                                  uint32_t side_effect_counter)
{
    expect_output_table_row(row, selector, ia, mem_addr_a, ind_a, w_in_tag, side_effect_counter);

    EXPECT_EQ(row->main_ib, ib);
    EXPECT_EQ(row->main_mem_addr_b, mem_addr_b);

    // Checks that are fixed for kernel inputs
    EXPECT_EQ(row->main_rwb, FF(1));
    EXPECT_EQ(row->main_ind_addr_b, ind_b);
    EXPECT_EQ(row->main_sel_resolve_ind_addr_b, FF(ind_b != 0));
    EXPECT_EQ(row->main_sel_mem_op_b, FF(1));
}

void check_kernel_outputs(const Row& row, FF value, FF side_effect_counter, FF metadata)
{
    EXPECT_EQ(row.kernel_kernel_value_out, value);
    EXPECT_EQ(row.kernel_kernel_side_effect_out, side_effect_counter);
    EXPECT_EQ(row.kernel_kernel_metadata_out, metadata);
}

TEST_F(AvmKernelOutputPositiveTests, kernelEmitNoteHash)
{
    uint32_t direct_offset = 42;
    uint32_t indirect_offset = 69;
    uint32_t value = 1234;

    uint32_t output_offset = START_EMIT_NOTE_HASH_WRITE_OFFSET;

    // We write the note hash into memory
    auto direct_apply_opcodes = [=](AvmTraceBuilder& trace_builder) {
        trace_builder.op_set(0, 1234, direct_offset, AvmMemoryTag::FF);
        trace_builder.op_emit_note_hash(/*indirect=*/false, direct_offset);
    };
    auto indirect_apply_opcodes = [=](AvmTraceBuilder& trace_builder) {
        trace_builder.op_set(0, 1234, direct_offset, AvmMemoryTag::FF);
        trace_builder.op_set(0, direct_offset, indirect_offset, AvmMemoryTag::U32);
        trace_builder.op_emit_note_hash(/*indirect=*/true, indirect_offset);
    };

    auto checks = [=](bool indirect, const std::vector<Row>& trace) {
        auto row = std::ranges::find_if(
            trace.begin(), trace.end(), [](Row r) { return r.main_sel_op_emit_note_hash == FF(1); });
        EXPECT_TRUE(row != trace.end());

        expect_output_table_row(
            row,
            /*kernel_in_offset=*/output_offset,
            /*ia=*/value, // Note the value generated above for public inputs is the same as the index read + 1
            /*mem_addr_a=*/direct_offset,
            /*ind_a*/ indirect ? indirect_offset : 0,
            /*w_in_tag=*/AvmMemoryTag::FF,
            /*side_effect_counter=*/0);

        check_kernel_outputs(trace.at(output_offset), value, /*side_effect_counter=*/0, /*metadata=*/0);
    };

    VmPublicInputs public_inputs =
        get_public_inputs_with_output(output_offset, value, /*side_effect_counter=*/0, /*metadata*/ 0);
    test_kernel_lookup(false, direct_apply_opcodes, checks, public_inputs);
    test_kernel_lookup(true, indirect_apply_opcodes, checks, public_inputs);
}

TEST_F(AvmKernelOutputPositiveTests, kernelEmitNullifier)
{
    uint32_t direct_offset = 42;
    uint32_t indirect_offset = 69;
    uint32_t value = 1234;

    uint32_t output_offset = START_EMIT_NULLIFIER_WRITE_OFFSET;

    // We write the note hash into memory
    auto direct_apply_opcodes = [=](AvmTraceBuilder& trace_builder) {
        trace_builder.op_set(0, 1234, direct_offset, AvmMemoryTag::FF);
        trace_builder.op_emit_nullifier(/*indirect=*/false, direct_offset);
    };
    auto indirect_apply_opcodes = [=](AvmTraceBuilder& trace_builder) {
        trace_builder.op_set(0, 1234, direct_offset, AvmMemoryTag::FF);
        trace_builder.op_set(0, direct_offset, indirect_offset, AvmMemoryTag::U32);
        trace_builder.op_emit_nullifier(/*indirect=*/true, indirect_offset);
    };

    auto checks = [=](bool indirect, const std::vector<Row>& trace) {
        auto row = std::ranges::find_if(
            trace.begin(), trace.end(), [](Row r) { return r.main_sel_op_emit_nullifier == FF(1); });
        EXPECT_TRUE(row != trace.end());

        expect_output_table_row(
            row,
            /*kernel_in_offset=*/output_offset,
            /*ia=*/value, // Note the value generated above for public inputs is the same as the index read + 1
            /*mem_addr_a=*/direct_offset,
            /*ind_a*/ indirect ? indirect_offset : 0,
            /*w_in_tag=*/AvmMemoryTag::FF,
            /*side_effect_counter=*/0);

        // Validate lookup and counts
        // Plus 1 as we have a padded empty first row
        check_kernel_outputs(trace.at(output_offset), value, /*side_effect_counter=*/0, /*metadata=*/0);
    };

    VmPublicInputs public_inputs =
        get_public_inputs_with_output(output_offset, value, /*side_effect_counter=*/0, /*metadata*/ 0);
    test_kernel_lookup(false, direct_apply_opcodes, checks, public_inputs);
    test_kernel_lookup(true, indirect_apply_opcodes, checks, public_inputs);
}

TEST_F(AvmKernelOutputPositiveTests, kernelEmitL2ToL1Msg)
{
    uint32_t msg_offset = 42;
    uint32_t indirect_msg_offset = 420;

    uint32_t recipient_offset = 69;
    uint32_t indirect_recipient_offset = 690;

    uint32_t value = 1234;
    uint32_t recipient = 420;
    uint32_t output_offset = START_EMIT_L2_TO_L1_MSG_WRITE_OFFSET;

    // auto direct_apply_opcodes = [=](AvmTraceBuilder& trace_builder) {
    //     trace_builder.op_set(0, 1234, msg_offset, AvmMemoryTag::FF);
    //     trace_builder.op_set(0, 420, recipient_offset, AvmMemoryTag::FF);
    //     trace_builder.op_emit_l2_to_l1_msg(false, recipient_offset, msg_offset);
    // };
    auto indirect_apply_opcodes = [=](AvmTraceBuilder& trace_builder) {
        trace_builder.op_set(0, 1234, msg_offset, AvmMemoryTag::FF);
        trace_builder.op_set(0, msg_offset, indirect_msg_offset, AvmMemoryTag::U32);
        trace_builder.op_set(0, 420, recipient_offset, AvmMemoryTag::FF);
        trace_builder.op_set(0, recipient_offset, indirect_recipient_offset, AvmMemoryTag::U32);
        trace_builder.op_emit_l2_to_l1_msg(3, indirect_recipient_offset, indirect_msg_offset);
    };

    auto checks = [=](bool indirect, const std::vector<Row>& trace) {
        auto row = std::ranges::find_if(
            trace.begin(), trace.end(), [](Row r) { return r.main_sel_op_emit_l2_to_l1_msg == FF(1); });
        EXPECT_TRUE(row != trace.end());

        expect_output_table_row_with_metadata(
            row,
            /*kernel_in_offset=*/output_offset,
            /*ia=*/value, // Note the value generated above for public inputs is the same as the index read + 1
            /*mem_addr_a=*/msg_offset,
            /*ind_a*/ indirect ? indirect_msg_offset : 0,
            /*ib=*/recipient,
            /*mem_addr_b=*/recipient_offset,
            /*ind_a*/ indirect ? indirect_recipient_offset : 0,
            /*w_in_tag=*/AvmMemoryTag::FF,
            /*side_effect_counter=*/0);

        check_kernel_outputs(trace.at(output_offset), value, /*side_effect_counter=*/0, /*metadata=*/recipient);
    };

    // test_kernel_lookup(false, direct_apply_opcodes, checks);
    VmPublicInputs public_inputs =
        get_public_inputs_with_output(output_offset, value, /*side_effect_counter=*/0, recipient);
    test_kernel_lookup(true, indirect_apply_opcodes, checks, std::move(public_inputs));
}

TEST_F(AvmKernelOutputPositiveTests, kernelEmitUnencryptedLog)
{
    uint32_t direct_offset = 42;
    uint32_t indirect_offset = 69;
    uint32_t value = 1234;
    uint32_t slot = 0;
    uint32_t output_offset = START_EMIT_UNENCRYPTED_LOG_WRITE_OFFSET;

    // We write the note hash into memory
    auto direct_apply_opcodes = [=](AvmTraceBuilder& trace_builder) {
        trace_builder.op_set(0, 1234, direct_offset, AvmMemoryTag::FF);
        trace_builder.op_emit_unencrypted_log(/*indirect=*/false, direct_offset, /*log_size_offset=*/0);
    };
    auto indirect_apply_opcodes = [=](AvmTraceBuilder& trace_builder) {
        trace_builder.op_set(0, 1234, direct_offset, AvmMemoryTag::FF);
        trace_builder.op_set(0, direct_offset, indirect_offset, AvmMemoryTag::U32);
        trace_builder.op_emit_unencrypted_log(/*indirect=*/true, indirect_offset, /*log_size_offset=*/0);
    };

    auto checks = [=](bool indirect, const std::vector<Row>& trace) {
        auto row = std::ranges::find_if(
            trace.begin(), trace.end(), [](Row r) { return r.main_sel_op_emit_unencrypted_log == FF(1); });
        EXPECT_TRUE(row != trace.end());

        expect_output_table_row(
            row,
            /*kernel_in_offset=*/output_offset,
            /*ia=*/value, // Note the value generated above for public inputs is the same as the index read + 1
            /*mem_addr_a=*/direct_offset,
            /*ind_a*/ indirect ? indirect_offset : 0,
            /*w_in_tag=*/AvmMemoryTag::FF,
            /*side_effect_counter=*/0);

        check_kernel_outputs(trace.at(output_offset), value, 0, slot);
    };

    VmPublicInputs public_inputs = get_public_inputs_with_output(output_offset, value, /*side_effect_counter=*/0, slot);
    test_kernel_lookup(false, direct_apply_opcodes, checks, public_inputs);
    test_kernel_lookup(true, indirect_apply_opcodes, checks, public_inputs);
}

TEST_F(AvmKernelOutputPositiveTests, kernelSload)
{
    uint8_t indirect = 0;
    uint32_t dest_offset = 42;
    auto value = 1234;
    uint32_t size = 1;
    uint32_t slot_offset = 420;
    auto slot = 12345;
    uint32_t output_offset = START_SLOAD_WRITE_OFFSET;

    // Provide a hint for sload value slot
    auto execution_hints = ExecutionHints().with_storage_value_hints({ { 0, value } });

    auto apply_opcodes = [=](AvmTraceBuilder& trace_builder) {
        trace_builder.op_set(0, static_cast<uint128_t>(slot), slot_offset, AvmMemoryTag::FF);
        trace_builder.op_sload(indirect, slot_offset, size, dest_offset);
    };
    auto checks = [=]([[maybe_unused]] bool indirect, const std::vector<Row>& trace) {
        auto row = std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.main_sel_op_sload == FF(1); });
        ASSERT_TRUE(row != trace.end());

        // TODO: temporarily hardcoded to direct, resolved by dbanks12 / ilyas pr - use your changes
        expect_output_table_row_with_metadata(
            row,
            /*kernel_in_offset=*/output_offset,
            /*ia=*/value, // Note the value generated above for public inputs is the same as the index read + 1
            /*mem_addr_a=*/dest_offset,
            /*ind_a=*/false,
            /*ib=*/slot,
            /*mem_addr_b=*/0,
            /*ind_b=*/false,
            /*r_in_tag=*/AvmMemoryTag::U0, // Kernel Sload is writing to memory
            /*side_effect_counter=*/0,
            /*rwa=*/1,
            /*no_b=*/true);

        check_kernel_outputs(trace.at(output_offset), value, /*side_effect_counter=*/0, slot);
    };

    VmPublicInputs public_inputs = get_public_inputs_with_output(output_offset, value, /*side_effect_counter=*/0, slot);
    test_kernel_lookup(false, apply_opcodes, checks, std::move(public_inputs), execution_hints);
}

TEST_F(AvmKernelOutputPositiveTests, kernelSstore)
{
    uint32_t value_offset = 42;
    auto value = 1234;
    uint32_t metadata_offset = 420;
    auto slot = 12345;
    uint8_t indirect = 0;
    uint32_t size = 1;
    uint32_t output_offset = START_SSTORE_WRITE_OFFSET;

    auto apply_opcodes = [=](AvmTraceBuilder& trace_builder) {
        trace_builder.op_set(0, static_cast<uint128_t>(value), value_offset, AvmMemoryTag::FF);
        trace_builder.op_set(0, static_cast<uint128_t>(slot), metadata_offset, AvmMemoryTag::FF);
        trace_builder.op_sstore(indirect, value_offset, size, metadata_offset);
    };
    auto checks = [=]([[maybe_unused]] bool indirect, const std::vector<Row>& trace) {
        auto row =
            std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.main_sel_op_sstore == FF(1); });
        EXPECT_TRUE(row != trace.end());

        // TODO: temporarily hardcoded to direct, resolved by dbanks12 / ilyas pr - use your changes
        expect_output_table_row_with_metadata(
            row,
            /*kernel_in_offset=*/output_offset,
            /*ia=*/value, // Note the value generated above for public inputs is the same as the index read + 1
            /*mem_addr_a=*/value_offset,
            /*ind_a*/ false,
            /*ib=*/slot,
            /*mem_addr_b=*/0,
            /*ind_b*/ false,
            /*r_in_tag=*/AvmMemoryTag::FF,
            /*side_effect_counter=*/0,
            /*rwa=*/0,
            /*no_b=*/true);

        check_kernel_outputs(trace.at(output_offset), value, /*side_effect_counter=*/0, slot);
    };

    VmPublicInputs public_inputs = get_public_inputs_with_output(output_offset, value, /*side_effect_counter=*/0, slot);
    test_kernel_lookup(false, apply_opcodes, checks, std::move(public_inputs));
}

TEST_P(AvmKernelOutputExistenceCheckTests, ExistenceCheckWorks)
{
    SomethingExistsOpWithIndirectAndExists exists_op = GetParam();
    uint32_t value_offset = 42;
    uint32_t indirect_value_offset = 69;
    auto value = 1234;
    uint32_t metadata_offset = 420;
    uint32_t indirect_metadata_offset = 690;
    auto exists = exists_op.exists;
    uint32_t output_offset = exists_op.kernel_output_sel;

    auto execution_hints = exists_op.init_hints_fn({ { 0, exists } });

    auto direct_apply_opcodes = [=](AvmTraceBuilder& trace_builder) {
        trace_builder.op_set(0, static_cast<uint128_t>(value), value_offset, AvmMemoryTag::FF);
        exists_op.op_fn(trace_builder, /*indirect*/ false, value_offset, metadata_offset);
    };
    // TODO: fix
    auto indirect_apply_opcodes = [=](AvmTraceBuilder& trace_builder) {
        trace_builder.op_set(0, static_cast<uint128_t>(value), value_offset, AvmMemoryTag::FF);
        trace_builder.op_set(0, value_offset, indirect_value_offset, AvmMemoryTag::U32);
        trace_builder.op_set(0, metadata_offset, indirect_metadata_offset, AvmMemoryTag::U32);
        exists_op.op_fn(trace_builder, /*indirect*/ true, indirect_value_offset, indirect_metadata_offset);
    };
    auto checks = [=](bool indirect, const std::vector<Row>& trace) {
        auto row = std::ranges::find_if(
            trace.begin(), trace.end(), [exists_op](Row r) { return exists_op.get_sel_in_main_fn(r) == FF(1); });
        EXPECT_TRUE(row != trace.end());

        expect_output_table_row_with_exists_metadata(
            row,
            /*kernel_in_offset=*/output_offset,
            /*ia=*/value, // Note the value generated above for public inputs is the same as the index read + 1
            /*mem_addr_a=*/value_offset,
            /*ind_a*/ indirect ? FF(indirect_value_offset) : FF(0),
            /*ib=*/exists,
            /*mem_addr_b=*/metadata_offset,
            /*ind_b*/ indirect ? FF(indirect_metadata_offset) : FF(0),
            /*w_in_tag=*/AvmMemoryTag::FF,
            /*side_effect_counter=*/0);

        check_kernel_outputs(trace.at(output_offset), value, /*side_effect_counter=*/0, exists);
    };

    VmPublicInputs public_inputs =
        get_public_inputs_with_output(output_offset, value, /*side_effect_counter=*/0, exists);
    if (exists_op.indirect) {
        test_kernel_lookup(true, indirect_apply_opcodes, checks, public_inputs, execution_hints);
    } else {
        test_kernel_lookup(false, direct_apply_opcodes, checks, public_inputs, execution_hints);
    }
}

} // namespace tests_avm

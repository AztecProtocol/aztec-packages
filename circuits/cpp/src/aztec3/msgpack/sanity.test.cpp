#include <barretenberg/stdlib/merkle_tree/membership.hpp>
#include <barretenberg/numeric/random/engine.hpp>
#include <barretenberg/common/msgpack.hpp>
#include "aztec3/msgpack/check_memory_span.hpp"
#include "aztec3/msgpack/schema_impl.hpp"
#include "aztec3/utils/types/native_types.hpp"
#include "aztec3/circuits/abis/private_kernel/previous_kernel_data.hpp"

#include <gtest/gtest.h>

// Sanity checking for msgpack
// TODO eventually move to barretenberg

struct GoodExample {
    fr a;
    fr b;
    MSGPACK(a, b);
} good_example;

struct BadExampleOverlap {
    fr a;
    fr b;
    MSGPACK(a, a);
} bad_example_overlap;

struct BadExampleIncomplete {
    fr a;
    fr b;
    MSGPACK(a, b);
} bad_example_incomplete;

struct BadExampleOutOfObject {
    fr a;
    fr b;
    void msgpack(auto ar)
    {
        BadExampleOutOfObject other_object;
        ar("a", other_object.a, "b", other_object.b);
    }
} bad_example_out_of_object;

// TODO eventually move to barretenberg
TEST(abi_tests, msgpack_sanity_sanity)
{
    good_example.msgpack([&](auto&... args) { EXPECT_EQ(msgpack::check_memory_span(&good_example, &args...), ""); });
    bad_example_overlap.msgpack([&](auto&... args) {
        EXPECT_EQ(msgpack::check_memory_span(&bad_example_overlap, &args...),
                  "Overlap in BadExampleOverlap ar() params detected!");
    });
    bad_example_incomplete.msgpack([&](auto&... args) {
        EXPECT_EQ(msgpack::check_memory_span(&bad_example_incomplete, &args...),
                  "Incomplete BadExampleIncomplete ar() params! Not all of object specified.");
    });
    bad_example_out_of_object.msgpack([&](auto&... args) {
        EXPECT_EQ(msgpack::check_memory_span(&bad_example_out_of_object, &args...),
                  "Some BadExampleOutOfObject ar() params don't exist in object!");
    });
}

struct ComplicatedSchema {
    std::vector<std::array<fr, 20>> array;
    std::optional<GoodExample> good_or_not;
    fr bare;
    std::variant<fr, GoodExample> huh;
    MSGPACK(array, good_or_not, bare, huh);
} complicated_schema;

TEST(abi_tests, msgpack_schema_sanity)
{
    EXPECT_EQ(msgpack::schema_to_string(good_example), "[\"GoodExample\",\"field\",\"field\"]\n");
    EXPECT_EQ(msgpack::schema_to_string(complicated_schema),
              "{\"__typename\":\"ComplicatedSchema\",\"array\":[\"vector\",\"array\"],\"good_or_not\":[\"optional\",["
              "\"GoodExample\",[\"struct\",\"field\",\"bin32\"],\"field\"]],\"bare\":\"field\",\"huh\":[\"variant\","
              "\"field\",\"GoodExample\"]}\n");
}

TEST(abi_tests, msgpack_circuits_example_schema_sanity)
{
    EXPECT_EQ(
        msgpack::schema_to_string(
            aztec3::circuits::abis::private_kernel::PreviousKernelData<aztec3::utils::types::NativeTypes>{}),
        "{\"__typename\":\"PreviousKernelData\",\"public_inputs\":{\"__typename\":\"PublicInputs\",\"end\":{\"__"
        "typename\":\"AccumulatedData\",\"aggregation_object\":{\"__typename\":\"native_aggregation_state\",\"P0\":{\"_"
        "_typename\":\"affine_element\",\"x\":[\"struct\",\"field\",\"bin32\"],\"y\":\"field\"},\"P1\":\"affine_"
        "element\",\"public_inputs\":[\"vector\",\"field\"],\"proof_witness_indices\":[\"vector\",\"unsigned "
        "int\"],\"has_data\":\"bool\"},\"new_commitments\":[\"array\",\"field\",\"unsigned "
        "long\"],\"private_call_stack\":[\"array\",\"field\",\"unsigned "
        "long\"],\"l1_msg_stack\":[\"array\",\"field\",\"unsigned "
        "long\"],\"optionally_revealed_data\":[\"array\",{\"__typename\":\"OptionallyRevealedData\",\"call_stack_item_"
        "hash\":\"field\",\"function_data\":{\"__typename\":\"FunctionData\",\"function_selector\":\"unsigned "
        "int\",\"is_private\":\"bool\",\"is_constructor\":\"bool\"},\"emitted_events\":[\"array\",\"field\",\"unsigned "
        "long\"],\"portal_contract_address\":[\"struct\",\"address\",\"bin32\"],\"pay_fee_from_l1\":\"bool\",\"pay_fee_"
        "from_public_l2\":\"bool\",\"called_from_l1\":\"bool\",\"called_from_public_l2\":\"bool\"},\"unsigned "
        "long\"]},\"constants\":{\"__typename\":\"ConstantData\",\"historic_tree_roots\":{\"__typename\":"
        "\"HistoricTreeRoots\",\"private_data_tree_root\":\"field\",\"nullifier_tree_root\":\"field\",\"contract_tree_"
        "root\":\"field\",\"private_kernel_vk_tree_root\":\"field\"},\"tx_context\":{\"__typename\":\"TxContext\",\"is_"
        "fee_payment_tx\":\"bool\",\"is_rebate_payment_tx\":\"bool\",\"is_contract_deployment_tx\":\"bool\",\"contract_"
        "deployment_data\":{\"__typename\":\"ContractDeploymentData\",\"constructor_vk_hash\":\"field\",\"function_"
        "tree_root\":\"field\",\"contract_address_salt\":\"field\",\"portal_contract_address\":\"address\"}}},\"is_"
        "private\":\"bool\"},\"proof\":{\"__typename\":\"proof\",\"proof_data\":[\"vector\",\"unsigned "
        "char\"]},\"vk\":[\"shared_ptr\",[\"struct\",\"verification_key\",{\"__typename\":\"verification_key_data\","
        "\"composer_type\":\"unsigned int\",\"circuit_size\":\"unsigned int\",\"num_public_inputs\":\"unsigned "
        "int\",\"commitments\":[\"map\",\"string\",\"affine_element\"],\"contains_recursive_proof\":\"bool\","
        "\"recursive_proof_public_input_indices\":[\"vector\",\"unsigned int\"]}]],\"vk_index\":\"unsigned "
        "int\",\"vk_path\":[\"array\",\"field\",\"unsigned long\"]}\n");
}
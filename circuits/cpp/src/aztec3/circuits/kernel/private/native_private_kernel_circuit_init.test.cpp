#include "testing_harness.hpp"

#include "aztec3/circuits/abis/read_request_membership_witness.hpp"
#include "aztec3/circuits/apps/test_apps/basic_contract_deployment/basic_contract_deployment.hpp"
#include "aztec3/circuits/apps/test_apps/escrow/deposit.hpp"
#include "aztec3/circuits/kernel/private/init.hpp"
#include "aztec3/constants.hpp"
#include "aztec3/utils/circuit_errors.hpp"

#include <barretenberg/barretenberg.hpp>

#include <gtest/gtest.h>

#include <array>
#include <cstdint>

namespace aztec3::circuits::kernel::private_kernel {

using aztec3::circuits::apps::test_apps::basic_contract_deployment::constructor;
using aztec3::circuits::apps::test_apps::escrow::deposit;

using aztec3::circuits::kernel::private_kernel::testing_harness::do_private_call_get_kernel_inputs_init;
using aztec3::circuits::kernel::private_kernel::testing_harness::get_random_reads;
using aztec3::circuits::kernel::private_kernel::testing_harness::validate_deployed_contract_address;
using aztec3::circuits::kernel::private_kernel::testing_harness::validate_no_new_deployed_contract;
using aztec3::utils::CircuitErrorCode;


// NOTE: *DO NOT* call fr constructors in static initializers and assign them to constants. This will fail. Instead, use
// lazy initialization or functions. Lambdas were introduced here.
// amount = 5,  asset_id = 1, memo = 999
const auto standard_test_args = [] { return std::vector<NT::fr>{ NT::fr(5), NT::fr(1), NT::fr(999) }; };

class native_private_kernel_init_tests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { barretenberg::srs::init_crs_factory("../barretenberg/cpp/srs_db/ignition"); }
};


/**
 **************************************************************
 * Native initial private kernel circuit tests.
 **************************************************************
 */

/**
 * @brief Some private circuit simulation (`deposit`, in this case)
 */
TEST_F(native_private_kernel_init_tests, deposit)
{
    std::array<NT::fr, NUM_FIELDS_PER_SHA256> const& encrypted_logs_hash = { NT::fr(16), NT::fr(69) };
    NT::fr const& encrypted_log_preimages_length = NT::fr(100);
    std::array<NT::fr, NUM_FIELDS_PER_SHA256> const& unencrypted_logs_hash = { NT::fr(26), NT::fr(47) };
    NT::fr const& unencrypted_log_preimages_length = NT::fr(50);

    auto const& private_inputs = do_private_call_get_kernel_inputs_init(false,
                                                                        deposit,
                                                                        standard_test_args(),
                                                                        encrypted_logs_hash,
                                                                        unencrypted_logs_hash,
                                                                        encrypted_log_preimages_length,
                                                                        unencrypted_log_preimages_length);
    DummyBuilder builder = DummyBuilder("private_kernel_tests__native_deposit");
    auto const& public_inputs = native_private_kernel_circuit_initial(builder, private_inputs);

    EXPECT_TRUE(validate_no_new_deployed_contract(public_inputs));

    // Check the first nullifier is hash of the signed tx request
    ASSERT_EQ(public_inputs.end.new_nullifiers[0], private_inputs.tx_request.hash());

    // Log preimages length should increase by `(un)encrypted_log_preimages_length` from private input
    ASSERT_EQ(public_inputs.end.encrypted_log_preimages_length, encrypted_log_preimages_length);
    ASSERT_EQ(public_inputs.end.unencrypted_log_preimages_length, unencrypted_log_preimages_length);

    // Logs hashes should be a sha256 hash of a 0 value and the `(un)encrypted_logs_hash` from private input
    auto const& expected_encrypted_logs_hash =
        accumulate_sha256<NT>({ fr(0), fr(0), encrypted_logs_hash[0], encrypted_logs_hash[1] });
    ASSERT_EQ(public_inputs.end.encrypted_logs_hash, expected_encrypted_logs_hash);

    auto const& expected_unencrypted_logs_hash =
        accumulate_sha256<NT>({ fr(0), fr(0), unencrypted_logs_hash[0], unencrypted_logs_hash[1] });
    ASSERT_EQ(public_inputs.end.unencrypted_logs_hash, expected_unencrypted_logs_hash);

    // Assert that builder doesn't give any errors
    ASSERT_FALSE(builder.failed());
    EXPECT_EQ(builder.get_first_failure().message, "");
    EXPECT_EQ(builder.get_first_failure().code, CircuitErrorCode::NO_ERROR);
}

/**
 * @brief Some private circuit simulation (`constructor`, in this case)
 */
TEST_F(native_private_kernel_init_tests, basic_contract_deployment)
{
    auto const& private_inputs = do_private_call_get_kernel_inputs_init(true, constructor, standard_test_args());
    DummyBuilder builder = DummyBuilder("private_kernel_tests__native_basic_contract_deployment");
    auto const& public_inputs = native_private_kernel_circuit_initial(builder, private_inputs);

    EXPECT_TRUE(validate_deployed_contract_address(private_inputs, public_inputs));

    // Since there are no logs, log preimages length should be 0 and both logs hashes should be a sha256 hash of 2 zero
    // values
    ASSERT_EQ(public_inputs.end.encrypted_log_preimages_length, fr(0));
    ASSERT_EQ(public_inputs.end.unencrypted_log_preimages_length, fr(0));

    auto const& expected_logs_hash = accumulate_sha256<NT>({ fr(0), fr(0), fr(0), fr(0) });

    ASSERT_EQ(public_inputs.end.encrypted_logs_hash, expected_logs_hash);
    ASSERT_EQ(public_inputs.end.unencrypted_logs_hash, expected_logs_hash);

    // Assert that builder doesn't give any errors
    ASSERT_FALSE(builder.failed());
    EXPECT_EQ(builder.get_first_failure().message, "");
    EXPECT_EQ(builder.get_first_failure().code, CircuitErrorCode::NO_ERROR);
}

// TODO(suyash): Disabled until https://github.com/AztecProtocol/aztec-packages/issues/499 is resolved.
TEST_F(native_private_kernel_init_tests, DISABLED_contract_deployment_call_stack_item_hash_mismatch_fails)
{
    auto private_inputs = do_private_call_get_kernel_inputs_init(true, constructor, standard_test_args());

    // Randomise the second item in the private call stack (i.e. hash of the private call item).
    private_inputs.private_call.call_stack_item.public_inputs.private_call_stack[1] = NT::fr::random_element();

    DummyBuilder builder =
        DummyBuilder("private_kernel_tests__contract_deployment_call_stack_item_hash_mismatch_fails");
    native_private_kernel_circuit_initial(builder, private_inputs);

    EXPECT_EQ(builder.failed(), true);
    EXPECT_EQ(builder.get_first_failure().code,
              CircuitErrorCode::PRIVATE_KERNEL__PRIVATE_CALL_STACK_ITEM_HASH_MISMATCH);
}

TEST_F(native_private_kernel_init_tests, contract_deployment_incorrect_constructor_vk_hash_fails)
{
    auto private_inputs = do_private_call_get_kernel_inputs_init(true, constructor, standard_test_args());

    // Pollute the constructor vk hash in the tx_request.
    private_inputs.tx_request.tx_context.contract_deployment_data.constructor_vk_hash = NT::fr::random_element();

    DummyBuilder builder =
        DummyBuilder("private_kernel_tests__contract_deployment_incorrect_constructor_vk_hash_fails");
    native_private_kernel_circuit_initial(builder, private_inputs);

    EXPECT_EQ(builder.failed(), true);
    EXPECT_EQ(builder.get_first_failure().code, CircuitErrorCode::PRIVATE_KERNEL__INVALID_CONSTRUCTOR_VK_HASH);
    EXPECT_EQ(builder.get_first_failure().message, "constructor_vk_hash doesn't match private_call_vk_hash");
}

TEST_F(native_private_kernel_init_tests, contract_deployment_incorrect_contract_address_fails)
{
    auto private_inputs = do_private_call_get_kernel_inputs_init(true, constructor, standard_test_args());

    // Modify the contract address in appropriate places.
    const fr random_address = NT::fr::random_element();
    private_inputs.private_call.call_stack_item.public_inputs.call_context.storage_contract_address = random_address;
    private_inputs.tx_request.origin = random_address;
    private_inputs.private_call.call_stack_item.contract_address = random_address;

    DummyBuilder builder = DummyBuilder("private_kernel_tests__contract_deployment_incorrect_contract_address_fails");
    native_private_kernel_circuit_initial(builder, private_inputs);

    EXPECT_EQ(builder.failed(), true);
    EXPECT_EQ(builder.get_first_failure().code, CircuitErrorCode::PRIVATE_KERNEL__INVALID_CONTRACT_ADDRESS);
    EXPECT_EQ(builder.get_first_failure().message, "contract address supplied doesn't match derived address");
}

TEST_F(native_private_kernel_init_tests, contract_deployment_contract_address_mismatch_fails)
{
    auto private_inputs = do_private_call_get_kernel_inputs_init(true, constructor, standard_test_args());

    // Modify the storage_contract_address.
    const auto random_contract_address = NT::fr::random_element();
    private_inputs.private_call.call_stack_item.public_inputs.call_context.storage_contract_address =
        random_contract_address;
    private_inputs.private_call.call_stack_item.contract_address = random_contract_address;

    // Invoke the native private kernel circuit
    DummyBuilder builder = DummyBuilder("private_kernel_tests__contract_deployment_contract_address_mismatch_fails");
    native_private_kernel_circuit_initial(builder, private_inputs);

    // Assertion checks
    EXPECT_TRUE(builder.failed());
    EXPECT_EQ(builder.get_first_failure().code,
              CircuitErrorCode::PRIVATE_KERNEL__USER_INTENT_MISMATCH_BETWEEN_TX_REQUEST_AND_CALL_STACK_ITEM);
}

TEST_F(native_private_kernel_init_tests, contract_deployment_function_data_mismatch_fails)
{
    auto private_inputs = do_private_call_get_kernel_inputs_init(true, constructor, standard_test_args());

    // Modify the function selector in function data.
    private_inputs.tx_request.function_data.function_selector = numeric::random::get_engine().get_random_uint32();

    // Invoke the native private kernel circuit
    DummyBuilder builder = DummyBuilder("private_kernel_tests__contract_deployment_function_data_mismatch_fails");
    native_private_kernel_circuit_initial(builder, private_inputs);

    // Assertion checks
    EXPECT_TRUE(builder.failed());
    EXPECT_EQ(builder.get_first_failure().code,
              CircuitErrorCode::PRIVATE_KERNEL__USER_INTENT_MISMATCH_BETWEEN_TX_REQUEST_AND_CALL_STACK_ITEM);
    EXPECT_EQ(builder.get_first_failure().message,
              "user's intent does not match initial private call (tx_request.function_data must match "
              "call_stack_item.function_data)");
}

TEST_F(native_private_kernel_init_tests, contract_deployment_args_hash_mismatch_fails)
{
    auto private_inputs = do_private_call_get_kernel_inputs_init(true, constructor, standard_test_args());

    // Modify the args hash in tx request.
    private_inputs.tx_request.args_hash = NT::fr::random_element();

    // Invoke the native private kernel circuit
    DummyBuilder builder = DummyBuilder("private_kernel_tests__contract_deployment_args_hash_mismatch_fails");
    native_private_kernel_circuit_initial(builder, private_inputs);

    // Assertion checks
    EXPECT_TRUE(builder.failed());
    EXPECT_EQ(builder.get_first_failure().code,
              CircuitErrorCode::PRIVATE_KERNEL__USER_INTENT_MISMATCH_BETWEEN_TX_REQUEST_AND_CALL_STACK_ITEM);
    EXPECT_EQ(builder.get_first_failure().message,
              "user's intent does not match initial private call (tx_request.args must match "
              "call_stack_item.public_inputs.args)");
}

TEST_F(native_private_kernel_init_tests, private_function_is_private_false_fails)
{
    auto private_inputs = do_private_call_get_kernel_inputs_init(false, deposit, standard_test_args());

    // Set is_private in function data to false.
    private_inputs.private_call.call_stack_item.function_data.is_private = false;

    // Invoke the native private kernel circuit
    DummyBuilder builder = DummyBuilder("private_kernel_tests__private_function_is_private_false_fails");
    native_private_kernel_circuit_initial(builder, private_inputs);

    // Assertion checks
    EXPECT_TRUE(builder.failed());
    EXPECT_EQ(builder.get_first_failure().code,
              CircuitErrorCode::PRIVATE_KERNEL__NON_PRIVATE_FUNCTION_EXECUTED_WITH_PRIVATE_KERNEL);
    EXPECT_EQ(builder.get_first_failure().message,
              "Cannot execute a non-private function with the private kernel circuit");
}


TEST_F(native_private_kernel_init_tests, private_function_static_call_fails)
{
    auto private_inputs = do_private_call_get_kernel_inputs_init(false, deposit, standard_test_args());

    // Set is_static_call to true.
    private_inputs.private_call.call_stack_item.public_inputs.call_context.is_static_call = true;

    // Invoke the native private kernel circuit
    DummyBuilder builder = DummyBuilder("private_kernel_tests__private_function_static_call_fails");
    native_private_kernel_circuit_initial(builder, private_inputs);

    // Assertion checks
    EXPECT_TRUE(builder.failed());
    EXPECT_EQ(builder.get_first_failure().code, CircuitErrorCode::PRIVATE_KERNEL__UNSUPPORTED_OP);
    EXPECT_EQ(builder.get_first_failure().message, "Users cannot make a static call");
}

TEST_F(native_private_kernel_init_tests, private_function_delegate_call_fails)
{
    auto private_inputs = do_private_call_get_kernel_inputs_init(false, deposit, standard_test_args());

    // Set is_delegate_call to true.
    private_inputs.private_call.call_stack_item.public_inputs.call_context.is_delegate_call = true;

    // Invoke the native private kernel circuit
    DummyBuilder builder = DummyBuilder("private_kernel_tests__private_function_delegate_call_fails");
    native_private_kernel_circuit_initial(builder, private_inputs);

    // Assertion checks
    EXPECT_TRUE(builder.failed());
    EXPECT_EQ(builder.get_first_failure().code, CircuitErrorCode::PRIVATE_KERNEL__UNSUPPORTED_OP);
    EXPECT_EQ(builder.get_first_failure().message, "Users cannot make a delegatecall");
}

TEST_F(native_private_kernel_init_tests, private_function_incorrect_storage_contract_address_fails)
{
    auto private_inputs = do_private_call_get_kernel_inputs_init(false, deposit, standard_test_args());

    // Set the storage_contract_address to a random scalar.
    private_inputs.private_call.call_stack_item.public_inputs.call_context.storage_contract_address =
        NT::fr::random_element();

    // Invoke the native private kernel circuit
    DummyBuilder builder =
        DummyBuilder("private_kernel_tests__private_function_incorrect_storage_contract_address_fails");
    native_private_kernel_circuit_initial(builder, private_inputs);

    // Assertion checks
    EXPECT_TRUE(builder.failed());
    EXPECT_EQ(builder.get_first_failure().code, CircuitErrorCode::PRIVATE_KERNEL__CONTRACT_ADDRESS_MISMATCH);
    EXPECT_EQ(builder.get_first_failure().message, "Storage contract address must be that of the called contract");
}

TEST_F(native_private_kernel_init_tests, native_read_request_bad_request)
{
    auto private_inputs = do_private_call_get_kernel_inputs_init(false, deposit, standard_test_args());

    auto const& contract_address =
        private_inputs.private_call.call_stack_item.public_inputs.call_context.storage_contract_address;

    auto [read_requests, read_request_membership_witnesses, root] = get_random_reads(contract_address, 2);
    private_inputs.private_call.call_stack_item.public_inputs.historic_private_data_tree_root = root;

    // tweak read_request so it gives wrong root when paired with its sibling path
    read_requests[1] += 1;

    private_inputs.private_call.call_stack_item.public_inputs.read_requests = read_requests;
    private_inputs.private_call.read_request_membership_witnesses = read_request_membership_witnesses;

    DummyBuilder builder = DummyBuilder("native_private_kernel_init_tests__native_read_request_bad_request");
    auto const& public_inputs = native_private_kernel_circuit_initial(builder, private_inputs);

    validate_no_new_deployed_contract(public_inputs);

    ASSERT_TRUE(builder.failed());
    ASSERT_EQ(builder.get_first_failure().code,
              CircuitErrorCode::PRIVATE_KERNEL__READ_REQUEST_PRIVATE_DATA_ROOT_MISMATCH);

    // Check the first nullifier is hash of the signed tx request
    ASSERT_EQ(public_inputs.end.new_nullifiers[0], private_inputs.tx_request.hash());
}

TEST_F(native_private_kernel_init_tests, native_read_request_bad_leaf_index)
{
    auto private_inputs = do_private_call_get_kernel_inputs_init(false, deposit, standard_test_args());

    auto const& contract_address =
        private_inputs.private_call.call_stack_item.public_inputs.call_context.storage_contract_address;

    auto [read_requests, read_request_membership_witnesses, root] = get_random_reads(contract_address, 2);
    private_inputs.private_call.call_stack_item.public_inputs.historic_private_data_tree_root = root;

    // tweak leaf index so it gives wrong root when paired with its request and sibling path
    read_request_membership_witnesses[1].leaf_index += 1;
    private_inputs.private_call.call_stack_item.public_inputs.read_requests = read_requests;
    private_inputs.private_call.read_request_membership_witnesses = read_request_membership_witnesses;

    DummyBuilder builder = DummyBuilder("native_private_kernel_init_tests__native_read_request_bad_leaf_index");
    auto const& public_inputs = native_private_kernel_circuit_initial(builder, private_inputs);

    validate_no_new_deployed_contract(public_inputs);

    ASSERT_TRUE(builder.failed());
    ASSERT_EQ(builder.get_first_failure().code,
              CircuitErrorCode::PRIVATE_KERNEL__READ_REQUEST_PRIVATE_DATA_ROOT_MISMATCH);

    // Check the first nullifier is hash of the signed tx request
    ASSERT_EQ(public_inputs.end.new_nullifiers[0], private_inputs.tx_request.hash());
}

TEST_F(native_private_kernel_init_tests, native_read_request_bad_sibling_path)
{
    auto private_inputs = do_private_call_get_kernel_inputs_init(false, deposit, standard_test_args());

    auto const& contract_address =
        private_inputs.private_call.call_stack_item.public_inputs.call_context.storage_contract_address;

    auto [read_requests, read_request_membership_witnesses, root] = get_random_reads(contract_address, 2);
    private_inputs.private_call.call_stack_item.public_inputs.historic_private_data_tree_root = root;

    // tweak sibling path so it gives wrong root when paired with its request
    read_request_membership_witnesses[1].sibling_path[1] += 1;
    private_inputs.private_call.call_stack_item.public_inputs.read_requests = read_requests;
    private_inputs.private_call.read_request_membership_witnesses = read_request_membership_witnesses;

    DummyBuilder builder = DummyBuilder("native_private_kernel_init_tests__native_read_request_bad_sibling_path");
    auto const& public_inputs = native_private_kernel_circuit_initial(builder, private_inputs);

    validate_no_new_deployed_contract(public_inputs);

    ASSERT_TRUE(builder.failed());
    ASSERT_EQ(builder.get_first_failure().code,
              CircuitErrorCode::PRIVATE_KERNEL__READ_REQUEST_PRIVATE_DATA_ROOT_MISMATCH);

    // Check the first nullifier is hash of the signed tx request
    ASSERT_EQ(public_inputs.end.new_nullifiers[0], private_inputs.tx_request.hash());
}

TEST_F(native_private_kernel_init_tests, native_read_request_root_mismatch)
{
    auto private_inputs = do_private_call_get_kernel_inputs_init(false, deposit, standard_test_args());

    auto const& contract_address =
        private_inputs.private_call.call_stack_item.public_inputs.call_context.storage_contract_address;

    // generate two random sets of read requests and mix them so their roots don't match
    auto [read_requests0, read_request_membership_witnesses0, root] = get_random_reads(contract_address, 2);
    private_inputs.private_call.call_stack_item.public_inputs.historic_private_data_tree_root = root;
    auto [read_requests1, read_request_membership_witnesses1, _root] = get_random_reads(contract_address, 2);
    std::array<NT::fr, MAX_READ_REQUESTS_PER_CALL> bad_requests{};
    std::array<ReadRequestMembershipWitness<NT, PRIVATE_DATA_TREE_HEIGHT>, MAX_READ_REQUESTS_PER_CALL> bad_witnesses;
    // note we are using read_requests0 for some and read_requests1 for others
    bad_requests[0] = read_requests0[0];
    bad_requests[1] = read_requests0[1];
    bad_requests[2] = read_requests1[0];
    bad_requests[3] = read_requests1[1];
    bad_witnesses[0] = read_request_membership_witnesses0[0];
    bad_witnesses[1] = read_request_membership_witnesses0[1];
    bad_witnesses[2] = read_request_membership_witnesses1[0];
    bad_witnesses[3] = read_request_membership_witnesses1[1];
    private_inputs.private_call.call_stack_item.public_inputs.read_requests = bad_requests;
    private_inputs.private_call.read_request_membership_witnesses = bad_witnesses;

    DummyBuilder builder = DummyBuilder("native_private_kernel_init_tests__native_read_request_root_mismatch");
    auto const& public_inputs = native_private_kernel_circuit_initial(builder, private_inputs);

    validate_no_new_deployed_contract(public_inputs);

    ASSERT_TRUE(builder.failed());
    ASSERT_EQ(builder.get_first_failure().code,
              CircuitErrorCode::PRIVATE_KERNEL__READ_REQUEST_PRIVATE_DATA_ROOT_MISMATCH);

    // Check the first nullifier is hash of the signed tx request
    ASSERT_EQ(public_inputs.end.new_nullifiers[0], private_inputs.tx_request.hash());
}

TEST_F(native_private_kernel_init_tests, native_no_read_requests_works)
{
    // no read requests should work

    auto private_inputs = do_private_call_get_kernel_inputs_init(false, deposit, standard_test_args());

    // empty requests
    std::array<fr, MAX_READ_REQUESTS_PER_CALL> const read_requests{};
    std::array<ReadRequestMembershipWitness<NT, PRIVATE_DATA_TREE_HEIGHT>, MAX_READ_REQUESTS_PER_CALL> const
        read_request_membership_witnesses{};
    private_inputs.private_call.call_stack_item.public_inputs.read_requests = read_requests;
    private_inputs.private_call.read_request_membership_witnesses = read_request_membership_witnesses;

    DummyBuilder builder = DummyBuilder("native_private_kernel_init_tests__native_no_read_requests_works");
    auto const& public_inputs = native_private_kernel_circuit_initial(builder, private_inputs);

    validate_no_new_deployed_contract(public_inputs);

    auto failure = builder.get_first_failure();
    if (failure.code != CircuitErrorCode::NO_ERROR) {
        info("failure: ", failure);
    }
    ASSERT_FALSE(builder.failed());

    // Check the first nullifier is hash of the signed tx request
    ASSERT_EQ(public_inputs.end.new_nullifiers[0], private_inputs.tx_request.hash());
}

TEST_F(native_private_kernel_init_tests, native_one_read_requests_works)
{
    // one read request should work

    auto private_inputs = do_private_call_get_kernel_inputs_init(false, deposit, standard_test_args());

    auto const& contract_address =
        private_inputs.private_call.call_stack_item.public_inputs.call_context.storage_contract_address;

    auto [read_requests, read_request_membership_witnesses, root] = get_random_reads(contract_address, 1);
    private_inputs.private_call.call_stack_item.public_inputs.historic_private_data_tree_root = root;
    private_inputs.private_call.call_stack_item.public_inputs.read_requests = read_requests;
    private_inputs.private_call.read_request_membership_witnesses = read_request_membership_witnesses;

    DummyBuilder builder = DummyBuilder("native_private_kernel_init_tests__native_one_read_requests_works");
    auto const& public_inputs = native_private_kernel_circuit_initial(builder, private_inputs);

    validate_no_new_deployed_contract(public_inputs);

    auto failure = builder.get_first_failure();
    if (failure.code != CircuitErrorCode::NO_ERROR) {
        info("failure: ", failure);
    }
    ASSERT_FALSE(builder.failed());

    // Check the first nullifier is hash of the signed tx request
    ASSERT_EQ(public_inputs.end.new_nullifiers[0], private_inputs.tx_request.hash());
}

TEST_F(native_private_kernel_init_tests, native_two_read_requests_works)
{
    // two read requests should work

    auto private_inputs = do_private_call_get_kernel_inputs_init(false, deposit, standard_test_args());

    auto const& contract_address =
        private_inputs.private_call.call_stack_item.public_inputs.call_context.storage_contract_address;

    auto [read_requests, read_request_membership_witnesses, root] = get_random_reads(contract_address, 2);
    private_inputs.private_call.call_stack_item.public_inputs.historic_private_data_tree_root = root;
    private_inputs.private_call.call_stack_item.public_inputs.read_requests = read_requests;
    private_inputs.private_call.read_request_membership_witnesses = read_request_membership_witnesses;

    DummyBuilder builder = DummyBuilder("native_private_kernel_init_tests__native_two_read_requests_works");
    auto const& public_inputs = native_private_kernel_circuit_initial(builder, private_inputs);

    validate_no_new_deployed_contract(public_inputs);

    auto failure = builder.get_first_failure();
    if (failure.code != CircuitErrorCode::NO_ERROR) {
        info("failure: ", failure);
    }
    ASSERT_FALSE(builder.failed());

    // Check the first nullifier is hash of the signed tx request
    ASSERT_EQ(public_inputs.end.new_nullifiers[0], private_inputs.tx_request.hash());
}

TEST_F(native_private_kernel_init_tests, native_max_read_requests_works)
{
    // max read requests should work

    auto private_inputs = do_private_call_get_kernel_inputs_init(false, deposit, standard_test_args());

    auto const& contract_address =
        private_inputs.private_call.call_stack_item.public_inputs.call_context.storage_contract_address;

    auto [read_requests, read_request_membership_witnesses, root] =
        get_random_reads(contract_address, MAX_READ_REQUESTS_PER_CALL);
    private_inputs.private_call.call_stack_item.public_inputs.historic_private_data_tree_root = root;
    private_inputs.private_call.call_stack_item.public_inputs.read_requests = read_requests;
    private_inputs.private_call.read_request_membership_witnesses = read_request_membership_witnesses;

    DummyBuilder builder = DummyBuilder("native_private_kernel_init_tests__native_max_read_requests_works");
    auto const& public_inputs = native_private_kernel_circuit_initial(builder, private_inputs);

    validate_no_new_deployed_contract(public_inputs);

    auto failure = builder.get_first_failure();
    if (failure.code != CircuitErrorCode::NO_ERROR) {
        info("failure: ", failure);
    }
    ASSERT_FALSE(builder.failed());

    // Check the first nullifier is hash of the signed tx request
    ASSERT_EQ(public_inputs.end.new_nullifiers[0], private_inputs.tx_request.hash());
}

// TODO(dbanks12): more tests of read_requests for multiple iterations.
// Check enforcement that inner iterations' read_requests match root in constants
// https://github.com/AztecProtocol/aztec-packages/issues/786

TEST_F(native_private_kernel_init_tests, native_read_requests_less_than_witnesses)
{
    auto private_inputs = do_private_call_get_kernel_inputs_init(false, deposit, standard_test_args());

    auto const& contract_address =
        private_inputs.private_call.call_stack_item.public_inputs.call_context.storage_contract_address;

    auto [read_requests, read_request_membership_witnesses, root] =
        get_random_reads(contract_address, MAX_READ_REQUESTS_PER_CALL);

    read_requests[MAX_READ_REQUESTS_PER_CALL - 1] = fr(0);
    private_inputs.private_call.call_stack_item.public_inputs.historic_private_data_tree_root = root;
    private_inputs.private_call.call_stack_item.public_inputs.read_requests = read_requests;
    private_inputs.private_call.read_request_membership_witnesses = read_request_membership_witnesses;

    DummyBuilder builder = DummyBuilder("native_private_kernel_init_tests__native_read_requests_less_than_witnesses");
    auto const& public_inputs = native_private_kernel_circuit_initial(builder, private_inputs);

    ASSERT_TRUE(builder.failed());
    ASSERT_EQ(builder.get_first_failure().code,
              CircuitErrorCode::PRIVATE_KERNEL__READ_REQUEST_WITNESSES_ARRAY_LENGTH_MISMATCH);
}

TEST_F(native_private_kernel_init_tests, native_read_requests_more_than_witnesses)
{
    auto private_inputs = do_private_call_get_kernel_inputs_init(false, deposit, standard_test_args());

    auto const& contract_address =
        private_inputs.private_call.call_stack_item.public_inputs.call_context.storage_contract_address;

    auto [read_requests, read_request_membership_witnesses, root] =
        get_random_reads(contract_address, MAX_READ_REQUESTS_PER_CALL);

    read_request_membership_witnesses[MAX_READ_REQUESTS_PER_CALL - 1] =
        ReadRequestMembershipWitness<NT, PRIVATE_DATA_TREE_HEIGHT>{};

    private_inputs.private_call.call_stack_item.public_inputs.historic_private_data_tree_root = root;
    private_inputs.private_call.call_stack_item.public_inputs.read_requests = read_requests;
    private_inputs.private_call.read_request_membership_witnesses = read_request_membership_witnesses;

    DummyBuilder builder = DummyBuilder("native_private_kernel_init_tests__native_read_requests_more_than_witnesses");
    auto const& public_inputs = native_private_kernel_circuit_initial(builder, private_inputs);

    ASSERT_TRUE(builder.failed());
    ASSERT_EQ(builder.get_first_failure().code,
              CircuitErrorCode::PRIVATE_KERNEL__READ_REQUEST_WITNESSES_ARRAY_LENGTH_MISMATCH);
}

TEST_F(native_private_kernel_init_tests, native_one_transient_read_requests_works)
{
    // one transient read request should work

    auto private_inputs = do_private_call_get_kernel_inputs_init(false, deposit, standard_test_args());

    auto const& contract_address =
        private_inputs.private_call.call_stack_item.public_inputs.call_context.storage_contract_address;

    auto [read_requests, read_request_membership_witnesses, root] = get_random_reads(contract_address, 1);
    private_inputs.private_call.call_stack_item.public_inputs.historic_private_data_tree_root = root;
    private_inputs.private_call.call_stack_item.public_inputs.read_requests = read_requests;

    // Make the read request transient
    read_request_membership_witnesses[0].leaf_index = NT::fr(0);
    read_request_membership_witnesses[0].sibling_path = std::array<fr, PRIVATE_DATA_TREE_HEIGHT>{};
    read_request_membership_witnesses[0].is_transient = true;
    private_inputs.private_call.read_request_membership_witnesses = read_request_membership_witnesses;

    DummyBuilder builder = DummyBuilder("native_private_kernel_init_tests__native_one_transient_read_requests_works");
    auto const& public_inputs = native_private_kernel_circuit_initial(builder, private_inputs);

    validate_no_new_deployed_contract(public_inputs);

    auto failure = builder.get_first_failure();
    if (failure.code != CircuitErrorCode::NO_ERROR) {
        info("failure: ", failure);
    }
    ASSERT_FALSE(builder.failed());
}

// TODO(https://github.com/AztecProtocol/aztec-packages/issues/906): re-enable once kernel supports forwarding/matching
// of transient reads.
TEST_F(native_private_kernel_init_tests, native_max_read_requests_one_transient_works)
{
    // max read requests with one transient should work

    auto private_inputs = do_private_call_get_kernel_inputs_init(false, deposit, standard_test_args());

    auto const& contract_address =
        private_inputs.private_call.call_stack_item.public_inputs.call_context.storage_contract_address;

    auto [read_requests, read_request_membership_witnesses, root] =
        get_random_reads(contract_address, MAX_READ_REQUESTS_PER_CALL);
    private_inputs.private_call.call_stack_item.public_inputs.historic_private_data_tree_root = root;
    private_inputs.private_call.call_stack_item.public_inputs.read_requests = read_requests;

    // Make the read request at position 1 transient
    read_request_membership_witnesses[1].leaf_index = NT::fr(0);
    read_request_membership_witnesses[1].sibling_path = std::array<fr, PRIVATE_DATA_TREE_HEIGHT>{};
    read_request_membership_witnesses[1].is_transient = true;
    private_inputs.private_call.read_request_membership_witnesses = read_request_membership_witnesses;

    DummyBuilder builder =
        DummyBuilder("native_private_kernel_init_tests__native_max_read_requests_one_transient_works");
    auto const& public_inputs = native_private_kernel_circuit_initial(builder, private_inputs);

    validate_no_new_deployed_contract(public_inputs);

    auto failure = builder.get_first_failure();
    if (failure.code != CircuitErrorCode::NO_ERROR) {
        info("failure: ", failure);
    }
    ASSERT_FALSE(builder.failed());
}

}  // namespace aztec3::circuits::kernel::private_kernel

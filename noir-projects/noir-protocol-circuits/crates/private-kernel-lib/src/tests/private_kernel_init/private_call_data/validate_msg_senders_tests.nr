use crate::tests::private_kernel_init::TestBuilder;
use dep::types::{
    address::AztecAddress, constants::NULL_MSG_SENDER_CONTRACT_ADDRESS, traits::FromField,
};

#[test(should_fail_with = "incorrect msg_sender for private call request")]
fn private_call_request_with_incorrect_msg_sender() {
    let mut builder = TestBuilder::new();
    builder.private_call.append_private_call_requests(2);

    // Tweak the msg_sender to be a random address.
    let mut call_request = builder.private_call.private_call_requests.get(0);
    call_request.call_context.msg_sender = AztecAddress::from_field(99);
    builder.private_call.private_call_requests.set(0, call_request);

    builder.execute_and_fail();
}

#[test(should_fail_with = "incorrect msg_sender for private call request")]
fn private_call_request_with_null_msg_sender() {
    let mut builder = TestBuilder::new();
    builder.private_call.append_private_call_requests(2);

    // Change the msg_sender to be null.
    let mut call_request = builder.private_call.private_call_requests.get(0);
    call_request.call_context.msg_sender = NULL_MSG_SENDER_CONTRACT_ADDRESS;
    builder.private_call.private_call_requests.set(0, call_request);

    builder.execute_and_fail();
}

#[test(should_fail_with = "incorrect msg_sender for public call request")]
fn public_call_request_with_incorrect_msg_sender() {
    let mut builder = TestBuilder::new();
    builder.private_call.append_public_call_requests(2);

    // Tweak the msg_sender to be a random address.
    let mut call_request = builder.private_call.public_call_requests.get(0);
    call_request.inner.msg_sender = AztecAddress::from_field(99);
    builder.private_call.public_call_requests.set(0, call_request);

    builder.execute_and_fail();
}

#[test]
fn public_call_request_with_null_msg_sender() {
    let mut builder = TestBuilder::new();
    builder.private_call.append_public_call_requests(2);

    // Change the msg_sender to be null.
    let mut call_request = builder.private_call.public_call_requests.get(0);
    call_request.inner.msg_sender = NULL_MSG_SENDER_CONTRACT_ADDRESS;
    builder.private_call.public_call_requests.set(0, call_request);

    let _ = builder.execute();
}

#[test(should_fail_with = "incorrect msg_sender for public teardown call request")]
fn public_teardown_call_request_with_incorrect_msg_sender() {
    let mut builder = TestBuilder::new();
    builder.private_call.set_public_teardown_call_request();

    // Tweak the msg_sender to be a random address.
    builder.private_call.public_teardown_call_request.msg_sender = AztecAddress::from_field(99);

    builder.execute_and_fail();
}

#[test]
fn public_teardown_call_request_with_null_msg_sender() {
    let mut builder = TestBuilder::new();
    builder.private_call.set_public_teardown_call_request();

    // Change the msg_sender to be null.
    builder.private_call.public_teardown_call_request.msg_sender = NULL_MSG_SENDER_CONTRACT_ADDRESS;

    let _ = builder.execute();
}

use aztec::protocol_types::constants::ROUTER_ADDRESS;
use aztec::context::private_context::PrivateContext;
use crate::Router;

// docs:start:helper_router_functions
pub fn privately_check_timestamp(operation: u8, value: u64, context: &mut PrivateContext) {
    Router::at(ROUTER_ADDRESS).check_timestamp(operation, value).call(context);
}

pub fn privately_check_block_number(operation: u8, value: Field, context: &mut PrivateContext) {
    // docs:start:enqueueing
    Router::at(ROUTER_ADDRESS).check_block_number(operation, value).call(context);
    // docs:end:enqueueing
}
// docs:end:helper_router_functions
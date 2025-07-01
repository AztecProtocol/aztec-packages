use crate::{
    address::AztecAddress,
    constants::{
        MAX_ENQUEUED_CALLS_PER_TX, NUM_PUBLIC_CALL_REQUEST_ARRAYS, PUBLIC_CALL_REQUEST_LENGTH,
    },
    traits::{Deserialize, Empty, FromField, Serialize, ToField},
    utils::{arrays::array_length, reader::Reader},
};

#[derive(Deserialize, Eq, Serialize)]
pub struct PublicCallRequest {
    pub msg_sender: AztecAddress,
    pub contract_address: AztecAddress,
    pub is_static_call: bool,
    pub calldata_hash: Field,
}

impl Empty for PublicCallRequest {
    fn empty() -> Self {
        PublicCallRequest {
            msg_sender: AztecAddress::empty(),
            contract_address: AztecAddress::empty(),
            is_static_call: false,
            calldata_hash: 0,
        }
    }
}

#[derive(Deserialize, Eq, Serialize)]
pub struct PublicCallRequestArrayLengths {
    pub setup_calls: u32,
    pub app_logic_calls: u32,
    pub teardown_call: bool,
}

impl PublicCallRequestArrayLengths {
    pub fn new(
        setup_call_requests: [PublicCallRequest; MAX_ENQUEUED_CALLS_PER_TX],
        app_logic_call_requests: [PublicCallRequest; MAX_ENQUEUED_CALLS_PER_TX],
        teardown_call_request: PublicCallRequest,
    ) -> Self {
        PublicCallRequestArrayLengths {
            setup_calls: array_length(setup_call_requests),
            app_logic_calls: array_length(app_logic_call_requests),
            teardown_call: !teardown_call_request.is_empty(),
        }
    }
}

impl Empty for PublicCallRequestArrayLengths {
    fn empty() -> Self {
        PublicCallRequestArrayLengths { setup_calls: 0, app_logic_calls: 0, teardown_call: false }
    }
}

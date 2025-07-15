use crate::{
    abis::{call_context::CallContext, side_effect::{Ordered, RangeOrdered}},
    traits::{Deserialize, Empty, Serialize},
};

#[derive(Deserialize, Eq, Serialize)]
pub struct PrivateCallRequest {
    pub call_context: CallContext,
    pub args_hash: Field,
    pub returns_hash: Field,
    pub start_side_effect_counter: u32,
    pub end_side_effect_counter: u32,
}

impl Ordered for PrivateCallRequest {
    fn counter(self) -> u32 {
        self.start_side_effect_counter
    }
}

impl RangeOrdered for PrivateCallRequest {
    fn counter_start(self) -> u32 {
        self.start_side_effect_counter
    }
    fn counter_end(self) -> u32 {
        self.end_side_effect_counter
    }
}

impl Empty for PrivateCallRequest {
    fn empty() -> Self {
        PrivateCallRequest {
            call_context: CallContext::empty(),
            args_hash: 0,
            returns_hash: 0,
            start_side_effect_counter: 0,
            end_side_effect_counter: 0,
        }
    }
}

mod test {
    use crate::{
        abis::private_call_request::PrivateCallRequest,
        constants::PRIVATE_CALL_REQUEST_LENGTH,
        traits::{Deserialize, Empty, Serialize},
    };

    #[test]
    fn serialization_of_empty() {
        let item = PrivateCallRequest::empty();
        // We use the PRIVATE_CALL_REQUEST_LENGTH constant to ensure that there is a match between the derived trait
        // implementation and the constant.
        let serialized: [Field; PRIVATE_CALL_REQUEST_LENGTH] = item.serialize();
        let deserialized = PrivateCallRequest::deserialize(serialized);
        assert(item.eq(deserialized));
    }
}

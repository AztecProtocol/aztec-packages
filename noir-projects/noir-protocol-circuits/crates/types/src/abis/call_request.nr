use crate::address::AztecAddress;
use dep::std::cmp::Eq;
use dep::std::default::Default;
use crate::abis::caller_context::CallerContext;

struct CallRequest {
    hash: Field,
    caller_contract_address: AztecAddress,
    caller_context: CallerContext,
    start_side_effect_counter: u32,
    end_side_effect_counter: u32,
}

impl Eq for CallRequest {
    fn eq(self, call_request: CallRequest) -> bool {
        (call_request.hash == self.hash)
            & (call_request.caller_contract_address.eq(self.caller_contract_address))
            & (call_request.caller_context.eq(self.caller_context))
            & (call_request.start_side_effect_counter == self.start_side_effect_counter)
            & (call_request.end_side_effect_counter == self.end_side_effect_counter)
    }
}

impl Default for CallRequest {
    fn default() -> Self {
        CallRequest {
            hash: 0,
            caller_contract_address: AztecAddress::default(),
            caller_context: CallerContext::default(),
            start_side_effect_counter: 0,
            end_side_effect_counter: 0,
        }
    }
}

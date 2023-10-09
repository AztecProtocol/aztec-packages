use crate::abis::function_selector::FunctionSelector;
use crate::address::{EthAddress,Address};
use crate::constants;

struct CallContext{
    msg_sender : Address,
    storage_contract_address : Address,
    portal_contract_address : EthAddress,

    function_selector : FunctionSelector,

    is_delegate_call : bool,
    is_static_call : bool,
    is_contract_deployment : bool,
}

impl CallContext {
    fn hash(self) -> Field {
        let _hash_index = constants::generator_index::CALL_CONTEXT;
        0
    }

    fn assert_is_zero(self) {
        assert(self.msg_sender.to_field() == 0);
        assert(self.storage_contract_address.to_field() == 0);
        assert(self.portal_contract_address.to_field() == 0);
        assert(self.function_selector.to_field() == 0);
        assert(self.is_delegate_call == false);
        assert(self.is_static_call == false);
        assert(self.is_contract_deployment == false);
    }
}
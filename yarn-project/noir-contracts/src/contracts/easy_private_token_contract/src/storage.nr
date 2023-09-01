// docs:start:easy_private_token_storage
use dep::aztec::state_vars::map::Map;
use dep::easy_private_state::easy_private_state::EasyPrivateUint;
use dep::std::option::Option;
use dep::aztec::context::{PrivateContext, PublicContext};

struct Storage {
    balances: Map<EasyPrivateUint>,
}

impl Storage {
    fn init(
        private_context: Option<&mut PrivateContext>,
        public_context: Option<&mut PublicContext>,
    ) -> Self {
        Storage {
            balances: Map::new(1, |slot| EasyPrivateUint::new(slot)),
        }
    }
}
// docs:end:easy_private_token_storage

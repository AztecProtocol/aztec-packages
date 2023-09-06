
use dep::std::option::Option;

use dep::aztec::context::{
    PrivateContext,
    PublicContext,
};

struct AccountContract {
  address: Field,
}

impl AccountContract {
  fn at(address: Field) -> Self {
    Self {
      address,
    }
  }

  fn is_valid(
    self: Self, 
    private_context: Option<&mut PrivateContext>, 
    public_context: Option<PublicContext>,
    message_hash: Field
  ) -> Field {
    if private_context.is_some() {
      private_context.unwrap().call_private_function(
        self.address, 
        0xe86ab4ff,
        [message_hash]
      )[0]
    } else if public_context.is_some() {
      public_context.unwrap().call_public_function(
        self.address,
        0xf3661153,
        [message_hash]
      )[0]
    } else {
      0
    }
  }
}
// docs:start:interfaces
use dep::protocol_types::address::{
  Address,
  EthAddress,
};
use dep::aztec::{
  context::{ PrivateContext, PublicContext, Context },
  selector::compute_selector,
};

struct Token {
  address: Address,
}

impl Token {
  pub fn at(address: Address) -> Self {
    Self { address }
  }

  pub fn transfer_public(self: Self, context: PublicContext, from: Address, to: Address, amount: Field, nonce: Field) {
    context.call_public_function(
      self.address,
      compute_selector("transfer_public((Field),(Field),Field,Field)"),
      [from.to_field(), to.to_field(), amount, nonce]
    );
  }

  pub fn unshield(self: Self, context: &mut PrivateContext, from: Address, to: Address,  amount: Field, nonce: Field) {
    context.call_private_function(
      self.address,
      compute_selector("unshield((Field),(Field),Field,Field)"),
      [from.to_field(), to.to_field(), amount, nonce]
    );
  }
}

struct TokenBridge {
  address: Address,
}

impl TokenBridge {
  pub fn at(address: Address) -> Self {
    Self { address }
  }

  pub fn token(self: Self, context: PublicContext) -> Address {
    let return_values = context.call_public_function(self.address, compute_selector("get_token()"), []);
    Address::from_field(return_values[0])
  }

  pub fn exit_to_l1_public(self: Self, context: PublicContext, recipient: EthAddress, amount: Field, callerOnL1: EthAddress, nonce: Field) {
    context.call_public_function(
      self.address,
      compute_selector("exit_to_l1_public((Field),Field,(Field),Field)"),
      [recipient.to_field(), amount, callerOnL1.to_field(), nonce]
    );
  }
}
// docs:end:interfaces

// docs:start:interfaces
use dep::aztec::{
  context::{ PrivateContext, PublicContext, Context },
  selector::compute_selector,
  types::address::{AztecAddress, EthereumAddress},
};

struct Token {
  address: Field,
}

impl Token {
  pub fn at(address: Field) -> Self {
    Self { address }
  }

  pub fn transfer_public(self: Self, context: PublicContext, from: Field, to: Field, amount: Field, nonce: Field) {
    let _transfer_return_values = context.call_public_function(
      self.address,
      compute_selector("transfer_public((Field),(Field),Field,Field)"),
      [from, to, amount, nonce]
    );
  }

  pub fn unshield(self: Self, context: &mut PrivateContext, from: Field, to: Field,  amount: Field, nonce: Field) {
    let _return_values = context.call_private_function(
      self.address,
      compute_selector("unshield((Field),(Field),Field,Field)"),
      [from, to, amount, nonce]
    );
  }
}

struct TokenBridge {
  address: Field,
}

impl TokenBridge {
  pub fn at(address: Field) -> Self {
    Self { address }
  }

  pub fn token(self: Self, context: PublicContext) -> AztecAddress {
    let return_values = context.call_public_function(self.address, compute_selector("get_token()"), []);
    AztecAddress::new(return_values[0])
  }

  pub fn exit_to_l1_public(self: Self, context: PublicContext, recipient: EthereumAddress, amount: Field, callerOnL1: EthereumAddress, nonce: Field) {
    let _return_values = context.call_public_function(
      self.address,
      compute_selector("exit_to_l1_public((Field),Field,(Field),Field)"),
      [recipient.address, amount, callerOnL1.address, nonce]
    );
  }

  pub fn exit_to_l1_private(
    self: Self, 
    context: &mut PrivateContext, 
    token: AztecAddress, 
    recipient: EthereumAddress, 
    amount: Field, 
    callerOnL1: EthereumAddress, 
    nonce: Field
  ) {
    let _return_values = context.call_private_function(
      self.address,
      compute_selector("exit_to_l1_private((Field),(Field),Field,(Field),Field)"),
      [token.address, recipient.address, amount, callerOnL1.address, nonce]
    );
  }
}
// docs:end:interfaces

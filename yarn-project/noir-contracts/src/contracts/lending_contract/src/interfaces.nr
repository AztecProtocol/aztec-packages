mod storage;

use dep::aztec::context::{
    PrivateContext,
    PublicContext
};

use crate::storage::Asset;
use dep::aztec::constants_gen::RETURN_VALUES_LENGTH;


struct Token {
  address: Field,
}

impl Token {
  fn at(address: Field) -> Self {
    Self { address }
  }

  fn transfer_pub(self: Self, context: PublicContext, to: Field, amount: Field) {
    let _transfer_return_values = context.call_public_function(
      self.address,
      1012824788, 
      [to, amount]
    );
  }

  fn transfer_from_pub(self: Self, context: PublicContext, from: Field, to: Field, amount: Field) {
    let _transfer_return_values = context.call_public_function(
      self.address, 
      1602017294, 
      [from, to, amount]
    );
  }

  fn owner_mint_pub(self: Self, context: PublicContext, to: Field, amount: Field) {
    let _transfer_return_values = context.call_public_function(
      self.address, 
      1071038680, 
      [to, amount]
    );
  }

  // Private
  fn unshield(self: Self, context: &mut PrivateContext, from: Field, to: Field, amount: Field) -> [Field; RETURN_VALUES_LENGTH] {
    (*context).call_private_function(
      self.address, 
      2423803924, 
      [amount, from, to]
    )
  }
}


struct UpdateResponse {
  context: PublicContext,
  asset: Asset,
}

struct Lending {
  address: Field,
}

impl Lending {
  fn at(address: Field) -> Self {
    Self { address }
  }

  fn update_accumulator(self: Self, context: PublicContext) -> Asset {
    let return_values = context.call_public_function_no_args(
      self.address, 
      1259373467
    );

    Asset {
      interest_accumulator: return_values[0] as u120,
      last_updated_ts: return_values[1] as u120,
      loan_to_value: return_values[2] as u120,
      oracle_address: return_values[3],
    }
  }
}
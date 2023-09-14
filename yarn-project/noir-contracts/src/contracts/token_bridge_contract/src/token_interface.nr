use dep::aztec::{
	context::{ PrivateContext, PublicContext, Context },
	oracle::compute_selector::compute_selector
};

struct Token {
  address: Field,
}

impl Token {
  	fn at(address: Field) -> Self {
      	Self {
			address,
      	}
  	}

	fn mint_public(
			self,
			context: PublicContext,
			to: Field,
			amount: Field,
	) -> Field {
		let return_value = context.call_public_function(
			self.address, 
			compute_selector("mint_public((Field),Field)"), 
			[to, amount]
		);
		return_value[0]
	}

	fn mint_private(
		self,
		context: PublicContext,
		amount: Field,
		secret_hash: Field,
    ) -> Field {
		let return_value = context.call_public_function(
			self.address, 
			compute_selector("mint_private(Field,Field)"), 
			[amount, secret_hash]
		);
		return_value[0]
	}

	fn burn(
		self,
		context: &mut PrivateContext,
		from: Field,
		amount: Field,
		nonce: Field,
		) -> Field {
		let return_value = context.call_private_function(
			self.address, 
			compute_selector("burn((Field),Field,Field)"), 
			[from, amount, nonce]
		);
		return_value[0]
	}

	fn burn_public(
		self,
		context: PublicContext,
		from: Field,
		amount: Field,
		nonce: Field,
		) -> Field {
		let return_value = context.call_public_function(
			self.address, 
			compute_selector("burn_public((Field),Field,Field)"), 
			[from, amount, nonce]
		);
		return_value[0]
	}
}
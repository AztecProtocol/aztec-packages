/// Notifies the simulator that `returns` will be later fetched once the function return is processed, referenced by
/// their hash. This allows the simulator to know how to respond to this future request.
///
/// This is only used during private execution, since in public it is the VM itself that keeps track of return values.
pub fn store_returns(returns: [Field]) {
    // This oracle call returns nothing: we only call it for its side effects. It is therefore always safe to call. When
    // getting the return values, however, the caller must check that the returned value is indeed the preimage.
    unsafe { store_returns_oracle_wrapper(returns) };
}

pub unconstrained fn store_returns_oracle_wrapper(returns: [Field]) {
    let _ = store_returns_oracle(returns);
}

pub unconstrained fn get_returns<let N: u32>(return_hash: Field) -> [Field; N] {
    get_returns_oracle(return_hash)
}

#[oracle(storeReturns)]
unconstrained fn store_returns_oracle(_returns: [Field]) -> Field {}

#[oracle(getReturns)]
unconstrained fn get_returns_oracle<let N: u32>(_return_hash: Field) -> [Field; N] {}

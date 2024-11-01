/// Notifies the simulator that `args` will later be used at some point during execution, referenced by their hash. This
/// allows the simulator to know how to respond to this future request.
///
/// This is only used during private execution, since in public it is the VM itself that keeps track of arguments.
pub fn pack_arguments(args: [Field]) {
    // This oracle call returns nothing: we only call it for its side effects. It is therefore always safe to call. When
    // unpacking however the caller must check that the returned value is indeed the preimage.
    unsafe { pack_arguments_oracle_wrapper(args) };
}

/// Same as `pack_arguments`, but using arrays instead of slices.
pub fn pack_arguments_array<let N: u32>(args: [Field; N]) {
    // This oracle call returns nothing: we only call it for its side effects. It is therefore always safe to call. When
    // unpacking however the caller must check that the returned value is indeed the preimage.
    unsafe { pack_arguments_array_oracle_wrapper(args) };
}

unconstrained fn pack_arguments_oracle_wrapper(args: [Field]) {
    let _ = pack_arguments_oracle(args);
}

unconstrained fn pack_arguments_array_oracle_wrapper<let N: u32>(args: [Field; N]) {
    let _ = pack_arguments_array_oracle(args);
}

#[oracle(packArguments)]
unconstrained fn pack_arguments_oracle(_args: [Field]) -> Field {}

#[oracle(packArgumentsArray)]
unconstrained fn pack_arguments_array_oracle<let N: u32>(_args: [Field; N]) -> Field {}

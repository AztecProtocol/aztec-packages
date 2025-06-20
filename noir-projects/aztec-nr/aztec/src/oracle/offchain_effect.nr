use protocol_types::traits::Serialize;

/// Emits data that will be delivered to PXE unaltered. This data can be interpreted freely by a
/// downstream consumer (such as a wallet).
///
/// # Arguments
///
/// * `data` - The data to emit.
pub fn emit_offchain_effect<T, let N: u32>(data: T)
where
    T: Serialize<N>,
{
    // Safety: This oracle call returns nothing: we only call it for its side effects. It is therefore always safe
    // to call.
    unsafe { emit_offchain_effect_oracle_wrapper(data) };
}

unconstrained fn emit_offchain_effect_oracle_wrapper<T, let N: u32>(data: T)
where
    T: Serialize<N>,
{
    emit_offchain_effect_oracle(data.serialize());
}

#[oracle(emitOffchainEffect)]
unconstrained fn emit_offchain_effect_oracle<let N: u32>(data: [Field; N]) {}

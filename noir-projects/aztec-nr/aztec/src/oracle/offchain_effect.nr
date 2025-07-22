use protocol_types::traits::Serialize;

/// Emits data that will be delivered to PXE unaltered. This data can be interpreted freely by a
/// downstream consumer (such as a wallet).
///
/// # Arguments
///
/// * `data` - The data to emit.
pub unconstrained fn emit_offchain_effect<T>(data: T)
where
    T: Serialize,
{
    emit_offchain_effect_oracle(data.serialize());
}

#[oracle(emitOffchainEffect)]
unconstrained fn emit_offchain_effect_oracle<let N: u32>(data: [Field; N]) {}

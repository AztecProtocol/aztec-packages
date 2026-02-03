use crate::protocol::{abis::block_header::BlockHeader, address::AztecAddress, traits::{Hash, Packable, ToField}};

#[oracle(utilityStorageRead)]
unconstrained fn storage_read_oracle<let N: u32>(
    block_hash: Field,
    address: Field,
    storage_slot: Field,
    length: u32,
) -> [Field; N] {}

pub unconstrained fn raw_storage_read<let N: u32>(
    block_hash_to_read_from: Field,
    address: AztecAddress,
    storage_slot: Field,
) -> [Field; N] {
    storage_read_oracle(block_hash_to_read_from, address.to_field(), storage_slot, N)
}

pub unconstrained fn storage_read<T>(header_to_read_from: BlockHeader, address: AztecAddress, storage_slot: Field) -> T
where
    T: Packable,
{
    let block_hash_to_read_from = header_to_read_from.hash();
    T::unpack(
        raw_storage_read(block_hash_to_read_from, address, storage_slot),
    )
}

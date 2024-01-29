use dep::std::merkle::compute_merkle_root;
use dep::protocol_types::{
    constants::HEADER_LENGTH,
    header::Header,
};

use crate::{
    context::PrivateContext,
    oracle::get_membership_witness::get_archive_membership_witness,
};

#[oracle(getHeader)]
fn get_header_oracle(_block_number: u32) -> [Field; HEADER_LENGTH] {}

unconstrained pub fn get_header_internal(block_number: u32) -> Header {
    let header = get_header_oracle(block_number);
    Header::deserialize(header)
}

pub fn get_header(block_number: u32, context: PrivateContext) -> Header {
    // 1) Get block number corresponding to block header inside context
    let header_block_number = context.header.global_variables.block_number as u32;

    // 2) Check that the header block number is more than or equal to the block number we want to prove against
    // We could not perform the proof otherwise because the archive root from the header would not "contain" the header we want to prove against
    assert(
        header_block_number >= block_number, "Header block number is smaller than the block number we want to prove against"
    );

    // 3) Get the header of a given block from oracle
    let header = get_header_internal(block_number);

    // 4) Compute the block hash from the block header
    let block_hash = header.block_hash();

    // 5) Get the membership witness of the block in the archive
    let witness = get_archive_membership_witness(header_block_number, block_hash);

    // 6) Check that the block is in the archive (i.e. the witness is valid)
    assert(
        context.header.last_archive.root == compute_merkle_root(block_hash, witness.index, witness.path), "Proving membership of a block in archive failed"
    );

    // 7) Return the block header
    header
}

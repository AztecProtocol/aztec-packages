mod aztec_address;
mod eth_address;
mod partial_address;
mod public_keys_hash;
mod salted_initialization_hash;

pub use aztec_address::AztecAddress;
pub use eth_address::EthAddress;
pub use partial_address::PartialAddress;
pub use public_keys_hash::PublicKeysHash;
pub use salted_initialization_hash::SaltedInitializationHash;

use crate::{constants::GENERATOR_INDEX__CONSTRUCTOR, hash::poseidon2_hash_with_separator};

pub fn compute_initialization_hash(selector: Field, args_hash: Field) -> Field {
    poseidon2_hash_with_separator(
        [
        selector,
        args_hash
    ],
        GENERATOR_INDEX__CONSTRUCTOR
    )
}

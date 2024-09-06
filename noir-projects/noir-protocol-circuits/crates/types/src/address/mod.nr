mod aztec_address;
mod eth_address;
mod partial_address;
mod public_keys_hash;
mod salted_initialization_hash;

pub use crate::address::aztec_address::AztecAddress;
pub use crate::address::eth_address::EthAddress;
pub use crate::address::partial_address::PartialAddress;
pub use crate::address::public_keys_hash::PublicKeysHash;
pub use crate::address::salted_initialization_hash::SaltedInitializationHash;

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

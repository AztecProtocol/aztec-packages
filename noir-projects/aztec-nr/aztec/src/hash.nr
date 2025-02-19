use crate::utils::to_bytes::{arr_to_be_bytes_arr, str_to_be_bytes_arr};
use dep::protocol_types::{
    address::{AztecAddress, EthAddress},
    constants::{
        GENERATOR_INDEX__FUNCTION_ARGS, GENERATOR_INDEX__MESSAGE_NULLIFIER,
        GENERATOR_INDEX__SECRET_HASH,
    },
    hash::{poseidon2_hash_with_separator, poseidon2_hash_with_separator_slice, sha256_to_field},
    point::Point,
    traits::Hash,
};

pub use dep::protocol_types::hash::{compute_siloed_nullifier, pedersen_hash};

pub fn pedersen_commitment<let N: u32>(inputs: [Field; N], hash_index: u32) -> Point {
    std::hash::pedersen_commitment_with_separator(inputs, hash_index)
}

pub fn compute_secret_hash(secret: Field) -> Field {
    poseidon2_hash_with_separator([secret], GENERATOR_INDEX__SECRET_HASH)
}

pub fn compute_l1_to_l2_message_hash(
    sender: EthAddress,
    chain_id: Field,
    recipient: AztecAddress,
    version: Field,
    content: Field,
    secret_hash: Field,
    leaf_index: Field,
) -> Field {
    let mut hash_bytes = [0 as u8; 224];
    let sender_bytes: [u8; 32] = sender.to_field().to_be_bytes();
    let chain_id_bytes: [u8; 32] = chain_id.to_be_bytes();
    let recipient_bytes: [u8; 32] = recipient.to_field().to_be_bytes();
    let version_bytes: [u8; 32] = version.to_be_bytes();
    let content_bytes: [u8; 32] = content.to_be_bytes();
    let secret_hash_bytes: [u8; 32] = secret_hash.to_be_bytes();
    let leaf_index_bytes: [u8; 32] = leaf_index.to_be_bytes();

    for i in 0..32 {
        hash_bytes[i] = sender_bytes[i];
        hash_bytes[i + 32] = chain_id_bytes[i];
        hash_bytes[i + 64] = recipient_bytes[i];
        hash_bytes[i + 96] = version_bytes[i];
        hash_bytes[i + 128] = content_bytes[i];
        hash_bytes[i + 160] = secret_hash_bytes[i];
        hash_bytes[i + 192] = leaf_index_bytes[i];
    }

    sha256_to_field(hash_bytes)
}

// The nullifier of a l1 to l2 message is the hash of the message salted with the secret
pub fn compute_l1_to_l2_message_nullifier(message_hash: Field, secret: Field) -> Field {
    poseidon2_hash_with_separator([message_hash, secret], GENERATOR_INDEX__MESSAGE_NULLIFIER)
}

pub struct ArgsHasher {
    pub fields: [Field],
}

impl Hash for ArgsHasher {
    fn hash(self) -> Field {
        hash_args(self.fields)
    }
}

impl ArgsHasher {
    pub fn new() -> Self {
        Self { fields: [] }
    }

    pub fn add(&mut self, field: Field) {
        self.fields = self.fields.push_back(field);
    }

    pub fn add_multiple<let N: u32>(&mut self, fields: [Field; N]) {
        for i in 0..N {
            self.fields = self.fields.push_back(fields[i]);
        }
    }
}

pub fn hash_args_array<let N: u32>(args: [Field; N]) -> Field {
    if args.len() == 0 {
        0
    } else {
        poseidon2_hash_with_separator(args, GENERATOR_INDEX__FUNCTION_ARGS)
    }
}

pub fn hash_args(args: [Field]) -> Field {
    if args.len() == 0 {
        0
    } else {
        poseidon2_hash_with_separator_slice(args, GENERATOR_INDEX__FUNCTION_ARGS)
    }
}

#[test]
unconstrained fn compute_var_args_hash() {
    let mut input = ArgsHasher::new();
    for i in 0..100 {
        input.add(i as Field);
    }
    let hash = input.hash();
    dep::std::println(hash);
    assert(hash == 0x19b0d74feb06ebde19edd85a28986c97063e84b3b351a8b666c7cac963ce655f);
}

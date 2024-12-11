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

pub fn compute_unencrypted_log_hash<let N: u32>(
    contract_address: AztecAddress,
    log: [u8; N],
) -> Field {
    let mut hash_bytes = [0; N + 36];
    // Address is converted to 32 bytes in ts
    let address_bytes: [u8; 32] = contract_address.to_field().to_be_bytes();
    for i in 0..32 {
        hash_bytes[i] = address_bytes[i];
    }
    let len_bytes: [u8; 4] = (N as Field).to_be_bytes();
    for i in 0..4 {
        hash_bytes[32 + i] = len_bytes[i];
    }
    for i in 0..N {
        hash_bytes[36 + i] = log[i];
    }

    sha256_to_field(hash_bytes)
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

#[test]
unconstrained fn compute_unenc_log_hash_array() {
    let contract_address = AztecAddress::from_field(
        0x233a3e0df23b2b15b324194cb4a151f26c0b7333250781d34cc269d85dc334c6,
    );
    let log = [
        0x20660de09f35f876e3e69d227b2a35166ad05f09d82d06366ec9b6f65a51fec2,
        0x1b52bfe3b8689761916f76dc3d38aa8810860db325cd39ca611eed980091f01c,
        0x2e559c4045c378a56ad13b9edb1e8de4e7ad3b3aa35cc7ba9ec77f7a68fa43a4,
        0x25d0f689c4a4178a29d59306f2675824d19be6d25e44fa03b03f49c263053dd2,
        0x2d513a722d6f352dc0961f156afdc5e31495b9f0e35cb069261a8e55e2df67fd,
    ];
    let serialized_log = arr_to_be_bytes_arr(log);
    let hash = compute_unencrypted_log_hash(contract_address, serialized_log);
    assert(hash == 0x0095b2d17ab72f4b27a341f7ac63e49ec73935ae8c9181a0ac02023eb12f3284);
}

#[test]
unconstrained fn compute_unenc_log_hash_addr() {
    let contract_address = AztecAddress::from_field(
        0x233a3e0df23b2b15b324194cb4a151f26c0b7333250781d34cc269d85dc334c6,
    );
    let log = AztecAddress::from_field(
        0x26aa302d4715fd8a687453cb26d616b0768027bd54bcae56b09d908ecd9f8303,
    );
    let serialized_log: [u8; 32] = log.to_field().to_be_bytes();
    let hash = compute_unencrypted_log_hash(contract_address, serialized_log);
    assert(hash == 0x0083ab647dfb26e7ddee90a0f4209d049d4660cab42000c544b986aaa84c55a3);
}

#[test]
unconstrained fn compute_unenc_log_hash_str() {
    let contract_address = AztecAddress::from_field(
        0x1b401e1146c5c507962287065c81f0ef7590adae3802c533d7549d6bf0a41bd8,
    );
    let log = "dummy";
    let serialized_log = str_to_be_bytes_arr(log);
    let hash = compute_unencrypted_log_hash(contract_address, serialized_log);
    assert(hash == 0x00629e88ebd6374f44aa6cfe07e251ecf07213ebc7267e8f6b578ae57ffd6c20);
}

#[test]
unconstrained fn compute_unenc_log_hash_longer_str() {
    let contract_address = AztecAddress::from_field(
        0x1b401e1146c5c507962287065c81f0ef7590adae3802c533d7549d6bf0a41bd8,
    );
    let log = "Hello this is a string";
    let serialized_log = str_to_be_bytes_arr(log);
    let hash = compute_unencrypted_log_hash(contract_address, serialized_log);
    assert(hash == 0x0098637962f7d34fa202b7ffad8a07a238c5d1fd897b82a108f7f467fa73b841);
}

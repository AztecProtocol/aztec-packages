use dep::protocol_types::{
    address::{AztecAddress, EthAddress},
    constants::{
        GENERATOR_INDEX__FUNCTION_ARGS, GENERATOR_INDEX__MESSAGE_NULLIFIER,
        GENERATOR_INDEX__PUBLIC_BYTECODE, GENERATOR_INDEX__PUBLIC_CALLDATA,
        GENERATOR_INDEX__SECRET_HASH, MAX_PACKED_PUBLIC_BYTECODE_SIZE_IN_FIELDS,
    },
    hash::{
        poseidon2_hash_subarray, poseidon2_hash_with_separator, poseidon2_hash_with_separator_slice,
        sha256_to_field,
    },
    point::Point,
    traits::{Hash, ToField},
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

// Computes the hash of input arguments or return values for private functions, or for authwit creation.
pub fn hash_args_array<let N: u32>(args: [Field; N]) -> Field {
    if args.len() == 0 {
        0
    } else {
        poseidon2_hash_with_separator(args, GENERATOR_INDEX__FUNCTION_ARGS)
    }
}

// Same as `hash_args_array`, but takes a slice instead of an array.
pub fn hash_args(args: [Field]) -> Field {
    if args.len() == 0 {
        0
    } else {
        poseidon2_hash_with_separator_slice(args, GENERATOR_INDEX__FUNCTION_ARGS)
    }
}

// Computes the hash of calldata for public functions.
pub fn hash_calldata_array<let N: u32>(calldata: [Field; N]) -> Field {
    if calldata.len() == 0 {
        0
    } else {
        poseidon2_hash_with_separator(calldata, GENERATOR_INDEX__PUBLIC_CALLDATA)
    }
}

// Same as `hash_calldata_array`, but takes a slice instead of an array.
pub fn hash_calldata(calldata: [Field]) -> Field {
    if calldata.len() == 0 {
        0
    } else {
        poseidon2_hash_with_separator_slice(calldata, GENERATOR_INDEX__PUBLIC_CALLDATA)
    }
}

/**
 * Computes the public bytecode commitment for a contract class.
 * The commitment is `hash([separator, ...bytecode])` where bytecode omits the length prefix present
 * in `packed_bytecode`.
 *
 * @param packed_bytecode - The packed bytecode of the contract class. 0th word is the length in bytes.
 *    packed_bytecode is mutable so that we can avoid copying the array to construct one starting with
 *    separator instead of length.
 * @returns The public bytecode commitment.
 */
pub fn compute_public_bytecode_commitment(
    mut packed_public_bytecode: [Field; MAX_PACKED_PUBLIC_BYTECODE_SIZE_IN_FIELDS],
) -> Field {
    // First field element contains the length of the bytecode
    let bytecode_length_in_bytes: u32 = packed_public_bytecode[0] as u32;
    let bytecode_length_in_fields: u32 =
        (bytecode_length_in_bytes / 31) + (bytecode_length_in_bytes % 31 != 0) as u32;
    // Don't allow empty public bytecode.
    // AVM doesn't handle execution of contracts that exist with empty bytecode.
    assert(bytecode_length_in_fields != 0);
    assert(bytecode_length_in_fields < MAX_PACKED_PUBLIC_BYTECODE_SIZE_IN_FIELDS);

    // Packed_bytecode's 0th entry is the length. Replace it with separator before hashing.
    let separator = GENERATOR_INDEX__PUBLIC_BYTECODE.to_field();
    packed_public_bytecode[0] = separator;
    // +1 to length to account for the separator
    let nonzero_length = bytecode_length_in_fields + 1;

    poseidon2_hash_subarray(packed_public_bytecode, nonzero_length)
    // NOTE: we use poseidon2_hash_subarray here because we want to hash the bytecode only up to
    // its nonzero length. We do NOT want to include a `1` at the end to indicate "variable length",
    // and we want to enforce that all trailing elements are zero.
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

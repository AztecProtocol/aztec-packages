use aztec::protocol::{
    address::{AztecAddress, EthAddress},
    hash::sha256_to_field,
    traits::ToField,
};

// Oxide deposit/withdraw uses a constant zero-secret since there is no per-deposit secret
// to exchange. `compute_secret_hash(CONSTANT_SECRET)` must equal the Portal.sol
// `CONSTANT_SECRET_HASH` constant (0x1f8eff65d91ed781c2e7a28a2ff99b7f7506b7293121b5ffcf3cd339c84d2250).
// The Portal.sol value is the poseidon2 output of this secret under `DOM_SEP__SECRET_HASH`;
// do not rederive it here.
pub global CONSTANT_SECRET: Field = 0;

// Oxide-specific domain separator for the stealth recipient hash. Bytes spell
// "OXIDE_BRIDGE_V1\0" so future reviewers can eyeball the layout. Do not reuse
// this value for any other hash in the project - that's what domain separators
// are for.
pub global DOMAIN_MAGIC: [u8; 16] = [
    0x4f, 0x58, 0x49, 0x44, 0x45, 0x5f, 0x42, 0x52,
    0x49, 0x44, 0x47, 0x45, 0x5f, 0x56, 0x31, 0x00,
];

// L1 -> L2 claim message content hash. Must match `Portal.sol::deposit`, which calls
// `sha256ToField(abi.encodeWithSignature("claim(bytes32,uint256)", recipientHash, amount))`
// byte-for-byte: 4-byte selector || 32-byte recipient hash || 32-byte amount = 68 bytes.
pub fn get_claim_content_hash(recipient_hash: Field, amount: u128) -> Field {
    let mut hash_bytes = [0 as u8; 68];
    let recipient_bytes: [u8; 32] = recipient_hash.to_be_bytes();
    let amount_bytes: [u8; 32] = (amount as Field).to_be_bytes();

    let selector = comptime { keccak256::keccak256("claim(bytes32,uint256)".as_bytes(), 22) };

    for i in 0..4 {
        hash_bytes[i] = selector[i];
    }
    for i in 0..32 {
        hash_bytes[i + 4] = recipient_bytes[i];
        hash_bytes[i + 36] = amount_bytes[i];
    }

    sha256_to_field(hash_bytes)
}

// L2 -> L1 withdraw message content hash. Must match the Solidity decode on the
// portal side: `sha256ToField(abi.encodeWithSignature("withdraw(address,uint256)", recipient, amount))`
// byte-for-byte. Layout: 4-byte selector || 32-byte left-padded address || 32-byte amount = 68 bytes.
// EthAddress is 20 bytes but `to_field().to_be_bytes::<32>()` left-pads with zeros, which is exactly
// how Solidity ABI-encodes `address` into a 32-byte slot.
pub fn get_withdraw_content_hash(l1_recipient: EthAddress, amount: u128) -> Field {
    let mut hash_bytes = [0 as u8; 68];
    let recipient_bytes: [u8; 32] = l1_recipient.to_field().to_be_bytes();
    let amount_bytes: [u8; 32] = (amount as Field).to_be_bytes();

    let selector = comptime { keccak256::keccak256("withdraw(address,uint256)".as_bytes(), 25) };

    for i in 0..4 {
        hash_bytes[i] = selector[i];
    }
    for i in 0..32 {
        hash_bytes[i + 4] = recipient_bytes[i];
        hash_bytes[i + 36] = amount_bytes[i];
    }

    sha256_to_field(hash_bytes)
}

// Binds a shared secret to a specific recipient. The resulting tag is a public
// commitment - it is safe for the depositor to compute on L1 and for tests or a
// TS mirror to compute out-of-circuit.
pub fn compute_stealth_tag(shared_secret: Field, recipient: AztecAddress) -> Field {
    let mut bytes = [0 as u8; 64];
    let secret_bytes: [u8; 32] = shared_secret.to_be_bytes();
    let recipient_bytes: [u8; 32] = recipient.to_field().to_be_bytes();
    for i in 0..32 {
        bytes[i] = secret_bytes[i];
        bytes[i + 32] = recipient_bytes[i];
    }
    sha256_to_field(bytes)
}

// The `recipientHash` the depositor passes to Portal.sol must be derived from
// this exact formula. The TS helper must be a byte-for-byte mirror of this,
// pinned by a shared test vector.
// Layout: DOMAIN_MAGIC(16) || chain_id(32) || portal(32) || stealth_tag(32) = 112 bytes.
pub fn compute_stealth_recipient_hash(
    shared_secret: Field,
    recipient: AztecAddress,
    portal: EthAddress,
    l1_chain_id: Field,
) -> Field {
    let stealth_tag = compute_stealth_tag(shared_secret, recipient);

    let mut bytes = [0 as u8; 112];
    let chain_bytes: [u8; 32] = l1_chain_id.to_be_bytes();
    let portal_bytes: [u8; 32] = portal.to_field().to_be_bytes();
    let tag_bytes: [u8; 32] = stealth_tag.to_be_bytes();
    for i in 0..16 {
        bytes[i] = DOMAIN_MAGIC[i];
    }
    for i in 0..32 {
        bytes[i + 16] = chain_bytes[i];
        bytes[i + 48] = portal_bytes[i];
        bytes[i + 80] = tag_bytes[i];
    }
    sha256_to_field(bytes)
}

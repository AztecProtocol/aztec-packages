use dep::aztec::macros::aztec;

#[aztec]
contract AvmGadgetsTest {
    use dep::aztec::macros::functions::public;

    #[public]
    fn keccak_hash(data: [u8; 10]) -> [u8; 32] {
        keccak256::keccak256(data, data.len())
    }

    #[public]
    fn keccak_f1600(data: [u64; 25]) -> [u64; 25] {
        std::hash::keccakf1600(data)
    }

    #[public]
    fn poseidon2_hash(data: [Field; 10]) -> Field {
        poseidon::poseidon2::Poseidon2::hash(data, data.len())
    }

    #[public]
    fn sha256_hash_10(data: [u8; 10]) -> [u8; 32] {
        sha256::sha256_var(data, data.len() as u64)
    }
    #[public]
    fn sha256_hash_20(data: [u8; 20]) -> [u8; 32] {
        sha256::sha256_var(data, data.len() as u64)
    }
    #[public]
    fn sha256_hash_30(data: [u8; 30]) -> [u8; 32] {
        sha256::sha256_var(data, data.len() as u64)
    }
    #[public]
    fn sha256_hash_40(data: [u8; 40]) -> [u8; 32] {
        sha256::sha256_var(data, data.len() as u64)
    }
    #[public]
    fn sha256_hash_50(data: [u8; 50]) -> [u8; 32] {
        sha256::sha256_var(data, data.len() as u64)
    }
    #[public]
    fn sha256_hash_60(data: [u8; 60]) -> [u8; 32] {
        sha256::sha256_var(data, data.len() as u64)
    }
    #[public]
    fn sha256_hash_70(data: [u8; 70]) -> [u8; 32] {
        sha256::sha256_var(data, data.len() as u64)
    }
    #[public]
    fn sha256_hash_80(data: [u8; 80]) -> [u8; 32] {
        sha256::sha256_var(data, data.len() as u64)
    }
    #[public]
    fn sha256_hash_90(data: [u8; 90]) -> [u8; 32] {
        sha256::sha256_var(data, data.len() as u64)
    }
    #[public]
    fn sha256_hash_100(data: [u8; 100]) -> [u8; 32] {
        sha256::sha256_var(data, data.len() as u64)
    }
    #[public]
    fn sha256_hash_255(data: [u8; 255]) -> [u8; 32] {
        sha256::sha256_var(data, data.len() as u64)
    }
    #[public]
    fn sha256_hash_256(data: [u8; 256]) -> [u8; 32] {
        sha256::sha256_var(data, data.len() as u64)
    }
    #[public]
    fn sha256_hash_511(data: [u8; 511]) -> [u8; 32] {
        sha256::sha256_var(data, data.len() as u64)
    }
    #[public]
    fn sha256_hash_512(data: [u8; 512]) -> [u8; 32] {
        sha256::sha256_var(data, data.len() as u64)
    }

    #[public]
    fn sha256_hash_2048(data: [u8; 2048]) -> [u8; 32] {
        sha256::sha256_var(data, data.len() as u64)
    }

    #[public]
    fn pedersen_hash(data: [Field; 10]) -> Field {
        std::hash::pedersen_hash(data)
    }

    #[public]
    fn pedersen_hash_with_index(data: [Field; 10]) -> Field {
        std::hash::pedersen_hash_with_separator(data, /*index=*/ 20)
    }
}

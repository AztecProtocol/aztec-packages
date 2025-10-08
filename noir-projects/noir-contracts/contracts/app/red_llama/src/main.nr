use aztec::macros::aztec;

#[aztec]
pub contract RedLlama {
    use aztec::macros::functions::public;

    #[public]
    fn poseidon_bomb(n: u32) -> [Field; 4] {
        let mut result = [0, 1, 2, 3];
        for _ in 0..n {
            result = std::hash::poseidon2_permutation(result, 4);
        }
        result
    }
}

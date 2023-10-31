#[oracle(popMint)]
fn pop_mint_oracle<N>() -> [Field; N] {}

unconstrained pub fn pop_mint<N>() -> [Field; N] {
    pop_mint_oracle()
}
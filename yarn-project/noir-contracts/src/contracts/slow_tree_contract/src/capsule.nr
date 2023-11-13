#[oracle(popCapsule)]
fn pop_capsule_oracle<N>() -> [Field; N] {}

unconstrained pub fn pop_capsule<N>() -> [Field; N] {
    pop_capsule_oracle()
}
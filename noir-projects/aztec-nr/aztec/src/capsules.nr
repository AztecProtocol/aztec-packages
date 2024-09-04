#[oracle(requestCapsule)]
unconstrained fn request_capsule_oracle<let N: u32, let M: u32>(
    topic: Field,
    input: [Field; N],
) -> [Field; M] {}

unconstrained fn request_capsule_oracle_internal<let N: u32, let M: u32>(
    topic: Field,
    input: [Field; N],
) -> [Field; M] {
    request_capsule_oracle(topic, input)
}

pub fn request_capsule<let N: u32, let M: u32>(
    topic: Field,
    input: [Field; N]
) -> [Field; M] {
    unsafe {
        request_capsule_oracle_internal(topic, input)
    }
}

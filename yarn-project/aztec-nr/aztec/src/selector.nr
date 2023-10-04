global SELECTOR_SIZE = 4;

fn compute_selector<N>(signature: str<N>) -> Field {
    let bytes = signature.as_bytes();
    let hash = dep::std::hash::keccak256(bytes, bytes.len() as u32);
    let mut selector_be_bytes = [0; SELECTOR_SIZE];
    for i in 0..SELECTOR_SIZE {
        selector_be_bytes[i] = hash[i];
    }

    let mut selector_as_field = 0;
    let mut offset = 1;
    for i in 0..SELECTOR_SIZE {
        let index = SELECTOR_SIZE - i - 1;
        selector_as_field += (selector_be_bytes[index] as Field) * offset;
        offset *= 256;
    }

    selector_as_field
}
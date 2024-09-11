use std::hash::poseidon2;

global len = 2450 * 2 - 240;
fn main(x: Field) {
    let ped_input = [x; len];
    let mut val = poseidon2::Poseidon2::hash(ped_input, len);
    let z = foo(x);
    assert(val == z);
}

#[fold]
fn foo(x: Field) -> Field {
    let ped_input = [x; len];
    let mut val = poseidon2::Poseidon2::hash(ped_input, len);
    val
}

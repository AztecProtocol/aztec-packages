use std::hash::poseidon2;

fn main(x: Field) {
    let z = foo(x);
    let z2 = foo(x);
    assert(z == z2);
}

global len = 2450 * 2;

#[fold]
fn foo(x: Field) -> Field {
    let ped_input = [x; len];
    let mut val = poseidon2::Poseidon2::hash(ped_input, len);
    val
}

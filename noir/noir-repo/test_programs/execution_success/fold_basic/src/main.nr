fn main(x: Field, y: pub Field) {
    let z = basic_func(x, y);
    let z2 = basic_func(x, y);
    assert(z == z2);
}

// #[fold]
// fn basic_func(x: Field, y: Field) {
//     assert(x != y);
// }

#[fold]
fn basic_func(x: Field, y: Field) -> Field {
    assert(x != y);
    x + y
}

fn main(x: Field, y: pub Field) {
    basic_func(x, y);
    basic_func(x, y);
}

#[fold]
fn basic_func(x: Field, y: Field) {
    assert(x != y);
}

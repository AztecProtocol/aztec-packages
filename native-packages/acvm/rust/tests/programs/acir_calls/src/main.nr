#[fold]
fn square_plus(x: Field, y: Field) -> Field {
    x * x + y
}

fn main(x: Field, y: Field) -> pub Field {
    let a = square_plus(x, y);
    let b = square_plus(a, x);
    a + b
}

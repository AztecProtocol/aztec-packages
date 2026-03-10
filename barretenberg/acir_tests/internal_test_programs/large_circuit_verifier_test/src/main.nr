fn main(input: pub Field) {
    let mut a = input;
    let mut b = input + 1;

    for _ in 0..2100000 {
        let c = a * b + a;
        let d = b * c + b;
        a = c;
        b = d;
    }

    assert(a != 0);
    assert(b != 0);
}

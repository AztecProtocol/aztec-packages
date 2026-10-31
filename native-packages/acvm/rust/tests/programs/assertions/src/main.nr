struct NotEqual {
    left: Field,
    right: Field,
}

fn main(x: Field, y: Field, kind: u8) {
    if kind == 0 {
        assert(x == y, "x must equal y");
    } else {
        assert(x == y, NotEqual { left: x, right: y });
    }
}

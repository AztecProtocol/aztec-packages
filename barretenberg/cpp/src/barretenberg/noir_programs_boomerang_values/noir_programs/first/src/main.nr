fn main(a: Field, v: u1) -> pub u128 {
        let b = a * a;
        let _ = b / a;
        v as u128
}

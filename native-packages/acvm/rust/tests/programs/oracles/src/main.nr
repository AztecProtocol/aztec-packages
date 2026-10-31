#[oracle(double)]
unconstrained fn double_oracle(x: Field) -> Field {}

#[oracle(sum_and_reverse)]
unconstrained fn sum_and_reverse_oracle(xs: [Field; 3]) -> (Field, [Field; 3]) {}

unconstrained fn double(x: Field) -> Field {
    double_oracle(x)
}

unconstrained fn sum_and_reverse(xs: [Field; 3]) -> (Field, [Field; 3]) {
    sum_and_reverse_oracle(xs)
}

fn main(x: Field, xs: [Field; 3]) -> pub Field {
    // Safety: constrained below.
    let doubled = unsafe { double(x) };
    assert(doubled == x + x);
    // Safety: constrained below.
    let (sum, reversed) = unsafe { sum_and_reverse(xs) };
    assert(sum == xs[0] + xs[1] + xs[2]);
    for i in 0..3 {
        assert(reversed[i] == xs[2 - i]);
    }
    doubled + sum
}

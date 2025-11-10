fn main(n: pub u32) -> pub Field {
    let mut fib: [Field; 100] = [0; 100];

    if n >= 1 {
        fib[0] = 0;
    }
    if n >= 2 {
        fib[1] = 1;
    }

    for i in 2..10 {
        if i <= n {
            fib[i] = fib[i-1] + fib[i-2];
        }
    }

    if (n < 100) {
        fib[n - 1]
    } else {
        0
    }
}

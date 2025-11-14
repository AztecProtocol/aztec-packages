global N: u32 = 4;

fn main(m: [[Field; N]; N], x: [Field; N]) -> pub [Field; N] {
    let mut result = [0; N];
    for i in 0..N {
        let mut sum = 0;
        for j in 0..N {
            sum += m[i][j] * x[j];
        }
        result[i] = sum;
    }
    result
}

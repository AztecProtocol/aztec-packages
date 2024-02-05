use dep::std::bigint;
use dep::std;

// Test integer addition: 3 + 4 = 7
fn main(mut x: u32, y: u32, z: u32) {
    // x += y;
    // assert(x == z);

    // x *= 8;
    // assert(x > 9);
std::println("HELLO");
    let a = std::bigint::BigInt::secpk1_fq_from_le_bytes([3]);
    let b = bigint::BigInt::secpk1_fq_from_le_bytes([5]);
    std::println(a);
    let c= a+b;
    let bytes = (c*a-b-b).to_le_bytes();
    std::println(bytes[0]);

//     //sha
//     let a = [0; 16];
//     let b= [0;8];
// let c = std::hash::sha256_compression(a, b);
//      std::println(c);

// let mut c=a + b;
// c= c.neg(b);
// c= c.mul(b);
// c=c.div(b);
// std::println(c);
}

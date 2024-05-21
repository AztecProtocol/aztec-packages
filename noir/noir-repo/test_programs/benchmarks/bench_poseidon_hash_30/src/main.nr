use dep::std::hash;

fn main(input: [[Field; 2]; 30]) -> pub [Field; 30] {
    let mut results: [Field; 30] = [0; 30];
    for i in 0..30 {
        results[i] = hash::pedersen_hash(input[i]);
    }

    results
}
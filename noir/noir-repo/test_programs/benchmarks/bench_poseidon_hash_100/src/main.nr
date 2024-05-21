use dep::std::hash;

fn main(input: [[Field; 2]; 100]) -> pub [Field; 100] {
    let mut results: [Field; 100] = [0; 100];
    for i in 0..100 {
        results[i] = hash::pedersen_hash(input[i]);
    }

    results
}
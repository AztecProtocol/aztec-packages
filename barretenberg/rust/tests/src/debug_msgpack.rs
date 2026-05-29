//! Debug msgpack serialization format

#[cfg(test)]
use barretenberg_rs::{generated_types::*, Fr};

#[test]
fn test_msgpack_format() {
    let cmd = Command::Blake2s(Blake2s::new(b"test".to_vec()));
    let bytes = rmp_serde::to_vec_named(&vec![cmd]).unwrap();

    println!("\n=== Msgpack Format Debug (Blake2s with to_vec_named) ===");
    println!("Msgpack bytes: {:?}", bytes);
    println!("Msgpack hex: {}", hex::encode(&bytes));
    println!("Msgpack length: {}", bytes.len());

    // Show first 30 bytes in detail
    println!("\nFirst 30 bytes:");
    for (i, b) in bytes.iter().take(30).enumerate() {
        println!(
            "  [{}] = 0x{:02x} ({})",
            i,
            b,
            if *b >= 32 && *b < 127 {
                *b as char
            } else {
                '.'
            }
        );
    }
}

#[test]
fn test_pedersen_msgpack_format() {
    let inputs: Vec<Fr> = vec![Fr::from_u64(4), Fr::from_u64(8)];

    let cmd = Command::PedersenHash(PedersenHash::new(inputs, 7));
    let bytes = rmp_serde::to_vec_named(&vec![cmd]).unwrap();

    println!("\n=== Msgpack Format Debug (PedersenHash) ===");
    println!(
        "Msgpack bytes (length {}): {:?}",
        bytes.len(),
        &bytes[..bytes.len().min(50)]
    );
    println!("Msgpack hex: {}", hex::encode(&bytes));

    // Show structure
    println!("\nFirst 50 bytes:");
    for (i, b) in bytes.iter().take(50).enumerate() {
        print!("{:02x} ", b);
        if (i + 1) % 16 == 0 {
            println!();
        }
    }
    println!();
}

//! Debug msgpack serialization format

#[cfg(test)]
use barretenberg_rs::generated_types::*;

#[test]
fn test_msgpack_format() {
    let cmd = Command::Blake2s(Blake2s::new(b"test".to_vec()));
    let bytes = rmp_serde::to_vec(&vec![cmd]).unwrap();

    println!("\n=== Msgpack Format Debug ===");
    println!("Msgpack bytes: {:?}", bytes);
    println!("Msgpack hex: {}", hex::encode(&bytes));
    println!("Msgpack length: {}", bytes.len());

    // Show first 20 bytes in detail
    println!("\nFirst 20 bytes:");
    for (i, b) in bytes.iter().take(20).enumerate() {
        println!("  [{}] = 0x{:02x} ({})", i, b, if *b >= 32 && *b < 127 { *b as char } else { '.' });
    }
}

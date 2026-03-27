//! Generate golden msgpack files for wire compatibility testing.
//! Usage: generate_golden --output-dir golden/
//!
//! Outputs one .msgpack file per test command (request format: [[name, {fields}]])
//! and one per response.

use echo_wire_compat::types_gen::*;
use std::fs;
use std::path::Path;

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let output_dir = args.iter()
        .position(|a| a == "--output-dir")
        .and_then(|i| args.get(i + 1))
        .expect("Usage: generate_golden --output-dir <path>");

    fs::create_dir_all(output_dir).unwrap();

    // Request format: [command] — serialized as Vec<Command> (1-element array)
    write_golden(output_dir, "echo_bytes_request.msgpack", &vec![
        Command::EchoBytes(EchoBytes::new(vec![0xDE, 0xAD, 0xBE, 0xEF, 0x42]))
    ]);

    write_golden(output_dir, "echo_fields_request.msgpack", &vec![
        Command::EchoFields(EchoFields::new(42, 999999, "hello wire compat".to_string()))
    ]);

    write_golden(output_dir, "echo_nested_request.msgpack", &vec![
        Command::EchoNested(EchoNested::new(EchoInner {
            values: vec![vec![1, 2, 3], vec![4, 5]],
            flag: Some(true),
        }))
    ]);

    // Response format: NamedUnion (no tuple wrapper)
    write_golden(output_dir, "echo_bytes_response.msgpack",
        &Response::EchoBytesResponse(EchoBytesResponse {
            data: vec![0xDE, 0xAD, 0xBE, 0xEF, 0x42],
        }));

    write_golden(output_dir, "echo_fields_response.msgpack",
        &Response::EchoFieldsResponse(EchoFieldsResponse {
            a: 42,
            b: 999999,
            name: "hello wire compat".to_string(),
        }));

    write_golden(output_dir, "echo_nested_response.msgpack",
        &Response::EchoNestedResponse(EchoNestedResponse {
            inner: EchoInner {
                values: vec![vec![1, 2, 3], vec![4, 5]],
                flag: Some(true),
            },
        }));

    eprintln!("Generated 6 golden files in {}", output_dir);
}

fn write_golden<T: serde::Serialize>(dir: &str, name: &str, value: &T) {
    let bytes = rmp_serde::to_vec_named(value).unwrap();
    let path = Path::new(dir).join(name);
    fs::write(&path, &bytes).unwrap();
    eprintln!("  {} ({} bytes)", name, bytes.len());
}

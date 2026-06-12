//! Generate golden msgpack files for wire compatibility testing.
//! Usage: generate_golden --output-dir golden/
//!
//! The goldens are a binding wire-format contract: any new implementation
//! of the echo service (in any language) must decode these bytes into the
//! expected values, and re-encode the same inputs back to byte-identical
//! output. They cover the msgpack encoding boundaries that codegen tweaks
//! are most likely to silently break:
//!
//!   - Variable-width integer encodings (fixint / uint8 / uint16 / uint32 / uint64)
//!   - String encodings (fixstr / str8 / str16) plus multi-byte UTF-8
//!   - Bin encodings (bin8 / bin16)
//!   - Optional<T> = Some vs None
//!   - Empty containers

use echo_wire_compat::types_gen::*;
use std::fs;
use std::path::Path;

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let output_dir = args
        .iter()
        .position(|a| a == "--output-dir")
        .and_then(|i| args.get(i + 1))
        .expect("Usage: generate_golden --output-dir <path>");

    fs::create_dir_all(output_dir).unwrap();

    // ----------------------------------------------------------------------
    // Original happy-path cases.
    // ----------------------------------------------------------------------
    write_request(
        output_dir,
        "echo_bytes_request.msgpack",
        Command::EchoBytes(EchoBytes::new(vec![0xDE, 0xAD, 0xBE, 0xEF, 0x42])),
    );

    write_request(
        output_dir,
        "echo_fields_request.msgpack",
        Command::EchoFields(EchoFields::new(42, 999999, "hello wire compat".to_string())),
    );

    write_request(
        output_dir,
        "echo_nested_request.msgpack",
        Command::EchoNested(EchoNested::new(EchoInner {
            values: vec![vec![1, 2, 3], vec![4, 5]],
            flag: Some(true),
        })),
    );

    let hash = test_hash(0x10);
    let second = test_hash(0x40);
    write_request(
        output_dir,
        "echo_aliases_request.msgpack",
        Command::EchoAliases(EchoAliases::new(
            7,
            hash.clone(),
            Some(second.clone()),
            vec![hash.clone(), second.clone()],
        )),
    );

    write_response(
        output_dir,
        "echo_bytes_response.msgpack",
        Response::EchoBytesResponse(EchoBytesResponse {
            data: vec![0xDE, 0xAD, 0xBE, 0xEF, 0x42],
        }),
    );

    write_response(
        output_dir,
        "echo_fields_response.msgpack",
        Response::EchoFieldsResponse(EchoFieldsResponse {
            a: 42,
            b: 999999,
            name: "hello wire compat".to_string(),
        }),
    );

    write_response(
        output_dir,
        "echo_nested_response.msgpack",
        Response::EchoNestedResponse(EchoNestedResponse {
            inner: EchoInner {
                values: vec![vec![1, 2, 3], vec![4, 5]],
                flag: Some(true),
            },
        }),
    );

    write_response(
        output_dir,
        "echo_aliases_response.msgpack",
        Response::EchoAliasesResponse(EchoAliasesResponse {
            tree_id: 7,
            hash: hash.clone(),
            maybe_hash: Some(second.clone()),
            hashes: vec![hash, second],
        }),
    );

    // ----------------------------------------------------------------------
    // Boundary cases — these are what catch silent format regressions.
    // ----------------------------------------------------------------------

    // Empty Vec<u8>. bin8-with-len-0 vs bin16-with-len-0 vs absent — picks one.
    write_request(
        output_dir,
        "echo_bytes_empty.msgpack",
        Command::EchoBytes(EchoBytes::new(vec![])),
    );

    // 256-byte Vec<u8>. Crosses the bin8 → bin16 boundary (bin8 max is 255).
    write_request(
        output_dir,
        "echo_bytes_bin16.msgpack",
        Command::EchoBytes(EchoBytes::new(vec![0xAA; 256])),
    );

    // u32::MAX (= 2^32 - 1) and u64::MAX. Largest uint encodings; empty string
    // exercises fixstr-len-0 framing.
    write_request(
        output_dir,
        "echo_fields_max.msgpack",
        Command::EchoFields(EchoFields::new(u32::MAX, u64::MAX, String::new())),
    );

    // u32 = 128 (smallest uint8) and u64 above u32::MAX (forces uint64 encoding).
    write_request(
        output_dir,
        "echo_fields_uint_boundary.msgpack",
        Command::EchoFields(EchoFields::new(128, (u32::MAX as u64) + 1, "x".to_string())),
    );

    // Multi-byte UTF-8 in name. Catches encoders that mistakenly count bytes
    // by char-count, or that switch str/bin tags depending on content.
    write_request(
        output_dir,
        "echo_fields_unicode.msgpack",
        Command::EchoFields(EchoFields::new(0, 0, "héllo τέστ 🚀 mañana".to_string())),
    );

    // 300-char ASCII string. Crosses fixstr (≤31) → str8 (≤255) → str16 boundary.
    write_request(
        output_dir,
        "echo_fields_str16.msgpack",
        Command::EchoFields(EchoFields::new(0, 0, "a".repeat(300))),
    );

    // Optional<bool> = None plus empty outer Vec<Vec<u8>>.
    write_request(
        output_dir,
        "echo_nested_flag_none.msgpack",
        Command::EchoNested(EchoNested::new(EchoInner {
            values: vec![],
            flag: None,
        })),
    );

    // Optional<bool> = Some(false) plus a Vec<Vec<u8>> containing an empty inner.
    write_request(
        output_dir,
        "echo_nested_flag_false.msgpack",
        Command::EchoNested(EchoNested::new(EchoInner {
            values: vec![vec![]],
            flag: Some(false),
        })),
    );

    // ----------------------------------------------------------------------
    // Blob / fail / error cases — optional bytes, fixed-size byte arrays,
    // the empty response struct, and the error variant's wire format.
    // ----------------------------------------------------------------------

    // Optional<Vec<u8>> = Some plus [Vec<u8>; 2] fixed array of bins.
    write_request(
        output_dir,
        "echo_blobs_request.msgpack",
        Command::EchoBlobs(EchoBlobs::new(
            Some(vec![0xAA, 0xBB]),
            [vec![1, 2, 3], vec![4]],
        )),
    );

    // Optional<Vec<u8>> = None plus an empty first array element.
    write_request(
        output_dir,
        "echo_blobs_none.msgpack",
        Command::EchoBlobs(EchoBlobs::new(None, [vec![], vec![9]])),
    );

    write_response(
        output_dir,
        "echo_blobs_response.msgpack",
        Response::EchoBlobsResponse(EchoBlobsResponse {
            maybe_data: Some(vec![0xAA, 0xBB]),
            parts: [vec![1, 2, 3], vec![4]],
        }),
    );

    write_request(
        output_dir,
        "echo_fail_request.msgpack",
        Command::EchoFail(EchoFail::new("deliberate failure".to_string())),
    );

    // Empty struct — pins how a fieldless payload map is framed.
    write_response(
        output_dir,
        "echo_fail_response.msgpack",
        Response::EchoFailResponse(EchoFailResponse {}),
    );

    // Pins the error variant's wire format.
    write_response(
        output_dir,
        "echo_error_response.msgpack",
        Response::EchoErrorResponse(EchoErrorResponse {
            message: "deliberate failure".to_string(),
        }),
    );

    eprintln!("Generated golden files in {}", output_dir);
}

fn write_request(dir: &str, name: &str, command: Command) {
    let value = vec![command];
    let bytes = rmp_serde::to_vec_named(&value).unwrap();
    let path = Path::new(dir).join(name);
    fs::write(&path, &bytes).unwrap();
    eprintln!("  {} ({} bytes)", name, bytes.len());
}

fn write_response(dir: &str, name: &str, response: Response) {
    let bytes = rmp_serde::to_vec_named(&response).unwrap();
    let path = Path::new(dir).join(name);
    fs::write(&path, &bytes).unwrap();
    eprintln!("  {} ({} bytes)", name, bytes.len());
}

fn test_hash(base: u8) -> Fr {
    Fr::from_bytes(std::array::from_fn(|i| base + i as u8))
}

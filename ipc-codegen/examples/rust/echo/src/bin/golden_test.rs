//! Golden file deserialization test (Rust).
//! Verifies Rust can deserialize the golden msgpack files.
//! Usage: golden_test --golden-dir golden/

use echo_wire_compat::types_gen::*;
use std::fs;

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let golden_dir = args.iter()
        .position(|a| a == "--golden-dir")
        .and_then(|i| args.get(i + 1))
        .expect("Usage: golden_test --golden-dir <path>");

    let mut pass = 0;
    let mut fail = 0;

    // Request golden files
    match check_request::<EchoBytes>(golden_dir, "echo_bytes_request.msgpack") {
        Ok(cmd) => {
            assert_eq!(cmd.data, vec![0xDE, 0xAD, 0xBE, 0xEF, 0x42]);
            eprintln!("  PASS: echo_bytes_request.msgpack");
            pass += 1;
        }
        Err(e) => { eprintln!("  FAIL: echo_bytes_request.msgpack: {e}"); fail += 1; }
    }

    match check_request::<EchoFields>(golden_dir, "echo_fields_request.msgpack") {
        Ok(cmd) => {
            assert_eq!(cmd.a, 42);
            assert_eq!(cmd.b, 999999);
            assert_eq!(cmd.name, "hello wire compat");
            eprintln!("  PASS: echo_fields_request.msgpack");
            pass += 1;
        }
        Err(e) => { eprintln!("  FAIL: echo_fields_request.msgpack: {e}"); fail += 1; }
    }

    match check_request::<EchoNested>(golden_dir, "echo_nested_request.msgpack") {
        Ok(cmd) => {
            assert_eq!(cmd.inner.values, vec![vec![1u8, 2, 3], vec![4, 5]]);
            assert_eq!(cmd.inner.flag, Some(true));
            eprintln!("  PASS: echo_nested_request.msgpack");
            pass += 1;
        }
        Err(e) => { eprintln!("  FAIL: echo_nested_request.msgpack: {e}"); fail += 1; }
    }

    // Response golden files
    match check_response(golden_dir, "echo_bytes_response.msgpack") {
        Ok(Response::EchoBytesResponse(r)) => {
            assert_eq!(r.data, vec![0xDE, 0xAD, 0xBE, 0xEF, 0x42]);
            eprintln!("  PASS: echo_bytes_response.msgpack");
            pass += 1;
        }
        Ok(_) => { eprintln!("  FAIL: echo_bytes_response.msgpack: wrong variant"); fail += 1; }
        Err(e) => { eprintln!("  FAIL: echo_bytes_response.msgpack: {e}"); fail += 1; }
    }

    match check_response(golden_dir, "echo_fields_response.msgpack") {
        Ok(Response::EchoFieldsResponse(r)) => {
            assert_eq!(r.a, 42);
            assert_eq!(r.b, 999999);
            assert_eq!(r.name, "hello wire compat");
            eprintln!("  PASS: echo_fields_response.msgpack");
            pass += 1;
        }
        Ok(_) => { eprintln!("  FAIL: echo_fields_response.msgpack: wrong variant"); fail += 1; }
        Err(e) => { eprintln!("  FAIL: echo_fields_response.msgpack: {e}"); fail += 1; }
    }

    match check_response(golden_dir, "echo_nested_response.msgpack") {
        Ok(Response::EchoNestedResponse(r)) => {
            assert_eq!(r.inner.values, vec![vec![1u8, 2, 3], vec![4, 5]]);
            assert_eq!(r.inner.flag, Some(true));
            eprintln!("  PASS: echo_nested_response.msgpack");
            pass += 1;
        }
        Ok(_) => { eprintln!("  FAIL: echo_nested_response.msgpack: wrong variant"); fail += 1; }
        Err(e) => { eprintln!("  FAIL: echo_nested_response.msgpack: {e}"); fail += 1; }
    }

    eprintln!("\nResults: {pass}/{} passed, {fail} failed", pass + fail);
    if fail > 0 { std::process::exit(1); }
}

fn check_request<T: serde::de::DeserializeOwned>(dir: &str, name: &str) -> Result<T, String> {
    let path = format!("{dir}/{name}");
    let data = fs::read(&path).map_err(|e| format!("read {path}: {e}"))?;
    // Request format: [Command] — deserialized as Vec<Command>
    let commands: Vec<Command> = rmp_serde::from_slice(&data)
        .map_err(|e| format!("deserialize: {e}"))?;
    let command = commands.into_iter().next().ok_or("empty")?;
    // Extract the specific variant
    // We need to serialize the inner value back to msgpack and then deserialize as T
    let inner_bytes = match command {
        Command::EchoBytes(v) => rmp_serde::to_vec_named(&v).unwrap(),
        Command::EchoFields(v) => rmp_serde::to_vec_named(&v).unwrap(),
        Command::EchoNested(v) => rmp_serde::to_vec_named(&v).unwrap(),
        Command::EchoShutdown(v) => rmp_serde::to_vec_named(&v).unwrap(),
    };
    rmp_serde::from_slice(&inner_bytes).map_err(|e| format!("re-deserialize: {e}"))
}

fn check_response(dir: &str, name: &str) -> Result<Response, String> {
    let path = format!("{dir}/{name}");
    let data = fs::read(&path).map_err(|e| format!("read {path}: {e}"))?;
    rmp_serde::from_slice(&data).map_err(|e| format!("deserialize: {e}"))
}

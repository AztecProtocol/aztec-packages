//! Golden file wire-format conformance test (Rust).
//! For each golden file, asserts:
//!   1. We can decode the bytes into the expected typed value.
//!   2. Re-encoding the same value produces byte-identical output.
//! The combination pins down the wire format as a binding contract.

use echo_wire_compat::types_gen::*;
use std::fs;

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let dir = args
        .iter()
        .position(|a| a == "--golden-dir")
        .and_then(|i| args.get(i + 1))
        .expect("Usage: golden_test --golden-dir <path>");

    let mut pass = 0;
    let mut fail = 0;

    // Helpers close over (pass, fail) via outparams.
    let bytes_eq = |a: &[u8], b: &[u8]| -> bool { a == b };

    // ------ Request goldens (wire format: Vec<Command>) ------

    macro_rules! check_request {
        ($file:expr, $variant:ident, $expect_check:expr) => {{
            let path = format!("{dir}/{}", $file);
            match fs::read(&path) {
                Err(e) => { eprintln!("  FAIL: {}: read: {e}", $file); fail += 1; }
                Ok(bytes) => {
                    match rmp_serde::from_slice::<Vec<Command>>(&bytes) {
                        Err(e) => { eprintln!("  FAIL: {}: decode: {e}", $file); fail += 1; }
                        Ok(cmds) if cmds.len() != 1 => {
                            eprintln!("  FAIL: {}: expected 1 command, got {}", $file, cmds.len());
                            fail += 1;
                        }
                        Ok(cmds) => match cmds.into_iter().next().unwrap() {
                            Command::$variant(v) => {
                                let check_fn: fn(&_) -> Result<(), String> = $expect_check;
                                if let Err(e) = check_fn(&v) {
                                    eprintln!("  FAIL: {}: {e}", $file);
                                    fail += 1;
                                } else {
                                    // Roundtrip: re-encode and compare bytes.
                                    let re = rmp_serde::to_vec_named(&vec![Command::$variant(v)]).unwrap();
                                    if !bytes_eq(&re, &bytes) {
                                        eprintln!("  FAIL: {}: roundtrip byte mismatch ({} vs {} bytes)",
                                            $file, re.len(), bytes.len());
                                        fail += 1;
                                    } else {
                                        eprintln!("  PASS: {}", $file);
                                        pass += 1;
                                    }
                                }
                            }
                            other => {
                                eprintln!("  FAIL: {}: wrong variant ({:?})", $file, std::mem::discriminant(&other));
                                fail += 1;
                            }
                        }
                    }
                }
            }
        }};
    }

    // ------ Response goldens (wire format: Response, NamedUnion) ------

    macro_rules! check_response {
        ($file:expr, $variant:ident, $expect_check:expr) => {{
            let path = format!("{dir}/{}", $file);
            match fs::read(&path) {
                Err(e) => {
                    eprintln!("  FAIL: {}: read: {e}", $file);
                    fail += 1;
                }
                Ok(bytes) => match rmp_serde::from_slice::<Response>(&bytes) {
                    Err(e) => {
                        eprintln!("  FAIL: {}: decode: {e}", $file);
                        fail += 1;
                    }
                    Ok(Response::$variant(v)) => {
                        let check_fn: fn(&_) -> Result<(), String> = $expect_check;
                        if let Err(e) = check_fn(&v) {
                            eprintln!("  FAIL: {}: {e}", $file);
                            fail += 1;
                        } else {
                            let re = rmp_serde::to_vec_named(&Response::$variant(v)).unwrap();
                            if !bytes_eq(&re, &bytes) {
                                eprintln!("  FAIL: {}: roundtrip byte mismatch", $file);
                                fail += 1;
                            } else {
                                eprintln!("  PASS: {}", $file);
                                pass += 1;
                            }
                        }
                    }
                    Ok(_) => {
                        eprintln!("  FAIL: {}: wrong variant", $file);
                        fail += 1;
                    }
                },
            }
        }};
    }

    // ============ Original happy-path cases ============

    check_request!("echo_bytes_request.msgpack", EchoBytes, |v: &EchoBytes| {
        if v.data != vec![0xDE, 0xAD, 0xBE, 0xEF, 0x42] {
            Err("data".into())
        } else {
            Ok(())
        }
    });
    check_request!(
        "echo_fields_request.msgpack",
        EchoFields,
        |v: &EchoFields| {
            if v.a != 42 || v.b != 999999 || v.name != "hello wire compat" {
                Err("fields".into())
            } else {
                Ok(())
            }
        }
    );
    check_request!(
        "echo_nested_request.msgpack",
        EchoNested,
        |v: &EchoNested| {
            if v.inner.values != vec![vec![1u8, 2, 3], vec![4, 5]] || v.inner.flag != Some(true) {
                Err("nested".into())
            } else {
                Ok(())
            }
        }
    );
    check_request!(
        "echo_aliases_request.msgpack",
        EchoAliases,
        |v: &EchoAliases| {
            let hash = test_hash(0x10);
            let second = test_hash(0x40);
            if v.tree_id != 7
                || v.hash != hash
                || v.maybe_hash != Some(second.clone())
                || v.hashes != vec![hash, second]
            {
                Err("aliases".into())
            } else {
                Ok(())
            }
        }
    );

    check_response!(
        "echo_bytes_response.msgpack",
        EchoBytesResponse,
        |v: &EchoBytesResponse| {
            if v.data != vec![0xDE, 0xAD, 0xBE, 0xEF, 0x42] {
                Err("data".into())
            } else {
                Ok(())
            }
        }
    );
    check_response!(
        "echo_fields_response.msgpack",
        EchoFieldsResponse,
        |v: &EchoFieldsResponse| {
            if v.a != 42 || v.b != 999999 || v.name != "hello wire compat" {
                Err("fields".into())
            } else {
                Ok(())
            }
        }
    );
    check_response!(
        "echo_nested_response.msgpack",
        EchoNestedResponse,
        |v: &EchoNestedResponse| {
            if v.inner.values != vec![vec![1u8, 2, 3], vec![4, 5]] || v.inner.flag != Some(true) {
                Err("nested".into())
            } else {
                Ok(())
            }
        }
    );
    check_response!(
        "echo_aliases_response.msgpack",
        EchoAliasesResponse,
        |v: &EchoAliasesResponse| {
            let hash = test_hash(0x10);
            let second = test_hash(0x40);
            if v.tree_id != 7
                || v.hash != hash
                || v.maybe_hash != Some(second.clone())
                || v.hashes != vec![hash, second]
            {
                Err("aliases".into())
            } else {
                Ok(())
            }
        }
    );

    // ============ Boundary cases ============

    check_request!("echo_bytes_empty.msgpack", EchoBytes, |v: &EchoBytes| {
        if !v.data.is_empty() {
            Err(format!("expected empty, got {} bytes", v.data.len()))
        } else {
            Ok(())
        }
    });
    check_request!("echo_bytes_bin16.msgpack", EchoBytes, |v: &EchoBytes| {
        if v.data.len() != 256 || v.data.iter().any(|&b| b != 0xAA) {
            Err("expected 256 x 0xAA".into())
        } else {
            Ok(())
        }
    });
    check_request!("echo_fields_max.msgpack", EchoFields, |v: &EchoFields| {
        if v.a != u32::MAX || v.b != u64::MAX || !v.name.is_empty() {
            Err("expected u32::MAX/u64::MAX/empty".into())
        } else {
            Ok(())
        }
    });
    check_request!(
        "echo_fields_uint_boundary.msgpack",
        EchoFields,
        |v: &EchoFields| {
            if v.a != 128 || v.b != (u32::MAX as u64) + 1 || v.name != "x" {
                Err("expected 128/u32max+1/\"x\"".into())
            } else {
                Ok(())
            }
        }
    );
    check_request!(
        "echo_fields_unicode.msgpack",
        EchoFields,
        |v: &EchoFields| {
            if v.name != "héllo τέστ 🚀 mañana" {
                Err(format!("unicode mismatch: {:?}", v.name))
            } else {
                Ok(())
            }
        }
    );
    check_request!("echo_fields_str16.msgpack", EchoFields, |v: &EchoFields| {
        if v.name.len() != 300 || v.name.chars().any(|c| c != 'a') {
            Err("expected 300 x 'a'".into())
        } else {
            Ok(())
        }
    });
    check_request!(
        "echo_nested_flag_none.msgpack",
        EchoNested,
        |v: &EchoNested| {
            if !v.inner.values.is_empty() || v.inner.flag.is_some() {
                Err("expected empty values + flag=None".into())
            } else {
                Ok(())
            }
        }
    );
    check_request!(
        "echo_nested_flag_false.msgpack",
        EchoNested,
        |v: &EchoNested| {
            if v.inner.values != vec![Vec::<u8>::new()] || v.inner.flag != Some(false) {
                Err("expected [[]] + flag=Some(false)".into())
            } else {
                Ok(())
            }
        }
    );

    eprintln!("\nResults: {pass}/{} passed, {fail} failed", pass + fail);
    if fail > 0 {
        std::process::exit(1);
    }
}

fn test_hash(base: u8) -> Fr {
    Fr::from_bytes(std::array::from_fn(|i| base + i as u8))
}

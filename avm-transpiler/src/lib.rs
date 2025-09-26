#![warn(clippy::semicolon_if_nothing_returned)]
#![cfg_attr(not(test), warn(unused_crate_dependencies, unused_extern_crates))]

use noirc_frontend as _;

use libc::{c_char, c_int, size_t};
use std::ffi::{CStr, CString};
use std::fs;
use std::path::Path;
use std::slice;

mod bit_traits;
mod instructions;
mod opcodes;
mod procedures;
mod transpile;
mod transpile_contract;
mod utils;

use transpile_contract::{CompiledAcirContractArtifact, TranspiledContractArtifact};

pub use transpile_contract::*;
pub use transpile::*;

#[repr(C)]
pub struct TranspileResult {
    pub success: c_int,
    pub data: *mut u8,
    pub length: size_t,
    pub error_message: *mut c_char,
}

impl Default for TranspileResult {
    fn default() -> Self {
        Self {
            success: 0,
            data: std::ptr::null_mut(),
            length: 0,
            error_message: std::ptr::null_mut(),
        }
    }
}

fn create_error_result(error: &str) -> TranspileResult {
    let error_cstr = match CString::new(error) {
        Ok(cstr) => cstr,
        Err(_) => CString::new("Error message contains null bytes").unwrap(),
    };

    TranspileResult {
        success: 0,
        data: std::ptr::null_mut(),
        length: 0,
        error_message: error_cstr.into_raw(),
    }
}

fn create_success_result(data: Vec<u8>) -> TranspileResult {
    let length = data.len();
    let data_ptr = Box::into_raw(data.into_boxed_slice()) as *mut u8;

    TranspileResult {
        success: 1,
        data: data_ptr,
        length,
        error_message: std::ptr::null_mut(),
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn avm_transpile_file(
    input_path: *const c_char,
    output_path: *const c_char,
) -> TranspileResult {
    if input_path.is_null() || output_path.is_null() {
        return create_error_result("Input or output path is null");
    }

    let input_path_str = match unsafe { CStr::from_ptr(input_path) }.to_str() {
        Ok(s) => s,
        Err(_) => return create_error_result("Invalid UTF-8 in input path"),
    };

    let output_path_str = match unsafe { CStr::from_ptr(output_path) }.to_str() {
        Ok(s) => s,
        Err(_) => return create_error_result("Invalid UTF-8 in output path"),
    };

    let json_parse_error = format!(
        "Unable to parse json for: {input_path_str}
    This is probably a stale json file with a different wire format.
    You might need to recompile the contract or delete the json file"
    );

    let contract_json = match fs::read_to_string(Path::new(input_path_str)) {
        Ok(content) => content,
        Err(e) => return create_error_result(&format!("Unable to read file {}: {}", input_path_str, e)),
    };

    let raw_json_obj: serde_json::Value = match serde_json::from_str(&contract_json) {
        Ok(obj) => obj,
        Err(_) => return create_error_result(&json_parse_error),
    };

    if let Some(serde_json::Value::Bool(true)) = raw_json_obj.get("transpiled") {
        return create_error_result("Contract already transpiled");
    }

    if Path::new(output_path_str).exists() {
        if let Err(e) = std::fs::copy(
            Path::new(output_path_str),
            Path::new(&(output_path_str.to_string() + ".bak")),
        ) {
            return create_error_result(&format!("Unable to backup file {}: {}", output_path_str, e));
        }
    }

    let contract: CompiledAcirContractArtifact = match serde_json::from_str(&contract_json) {
        Ok(contract) => contract,
        Err(_) => return create_error_result(&json_parse_error),
    };

    let transpiled_contract = TranspiledContractArtifact::from(contract);
    let transpiled_json = match serde_json::to_string(&transpiled_contract) {
        Ok(json) => json,
        Err(e) => return create_error_result(&format!("Unable to serialize json: {}", e)),
    };

    if let Err(e) = fs::write(output_path_str, &transpiled_json) {
        return create_error_result(&format!("Unable to write file: {}", e));
    }

    create_success_result(transpiled_json.into_bytes())
}

#[unsafe(no_mangle)]
pub extern "C" fn avm_transpile_bytecode(
    input_data: *const u8,
    input_length: size_t,
) -> TranspileResult {
    if input_data.is_null() {
        return create_error_result("Input data is null");
    }

    let input_slice = unsafe { slice::from_raw_parts(input_data, input_length) };
    let contract_json = match String::from_utf8(input_slice.to_vec()) {
        Ok(json) => json,
        Err(_) => return create_error_result("Input data is not valid UTF-8"),
    };

    let json_parse_error = "Unable to parse input json. This is probably a stale json file with a different wire format.";

    let raw_json_obj: serde_json::Value = match serde_json::from_str(&contract_json) {
        Ok(obj) => obj,
        Err(_) => return create_error_result(json_parse_error),
    };

    if let Some(serde_json::Value::Bool(true)) = raw_json_obj.get("transpiled") {
        return create_error_result("Contract already transpiled");
    }

    let contract: CompiledAcirContractArtifact = match serde_json::from_str(&contract_json) {
        Ok(contract) => contract,
        Err(_) => return create_error_result(json_parse_error),
    };

    let transpiled_contract = TranspiledContractArtifact::from(contract);
    let transpiled_json = match serde_json::to_string(&transpiled_contract) {
        Ok(json) => json,
        Err(e) => return create_error_result(&format!("Unable to serialize json: {}", e)),
    };

    create_success_result(transpiled_json.into_bytes())
}

#[unsafe(no_mangle)]
pub extern "C" fn avm_free_result(result: *mut TranspileResult) {
    if result.is_null() {
        return;
    }

    let result = unsafe { &mut *result };

    if !result.data.is_null() && result.length > 0 {
        unsafe {
            let _ = Box::from_raw(slice::from_raw_parts_mut(result.data, result.length));
        }
        result.data = std::ptr::null_mut();
        result.length = 0;
    }

    if !result.error_message.is_null() {
        unsafe {
            let _ = CString::from_raw(result.error_message);
        }
        result.error_message = std::ptr::null_mut();
    }
}
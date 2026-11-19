//! noirc_abi_wasm's encoder (noirc_abi_wasm/src/lib.rs) over JSON text, and acvm_js's witness stack
//! (de)compression: the values its wasm bindings move through serde_json reach here as that JSON.

use std::collections::BTreeMap;

use acir::circuit::ErrorSelector;
use acir::native_types::{Witness, WitnessMap, WitnessStack};
use acir::FieldElement;
use acvm::pwg::RawAssertionPayload;
use acvm::AcirField;
use iter_extended::try_btree_map;
use noirc_abi::{
    decode_value, display_abi_error,
    errors::InputParserError,
    input_parser::{json::JsonTypes, InputValue},
    Abi, AbiErrorType, MAIN_RETURN_NAME,
};
use serde::Serialize;

use crate::generated::acvm::acvm_types::{Bin32, WitnessEntry, WitnessStackItem};

/// The largest integer JavaScript represents exactly, `Number.MAX_SAFE_INTEGER`.
const MAX_SAFE_INTEGER: u64 = (1 << 53) - 1;

fn parse<T: serde::de::DeserializeOwned>(json: &str) -> Result<T, String> {
    serde_json::from_str(json).map_err(|err| err.to_string())
}

/// Rejects a number JavaScript may already have rounded, as noirc_abi_wasm does.
fn reject_unsafe_integers(value: &JsonTypes) -> Result<(), String> {
    match value {
        JsonTypes::Integer(integer) if integer.unsigned_abs() > MAX_SAFE_INTEGER => Err(format!(
            "Numeric input `{integer}` is not a safe integer (its magnitude exceeds 2^53 - 1, so \
             JavaScript may have already rounded it); pass it as a string instead"
        )),
        JsonTypes::Array(items) => items.iter().try_for_each(reject_unsafe_integers),
        JsonTypes::Table(map) => map.values().try_for_each(reject_unsafe_integers),
        _ => Ok(()),
    }
}

pub fn abi_encode(
    abi_json: &str,
    inputs_json: &str,
    return_value_json: Option<&str>,
) -> Result<WitnessMap<FieldElement>, String> {
    let abi: Abi = parse(abi_json)?;
    let inputs: BTreeMap<String, JsonTypes> = parse(inputs_json)?;
    inputs.values().try_for_each(reject_unsafe_integers)?;
    let return_value = return_value_json
        .map(|json| {
            let value: JsonTypes = parse(json)?;
            reject_unsafe_integers(&value)?;
            let return_type = abi
                .return_type
                .as_ref()
                .ok_or("a return value was given for a function that returns nothing")?;
            InputValue::try_from_json(value, &return_type.abi_type, MAIN_RETURN_NAME)
                .map_err(|err| err.to_string())
        })
        .transpose()?;

    let parsed_inputs: BTreeMap<String, InputValue> =
        try_btree_map(abi.to_btree_map(), |(arg_name, abi_type)| {
            let value = inputs
                .get(&arg_name)
                .ok_or_else(|| InputParserError::MissingArgument(arg_name.clone()))?;
            InputValue::try_from_json(value.clone(), &abi_type, &arg_name)
                .map(|input_value| (arg_name, input_value))
        })
        .map_err(|err: InputParserError| err.to_string())?;

    abi.encode(&parsed_inputs, return_value)
        .map_err(|err| err.to_string())
}

pub fn abi_decode(abi_json: &str, witness: &WitnessMap<FieldElement>) -> Result<String, String> {
    let abi: Abi = parse(abi_json)?;
    let (inputs, return_value) = abi.decode(witness).map_err(|err| err.to_string())?;

    let abi_types = abi.to_btree_map();
    let inputs: BTreeMap<String, JsonTypes> = try_btree_map(inputs, |(key, value)| {
        JsonTypes::try_from_input_value(&value, &abi_types[&key]).map(|value| (key, value))
    })
    .map_err(|err| err.to_string())?;
    let return_value = return_value
        .zip(abi.return_type.as_ref())
        .map(|(value, return_type)| JsonTypes::try_from_input_value(&value, &return_type.abi_type))
        .transpose()
        .map_err(|err| err.to_string())?;

    #[derive(Serialize)]
    struct InputsAndReturn {
        inputs: BTreeMap<String, JsonTypes>,
        return_value: Option<JsonTypes>,
    }
    serde_json::to_string(&InputsAndReturn {
        inputs,
        return_value,
    })
    .map_err(|err| err.to_string())
}

pub fn abi_decode_error(abi_json: &str, selector: &str, data: &[String]) -> Result<String, String> {
    let mut abi: Abi = parse(abi_json)?;
    let raw: RawAssertionPayload<FieldElement> = RawAssertionPayload {
        selector: ErrorSelector::new(
            selector
                .parse()
                .map_err(|_| format!("Invalid error selector `{selector}`"))?,
        ),
        data: data
            .iter()
            .map(|field| {
                FieldElement::from_hex(field).ok_or_else(|| format!("Invalid field `{field}`"))
            })
            .collect::<Result<_, _>>()?,
    };
    let error_type = abi
        .error_types
        .remove(&raw.selector)
        .ok_or("Missing error type")?;
    let value = match error_type {
        AbiErrorType::FmtString { .. } => {
            serde_json::Value::String(display_abi_error(&raw.data, error_type).to_string())
        }
        AbiErrorType::Custom(typ) => {
            let value = decode_value(&mut raw.data.into_iter(), &typ, "error")
                .map_err(|err| err.to_string())?;
            let json =
                JsonTypes::try_from_input_value(&value, &typ).map_err(|err| err.to_string())?;
            serde_json::to_value(&json).map_err(|err| err.to_string())?
        }
        AbiErrorType::String { string } => serde_json::Value::String(string),
    };
    serde_json::to_string(&value).map_err(|err| err.to_string())
}

pub fn compress_witness_stack(items: &[WitnessStackItem]) -> Result<Vec<u8>, String> {
    let mut stack = WitnessStack::default();
    for item in items {
        stack.push(item.index, witness_map(&item.witness));
    }
    stack.serialize().map_err(|err| err.to_string())
}

pub fn decompress_witness_stack(bytes: &[u8]) -> Result<Vec<WitnessStackItem>, String> {
    let mut stack =
        WitnessStack::<FieldElement>::deserialize(bytes).map_err(|err| err.to_string())?;
    let mut items = Vec::new();
    while let Some(item) = stack.pop() {
        items.push(WitnessStackItem {
            index: item.index,
            witness: witness_entries(&item.witness),
        });
    }
    // A stack pops from its top; acvm_js lists it bottom first.
    items.reverse();
    Ok(items)
}

pub fn witness_map(entries: &[WitnessEntry]) -> WitnessMap<FieldElement> {
    let mut map = WitnessMap::new();
    for entry in entries {
        map.insert(
            Witness(entry.index),
            FieldElement::from_be_bytes_reduce(&entry.value.0),
        );
    }
    map
}

pub fn witness_entries(witness: &WitnessMap<FieldElement>) -> Vec<WitnessEntry> {
    witness
        .clone()
        .into_iter()
        .map(|(index, value)| WitnessEntry {
            index: index.0,
            value: Bin32(be32(value)),
        })
        .collect()
}

pub fn be32(value: FieldElement) -> [u8; 32] {
    let bytes = value.to_be_bytes();
    let mut out = [0u8; 32];
    out[32 - bytes.len()..].copy_from_slice(&bytes);
    out
}

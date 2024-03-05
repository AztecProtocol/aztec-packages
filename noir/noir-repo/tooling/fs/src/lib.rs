#![forbid(unsafe_code)]
#![warn(unreachable_pub)]
#![warn(clippy::semicolon_if_nothing_returned)]
#![cfg_attr(not(test), warn(unused_crate_dependencies, unused_extern_crates))]

use acir::{
    native_types::{Witness, WitnessMap},
    FieldElement,
};
use toml::Table;

use errors::FilesystemError;
use std::fs::{File, read};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::collections::BTreeMap;
use noirc_abi::input_parser::{Format, InputValue};
use noirc_abi::InputMap;
use noirc_abi::{Abi, MAIN_RETURN_NAME};
use nargo::artifacts::{ program::ProgramArtifact, contract::ContractArtifact };
use nargo::constants::{ WITNESS_EXT, PROOF_EXT };
use noirc_frontend::graph::CrateName;
use acvm::acir::circuit::Circuit;

pub mod errors;

/// Returns the circuit's parameters as a WitnessMap parsed from a toml file at the given location
pub fn read_input_witness_from_toml_file<P: AsRef<Path>>(
    working_directory: P,
    file_name: &String,
) -> Result<WitnessMap, FilesystemError> {
    let file_path = working_directory.as_ref().join(file_name);
    if !file_path.exists() {
        return Err(FilesystemError::MissingTomlFile(
            file_name.to_owned(),
            file_path,
        ));
    }

    let input_string = std::fs::read_to_string(file_path)
        .map_err(|_| FilesystemError::InvalidTomlFile(file_name.clone()))?;
    let input_map = input_string
        .parse::<Table>()
        .map_err(|_| FilesystemError::InvalidTomlFile(file_name.clone()))?;
    let mut witnesses: WitnessMap = WitnessMap::new();
    for (key, value) in input_map.into_iter() {
        let index =
            Witness(key.trim().parse().map_err(|_| FilesystemError::WitnessIndexError(key.clone()))?);
        if !value.is_str() {
            return Err(FilesystemError::WitnessValueError(key.clone()));
        }
        let field = FieldElement::from_hex(value.as_str().unwrap()).unwrap();
        witnesses.insert(index, field);
    }

    Ok(witnesses)
}

/// Returns the circuit's bytecode read from the file at the given location
pub fn read_bytecode_from_file<P: AsRef<Path>>(
    working_directory: P,
    file_name: &String,
) -> Result<Vec<u8>, FilesystemError> {
    let file_path = working_directory.as_ref().join(file_name);
    if !file_path.exists() {
        return Err(FilesystemError::MissingBytecodeFile(file_name.to_owned(), file_path));
    }
    let bytecode: Vec<u8> =
        read(file_path).map_err(|_| FilesystemError::InvalidBytecodeFile(file_name.clone()))?;
    Ok(bytecode)
}

/// Saves the provided output witness to a flat toml file created at the given location
pub fn save_witness_string_to_file<P: AsRef<Path>>(
    output_witness: &String,
    witness_dir: P,
    file_name: &String,
) -> Result<PathBuf, FilesystemError> {
    let witness_path = witness_dir.as_ref().join(file_name);

    let mut file = File::create(&witness_path)
        .map_err(|_| FilesystemError::OutputWitnessCreationFailed(file_name.clone()))?;
    write!(file, "{}", output_witness)
        .map_err(|_| FilesystemError::OutputWitnessWriteFailed(file_name.clone()))?;

    Ok(witness_path)
}

/// Returns the circuit's parameters and its return value, if one exists.
/// # Examples
///
/// ```ignore
/// let (input_map, return_value): (InputMap, Option<InputValue>) =
///   read_inputs_from_file(path, "Verifier", Format::Toml, &abi)?;
/// ```
pub fn read_inputs_from_file<P: AsRef<Path>>(
    path: P,
    file_name: &str,
    format: Format,
    abi: &Abi,
) -> Result<(InputMap, Option<InputValue>), FilesystemError> {
    if abi.is_empty() {
        return Ok((BTreeMap::new(), None));
    }

    let file_path = path.as_ref().join(file_name).with_extension(format.ext());
    if !file_path.exists() {
        return Err(FilesystemError::MissingTomlFile(file_name.to_owned(), file_path));
    }

    let input_string = std::fs::read_to_string(file_path).unwrap();
    let mut input_map = format.parse(&input_string, abi)?;
    let return_value = input_map.remove(MAIN_RETURN_NAME);

    Ok((input_map, return_value))
}

pub fn write_inputs_to_file<P: AsRef<Path>>(
    input_map: &InputMap,
    return_value: &Option<InputValue>,
    abi: &Abi,
    path: P,
    file_name: &str,
    format: Format,
) -> Result<(), FilesystemError> {
    let file_path = path.as_ref().join(file_name).with_extension(format.ext());

    // We must insert the return value into the `InputMap` in order for it to be written to file.
    let serialized_output = match return_value {
        // Parameters and return values are kept separate except for when they're being written to file.
        // As a result, we don't want to modify the original map and must clone it before insertion.
        Some(return_value) => {
            let mut input_map = input_map.clone();
            input_map.insert(MAIN_RETURN_NAME.to_owned(), return_value.clone());
            format.serialize(&input_map, abi)?
        }
        // If no return value exists, then we can serialize the original map directly.
        None => format.serialize(input_map, abi)?,
    };

    write_to_file(serialized_output.as_bytes(), &file_path);

    Ok(())
}

pub fn save_program_to_file<P: AsRef<Path>>(
    program_artifact: &ProgramArtifact,
    crate_name: &CrateName,
    circuit_dir: P,
) -> PathBuf {
    let circuit_name: String = crate_name.into();
    save_build_artifact_to_file(program_artifact, &circuit_name, circuit_dir)
}

/// Writes the bytecode as acir.gz
pub fn only_acir<P: AsRef<Path>>(
    program_artifact: &ProgramArtifact,
    circuit_dir: P,
) -> PathBuf {
    create_named_dir(circuit_dir.as_ref(), "target");
    let circuit_path = circuit_dir.as_ref().join("acir").with_extension("gz");
    let bytes = Circuit::serialize_circuit(&program_artifact.bytecode);
    write_to_file(&bytes, &circuit_path);

    circuit_path
}

pub fn save_contract_to_file<P: AsRef<Path>>(
    compiled_contract: &ContractArtifact,
    circuit_name: &str,
    circuit_dir: P,
) -> PathBuf {
    save_build_artifact_to_file(compiled_contract, circuit_name, circuit_dir)
}

fn save_build_artifact_to_file<P: AsRef<Path>, T: ?Sized + serde::Serialize>(
    build_artifact: &T,
    artifact_name: &str,
    circuit_dir: P,
) -> PathBuf {
    create_named_dir(circuit_dir.as_ref(), "target");
    let circuit_path = circuit_dir.as_ref().join(artifact_name).with_extension("json");

    write_to_file(&serde_json::to_vec(build_artifact).unwrap(), &circuit_path);

    circuit_path
}

pub fn read_program_from_file<P: AsRef<Path>>(
    circuit_path: P,
) -> Result<ProgramArtifact, FilesystemError> {
    let file_path = circuit_path.as_ref().with_extension("json");

    let input_string =
        std::fs::read(&file_path).map_err(|_| FilesystemError::PathNotValid(file_path))?;
    let program = serde_json::from_slice(&input_string)
        .map_err(|err| FilesystemError::ProgramSerializationError(err.to_string()))?;

    Ok(program)
}

pub fn create_named_dir(named_dir: &Path, name: &str) -> PathBuf {
    std::fs::create_dir_all(named_dir)
        .unwrap_or_else(|_| panic!("could not create the `{name}` directory"));

    PathBuf::from(named_dir)
}

pub fn write_to_file(bytes: &[u8], path: &Path) -> String {
    let display = path.display();

    let mut file = match File::create(path) {
        Err(why) => panic!("couldn't create {display}: {why}"),
        Ok(file) => file,
    };

    match file.write_all(bytes) {
        Err(why) => panic!("couldn't write to {display}: {why}"),
        Ok(_) => display.to_string(),
    }
}

pub fn load_hex_data<P: AsRef<Path>>(path: P) -> Result<Vec<u8>, FilesystemError> {
    let hex_data: Vec<_> = std::fs::read(&path)
        .map_err(|_| FilesystemError::PathNotValid(path.as_ref().to_path_buf()))?;

    let raw_bytes = hex::decode(hex_data).map_err(FilesystemError::HexArtifactNotValid)?;

    Ok(raw_bytes)
}

pub fn save_witness_to_dir<P: AsRef<Path>>(
    witnesses: WitnessMap,
    witness_name: &str,
    witness_dir: P,
) -> Result<PathBuf, FilesystemError> {
    create_named_dir(witness_dir.as_ref(), "witness");
    let witness_path = witness_dir.as_ref().join(witness_name).with_extension(WITNESS_EXT);

    let buf: Vec<u8> = witnesses.try_into()?;

    write_to_file(buf.as_slice(), &witness_path);

    Ok(witness_path)
}

pub fn save_proof_to_dir<P: AsRef<Path>>(
    proof: &[u8],
    proof_name: &str,
    proof_dir: P,
) -> Result<PathBuf, FilesystemError> {
    create_named_dir(proof_dir.as_ref(), "proof");
    let proof_path = proof_dir.as_ref().join(proof_name).with_extension(PROOF_EXT);

    write_to_file(hex::encode(proof).as_bytes(), &proof_path);

    Ok(proof_path)
}

#[cfg(test)]
mod tests {
    use std::{collections::BTreeMap, vec};

    use acvm::FieldElement;
    use nargo::constants::VERIFIER_INPUT_FILE;
    use noirc_abi::{
        input_parser::{Format, InputValue},
        Abi, AbiParameter, AbiReturnType, AbiType, AbiVisibility,
    };
    use tempfile::TempDir;

    use super::{read_inputs_from_file, write_inputs_to_file};

    #[test]
    fn write_and_read_recovers_inputs_and_return_value() {
        let input_dir = TempDir::new().unwrap().into_path();

        // We purposefully test a simple ABI here as we're focussing on `fs`.
        // Tests for serializing complex types should exist in `noirc_abi`.
        let abi = Abi {
            parameters: vec![
                AbiParameter {
                    name: "foo".into(),
                    typ: AbiType::Field,
                    visibility: AbiVisibility::Public,
                },
                AbiParameter {
                    name: "bar".into(),
                    typ: AbiType::String { length: 11 },
                    visibility: AbiVisibility::Private,
                },
            ],
            return_type: Some(AbiReturnType {
                abi_type: AbiType::Field,
                visibility: AbiVisibility::Public,
            }),

            // Input serialization is only dependent on types, not position in witness map.
            // Neither of these should be relevant so we leave them empty.
            param_witnesses: BTreeMap::new(),
            return_witnesses: Vec::new(),
        };
        let input_map = BTreeMap::from([
            ("foo".to_owned(), InputValue::Field(42u128.into())),
            ("bar".to_owned(), InputValue::String("hello world".to_owned())),
        ]);
        let return_value = Some(InputValue::Field(FieldElement::zero()));

        write_inputs_to_file(
            &input_map,
            &return_value,
            &abi,
            &input_dir,
            VERIFIER_INPUT_FILE,
            Format::Toml,
        )
        .unwrap();

        let (loaded_inputs, loaded_return_value) =
            read_inputs_from_file(input_dir, VERIFIER_INPUT_FILE, Format::Toml, &abi).unwrap();

        assert_eq!(loaded_inputs, input_map);
        assert_eq!(loaded_return_value, return_value);
    }
}


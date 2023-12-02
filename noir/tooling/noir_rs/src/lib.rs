use std::io::Read;

use acir::{circuit::Circuit, native_types::WitnessMap};
use base64::{engine::general_purpose, Engine};
use flate2::bufread::GzDecoder;
use noir_rs_acir_composer::AcirComposer;
use noir_rs_acvm_runtime::execute::execute_circuit;
use noir_rs_barretenberg::{
    circuit::circuit_size::get_circuit_sizes,
    srs::{netsrs::NetSrs, srs_init},
};
use noir_rs_blackbox_solver::BlackboxSolver;

pub use acir::*;
pub use acvm::*;

pub fn prove(
    circuit_bytecode: String,
    initial_witness: WitnessMap,
) -> Result<(Vec<u8>, Vec<u8>), String> {
    let acir_buffer =
        general_purpose::STANDARD.decode(circuit_bytecode).map_err(|e| e.to_string())?;

    let circuit = Circuit::deserialize_circuit(&acir_buffer).map_err(|e| e.to_string())?;

    let mut decoder = GzDecoder::new(acir_buffer.as_slice());
    let mut acir_buffer_uncompressed = Vec::<u8>::new();
    decoder.read_to_end(&mut acir_buffer_uncompressed).map_err(|e| e.to_string())?;

    let blackbox_solver = BlackboxSolver::new();

    let solved_witness =
        execute_circuit(&blackbox_solver, circuit, initial_witness).map_err(|e| e.to_string())?;
    let serialized_solved_witness =
        bincode::serialize(&solved_witness).map_err(|e| e.to_string())?;

    let circuit_size = get_circuit_sizes(&acir_buffer_uncompressed).map_err(|e| e.to_string())?;
    let log_value = (circuit_size.total as f64).log2().ceil() as u32;
    let subgroup_size = 2u32.pow(log_value);

    let srs = NetSrs::new(subgroup_size + 1);
    srs_init(&srs.data, srs.num_points, &srs.g2_data).map_err(|e| e.to_string())?;

    let acir_composer = AcirComposer::new(&subgroup_size).map_err(|e| e.to_string())?;

    Ok((
        acir_composer
            .create_proof(&acir_buffer_uncompressed, &serialized_solved_witness, false)
            .map_err(|e| e.to_string())?,
        acir_composer.get_verification_key().map_err(|e| e.to_string())?,
    ))
}

pub fn verify(
    circuit_bytecode: String,
    proof: Vec<u8>,
    verification_key: Vec<u8>,
) -> Result<bool, String> {
    let acir_buffer =
        general_purpose::STANDARD.decode(circuit_bytecode).map_err(|e| e.to_string())?;
    let mut decoder = GzDecoder::new(acir_buffer.as_slice());
    let mut acir_buffer_uncompressed = Vec::<u8>::new();
    decoder.read_to_end(&mut acir_buffer_uncompressed).map_err(|e| e.to_string())?;

    let circuit_size = get_circuit_sizes(&acir_buffer_uncompressed).map_err(|e| e.to_string())?;
    let log_value = (circuit_size.total as f64).log2().ceil() as u32;
    let subgroup_size = 2u32.pow(log_value);

    let srs = NetSrs::new(subgroup_size + 1);
    srs_init(&srs.data, srs.num_points, &srs.g2_data).map_err(|e| e.to_string())?;

    let acir_composer = AcirComposer::new(&subgroup_size).map_err(|e| e.to_string())?;
    acir_composer.load_verification_key(&verification_key).map_err(|e| e.to_string())?;
    acir_composer.verify_proof(&proof, false).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use acir::native_types::{Witness, WitnessMap};
    use acvm::FieldElement;

    use crate::{prove, verify};

    const BYTECODE: &str = "H4sIAAAAAAAA/7VTQQ4DIQjE3bXHvgUWXfHWr9TU/f8TmrY2Ma43cRJCwmEYBrAAYOGKteRHyYyHcznsmZieuMckHp1Ph5CQF//ahTmLkxBTDBjJcabTRz7xB1Nx4RhoUdS16un6cpmOl6bxEsdAmpprvVuJD5bOLdwmzAJNn9a/e6em2nzGcrYJvBb0jn7W3FZ/R1hRXjSP+mBB/5FMpbN+oj/eG6c6pXEFAAA=";

    #[test]
    fn test_prove_verify() {
        let mut initial_witness = WitnessMap::new();
        initial_witness.insert(Witness(1), FieldElement::zero());
        initial_witness.insert(Witness(2), FieldElement::one());

        let (proof, vk) = prove(String::from(BYTECODE), initial_witness).unwrap();
        let verdict = verify(String::from(BYTECODE), proof, vk).unwrap();
        assert!(verdict);
    }
}

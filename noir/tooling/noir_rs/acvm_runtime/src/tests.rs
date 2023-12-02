use std::io::Read;

use acir_composer::AcirComposer;
use acvm::{
    acir::{
        circuit::Circuit,
        native_types::{Witness, WitnessMap},
    },
    FieldElement,
};
use barretenberg::{
    circuit::circuit_size::get_circuit_sizes,
    srs::{netsrs::NetSrs, srs_init},
};
use base64::{engine::general_purpose, Engine};
use blackbox_solver::BlackboxSolver;
use flate2::bufread::GzDecoder;

use crate::execute::execute_circuit;

const BYTECODE: &str = "H4sIAAAAAAAA/7VTQQ4DIQjE3bXHvgUWXfHWr9TU/f8TmrY2Ma43cRJCwmEYBrAAYOGKteRHyYyHcznsmZieuMckHp1Ph5CQF//ahTmLkxBTDBjJcabTRz7xB1Nx4RhoUdS16un6cpmOl6bxEsdAmpprvVuJD5bOLdwmzAJNn9a/e6em2nzGcrYJvBb0jn7W3FZ/R1hRXjSP+mBB/5FMpbN+oj/eG6c6pXEFAAA=";

#[test]
fn test_prove_verify() {
    let acir_buffer = general_purpose::STANDARD.decode(BYTECODE).unwrap();
    let circuit = Circuit::read(acir_buffer.as_slice()).unwrap();

    let blackbox_solver = BlackboxSolver::new();
    let mut initial_witness = WitnessMap::new();
    initial_witness.insert(Witness(1), FieldElement::zero());
    initial_witness.insert(Witness(2), FieldElement::one());
    let solved_witness = execute_circuit(&blackbox_solver, circuit, initial_witness).unwrap();
    let serialized_solved_witness = bincode::serialize(&solved_witness).unwrap();

    let mut decoder = GzDecoder::new(acir_buffer.as_slice());
    let mut acir_buffer_uncompressed = Vec::<u8>::new();
    decoder.read_to_end(&mut acir_buffer_uncompressed).unwrap();

    let circuit_size = get_circuit_sizes(&acir_buffer_uncompressed).unwrap();
    let log_value = (circuit_size.total as f64).log2().ceil() as u32;
    let subgroup_size = 2u32.pow(log_value);

    let srs = NetSrs::new(subgroup_size + 1);
    srs_init(&srs.data, srs.num_points, &srs.g2_data).unwrap();

    let acir_composer = AcirComposer::new(&subgroup_size).unwrap();
    let proof = acir_composer
        .create_proof(&acir_buffer_uncompressed, &serialized_solved_witness, false)
        .unwrap();
    let verdict = acir_composer.verify_proof(&proof, false).unwrap();
    assert!(verdict);
}

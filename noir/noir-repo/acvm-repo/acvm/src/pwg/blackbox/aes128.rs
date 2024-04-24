use acir::{
    circuit::opcodes::FunctionInput,
    native_types::{Witness, WitnessMap},
    FieldElement,
};
use acvm_blackbox_solver::BlackBoxFunctionSolver;

use crate::{pwg::insert_value, OpcodeResolutionError};

use super::utils::{to_u8_array, to_u8_vec};

pub(super) fn aes128_encrypt(
    backend: &impl BlackBoxFunctionSolver,
    initial_witness: &mut WitnessMap,
    inputs: &Vec<FunctionInput>,
    iv: &[FunctionInput; 16],
    key: &[FunctionInput; 16],
    outputs: &[Witness],
) -> Result<(), OpcodeResolutionError> {
    let scalars = to_u8_vec(initial_witness, inputs)?;

    let iv = to_u8_array(initial_witness, iv)?;
    let key = to_u8_array(initial_witness, key)?;

    let cyphertext = backend.aes128_encrypt(&scalars, iv, key, scalars.len() as u32)?;

    // Write witness assignments
    for (output_witness, value) in outputs.iter().zip(cyphertext.into_iter()) {
        insert_value(output_witness, FieldElement::from(value as u128), initial_witness)?;
    }

    Ok(())
}

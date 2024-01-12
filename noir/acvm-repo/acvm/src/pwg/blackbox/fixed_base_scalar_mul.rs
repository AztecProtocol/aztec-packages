use acir::{
    circuit::opcodes::FunctionInput,
    native_types::{Witness, WitnessMap},
    FieldElement,
};
use acvm_blackbox_solver::BlackBoxFunctionSolver;
use ark_ec::AffineRepr;

use crate::pwg::{insert_value, witness_to_value, ErrorLocation, OpcodeResolutionError};

pub(super) fn fixed_base_scalar_mul(
    backend: &impl BlackBoxFunctionSolver,
    initial_witness: &mut WitnessMap,
    low: FunctionInput,
    high: FunctionInput,
    outputs: (Witness, Witness),
) -> Result<(), OpcodeResolutionError> {
    let low = witness_to_value(initial_witness, low.witness)?;
    let high = witness_to_value(initial_witness, high.witness)?;

    let (pub_x, pub_y) = backend.fixed_base_scalar_mul(low, high)?;

    insert_value(&outputs.0, pub_x, initial_witness)?;
    insert_value(&outputs.1, pub_y, initial_witness)?;

    Ok(())
}

pub(super) fn embedded_curve_double(
    initial_witness: &mut WitnessMap,
    input_x: FunctionInput,
    input_y: FunctionInput,
    outputs: (Witness, Witness),
) -> Result<(), OpcodeResolutionError> {
    embedded_curve_add(initial_witness, input_x, input_y, input_x, input_y, outputs)
}

pub(super) fn embedded_curve_add(
    initial_witness: &mut WitnessMap,
    input1_x: FunctionInput,
    input1_y: FunctionInput,
    input2_x: FunctionInput,
    input2_y: FunctionInput,
    outputs: (Witness, Witness),
) -> Result<(), OpcodeResolutionError> {
    let input1_x = witness_to_value(initial_witness, input1_x.witness)?;
    let input1_y = witness_to_value(initial_witness, input1_y.witness)?;
    let input2_x = witness_to_value(initial_witness, input2_x.witness)?;
    let input2_y = witness_to_value(initial_witness, input2_y.witness)?;
    let mut point1 = grumpkin::SWAffine::new(input1_x.into_repr(), input1_y.into_repr());
    let point2 = grumpkin::SWAffine::new(input2_x.into_repr(), input2_y.into_repr());
    let res = point1 + point2;
    point1 = res.into();
    if let Some((res_x, res_y)) = point1.xy() {
        insert_value(&outputs.0, FieldElement::from_repr(*res_x), initial_witness)?;
        insert_value(&outputs.1, FieldElement::from_repr(*res_y), initial_witness)?;
        Ok(())
    } else {
        Err(OpcodeResolutionError::UnsatisfiedConstrain {
            opcode_location: ErrorLocation::Unresolved,
        })
    }
}

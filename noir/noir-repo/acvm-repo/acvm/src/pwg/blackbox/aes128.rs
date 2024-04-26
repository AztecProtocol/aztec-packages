use acir::{
    circuit::opcodes::FunctionInput,
    native_types::{Witness, WitnessMap},
    FieldElement,
};
use acvm_blackbox_solver::BlackBoxFunctionSolver;

use crate::{pwg::insert_value, OpcodeResolutionError};

use super::utils::{to_u8_array, to_u8_vec};

// PKCS7 padding: a new Vec is returned with padding.
// Implementation taken from libaes 0.7.0 by Han Xu under MIT License:

// Permission is hereby granted, free of charge, to any
// person obtaining a copy of this software and associated
// documentation files (the "Software"), to deal in the
// Software without restriction, including without
// limitation the rights to use, copy, modify, merge,
// publish, distribute, sublicense, and/or sell copies of
// the Software, and to permit persons to whom the Software
// is furnished to do so, subject to the following
// conditions:

// The above copyright notice and this permission notice
// shall be included in all copies or substantial portions
// of the Software.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
// ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
// TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
// PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
// SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
// CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
// OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
// IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
// DEALINGS IN THE SOFTWARE.
fn pad(input: &[u8]) -> Vec<u8> {
    let sz = input.len();
    let add = 16 - (sz % 16);
    let mut v: Vec<u8> = Vec::with_capacity(sz + add);
    v.extend_from_slice(input);
    for _ in 0..add {
        v.push(add as u8);
    }
    v
}

pub(super) fn aes128_encrypt(
    backend: &impl BlackBoxFunctionSolver,
    initial_witness: &mut WitnessMap,
    inputs: &[FunctionInput],
    iv: &[FunctionInput; 16],
    key: &[FunctionInput; 16],
    outputs: &[Witness],
) -> Result<(), OpcodeResolutionError> {
    let scalars = to_u8_vec(initial_witness, inputs)?;

    let padded_input = pad(scalars.as_slice());

    let iv = to_u8_array(initial_witness, iv)?;
    let key = to_u8_array(initial_witness, key)?;

    let cyphertext = backend.aes128_encrypt(&padded_input, iv, key)?;

    // Write witness assignments
    for (output_witness, value) in outputs.iter().zip(cyphertext.into_iter()) {
        insert_value(output_witness, FieldElement::from(value as u128), initial_witness)?;
    }

    Ok(())
}

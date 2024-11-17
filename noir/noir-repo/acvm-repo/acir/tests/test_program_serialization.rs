//! This integration test defines a set of circuits which are used in order to test the acvm_js package.
//!
//! The acvm_js test suite contains serialized program [circuits][`Program`] which must be kept in sync with the format
//! outputted from the [ACIR crate][acir].
//! Breaking changes to the serialization format then require refreshing acvm_js's test suite.
//! This file contains Rust definitions of these circuits and outputs the updated serialized format.
//!
//! These tests also check this circuit serialization against an expected value, erroring if the serialization changes.
//! Generally in this situation we just need to refresh the `expected_serialization` variables to match the
//! actual output, **HOWEVER** note that this results in a breaking change to the backend ACIR format.

use std::collections::BTreeSet;

use acir::{
    circuit::{
        brillig::{BrilligBytecode, BrilligFunctionId, BrilligInputs, BrilligOutputs},
        opcodes::{AcirFunctionId, BlackBoxFuncCall, BlockId, FunctionInput, MemOp},
        Circuit, Opcode, Program, PublicInputs,
    },
    native_types::{Expression, Witness},
};
use acir_field::{AcirField, FieldElement};
use brillig::{BitSize, HeapArray, HeapValueType, IntegerBitSize, MemoryAddress, ValueOrArray};

#[test]
fn addition_circuit() {
    let addition = Opcode::AssertZero(Expression {
        mul_terms: Vec::new(),
        linear_combinations: vec![
            (FieldElement::one(), Witness(1)),
            (FieldElement::one(), Witness(2)),
            (-FieldElement::one(), Witness(3)),
        ],
        q_c: FieldElement::zero(),
    });

    let circuit: Circuit<FieldElement> = Circuit {
        current_witness_index: 4,
        opcodes: vec![addition],
        private_parameters: BTreeSet::from([Witness(1), Witness(2)]),
        return_values: PublicInputs([Witness(3)].into()),
        ..Circuit::<FieldElement>::default()
    };
    let program = Program { functions: vec![circuit], unconstrained_functions: vec![] };

    let bytes = Program::serialize_program(&program);

    let expected_serialization: Vec<u8> = vec![
        31, 139, 8, 0, 0, 0, 0, 0, 0, 255, 173, 144, 65, 14, 128, 32, 12, 4, 65, 124, 80, 75, 91,
        104, 111, 126, 69, 34, 252, 255, 9, 106, 228, 64, 194, 81, 38, 105, 182, 167, 201, 102,
        189, 251, 216, 159, 243, 110, 38, 244, 60, 122, 194, 63, 208, 47, 116, 109, 131, 139, 32,
        49, 215, 28, 43, 18, 158, 16, 173, 168, 0, 75, 73, 138, 138, 162, 114, 69, 37, 170, 202,
        154, 173, 88, 6, 67, 166, 138, 77, 140, 90, 151, 133, 117, 189, 224, 117, 108, 221, 229,
        135, 223, 13, 27, 135, 121, 106, 119, 3, 58, 173, 124, 163, 140, 1, 0, 0,
    ];

    assert_eq!(bytes, expected_serialization)
}

#[test]
fn multi_scalar_mul_circuit() {
    let multi_scalar_mul: Opcode<FieldElement> =
        Opcode::BlackBoxFuncCall(BlackBoxFuncCall::MultiScalarMul {
            points: vec![
                FunctionInput::witness(Witness(1), FieldElement::max_num_bits()),
                FunctionInput::witness(Witness(2), FieldElement::max_num_bits()),
                FunctionInput::witness(Witness(3), 1),
            ],
            scalars: vec![
                FunctionInput::witness(Witness(4), FieldElement::max_num_bits()),
                FunctionInput::witness(Witness(5), FieldElement::max_num_bits()),
            ],
            outputs: (Witness(6), Witness(7), Witness(8)),
        });

    let circuit = Circuit {
        current_witness_index: 9,
        opcodes: vec![multi_scalar_mul],
        private_parameters: BTreeSet::from([
            Witness(1),
            Witness(2),
            Witness(3),
            Witness(4),
            Witness(5),
        ]),
        return_values: PublicInputs(BTreeSet::from_iter(vec![Witness(6), Witness(7), Witness(8)])),
        ..Circuit::default()
    };
    let program = Program { functions: vec![circuit], unconstrained_functions: vec![] };

    let bytes = Program::serialize_program(&program);

    let expected_serialization: Vec<u8> = vec![
        31, 139, 8, 0, 0, 0, 0, 0, 0, 255, 93, 77, 9, 10, 0, 32, 8, 243, 236, 248, 255, 127, 35,
        163, 5, 35, 97, 184, 205, 169, 42, 183, 102, 65, 193, 21, 218, 73, 31, 44, 116, 35, 238,
        228, 189, 108, 208, 60, 193, 91, 161, 23, 6, 114, 73, 121, 195, 157, 32, 95, 232, 255, 191,
        203, 181, 1, 243, 231, 24, 106, 192, 0, 0, 0,
    ];

    assert_eq!(bytes, expected_serialization)
}

#[test]
fn schnorr_verify_circuit() {
    let public_key_x = FunctionInput::witness(Witness(1), FieldElement::max_num_bits());
    let public_key_y = FunctionInput::witness(Witness(2), FieldElement::max_num_bits());
    let signature: [FunctionInput<FieldElement>; 64] = (3..(3 + 64))
        .map(|i| FunctionInput::witness(Witness(i), 8))
        .collect::<Vec<_>>()
        .try_into()
        .unwrap();
    let message =
        ((3 + 64)..(3 + 64 + 10)).map(|i| FunctionInput::witness(Witness(i), 8)).collect();
    let output = Witness(3 + 64 + 10);
    let last_input = output.witness_index() - 1;

    let schnorr = Opcode::BlackBoxFuncCall(BlackBoxFuncCall::SchnorrVerify {
        public_key_x,
        public_key_y,
        signature: Box::new(signature),
        message,
        output,
    });

    let circuit: Circuit<FieldElement> = Circuit {
        current_witness_index: 100,
        opcodes: vec![schnorr],
        private_parameters: BTreeSet::from_iter((1..=last_input).map(Witness)),
        return_values: PublicInputs(BTreeSet::from([output])),
        ..Circuit::default()
    };
    let program = Program { functions: vec![circuit], unconstrained_functions: vec![] };

    let bytes = Program::serialize_program(&program);

    let expected_serialization: Vec<u8> = vec![
        31, 139, 8, 0, 0, 0, 0, 0, 0, 255, 77, 211, 103, 78, 2, 81, 24, 70, 225, 193, 130, 96, 239,
        189, 96, 239, 189, 35, 34, 34, 34, 82, 118, 193, 254, 151, 64, 224, 132, 111, 146, 67, 50,
        153, 39, 250, 3, 114, 239, 121, 51, 201, 240, 211, 29, 60, 153, 48, 239, 108, 188, 121,
        122, 241, 30, 145, 71, 7, 79, 46, 60, 38, 143, 203, 89, 121, 66, 206, 201, 121, 121, 82,
        158, 146, 167, 229, 25, 121, 86, 158, 147, 231, 229, 5, 121, 81, 94, 146, 151, 229, 21,
        121, 85, 94, 147, 215, 229, 13, 121, 83, 222, 146, 183, 229, 29, 121, 87, 222, 147, 11,
        242, 190, 124, 32, 31, 202, 71, 242, 177, 124, 34, 159, 202, 103, 242, 185, 124, 33, 95,
        202, 87, 242, 181, 124, 35, 223, 202, 119, 242, 189, 252, 32, 63, 202, 79, 242, 179, 252,
        34, 191, 202, 111, 242, 187, 92, 148, 63, 228, 146, 252, 41, 151, 229, 47, 185, 34, 127,
        203, 213, 48, 157, 38, 241, 183, 31, 253, 191, 38, 255, 202, 117, 249, 79, 110, 200, 255,
        114, 83, 110, 201, 237, 112, 39, 190, 191, 173, 223, 193, 54, 217, 36, 91, 100, 131, 108,
        47, 221, 92, 62, 126, 51, 155, 98, 75, 108, 136, 237, 176, 25, 182, 194, 70, 216, 6, 155,
        96, 11, 108, 128, 246, 105, 158, 214, 105, 156, 182, 105, 154, 150, 105, 152, 118, 105,
        182, 144, 12, 27, 165, 77, 154, 164, 69, 26, 164, 61, 154, 163, 53, 26, 163, 45, 154, 162,
        37, 26, 162, 29, 154, 161, 21, 26, 161, 13, 154, 160, 5, 26, 224, 238, 185, 115, 238, 154,
        59, 46, 198, 157, 150, 226, 14, 203, 113, 103, 149, 184, 163, 106, 220, 69, 45, 206, 190,
        30, 103, 221, 136, 179, 109, 198, 89, 166, 103, 150, 158, 91, 162, 243, 244, 167, 15, 14,
        161, 226, 6, 24, 5, 0, 0,
    ];

    assert_eq!(bytes, expected_serialization)
}

#[test]
fn simple_brillig_foreign_call() {
    let w_input = Witness(1);
    let w_inverted = Witness(2);

    let brillig_bytecode = BrilligBytecode {
        bytecode: vec![
            brillig::Opcode::Const {
                destination: MemoryAddress::direct(0),
                bit_size: BitSize::Integer(IntegerBitSize::U32),
                value: FieldElement::from(1_usize),
            },
            brillig::Opcode::Const {
                destination: MemoryAddress::direct(1),
                bit_size: BitSize::Integer(IntegerBitSize::U32),
                value: FieldElement::from(0_usize),
            },
            brillig::Opcode::CalldataCopy {
                destination_address: MemoryAddress::direct(0),
                size_address: MemoryAddress::direct(0),
                offset_address: MemoryAddress::direct(1),
            },
            brillig::Opcode::ForeignCall {
                function: "invert".into(),
                destinations: vec![ValueOrArray::MemoryAddress(MemoryAddress::direct(0))],
                destination_value_types: vec![HeapValueType::field()],
                inputs: vec![ValueOrArray::MemoryAddress(MemoryAddress::direct(0))],
                input_value_types: vec![HeapValueType::field()],
            },
            brillig::Opcode::Stop { return_data_offset: 0, return_data_size: 1 },
        ],
    };

    let opcodes = vec![Opcode::BrilligCall {
        id: BrilligFunctionId(0),
        inputs: vec![
            BrilligInputs::Single(w_input.into()), // Input Register 0,
        ],
        // This tells the BrilligSolver which witnesses its output values correspond to
        outputs: vec![
            BrilligOutputs::Simple(w_inverted), // Output Register 1
        ],
        predicate: None,
    }];

    let circuit: Circuit<FieldElement> = Circuit {
        current_witness_index: 8,
        opcodes,
        private_parameters: BTreeSet::from([Witness(1), Witness(2)]),
        ..Circuit::default()
    };
    let program =
        Program { functions: vec![circuit], unconstrained_functions: vec![brillig_bytecode] };

    let bytes = Program::serialize_program(&program);

    let expected_serialization: Vec<u8> = vec![
        31, 139, 8, 0, 0, 0, 0, 0, 0, 255, 173, 79, 73, 10, 128, 48, 12, 236, 40, 46, 5, 111, 126,
        36, 254, 192, 207, 120, 240, 226, 65, 196, 247, 91, 48, 129, 80, 186, 28, 154, 129, 144,
        201, 132, 44, 3, 247, 99, 14, 1, 230, 3, 103, 169, 53, 68, 219, 57, 83, 27, 54, 216, 237,
        34, 253, 111, 23, 19, 104, 177, 96, 76, 204, 251, 68, 191, 55, 52, 238, 163, 187, 198, 251,
        105, 114, 101, 200, 221, 37, 196, 200, 252, 188, 222, 227, 126, 80, 153, 200, 213, 57, 125,
        77, 244, 62, 112, 171, 6, 33, 119, 2, 0, 0,
    ];

    assert_eq!(bytes, expected_serialization)
}

#[test]
fn complex_brillig_foreign_call() {
    let fe_0 = FieldElement::zero();
    let fe_1 = FieldElement::one();
    let a = Witness(1);
    let b = Witness(2);
    let c = Witness(3);

    let a_times_2 = Witness(4);
    let b_times_3 = Witness(5);
    let c_times_4 = Witness(6);
    let a_plus_b_plus_c = Witness(7);
    let a_plus_b_plus_c_times_2 = Witness(8);

    let brillig_bytecode = BrilligBytecode {
        bytecode: vec![
            brillig::Opcode::Const {
                destination: MemoryAddress::direct(0),
                bit_size: BitSize::Integer(IntegerBitSize::U32),
                value: FieldElement::from(3_usize),
            },
            brillig::Opcode::Const {
                destination: MemoryAddress::direct(1),
                bit_size: BitSize::Integer(IntegerBitSize::U32),
                value: FieldElement::from(0_usize),
            },
            brillig::Opcode::CalldataCopy {
                destination_address: MemoryAddress::direct(32),
                size_address: MemoryAddress::direct(0),
                offset_address: MemoryAddress::direct(1),
            },
            brillig::Opcode::Const {
                destination: MemoryAddress::direct(0),
                value: FieldElement::from(32_usize),
                bit_size: BitSize::Integer(IntegerBitSize::U32),
            },
            brillig::Opcode::Const {
                destination: MemoryAddress::direct(3),
                bit_size: BitSize::Integer(IntegerBitSize::U32),
                value: FieldElement::from(1_usize),
            },
            brillig::Opcode::Const {
                destination: MemoryAddress::direct(4),
                bit_size: BitSize::Integer(IntegerBitSize::U32),
                value: FieldElement::from(3_usize),
            },
            brillig::Opcode::CalldataCopy {
                destination_address: MemoryAddress::direct(1),
                size_address: MemoryAddress::direct(3),
                offset_address: MemoryAddress::direct(4),
            },
            // Oracles are named 'foreign calls' in brillig
            brillig::Opcode::ForeignCall {
                function: "complex".into(),
                inputs: vec![
                    ValueOrArray::HeapArray(HeapArray {
                        pointer: MemoryAddress::direct(0),
                        size: 3,
                    }),
                    ValueOrArray::MemoryAddress(MemoryAddress::direct(1)),
                ],
                input_value_types: vec![
                    HeapValueType::Array { size: 3, value_types: vec![HeapValueType::field()] },
                    HeapValueType::field(),
                ],
                destinations: vec![
                    ValueOrArray::HeapArray(HeapArray {
                        pointer: MemoryAddress::direct(0),
                        size: 3,
                    }),
                    ValueOrArray::MemoryAddress(MemoryAddress::direct(35)),
                    ValueOrArray::MemoryAddress(MemoryAddress::direct(36)),
                ],
                destination_value_types: vec![
                    HeapValueType::Array { size: 3, value_types: vec![HeapValueType::field()] },
                    HeapValueType::field(),
                    HeapValueType::field(),
                ],
            },
            brillig::Opcode::Stop { return_data_offset: 32, return_data_size: 5 },
        ],
    };

    let opcodes = vec![Opcode::BrilligCall {
        id: BrilligFunctionId(0),
        inputs: vec![
            // Input 0,1,2
            BrilligInputs::Array(vec![
                Expression::from(a),
                Expression::from(b),
                Expression::from(c),
            ]),
            // Input 3
            BrilligInputs::Single(Expression {
                mul_terms: vec![],
                linear_combinations: vec![(fe_1, a), (fe_1, b), (fe_1, c)],
                q_c: fe_0,
            }),
        ],
        // This tells the BrilligSolver which witnesses its output values correspond to
        outputs: vec![
            BrilligOutputs::Array(vec![a_times_2, b_times_3, c_times_4]), // Output 0,1,2
            BrilligOutputs::Simple(a_plus_b_plus_c),                      // Output 3
            BrilligOutputs::Simple(a_plus_b_plus_c_times_2),              // Output 4
        ],
        predicate: None,
    }];

    let circuit = Circuit {
        current_witness_index: 8,
        opcodes,
        private_parameters: BTreeSet::from([Witness(1), Witness(2), Witness(3)]),
        ..Circuit::default()
    };
    let program =
        Program { functions: vec![circuit], unconstrained_functions: vec![brillig_bytecode] };

    let bytes = Program::serialize_program(&program);
    let expected_serialization: Vec<u8> = vec![
        31, 139, 8, 0, 0, 0, 0, 0, 0, 255, 213, 85, 93, 10, 194, 48, 12, 78, 219, 233, 54, 240,
        205, 11, 8, 122, 128, 76, 47, 176, 187, 136, 111, 138, 62, 122, 124, 45, 75, 88, 140, 197,
        9, 38, 224, 62, 24, 89, 75, 242, 229, 159, 6, 24, 208, 60, 191, 64, 255, 11, 146, 145, 100,
        190, 79, 240, 10, 214, 237, 73, 226, 111, 232, 130, 29, 23, 122, 197, 24, 103, 16, 99, 114,
        136, 17, 68, 255, 255, 176, 223, 150, 125, 49, 173, 95, 42, 236, 79, 5, 195, 126, 45, 233,
        92, 147, 108, 116, 161, 179, 81, 132, 247, 197, 147, 224, 225, 105, 149, 4, 229, 184, 183,
        73, 232, 208, 42, 191, 198, 252, 200, 197, 216, 192, 119, 249, 250, 228, 185, 71, 230, 79,
        46, 252, 216, 49, 127, 229, 212, 167, 90, 213, 75, 230, 34, 253, 174, 96, 28, 192, 227,
        245, 114, 59, 159, 238, 169, 96, 170, 205, 51, 182, 234, 188, 43, 148, 108, 138, 131, 33,
        223, 153, 79, 250, 161, 160, 63, 101, 179, 134, 113, 156, 248, 93, 123, 0, 142, 67, 44,
        107, 244, 6, 0, 0,
    ];

    assert_eq!(bytes, expected_serialization)
}

#[test]
fn memory_op_circuit() {
    let init = vec![Witness(1), Witness(2)];

    let memory_init = Opcode::MemoryInit {
        block_id: BlockId(0),
        init,
        block_type: acir::circuit::opcodes::BlockType::Memory,
    };
    let write = Opcode::MemoryOp {
        block_id: BlockId(0),
        op: MemOp::write_to_mem_index(FieldElement::from(1u128).into(), Witness(3).into()),
        predicate: None,
    };
    let read = Opcode::MemoryOp {
        block_id: BlockId(0),
        op: MemOp::read_at_mem_index(FieldElement::one().into(), Witness(4)),
        predicate: None,
    };

    let circuit = Circuit {
        current_witness_index: 5,
        opcodes: vec![memory_init, write, read],
        private_parameters: BTreeSet::from([Witness(1), Witness(2), Witness(3)]),
        return_values: PublicInputs([Witness(4)].into()),
        ..Circuit::default()
    };
    let program = Program { functions: vec![circuit], unconstrained_functions: vec![] };

    let bytes = Program::serialize_program(&program);

    let expected_serialization: Vec<u8> = vec![
        31, 139, 8, 0, 0, 0, 0, 0, 0, 255, 213, 82, 65, 10, 0, 32, 8, 211, 180, 255, 216, 15, 250,
        255, 171, 10, 82, 176, 58, 166, 135, 6, 178, 29, 100, 204, 33, 194, 66, 157, 67, 170, 89,
        185, 40, 163, 211, 182, 115, 162, 43, 203, 27, 90, 182, 47, 6, 251, 82, 156, 151, 100, 151,
        43, 191, 149, 203, 209, 183, 147, 11, 90, 96, 255, 102, 11, 207, 112, 99, 0, 192, 100, 38,
        199, 38, 3, 0, 0,
    ];

    assert_eq!(bytes, expected_serialization)
}

#[test]
fn nested_acir_call_circuit() {
    // Circuit for the following program:
    // fn main(x: Field, y: pub Field) {
    //     let z = nested_call(x, y);
    //     let z2 = nested_call(x, y);
    //     assert(z == z2);
    // }
    // #[fold]
    // fn nested_call(x: Field, y: Field) -> Field {
    //     inner_call(x + 2, y)
    // }
    // #[fold]
    // fn inner_call(x: Field, y: Field) -> Field {
    //     assert(x == y);
    //     x
    // }
    let nested_call = Opcode::Call {
        id: AcirFunctionId(1),
        inputs: vec![Witness(0), Witness(1)],
        outputs: vec![Witness(2)],
        predicate: None,
    };
    let nested_call_two = Opcode::Call {
        id: AcirFunctionId(1),
        inputs: vec![Witness(0), Witness(1)],
        outputs: vec![Witness(3)],
        predicate: None,
    };

    let assert_nested_call_results = Opcode::AssertZero(Expression {
        mul_terms: Vec::new(),
        linear_combinations: vec![
            (FieldElement::one(), Witness(2)),
            (-FieldElement::one(), Witness(3)),
        ],
        q_c: FieldElement::zero(),
    });

    let main = Circuit {
        current_witness_index: 3,
        private_parameters: BTreeSet::from([Witness(0)]),
        public_parameters: PublicInputs([Witness(1)].into()),
        opcodes: vec![nested_call, nested_call_two, assert_nested_call_results],
        ..Circuit::default()
    };

    let call_parameter_addition = Opcode::AssertZero(Expression {
        mul_terms: Vec::new(),
        linear_combinations: vec![
            (FieldElement::one(), Witness(0)),
            (-FieldElement::one(), Witness(2)),
        ],
        q_c: FieldElement::one() + FieldElement::one(),
    });
    let call = Opcode::Call {
        id: AcirFunctionId(2),
        inputs: vec![Witness(2), Witness(1)],
        outputs: vec![Witness(3)],
        predicate: None,
    };

    let nested_call = Circuit {
        current_witness_index: 3,
        private_parameters: BTreeSet::from([Witness(0), Witness(1)]),
        return_values: PublicInputs([Witness(3)].into()),
        opcodes: vec![call_parameter_addition, call],
        ..Circuit::default()
    };

    let assert_param_equality = Opcode::AssertZero(Expression {
        mul_terms: Vec::new(),
        linear_combinations: vec![
            (FieldElement::one(), Witness(0)),
            (-FieldElement::one(), Witness(1)),
        ],
        q_c: FieldElement::zero(),
    });

    let inner_call = Circuit {
        current_witness_index: 1,
        private_parameters: BTreeSet::from([Witness(0), Witness(1)]),
        return_values: PublicInputs([Witness(0)].into()),
        opcodes: vec![assert_param_equality],
        ..Circuit::default()
    };

    let program =
        Program { functions: vec![main, nested_call, inner_call], unconstrained_functions: vec![] };

    let bytes = Program::serialize_program(&program);

    let expected_serialization: Vec<u8> = vec![
        31, 139, 8, 0, 0, 0, 0, 0, 0, 255, 213, 146, 81, 10, 195, 48, 8, 134, 77, 132, 158, 71, 99,
        210, 152, 183, 93, 101, 97, 233, 253, 143, 176, 142, 165, 44, 100, 133, 62, 52, 125, 232,
        7, 63, 138, 136, 232, 143, 8, 95, 176, 234, 195, 180, 202, 172, 178, 240, 195, 84, 193, 86,
        63, 106, 66, 232, 216, 26, 31, 53, 210, 57, 216, 54, 179, 132, 102, 239, 75, 116, 133, 133,
        159, 228, 82, 214, 64, 62, 228, 89, 89, 57, 104, 120, 57, 21, 41, 234, 53, 166, 156, 34,
        37, 246, 82, 120, 9, 73, 150, 58, 12, 199, 237, 69, 208, 152, 208, 230, 6, 254, 193, 206,
        192, 171, 188, 130, 129, 94, 217, 113, 123, 185, 169, 222, 106, 155, 187, 119, 159, 168,
        255, 178, 62, 199, 174, 102, 110, 102, 170, 129, 177, 15, 120, 228, 215, 30, 111, 39, 140,
        108, 64, 11, 4, 0, 0,
    ];
    assert_eq!(bytes, expected_serialization);
}

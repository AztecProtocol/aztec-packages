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
        31, 139, 8, 0, 0, 0, 0, 0, 0, 255, 149, 143, 49, 14, 64, 64, 16, 69, 255, 44, 7, 81, 210,
        17, 71, 16, 137, 74, 148, 26, 157, 3, 136, 78, 185, 71, 16, 23, 112, 10, 225, 56, 219, 41,
        53, 122, 194, 110, 76, 162, 217, 125, 201, 100, 102, 146, 159, 153, 255, 9, 47, 254, 93,
        132, 63, 158, 238, 1, 172, 32, 114, 208, 10, 166, 141, 219, 178, 87, 201, 28, 173, 85, 190,
        72, 89, 55, 97, 186, 23, 195, 214, 141, 153, 58, 167, 67, 251, 176, 188, 251, 32, 204, 19,
        54, 155, 29, 248, 114, 113, 46, 164, 199, 252, 137, 12, 1, 0, 0,
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
        31, 139, 8, 0, 0, 0, 0, 0, 0, 255, 149, 78, 203, 10, 192, 32, 12, 107, 54, 246, 16, 118,
        219, 15, 236, 231, 118, 216, 101, 135, 49, 252, 126, 5, 91, 80, 241, 81, 3, 197, 52, 49,
        109, 65, 1, 187, 47, 48, 95, 248, 149, 62, 134, 104, 23, 169, 0, 232, 255, 38, 251, 166,
        156, 32, 22, 27, 97, 57, 222, 20, 252, 89, 127, 12, 76, 54, 119, 48, 79, 91, 199, 151, 185,
        135, 175, 149, 249, 243, 218, 251, 251, 209, 73, 212, 250, 154, 126, 22, 60, 7, 12, 47, 88,
        88, 247, 1, 0, 0,
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
        31, 139, 8, 0, 0, 0, 0, 0, 0, 255, 181, 84, 209, 14, 194, 32, 12, 188, 210, 233, 182, 196,
        55, 127, 128, 68, 255, 204, 248, 166, 209, 71, 63, 95, 201, 218, 141, 85, 84, 74, 226, 37,
        164, 64, 238, 122, 165, 16, 8, 19, 134, 215, 32, 153, 111, 36, 6, 137, 105, 159, 177, 134,
        114, 35, 170, 64, 84, 207, 109, 246, 8, 248, 191, 7, 195, 239, 145, 192, 78, 31, 71, 191,
        60, 231, 118, 213, 175, 53, 231, 247, 223, 97, 122, 31, 91, 89, 247, 18, 135, 146, 40, 224,
        253, 225, 172, 170, 145, 56, 154, 8, 99, 28, 81, 87, 239, 104, 242, 58, 245, 243, 97, 62,
        241, 109, 189, 104, 243, 137, 170, 231, 54, 61, 169, 190, 107, 211, 115, 159, 233, 230,
        205, 108, 174, 121, 119, 88, 122, 114, 186, 93, 239, 151, 243, 131, 11, 82, 43, 79, 56,
        152, 245, 209, 240, 168, 34, 135, 34, 255, 135, 190, 241, 169, 192, 255, 165, 217, 99, 105,
        155, 254, 123, 79, 62, 165, 191, 19, 20, 5, 0, 0,
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
        31, 139, 8, 0, 0, 0, 0, 0, 0, 255, 165, 79, 201, 9, 0, 32, 12, 235, 229, 30, 238, 63, 165,
        130, 45, 84, 241, 209, 35, 80, 146, 71, 66, 26, 132, 131, 177, 143, 85, 139, 50, 41, 163,
        211, 230, 121, 49, 33, 4, 236, 230, 48, 153, 227, 184, 183, 61, 174, 154, 43, 143, 19, 72,
        254, 198, 174, 136, 224, 30, 108, 229, 242, 201, 45, 252, 105, 28, 217, 38, 2, 0, 0,
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
        31, 139, 8, 0, 0, 0, 0, 0, 0, 255, 181, 145, 61, 10, 131, 64, 16, 133, 231, 7, 60, 71, 202,
        164, 75, 200, 17, 66, 32, 85, 72, 153, 198, 206, 3, 136, 157, 165, 71, 16, 47, 224, 41, 68,
        143, 99, 103, 105, 99, 175, 226, 174, 174, 195, 194, 174, 133, 31, 60, 24, 134, 199, 236,
        188, 29, 134, 5, 86, 154, 9, 38, 225, 36, 130, 13, 84, 2, 221, 119, 153, 24, 4, 218, 120,
        1, 47, 144, 12, 239, 61, 250, 38, 237, 163, 188, 213, 191, 119, 149, 101, 255, 240, 250,
        236, 62, 105, 19, 231, 175, 118, 40, 122, 245, 152, 231, 220, 117, 81, 89, 163, 197, 199,
        176, 15, 168, 57, 154, 197, 244, 186, 178, 144, 255, 92, 10, 148, 159, 140, 189, 172, 71,
        144, 87, 146, 53, 139, 158, 237, 51, 206, 12, 141, 112, 236, 128, 174, 60, 54, 70, 126,
        172, 28, 127, 235, 2, 0, 0,
    ];
    assert_eq!(bytes, expected_serialization);
}

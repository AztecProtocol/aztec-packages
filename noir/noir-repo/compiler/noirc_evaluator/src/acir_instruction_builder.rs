use std::collections::BTreeSet;
use acvm::{
    acir::{
        circuit::{
            Circuit, ExpressionWidth,
            Program as AcirProgram, PublicInputs
        },
        native_types::Witness,
    },
    FieldElement,
};

use crate::ssa::ssa_gen::Ssa;
use crate::ssa::ir::map::Id;

use crate::ssa::{
    function_builder::FunctionBuilder,
    ir::{instruction::BinaryOp, types::Type},
};
use crate::brillig::Brillig;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
pub struct InstructionArtifacts {
    // name of used instruction
    pub instruction_name: String,

    // ssa represented as format string acir(inline) {...}
    pub formatted_ssa: String,

    // serde_json serialized ssa
    pub serialized_ssa: String,

    // bytes of acir program. Gzipped!!
    pub serialized_acir: Vec<u8>,
}

impl InstructionArtifacts {
    fn new_binary(op: BinaryOp, instruction_name: String) -> Self {
        let ssa = binary_function(op);
        let serialized_ssa = &serde_json::to_string(&ssa).unwrap();
        let formatted_ssa = format!("{}", ssa);

        let program = ssa_to_acir_program(ssa);
        let serialized_program = AcirProgram::serialize_program(&program);

        Self {
            instruction_name: instruction_name,
            formatted_ssa: formatted_ssa,
            serialized_ssa: serialized_ssa.to_string(),
            serialized_acir: serialized_program
        }
    }

    fn new_by_func(ssa_generate_function: fn() -> Ssa, instruction_name: String) -> Self {
        let ssa = ssa_generate_function();
        let serialized_ssa = &serde_json::to_string(&ssa).unwrap();
        let formatted_ssa = format!("{}", ssa);

        let program = ssa_to_acir_program(ssa);
        let serialized_program = AcirProgram::serialize_program(&program);

        Self {
            instruction_name: instruction_name,
            formatted_ssa: formatted_ssa,
            serialized_ssa: serialized_ssa.to_string(),
            serialized_acir: serialized_program
        }

    }

    fn new_constrain() -> Self {
        return Self::new_by_func(constrain_function, "Constrain".into())
    }

    fn new_not() -> Self {
        return Self::new_by_func(not_function, "Not".into())
    }

    fn new_range_check() -> Self {
        return Self::new_by_func(range_check_function, "RangeCheck".into())
    }

    fn new_truncate() -> Self {
        return Self::new_by_func(truncate_function, "Truncate".into())
    }
}

fn ssa_to_acir_program(ssa: Ssa) -> AcirProgram<FieldElement> {
    // third brillig names, fourth errors
    let (acir_functions, brillig, _, _) = ssa
        .into_acir(&Brillig::default(), ExpressionWidth::default())
        .expect("Should compile manually written SSA into ACIR");

    let mut functions: Vec<Circuit<FieldElement>> = Vec::new();
    // TODO refactor this...
    let public_vars: bool = true;

    for acir_func in acir_functions.iter() {
        let mut private_params: BTreeSet<Witness> = acir_func.input_witnesses.clone().into_iter().collect();
        let ret_values: BTreeSet<Witness> = acir_func.return_witnesses.clone().into_iter().collect();
        let circuit: Circuit<FieldElement>;
        if public_vars {
            circuit = Circuit {
                current_witness_index: acir_func.current_witness_index().witness_index(),
                opcodes: acir_func.opcodes().to_vec(),
                public_parameters: PublicInputs(private_params.clone()),
                return_values: PublicInputs(ret_values.clone()),
                ..Circuit::<FieldElement>::default()
            };
        } else {
            circuit = Circuit {
                current_witness_index: acir_func.current_witness_index().witness_index(),
                opcodes: acir_func.opcodes().to_vec(),
                private_parameters: private_params.clone(),
                ..Circuit::<FieldElement>::default()
            };
        }
        private_params.extend(ret_values.iter().cloned());
        functions.push(circuit);
    }
    return AcirProgram { functions: functions, unconstrained_functions: brillig };
}

fn binary_function(op: BinaryOp) -> Ssa {
    // returns v0 op v1
    let main_id = Id::new(0);
    let mut builder = FunctionBuilder::new("main".into(), main_id);
    let v0 = builder.add_parameter(Type::unsigned(16));

    // bit size of v1 differs, because shl shr max second argument 8 bit;
    let v1;
    // let three = builder.numeric_constant(3u128, Type::unsigned(8));

    if op == BinaryOp::Shl || op == BinaryOp::Shr {
        v1 = builder.add_parameter(Type::unsigned(8));
    } else {
        v1 = builder.add_parameter(Type::unsigned(16));
    }

    let v2 = builder.insert_binary(v0, op, v1);
    builder.terminate_with_return(vec![v2]);

    let func = builder.finish();
    // it doesnt remove bit shifts, it replaces it with something smart
    let cleared_func = func.remove_bit_shifts();
    return cleared_func;
}

fn constrain_function() -> Ssa {
    // constrains v0 == v1, returns v1
    let main_id = Id::new(0);
    let mut builder = FunctionBuilder::new("main".into(), main_id);

    let v0 = builder.add_parameter(Type::field());
    let v1 = builder.add_parameter(Type::field());
    builder.insert_constrain(v0, v1, None);
    builder.terminate_with_return(vec![v1]);

    return builder.finish()
}

fn not_function() -> Ssa {
    // returns not v0
    let main_id = Id::new(0);
    let mut builder = FunctionBuilder::new("main".into(), main_id);

    let v0 = builder.add_parameter(Type::unsigned(64));
    let v1 = builder.insert_not(v0);
    builder.terminate_with_return(vec![v1]);

    return builder.finish()
}

fn range_check_function() -> Ssa {
    // check v0: u64 limited by 64 bits ?..
    let main_id = Id::new(0);
    let mut builder = FunctionBuilder::new("main".into(), main_id);

    let v0 = builder.add_parameter(Type::field());
    builder.insert_range_check(v0, 64, Some("Range Check failed".to_string()));
    builder.terminate_with_return(vec![v0]);

    return builder.finish()
}

fn truncate_function() -> Ssa {
    // truncate v0: field 10, 20?..
    let main_id = Id::new(0);
    let mut builder = FunctionBuilder::new("main".into(), main_id);

    let v0 = builder.add_parameter(Type::field());
    let v1 = builder.insert_truncate(v0, 10, 20);
    builder.terminate_with_return(vec![v1]);

    return builder.finish()
}

pub fn all_instructions() -> Vec<InstructionArtifacts> {
    let mut artifacts: Vec<InstructionArtifacts> = Vec::new();

    artifacts.push(InstructionArtifacts::new_binary(BinaryOp::Add, "Binary::Add".into()));
    artifacts.push(InstructionArtifacts::new_binary(BinaryOp::Sub, "Binary::Sub".into()));
    artifacts.push(InstructionArtifacts::new_binary(BinaryOp::Mul, "Binary::Mul".into()));
    artifacts.push(InstructionArtifacts::new_binary(BinaryOp::Div, "Binary::Div".into()));

    // with field panic
    // panic on Mod Should compile manually written SSA into ACIR: InvalidRangeConstraint
    artifacts.push(InstructionArtifacts::new_binary(BinaryOp::Mod, "Binary::Mod".into()));

    artifacts.push(InstructionArtifacts::new_binary(BinaryOp::Eq, "Binary::Eq".into()));

    // with field panic
    // thread 'main' panicked at /home/defkit/work/noir/compiler/noirc_evaluator/src/ssa/acir_gen/acir_ir/acir_variable.rs:1225:9:
    // assertion failed: max_bits + 1 < F::max_num_bits()
    artifacts.push(InstructionArtifacts::new_binary(BinaryOp::Lt, "Binary::Lt".into()));

    artifacts.push(InstructionArtifacts::new_binary(BinaryOp::And, "Binary::And".into()));

    // with field
    // attempt to shift left with overflow
    artifacts.push(InstructionArtifacts::new_binary(BinaryOp::Or, "Binary::Or".into()));

    artifacts.push(InstructionArtifacts::new_binary(BinaryOp::Xor, "Binary::Xor".into()));

    artifacts.push(InstructionArtifacts::new_binary(BinaryOp::Shl, "Binary::Shl".into()));
    artifacts.push(InstructionArtifacts::new_binary(BinaryOp::Shr, "Binary::Shr".into()));

    // with field
    // attempt to shift left with overflow
    artifacts.push(InstructionArtifacts::new_not());

    artifacts.push(InstructionArtifacts::new_constrain());
    artifacts.push(InstructionArtifacts::new_range_check());
    artifacts.push(InstructionArtifacts::new_truncate());

    return artifacts;
}

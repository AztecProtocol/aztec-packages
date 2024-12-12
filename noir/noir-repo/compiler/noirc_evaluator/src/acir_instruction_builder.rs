use std::collections::BTreeSet;
use acvm::{
    acir::{
        circuit::{
            Circuit, ExpressionWidth,
            Program as AcirProgram
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

pub enum VariableType {
    Field, 
    Unsigned,
    Signed
}

pub struct Variable {
    pub variable_type: VariableType,
    // ignored on Field type
    pub variable_size: u32
}

impl InstructionArtifacts {
    fn get_type(variable: &Variable) -> Type {
        match variable.variable_type {
            VariableType::Field => Type::field(),
            VariableType::Signed => Type::signed(variable.variable_size),
            VariableType::Unsigned => Type::unsigned(variable.variable_size)
        }
    }

    fn new_binary(op: BinaryOp, instruction_name: String, first_variable: &Variable, second_variable: &Variable) -> Self {
        let first_variable_type = Self::get_type(first_variable);
        let second_variable_type = Self::get_type(second_variable);
        let ssa = binary_function(op, first_variable_type, second_variable_type);
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

    fn new_by_func(ssa_generate_function: fn(Type) -> Ssa, instruction_name: String, variable: &Variable) -> Self {
        let variable_type = Self::get_type(variable);
        let ssa = ssa_generate_function(variable_type);
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

    pub fn new_constrain(variable: &Variable) -> Self {
        return Self::new_by_func(constrain_function, "Constrain".into(), variable)
    }

    pub fn new_not(variable: &Variable) -> Self {
        return Self::new_by_func(not_function, "Not".into(), variable)
    }

    pub fn new_range_check(variable: &Variable) -> Self {
        return Self::new_by_func(range_check_function, "RangeCheck".into(), variable)
    }

    pub fn new_truncate(variable: &Variable) -> Self {
        return Self::new_by_func(truncate_function, "Truncate".into(), variable)
    }

    pub fn new_add(first_variable: &Variable, second_variable: &Variable) -> Self {
        return Self::new_binary(BinaryOp::Add, "Binary::Add".into(), first_variable, second_variable);
    }

    pub fn new_sub(first_variable: &Variable, second_variable: &Variable) -> Self {
        return Self::new_binary(BinaryOp::Sub, "Binary::Sub".into(), first_variable, second_variable);
    }

    pub fn new_xor(first_variable: &Variable, second_variable: &Variable) -> Self {
        return Self::new_binary(BinaryOp::Xor, "Binary::Xor".into(), first_variable, second_variable);
    }

    pub fn new_and(first_variable: &Variable, second_variable: &Variable) -> Self {
        return Self::new_binary(BinaryOp::And, "Binary::And".into(), first_variable, second_variable);
    }

    pub fn new_or(first_variable: &Variable, second_variable: &Variable) -> Self {
        return Self::new_binary(BinaryOp::Or, "Binary::Or".into(), first_variable, second_variable);
    }

    pub fn new_lt(first_variable: &Variable, second_variable: &Variable) -> Self {
        return Self::new_binary(BinaryOp::Lt, "Binary::Lt".into(), first_variable, second_variable);
    }

    pub fn new_eq(first_variable: &Variable, second_variable: &Variable) -> Self {
        return Self::new_binary(BinaryOp::Eq, "Binary::Eq".into(), first_variable, second_variable);
    }

    pub fn new_mod(first_variable: &Variable, second_variable: &Variable) -> Self {
        return Self::new_binary(BinaryOp::Mod, "Binary::Mod".into(), first_variable, second_variable);
    }

    pub fn new_mul(first_variable: &Variable, second_variable: &Variable) -> Self {
        return Self::new_binary(BinaryOp::Mul, "Binary::Mul".into(), first_variable, second_variable);
    }

    pub fn new_div(first_variable: &Variable, second_variable: &Variable) -> Self {
        return Self::new_binary(BinaryOp::Div, "Binary::Div".into(), first_variable, second_variable);
    }

    pub fn new_shl(first_variable: &Variable, second_variable: &Variable) -> Self {
        return Self::new_binary(BinaryOp::Shl, "Binary::Shl".into(), first_variable, second_variable);
    }

    pub fn new_shr(first_variable: &Variable, second_variable: &Variable) -> Self {
        return Self::new_binary(BinaryOp::Shr, "Binary::Shr".into(), first_variable, second_variable);
    }
}

fn ssa_to_acir_program(ssa: Ssa) -> AcirProgram<FieldElement> {
    // third brillig names, fourth errors
    let (acir_functions, brillig, _, _) = ssa
        .into_acir(&Brillig::default(), ExpressionWidth::default())
        .expect("Should compile manually written SSA into ACIR");

    let mut functions: Vec<Circuit<FieldElement>> = Vec::new();

    for acir_func in acir_functions.iter() {
        let mut private_params: BTreeSet<Witness> = acir_func.input_witnesses.clone().into_iter().collect();
        let ret_values: BTreeSet<Witness> = acir_func.return_witnesses.clone().into_iter().collect();
        let circuit: Circuit<FieldElement>;
        private_params.extend(ret_values.iter().cloned());
        circuit = Circuit {
            current_witness_index: acir_func.current_witness_index().witness_index(),
            opcodes: acir_func.opcodes().to_vec(),
            private_parameters: private_params.clone(),
            ..Circuit::<FieldElement>::default()
        };
        functions.push(circuit);
    }
    return AcirProgram { functions: functions, unconstrained_functions: brillig };
}

fn binary_function(op: BinaryOp, first_variable_type: Type, second_variable_type: Type) -> Ssa {
    // returns v0 op v1
    let main_id = Id::new(0);
    let mut builder = FunctionBuilder::new("main".into(), main_id);
    let v0 = builder.add_parameter(first_variable_type);
    let v1 = builder.add_parameter(second_variable_type);
    let v2 = builder.insert_binary(v0, op, v1);
    builder.terminate_with_return(vec![v2]);

    let func = builder.finish();
    // remove_bit_shifts doesnt remove bit shifts, it replaces it with something smart
    let cleared_func = func.remove_bit_shifts();
    return cleared_func;
}

fn constrain_function(variable_type: Type) -> Ssa {
    // constrains v0 == v1, returns v1
    let main_id = Id::new(0);
    let mut builder = FunctionBuilder::new("main".into(), main_id);

    let v0 = builder.add_parameter(variable_type.clone());
    let v1 = builder.add_parameter(variable_type);
    builder.insert_constrain(v0, v1, None);
    builder.terminate_with_return(vec![v1]);

    return builder.finish();
}

fn range_check_function(variable_type: Type) -> Ssa {
    let main_id = Id::new(0);
    let mut builder = FunctionBuilder::new("main".into(), main_id);

    let v0 = builder.add_parameter(variable_type);
    builder.insert_range_check(v0, 64, Some("Range Check failed".to_string()));
    builder.terminate_with_return(vec![v0]);

    return builder.finish()
}

fn truncate_function(variable_type: Type) -> Ssa {
    // truncate v0: field 10, 20?..
    let main_id = Id::new(0);
    let mut builder = FunctionBuilder::new("main".into(), main_id);

    let v0 = builder.add_parameter(variable_type);
    let v1 = builder.insert_truncate(v0, 10, 20);
    builder.terminate_with_return(vec![v1]);

    return builder.finish();
}

fn not_function(variable_type: Type) -> Ssa {
    // returns not v0
    let main_id = Id::new(0);
    let mut builder = FunctionBuilder::new("main".into(), main_id);

    let v0 = builder.add_parameter(variable_type);
    let v1 = builder.insert_not(v0);
    builder.terminate_with_return(vec![v1]);

    return builder.finish()
}

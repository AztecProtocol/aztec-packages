use::noirc_evaluator::acir_instruction_builder::{
    all_instructions, InstructionArtifacts
};


fn main() {
    let all_artifacts: Vec<InstructionArtifacts> = all_instructions();

    for artifacts in all_artifacts.iter() {
        println!("============{}==============", artifacts.instruction_name);
        println!("{:?}", artifacts.serialized_acir);
        // println!("{}", artifacts.serialized_ssa);
        // println!("Acir length: {:?}", artifacts.serialized_acir.len());
        // let artifacts_serialized = serde_json::to_string(&artifacts).unwrap();
        // println!("{}", artifacts_serialized);
    }
}


use std::fs::File;
use std::io::Write;
use std::io::Read;
use std::path::Path;
use flate2::read::GzDecoder;
use::noirc_evaluator::acir_instruction_builder::{
    InstructionArtifacts, VariableType, Variable
};

fn ungzip(compressed_data: Vec<u8>) -> Vec<u8> {
    let mut decompressed_data: Vec<u8> = Vec::new();
    let mut decoder = GzDecoder::new(&compressed_data[..]);
    decoder.read_to_end(&mut decompressed_data).unwrap();
    return decompressed_data;
}

fn save_to_file(data: &[u8], filename: &str) -> Result<(), std::io::Error> {
    let path = Path::new(filename);
    let mut file = File::create(path)?;
    file.write_all(data)?;
    Ok(())
}

fn save_artifacts(all_artifacts: Vec<InstructionArtifacts>) {
    for artifacts in all_artifacts.iter() {
        println!("{}", artifacts.formatted_ssa);
        let filename = format!("artifacts/{}{}", artifacts.instruction_name, ".acir");
        let acir = &artifacts.serialized_acir;
        match save_to_file(&ungzip(acir.clone()), &filename) {
            Ok(_) => (),
            Err(error) => println!("Error saving data: {}", error),
        }
    }
}

fn main() {
    let mut all_artifacts: Vec<InstructionArtifacts> = Vec::new();
    let u64_var = Variable{ variable_type: VariableType::Unsigned, variable_size: 32};
    let u8_var = Variable{ variable_type: VariableType::Unsigned, variable_size: 8};
    all_artifacts.push(InstructionArtifacts::new_add(&u64_var, &u64_var));
    all_artifacts.push(InstructionArtifacts::new_sub(&u64_var, &u64_var));
    all_artifacts.push(InstructionArtifacts::new_mul(&u64_var, &u64_var));
    all_artifacts.push(InstructionArtifacts::new_mod(&u64_var, &u64_var));
    all_artifacts.push(InstructionArtifacts::new_xor(&u64_var, &u64_var));
    all_artifacts.push(InstructionArtifacts::new_and(&u64_var, &u64_var));
    all_artifacts.push(InstructionArtifacts::new_div(&u64_var, &u64_var));
    all_artifacts.push(InstructionArtifacts::new_eq(&u64_var, &u64_var));
    all_artifacts.push(InstructionArtifacts::new_lt(&u64_var, &u64_var));
    all_artifacts.push(InstructionArtifacts::new_and(&u64_var, &u64_var));
    all_artifacts.push(InstructionArtifacts::new_xor(&u64_var, &u64_var));
    all_artifacts.push(InstructionArtifacts::new_or(&u64_var, &u64_var));
    all_artifacts.push(InstructionArtifacts::new_shl(&u64_var, &u8_var));
    all_artifacts.push(InstructionArtifacts::new_shr(&u64_var, &u8_var));
    all_artifacts.push(InstructionArtifacts::new_not(&u64_var));
    all_artifacts.push(InstructionArtifacts::new_constrain(&u64_var));
    all_artifacts.push(InstructionArtifacts::new_truncate(&u64_var));
    all_artifacts.push(InstructionArtifacts::new_range_check(&u64_var));
    save_artifacts(all_artifacts);
}

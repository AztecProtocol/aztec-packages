use std::fs::File;
use std::io::Write;
use std::path::Path;
use::noirc_evaluator::acir_instruction_builder::{
    all_instructions, InstructionArtifacts
};

fn save_to_file(data: &[u8], filename: &str) -> Result<(), std::io::Error> {
    let path = Path::new(filename);
    let mut file = File::create(path)?;
    file.write_all(data)?;
    Ok(())
}

fn main() {
    let all_artifacts: Vec<InstructionArtifacts> = all_instructions();

    for artifacts in all_artifacts.iter() {
        println!("{}", artifacts.formatted_ssa);
        let filename = format!("artifacts/{}{}", artifacts.instruction_name, ".acir");
        match save_to_file(&artifacts.serialized_acir, &filename) {
            Ok(_) => (),
            Err(error) => println!("Error saving data: {}", error),
        }
    }
}

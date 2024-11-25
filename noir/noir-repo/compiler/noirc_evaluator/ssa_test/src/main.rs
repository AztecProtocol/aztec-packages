use std::fs::File;
use std::io::Write;
use std::io::Read;
use std::path::Path;
use flate2::read::GzDecoder;
use::noirc_evaluator::acir_instruction_builder::{
    all_instructions, InstructionArtifacts
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

fn main() {
    let all_artifacts: Vec<InstructionArtifacts> = all_instructions();

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

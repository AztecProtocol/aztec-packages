use std::{io, path::Path};

use bb_pil_backend::{audit_metadata::export_audit_metadata, checks::check, vm_builder::analyzed_to_cpp};
use clap::Parser;
use powdr_ast::analyzed::Analyzed;
use powdr_number::Bn254Field;
use powdr_pil_analyzer::analyze_file;

#[derive(Parser)]
#[command(name = "bb-pil-cli", author, version, about, long_about = None)]
struct Cli {
    /// Input file
    file: String,

    /// Output directory for the generated files
    #[arg(short, long)]
    output_directory: Option<String>,

    /// BBerg: Name of the VM
    #[arg(long)]
    name: Option<String>,

    /// Delete the output directory if it already exists
    #[arg(short, long)]
    #[arg(default_value_t = false)]
    yes: bool,

    /// Emit audit metadata JSON to the given path (skips C++ generation)
    #[arg(long)]
    emit_audit_metadata: Option<String>,
}

fn main() -> Result<(), io::Error> {
    let args = Cli::parse();

    let file_name = args.file;
    println!("Analyzing PIL file: {}", file_name);
    let analyzed: Analyzed<Bn254Field> = analyze_file(Path::new(&file_name));

    // Skip checks when only emitting audit metadata — the metadata export is
    // purely structural and works fine on PIL that has isolated columns (e.g.
    // older commits where columns hadn't been wired up yet).
    if let Some(metadata_path) = args.emit_audit_metadata {
        let metadata = export_audit_metadata(&analyzed);
        let json = serde_json::to_string_pretty(&metadata)
            .expect("Failed to serialize audit metadata");
        std::fs::write(&metadata_path, json)?;
        println!("Audit metadata written to: {}", metadata_path);
        return Ok(());
    }

    if let Err(e) = check(&analyzed) {
        eprintln!("Error: {}", e);
        panic!("Error: {}", e);
    }

    let name = args.name.expect("--name is required for C++ generation");
    analyzed_to_cpp(&analyzed, args.output_directory.as_deref(), &name, args.yes);

    Ok(())
}

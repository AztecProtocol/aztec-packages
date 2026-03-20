use std::{io, path::Path};

use bb_pil_backend::{analysis::analyze, checks::check, vm_builder::analyzed_to_cpp};
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

    /// Run PIL analysis and emit JSON (to stdout, or to file with --analyze-output)
    #[arg(long)]
    analyze: bool,

    /// Output path for analysis JSON (requires --analyze)
    #[arg(long)]
    analyze_output: Option<String>,
}

fn main() -> Result<(), io::Error> {
    let args = Cli::parse();

    let file_name = args.file;
    eprintln!("Analyzing PIL file: {}", file_name);
    let analyzed: Analyzed<Bn254Field> = analyze_file(Path::new(&file_name));

    // Skip checks when running analysis — the analysis is purely structural
    // and works fine on PIL that has isolated columns.
    if args.analyze {
        let output = analyze(&analyzed);
        let json = serde_json::to_string_pretty(&output)
            .expect("Failed to serialize analysis output");
        if let Some(path) = args.analyze_output {
            std::fs::write(&path, &json)?;
            eprintln!("Analysis written to: {}", path);
        } else {
            println!("{}", json);
        }
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

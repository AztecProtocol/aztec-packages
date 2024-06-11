use std::collections::HashMap;
use std::io::BufWriter;
use std::path::Path;
use std::process::Command;

use clap::Args;
use codespan_reporting::files::Files;
use color_eyre::eyre::{self};
use inferno::flamegraph::{from_lines, Options};
use serde::{Deserialize, Serialize};

use acir::circuit::OpcodeLocation;
use nargo::artifacts::program::ProgramArtifact;
use nargo::errors::Location;

#[derive(Debug, Clone, Args)]
pub(crate) struct CreateFlamegraphCommand {
    /// The path to the artifact JSON file
    #[clap(long, short)]
    artifact_path: String,

    /// Path to the noir backend binary
    #[clap(long, short)]
    backend_path: String,

    /// The output folder for the flamegraph svg files
    #[clap(long, short)]
    output: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct BBGatesReport {
    acir_opcodes: usize,
    circuit_size: usize,
    gates_per_opcode: Vec<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct BBGatesResponse {
    functions: Vec<BBGatesReport>,
}

struct FoldedStackItem {
    total_gates: usize,
    nested_items: HashMap<String, FoldedStackItem>,
}

pub(crate) fn run(args: CreateFlamegraphCommand) -> eyre::Result<()> {
    let program = read_program_from_file(&args.artifact_path)?;
    let bb_gates_response = Command::new(args.backend_path)
        .arg("gates")
        .arg("-b")
        .arg(&args.artifact_path)
        .output()
        .expect("failed to execute process");

    // Parse the bb gates stdout as json
    let bb_gates_response: BBGatesResponse = serde_json::from_slice(&bb_gates_response.stdout)?;

    for (func_idx, func_gates) in bb_gates_response.functions.into_iter().enumerate() {
        let mut folded_stack_items = HashMap::new();

        println!(
            "Total gates in the {} opcodes {} of total gates {}",
            func_gates.acir_opcodes,
            func_gates.gates_per_opcode.iter().sum::<usize>(),
            func_gates.circuit_size
        );

        func_gates.gates_per_opcode.into_iter().enumerate().for_each(|(opcode_index, gates)| {
            let call_stack = &program.debug_symbols.debug_infos[func_idx]
                .locations
                .get(&OpcodeLocation::Acir(opcode_index));
            let location_names = if let Some(call_stack) = call_stack {
                call_stack
                    .iter()
                    .map(|location| location_to_callsite_label(*location, &program))
                    .collect::<Vec<String>>()
            } else {
                // println!(
                //     "No call stack found for opcode {} with index {}",
                //     program.bytecode.functions[func_idx].opcodes[opcode_index], opcode_index
                // );
                vec!["unknown".to_string()]
            };

            add_locations_to_folded_stack_items(&mut folded_stack_items, location_names, gates);
        });

        let output_path =
            Path::new(&args.output).join(Path::new(&format!("{}.svg", &program.names[func_idx])));
        let flamegraph_file = std::fs::File::create(output_path)?;

        let flamegraph_writer = BufWriter::new(flamegraph_file);

        let folded_lines = to_folded_sorted_lines(&folded_stack_items, Default::default());

        let mut options = Options::default();
        options.hash = true;
        options.deterministic = true;
        options.title = format!("{}-{}", &args.artifact_path, program.names[func_idx].clone());
        options.subtitle = Some("Sample = Gate".to_string());
        options.frame_height = 24;
        options.color_diffusion = true;

        from_lines(
            &mut options,
            folded_lines.iter().map(|as_string| as_string.as_str()),
            flamegraph_writer,
        )?;
    }

    Ok(())
}

pub(crate) fn read_program_from_file<P: AsRef<Path>>(
    circuit_path: P,
) -> eyre::Result<ProgramArtifact> {
    let file_path = circuit_path.as_ref().with_extension("json");

    let input_string = std::fs::read(file_path)?;
    let program = serde_json::from_slice(&input_string)?;

    Ok(program)
}

fn location_to_callsite_label<'files>(
    location: Location,
    files: &'files impl Files<'files, FileId = fm::FileId>,
) -> String {
    let filename = Path::new(&files.name(location.file).expect("should get file path").to_string())
        .file_name()
        .map(|os_str| os_str.to_string_lossy().to_string())
        .unwrap_or("unknown".to_string());
    let source = files.source(location.file).expect("should get file source");

    let code_slice = source
        .as_ref()
        .chars()
        .skip(location.span.start() as usize)
        .take(location.span.end() as usize - location.span.start() as usize)
        .collect::<String>();

    let (line, column) = line_and_column_from_span(source.as_ref(), location.span.start());

    format!("{}:{}:{}::{}", filename, line, column, code_slice)
}

fn line_and_column_from_span(source: &str, span_start: u32) -> (u32, u32) {
    let mut line = 1;
    let mut column = 0;

    for (i, char) in source.chars().enumerate() {
        column += 1;

        if char == '\n' {
            line += 1;
            column = 0;
        }

        if span_start <= i as u32 {
            break;
        }
    }

    (line, column)
}

fn add_locations_to_folded_stack_items(
    stack_items: &mut HashMap<String, FoldedStackItem>,
    locations: Vec<String>,
    gates: usize,
) {
    let mut child_map = stack_items;
    for (index, location) in locations.iter().enumerate() {
        let current_item = child_map
            .entry(location.clone())
            .or_insert(FoldedStackItem { total_gates: 0, nested_items: HashMap::new() });

        child_map = &mut current_item.nested_items;

        if index == locations.len() - 1 {
            current_item.total_gates += gates;
        }
    }
}

fn to_folded_sorted_lines(
    folded_stack_items: &HashMap<String, FoldedStackItem>,
    parent_stacks: im::Vector<String>,
) -> Vec<String> {
    folded_stack_items
        .iter()
        .flat_map(move |(location, folded_stack_item)| {
            let frame_list: Vec<String> =
                parent_stacks.iter().cloned().chain(std::iter::once(location.clone())).collect();
            let line: String =
                format!("{} {}", frame_list.join(";"), folded_stack_item.total_gates);

            let mut new_parent_stacks = parent_stacks.clone();
            new_parent_stacks.push_back(location.clone());

            let child_lines: Vec<String> =
                to_folded_sorted_lines(&folded_stack_item.nested_items, new_parent_stacks);

            std::iter::once(line).chain(child_lines)
        })
        .collect()
}

use acir::circuit::OpcodeLocation;
use clap::Args;
use codespan_reporting::files::Files;
use nargo::errors::Location;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::BufWriter;
use std::path::Path;
use std::process::Command;

use inferno::flamegraph::{from_lines, Options};
use nargo::artifacts::program::ProgramArtifact;

#[derive(Debug, Clone, Args)]
pub(crate) struct CreateFlamegraphCommand {
    /// The path to the artifact file
    #[clap(long, short)]
    artifact_path: String,

    /// Path to the binary of noir's backend
    #[clap(long, short)]
    backend_path: String,

    /// The output file for the flamegraph
    #[clap(long, short)]
    output: String,
}

pub(crate) fn read_program_from_file<P: AsRef<Path>>(
    circuit_path: P,
) -> Result<ProgramArtifact, String> {
    let file_path = circuit_path.as_ref().with_extension("json");

    let input_string = std::fs::read(&file_path).map_err(|err| err.to_string())?;
    let program = serde_json::from_slice(&input_string).map_err(|err| err.to_string())?;

    Ok(program)
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

fn read_location<'files>(
    location: Location,
    files: &'files impl Files<'files, FileId = fm::FileId>,
) -> String {
    let path = files.name(location.file).expect("should get file path");
    let source = files.source(location.file).expect("should get file source");

    let code_slice = source
        .as_ref()
        .chars()
        .skip(location.span.start() as usize)
        .take(location.span.end() as usize - location.span.start() as usize)
        .collect::<String>();

    let (line, column) = line_and_column_from_span(source.as_ref(), location.span.start());

    format!("{}", code_slice)
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

struct FoldedStackItem {
    total_gates: usize,
    nested_items: HashMap<String, FoldedStackItem>,
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

fn to_folded_lines(
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
                to_folded_lines(&folded_stack_item.nested_items, new_parent_stacks);

            std::iter::once(line).chain(child_lines.into_iter())
        })
        .collect()
}

pub(crate) fn run(args: CreateFlamegraphCommand) -> Result<(), String> {
    let program = read_program_from_file(&args.artifact_path)?;
    // println!("Got program");
    let bb_gates_response = Command::new(args.backend_path)
        .arg("gates")
        .arg("-b")
        .arg(&args.artifact_path)
        .output()
        .expect("failed to execute process");
    println!("BB gates raw response {:?}", bb_gates_response);

    println!("BB gates response {}", String::from_utf8(bb_gates_response.stdout.clone()).unwrap());
    // Parse the bb gates stdout as json
    let bb_gates_response: BBGatesResponse =
        serde_json::from_slice(&bb_gates_response.stdout).map_err(|err| err.to_string())?;

    // Consume first
    let gates: BBGatesReport = bb_gates_response.functions.into_iter().next().unwrap();

    let mut folded_stack_items = HashMap::new();

    gates.gates_per_opcode.iter().enumerate().for_each(|(opcode_idx, gate_count)| {
        if *gate_count > 1000000 {
            let opcode = &program.bytecode.functions[0].opcodes[opcode_idx];
            println!("PROBLEM {}", opcode);
        }
    });

    println!("GONNA PRINT TOTAL GATES");
    println!("Total gates {}", gates.gates_per_opcode.iter().sum::<usize>());
    println!("GONNA PRINT TOTAL GATES");

    gates.gates_per_opcode.into_iter().enumerate().for_each(|(opcode_index, gates)| {
        let call_stack = &program.debug_symbols.debug_infos[0]
            .locations
            .get(&OpcodeLocation::Acir(opcode_index));
        let location_names = if let Some(call_stack) = call_stack {
            call_stack
                .iter()
                .map(|location| read_location(*location, &program))
                .collect::<Vec<String>>()
        } else {
            vec!["unknown".to_string()]
        };

        add_locations_to_folded_stack_items(&mut folded_stack_items, location_names, gates);
    });

    // println!("writing flamegraph to {:?}", args.output);
    let flamegraph_file = std::fs::File::create(&args.output).map_err(|err| err.to_string())?;

    let flamegraph_writer = BufWriter::new(flamegraph_file);

    let folded_lines = to_folded_lines(&folded_stack_items, Default::default());
    // println!("folded lines {}", folded_lines.join("\n"));

    let mut options = Options::default();
    options.hash = true;
    options.deterministic = true;
    options.title = format!("{}-{}", &args.artifact_path, program.names[0].clone());
    options.subtitle = Some("Sample = Gate".to_string());
    options.frame_height = 24;
    options.color_diffusion = true;

    from_lines(
        &mut options,
        folded_lines.iter().map(|as_string| as_string.as_str()),
        flamegraph_writer,
    )
    .map_err(|err| err.to_string())?;

    Ok(())
}

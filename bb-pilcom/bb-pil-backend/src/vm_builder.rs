use crate::file_writer::BBFiles;
use crate::flavor_builder::FlavorBuilder;
use crate::lookup_builder::{
    get_counts_from_lookups, get_inverses_from_lookups, Lookup, LookupBuilder,
};
use crate::permutation_builder::{get_inverses_from_permutations, Permutation, PermutationBuilder};
use crate::relation_builder::{get_shifted_polys, RelationBuilder};
use crate::utils::{flatten, sanitize_name, snake_case, sort_cols};
use powdr_ast::analyzed::{Analyzed, Symbol};

use dialoguer::Confirm;
use itertools::Itertools;
use powdr_number::FieldElement;

/// All of the combinations of columns that are used in a bberg flavor file
struct ColumnGroups {
    /// fixed or constant columns in pil -> will be found in vk
    fixed: Vec<String>,
    /// witness or commit columns in pil -> will be found in proof
    witness: Vec<String>,
    /// witness or commit columns in pil, with out the inverse columns
    witnesses_without_inverses: Vec<String>,
    /// fixed + witness columns with lookup inverses
    all_cols: Vec<String>,
    /// Columns that will not be shifted
    unshifted: Vec<String>,
    /// Columns that will be shifted
    to_be_shifted: Vec<String>,
    /// The shifts of the columns that will be shifted
    shifted: Vec<String>,
    /// fixed + witness + shifted
    all_cols_with_shifts: Vec<String>,
    /// Inverses from lookups and permutations
    inverses: Vec<String>,
}

/// Analyzed to cpp
///
/// Converts an analyzed pil AST into a set of cpp files that can be used to generate a proof
pub fn analyzed_to_cpp<F: FieldElement>(
    analyzed: &Analyzed<F>,
    generated_dir: Option<&str>,
    vm_name: &str,
    delete_dir: bool,
) {
    let mut bb_files = BBFiles::new(&snake_case(&vm_name), generated_dir, None);

    // Remove the generated directory if it exists.
    // Pass `-y` as parameter if you want to skip the confirmation prompt.
    let confirmation = delete_dir
        || Confirm::new()
            .with_prompt(format!("Going to remove: {}. OK?", bb_files.base_dir))
            .default(true)
            .interact()
            .unwrap();
    if confirmation {
        println!("Removing generated directory: {}", bb_files.base_dir);
        bb_files.remove_generated_dir();
    }

    // ----------------------- Handle Standard Relation Identities -----------------------
    let relations = bb_files.create_relations(vm_name, analyzed);

    // ----------------------- Handle Lookup / Permutation Relation Identities -----------------------
    let permutations = bb_files.create_permutation_files(analyzed, vm_name);
    let lookups = bb_files.create_lookup_files(analyzed, vm_name);
    let lookup_and_permutations_names = sort_cols(&flatten(&[
        permutations.iter().map(|p| p.name.clone()).collect_vec(),
        lookups.iter().map(|l| l.name.clone()).collect_vec(),
    ]));

    // Collect all column names
    let ColumnGroups {
        fixed,
        witness,
        witnesses_without_inverses,
        all_cols,
        unshifted: _unshifted,
        to_be_shifted,
        shifted,
        all_cols_with_shifts,
        inverses,
    } = get_all_col_names(analyzed, &permutations, &lookups);

    let lookup_and_perm_file_names = lookups
        .iter()
        .map(|l| l.file_name.clone())
        .chain(permutations.iter().map(|p| p.file_name.clone()))
        .unique()
        .sorted()
        .collect_vec();

    // ----------------------- Create the flavor files -----------------------
    bb_files.create_flavor_variables_hpp(
        vm_name,
        &relations,
        &inverses,
        &lookup_and_permutations_names,
        &lookup_and_perm_file_names,
        &fixed,
        &witness,
        &witnesses_without_inverses,
        &all_cols,
        &to_be_shifted,
        &shifted,
        &all_cols_with_shifts,
    );

    bb_files.create_columns_hpp(
        vm_name,
        &lookup_and_permutations_names,
        &inverses,
        &fixed,
        &witness,
        &witnesses_without_inverses,
        &all_cols,
        &to_be_shifted,
        &shifted,
        &all_cols_with_shifts,
    );

    println!("Done with generation.");
}

fn get_all_col_names<F: FieldElement>(
    analyzed: &Analyzed<F>,
    permutations: &[Permutation],
    lookups: &[Lookup],
) -> ColumnGroups {
    // lambda to expand a symbol with length to symbol_0_, symbol_1_, ...
    // this makes it match the naming used when indexing into arrays
    let expand_symbol = |sym: &Symbol| {
        if sym.length.is_some() {
            (0..sym.length.unwrap())
                .map(move |i| format!("{}_{}_", sym.absolute_name, i))
                .collect_vec()
        } else {
            vec![sym.absolute_name.clone()]
        }
    };
    let constant = sort_cols(
        &analyzed
            .constant_polys_in_source_order()
            .iter()
            .flat_map(|(sym, _)| expand_symbol(sym))
            .map(|name| sanitize_name(name.as_str()))
            .collect_vec(),
    );
    let committed = sort_cols(
        &analyzed
            .committed_polys_in_source_order()
            .iter()
            .flat_map(|(sym, _)| expand_symbol(sym))
            .map(|name| sanitize_name(name.as_str()))
            .collect_vec(),
    );
    let public = analyzed
        .public_polys_in_source_order()
        .iter()
        .flat_map(|(sym, _)| expand_symbol(sym))
        .map(|name| sanitize_name(name.as_str()))
        .collect_vec();
    let to_be_shifted = sort_cols(
        &get_shifted_polys(
            analyzed
                .identities_with_inlined_intermediate_polynomials()
                .iter()
                .map(|i| i.left.selector.clone().unwrap())
                .collect_vec(),
        )
        .iter()
        .map(|name| sanitize_name(name.as_str()))
        .collect_vec(),
    );
    let shifted = to_be_shifted
        .iter()
        .map(|name| format!("{}_shift", name))
        .collect_vec();

    let inverses = flatten(&[
        get_inverses_from_permutations(permutations),
        get_inverses_from_lookups(lookups),
    ]);
    let lookup_counts = get_counts_from_lookups(lookups);

    let witnesses_without_inverses =
        flatten(&[public.clone(), committed.clone(), lookup_counts.clone()]);
    let witnesses_with_inverses = flatten(&[
        public.clone(),
        committed.clone(),
        inverses.clone(),
        lookup_counts,
    ]);

    // Group columns by properties
    let all_cols = flatten(&[constant.clone(), witnesses_with_inverses.clone()]);
    let unshifted = flatten(&[constant.clone(), witnesses_with_inverses.clone()])
        .into_iter()
        .filter(|name| !shifted.contains(name))
        .collect_vec();
    let all_cols_with_shifts = flatten(&[
        constant.clone(),
        witnesses_with_inverses.clone(),
        shifted.clone(),
    ]);

    ColumnGroups {
        fixed: constant,
        witness: witnesses_with_inverses,
        witnesses_without_inverses: witnesses_without_inverses,
        all_cols: all_cols,
        unshifted: unshifted,
        to_be_shifted: to_be_shifted,
        shifted: shifted,
        all_cols_with_shifts: all_cols_with_shifts,
        inverses: inverses,
    }
}

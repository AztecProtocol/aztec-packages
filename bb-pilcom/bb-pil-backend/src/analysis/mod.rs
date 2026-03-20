mod blocks;
mod classify;
mod columns;
mod complexity;
mod dependency;
pub(crate) mod helpers;
mod identities;
mod selectors;
#[cfg(test)]
mod tests;
pub mod types;

use types::*;

use powdr_ast::analyzed::{Analyzed, IdentityKind};
use powdr_number::{FieldElement, LargeInt};
use std::collections::{BTreeMap, HashSet};

/// Analyze the PIL IR and produce a full analysis output.
pub fn analyze<F: FieldElement>(analyzed: &Analyzed<F>) -> AnalysisOutput {
    // 1. Build metadata
    let metadata = build_metadata(analyzed);

    // 2. Build columns and namespace scaffolding
    let (mut namespaces, _shifted_columns) = columns::build_columns(analyzed);

    // 3. Build identities, constraints, and cross-namespace connections
    let identity_result = identities::build_identities(analyzed, &mut namespaces);

    // 4. Classify all identities
    let boolean_cols: HashSet<String> = namespaces
        .values()
        .flat_map(|ns| ns.columns.iter())
        .filter(|c| c.is_boolean)
        .map(|c| c.name.clone())
        .collect();

    let inlined = analyzed.identities_with_inlined_intermediate_polynomials();
    let classifications =
        classify::classify_all(&analyzed.identities, &inlined, &boolean_cols);

    // Write classifications into constraint catalog
    for (_ns, ns_info) in &mut namespaces {
        for constraint in &mut ns_info.constraints {
            if let Some(labels) = classifications.get(&constraint.identity_id) {
                constraint.classifications = labels.clone();
            }
        }
    }

    // 5. Build selectors
    selectors::build_selectors(analyzed, &mut namespaces);

    // 6. Compute complexity
    complexity::compute_complexity(&mut namespaces);

    // 7. Build dependency graph
    let dependency_graph = dependency::build_dependency_graph(analyzed);

    // 8. Detect block structure
    blocks::detect_blocks(&mut namespaces);

    // 9. Diagnostics: unreferenced committed columns
    let diagnostics = build_diagnostics(&namespaces);

    // 10. Sort source_files after all identity processing
    for (_ns, info) in &mut namespaces {
        info.source_files.sort();
        info.source_files.dedup();
    }

    AnalysisOutput {
        schema_version: "1.0".to_string(),
        metadata,
        namespaces,
        cross_namespace_connections: identity_result.connections,
        dependency_graph,
        diagnostics,
    }
}

fn build_metadata<F: FieldElement>(analyzed: &Analyzed<F>) -> PilMetadata {
    let modulus = F::modulus().to_arbitrary_integer();
    let field_modulus = format!("0x{:x}", modulus);

    let committed = analyzed.commitment_count();
    let constant = analyzed.constant_count();
    let intermediate = analyzed.intermediate_count();

    let total_constraints = analyzed.identities.len();
    let total_lookups = analyzed
        .identities
        .iter()
        .filter(|id| id.kind == IdentityKind::Plookup)
        .count();
    let total_permutations = analyzed
        .identities
        .iter()
        .filter(|id| id.kind == IdentityKind::Permutation)
        .count();

    PilMetadata {
        field_modulus,
        total_columns: ColumnCounts {
            committed,
            constant,
            intermediate,
        },
        total_constraints,
        total_lookups,
        total_permutations,
    }
}

fn build_diagnostics(namespaces: &BTreeMap<String, NamespaceAnalysis>) -> Vec<Diagnostic> {
    let mut diagnostics = Vec::new();

    for (_ns, ns_info) in namespaces {
        for col in &ns_info.columns {
            if col.kind == "committed" && col.referenced_by_identities.is_empty() {
                diagnostics.push(Diagnostic {
                    level: "warning".to_string(),
                    message: format!("Committed column '{}' is not referenced by any identity", col.name),
                    column: Some(col.name.clone()),
                });
            }
        }
    }

    diagnostics.sort_by(|a, b| a.column.cmp(&b.column));
    diagnostics
}

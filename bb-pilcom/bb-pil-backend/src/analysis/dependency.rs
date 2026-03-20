use crate::analysis::helpers::collect_column_names;
use crate::analysis::types::{DependencyEdge, DependencyGraph};

use powdr_ast::analyzed::{Analyzed, IdentityKind};
use powdr_number::FieldElement;
use std::collections::{BTreeSet, HashSet};

/// Build a column dependency graph from all identities.
///
/// Columns are nodes (by name). Edges connect columns that co-occur in the
/// same identity, with the identity_id and edge_type recorded.
pub fn build_dependency_graph<F: FieldElement>(analyzed: &Analyzed<F>) -> DependencyGraph {
    let mut edges: Vec<DependencyEdge> = Vec::new();
    let mut seen: HashSet<(String, String, u64)> = HashSet::new();

    for identity in &analyzed.identities {
        let edge_type = match identity.kind {
            IdentityKind::Polynomial => "constraint",
            IdentityKind::Plookup => "lookup",
            IdentityKind::Permutation => "permutation",
            IdentityKind::Connect => "connect",
        };

        let mut cols = BTreeSet::new();
        if let Some(sel) = &identity.left.selector {
            collect_column_names(sel, &mut cols);
        }
        for expr in &identity.left.expressions {
            collect_column_names(expr, &mut cols);
        }
        if let Some(sel) = &identity.right.selector {
            collect_column_names(sel, &mut cols);
        }
        for expr in &identity.right.expressions {
            collect_column_names(expr, &mut cols);
        }

        // Strip shifted markers for graph nodes
        let base_cols: BTreeSet<String> = cols
            .iter()
            .map(|c| c.trim_end_matches('\'').to_string())
            .collect();

        let col_vec: Vec<&String> = base_cols.iter().collect();
        for i in 0..col_vec.len() {
            for j in (i + 1)..col_vec.len() {
                let key = (
                    col_vec[i].clone(),
                    col_vec[j].clone(),
                    identity.id,
                );
                if seen.insert(key) {
                    edges.push(DependencyEdge {
                        from: col_vec[i].clone(),
                        to: col_vec[j].clone(),
                        via_identity_id: identity.id,
                        edge_type: edge_type.to_string(),
                    });
                }
            }
        }
    }

    DependencyGraph { edges }
}

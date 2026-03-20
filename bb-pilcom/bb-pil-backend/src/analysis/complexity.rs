use crate::analysis::types::{NamespaceAnalysis, NamespaceComplexity};

use std::collections::BTreeMap;

/// Compute complexity metrics for each namespace.
pub fn compute_complexity(namespaces: &mut BTreeMap<String, NamespaceAnalysis>) {
    for (_ns, ns_info) in namespaces.iter_mut() {
        let total_constraints = ns_info.constraints.len();
        let total_columns = ns_info.columns.len();

        let degrees: Vec<u64> = ns_info.constraints.iter().map(|c| c.degree).collect();
        let max_degree = degrees.iter().copied().max().unwrap_or(0);
        let avg_degree = if degrees.is_empty() {
            0.0
        } else {
            degrees.iter().sum::<u64>() as f64 / degrees.len() as f64
        };

        ns_info.complexity = NamespaceComplexity {
            total_constraints,
            total_columns,
            max_degree,
            avg_degree,
        };
    }
}

use crate::analysis::types::{BlockInfo, NamespaceAnalysis};

use std::collections::{BTreeMap, HashSet};

/// Heuristic detection of multi-row block structure in each namespace.
pub fn detect_blocks(namespaces: &mut BTreeMap<String, NamespaceAnalysis>) {
    for (_ns, ns_info) in namespaces.iter_mut() {
        let mut counter_columns: Vec<String> = Vec::new();
        let mut latch_conditions: Vec<String> = Vec::new();
        let mut cross_row_state: HashSet<String> = HashSet::new();

        for col in &ns_info.columns {
            let short = col
                .name
                .split('.')
                .last()
                .unwrap_or(&col.name)
                .to_lowercase();

            // Counter columns: names containing round/step/counter/ctr
            if short.contains("round")
                || short.contains("step")
                || short.contains("counter")
                || short.contains("ctr")
            {
                counter_columns.push(col.name.clone());
            }

            // Latch conditions: intermediate columns with names containing last or first_row
            if col.kind == "intermediate"
                && (short.contains("last") || short.contains("first_row") || short.contains("latch"))
            {
                latch_conditions.push(col.name.clone());
            }
        }

        // Cross-row state: columns appearing both shifted and unshifted in the same constraint
        for constraint in &ns_info.constraints {
            let shifted: HashSet<&str> = constraint
                .columns_used
                .iter()
                .filter(|c| c.ends_with('\''))
                .map(|c| c.trim_end_matches('\''))
                .collect();
            let unshifted: HashSet<&str> = constraint
                .columns_used
                .iter()
                .filter(|c| !c.ends_with('\''))
                .map(|c| c.as_str())
                .collect();

            for s in &shifted {
                if unshifted.contains(s) {
                    cross_row_state.insert(s.to_string());
                }
            }
        }

        // Only set block_structure if we found evidence of block patterns
        if !counter_columns.is_empty() || !latch_conditions.is_empty() || !cross_row_state.is_empty()
        {
            counter_columns.sort();
            latch_conditions.sort();
            let mut cross_row_vec: Vec<String> = cross_row_state.into_iter().collect();
            cross_row_vec.sort();

            ns_info.block_structure = Some(BlockInfo {
                counter_columns,
                latch_conditions,
                cross_row_state_columns: cross_row_vec,
            });
        }
    }
}

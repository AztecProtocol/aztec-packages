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
            // AND must be a committed column that is actually shifted (appears with ' in constraints).
            // This filters out inverse helpers (e.g., ctr_min_one_inv) and selectors
            // that happen to have "ctr" in the name (e.g., sel_get_ctr).
            if col.kind == "committed"
                && col.is_shifted
                && (short.contains("round")
                    || short.contains("step")
                    || short.contains("counter")
                    || short.contains("ctr"))
            {
                counter_columns.push(col.name.clone());
            }

            // Latch conditions: intermediate columns with names containing last or first_row
            if col.kind == "intermediate"
                && (short.contains("last") || short.contains("first_row") || short.contains("latch"))
            {
                latch_conditions.push(col.name.clone());
            }

            // Cross-row state: committed columns that are shifted (appear with `'` in any
            // constraint or expression in the namespace).
            //
            // The previous heuristic required a column to appear BOTH shifted and unshifted
            // in the *same* constraint, which works for simple copy-propagation constraints
            // like `(1 - LATCH) * (dst_addr' - dst_addr) = 0`.  However it misses state
            // columns whose next-row value is set by a computation rather than a direct
            // copy, e.g. `(1 - LATCH) * (state_in_00' - state_iota_00) = 0`.  There
            // `state_in_00'` appears but `state_in_00` does not — yet `state_in_00` is
            // clearly cross-row state: round N's output feeds round N+1's input.
            //
            // Using `is_shifted` (which is set whenever the column's name appears with
            // `next == true` anywhere in the analyzed PIL) is both simpler and more
            // accurate.  We restrict to committed columns to exclude intermediate
            // helper polynomials that happen to be shifted.
            if col.kind == "committed" && col.is_shifted {
                cross_row_state.insert(col.name.clone());
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

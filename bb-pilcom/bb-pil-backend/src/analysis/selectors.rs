use crate::analysis::helpers::namespace_of;
use crate::analysis::types::{NamespaceAnalysis, SelectorInfo};

use powdr_ast::analyzed::{AlgebraicExpression, Analyzed};
use powdr_number::FieldElement;
use std::collections::BTreeMap;

/// Build selector info for each namespace.
///
/// A selector is a boolean column whose name contains "sel".
/// Composite selectors are intermediates whose defining expression is a sum of boolean references.
pub fn build_selectors<F: FieldElement>(
    analyzed: &Analyzed<F>,
    namespaces: &mut BTreeMap<String, NamespaceAnalysis>,
) {
    // Collect boolean column names across all namespaces
    let mut boolean_cols: BTreeMap<String, bool> = BTreeMap::new(); // name -> is_selector_name
    for (_ns, ns_info) in namespaces.iter() {
        for col in &ns_info.columns {
            if col.is_boolean {
                let short = col
                    .name
                    .split('.')
                    .last()
                    .unwrap_or(&col.name)
                    .to_lowercase();
                boolean_cols.insert(col.name.clone(), short.contains("sel"));
            }
        }
    }

    // Detect composite selectors from intermediate columns
    let mut composite_map: BTreeMap<String, Vec<String>> = BTreeMap::new();
    for (_name, (sym, exprs)) in &analyzed.intermediate_columns {
        for (elem_name, _poly_id) in sym.array_elements() {
            if let Some(expr) = exprs.first() {
                if let Some(sub_sels) = detect_composite(expr, &boolean_cols) {
                    if sub_sels.len() >= 2 {
                        composite_map.insert(elem_name, sub_sels);
                    }
                }
            }
        }
    }

    // Build SelectorInfo per namespace
    for (ns_name, ns_info) in namespaces.iter_mut() {
        let mut selectors: Vec<SelectorInfo> = Vec::new();

        for col in &ns_info.columns {
            let short = col
                .name
                .split('.')
                .last()
                .unwrap_or(&col.name)
                .to_lowercase();
            if !col.is_boolean || !short.contains("sel") {
                continue;
            }

            // Find identities gated by this selector
            let mut gates_identities: Vec<u64> = Vec::new();
            for constraint in &ns_info.constraints {
                if constraint.gating_selector.as_deref() == Some(&col.name) {
                    gates_identities.push(constraint.identity_id);
                }
            }

            // Find lookups where this column is a selector
            let mut in_lookups_as_selector: Vec<u64> = Vec::new();
            for constraint in &ns_info.constraints {
                if constraint.kind == "lookup" || constraint.kind == "permutation" {
                    // The selector column appears in columns_used for these identities
                    if constraint.columns_used.iter().any(|c| {
                        let base = c.trim_end_matches('\'');
                        base == col.name
                    }) {
                        in_lookups_as_selector.push(constraint.identity_id);
                    }
                }
            }

            let (is_composite, composite_of) = composite_map
                .get(&col.name)
                .map(|subs| (true, subs.clone()))
                .unwrap_or((false, Vec::new()));

            selectors.push(SelectorInfo {
                name: col.name.clone(),
                is_composite,
                composite_of,
                gates_identities,
                in_lookups_as_selector,
            });
        }

        // Also check for composite selectors that might be intermediates in this namespace
        for (comp_name, sub_sels) in &composite_map {
            if namespace_of(comp_name) == *ns_name {
                // Check if we already added it as a boolean column
                if !selectors.iter().any(|s| s.name == *comp_name) {
                    selectors.push(SelectorInfo {
                        name: comp_name.clone(),
                        is_composite: true,
                        composite_of: sub_sels.clone(),
                        gates_identities: Vec::new(),
                        in_lookups_as_selector: Vec::new(),
                    });
                }
            }
        }

        selectors.sort_by(|a, b| a.name.cmp(&b.name));
        ns_info.selectors = selectors;
    }
}

/// Check if an intermediate expression is a sum of boolean references.
/// Returns the sub-selector names if so.
fn detect_composite<F>(
    expr: &AlgebraicExpression<F>,
    boolean_cols: &BTreeMap<String, bool>,
) -> Option<Vec<String>> {
    let mut refs = Vec::new();
    collect_add_refs(expr, &mut refs);
    if refs.len() >= 2 && refs.iter().all(|r| boolean_cols.contains_key(r)) {
        Some(refs)
    } else {
        None
    }
}

/// Collect reference names from a chain of Add operations.
fn collect_add_refs<F>(expr: &AlgebraicExpression<F>, out: &mut Vec<String>) {
    match expr {
        AlgebraicExpression::Reference(r) => {
            out.push(r.name.clone());
        }
        AlgebraicExpression::BinaryOperation(op)
            if op.op == powdr_ast::analyzed::AlgebraicBinaryOperator::Add =>
        {
            collect_add_refs(&op.left, out);
            collect_add_refs(&op.right, out);
        }
        _ => {} // Non-add structure — not a simple composite
    }
}

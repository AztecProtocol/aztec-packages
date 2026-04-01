use crate::analysis::helpers::namespace_of;
use crate::analysis::types::{NamespaceAnalysis, SelectorInfo};

use powdr_ast::analyzed::{AlgebraicExpression, Analyzed};
use powdr_number::FieldElement;
use std::collections::{BTreeMap, BTreeSet, HashSet};

/// Build selector info for each namespace.
///
/// A column is a selector if:
/// 1. It is boolean-constrained (explicit or derived) AND appears as a
///    top-level multiplicative factor in other constraints or as a
///    selector in lookups/permutations.
/// 2. OR it is not provably boolean but still appears as a top-level gate
///    (tagged as "assumed" — may be boolean via lookup from another namespace).
///
/// Intermediate polynomials that combine selectors via addition are tagged
/// as composite selectors.
pub fn build_selectors<F: FieldElement>(
    analyzed: &Analyzed<F>,
    namespaces: &mut BTreeMap<String, NamespaceAnalysis>,
) {
    // Collect all boolean column names and their source type
    let mut boolean_cols: BTreeMap<String, String> = BTreeMap::new(); // name -> boolean_source
    for ns_info in namespaces.values() {
        for col in &ns_info.columns {
            if col.is_boolean {
                if let Some(src) = &col.boolean_source {
                    boolean_cols.insert(col.name.clone(), src.clone());
                }
            }
        }
    }

    // Collect all columns that appear as gating selectors in any constraint
    let mut gating_cols: HashSet<String> = HashSet::new();
    for ns_info in namespaces.values() {
        for constraint in &ns_info.constraints {
            if let Some(gate) = &constraint.gating_selector {
                gating_cols.insert(gate.clone());
            }
        }
    }

    // Also collect columns used as left/right selectors in lookups/permutations.
    // These are the actual selector columns from the identity's SelectedExpressions,
    // not just any column that appears in the identity.
    let mut lookup_selector_cols: HashSet<String> = HashSet::new();
    for ns_info in namespaces.values() {
        for constraint in &ns_info.constraints {
            if constraint.kind == "lookup" || constraint.kind == "permutation" {
                if let Some(ls) = &constraint.left_selector {
                    lookup_selector_cols.insert(ls.clone());
                }
                if let Some(rs) = &constraint.right_selector {
                    lookup_selector_cols.insert(rs.clone());
                }
            }
        }
    }

    // Build the full selector set:
    // - Boolean columns that gate or appear in lookups → "explicit" or "derived"
    // - Non-boolean columns that gate → "assumed"
    let mut selector_info_map: BTreeMap<String, String> = BTreeMap::new(); // name -> boolean_source

    for name in &gating_cols {
        if let Some(src) = boolean_cols.get(name) {
            selector_info_map.insert(name.clone(), src.clone());
        } else {
            selector_info_map.insert(name.clone(), "assumed".to_string());
        }
    }

    for name in &lookup_selector_cols {
        if !selector_info_map.contains_key(name) {
            if let Some(src) = boolean_cols.get(name) {
                selector_info_map.insert(name.clone(), src.clone());
            } else {
                selector_info_map.insert(name.clone(), "assumed".to_string());
            }
        }
    }

    let selector_names: BTreeSet<&String> = selector_info_map.keys().collect();

    // Detect composite selectors from intermediate columns
    let mut composite_map: BTreeMap<String, Vec<String>> = BTreeMap::new();
    for (_name, (sym, exprs)) in &analyzed.intermediate_columns {
        for (idx, (elem_name, _poly_id)) in sym.array_elements().enumerate() {
            if let Some(expr) = exprs.get(idx) {
                if let Some(sub_sels) = detect_composite(expr, &selector_names) {
                    if sub_sels.len() >= 2 {
                        composite_map.insert(elem_name, sub_sels);
                    }
                }
            }
        }
    }

    // Pre-build cross-namespace maps for gates and lookup selectors.
    // A column may gate constraints or serve as a lookup selector in a different namespace
    // than where it is defined (e.g., tx.is_teardown gates a constraint in the constants namespace).
    let mut gating_identities: BTreeMap<String, Vec<u64>> = BTreeMap::new();
    let mut lookup_sel_identities: BTreeMap<String, Vec<u64>> = BTreeMap::new();
    for ns_info in namespaces.values() {
        for constraint in &ns_info.constraints {
            if let Some(gate) = &constraint.gating_selector {
                gating_identities
                    .entry(gate.clone())
                    .or_default()
                    .push(constraint.identity_id);
            }
            if constraint.kind == "lookup" || constraint.kind == "permutation" {
                if let Some(ls) = &constraint.left_selector {
                    lookup_sel_identities
                        .entry(ls.clone())
                        .or_default()
                        .push(constraint.identity_id);
                }
                if let Some(rs) = &constraint.right_selector {
                    lookup_sel_identities
                        .entry(rs.clone())
                        .or_default()
                        .push(constraint.identity_id);
                }
            }
        }
    }

    // Build SelectorInfo per namespace
    for (ns_name, ns_info) in namespaces.iter_mut() {
        let mut selectors: Vec<SelectorInfo> = Vec::new();

        for col in &ns_info.columns {
            let bool_source = match selector_info_map.get(&col.name) {
                Some(src) => src.clone(),
                None => continue,
            };

            // Find identities gated by this selector (across all namespaces)
            let gates_identities = gating_identities
                .get(&col.name)
                .cloned()
                .unwrap_or_default();

            // Find lookups/permutations where this column is a selector (across all namespaces)
            let in_lookups_as_selector = lookup_sel_identities
                .get(&col.name)
                .cloned()
                .unwrap_or_default();

            let (is_composite, composite_of) = composite_map
                .get(&col.name)
                .map(|subs| (true, subs.clone()))
                .unwrap_or((false, Vec::new()));

            selectors.push(SelectorInfo {
                name: col.name.clone(),
                boolean_source: bool_source,
                is_composite,
                composite_of,
                gates_identities,
                in_lookups_as_selector,
            });
        }

        // Also add composite selectors that are intermediates (not in column list as selectors)
        for (comp_name, sub_sels) in &composite_map {
            if namespace_of(comp_name) == *ns_name {
                if !selectors.iter().any(|s| s.name == *comp_name) {
                    // Composite selectors derived from selectors are themselves derived
                    selectors.push(SelectorInfo {
                        name: comp_name.clone(),
                        boolean_source: "derived".to_string(),
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

/// Check if an intermediate expression is a sum of selector references.
fn detect_composite<F>(
    expr: &AlgebraicExpression<F>,
    selector_names: &BTreeSet<&String>,
) -> Option<Vec<String>> {
    let mut refs = Vec::new();
    collect_add_refs(expr, &mut refs);
    if refs.len() >= 2 && refs.iter().all(|r| selector_names.contains(r)) {
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
        _ => {}
    }
}

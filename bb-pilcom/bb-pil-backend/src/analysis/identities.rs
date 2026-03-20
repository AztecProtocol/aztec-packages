use crate::analysis::columns::default_ns;
use crate::analysis::helpers::{
    collect_column_names, format_source_ref, get_ref_name, namespace_of, render_expression,
    short_source_file,
};
use crate::analysis::types::{
    ColumnMapping, ConstraintInfo, CrossNamespaceConnection, NamespaceAnalysis,
};
use crate::expression_evaluation::get_expression_degree;

use powdr_ast::analyzed::{
    AlgebraicBinaryOperation, AlgebraicBinaryOperator, AlgebraicExpression, Analyzed, Identity,
    IdentityKind,
};
use powdr_number::FieldElement;
use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::path::Path;

/// Result of identity analysis.
pub struct IdentityResult {
    pub connections: Vec<CrossNamespaceConnection>,
}

/// Build constraints for all namespaces and cross-namespace connections.
///
/// Mutates `namespaces` in place: populates `constraints`, updates column
/// cross-references (`referenced_by_identities`, `in_lookups`, `in_permutations`),
/// and tracks source files from identity sources.
pub fn build_identities<F: FieldElement>(
    analyzed: &Analyzed<F>,
    namespaces: &mut BTreeMap<String, NamespaceAnalysis>,
) -> IdentityResult {
    let inlined = analyzed.identities_with_inlined_intermediate_polynomials();
    let inlined_map: HashMap<u64, &Identity<AlgebraicExpression<F>>> =
        inlined.iter().map(|id| (id.id, id)).collect();

    let mut connections: Vec<CrossNamespaceConnection> = Vec::new();

    for identity in &analyzed.identities {
        let kind_str = match identity.kind {
            IdentityKind::Polynomial => "polynomial",
            IdentityKind::Plookup => "lookup",
            IdentityKind::Permutation => "permutation",
            IdentityKind::Connect => "connect",
        };

        let source = format_source_ref(&identity.source);

        // Render raw expression
        let expression_raw = render_identity(identity);

        // Render inlined expression
        let expression_inlined = inlined_map
            .get(&identity.id)
            .map(|inl| render_identity(inl))
            .unwrap_or_else(|| expression_raw.clone());

        // Collect columns used (from raw identity)
        let mut cols_used = BTreeSet::new();
        collect_identity_columns(identity, &mut cols_used);

        // Compute degree from inlined expression
        let degree = inlined_map
            .get(&identity.id)
            .and_then(|inl| {
                inl.left
                    .selector
                    .as_ref()
                    .map(|e| get_expression_degree(e))
            })
            .or_else(|| {
                identity
                    .left
                    .selector
                    .as_ref()
                    .map(|e| get_expression_degree(e))
            })
            .unwrap_or(0);

        // Detect gating selector for polynomial identities
        let gating_selector = if identity.kind == IdentityKind::Polynomial {
            detect_gating_selector(identity, namespaces)
        } else {
            None
        };

        // For lookups/permutations, extract structured sides
        let (left_sel, right_sel, from_ns, to_ns, column_mapping) =
            if matches!(
                identity.kind,
                IdentityKind::Plookup | IdentityKind::Permutation | IdentityKind::Connect
            ) {
                extract_connection_info(identity)
            } else {
                (None, None, None, None, Vec::new())
            };

        // Determine which namespace this identity belongs to
        let identity_ns = from_ns
            .clone()
            .or_else(|| cols_used.first().map(|c| namespace_of(c)))
            .unwrap_or_else(|| {
                identity
                    .source
                    .file_name
                    .as_ref()
                    .and_then(|f| {
                        Path::new(f.as_ref())
                            .file_stem()
                            .map(|s| s.to_string_lossy().replace(".pil", ""))
                    })
                    .unwrap_or_else(|| "unknown".to_string())
            });

        let constraint = ConstraintInfo {
            identity_id: identity.id,
            kind: kind_str.to_string(),
            classifications: Vec::new(), // populated later by classify.rs
            label: identity.attribute.clone(),
            source: source.clone(),
            expression_raw,
            expression_inlined,
            columns_used: cols_used.iter().cloned().collect(),
            degree,
            gating_selector,
        };

        let ns_info = namespaces.entry(identity_ns.clone()).or_insert_with(default_ns);

        if let Some(fname) = short_source_file(&identity.source) {
            if !ns_info.source_files.contains(&fname) {
                ns_info.source_files.push(fname);
            }
        }

        ns_info.constraints.push(constraint);

        // Update column cross-references
        update_column_refs(identity, namespaces);

        // Build cross-namespace connections
        if matches!(
            identity.kind,
            IdentityKind::Plookup | IdentityKind::Permutation | IdentityKind::Connect
        ) {
            if let (Some(from), Some(to)) = (&from_ns, &to_ns) {
                connections.push(CrossNamespaceConnection {
                    identity_id: identity.id,
                    kind: kind_str.to_string(),
                    label: identity.attribute.clone(),
                    source,
                    source_namespace: from.clone(),
                    dest_namespace: to.clone(),
                    source_selector: left_sel,
                    dest_selector: right_sel,
                    column_mapping,
                });
            }
        }
    }

    IdentityResult { connections }
}

fn render_identity<F: FieldElement>(identity: &Identity<AlgebraicExpression<F>>) -> String {
    match identity.kind {
        IdentityKind::Polynomial => identity
            .left
            .selector
            .as_ref()
            .map(|e| render_expression(e))
            .unwrap_or_default(),
        _ => {
            let left_sel = identity
                .left
                .selector
                .as_ref()
                .map(|e| render_expression(e));
            let left_exprs: Vec<String> = identity
                .left
                .expressions
                .iter()
                .map(|e| render_expression(e))
                .collect();
            let right_sel = identity
                .right
                .selector
                .as_ref()
                .map(|e| render_expression(e));
            let right_exprs: Vec<String> = identity
                .right
                .expressions
                .iter()
                .map(|e| render_expression(e))
                .collect();

            let left_part = match left_sel {
                Some(sel) => format!("{} {{ {} }}", sel, left_exprs.join(", ")),
                None => format!("{{ {} }}", left_exprs.join(", ")),
            };
            let right_part = match right_sel {
                Some(sel) => format!("{} {{ {} }}", sel, right_exprs.join(", ")),
                None => format!("{{ {} }}", right_exprs.join(", ")),
            };

            let op = match identity.kind {
                IdentityKind::Plookup => "in",
                IdentityKind::Permutation => "is",
                IdentityKind::Connect => "connect",
                _ => "=",
            };
            format!("{} {} {}", left_part, op, right_part)
        }
    }
}

fn collect_identity_columns<F>(
    identity: &Identity<AlgebraicExpression<F>>,
    out: &mut BTreeSet<String>,
) {
    if let Some(sel) = &identity.left.selector {
        collect_column_names(sel, out);
    }
    for expr in &identity.left.expressions {
        collect_column_names(expr, out);
    }
    if let Some(sel) = &identity.right.selector {
        collect_column_names(sel, out);
    }
    for expr in &identity.right.expressions {
        collect_column_names(expr, out);
    }
}

fn detect_gating_selector<F: FieldElement>(
    identity: &Identity<AlgebraicExpression<F>>,
    namespaces: &BTreeMap<String, NamespaceAnalysis>,
) -> Option<String> {
    let expr = identity.left.selector.as_ref()?;

    // Unwrap the `expr - 0` wrapper
    let inner = if let AlgebraicExpression::BinaryOperation(AlgebraicBinaryOperation {
        left,
        op: AlgebraicBinaryOperator::Sub,
        right,
    }) = expr
    {
        if let AlgebraicExpression::Number(n) = right.as_ref() {
            if *n == F::from(0u32) {
                left.as_ref()
            } else {
                expr
            }
        } else {
            expr
        }
    } else {
        expr
    };

    // Check if outermost is Mul(ref, body) where ref is boolean
    if let AlgebraicExpression::BinaryOperation(AlgebraicBinaryOperation {
        left,
        op: AlgebraicBinaryOperator::Mul,
        right,
    }) = inner
    {
        if let Some(name) = try_extract_boolean_gate(left, namespaces) {
            return Some(name);
        }
        if let Some(name) = try_extract_boolean_gate(right, namespaces) {
            return Some(name);
        }
    }
    None
}

fn try_extract_boolean_gate<F>(
    expr: &AlgebraicExpression<F>,
    namespaces: &BTreeMap<String, NamespaceAnalysis>,
) -> Option<String> {
    let r = match expr {
        AlgebraicExpression::Reference(r) => r,
        _ => return None,
    };

    let ns = namespace_of(&r.name);
    if let Some(ns_info) = namespaces.get(&ns) {
        if ns_info
            .columns
            .iter()
            .any(|c| c.name == r.name && c.is_boolean)
        {
            return Some(r.name.clone());
        }
    }
    None
}

fn extract_connection_info<F: FieldElement>(
    identity: &Identity<AlgebraicExpression<F>>,
) -> (
    Option<String>,
    Option<String>,
    Option<String>,
    Option<String>,
    Vec<ColumnMapping>,
) {
    let ls = identity.left.selector.as_ref().and_then(get_ref_name);
    let rs = identity.right.selector.as_ref().and_then(get_ref_name);

    let lc: Vec<String> = identity
        .left
        .expressions
        .iter()
        .filter_map(get_ref_name)
        .collect();
    let rc: Vec<String> = identity
        .right
        .expressions
        .iter()
        .filter_map(get_ref_name)
        .collect();

    let from = ls
        .as_ref()
        .map(|s| namespace_of(s))
        .or_else(|| lc.first().map(|c| namespace_of(c)));
    let to = rs
        .as_ref()
        .map(|s| namespace_of(s))
        .or_else(|| rc.first().map(|c| namespace_of(c)));

    // Build column mapping — pair left.expressions[i] with right.expressions[i]
    let mapping: Vec<ColumnMapping> = identity
        .left
        .expressions
        .iter()
        .zip(identity.right.expressions.iter())
        .map(|(l, r)| {
            let mut src_cols = BTreeSet::new();
            collect_column_names(l, &mut src_cols);
            let mut dst_cols = BTreeSet::new();
            collect_column_names(r, &mut dst_cols);
            ColumnMapping {
                source_expr: render_expression(l),
                dest_expr: render_expression(r),
                source_columns: src_cols.into_iter().collect(),
                dest_columns: dst_cols.into_iter().collect(),
            }
        })
        .collect();

    (ls, rs, from, to, mapping)
}

fn update_column_refs<F>(
    identity: &Identity<AlgebraicExpression<F>>,
    namespaces: &mut BTreeMap<String, NamespaceAnalysis>,
) {
    let mut all_cols = BTreeSet::new();
    collect_identity_columns(identity, &mut all_cols);

    for col_name in &all_cols {
        // Strip trailing ' for shifted references
        let base_name = col_name.trim_end_matches('\'');
        let ns = namespace_of(base_name);
        if let Some(ns_info) = namespaces.get_mut(&ns) {
            for col in &mut ns_info.columns {
                if col.name == base_name {
                    if !col.referenced_by_identities.contains(&identity.id) {
                        col.referenced_by_identities.push(identity.id);
                    }
                    match identity.kind {
                        IdentityKind::Plookup => {
                            if !col.in_lookups.contains(&identity.id) {
                                col.in_lookups.push(identity.id);
                            }
                        }
                        IdentityKind::Permutation => {
                            if !col.in_permutations.contains(&identity.id) {
                                col.in_permutations.push(identity.id);
                            }
                        }
                        _ => {}
                    }
                }
            }
        }
    }
}

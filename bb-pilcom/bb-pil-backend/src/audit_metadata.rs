//! Exports a flat, audit-optimized JSON representation of the Analyzed PIL IR.
//!
//! This module transforms the compiler's `Analyzed<T>` into a structure designed for
//! security audit tooling: column catalogs with boolean constraint detection, identity
//! catalogs with Display-flattened expressions, and cross-namespace interaction maps.
//!
//! Invoked via `bb_pil --emit-audit-metadata <path>`.

use powdr_ast::analyzed::{
    AlgebraicBinaryOperation, AlgebraicBinaryOperator, AlgebraicExpression, Analyzed, IdentityKind,
    PolynomialType, SymbolKind,
};
use powdr_number::FieldElement;
use serde::Serialize;
use std::collections::{BTreeMap, BTreeSet};
use std::path::Path;

#[derive(Serialize)]
pub struct AuditMetadata {
    pub namespaces: BTreeMap<String, NamespaceInfo>,
    pub interactions: Vec<InteractionInfo>,
}

#[derive(Serialize)]
pub struct NamespaceInfo {
    pub source_files: Vec<String>,
    pub columns: Vec<ColumnInfo>,
    pub identities: Vec<IdentityInfo>,
}

#[derive(Serialize)]
pub struct ColumnInfo {
    pub name: String,
    pub kind: String,
    pub source: String,
    pub array_size: Option<u64>,
    pub is_boolean: bool,
    pub boolean_constraint_source: Option<String>,
}

#[derive(Serialize)]
pub struct IdentityInfo {
    pub label: Option<String>,
    pub kind: String,
    pub source: String,
    pub expression: String,
    pub columns_used: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub left_selector: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub left_columns: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub right_selector: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub right_columns: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub from_namespace: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub to_namespace: Option<String>,
}

#[derive(Serialize)]
pub struct InteractionInfo {
    pub kind: String,
    pub label: Option<String>,
    pub source: String,
    pub from_namespace: String,
    pub to_namespace: String,
    pub expression: String,
}

fn namespace_of(col_name: &str) -> String {
    col_name
        .split('.')
        .next()
        .unwrap_or(col_name)
        .to_string()
}

/// Extract a short relative path from a SourceRef file name.
///
/// SourceRef contains absolute paths like "/home/.../pil/vm2/opcodes/sload.pil".
/// We keep up to 2 trailing path components so that files in subdirectories
/// (bytecode/, execution/, opcodes/, trees/) retain their subdirectory prefix
/// (e.g., "opcodes/sload.pil"), while top-level files stay as just "alu.pil".
/// The "vm2" and "pil" parents are filtered out since they're not meaningful
/// distinguishers for the audit consumer.
fn short_path(full_path: &str) -> String {
    let p = Path::new(full_path);
    let components: Vec<_> = p.components().rev().take(2).collect();
    if components.len() == 2 {
        // Check if the parent is a meaningful subdirectory (not "vm2" or "pil")
        let parent = components[1].as_os_str().to_string_lossy();
        let file = components[0].as_os_str().to_string_lossy();
        if parent != "vm2" && parent != "pil" {
            return format!("{}/{}", parent, file);
        }
        return file.into_owned();
    }
    p.file_name()
        .map(|f| f.to_string_lossy().into_owned())
        .unwrap_or_else(|| full_path.to_string())
}

fn format_source_ref(source: &powdr_parser_util::SourceRef) -> String {
    let file = source
        .file_name
        .as_ref()
        .map(|s| short_path(s.as_ref()))
        .unwrap_or_else(|| "<unknown>".to_string());

    // Compute line number from file_contents if available
    if let Some(contents) = &source.file_contents {
        let line = contents[..source.start.min(contents.len())]
            .chars()
            .filter(|c| *c == '\n')
            .count()
            + 1;
        format!("{}:{}", file, line)
    } else {
        format!("{}:{}", file, source.start)
    }
}

/// Extract the short filename (with subdirectory prefix if applicable) for source_files tracking.
fn short_source_file(source: &powdr_parser_util::SourceRef) -> Option<String> {
    source.file_name.as_ref().map(|s| short_path(s.as_ref()))
}

/// Collect all AlgebraicReference names from an expression tree.
fn collect_column_names<T>(expr: &AlgebraicExpression<T>, out: &mut BTreeSet<String>) {
    match expr {
        AlgebraicExpression::Reference(r) => {
            let mut name = r.name.clone();
            if r.next {
                name = format!("{}'", name);
            }
            out.insert(name);
        }
        AlgebraicExpression::BinaryOperation(op) => {
            collect_column_names(&op.left, out);
            collect_column_names(&op.right, out);
        }
        AlgebraicExpression::UnaryOperation(op) => {
            collect_column_names(&op.expr, out);
        }
        AlgebraicExpression::PublicReference(_)
        | AlgebraicExpression::Challenge(_)
        | AlgebraicExpression::Number(_) => {}
    }
}

/// Check if an expression represents `col * (1 - col)` for some column reference.
/// Returns the column name if so.
/// The polynomial identity `expr = 0` is stored as `Sub(expr, Number(0))` in left.selector,
/// so we need to unwrap that outer subtraction first.
fn detect_boolean_constraint<T: FieldElement>(
    expr: &AlgebraicExpression<T>,
) -> Option<String> {
    // Unwrap the `expr - 0` wrapper if present
    let inner = if let AlgebraicExpression::BinaryOperation(AlgebraicBinaryOperation {
        left,
        op: AlgebraicBinaryOperator::Sub,
        right,
    }) = expr
    {
        if let AlgebraicExpression::Number(n) = right.as_ref() {
            if *n == T::from(0u32) {
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

    // Now match col * (1 - col) or (1 - col) * col
    if let AlgebraicExpression::BinaryOperation(AlgebraicBinaryOperation {
        left,
        op: AlgebraicBinaryOperator::Mul,
        right,
    }) = inner
    {
        // Try col * (1 - col)
        if let Some(name) = try_match_bool_pattern(left, right) {
            return Some(name);
        }
        // Try (1 - col) * col
        if let Some(name) = try_match_bool_pattern(right, left) {
            return Some(name);
        }
    }
    None
}

fn try_match_bool_pattern<T: FieldElement>(
    col_side: &AlgebraicExpression<T>,
    complement_side: &AlgebraicExpression<T>,
) -> Option<String> {
    let col_ref = match col_side {
        AlgebraicExpression::Reference(r) => r,
        _ => return None,
    };

    // complement_side should be (1 - col) i.e. Sub(Number(1), Reference(same_col))
    if let AlgebraicExpression::BinaryOperation(AlgebraicBinaryOperation {
        left,
        op: AlgebraicBinaryOperator::Sub,
        right,
    }) = complement_side
    {
        if let AlgebraicExpression::Number(n) = left.as_ref() {
            if *n == T::from(1u32) {
                if let AlgebraicExpression::Reference(r2) = right.as_ref() {
                    if r2.name == col_ref.name && r2.poly_id == col_ref.poly_id {
                        return Some(col_ref.name.clone());
                    }
                }
            }
        }
    }
    None
}

/// Extract the name from a selector/column expression in a lookup/permutation side.
fn get_ref_name<T>(expr: &AlgebraicExpression<T>) -> Option<String> {
    match expr {
        AlgebraicExpression::Reference(a_ref) => {
            let mut name = a_ref.name.clone();
            if a_ref.next {
                name = format!("{}'", name);
            }
            Some(name)
        }
        _ => None,
    }
}

fn default_ns_info() -> NamespaceInfo {
    NamespaceInfo {
        source_files: Vec::new(),
        columns: Vec::new(),
        identities: Vec::new(),
    }
}

pub fn export_audit_metadata<F: FieldElement>(analyzed: &Analyzed<F>) -> AuditMetadata {
    let mut namespaces: BTreeMap<String, NamespaceInfo> = BTreeMap::new();

    // 1. Collect columns from definitions (committed and constant)
    for (_name, (sym, _def)) in &analyzed.definitions {
        let poly_type = match sym.kind {
            SymbolKind::Poly(PolynomialType::Committed) => "committed",
            SymbolKind::Poly(PolynomialType::Constant) => "constant",
            _ => continue,
        };

        let is_array = sym.length.is_some();
        let array_size = sym.length;

        for (elem_name, _poly_id) in sym.array_elements() {
            let ns = namespace_of(&elem_name);
            let source = format_source_ref(&sym.source);
            let info = namespaces.entry(ns).or_insert_with(default_ns_info);

            // Track source files
            if let Some(fname) = short_source_file(&sym.source) {
                if !info.source_files.contains(&fname) {
                    info.source_files.push(fname);
                }
            }

            info.columns.push(ColumnInfo {
                name: elem_name,
                kind: poly_type.to_string(),
                source,
                array_size: if is_array { array_size } else { None },
                is_boolean: false,
                boolean_constraint_source: None,
            });
        }
    }

    // Also collect intermediate columns.
    // These are `pol NAME = expr` definitions (e.g., constants_gen.pil, poseidon2_params.pil).
    // We must track source_files here too — without this, namespaces that only contain
    // intermediate columns (like `constants` and `poseidon2_params`) would have empty
    // source_files arrays despite having hundreds of columns.
    for (_name, (sym, _exprs)) in &analyzed.intermediate_columns {
        for (elem_name, _poly_id) in sym.array_elements() {
            let ns = namespace_of(&elem_name);
            let source = format_source_ref(&sym.source);
            let info = namespaces.entry(ns).or_insert_with(default_ns_info);

            if let Some(fname) = short_source_file(&sym.source) {
                if !info.source_files.contains(&fname) {
                    info.source_files.push(fname);
                }
            }

            info.columns.push(ColumnInfo {
                name: elem_name,
                kind: "intermediate".to_string(),
                source,
                array_size: sym.length,
                is_boolean: false,
                boolean_constraint_source: None,
            });
        }
    }

    // 2. Detect boolean constraints from polynomial identities
    // Use the inlined identities so intermediates are resolved
    let inlined = analyzed.identities_with_inlined_intermediate_polynomials();
    for identity in &inlined {
        if identity.kind != IdentityKind::Polynomial {
            continue;
        }
        let expr = match &identity.left.selector {
            Some(e) => e,
            None => continue,
        };
        if let Some(bool_col) = detect_boolean_constraint(expr) {
            let ns = namespace_of(&bool_col);
            let source = format_source_ref(&identity.source);
            if let Some(ns_info) = namespaces.get_mut(&ns) {
                for col in &mut ns_info.columns {
                    if col.name == bool_col {
                        col.is_boolean = true;
                        col.boolean_constraint_source = Some(source.clone());
                    }
                }
            }
        }
    }
    // Also try on non-inlined identities (catches cases where inlining changes structure)
    for identity in &analyzed.identities {
        if identity.kind != IdentityKind::Polynomial {
            continue;
        }
        let expr = match &identity.left.selector {
            Some(e) => e,
            None => continue,
        };
        if let Some(bool_col) = detect_boolean_constraint(expr) {
            let ns = namespace_of(&bool_col);
            let source = format_source_ref(&identity.source);
            if let Some(ns_info) = namespaces.get_mut(&ns) {
                for col in &mut ns_info.columns {
                    if col.name == bool_col && !col.is_boolean {
                        col.is_boolean = true;
                        col.boolean_constraint_source = Some(source.clone());
                    }
                }
            }
        }
    }

    // 3. Catalog identities and build interactions
    let mut interactions: Vec<InteractionInfo> = Vec::new();

    for identity in &analyzed.identities {
        let kind_str = match identity.kind {
            IdentityKind::Polynomial => "polynomial",
            IdentityKind::Plookup => "lookup",
            IdentityKind::Permutation => "permutation",
            IdentityKind::Connect => "connect",
        };

        let source = format_source_ref(&identity.source);
        let expression = format!("{}", identity);

        // Collect all column names used
        let mut cols_used = BTreeSet::new();
        if let Some(sel) = &identity.left.selector {
            collect_column_names(sel, &mut cols_used);
        }
        for expr in &identity.left.expressions {
            collect_column_names(expr, &mut cols_used);
        }
        if let Some(sel) = &identity.right.selector {
            collect_column_names(sel, &mut cols_used);
        }
        for expr in &identity.right.expressions {
            collect_column_names(expr, &mut cols_used);
        }

        // For lookups/permutations, extract structured sides
        let (left_sel, left_cols, right_sel, right_cols, from_ns, to_ns) =
            if matches!(identity.kind, IdentityKind::Plookup | IdentityKind::Permutation) {
                let ls = identity.left.selector.as_ref().and_then(get_ref_name);
                let lc: Vec<String> = identity
                    .left
                    .expressions
                    .iter()
                    .filter_map(get_ref_name)
                    .collect();
                let rs = identity.right.selector.as_ref().and_then(get_ref_name);
                let rc: Vec<String> = identity
                    .right
                    .expressions
                    .iter()
                    .filter_map(get_ref_name)
                    .collect();

                // Determine from/to namespaces from selectors or first columns
                let from = ls
                    .as_ref()
                    .map(|s| namespace_of(s))
                    .or_else(|| lc.first().map(|c| namespace_of(c)));
                let to = rs
                    .as_ref()
                    .map(|s| namespace_of(s))
                    .or_else(|| rc.first().map(|c| namespace_of(c)));

                (
                    ls,
                    Some(lc),
                    rs,
                    Some(rc),
                    from,
                    to,
                )
            } else {
                (None, None, None, None, None, None)
            };

        // Determine which namespace this identity belongs to.
        // For lookups/permutations, use from_ns (already derived from left selector).
        // For polynomial identities, derive from the columns referenced — this avoids
        // creating ghost namespaces when a file (e.g., opcodes/sload.pil) declares
        // `namespace execution` but has a different file stem.
        let identity_ns = from_ns
            .clone()
            .or_else(|| cols_used.first().map(|c| namespace_of(c)))
            .unwrap_or_else(|| {
                // Last resort: use file stem (only for identities with no column refs)
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

        let id_info = IdentityInfo {
            label: identity.attribute.clone(),
            kind: kind_str.to_string(),
            source: source.clone(),
            expression: expression.clone(),
            columns_used: cols_used.into_iter().collect(),
            left_selector: left_sel.clone(),
            left_columns: left_cols.clone(),
            right_selector: right_sel.clone(),
            right_columns: right_cols.clone(),
            from_namespace: from_ns.clone(),
            to_namespace: to_ns.clone(),
        };

        let ns_info = namespaces.entry(identity_ns).or_insert_with(default_ns_info);

        // Track source files from identities — this ensures the execution namespace's
        // source_files list includes files like opcodes/sload.pil that declare
        // `namespace execution` but whose columns are already registered under execution.
        if let Some(fname) = short_source_file(&identity.source) {
            if !ns_info.source_files.contains(&fname) {
                ns_info.source_files.push(fname);
            }
        }

        ns_info.identities.push(id_info);

        // Build cross-namespace interactions for lookups/permutations
        if matches!(identity.kind, IdentityKind::Plookup | IdentityKind::Permutation) {
            if let (Some(from), Some(to)) = (&from_ns, &to_ns) {
                interactions.push(InteractionInfo {
                    kind: kind_str.to_string(),
                    label: identity.attribute.clone(),
                    source,
                    from_namespace: from.clone(),
                    to_namespace: to.clone(),
                    expression,
                });
            }
        }
    }

    // Sort columns within each namespace by name for deterministic output
    for (_ns, info) in &mut namespaces {
        info.columns.sort_by(|a, b| a.name.cmp(&b.name));
        info.source_files.sort();
    }

    AuditMetadata {
        namespaces,
        interactions,
    }
}

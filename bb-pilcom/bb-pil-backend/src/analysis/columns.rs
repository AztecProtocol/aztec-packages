use crate::analysis::helpers::{
    detect_boolean_constraint, format_source_ref, namespace_of, short_source_file,
};
use crate::analysis::types::{ColumnInfo, NamespaceAnalysis, NamespaceComplexity};

use powdr_ast::analyzed::{
    AlgebraicBinaryOperation, AlgebraicBinaryOperator, AlgebraicExpression, Analyzed, IdentityKind,
    PolynomialType, SymbolKind,
};
use powdr_number::FieldElement;
use std::collections::{BTreeMap, HashSet};

/// Build the initial namespace scaffolding with column catalogs.
///
/// Returns (namespaces, shifted_columns). The shifted_columns set contains
/// base column names that appear with `next == true` in any identity or
/// intermediate column definition.
pub fn build_columns<F: FieldElement>(
    analyzed: &Analyzed<F>,
) -> (BTreeMap<String, NamespaceAnalysis>, HashSet<String>) {
    let mut namespaces: BTreeMap<String, NamespaceAnalysis> = BTreeMap::new();

    // Scan all identities to find shifted column references
    let mut shifted_columns: HashSet<String> = HashSet::new();
    for identity in &analyzed.identities {
        if let Some(sel) = &identity.left.selector {
            scan_shifted_refs_expr(sel, &mut shifted_columns);
        }
        for expr in &identity.left.expressions {
            scan_shifted_refs_expr(expr, &mut shifted_columns);
        }
        if let Some(sel) = &identity.right.selector {
            scan_shifted_refs_expr(sel, &mut shifted_columns);
        }
        for expr in &identity.right.expressions {
            scan_shifted_refs_expr(expr, &mut shifted_columns);
        }
    }

    // Also scan intermediate column definitions for shifted references.
    // A PIL expression like `pol WRONG_NEXT_TAG = 1 - correct_tag';` uses the
    // next-row (`'`) operator inside an intermediate polynomial definition, not
    // inside an identity, so the identity-only scan above would miss it.
    for (_name, (_sym, exprs)) in &analyzed.intermediate_columns {
        for expr in exprs {
            scan_shifted_refs_expr(expr, &mut shifted_columns);
        }
    }

    // Collect committed, constant, and public columns
    for (_name, (sym, _def)) in &analyzed.definitions {
        let poly_type = match sym.kind {
            SymbolKind::Poly(PolynomialType::Committed) => "committed",
            SymbolKind::Poly(PolynomialType::Constant) => "constant",
            // `pol public` columns are committed columns additionally exposed as public inputs.
            // They live in analyzed.definitions with SymbolKind::Poly(Public) and must be
            // included in the column catalog just like committed columns.
            SymbolKind::Poly(PolynomialType::Public) => "public",
            _ => continue,
        };

        let is_array = sym.length.is_some();
        let array_size = sym.length;

        for (elem_name, poly_id) in sym.array_elements() {
            let ns = namespace_of(&elem_name);
            let source = format_source_ref(&sym.source);
            let info = namespaces.entry(ns).or_insert_with(default_ns);

            if let Some(fname) = short_source_file(&sym.source) {
                if !info.source_files.contains(&fname) {
                    info.source_files.push(fname);
                }
            }

            info.columns.push(ColumnInfo {
                name: elem_name.clone(),
                kind: poly_type.to_string(),
                poly_id: poly_id.id,
                source,
                array_size: if is_array { array_size } else { None },
                is_boolean: false,
                boolean_source: None,
                boolean_constraint_source: None,
                is_shifted: shifted_columns.contains(&elem_name),
                referenced_by_identities: Vec::new(),
                in_lookups: Vec::new(),
                in_permutations: Vec::new(),
            });
        }
    }

    // Collect intermediate columns
    for (_name, (sym, _exprs)) in &analyzed.intermediate_columns {
        for (elem_name, poly_id) in sym.array_elements() {
            let ns = namespace_of(&elem_name);
            let source = format_source_ref(&sym.source);
            let info = namespaces.entry(ns).or_insert_with(default_ns);

            if let Some(fname) = short_source_file(&sym.source) {
                if !info.source_files.contains(&fname) {
                    info.source_files.push(fname);
                }
            }

            info.columns.push(ColumnInfo {
                name: elem_name.clone(),
                kind: "intermediate".to_string(),
                poly_id: poly_id.id,
                source,
                array_size: sym.length,
                is_boolean: false,
                boolean_source: None,
                boolean_constraint_source: None,
                is_shifted: shifted_columns.contains(&elem_name),
                referenced_by_identities: Vec::new(),
                in_lookups: Vec::new(),
                in_permutations: Vec::new(),
            });
        }
    }

    // Detect explicit boolean constraints — dual-pass (inlined + non-inlined)
    let inlined = analyzed.identities_with_inlined_intermediate_polynomials();
    mark_booleans(&inlined, &mut namespaces);
    mark_booleans(&analyzed.identities, &mut namespaces);

    // Detect derived booleans — intermediates defined as products of booleans or (1 - boolean)
    mark_derived_booleans(analyzed, &mut namespaces);

    // Sort columns within each namespace by name
    for (_ns, info) in &mut namespaces {
        info.columns.sort_by(|a, b| a.name.cmp(&b.name));
        info.source_files.sort();
    }

    (namespaces, shifted_columns)
}

fn mark_booleans<F: FieldElement>(
    identities: &[powdr_ast::analyzed::Identity<AlgebraicExpression<F>>],
    namespaces: &mut BTreeMap<String, NamespaceAnalysis>,
) {
    for identity in identities {
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
                        col.boolean_source = Some("explicit".to_string());
                        col.boolean_constraint_source = Some(source.clone());
                    }
                }
            }
        }
    }
}

/// Mark intermediate columns as derived booleans if their defining expression
/// is built from booleans via product or complement (1 - x).
///
/// Runs to fixpoint since derived booleans can compose with each other.
fn mark_derived_booleans<F: FieldElement>(
    analyzed: &Analyzed<F>,
    namespaces: &mut BTreeMap<String, NamespaceAnalysis>,
) {
    // Iterate to fixpoint — a derived boolean might depend on another derived boolean
    loop {
        let known_booleans: HashSet<String> = namespaces
            .values()
            .flat_map(|ns| ns.columns.iter())
            .filter(|c| c.is_boolean)
            .map(|c| c.name.clone())
            .collect();

        let mut new_booleans: Vec<(String, String)> = Vec::new(); // (name, source)

        for (_name, (sym, exprs)) in &analyzed.intermediate_columns {
            for (idx, (elem_name, _poly_id)) in sym.array_elements().enumerate() {
                if known_booleans.contains(&elem_name) {
                    continue;
                }
                if let Some(expr) = exprs.get(idx) {
                    if is_boolean_derived_expr(expr, &known_booleans) {
                        let source = format_source_ref(&sym.source);
                        new_booleans.push((elem_name, source));
                    }
                }
            }
        }

        if new_booleans.is_empty() {
            break;
        }

        for (name, source) in new_booleans {
            let ns = namespace_of(&name);
            if let Some(ns_info) = namespaces.get_mut(&ns) {
                for col in &mut ns_info.columns {
                    if col.name == name && !col.is_boolean {
                        col.is_boolean = true;
                        col.boolean_source = Some("derived".to_string());
                        col.boolean_constraint_source = Some(source.clone());
                    }
                }
            }
        }
    }
}

/// Check if an expression is boolean-valued given a set of known boolean column names.
///
/// Recognizes:
/// - Reference to a known boolean
/// - Product of boolean expressions (bool * bool)
/// - Complement of a boolean (1 - bool)
/// - Sum where the terms are known to be mutually exclusive booleans
///   (we can't prove mutual exclusivity statically, so we only accept
///   products here — sums are handled by composite selector detection)
fn is_boolean_derived_expr<F: FieldElement>(
    expr: &AlgebraicExpression<F>,
    known_booleans: &HashSet<String>,
) -> bool {
    match expr {
        AlgebraicExpression::Reference(r) => known_booleans.contains(&r.name),
        AlgebraicExpression::Number(n) => *n == F::from(0u32) || *n == F::from(1u32),
        AlgebraicExpression::BinaryOperation(AlgebraicBinaryOperation { left, op, right }) => {
            match op {
                // Product of booleans is boolean
                AlgebraicBinaryOperator::Mul => {
                    is_boolean_derived_expr(left, known_booleans)
                        && is_boolean_derived_expr(right, known_booleans)
                }
                // (1 - bool) is boolean
                AlgebraicBinaryOperator::Sub => {
                    if let AlgebraicExpression::Number(n) = left.as_ref() {
                        if *n == F::from(1u32) {
                            return is_boolean_derived_expr(right, known_booleans);
                        }
                    }
                    false
                }
                _ => false,
            }
        }
        _ => false,
    }
}

fn scan_shifted_refs_expr<T>(
    expr: &AlgebraicExpression<T>,
    out: &mut HashSet<String>,
) {
    match expr {
        AlgebraicExpression::Reference(r) => {
            if r.next {
                out.insert(r.name.clone());
            }
        }
        AlgebraicExpression::BinaryOperation(op) => {
            scan_shifted_refs_expr(&op.left, out);
            scan_shifted_refs_expr(&op.right, out);
        }
        AlgebraicExpression::UnaryOperation(op) => {
            scan_shifted_refs_expr(&op.expr, out);
        }
        _ => {}
    }
}

pub fn default_ns() -> NamespaceAnalysis {
    NamespaceAnalysis {
        source_files: Vec::new(),
        columns: Vec::new(),
        constraints: Vec::new(),
        selectors: Vec::new(),
        block_structure: None,
        complexity: NamespaceComplexity {
            total_constraints: 0,
            total_columns: 0,
            max_degree: 0,
            avg_degree: 0.0,
        },
    }
}

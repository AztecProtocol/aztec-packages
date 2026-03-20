use crate::analysis::helpers::{
    detect_boolean_constraint, format_source_ref, namespace_of, short_source_file,
};
use crate::analysis::types::{ColumnInfo, NamespaceAnalysis, NamespaceComplexity};

use powdr_ast::analyzed::{Analyzed, IdentityKind, PolynomialType, SymbolKind};
use powdr_number::FieldElement;
use std::collections::{BTreeMap, HashSet};

/// Build the initial namespace scaffolding with column catalogs.
///
/// Returns (namespaces, shifted_columns). The shifted_columns set contains
/// base column names that appear with `next == true` in any identity.
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

    // Collect committed and constant columns
    for (_name, (sym, _def)) in &analyzed.definitions {
        let poly_type = match sym.kind {
            SymbolKind::Poly(PolynomialType::Committed) => "committed",
            SymbolKind::Poly(PolynomialType::Constant) => "constant",
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
                boolean_constraint_source: None,
                is_shifted: shifted_columns.contains(&elem_name),
                referenced_by_identities: Vec::new(),
                in_lookups: Vec::new(),
                in_permutations: Vec::new(),
            });
        }
    }

    // Detect boolean constraints — dual-pass (inlined + non-inlined)
    let inlined = analyzed.identities_with_inlined_intermediate_polynomials();
    mark_booleans(&inlined, &mut namespaces);
    mark_booleans(&analyzed.identities, &mut namespaces);

    // Sort columns within each namespace by name
    for (_ns, info) in &mut namespaces {
        info.columns.sort_by(|a, b| a.name.cmp(&b.name));
        info.source_files.sort();
    }

    (namespaces, shifted_columns)
}

fn mark_booleans<F: FieldElement>(
    identities: &[powdr_ast::analyzed::Identity<powdr_ast::analyzed::AlgebraicExpression<F>>],
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
                        col.boolean_constraint_source = Some(source.clone());
                    }
                }
            }
        }
    }
}

fn scan_shifted_refs_expr<T>(
    expr: &powdr_ast::analyzed::AlgebraicExpression<T>,
    out: &mut HashSet<String>,
) {
    use powdr_ast::analyzed::AlgebraicExpression;
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


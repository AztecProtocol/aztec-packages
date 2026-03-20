#[cfg(test)]
mod tests {
    use crate::analysis::analyze;
    use crate::analysis::helpers::*;
    use powdr_number::GoldilocksField;
    use powdr_pil_analyzer::analyze_string;

    // ── helpers ──────────────────────────────────────────────

    #[test]
    fn namespace_of_simple() {
        assert_eq!(namespace_of("alu.sel"), "alu");
        assert_eq!(namespace_of("execution.pc"), "execution");
    }

    #[test]
    fn namespace_of_no_dot() {
        assert_eq!(namespace_of("sel"), "sel");
    }

    #[test]
    fn short_path_strips_vm2() {
        assert_eq!(short_path("/foo/bar/pil/vm2/alu.pil"), "alu.pil");
    }

    #[test]
    fn short_path_keeps_subdir() {
        assert_eq!(
            short_path("/foo/bar/pil/vm2/opcodes/sload.pil"),
            "opcodes/sload.pil"
        );
    }

    #[test]
    fn render_expression_simple() {
        let analyzed = analyze_string::<GoldilocksField>(
            "namespace N(16); pol commit a, b; a * b - a = 0;",
        );
        let expr = analyzed.identities[0].left.selector.as_ref().unwrap();
        let rendered = render_expression(expr);
        // Should be something like "N.a * N.b - N.a - 0"
        assert!(rendered.contains("N.a"));
        assert!(rendered.contains("N.b"));
        assert!(rendered.contains("*"));
    }

    #[test]
    fn format_field_json_small() {
        let val = GoldilocksField::from(42u64);
        assert_eq!(format_field_json(&val), "42");
    }

    #[test]
    fn format_field_json_zero() {
        let val = GoldilocksField::from(0u64);
        assert_eq!(format_field_json(&val), "0");
    }

    // ── boolean detection ───────────────────────────────────

    #[test]
    fn detect_boolean_from_identity() {
        let analyzed = analyze_string::<GoldilocksField>(
            "namespace N(16); pol commit sel; sel * (1 - sel) = 0;",
        );
        let output = analyze(&analyzed);
        let ns = output.namespaces.get("N").unwrap();
        let sel_col = ns.columns.iter().find(|c| c.name == "N.sel").unwrap();
        assert!(sel_col.is_boolean);
    }

    #[test]
    fn non_boolean_column() {
        let analyzed = analyze_string::<GoldilocksField>(
            "namespace N(16); pol commit a, b; a - b = 0;",
        );
        let output = analyze(&analyzed);
        let ns = output.namespaces.get("N").unwrap();
        for col in &ns.columns {
            assert!(!col.is_boolean, "Column {} should not be boolean", col.name);
        }
    }

    // ── shifted detection ───────────────────────────────────

    #[test]
    fn detect_shifted_column() {
        let analyzed = analyze_string::<GoldilocksField>(
            "namespace N(16); pol commit a; a' - a = 0;",
        );
        let output = analyze(&analyzed);
        let ns = output.namespaces.get("N").unwrap();
        let col = ns.columns.iter().find(|c| c.name == "N.a").unwrap();
        assert!(col.is_shifted);
    }

    #[test]
    fn unshifted_column() {
        let analyzed = analyze_string::<GoldilocksField>(
            "namespace N(16); pol commit a, b; a - b = 0;",
        );
        let output = analyze(&analyzed);
        let ns = output.namespaces.get("N").unwrap();
        for col in &ns.columns {
            assert!(!col.is_shifted, "Column {} should not be shifted", col.name);
        }
    }

    // ── classification ──────────────────────────────────────

    #[test]
    fn classify_boolean() {
        let analyzed = analyze_string::<GoldilocksField>(
            "namespace N(16); pol commit sel; sel * (1 - sel) = 0;",
        );
        let output = analyze(&analyzed);
        let ns = output.namespaces.get("N").unwrap();
        let constraint = &ns.constraints[0];
        assert!(
            constraint.classifications.contains(&"boolean".to_string()),
            "Expected 'boolean', got {:?}",
            constraint.classifications
        );
    }

    #[test]
    fn classify_propagation() {
        // col' - col = 0 when gated by a boolean is a propagation pattern
        let analyzed = analyze_string::<GoldilocksField>(
            "namespace N(16); pol commit sel, a; sel * (1 - sel) = 0; sel * (a' - a) = 0;",
        );
        let output = analyze(&analyzed);
        let ns = output.namespaces.get("N").unwrap();
        // The second constraint should be propagation
        let prop = ns
            .constraints
            .iter()
            .find(|c| c.classifications.contains(&"propagation".to_string()));
        assert!(prop.is_some(), "Expected a propagation constraint");
    }

    // ── cross-namespace connections ─────────────────────────

    #[test]
    fn cross_namespace_lookup() {
        let analyzed = analyze_string::<GoldilocksField>(
            r#"
            namespace A(16);
            pol commit sel, x;
            sel * (1 - sel) = 0;
            namespace B(16);
            pol commit sel, y;
            sel * (1 - sel) = 0;
            A.sel { A.x } in B.sel { B.y };
            "#,
        );
        let output = analyze(&analyzed);
        assert!(
            !output.cross_namespace_connections.is_empty(),
            "Expected cross-namespace connections"
        );
        let conn = &output.cross_namespace_connections[0];
        assert_eq!(conn.source_namespace, "A");
        assert_eq!(conn.dest_namespace, "B");
        assert_eq!(conn.kind, "lookup");
        assert_eq!(conn.column_mapping.len(), 1);
        assert!(conn.column_mapping[0].source_expr.contains("A.x"));
        assert!(conn.column_mapping[0].dest_expr.contains("B.y"));
    }

    // ── end-to-end ──────────────────────────────────────────

    #[test]
    fn end_to_end_schema_version() {
        let analyzed = analyze_string::<GoldilocksField>(
            "namespace N(16); pol commit a; a * (1 - a) = 0;",
        );
        let output = analyze(&analyzed);
        assert_eq!(output.schema_version, "1.0");
    }

    #[test]
    fn end_to_end_metadata_counts() {
        let analyzed = analyze_string::<GoldilocksField>(
            r#"
            namespace N(16);
            pol commit a, b;
            pol constant c;
            a - b = 0;
            a * (1 - a) = 0;
            "#,
        );
        let output = analyze(&analyzed);
        assert_eq!(output.metadata.total_columns.committed, 2);
        assert_eq!(output.metadata.total_columns.constant, 1);
        assert_eq!(output.metadata.total_constraints, 2);
    }

    #[test]
    fn end_to_end_column_cross_refs() {
        let analyzed = analyze_string::<GoldilocksField>(
            "namespace N(16); pol commit a, b; a - b = 0;",
        );
        let output = analyze(&analyzed);
        let ns = output.namespaces.get("N").unwrap();
        // Both columns should be referenced by the identity
        for col in &ns.columns {
            assert!(
                !col.referenced_by_identities.is_empty(),
                "Column {} should be referenced by at least one identity",
                col.name
            );
        }
    }

    #[test]
    fn end_to_end_unreferenced_diagnostic() {
        let analyzed = analyze_string::<GoldilocksField>(
            "namespace N(16); pol commit a, b; a * (1 - a) = 0;",
        );
        let output = analyze(&analyzed);
        // b is not referenced by any identity
        let diag = output
            .diagnostics
            .iter()
            .find(|d| d.column.as_deref() == Some("N.b"));
        assert!(diag.is_some(), "Expected diagnostic for unreferenced N.b");
        assert_eq!(diag.unwrap().level, "warning");
    }

    #[test]
    fn end_to_end_dependency_graph() {
        let analyzed = analyze_string::<GoldilocksField>(
            "namespace N(16); pol commit a, b; a - b = 0;",
        );
        let output = analyze(&analyzed);
        assert!(
            !output.dependency_graph.edges.is_empty(),
            "Expected dependency edges between a and b"
        );
        let edge = &output.dependency_graph.edges[0];
        assert_eq!(edge.edge_type, "constraint");
    }

    #[test]
    fn end_to_end_complexity() {
        let analyzed = analyze_string::<GoldilocksField>(
            r#"
            namespace N(16);
            pol commit a, b, c;
            a * b - c = 0;
            a * (1 - a) = 0;
            "#,
        );
        let output = analyze(&analyzed);
        let ns = output.namespaces.get("N").unwrap();
        assert_eq!(ns.complexity.total_constraints, 2);
        assert_eq!(ns.complexity.total_columns, 3);
        assert!(ns.complexity.max_degree >= 2);
    }

    #[test]
    fn end_to_end_serializes_to_json() {
        let analyzed = analyze_string::<GoldilocksField>(
            "namespace N(16); pol commit a; a * (1 - a) = 0;",
        );
        let output = analyze(&analyzed);
        let json = serde_json::to_string_pretty(&output);
        assert!(json.is_ok(), "Should serialize to JSON without error");
        let json_str = json.unwrap();
        assert!(json_str.contains("\"schema_version\""));
        assert!(json_str.contains("\"namespaces\""));
        assert!(json_str.contains("\"dependency_graph\""));
    }
}

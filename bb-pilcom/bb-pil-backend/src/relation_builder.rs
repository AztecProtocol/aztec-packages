use itertools::Itertools;
use powdr_ast::analyzed::AlgebraicBinaryOperation;
use powdr_ast::analyzed::AlgebraicUnaryOperation;
use powdr_ast::analyzed::Analyzed;
use powdr_ast::analyzed::Identity;
use powdr_ast::analyzed::{AlgebraicExpression, IdentityKind};
use powdr_ast::parsed::SelectedExpressions;
use std::collections::HashMap;
use std::collections::HashSet;
use std::path::Path;

use powdr_number::{DegreeType, FieldElement};

use handlebars::Handlebars;
use serde_json::json;

use crate::expression_evaluation::compute_expression;
use crate::expression_evaluation::get_alias_expressions_in_order;
use crate::expression_evaluation::get_expression_degree;
use crate::expression_evaluation::PolynomialExpression;
use crate::file_writer::BBFiles;
use crate::utils::snake_case;

/// Each created bb Identity is passed around with its degree so as needs to be manually
/// provided for sumcheck
#[derive(Debug)]
pub struct BBIdentity {
    pub original_id: u64,
    pub expression: PolynomialExpression,
    pub label: Option<String>,
}

pub trait RelationBuilder {
    /// Create Relations
    ///
    /// Takes in the ast ( for relations ), groups each of them by file, and then
    /// calls 'create relation' for each
    ///
    /// Relation output is passed back to the caller as the prover requires both:
    /// - The shifted polys
    /// - The names of the relations files created
    fn create_relations<F: FieldElement>(
        &self,
        root_name: &str,
        analyzed: &Analyzed<F>,
    ) -> Vec<String>;

    /// Create Relation
    ///
    /// Name and root name are required to determine the file path, e.g. it will be in the bberg/relations/generated
    /// followed by /root_name/name
    /// - root name should be the name provided with the --name flag
    /// - name will be a pil namespace
    ///
    /// - Identities are the identities that will be used to create the relations, they are generated within create_relations
    /// - row_type contains all of the columns that the relations namespace touches.
    fn create_relation(
        &self,
        root_name: &str,
        name: &str,
        identities: &[BBIdentity],
        subrelation_lengths: &[u64],
        skippable_if: &Option<BBIdentity>,
        alias_polys_in_order: &Vec<(String, PolynomialExpression)>,
        alias_polys_in_skippable: &Vec<(String, PolynomialExpression)>,
    );
}

impl RelationBuilder for BBFiles {
    fn create_relations<F: FieldElement>(
        &self,
        file_name: &str,
        analyzed: &Analyzed<F>,
    ) -> Vec<String> {
        // It is easier to compute the degree of the expressions once the pol aliases are inlined.
        // Vector will be (identity id, degree).
        println!("Computing degrees...");
        let all_degrees = analyzed
            .identities_with_inlined_intermediate_polynomials()
            .iter()
            .sorted_by_key(|id| id.id)
            .filter_map(|id| {
                if id.kind != IdentityKind::Polynomial {
                    None
                } else {
                    // It is strange that we use "selector" here, but that seems to be what gives you the expression.
                    let expr = id.left.selector.as_ref().unwrap();
                    Some((id.id, get_expression_degree(expr)))
                }
            })
            .collect_vec();

        // These expressions have sanitized names like: constants_NOTE_HASH_TREE_HEIGHT.
        println!("Computing alias expressions in order...");
        let alias_expressions_in_order = get_alias_expressions_in_order(analyzed);
        let alias_names = alias_expressions_in_order
            .iter()
            .map(|(name, _)| name.clone())
            .collect::<HashSet<_>>();

        // These identities' terminal objects are either fields, columns, or alias expressions.
        let mut analyzed_identities = analyzed.identities.clone();
        analyzed_identities.sort_by(|a, b| a.id.cmp(&b.id));

        // Group relations per file
        let grouped_relations: HashMap<String, Vec<Identity<AlgebraicExpression<F>>>> =
            group_relations_per_file(&analyzed_identities);
        let mut relations = grouped_relations.keys().cloned().collect_vec();
        relations.sort();

        // ----------------------- Create the relation files -----------------------
        // Skip generating relations for optimized relations
        let optimized_relations = self.get_optimized_relations_file_names();

        for (relation_name, analyzed_idents) in grouped_relations
            .iter()
            .filter(|(name, _)| !optimized_relations.contains(name))
        {
            println!("Creating identities for relation: {}", relation_name);
            let IdentitiesOutput {
                identities,
                skippable_if,
            } = create_identities(analyzed_idents, &alias_names);

            // Aliases used in the identities in this file.
            let filtered_aliases = get_transitive_aliases_for_identities(
                &identities.iter().collect_vec(),
                &alias_expressions_in_order,
            );

            let filtered_subrelation_lengths = all_degrees
                .iter()
                .filter(|(degree_id, _)| {
                    identities
                        .iter()
                        .any(|id_other| id_other.original_id == *degree_id)
                })
                // Length is degree + 1.
                .map(|(_, degree)| *degree + 1)
                .collect_vec();

            let used_alias_defs_in_order = alias_expressions_in_order
                .iter()
                .filter(|(name, _)| filtered_aliases.contains(name))
                .cloned()
                .collect_vec();
            let used_alias_defs_in_skippable = skippable_if
                .as_ref()
                .map(|id| {
                    let transitive_aliases =
                        get_transitive_aliases_for_identities(&[id], &alias_expressions_in_order);
                    alias_expressions_in_order
                        .iter()
                        .filter(|(name, _)| transitive_aliases.contains(name))
                        .cloned()
                        .collect_vec()
                })
                .unwrap_or_default();

            self.create_relation(
                file_name,
                relation_name,
                &identities,
                &filtered_subrelation_lengths,
                &skippable_if,
                &used_alias_defs_in_order,
                &used_alias_defs_in_skippable,
            );
        }

        // ----------------------- Create the file including all impls -----------------------
        let mut handlebars = Handlebars::new();
        handlebars.register_escape_fn(|s| s.to_string()); // No escaping
        handlebars
            .register_template_string(
                "relation_impls.hpp",
                std::str::from_utf8(include_bytes!("../templates/relation_impls.hpp.hbs")).unwrap(),
            )
            .unwrap();

        // Filter out any relation file names that are in the optimized relations list
        let generated_relations: Vec<String> = relations
            .iter()
            .filter(|name| !optimized_relations.contains(name))
            .cloned()
            .collect();

        let data = &json!({
            "relation_names": generated_relations,
            "optimized_relations_file_names": optimized_relations,
        });
        let relation_impls_hpp = handlebars.render("relation_impls.hpp", data).unwrap();

        self.write_file(
            Some(&self.relations),
            "relations_impls.hpp",
            &relation_impls_hpp,
        );

        relations.sort();

        relations
    }

    fn create_relation(
        &self,
        root_name: &str,
        name: &str,
        identities: &[BBIdentity],
        subrelation_lengths: &[u64],
        skippable_if: &Option<BBIdentity>,
        alias_defs_in_order: &Vec<(String, PolynomialExpression)>,
        alias_defs_in_skippable: &Vec<(String, PolynomialExpression)>,
    ) {
        let mut handlebars = Handlebars::new();
        handlebars.register_escape_fn(|s| s.to_string()); // No escaping

        let sorted_labels = identities
            .iter()
            .enumerate()
            .filter(|(_, id)| id.label.is_some())
            .map(|(idx, id)| (idx, id.label.clone().unwrap()))
            // Useful for debugging
            // .map(|(idx, id)| (idx, id.label.as_ref().unwrap_or(&id.identity).clone()))
            .collect_vec();

        let data = &json!({
            "root_name": root_name,
            "name": name,
            "identities": identities.iter().map(|id| {
                json!({
                    // We use `View` in the subrelations.
                    "expr": id.expression.instantiate_with_view(),
                    "label": id.label.clone(),
                })
            }).collect_vec(),
            "alias_defs": alias_defs_in_order.iter().map(|(name, expr)| {
                json!({
                    "name": name,
                    // Aliases do not use `View`.
                    "expr": expr.instantiate(),
                })
            }).collect_vec(),
            "skippable_if": skippable_if.as_ref().map(|id|
                // Skippable does not use `View`.
                id.expression.instantiate()),
            "subrelation_lengths": subrelation_lengths,
            "labels": sorted_labels,
            "skippable_alias_defs": alias_defs_in_skippable.iter().map(|(name, expr)| {
                json!({
                    "name": name,
                    // Aliases do not use `View`.
                    "expr": expr.instantiate(),
                })
            }).collect_vec(),
        });

        handlebars
            .register_template_string(
                "relation.hpp",
                std::str::from_utf8(include_bytes!("../templates/relation.hpp.hbs")).unwrap(),
            )
            .unwrap();
        handlebars
            .register_template_string(
                "relation_impl.hpp",
                std::str::from_utf8(include_bytes!("../templates/relation_impl.hpp.hbs")).unwrap(),
            )
            .unwrap();
        handlebars
            .register_template_string(
                "relation.cpp",
                std::str::from_utf8(include_bytes!("../templates/relation.cpp.hbs")).unwrap(),
            )
            .unwrap();

        let relation_hpp = handlebars.render("relation.hpp", data).unwrap();
        let relation_impl_hpp = handlebars.render("relation_impl.hpp", data).unwrap();
        let relation_cpp = handlebars.render("relation.cpp", data).unwrap();

        self.write_file(
            Some(&self.relations),
            &format!("{}.hpp", snake_case(name)),
            &relation_hpp,
        );
        self.write_file(
            Some(&self.relations),
            &format!("{}_impl.hpp", snake_case(name)),
            &relation_impl_hpp,
        );
        self.write_file(
            Some(&self.relations),
            &format!("{}.cpp", snake_case(name)),
            &relation_cpp,
        );
    }
}

fn get_transitive_aliases_for_identities(
    identities: &[&BBIdentity],
    alias_expressions_in_order: &Vec<(String, PolynomialExpression)>,
) -> HashSet<String> {
    let mut aliases = identities
        .iter()
        .flat_map(|id| id.expression.get_aliases())
        .collect::<HashSet<_>>();

    // Index aliases by name.
    let indexed_aliases = alias_expressions_in_order
        .iter()
        .map(|(name, expr)| (name, expr.get_aliases()))
        .collect::<HashMap<_, _>>();

    // Take transitive closure.
    let mut extended_aliases = true;
    while extended_aliases {
        let new_aliases = aliases
            .iter()
            .flat_map(|alias| indexed_aliases.get(alias).unwrap())
            .cloned()
            .collect::<HashSet<_>>();
        extended_aliases = !new_aliases.is_subset(&aliases);
        aliases.extend(new_aliases);
    }

    aliases
}

/// Group relations per file
///
/// The compiler returns all relations in one large vector, however we want to distinguish
/// which files .pil files the relations belong to for later code gen
///
/// Say we have two files foo.pil and bar.pil
/// foo.pil contains the following relations:
///    - foo1
///    - foo2
/// bar.pil contains the following relations:
///    - bar1
///    - bar2
///
/// This function will return a hashmap with the following structure:
/// {
///  "foo": [foo1, foo2],
///  "bar": [bar1, bar2]
/// }
///
/// This allows us to generate a relation.hpp file containing ONLY the relations for that .pil file
fn group_relations_per_file<F: FieldElement>(
    identities: &[Identity<AlgebraicExpression<F>>],
) -> HashMap<String, Vec<Identity<AlgebraicExpression<F>>>> {
    identities.iter().cloned().into_group_map_by(|identity| {
        identity
            .source
            .file_name
            .as_ref()
            .and_then(|file_name| Path::new(file_name.as_ref()).file_stem())
            .map(|stem| stem.to_string_lossy().into_owned())
            .unwrap_or_default()
            .replace(".pil", "")
    })
}

fn create_identity<F: FieldElement>(
    pil_identity: &Identity<AlgebraicExpression<F>>,
    alias_names: &HashSet<String>,
) -> Option<BBIdentity> {
    // We want to read the types of operators and then create the appropriate code
    if let Some(expr) = &pil_identity.left.selector {
        let poly_expr = compute_expression(expr, alias_names);
        Some(BBIdentity {
            original_id: pil_identity.id,
            expression: poly_expr,
            label: pil_identity.attribute.clone(),
        })
    } else {
        None
    }
}

pub struct IdentitiesOutput {
    identities: Vec<BBIdentity>,
    skippable_if: Option<BBIdentity>,
}

pub(crate) fn create_identities<F: FieldElement>(
    identities: &[Identity<AlgebraicExpression<F>>],
    alias_names: &HashSet<String>,
) -> IdentitiesOutput {
    // We only want the expressions for now
    // When we have a poly type, we only need the left side of it since they are normalized to `left = 0`.
    let ids = identities
        .iter()
        .filter(|identity| identity.kind == IdentityKind::Polynomial)
        .collect::<Vec<_>>();

    let mut identities = Vec::new();
    let mut skippable_if_identity = None;

    for pil_identity in ids.iter() {
        let bb_identity = create_identity(&pil_identity, alias_names).unwrap();

        if bb_identity
            .label
            .clone()
            .is_some_and(|l| l == "skippable_if")
        {
            assert!(skippable_if_identity.is_none());
            skippable_if_identity = Some(bb_identity);
        } else {
            identities.push(bb_identity);
        }
    }

    IdentitiesOutput {
        identities,
        skippable_if: skippable_if_identity,
    }
}

pub fn get_shifted_polys<F: FieldElement>(expressions: Vec<AlgebraicExpression<F>>) -> Vec<String> {
    let mut shifted_polys = HashSet::<String>::new();
    for expr in expressions {
        match expr {
            AlgebraicExpression::Reference(polyref) => {
                if polyref.next {
                    shifted_polys.insert(polyref.name.clone());
                }
            }
            AlgebraicExpression::BinaryOperation(AlgebraicBinaryOperation {
                left: lhe,
                right: rhe,
                ..
            }) => {
                shifted_polys.extend(get_shifted_polys(vec![*lhe]));
                shifted_polys.extend(get_shifted_polys(vec![*rhe]));
            }
            AlgebraicExpression::UnaryOperation(AlgebraicUnaryOperation { expr, .. }) => {
                shifted_polys.extend(get_shifted_polys(vec![*expr]));
            }
            _ => continue,
        }
    }
    shifted_polys.into_iter().collect()
}

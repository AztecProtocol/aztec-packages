use crate::file_writer::BBFiles;
use itertools::Itertools;
use powdr_ast::{
    analyzed::{AlgebraicExpression, Analyzed, IdentityKind},
    parsed::SelectedExpressions,
};
use powdr_number::FieldElement;

use handlebars::Handlebars;
use serde_json::{json, Value as Json};
use std::path::Path;

use crate::utils::sanitize_name;

#[derive(Debug)]
/// Lookup
///
/// Contains the information required to produce a lookup relation
/// Lookup object and lookup side object are very similar in structure, however they are duplicated for
/// readability.
pub struct Lookup {
    /// The name of the lookup
    pub name: String,
    /// The relation in which the lookup was declared
    pub owning_relation: String,
    /// The file name of the lookup
    pub file_name: String,
    /// The inverse column name
    pub inverse: String,
    /// The name of the counts polynomial that stores the number of times a lookup is read
    pub counts_poly: String,
    /// the left side of the lookup
    pub left: LookupSide,
    /// the right side of the lookup
    pub right: LookupSide,
}

#[derive(Debug)]
/// LookupSide
///
/// One side of a two sided lookup relationship
pub struct LookupSide {
    /// -> Option<String> - the selector for the lookup ( on / off toggle )
    selector: Option<String>,
    /// The columns involved in this side of the lookup
    cols: Vec<String>,
}

pub trait LookupBuilder {
    /// Takes in an AST and works out what lookup relations are needed
    /// Note: returns the name of the inverse columns, such that they can be added to the prover in subsequent steps
    fn create_lookup_files<F: FieldElement>(
        &self,
        analyzed: &Analyzed<F>,
        vm_name: &str,
    ) -> Vec<Lookup>;
}

impl LookupBuilder for BBFiles {
    fn create_lookup_files<F: FieldElement>(
        &self,
        analyzed: &Analyzed<F>,
        vm_name: &str,
    ) -> Vec<Lookup> {
        let lookups = analyzed
            .identities
            .iter()
            .filter(|identity| matches!(identity.kind, IdentityKind::Plookup))
            .map(|lookup| {
                let label = lookup
                    .attribute
                    .clone()
                    .expect(
                        "Inverse column name must be provided within lookup attribute - #[<here>]",
                    )
                    .to_lowercase();
                let relation = lookup
                    .source
                    .file_name
                    .as_ref()
                    .and_then(|file_name| Path::new(file_name.as_ref()).file_stem())
                    .map(|stem| stem.to_string_lossy().into_owned())
                    .unwrap_or_default()
                    .replace(".pil", "");
                let name = format!("lookup_{}_{}", relation, label);
                Lookup {
                    name: name.clone(),
                    owning_relation: relation.clone(),
                    file_name: format!("lookups_{}.hpp", relation),
                    inverse: format!("{}_inv", &name),
                    counts_poly: format!("{}_counts", &name),
                    left: get_lookup_side(&lookup.left),
                    right: get_lookup_side(&lookup.right),
                }
            })
            .collect_vec();

        let lookups_per_relation = lookups.iter().into_group_map_by(|lookup| &lookup.owning_relation);

        let mut handlebars = Handlebars::new();

        handlebars
            .register_template_string(
                "lookup.hpp",
                std::str::from_utf8(include_bytes!("../templates/lookup.hpp.hbs")).unwrap(),
            )
            .unwrap();
        // All instantiations together.
        handlebars
            .register_template_string(
                "lookup.cpp",
                std::str::from_utf8(include_bytes!("../templates/lookup.cpp.hbs")).unwrap(),
            )
            .unwrap();

        for (owning_relation, lookups) in lookups_per_relation {
            let datas = lookups
                .iter()
                .map(|lookup| create_lookup_settings_data(lookup))
                .collect_vec();
            let data_wrapper = json!({
                "root_name": vm_name,
                "lookups": datas,
                "owning_relation": owning_relation,
                "lookup_names": lookups.iter().map(|lookup| lookup.name.clone()).collect_vec(),
            });
            let lookup_settings = handlebars.render("lookup.hpp", &data_wrapper).unwrap();
            let lookup_instantiations = handlebars.render("lookup.cpp", &data_wrapper).unwrap();

            self.write_file(Some(&self.relations), &format!("lookups_{}.hpp", owning_relation), &lookup_settings);
            self.write_file(Some(&self.relations), &format!("lookups_{}.cpp", owning_relation), &lookup_instantiations);
        }

        // let data_wrapper = json!({
        //     "root_name": vm_name,
        //     "lookups": lookups.iter().map(|lookup| lookup.name.clone()).collect_vec(),
        // });
        // let lookup_instantiations = handlebars.render("lookup.cpp", &data_wrapper).unwrap();
        // self.write_file(Some(&self.relations), "lookup_instantiations.cpp", &lookup_instantiations);

        lookups
    }
}

/// The attributes of a lookup contain the name of the inverse, we collect all of these to create the inverse column
pub fn get_inverses_from_lookups(lookups: &[Lookup]) -> Vec<String> {
    lookups
        .iter()
        .map(|lookup| lookup.inverse.clone())
        .collect()
}

pub fn get_counts_from_lookups(lookups: &[Lookup]) -> Vec<String> {
    lookups
        .iter()
        .map(|lookup| lookup.counts_poly.clone())
        .collect()
}

fn create_lookup_settings_data(lookup: &Lookup) -> Json {
    let columns_per_set = lookup.left.cols.len();

    // NOTE: https://github.com/AztecProtocol/aztec-packages/issues/3879
    // Settings are not flexible enough to combine inverses
    let lhs_selector = lookup
        .left
        .selector
        .clone()
        .expect("Left hand side selector for lookup required");
    let rhs_selector = lookup
        .right
        .selector
        .clone()
        .expect("Right hand side selector for lookup required");
    let lhs_cols = lookup.left.cols.clone();
    let rhs_cols = lookup.right.cols.clone();

    assert!(
        lhs_cols.len() == rhs_cols.len(),
        "Lookup columns lhs must be the same length as rhs"
    );

    // NOTE: these are hardcoded as 1 for now until more optimizations are required
    let read_terms = 1;
    let write_terms = 1;
    let lookup_tuple_size = columns_per_set;

    // NOTE: hardcoded until optimizations required
    let inverse_degree = 4;
    let read_term_degree = 0;
    let write_term_degree = 0;
    let read_term_types = "{0}".to_owned();
    let write_term_types = "{0}".to_owned();

    json!({
        "lookup_name": lookup.name,
        "relation_name": lookup.owning_relation,
        "lhs_selector": lhs_selector,
        "rhs_selector": rhs_selector,
        "lhs_cols": lhs_cols,
        "rhs_cols": rhs_cols,
        "inverses_col": lookup.inverse.clone(),
        "counts_col": lookup.counts_poly,
        "read_terms": read_terms,
        "write_terms": write_terms,
        "lookup_tuple_size": lookup_tuple_size,
        "inverse_degree": inverse_degree,
        "read_term_degree": read_term_degree,
        "write_term_degree": write_term_degree,
        "read_term_types": read_term_types,
        "write_term_types": write_term_types,
    })
}

fn get_lookup_side<F: FieldElement>(
    def: &SelectedExpressions<AlgebraicExpression<F>>,
) -> LookupSide {
    let get_name = |expr: &AlgebraicExpression<F>| match expr {
        AlgebraicExpression::Reference(a_ref) => {
            let mut name = a_ref.name.clone();
            if a_ref.next {
                name = format!("{}_shift", name);
            }
            sanitize_name(&name)
        }
        _ => panic!("Expected reference"),
    };

    LookupSide {
        selector: def.selector.as_ref().map(get_name),
        cols: def.expressions.iter().map(get_name).collect_vec(),
    }
}

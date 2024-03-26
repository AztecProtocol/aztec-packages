use iter_extended::vecmap;
use noirc_frontend::{
    graph::CrateId,
    hir::def_map::LocalModuleId,
    macros_api::{FileId, HirContext, ModuleDefId, StructId},
    node_interner::TraitId,
    Signedness, Type,
};

use super::ast_utils::is_custom_attribute;

pub fn collect_crate_structs(crate_id: &CrateId, context: &HirContext) -> Vec<StructId> {
    context
        .def_map(crate_id)
        .expect("ICE: Missing crate in def_map")
        .modules()
        .iter()
        .flat_map(|(_, module)| {
            module.type_definitions().filter_map(|typ| {
                if let ModuleDefId::TypeId(struct_id) = typ {
                    Some(struct_id)
                } else {
                    None
                }
            })
        })
        .collect()
}

pub fn collect_traits(context: &HirContext) -> Vec<TraitId> {
    let crates = context.crates();
    crates
        .flat_map(|crate_id| context.def_map(&crate_id).map(|def_map| def_map.modules()))
        .flatten()
        .flat_map(|module| {
            module.type_definitions().filter_map(|typ| {
                if let ModuleDefId::TraitId(struct_id) = typ {
                    Some(struct_id)
                } else {
                    None
                }
            })
        })
        .collect()
}

/// Computes the aztec signature for a resolved type.
pub fn signature_of_type(typ: &Type) -> String {
    match typ {
        Type::Integer(Signedness::Signed, bit_size) => format!("i{}", bit_size),
        Type::Integer(Signedness::Unsigned, bit_size) => format!("u{}", bit_size),
        Type::FieldElement => "Field".to_owned(),
        Type::Bool => "bool".to_owned(),
        Type::Array(len, typ) => {
            if let Type::Constant(len) = **len {
                format!("[{};{len}]", signature_of_type(typ))
            } else {
                unimplemented!("Cannot generate signature for array with length type {:?}", typ)
            }
        }
        Type::Struct(def, args) => {
            let fields = def.borrow().get_fields(args);
            let fields = vecmap(fields, |(_, typ)| signature_of_type(&typ));
            format!("({})", fields.join(","))
        }
        Type::Tuple(types) => {
            let fields = vecmap(types, signature_of_type);
            format!("({})", fields.join(","))
        }
        _ => unimplemented!("Cannot generate signature for type {:?}", typ),
    }
}

// Fetches the name of all structs that implement trait_name, both in the current crate and all of its dependencies.
pub fn fetch_note_names(context: &mut HirContext, crate_id: &CrateId) -> Vec<String> {
    collect_crate_structs(crate_id, context)
        .iter()
        .filter_map(|&struct_id| {
            let r#struct = context.def_interner.get_struct(struct_id);
            let attributes = context.def_interner.struct_attributes(&struct_id);
            if attributes.iter().any(|attr| is_custom_attribute(attr, "aztec(note)")) {
                Some(r#struct.borrow().name.0.contents.clone())
            } else {
                None
            }
        })
        .collect()
}

pub fn get_contract_module_data(
    context: &mut HirContext,
    crate_id: &CrateId,
) -> Option<(LocalModuleId, FileId)> {
    // We first fetch modules in this crate which correspond to contracts, along with their file id.
    let contract_module_file_ids: Vec<(LocalModuleId, FileId)> = context
        .def_map(crate_id)
        .expect("ICE: Missing crate in def_map")
        .modules()
        .iter()
        .filter(|(_, module)| module.is_contract)
        .map(|(idx, module)| (LocalModuleId(idx), module.location.file))
        .collect();

    // If the current crate does not contain a contract module we simply skip it. More than 1 contract in a crate is forbidden by the compiler
    if contract_module_file_ids.is_empty() {
        return None;
    }

    Some(contract_module_file_ids[0])
}

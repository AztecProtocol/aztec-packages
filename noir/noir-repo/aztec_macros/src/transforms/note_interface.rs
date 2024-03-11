use noirc_errors::Span;
use noirc_frontend::{
    parse_program, parser::SortedModule, FunctionVisibility, NoirFunction, NoirStruct,
    TraitImplItem, TypeImpl, UnresolvedTypeData, UnresolvedTypeExpression,
};
use regex::Regex;

use crate::utils::{ast_utils::check_trait_method_implemented, errors::AztecMacroError};

pub fn generate_note_interface_impl(module: &mut SortedModule) -> Result<(), AztecMacroError> {
    let mut note_interface_trait_impls = vec![];

    module.trait_impls.iter_mut().for_each(|trait_imp| {
        let trait_name = trait_imp.trait_name.segments.last();
        if trait_name.is_some() {
            if trait_name.unwrap().0.contents == "NoteInterface" {
                note_interface_trait_impls.push(trait_imp)
            }
        }
    });

    for trait_imp in note_interface_trait_impls {
        match &trait_imp.object_type.typ {
            UnresolvedTypeData::Named(struct_path, _, _) => {
                let note_struct = module
                    .types
                    .iter()
                    .find(|typ| typ.name.0.contents == struct_path.last_segment().0.contents)
                    .ok_or(AztecMacroError::CouldNotImplementNoteSerialization {
                        span: trait_imp.object_type.span,
                        typ: trait_imp.object_type.typ.clone(),
                    })?;

                let existing_impl =
                    module.impls.iter_mut().find(|r#impl| match &r#impl.object_type.typ {
                        UnresolvedTypeData::Named(path, _, _) => {
                            path.last_segment().eq(&struct_path.last_segment())
                        }
                        _ => false,
                    });
                let note_impl = if existing_impl.is_none() {
                    let default_impl = TypeImpl {
                        object_type: trait_imp.object_type.clone(),
                        type_span: Span::default(),
                        generics: vec![],
                        methods: vec![],
                    };
                    module.impls.push(default_impl.clone());
                    module.impls.last_mut().unwrap()
                } else {
                    existing_impl.unwrap()
                };
                let note_type = note_struct.name.0.contents.to_string();
                let mut note_fields = vec![];
                let note_serialized_len = match &trait_imp.trait_generics[0].typ {
                    UnresolvedTypeData::Named(path, _, _) => {
                        Ok(path.last_segment().0.contents.to_string())
                    }
                    UnresolvedTypeData::Expression(UnresolvedTypeExpression::Constant(val, _)) => {
                        Ok(val.to_string())
                    }
                    _ => Err(AztecMacroError::CouldNotImplementNoteSerialization {
                        span: trait_imp.object_type.span,
                        typ: trait_imp.object_type.typ.clone(),
                    }),
                }?;
                for (field_ident, field_type) in note_struct.fields.iter() {
                    note_fields.push((
                        field_ident.0.contents.to_string(),
                        field_type.typ.to_string().replace("plain::", ""),
                    ));
                }
                if !check_trait_method_implemented(trait_imp, "serialize_content")
                    && !check_trait_method_implemented(trait_imp, "deserialize_content")
                    && note_impl
                        .methods
                        .iter()
                        .find(|(func, _)| func.def.name.0.contents == "fields")
                        .is_none()
                {
                    module.types.push(generate_note_fields_struct(&note_type, &note_fields));
                    note_impl
                        .methods
                        .push((generate_note_fields_fn(&note_type, &note_fields), Span::default()));
                    trait_imp.items.push(TraitImplItem::Function(generate_note_serialize_content(
                        &note_type,
                        &note_fields,
                        &note_serialized_len,
                    )));
                    trait_imp.items.push(TraitImplItem::Function(
                        generate_note_deserialize_content(
                            &note_type,
                            &note_fields,
                            &note_serialized_len,
                        ),
                    ));
                }
                if !check_trait_method_implemented(trait_imp, "get_header") {
                    trait_imp
                        .items
                        .push(TraitImplItem::Function(generate_note_get_header(&note_type)));
                }
                if !check_trait_method_implemented(trait_imp, "set_header") {
                    trait_imp
                        .items
                        .push(TraitImplItem::Function(generate_note_set_header(&note_type)));
                }
                if !check_trait_method_implemented(trait_imp, "get_note_type_id") {
                    trait_imp
                        .items
                        .push(TraitImplItem::Function(generate_note_get_type_id(&note_type)));
                }
            }
            _ => {
                return Err(AztecMacroError::CouldNotImplementNoteSerialization {
                    span: trait_imp.object_type.span,
                    typ: trait_imp.object_type.typ.clone(),
                })
            }
        };
    }
    Ok(())
}

fn generate_note_get_header(note_type: &String) -> NoirFunction {
    let function_source = format!(
        "
        fn get_header(note: {}) -> dep::aztec::note::note_header::NoteHeader {{
            note.header
        }}
    ",
        note_type
    )
    .to_string();

    let (function_ast, errors) = parse_program(&function_source);
    if !errors.is_empty() {
        dbg!(errors.clone());
    }
    assert_eq!(errors.len(), 0, "Failed to parse Noir macro code. This is either a bug in the compiler or the Noir macro code");

    let mut function_ast = function_ast.into_sorted();
    let mut noir_fn = function_ast.functions.remove(0);
    noir_fn.def.visibility = FunctionVisibility::Public;
    noir_fn
}

fn generate_note_set_header(note_type: &String) -> NoirFunction {
    let function_source = format!(
        "
        fn set_header(self: &mut {}, header: dep::aztec::note::note_header::NoteHeader) {{
            self.header = header;
        }}
    ",
        note_type
    );

    let (function_ast, errors) = parse_program(&function_source);
    if !errors.is_empty() {
        dbg!(errors.clone());
    }
    assert_eq!(errors.len(), 0, "Failed to parse Noir macro code. This is either a bug in the compiler or the Noir macro code");

    let mut function_ast = function_ast.into_sorted();
    let mut noir_fn = function_ast.functions.remove(0);
    noir_fn.def.visibility = FunctionVisibility::Public;
    noir_fn
}

fn generate_note_get_type_id(note_type: &String) -> NoirFunction {
    let note_id =
        note_type.chars().map(|c| (c as u32).to_string()).collect::<Vec<String>>().join("");
    let function_source = format!(
        "
        fn get_note_type_id() -> Field {{
            {}
        }}
    ",
        note_id
    )
    .to_string();

    let (function_ast, errors) = parse_program(&function_source);
    if !errors.is_empty() {
        dbg!(errors.clone());
    }
    assert_eq!(errors.len(), 0, "Failed to parse Noir macro code. This is either a bug in the compiler or the Noir macro code");

    let mut function_ast = function_ast.into_sorted();
    let mut noir_fn = function_ast.functions.remove(0);
    noir_fn.def.visibility = FunctionVisibility::Public;
    noir_fn
}

fn generate_note_fields_struct(
    note_type: &String,
    note_fields: &Vec<(String, String)>,
) -> NoirStruct {
    let struct_source = generate_note_fields_struct_source(note_type, note_fields);

    let (struct_ast, errors) = parse_program(&struct_source);
    if !errors.is_empty() {
        dbg!(errors.clone());
    }
    assert_eq!(errors.len(), 0, "Failed to parse Noir macro code. This is either a bug in the compiler or the Noir macro code");

    let mut struct_ast = struct_ast.into_sorted();
    struct_ast.types.remove(0)
}

fn generate_note_deserialize_content(
    note_type: &String,
    note_fields: &Vec<(String, String)>,
    note_serialize_len: &String,
) -> NoirFunction {
    let function_source =
        generate_note_deserialize_content_source(note_type, note_fields, note_serialize_len);

    let (function_ast, errors) = parse_program(&function_source);
    if !errors.is_empty() {
        dbg!(errors.clone());
    }
    assert_eq!(errors.len(), 0, "Failed to parse Noir macro code. This is either a bug in the compiler or the Noir macro code");

    let mut function_ast = function_ast.into_sorted();
    let mut noir_fn = function_ast.functions.remove(0);
    noir_fn.def.visibility = FunctionVisibility::Public;
    noir_fn
}

fn generate_note_serialize_content(
    note_type: &String,
    note_fields: &Vec<(String, String)>,
    note_serialize_len: &String,
) -> NoirFunction {
    let function_source =
        generate_note_serialize_content_source(note_type, note_fields, note_serialize_len);

    let (function_ast, errors) = parse_program(&function_source);
    if !errors.is_empty() {
        dbg!(errors.clone());
    }
    assert_eq!(errors.len(), 0, "Failed to parse Noir macro code. This is either a bug in the compiler or the Noir macro code");

    let mut function_ast = function_ast.into_sorted();
    let mut noir_fn = function_ast.functions.remove(0);
    noir_fn.def.visibility = FunctionVisibility::Public;
    noir_fn
}

fn generate_note_fields_fn(
    note_type: &String,
    note_fields: &Vec<(String, String)>,
) -> NoirFunction {
    let function_source = generate_note_fields_fn_source(note_type, note_fields);
    let (function_ast, errors) = parse_program(&function_source);
    if !errors.is_empty() {
        dbg!(errors.clone());
    }
    assert_eq!(errors.len(), 0, "Failed to parse Noir macro code. This is either a bug in the compiler or the Noir macro code");

    let mut function_ast = function_ast.into_sorted();
    let mut noir_fn = function_ast.functions.remove(0);
    noir_fn.def.visibility = FunctionVisibility::Public;
    noir_fn
}

fn generate_note_fields_struct_source(
    note_type: &String,
    note_fields: &Vec<(String, String)>,
) -> String {
    let note_field_selectors = note_fields
        .iter()
        .filter_map(|(field_name, _)| {
            if field_name != "header" {
                Some(format!(
                    "{}: dep::aztec::note::note_getter_options::FieldSelector",
                    field_name
                ))
            } else {
                None
            }
        })
        .collect::<Vec<String>>()
        .join(",\n");
    format!(
        "
        struct {}Fields {{
            {}
        }}",
        note_type, note_field_selectors
    )
    .to_string()
}

fn generate_note_fields_fn_source(
    note_type: &String,
    note_fields: &Vec<(String, String)>,
) -> String {
    let note_field_selectors = note_fields
        .iter()
        .enumerate()
        .filter_map(|(index, (field_name, _))| {
            if field_name != "header" {
                Some(format!(
                    "{}: dep::aztec::note::note_getter_options::FieldSelector {{ index: {}, offset: 0, length: 32 }}",
                    field_name,
                    index
                ))
            } else {
                None
            }
        })
        .collect::<Vec<String>>()
        .join(", ");
    format!(
        "
        pub fn fields() -> {}Fields {{
            {}Fields {{
                {}
            }}
        }}",
        note_type, note_type, note_field_selectors
    )
    .to_string()
}

fn generate_note_serialize_content_source(
    note_type: &String,
    note_fields: &Vec<(String, String)>,
    note_serialize_len: &String,
) -> String {
    let note_fields = note_fields
        .iter()
        .filter_map(|(field_name, field_type)| {
            if field_name != "header" {
                if field_type == "Field" {
                    Some(format!("self.{}", field_name))
                } else {
                    Some(format!("self.{}.to_field()", field_name))
                }
            } else {
                None
            }
        })
        .collect::<Vec<String>>()
        .join(", ");
    format!(
        "
        fn serialize_content(self: {}) -> [Field; {}] {{
            [{}]
        }}",
        note_type, note_serialize_len, note_fields
    )
    .to_string()
}

fn generate_note_deserialize_content_source(
    note_type: &String,
    note_fields: &Vec<(String, String)>,
    note_serialize_len: &String,
) -> String {
    let note_fields = note_fields
        .iter()
        .enumerate()
        .map(|(index, (field_name, field_type))| {
            if field_name != "header" {
                // TODO: Simplify this when https://github.com/noir-lang/noir/issues/4463 is fixed
                if field_type.eq("Field") || Regex::new(r"u[0-9]+").unwrap().is_match(&field_type) {
                    format!("{}: serialized_note[{}] as {},", field_name, index, field_type)
                } else {
                    format!(
                        "{}: {}::from_field(serialized_note[{}]),",
                        field_name, field_type, index
                    )
                }
            } else {
                "header: dep::aztec::note::note_header::NoteHeader::empty()".to_string()
            }
        })
        .collect::<Vec<String>>()
        .join("\n");
    format!(
        "
        fn deserialize_content(serialized_note: [Field; {}]) -> Self {{
            {} {{
                {}
            }}
        }}",
        note_serialize_len, note_type, note_fields
    )
    .to_string()
}

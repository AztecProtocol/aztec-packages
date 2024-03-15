use noirc_errors::Span;
use noirc_frontend::{
    parse_program, parser::SortedModule, ItemVisibility, NoirFunction, NoirStruct, PathKind,
    TraitImplItem, TypeImpl, UnresolvedTypeData, UnresolvedTypeExpression,
};
use regex::Regex;

use crate::{
    chained_dep,
    utils::{
        ast_utils::{
            check_trait_method_implemented, ident, ident_path, is_custom_attribute, make_type,
        },
        errors::AztecMacroError,
    },
};

// Automatic implementation of most of the methods in the NoteInterface trait, guiding the user with meaningful error messages in case some
// methods must be implemented manually.
pub fn generate_note_interface_impl(module: &mut SortedModule) -> Result<(), AztecMacroError> {
    // Find structs annotated with #[aztec(note)]
    let annotated_note_structs = module
        .types
        .iter_mut()
        .filter(|typ| typ.attributes.iter().any(|attr| is_custom_attribute(attr, "aztec(note)")));

    let mut note_fields_structs = vec![];

    for note_struct in annotated_note_structs {
        // Look for the NoteInterface trait implementation for the note
        let trait_impl = module
            .trait_impls
            .iter_mut()
            .find(|trait_impl| {
                if let UnresolvedTypeData::Named(struct_path, _, _) = &trait_impl.object_type.typ {
                    struct_path.last_segment() == note_struct.name
                        && trait_impl.trait_name.last_segment().0.contents == "NoteInterface"
                } else {
                    false
                }
            })
            .ok_or(AztecMacroError::CouldNotImplementNoteInterface {
                span: Some(note_struct.name.span()),
                secondary_message: Some(format!(
                    "Could not find NoteInterface trait implementation for note: {}",
                    note_struct.name.0.contents
                )),
            })?;
        // Look for the note struct implementation, generate a default one if it doesn't exist (in order to append methods to it)
        let existing_impl = module.impls.iter_mut().find(|r#impl| match &r#impl.object_type.typ {
            UnresolvedTypeData::Named(path, _, _) => path.last_segment().eq(&note_struct.name),
            _ => false,
        });
        let note_impl = if let Some(note_impl) = existing_impl {
            note_impl
        } else {
            let default_impl = TypeImpl {
                object_type: trait_impl.object_type.clone(),
                type_span: note_struct.name.span(),
                generics: vec![],
                methods: vec![],
            };
            module.impls.push(default_impl.clone());
            module.impls.last_mut().unwrap()
        };
        // Identify the note type (struct name), its fields and its serialized length (generic param of NoteInterface trait impl)
        let note_type = note_struct.name.0.contents.to_string();
        let mut note_fields = vec![];
        let note_serialized_len = match &trait_impl.trait_generics[0].typ {
            UnresolvedTypeData::Named(path, _, _) => Ok(path.last_segment().0.contents.to_string()),
            UnresolvedTypeData::Expression(UnresolvedTypeExpression::Constant(val, _)) => {
                Ok(val.to_string())
            }
            _ => Err(AztecMacroError::CouldNotImplementNoteInterface {
                span: trait_impl.object_type.span,
                secondary_message: Some(format!(
                    "Cannot find note serialization length for: {}",
                    note_type
                )),
            }),
        }?;

        // Automatically inject the header field if it's not present
        if !note_struct.fields.iter().any(|(_, field_type)| match &field_type.typ {
            UnresolvedTypeData::Named(path, _, _) => path.last_segment().0.contents == "NoteHeader",
            _ => false,
        }) {
            note_struct.fields.push((
                ident("header"),
                make_type(UnresolvedTypeData::Named(
                    chained_dep!("aztec", "note", "note_header", "NoteHeader"),
                    vec![],
                    false,
                )),
            ));
        }
        for (field_ident, field_type) in note_struct.fields.iter() {
            note_fields.push((
                field_ident.0.contents.to_string(),
                field_type.typ.to_string().replace("plain::", ""),
            ));
        }

        let note_interface_impl_span = trait_impl.object_type.span;

        if !check_trait_method_implemented(trait_impl, "serialize_content")
            && !check_trait_method_implemented(trait_impl, "deserialize_content")
            && !note_impl.methods.iter().any(|(func, _)| func.def.name.0.contents == "fields")
        {
            // Generate the serialize_content method as
            //
            // fn serialize_content(self: {}) -> [Field; NOTE_SERIALIZED_LEN] {
            //   [self.note_field1 as Field, self.note_field2.to_field()...]
            // }
            //
            // It assumes every struct field can be converted either via the to_field() trait (structs) or cast as Field (integers)
            let note_serialize_content_fn = generate_note_serialize_content(
                &note_type,
                &note_fields,
                &note_serialized_len,
                note_interface_impl_span,
            )?;
            trait_impl.items.push(TraitImplItem::Function(note_serialize_content_fn));

            // Generate the deserialize_content method as
            //
            // fn deserialize_content(serialized_note: [Field; NOTE_SERILIZED_LEN]) -> Self {
            //     NoteType {
            //        note_field1: serialized_note[0] as Field,
            //        note_field2: NoteFieldType2::from_field(serialized_note[1])...
            //     }
            // }
            // It assumes every note field is stored in an individual serialized field,
            // and can be converted to the original type via the from_field() trait (structs) or cast as Field (integers)

            let note_deserialize_content_fn = generate_note_deserialize_content(
                &note_type,
                &note_fields,
                &note_serialized_len,
                note_interface_impl_span,
            )?;
            trait_impl.items.push(TraitImplItem::Function(note_deserialize_content_fn));

            // Automatically generate a struct that represents the note's serialization metadata, and an auxiliary function to retrieve it
            // The struct looks like this
            //
            // NoteTypeFields {
            //     field1: FieldSelector { index: 0, offset: 0, length: 32 },
            //     field2: FieldSelector { index: 1, offset: 0, length: 32 },
            //     ...
            // }
            //
            // It assumes each field occupies an entire field and its serialized in definition order

            let note_fields_struct =
                generate_note_fields_struct(&note_type, &note_fields, note_interface_impl_span)?;
            note_fields_structs.push(note_fields_struct);
            let note_fields_fn =
                generate_note_fields_fn(&note_type, &note_fields, note_interface_impl_span)?;
            note_impl.methods.push((note_fields_fn, note_impl.type_span));
        }

        // Automatically generate the header getter and setter methods
        if !check_trait_method_implemented(trait_impl, "get_header") {
            let get_header_fn = generate_note_get_header(&note_type, note_interface_impl_span)?;
            trait_impl.items.push(TraitImplItem::Function(get_header_fn));
        }
        if !check_trait_method_implemented(trait_impl, "set_header") {
            let set_header_fn = generate_note_set_header(&note_type, note_interface_impl_span)?;
            trait_impl.items.push(TraitImplItem::Function(set_header_fn));
        }

        // Automatically generate the note type id getter method. The id itself its calculated as the concatenation
        // of the conversion of the characters in the note's struct name to unsigned integers.
        if !check_trait_method_implemented(trait_impl, "get_note_type_id") {
            let get_note_type_id_fn =
                generate_note_get_type_id(&note_type, note_interface_impl_span)?;
            trait_impl.items.push(TraitImplItem::Function(get_note_type_id_fn));
        }

        // Automatically generate the method to compute the note's content hash as:
        // fn compute_note_content_hash(self: NoteType) -> Field {
        //    // TODO(#1205) Should use a non-zero generator index.
        //    dep::aztec::hash::pedersen_hash(self.serialize_content(), 0)
        // }
        //
        if !check_trait_method_implemented(trait_impl, "compute_note_content_hash") {
            let get_header_fn =
                generate_compute_note_content_hash(&note_type, note_interface_impl_span)?;
            trait_impl.items.push(TraitImplItem::Function(get_header_fn));
        }
    }

    module.types.extend(note_fields_structs);
    Ok(())
}

fn generate_note_get_header(
    note_type: &String,
    impl_span: Option<Span>,
) -> Result<NoirFunction, AztecMacroError> {
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
        return Err(AztecMacroError::CouldNotImplementNoteInterface {
            secondary_message: Some("Failed to parse Noir macro code (fn get_header). This is either a bug in the compiler or the Noir macro code".to_string()),
            span: impl_span
        });
    }

    let mut function_ast = function_ast.into_sorted();
    let mut noir_fn = function_ast.functions.remove(0);
    noir_fn.def.visibility = ItemVisibility::Public;
    Ok(noir_fn)
}

fn generate_note_set_header(
    note_type: &String,
    impl_span: Option<Span>,
) -> Result<NoirFunction, AztecMacroError> {
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
        dbg!(errors);
        return Err(AztecMacroError::CouldNotImplementNoteInterface  {
            secondary_message: Some("Failed to parse Noir macro code (fn set_header). This is either a bug in the compiler or the Noir macro code".to_string()),
            span: impl_span
        });
    }

    let mut function_ast = function_ast.into_sorted();
    let mut noir_fn = function_ast.functions.remove(0);
    noir_fn.def.visibility = ItemVisibility::Public;
    Ok(noir_fn)
}

fn generate_note_get_type_id(
    note_type: &str,
    impl_span: Option<Span>,
) -> Result<NoirFunction, AztecMacroError> {
    // TODO(#4519) Improve automatic note id generation and assignment
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
        dbg!(errors);
        return Err(AztecMacroError::CouldNotImplementNoteInterface {
            secondary_message: Some("Failed to parse Noir macro code (fn get_note_type_id). This is either a bug in the compiler or the Noir macro code".to_string()),
            span: impl_span
        });
    }

    let mut function_ast = function_ast.into_sorted();
    let mut noir_fn = function_ast.functions.remove(0);
    noir_fn.def.visibility = ItemVisibility::Public;
    Ok(noir_fn)
}

fn generate_note_fields_struct(
    note_type: &str,
    note_fields: &[(String, String)],
    impl_span: Option<Span>,
) -> Result<NoirStruct, AztecMacroError> {
    let struct_source = generate_note_fields_struct_source(note_type, note_fields);

    let (struct_ast, errors) = parse_program(&struct_source);
    if !errors.is_empty() {
        dbg!(errors);
        return Err(AztecMacroError::CouldNotImplementNoteInterface {
            secondary_message: Some(format!("Failed to parse Noir macro code (struct {}Fields). This is either a bug in the compiler or the Noir macro code", note_type)),
            span: impl_span
        });
    }

    let mut struct_ast = struct_ast.into_sorted();
    Ok(struct_ast.types.remove(0))
}

fn generate_note_deserialize_content(
    note_type: &str,
    note_fields: &[(String, String)],
    note_serialize_len: &String,
    impl_span: Option<Span>,
) -> Result<NoirFunction, AztecMacroError> {
    let function_source =
        generate_note_deserialize_content_source(note_type, note_fields, note_serialize_len);

    let (function_ast, errors) = parse_program(&function_source);
    if !errors.is_empty() {
        dbg!(errors);
        return Err(AztecMacroError::CouldNotImplementNoteInterface {
            secondary_message: Some("Failed to parse Noir macro code (fn deserialize_content). This is either a bug in the compiler or the Noir macro code".to_string()),
            span: impl_span
        });
    }

    let mut function_ast = function_ast.into_sorted();
    let mut noir_fn = function_ast.functions.remove(0);
    noir_fn.def.visibility = ItemVisibility::Public;
    Ok(noir_fn)
}

fn generate_note_serialize_content(
    note_type: &str,
    note_fields: &[(String, String)],
    note_serialize_len: &String,
    impl_span: Option<Span>,
) -> Result<NoirFunction, AztecMacroError> {
    let function_source =
        generate_note_serialize_content_source(note_type, note_fields, note_serialize_len);

    let (function_ast, errors) = parse_program(&function_source);
    if !errors.is_empty() {
        dbg!(errors);
        return Err(AztecMacroError::CouldNotImplementNoteInterface {
            secondary_message: Some("Failed to parse Noir macro code (fn seserialize_content). This is either a bug in the compiler or the Noir macro code".to_string()),
            span: impl_span
        });
    }

    let mut function_ast = function_ast.into_sorted();
    let mut noir_fn = function_ast.functions.remove(0);
    noir_fn.def.visibility = ItemVisibility::Public;
    Ok(noir_fn)
}

fn generate_note_fields_fn(
    note_type: &str,
    note_fields: &[(String, String)],
    impl_span: Option<Span>,
) -> Result<NoirFunction, AztecMacroError> {
    let function_source = generate_note_fields_fn_source(note_type, note_fields);
    let (function_ast, errors) = parse_program(&function_source);
    if !errors.is_empty() {
        dbg!(errors);
        return Err(AztecMacroError::CouldNotImplementNoteInterface {
            secondary_message: Some("Failed to parse Noir macro code (fn fields). This is either a bug in the compiler or the Noir macro code".to_string()),
            span: impl_span
        });
    }
    let mut function_ast = function_ast.into_sorted();
    let mut noir_fn = function_ast.functions.remove(0);
    noir_fn.def.visibility = ItemVisibility::Public;
    Ok(noir_fn)
}

fn generate_compute_note_content_hash(
    note_type: &String,
    impl_span: Option<Span>,
) -> Result<NoirFunction, AztecMacroError> {
    let function_source = format!(
        "
        fn compute_note_content_hash(self: {}) -> Field {{
            // TODO(#1205) Should use a non-zero generator index.
            dep::aztec::hash::pedersen_hash(self.serialize_content(), 0)
        }}
        ",
        note_type
    );
    let (function_ast, errors) = parse_program(&function_source);
    if !errors.is_empty() {
        dbg!(errors);
        return Err(AztecMacroError::CouldNotImplementNoteInterface {
            secondary_message: Some("Failed to parse Noir macro code (fn compute_note_content_hash). This is either a bug in the compiler or the Noir macro code".to_string()),
            span: impl_span
        });
    }
    let mut function_ast = function_ast.into_sorted();
    let mut noir_fn = function_ast.functions.remove(0);
    noir_fn.def.visibility = ItemVisibility::Public;
    Ok(noir_fn)
}

fn generate_note_fields_struct_source(note_type: &str, note_fields: &[(String, String)]) -> String {
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

fn generate_note_fields_fn_source(note_type: &str, note_fields: &[(String, String)]) -> String {
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
    note_type: &str,
    note_fields: &[(String, String)],
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
    note_type: &str,
    note_fields: &[(String, String)],
    note_serialize_len: &String,
) -> String {
    let note_fields = note_fields
        .iter()
        .enumerate()
        .map(|(index, (field_name, field_type))| {
            if field_name != "header" {
                // TODO: Simplify this when https://github.com/noir-lang/noir/issues/4463 is fixed
                if field_type.eq("Field")
                    || Regex::new(r"u[0-9]+").unwrap().is_match(field_type)
                    || field_type.eq("bool")
                {
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

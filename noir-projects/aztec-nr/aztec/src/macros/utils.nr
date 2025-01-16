use std::meta::{typ::fresh_type_variable, unquote};

pub(crate) comptime fn get_fn_visibility(f: FunctionDefinition) -> Quoted {
    if f.has_named_attribute("private") {
        quote { private }
    } else if f.has_named_attribute("public") {
        quote { public }
    } else {
        panic(f"Function is neither private nor public")
    }
}

pub(crate) comptime fn is_fn_private(f: FunctionDefinition) -> bool {
    f.has_named_attribute("private")
}

pub(crate) comptime fn is_fn_public(f: FunctionDefinition) -> bool {
    f.has_named_attribute("public")
}

pub(crate) comptime fn is_fn_view(f: FunctionDefinition) -> bool {
    f.has_named_attribute("view")
}

pub(crate) comptime fn is_fn_internal(f: FunctionDefinition) -> bool {
    f.has_named_attribute("internal")
}

pub(crate) comptime fn is_fn_initializer(f: FunctionDefinition) -> bool {
    f.has_named_attribute("initializer")
}

pub(crate) comptime fn fn_has_noinitcheck(f: FunctionDefinition) -> bool {
    f.has_named_attribute("noinitcheck")
}

/// Takes a function body as a collection of expressions, and alters it by prepending and appending quoted values.
pub(crate) comptime fn modify_fn_body(body: [Expr], prepend: Quoted, append: Quoted) -> Expr {
    // We need to quote the body before we can alter its contents, so we fold it by quoting each expression.
    let mut body_quote = body.fold(quote {}, |full_quote: Quoted, expr: Expr| {
        let expr_quote = expr.quoted();
        quote {
                $full_quote
                $expr_quote
            }
    });
    body_quote = quote {
        {
            $prepend
            $body_quote
            $append
        }
    };
    let body_expr = body_quote.as_expr();
    body_expr.expect(f"Body is not an expression: {body_quote}")
}

pub(crate) comptime fn add_to_field_slice(slice_name: Quoted, name: Quoted, typ: Type) -> Quoted {
    if typ.is_field() | typ.as_integer().is_some() | typ.is_bool() {
        quote { $slice_name = $slice_name.push_back($name as Field); }
    } else if typ.as_struct().is_some() {
        quote { $slice_name = $slice_name.append($name.serialize()); }
    } else if typ.as_array().is_some() {
        let (element_type, _) = typ.as_array().unwrap();
        let serialized_name = f"{name}_serialized".quoted_contents();
        quote {
            let $serialized_name = $name.map(|x: $element_type | x.serialize());
            for i in 0..$name.len() {
                $slice_name = $slice_name.append($serialized_name[i].as_slice());
            }
        }
    } else if typ.as_str().is_some() {
        quote {
            $slice_name = $slice_name.append($name.as_bytes().map(| byte: u8 | byte as Field).as_slice());
        }
    } else {
        panic(
            f"Cannot add to slice: unsupported type {typ} variable {name}",
        )
    }
}

/// Adds a value to a hash::ArgsHasher. Structs and values inside arrays are required to implement the Serialize trait.
pub(crate) comptime fn add_to_hasher(hasher_name: Quoted, name: Quoted, typ: Type) -> Quoted {
    if typ.is_field() | typ.as_integer().is_some() | typ.is_bool() {
        quote { $hasher_name.add($name as Field); }
    } else if typ.as_struct().is_some() {
        quote { $hasher_name.add_multiple($name.serialize()); }
    } else if typ.as_array().is_some() {
        let (element_type, _) = typ.as_array().unwrap();
        let serialized_name = f"{name}_serialized".quoted_contents();
        quote {
           let $serialized_name = $name.map(|x: $element_type | x.serialize());
            for i in 0..$name.len() {
                $hasher_name.add_multiple($serialized_name[i]);
            }
        }
    } else if typ.as_str().is_some() {
        quote {
            $hasher_name.add_multiple($name.as_bytes().map(| byte: u8 | byte as Field));
        }
    } else {
        panic(
            f"Cannot add to hasher: unsupported type {typ} of variable {name}",
        )
    }
}

comptime fn signature_of_type(typ: Type) -> Quoted {
    if typ.is_field() {
        quote {Field}
    } else if typ.as_integer().is_some() {
        let (is_signed, bit_size) = typ.as_integer().unwrap();
        if is_signed {
            f"i{bit_size}".quoted_contents()
        } else {
            f"u{bit_size}".quoted_contents()
        }
    } else if typ.is_bool() {
        quote {bool}
    } else if typ.as_str().is_some() {
        let str_len_typ = typ.as_str().unwrap();
        let str_len = str_len_typ.as_constant().unwrap();
        f"str<{str_len}>".quoted_contents()
    } else if typ.as_array().is_some() {
        let (element_type, array_len) = typ.as_array().unwrap();
        let array_len = array_len.as_constant().unwrap();
        let element_typ_quote = signature_of_type(element_type);
        f"[{element_typ_quote};{array_len}]".quoted_contents()
    } else if typ.as_struct().is_some() {
        let (s, generics) = typ.as_struct().unwrap();
        let field_signatures = s
            .fields(generics)
            .map(|(_, typ): (Quoted, Type)| signature_of_type(typ))
            .join(quote {,});
        f"({field_signatures})".quoted_contents()
    } else if typ.as_tuple().is_some() {
        // Note that tuples are handled the same way as structs
        let types = typ.as_tuple().unwrap();
        let field_signatures = types.map(|typ: Type| signature_of_type(typ)).join(quote {,});
        f"({field_signatures})".quoted_contents()
    } else {
        panic(f"Unsupported type {typ}")
    }
}

trait AsStrQuote {
    fn as_str_quote(self) -> (Self, u32);
}

impl<let N: u32, Env> AsStrQuote for Quoted {
    // Used to convert an arbitrary quoted type into a quoted string, removing whitespace between tokens
    comptime fn as_str_quote(self) -> (Quoted, u32) {
        let tokens = self.tokens();
        let mut acc: [u8] = &[];
        let mut total_len: u32 = 0;
        for token in tokens {
            let token_as_fmt_str = f"{token}";
            let token_as_str = unquote!(quote {$token_as_fmt_str});
            let token_len = unquote!(quote { $token_as_str.as_bytes().len() });
            let token_as_bytes = unquote!(quote { $token_as_str.as_bytes().as_slice() });
            total_len += token_len;
            acc = acc.append(token_as_bytes);
        }
        let result = unquote!(
            quote {
                let signature_as_array: [u8; $total_len] = $acc.as_array();
                signature_as_array.as_str_unchecked()
            },
        );
        (quote { $result }, total_len)
    }
}

pub(crate) comptime fn compute_fn_selector(f: FunctionDefinition) -> Field {
    // The function selector is computed from the function signature, which is made up of the function name and types of
    // parameters, but not including the return type. For example, given:
    //
    // fn foo(a: Field, b: AztecAddress) -> Field
    //
    // The signature will be "foo(Field,AztecAddress)".
    let fn_name = f.name();
    let args_signatures =
        f.parameters().map(|(_, typ): (Quoted, Type)| signature_of_type(typ)).join(quote {,});
    let signature_quote = quote { $fn_name($args_signatures) };
    let (signature_str_quote, _) = signature_quote.as_str_quote();

    let computation_quote = quote {
        protocol_types::abis::function_selector::FunctionSelector::from_signature($signature_str_quote).to_field()
    };
    unquote!(computation_quote)
}

pub(crate) comptime fn compute_event_selector(s: StructDefinition) -> Field {
    // The event selector is computed from the type signature of the struct in the event, similar to how one might type
    // the constructor function. For example, given:
    //
    // struct Foo {
    //   a: Field,
    //   b: AztecAddress,
    // }
    //
    // The signature will be "Foo(Field,AztecAddress)".
    let event_name = s.name();
    let args_signatures = s
        .fields_as_written()
        .map(|(_, typ): (Quoted, Type)| {
            // signature_of_type can handle structs, so this supports nested structs
            // FIXME: Field generics are not handled here!
            signature_of_type(typ)
        })
        .join(quote {,});
    let signature_quote = quote { $event_name($args_signatures) };
    let (signature_str_quote, _) = signature_quote.as_str_quote();

    let computation_quote = quote {
        protocol_types::abis::event_selector::EventSelector::from_signature($signature_str_quote).to_field()
    };
    unquote!(computation_quote)
}

pub(crate) comptime fn get_serialized_size(typ: Type) -> u32 {
    let any = fresh_type_variable();
    let maybe_serialize_impl =
        typ.get_trait_impl(quote { protocol_types::traits::Serialize<$any> }.as_trait_constraint());

    maybe_serialize_impl
        .expect(
            f"Attempted to fetch serialization length, but {typ} does not implement the Serialize trait",
        )
        .trait_generic_args()[0]
        .as_constant()
        .unwrap()
}

pub(crate) comptime fn module_has_storage(m: Module) -> bool {
    m.structs().any(|s: StructDefinition| {
        s.has_named_attribute("storage") | s.has_named_attribute("storage_no_init")
    })
}

pub(crate) comptime fn module_has_initializer(m: Module) -> bool {
    m.functions().any(|f: FunctionDefinition| is_fn_initializer(f))
}

pub(crate) comptime fn is_note(typ: Type) -> bool {
    typ.as_struct().map_or(false, |struc: (StructDefinition, [Type])| {
        let (def, _) = struc;
        def.has_named_attribute("note")
            | def.has_named_attribute("partial_note")
            | def.has_named_attribute("note_custom_interface")
    })
}

use std::meta::{typ::fresh_type_variable, unquote};

pub(crate) comptime fn get_fn_visibility(f: FunctionDefinition) -> Quoted {
    if f.has_named_attribute(quote { private }) {
        quote { private }
    } else {
        quote { public }
    }
}

pub(crate) comptime fn is_fn_private(f: FunctionDefinition) -> bool {
    f.has_named_attribute(quote { private })
}

pub(crate) comptime fn is_fn_public(f: FunctionDefinition) -> bool {
    f.has_named_attribute(quote { public })
}

pub(crate) comptime fn is_fn_view(f: FunctionDefinition) -> bool {
    f.has_named_attribute(quote { view })
}

pub(crate) comptime fn fn_body_as_quoted(f: FunctionDefinition) -> Quoted {
    let body = f.body().as_block();
    assert(body.is_some(), "Function body must be a block");
    body.unwrap().fold(
        quote {},
        |body_quote, expr: Expr| {
        let expr_quote = expr.quoted();
        quote {
            $body_quote
            $expr_quote
        }
     }
    )
}

pub(crate) comptime fn modify_fn_body(f: FunctionDefinition, prepend: Quoted, append: Quoted) {
    let mut body_quote = fn_body_as_quoted(f);
    body_quote = quote {
        {
            $prepend
            $body_quote
            $append
        }
    };
    let body_expr = body_quote.as_expr();
    assert(body_expr.is_some(), "Body is not an expression");
    f.set_body(body_expr.unwrap());
}

pub(crate) comptime fn add_to_field_slice(slice_name: Quoted, name: Quoted, typ: Type) -> Quoted {
    if typ.is_field() | typ.as_integer().is_some() {
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
                $slice_name = $slice_name.append($name.to_bytes());
            }
    } else {
        assert(false, f"Cannot add to slice: unsupported type {typ} variable {name}");
        std::mem::zeroed()
    }
}

pub(crate) comptime fn add_to_hasher(hasher_name: Quoted, name: Quoted, typ: Type) -> Quoted {
    if typ.is_field() | typ.as_integer().is_some() {
        quote { $hasher_name.add($name as Field); }
    } else if typ.as_struct().is_some() {
        quote { $hasher_name.add_multiple($name.serialize()); }
    } else if typ.as_array().is_some() {
        let (element_type, _) = typ.as_array().unwrap();
        let serialized_name = f"{name}_serialized".quoted_contents();
        quote {
                let $serialized_name = $name.map(|x: $element_type | x.serialize());
                for i in 0..$name.len() {
                    args_acc = args_acc.append($serialized_name[i].as_slice());
                }
            }
    } else if typ.as_str().is_some() {
        quote {
                $hasher_name.add_multiple($name.to_bytes());
            }
    } else {
        assert(false, f"Cannot add to hasher: unsupported type {typ} of variable {name}");
        std::mem::zeroed()
    }
}

comptime fn signature_of_type(typ: Type) -> Quoted {
    if typ.is_field() {
        quote{Field}
    } else if typ.as_integer().is_some() {
        let (is_signed, bit_size) = typ.as_integer().unwrap();
        if is_signed {
            f"i{bit_size}".quoted_contents()
        } else {
            f"u{bit_size}".quoted_contents()
        }
    } else if typ.as_struct().is_some() {
        let (s, _) = typ.as_struct().unwrap();
        let field_signatures = s.fields().map(
            | (_, typ): (Quoted, Type) | {
            signature_of_type(typ)
        }
        ).join(quote {,});
        f"({field_signatures})".quoted_contents()
    } else if typ.as_array().is_some() {
        let (element_type, array_len) = typ.as_array().unwrap();
        let array_len = array_len.as_constant().unwrap();
        let element_typ_quote = signature_of_type(element_type);
        f"[{element_typ_quote};{array_len}]".quoted_contents()
    } else if typ.as_str().is_some() {
        let str_len_typ = typ.as_str().unwrap();
        let str_len = str_len_typ.as_constant().unwrap();
        f"str<{str_len}>".quoted_contents()
    } else if typ.as_tuple().is_some() {
        let types = typ.as_tuple().unwrap();
        let field_signatures = types.map(
            | typ: Type | {
            signature_of_type(typ)
        }
        ).join(quote {,});
        f"({field_signatures})".quoted_contents()
    } else {
        assert(false, f"Unsupported type {typ}");
        std::mem::zeroed()
    }
}

trait AsStrQuote {
    fn as_str_quote(self) -> Self;
}

impl<let N: u32, Env> AsStrQuote for Quoted {
    // Used to convert an arbirary quoted type into a quoted string, removing whitespace between tokens
    comptime fn as_str_quote(self) -> Quoted {
        let tokens = self.tokens();
        let mut acc: [u8] = &[];
        let mut total_len: u32 = 0;
        for token in tokens {
            let token_as_fmt_str = f"{token}";
            let token_as_str = unquote!(quote {$token_as_fmt_str});
            let token_len = unquote!(quote { $token_as_str.as_bytes().len() });
            let token_as_bytes = unquote!(quote { $token_as_str.as_bytes() });
            total_len+= token_len;
            acc = acc.append(token_as_bytes);
        }
        let result = unquote!(
            quote {
                let signature_as_array: [u8; $total_len] = $acc.as_array();
                signature_as_array.as_str_unchecked()
            }
        );
        quote { $result }
    }
}

pub(crate) comptime fn compute_fn_selector(f: FunctionDefinition) -> Field {
    let fn_name = f.name();
    let args_signatures = f.parameters().map(
        | (_, typ): (Quoted, Type) | {
        signature_of_type(typ)
    }
    ).join(quote {,});
    let signature_quote = quote { $fn_name($args_signatures) };
    let signature_str_quote = signature_quote.as_str_quote();

    let computation_quote = quote {
        protocol_types::abis::function_selector::FunctionSelector::from_signature($signature_str_quote).to_field()
    };
    unquote!(computation_quote)
}

pub(crate) comptime fn get_serialized_size(typ: Type) -> u32 {
    let any = fresh_type_variable();
    let maybe_serialize_impl = typ.get_trait_impl(quote { Serialize<$any> }.as_trait_constraint());
    assert(maybe_serialize_impl.is_some(), "Storable items must implement Serialize");
    let serialize_impl = maybe_serialize_impl.unwrap();
    serialize_impl.trait_generic_args()[0].as_constant().unwrap()
}

use std::meta::unquote;
use std::meta::type_of;

fn get_fn_visibility(func: FunctionDefinition) -> Quoted {
    if func.has_named_attribute(quote { private }) {
        quote { private }
    } else {
        quote { public }
    }
}

fn is_fn_private(func: FunctionDefinition) -> bool {
    func.has_named_attribute(quote { private })
}

fn is_fn_public(func: FunctionDefinition) -> bool {
    func.has_named_attribute(quote { public })
}

fn fn_body_as_quoted(func: FunctionDefinition) -> Quoted {
    let body = func.body().as_block();
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

fn modify_fn_body(func: FunctionDefinition, prepend: Quoted, append: Quoted) {
    let mut body_quote = fn_body_as_quoted(func);
    body_quote = quote {
        {
            $prepend
            $body_quote
            $append
        }
    };
    let body_expr = body_quote.as_expr();
    assert(body_expr.is_some(), "Body is not an expression");
    func.set_body(body_expr.unwrap());
}

fn serialize_to_hasher(hasher_name: Quoted, name: Quoted, typ: Type) -> Quoted {
    if typ.is_field() | typ.as_integer().is_some() {
        quote { $hasher_name.add($name as Field); }
    } else if typ.as_struct().is_some() {
        quote { $hasher_name.add_multiple($name.serialize()); }
    } else if typ.as_array().is_some() {
        let (element_type, _) = typ.as_array().unwrap();
        if element_type.is_field() | element_type.as_integer().is_some() {
            quote { $hasher_name.add_multiple($name as Field); }
        } else if element_type.as_struct().is_some() {
            quote { $hasher_name.add_multiple($name.serialize()); }
        } else {
            assert(false, f"Unsupported type for serialization of argument {name}");
            std::mem::zeroed()
        }
    } else if typ.as_str().is_some() {
        quote {
                $hasher_name.add_multiple($name.to_bytes());
            }
    } else {
        assert(false, f"Unsupported type for serialization of argument {name}");
        std::mem::zeroed()
    }
}

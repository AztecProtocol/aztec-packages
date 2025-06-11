pub comptime fn size_in_fields(typ: Type) -> u32 {
    let size = array_size_in_fields(typ);
    let size = size.or_else(|| bool_size_in_fields(typ));
    let size = size.or_else(|| constant_size_in_fields(typ));
    let size = size.or_else(|| field_size_in_fields(typ));
    let size = size.or_else(|| int_size_in_fields(typ));
    let size = size.or_else(|| str_size_in_fields(typ));
    let size = size.or_else(|| struct_size_in_fields(typ));
    let size = size.or_else(|| tuple_size_in_fields(typ));
    if size.is_some() {
        size.unwrap()
    } else {
        panic(f"Can't determine size in fields of {typ}")
    }
}

comptime fn array_size_in_fields(typ: Type) -> Option<u32> {
    typ.as_array().and_then(|typ: (Type, Type)| {
        let (typ, element_size) = typ;
        element_size.as_constant().map(|x: u32| x * size_in_fields(typ))
    })
}

comptime fn bool_size_in_fields(typ: Type) -> Option<u32> {
    if typ.is_bool() {
        Option::some(1)
    } else {
        Option::none()
    }
}

comptime fn field_size_in_fields(typ: Type) -> Option<u32> {
    if typ.is_field() {
        Option::some(1)
    } else {
        Option::none()
    }
}

comptime fn int_size_in_fields(typ: Type) -> Option<u32> {
    if typ.as_integer().is_some() {
        Option::some(1)
    } else {
        Option::none()
    }
}

comptime fn constant_size_in_fields(typ: Type) -> Option<u32> {
    typ.as_constant()
}

comptime fn str_size_in_fields(typ: Type) -> Option<u32> {
    typ.as_str().map(|typ| size_in_fields(typ))
}

comptime fn struct_size_in_fields(typ: Type) -> Option<u32> {
    typ.as_data_type().map(|typ: (TypeDefinition, [Type])| {
        let struct_type = typ.0;
        let generics = typ.1;
        let mut size = 0;
        for field in struct_type.fields(generics) {
            size += size_in_fields(field.1);
        }
        size
    })
}

comptime fn tuple_size_in_fields(typ: Type) -> Option<u32> {
    typ.as_tuple().map(|types: [Type]| {
        let mut size = 0;
        for typ in types {
            size += size_in_fields(typ);
        }
        size
    })
}

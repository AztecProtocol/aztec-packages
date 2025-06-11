use crate::macros::utils::{
    add_to_field_array, AsStrQuote, compute_fn_selector, is_fn_private, is_fn_public, is_fn_view,
};
use std::meta::{type_of, unquote};

comptime global FROM_FIELD: TypedExpr = {
    let from_field_trait = quote { protocol_types::traits::FromField }.as_trait_constraint();
    let function_selector_typ =
        quote { protocol_types::abis::function_selector::FunctionSelector }.as_type();
    function_selector_typ.get_trait_impl(from_field_trait).unwrap().methods().filter(|m| {
        m.name() == quote { from_field }
    })[0]
        .as_typed_expr()
};

comptime global SERIALIZED_ARGS_NAME: Quoted = quote { serialized_args };

pub comptime fn stub_fn(f: FunctionDefinition) -> Quoted {
    let is_static_call = is_fn_view(f);
    let is_void = f.return_type() == type_of(());

    if is_fn_private(f) {
        if is_static_call {
            if is_void {
                create_private_static_void_stub(f)
            } else {
                create_private_static_stub(f)
            }
        } else {
            if is_void {
                create_private_void_stub(f)
            } else {
                create_private_stub(f)
            }
        }
    } else if is_fn_public(f) {
        if is_static_call {
            if is_void {
                create_public_static_void_stub(f)
            } else {
                create_public_static_stub(f)
            }
        } else {
            if is_void {
                create_public_void_stub(f)
            } else {
                create_public_stub(f)
            }
        }
    } else {
        if is_void {
            create_utility_void_stub(f)
        } else {
            create_utility_stub(f)
        }
    }
}

/// Utility function creating stubs used by all the stub functions in this file.
comptime fn create_stub_base(
    f: FunctionDefinition,
) -> (Quoted, Quoted, Quoted, Quoted, u32, Field) {
    let fn_name = f.name();
    let fn_parameters = f.parameters();
    let fn_parameters_list =
        fn_parameters.map(|(name, typ): (Quoted, Type)| quote { $name: $typ }).join(quote {,});
    let params_num_fields =
        fn_parameters.fold(0, |acc, (_, typ)| acc + crate::macros::dispatch::size_in_fields(typ));

    let serialized_args_index_name = quote { serialized_args_index };
    // Example of what the fold(...) below will generate for `target_address` and `fee_juice_limit_per_tx` function
    // parameters:
    // ```
    // let mut serialized_args =  &[];
    // serialized_args = serialized_args.append(aztec::protocol_types::traits::Serialize::serialize(target_address));
    // serialized_args = serialized_args.push_back(fee_juice_limit_per_tx as Field);
    // ```
    let serialized_args_array_construction = fn_parameters.fold(
        quote {
            let mut $SERIALIZED_ARGS_NAME = [0; $params_num_fields];
            let mut $serialized_args_index_name: u32 = 0;
        },
        |args, param: (Quoted, Type)| {
            let (name, typ) = param;
            let arg_to_append =
                add_to_field_array(SERIALIZED_ARGS_NAME, serialized_args_index_name, name, typ);
            quote {
                $args
                $arg_to_append
            }
        },
    );

    let (fn_name_str, _) = fn_name.as_str_quote();
    let fn_name_len: u32 = unquote!(quote { $fn_name_str.as_bytes().len()});
    let fn_selector: Field = compute_fn_selector(f);

    (
        fn_name, fn_parameters_list, serialized_args_array_construction, fn_name_str, fn_name_len,
        fn_selector,
    )
}

comptime fn create_private_stub(f: FunctionDefinition) -> Quoted {
    let (fn_name, fn_parameters_list, serialized_args_array_construction, fn_name_str, fn_name_len, fn_selector) =
        create_stub_base(f);
    let fn_return_type = f.return_type();

    quote {
        pub fn $fn_name(self, $fn_parameters_list) -> dep::aztec::context::call_interfaces::PrivateCallInterface<$fn_name_len, $fn_return_type, _> {
            $serialized_args_array_construction
            let selector = $FROM_FIELD($fn_selector);
            dep::aztec::context::call_interfaces::PrivateCallInterface::new(
                self.target_contract,
                selector,
                $fn_name_str,
                $SERIALIZED_ARGS_NAME,
                false
            )
        }
    }
}

comptime fn create_private_static_stub(f: FunctionDefinition) -> Quoted {
    let (fn_name, fn_parameters_list, serialized_args_slice_construction, fn_name_str, fn_name_len, fn_selector) =
        create_stub_base(f);
    let fn_return_type = f.return_type();

    quote {
        pub fn $fn_name(self, $fn_parameters_list) -> dep::aztec::context::call_interfaces::PrivateStaticCallInterface<$fn_name_len, $fn_return_type, _> {
            $serialized_args_slice_construction
            let selector = $FROM_FIELD($fn_selector);
            dep::aztec::context::call_interfaces::PrivateStaticCallInterface::new(
                self.target_contract,
                selector,
                $fn_name_str,
                $SERIALIZED_ARGS_NAME,
            )
        }
    }
}

comptime fn create_private_void_stub(f: FunctionDefinition) -> Quoted {
    let (fn_name, fn_parameters_list, serialized_args_slice_construction, fn_name_str, fn_name_len, fn_selector) =
        create_stub_base(f);

    quote {
        pub fn $fn_name(self, $fn_parameters_list) -> dep::aztec::context::call_interfaces::PrivateVoidCallInterface<$fn_name_len, (), 0> {
            $serialized_args_slice_construction
            let selector = $FROM_FIELD($fn_selector);
            dep::aztec::context::call_interfaces::PrivateVoidCallInterface::new(
                self.target_contract,
                selector,
                $fn_name_str,
                $SERIALIZED_ARGS_NAME,
                false
            )
        }
    }
}

comptime fn create_private_static_void_stub(f: FunctionDefinition) -> Quoted {
    let (fn_name, fn_parameters_list, serialized_args_slice_construction, fn_name_str, fn_name_len, fn_selector) =
        create_stub_base(f);

    quote {
        pub fn $fn_name(self, $fn_parameters_list) -> dep::aztec::context::call_interfaces::PrivateStaticVoidCallInterface<$fn_name_len, (), 0> {
            $serialized_args_slice_construction
            let selector = $FROM_FIELD($fn_selector);
            dep::aztec::context::call_interfaces::PrivateStaticVoidCallInterface::new(
                self.target_contract,
                selector,
                $fn_name_str,
                serialized_args
            )
        }
    }
}

comptime fn create_public_stub(f: FunctionDefinition) -> Quoted {
    let (fn_name, fn_parameters_list, serialized_args_slice_construction, fn_name_str, fn_name_len, fn_selector) =
        create_stub_base(f);
    let fn_return_type = f.return_type();

    quote {
        pub fn $fn_name(self, $fn_parameters_list) -> dep::aztec::context::call_interfaces::PublicCallInterface<$fn_name_len, $fn_return_type, _> {
            $serialized_args_slice_construction
            let selector = $FROM_FIELD($fn_selector);
            dep::aztec::context::call_interfaces::PublicCallInterface::new(
                self.target_contract,
                selector,
                $fn_name_str,
                $SERIALIZED_ARGS_NAME,
                false
            )
        }
    }
}

comptime fn create_public_static_stub(f: FunctionDefinition) -> Quoted {
    let (fn_name, fn_parameters_list, serialized_args_slice_construction, fn_name_str, fn_name_len, fn_selector) =
        create_stub_base(f);
    let fn_return_type = f.return_type();

    quote {
        pub fn $fn_name(self, $fn_parameters_list) -> dep::aztec::context::call_interfaces::PublicStaticCallInterface<$fn_name_len, $fn_return_type, _> {
            $serialized_args_slice_construction
            let selector = $FROM_FIELD($fn_selector);
            dep::aztec::context::call_interfaces::PublicStaticCallInterface::new(
                self.target_contract,
                selector,
                $fn_name_str,
                $SERIALIZED_ARGS_NAME,
            )
        }
    }
}

comptime fn create_public_void_stub(f: FunctionDefinition) -> Quoted {
    let (fn_name, fn_parameters_list, serialized_args_slice_construction, fn_name_str, fn_name_len, fn_selector) =
        create_stub_base(f);

    quote {
        pub fn $fn_name(self, $fn_parameters_list) -> dep::aztec::context::call_interfaces::PublicVoidCallInterface<$fn_name_len, (), 0> {
            $serialized_args_slice_construction
            let selector = $FROM_FIELD($fn_selector);
            dep::aztec::context::call_interfaces::PublicVoidCallInterface::new(
                self.target_contract,
                selector,
                $fn_name_str,
                $SERIALIZED_ARGS_NAME,
                false
            )
        }
    }
}

comptime fn create_public_static_void_stub(f: FunctionDefinition) -> Quoted {
    let (fn_name, fn_parameters_list, serialized_args_slice_construction, fn_name_str, fn_name_len, fn_selector) =
        create_stub_base(f);

    quote {
        pub fn $fn_name(self, $fn_parameters_list) -> dep::aztec::context::call_interfaces::PublicStaticVoidCallInterface<$fn_name_len, (), 0> {
            $serialized_args_slice_construction
            let selector = $FROM_FIELD($fn_selector);
            dep::aztec::context::call_interfaces::PublicStaticVoidCallInterface::new(
                self.target_contract,
                selector,
                $fn_name_str,
                serialized_args
            )
        }
    }
}

comptime fn create_utility_stub(f: FunctionDefinition) -> Quoted {
    let (fn_name, fn_parameters_list, serialized_args_slice_construction, fn_name_str, fn_name_len, fn_selector) =
        create_stub_base(f);
    let fn_return_type = f.return_type();

    // This is here because utility function call interfaces can only be used within TXe tests.
    let modified_fn_name = f"_experimental_{fn_name}".quoted_contents();

    quote {
        pub fn $modified_fn_name(self, $fn_parameters_list) -> dep::aztec::context::call_interfaces::UtilityCallInterface<$fn_name_len, $fn_return_type, _> {
            $serialized_args_slice_construction
            let selector = $FROM_FIELD($fn_selector);
            dep::aztec::context::call_interfaces::UtilityCallInterface::new(
                self.target_contract,
                selector,
                $fn_name_str,
                $SERIALIZED_ARGS_NAME,
            )
        }
    }
}

comptime fn create_utility_void_stub(f: FunctionDefinition) -> Quoted {
    let (fn_name, fn_parameters_list, serialized_args_slice_construction, fn_name_str, fn_name_len, fn_selector) =
        create_stub_base(f);

    // This is here because utility function call interfaces can only be used within TXe tests.
    let modified_fn_name = f"_experimental_{fn_name}".quoted_contents();

    quote {
        pub fn $modified_fn_name(self, $fn_parameters_list) -> dep::aztec::context::call_interfaces::UtilityVoidCallInterface<$fn_name_len, (), 0> {
            $serialized_args_slice_construction
            let selector = $FROM_FIELD($fn_selector);
            dep::aztec::context::call_interfaces::UtilityVoidCallInterface::new(
                self.target_contract,
                selector,
                $fn_name_str,
                $SERIALIZED_ARGS_NAME,
            )
        }
    }
}

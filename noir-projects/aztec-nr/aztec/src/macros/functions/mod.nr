mod interfaces;

use std::meta::type_of;
use super::utils::{
    modify_fn_body, is_fn_private, get_fn_visibility, is_fn_view, is_fn_initializer, is_fn_internal,
    fn_has_noinitcheck, add_to_hasher, module_has_storage, module_has_initializer
};

use interfaces::{create_fn_abi_export, register_stub, stub_fn};

// Empty annotation just to leave a mark in the function that can be used to add the check in the correct place over at #[private] or #[public]
pub comptime fn internal(_f: FunctionDefinition) {}

comptime fn create_internal_check(f: FunctionDefinition) -> Quoted {
    let name = f.name();
    let assertion_message = f"Function {name} can only be called internally";
    quote { assert(context.msg_sender() == context.this_address(), $assertion_message); }
}

// Empty annotation just to leave a mark in the function that can be used to add the check in the correct place over at #[private] or #[public]
pub comptime fn view(_f: FunctionDefinition) {}

comptime fn create_view_check(f: FunctionDefinition) -> Quoted {
    let name = f.name();
    let assertion_message = f"Function {name} can only be called statically";
    if is_fn_private(f) {
        quote { assert(context.inputs.call_context.is_static_call == true, $assertion_message); }
    } else {
        quote { assert(context.inputs.is_static_call == true, $assertion_message); }
    }
}

// Empty annotation just to leave a mark in the function that can be used to add the check in the correct place over at #[private] or #[public]
pub comptime fn initializer(_f: FunctionDefinition) {}

// Empty annotation just to leave a mark in the function that can be used to add the check in the correct place over at #[private] or #[public]
pub comptime fn noinitcheck(_f: FunctionDefinition) {}

comptime fn create_assert_initializer(f: FunctionDefinition) -> Quoted {
    let fn_visibility = get_fn_visibility(f);
    f"dep::aztec::initializer::assert_initialization_matches_address_preimage_{fn_visibility}(context);".quoted_contents()
}

comptime fn create_init_check(f: FunctionDefinition) -> Quoted {
    let fn_visibility = get_fn_visibility(f);
    f"dep::aztec::initializer::assert_is_initialized_{fn_visibility}(&mut context);".quoted_contents()
}

comptime fn create_mark_as_initialized(f: FunctionDefinition) -> Quoted {
    let fn_visibility = get_fn_visibility(f);
    f"dep::aztec::initializer::mark_as_initialized_{fn_visibility}(&mut context);".quoted_contents()
}

pub comptime fn private(f: FunctionDefinition) -> Quoted {
    let fn_abi = create_fn_abi_export(f);
    let fn_stub = stub_fn(f);
    register_stub(f.module(), fn_stub);
    let module_has_initializer = module_has_initializer(f.module());
    let module_has_storage = module_has_storage(f.module());

    let current_params = f.parameters();
    f.set_parameters(
        &[
        (
            quote { inputs }, quote { crate::context::inputs::private_context_inputs::PrivateContextInputs }.as_type()
        )
    ].append(current_params)
    );
    let mut body = f.body().as_block().unwrap();
    // TODO: Optimize args_hasher for small number of arguments
    let args_hasher_name = quote { args_hasher };
    let args_hasher = current_params.fold(
        quote {
        let mut $args_hasher_name = dep::aztec::hash::ArgsHasher::new();
        },
        |args_hasher, param: (Quoted, Type)| {
        let (name, typ) = param;
        let appended_arg = add_to_hasher(args_hasher_name, name, typ);
        quote {
            $args_hasher
            $appended_arg
        }
    }
    );
    let context_creation = quote { let mut context = dep::aztec::context::private_context::PrivateContext::new(inputs, args_hasher.hash()); };
    let internal_check = if is_fn_internal(f) {
        create_internal_check(f)
    } else {
        quote {}
    };
    let view_check = if is_fn_view(f) {
        create_view_check(f)
    } else {
        quote {}
    };
    let (assert_initializer, mark_as_initialized) = if is_fn_initializer(f) {
        (create_assert_initializer(f), create_mark_as_initialized(f))
    } else {
        (quote {}, quote {})
    };
    let storage_init = if module_has_storage {
        quote { let storage = Storage::init(&mut context); }
    } else {
        quote {}
    };
    let init_check = if module_has_initializer & !fn_has_noinitcheck(f) {
        create_init_check(f)
    } else {
        quote {}
    };

    let return_value_var_name = quote { macro__returned__values };

    let return_value_type = f.return_type();
    let return_value = if body.len() == 0 {
        quote {}
    } else if return_value_type != type_of(()) {
        let (body_without_return, last_body_expr) = body.pop_back();
        let return_value = last_body_expr.quoted();
        let return_value_assignment = quote { let $return_value_var_name: $return_value_type = $return_value; };
        let return_hasher_name = quote { return_hasher };
        let return_value_into_hasher = add_to_hasher(return_hasher_name, return_value_var_name, return_value_type);

        body = body_without_return;

        quote {
            let mut $return_hasher_name = dep::aztec::hash::ArgsHasher::new();
            $return_value_assignment
            $return_value_into_hasher
            context.set_return_hash($return_hasher_name);
        }
    } else {
        let (body_without_return, last_body_expr) = body.pop_back();
        if !last_body_expr.has_semicolon()
            & last_body_expr.as_for().is_none()
            & last_body_expr.as_assert().is_none()
            & last_body_expr.as_for_range().is_none()
            & last_body_expr.as_assert_eq().is_none()
            & last_body_expr.as_let().is_none() {
            let unused_return_value_name = f"_{return_value_var_name}".quoted_contents();
            body = body_without_return.push_back(quote { let $unused_return_value_name = $last_body_expr; }.as_expr().unwrap());
        }
        quote {}
    };

    let context_finish = quote { context.finish() };

    let to_prepend = quote {
        $args_hasher
        $context_creation
        $assert_initializer
        $init_check
        $internal_check
        $view_check
        $storage_init
    };

    let to_append = quote {
        $return_value
        $mark_as_initialized
        $context_finish
    };
    let modified_body = modify_fn_body(body, to_prepend, to_append);
    f.set_body(modified_body);
    f.add_attribute("recursive");
    f.set_return_public(true);
    f.set_return_type(
        quote { dep::protocol_types::abis::private_circuit_public_inputs::PrivateCircuitPublicInputs }.as_type()
    );

    fn_abi
}

pub comptime fn public(f: FunctionDefinition) -> Quoted {
    let fn_abi = create_fn_abi_export(f);
    let fn_stub = stub_fn(f);
    register_stub(f.module(), fn_stub);
    let module_has_initializer = module_has_initializer(f.module());
    let module_has_storage = module_has_storage(f.module());

    let current_params = f.parameters();
    f.set_parameters(
        &[
        (
            quote { inputs }, quote { crate::context::inputs::public_context_inputs::PublicContextInputs }.as_type()
        )
    ].append(current_params)
    );
    let context_creation = quote { let mut context = dep::aztec::context::public_context::PublicContext::new(inputs); };
    let internal_check = if is_fn_internal(f) {
        create_internal_check(f)
    } else {
        quote {}
    };
    let view_check = if is_fn_view(f) {
        create_view_check(f)
    } else {
        quote {}
    };
    let (assert_initializer, mark_as_initialized) = if is_fn_initializer(f) {
        (create_assert_initializer(f), create_mark_as_initialized(f))
    } else {
        (quote {}, quote {})
    };
    let storage_init = if module_has_storage {
        quote { let storage = Storage::init(&mut context); }
    } else {
        quote {}
    };
    let init_check = if module_has_initializer & !fn_has_noinitcheck(f) & !is_fn_initializer(f) {
        create_init_check(f)
    } else {
        quote {}
    };

    let to_prepend = quote {
        $context_creation
        $assert_initializer
        $init_check
        $internal_check
        $view_check
        $storage_init
    };

    let to_append = quote {
        $mark_as_initialized
    };

    let body = f.body().as_block().unwrap();
    let modified_body = modify_fn_body(body, to_prepend, to_append);
    f.set_body(modified_body);

    f.set_unconstrained(true);
    f.set_return_public(true);

    fn_abi
}

pub comptime fn transform_unconstrained(f: FunctionDefinition) {
    let context_creation = quote { let mut context = dep::aztec::context::unconstrained_context::UnconstrainedContext::new(); };
    let module_has_storage = module_has_storage(f.module());

    let storage_init = if module_has_storage {
        quote { let storage = Storage::init(context); }
    } else {
        quote {}
    };
    let to_prepend = quote {
        $context_creation
        $storage_init
    };
    let body = f.body().as_block().unwrap();
    let modified_body = modify_fn_body(body, to_prepend, quote {});
    f.set_return_public(true);
    f.set_body(modified_body);
}

//! The functionality in this module is triggered by the `#[aztec]` macro. It generates new functions, prefixed with
//! `__aztec_nr_internals___`, from the ones marked with `#[external(...)]` and `#[internal(...)]` attributes. The
//! original functions are then modified to be uncallable. This prevents developers from inadvertently calling a
//! function directly, instead of performing a proper contract call.

pub mod abi_attributes;
pub(crate) mod external_functions_registry;
pub(crate) mod internal_functions_registry;
mod abi_export;
pub(crate) mod external;
pub(crate) mod internal;

use abi_export::create_fn_abi_export;
use external::{
    private::generate_private_external,
    public::{generate_public_external, generate_public_self_creator, generate_public_self_creator_from_context},
    utility::{generate_utility_external, generate_utility_self_creator},
};
use internal::{generate_private_internal, generate_public_internal};

/// Modifies a function such that when it's called directly, it will result in a compilation error with a reasonable
/// error message.
comptime fn make_functions_uncallable<let N: u32>(functions: [FunctionDefinition], error_message_template: str<N>) {
    functions.for_each(|function| {
        let name = function.name();
        // The body of the function will contain a static_assert(false, ...) to prevent the function from being called
        // directly and a std::mem::zeroed() to make the compilation fail on the static_assert and not on a missing
        // return value.
        let error_message = f"{error_message_template}{name}. See https://docs.aztec.network/errors/6";

        // Disabling the function also adds a `contract_library_method` attribute to the function to prevent this
        // function from being compiled as an entrypoint function (function that's compiled as its own circuit).
        function.disable(error_message);
    });
}

/// Produces new functions for all external and internal contract functions, prefixing them with
/// `__aztec_nr_internals___`, and then renders the original functions uncallable.
pub(crate) comptime fn process_functions(m: Module) -> Quoted {
    // EXTERNAL FUNCTIONS
    let private_functions = external_functions_registry::get_private_functions(m);
    let public_functions = external_functions_registry::get_public_functions(m);
    let utility_functions = external_functions_registry::get_utility_functions(m);

    let transformed_private_functions =
        private_functions.map(|function| generate_private_external(function)).join(quote {});
    let transformed_public_functions =
        public_functions.map(|function| generate_public_external(function)).join(quote {});
    let transformed_utility_functions =
        utility_functions.map(|function| generate_utility_external(function)).join(quote {});

    // INTERNAL FUNCTIONS
    let private_internal_functions = internal_functions_registry::get_private_functions(m);
    let public_internal_functions = internal_functions_registry::get_public_functions(m);

    // Emit per-contract helpers that construct `self` for public functions, so the preamble is not duplicated into
    // every public function body. The creator takes a `PublicContext` and is shared by both public external functions
    // (via `__aztec_nr_internals__create_public_self`) and public internal functions, which receive the context as a
    // parameter. We only emit each helper if there is a caller for it.
    let any_public_function = public_functions.len() > 0 | public_internal_functions.len() > 0;
    let public_self_creator_from_context = if any_public_function {
        generate_public_self_creator_from_context(m)
    } else {
        quote {}
    };
    let public_self_creator = if public_functions.len() > 0 {
        generate_public_self_creator(m)
    } else {
        quote {}
    };

    // Same idea for utility functions: emit a per-contract helper that builds the `self` value, so the construction is
    // not duplicated into every utility body. UtilityContext takes no calldata, so a single helper is enough; there is
    // no internal/external split to share with.
    let utility_self_creator = if utility_functions.len() > 0 {
        generate_utility_self_creator(m)
    } else {
        quote {}
    };

    // Now that we have generated quotes of the new functions based on the original function definitions, we replace
    // the original functions' bodies with `static_assert(false, ...)` to prevent them from being called directly from
    // within the contract. We also need to set the return type to `()` to avoid compilation errors.
    make_functions_uncallable(
        private_functions,
        "Direct invocation of private functions is not supported. You attempted to call ",
    );
    make_functions_uncallable(
        public_functions,
        "Direct invocation of public functions is not supported. You attempted to call ",
    );
    make_functions_uncallable(
        utility_functions,
        "Direct invocation of utility functions is not supported. You attempted to call ",
    );

    let generated_private_internal_functions =
        private_internal_functions.map(|function| generate_private_internal(function)).join(quote {});
    let generated_public_internal_functions =
        public_internal_functions.map(|function| generate_public_internal(function)).join(quote {});

    // Just like for external functions, we make the internal functions not directly callable.
    make_functions_uncallable(
        private_internal_functions,
        "Direct invocation of private internal functions is not supported. You attempted to call ",
    );
    make_functions_uncallable(
        public_internal_functions,
        "Direct invocation of public internal functions is not supported. You attempted to call ",
    );

    // We return the new functions' quotes to be injected into the contract.
    quote {
        $public_self_creator_from_context
        $public_self_creator
        $utility_self_creator
        $transformed_private_functions
        $transformed_public_functions
        $transformed_utility_functions
        $generated_private_internal_functions
        $generated_public_internal_functions
    }
}

// See docs of create_fn_abi_export for information on what this does.
pub(crate) comptime fn create_fn_abi_exports(m: Module) -> Quoted {
    let private_functions_exports = external_functions_registry::get_private_functions(m)
        .map(|function| create_fn_abi_export(function))
        .join(quote {});
    let public_functions_exports = external_functions_registry::get_public_functions(m)
        .map(|function| create_fn_abi_export(function))
        .join(quote {});
    let utility_functions_exports = external_functions_registry::get_utility_functions(m)
        .map(|function| create_fn_abi_export(function))
        .join(quote {});

    quote {
        $private_functions_exports
        $public_functions_exports
        $utility_functions_exports
    }
}

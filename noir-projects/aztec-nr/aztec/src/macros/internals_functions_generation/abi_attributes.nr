//! ABI attributes that are applied by the Aztec.nr macros to the generated functions with the `__aztec_nr_internals___`
//! prefix in the name. The attributes are prefixed with `abi_` as they are used only for ABI purposes and artifact
//! generation.

// Applied to macro-generated functions with the `__aztec_nr_internals___` prefix, which are created from functions
// annotated with `#[external("private")]`.
pub comptime fn abi_private(_f: FunctionDefinition) {}

// Applied to macro-generated functions with the `__aztec_nr_internals___` prefix, which are created from functions
// annotated with `#[external("public")]`.
pub comptime fn abi_public(_f: FunctionDefinition) {}

// Applied to macro-generated functions with the `__aztec_nr_internals___` prefix, which are created from functions
// annotated with `#[external("utility")]`.
pub comptime fn abi_utility(_f: FunctionDefinition) {}

// Applied to macro-generated functions with the `__aztec_nr_internals___` prefix, which are created from functions
// annotated with `#[view]`.
pub comptime fn abi_view(_f: FunctionDefinition) {}

// Applied to macro-generated functions with the `__aztec_nr_internals___` prefix, which are created from functions
// annotated with `#[only_self]`.
pub comptime fn abi_only_self(_f: FunctionDefinition) {}

// Applied to macro-generated functions with the `__aztec_nr_internals___` prefix, which are created from functions
// annotated with `#[initializer]`.
pub comptime fn abi_initializer(_f: FunctionDefinition) {}

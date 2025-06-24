use crate::macros::utils::{
    compute_struct_selector, derive_serialize_if_not_implemented, get_trait_impl_method,
};
use poseidon::poseidon2::Poseidon2Hasher;
use std::{collections::umap::UHashMap, hash::BuildHasherDefault};

pub comptime mut global AUTHWIT_TYPES: UHashMap<Field, TypeDefinition, BuildHasherDefault<Poseidon2Hasher>> =
    UHashMap::default();

comptime fn register_authwit(authwit_selector: Field, authwit_struct: TypeDefinition) {
    if AUTHWIT_TYPES.contains_key(authwit_selector) {
        let existing_authwit = AUTHWIT_TYPES.get(authwit_selector).unwrap().name();
        let authwit_name = authwit_struct.name();
        panic(
            f"Authwit selector collision detected between events '{authwit_name}' and '{existing_authwit}'",
        );
    }
    AUTHWIT_TYPES.insert(authwit_selector, authwit_struct);
}

pub comptime fn generate_auhtwit_interface_and_get_selector(s: TypeDefinition) -> (Quoted, Field) {
    let name = s.name();

    let authwit_selector = compute_struct_selector(
        s,
        quote { crate::authwit::authwit_selector::AuthwitSelector::from_signature },
    );

    let from_field = get_trait_impl_method(
        quote { crate::authwit::authwit_selector::AuthwitSelector }.as_type(),
        quote { crate::protocol_types::traits::FromField },
        quote { from_field },
    );

    let authwit_interface = quote { crate::authwit::authwit_interface::AuthwitInterface };
    let authwit_selector_type = quote { crate::authwit::authwit_selector::AuthwitSelector };

    (
        quote {
        impl $authwit_interface for $name {

            fn get_authwit_selector() -> $authwit_selector_type {
                $from_field($authwit_selector)
            }

            fn emit_as_offchain_effect_and_get_hash(self) -> Field {
                let inner_hash = compute_inner_authwit_hash(protocol_types::traits::Serialize::serialize(self));
                crate::oracle::offchain_effect::emit_offchain_effect([$authwit_selector, inner_hash]);
                inner_hash
            }
        }
    },
        authwit_selector,
    )
}

pub comptime fn generate_authwit_exports() {}

pub comptime fn authwit(s: TypeDefinition) -> Quoted {
    let (authwit_interface_impl, authwit_selector) = generate_auhtwit_interface_and_get_selector(s);
    register_authwit(authwit_selector, s);

    let serialize_impl = derive_serialize_if_not_implemented(s);

    quote {
        $authwit_interface_impl
        $serialize_impl
    }
}

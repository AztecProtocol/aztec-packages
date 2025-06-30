use crate::macros::utils::{
    compute_struct_selector, derive_serialize_if_not_implemented, get_trait_impl_method,
};
use poseidon::poseidon2::Poseidon2Hasher;
use std::{collections::umap::UHashMap, hash::BuildHasherDefault};

pub comptime mut global AUTH_TYPES: UHashMap<Field, TypeDefinition, BuildHasherDefault<Poseidon2Hasher>> =
    UHashMap::default();

comptime fn register_authorization(
    authorization_selector: Field,
    authorization_struct: TypeDefinition,
) {
    if AUTH_TYPES.contains_key(authorization_selector) {
        let existing_authorization = AUTH_TYPES.get(authorization_selector).unwrap().name();
        let authorization_name = authorization_struct.name();
        panic(
            f"Authwit selector collision detected between authorizations '{authorization_name}' and '{existing_authorization}'",
        );
    }
    AUTH_TYPES.insert(authorization_selector, authorization_struct);
}

pub comptime fn generate_authorization_interface_and_get_selector(
    s: TypeDefinition,
) -> (Quoted, Field) {
    let name = s.name();

    let authorization_selector = compute_struct_selector(
        s,
        quote { crate::authwit::auth_selector::AuthorizationSelector::from_signature },
    );

    let from_field = get_trait_impl_method(
        quote { crate::authwit::auth_selector::AuthorizationSelector }.as_type(),
        quote { crate::protocol_types::traits::FromField },
        quote { from_field },
    );

    let authorization_interface = quote { crate::authwit::auth_interface::AuthorizationInterface };
    let authorization_selector_type =
        quote { crate::authwit::auth_selector::AuthorizationSelector };

    (
        quote {
        impl $authorization_interface for $name {
            fn get_authorization_selector(self) -> $authorization_selector_type {
                $from_field($authorization_selector)
            }
        }
    },
        authorization_selector,
    )
}

pub comptime fn authorization(s: TypeDefinition) -> Quoted {
    let (authorization_interface_impl, authorization_selector) =
        generate_authorization_interface_and_get_selector(s);
    register_authorization(authorization_selector, s);

    let serialize_impl = derive_serialize_if_not_implemented(s);

    quote {
        $authorization_interface_impl
        $serialize_impl
    }
}

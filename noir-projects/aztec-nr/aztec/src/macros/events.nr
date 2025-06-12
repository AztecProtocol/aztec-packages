use super::utils::{compute_event_selector, get_trait_impl_method};
use poseidon::poseidon2::Poseidon2Hasher;
use protocol_types::meta::derive_serialize;
use std::{collections::umap::UHashMap, hash::BuildHasherDefault, panic};

/// A map from event selector to event name indicating whether the event selector has already been seen during
/// the contract compilation - prevents event selector collisions.
pub comptime mut global EVENT_SELECTORS: UHashMap<Field, Quoted, BuildHasherDefault<Poseidon2Hasher>> =
    UHashMap::default();

comptime fn generate_event_interface_and_get_selector(s: TypeDefinition) -> (Quoted, Field) {
    let name = s.name();

    let event_selector = compute_event_selector(s);

    let from_field = get_trait_impl_method(
        quote { crate::protocol_types::abis::event_selector::EventSelector }.as_type(),
        quote { crate::protocol_types::traits::FromField },
        quote { from_field },
    );

    (
        quote {
        impl aztec::event::event_interface::EventInterface for $name {
            fn get_event_type_id() -> aztec::protocol_types::abis::event_selector::EventSelector {
                $from_field($event_selector)
            }
        }
    },
        event_selector,
    )
}

/// Generates a quote that implements `Serialize` for a given struct `s`.
/// If the struct already implements `Serialize`, we return an empty quote.
// TODO(#11571): Drop this function and use the `derive_packable_if_not_implemented_and_get_len` function instead.
comptime fn derive_serialize_if_not_implemented(s: TypeDefinition) -> Quoted {
    // We try to get the serialized length of the struct. If it does not implement `Serialize`, we get Option::none()
    let serialized_len_typ = std::meta::typ::fresh_type_variable();
    // We don't care about the result of the implements check. We just want to get the serialized length.
    let _ = s.as_type().implements(
        quote { crate::protocol_types::traits::Serialize<$serialized_len_typ> }.as_trait_constraint(),
    );
    let maybe_serialized_length = serialized_len_typ.as_constant();

    if maybe_serialized_length.is_some() {
        // We got some serialized length meaning that the struct implements `Serialize`. For this reason we return
        // an empty quote for the implementation.
        quote {}
    } else {
        // We didn't manage to get the serialized length which means the struct doesn't implement `Serialize`
        // so we derive it.
        derive_serialize(s)
    }
}

comptime fn register_event_selector(event_selector: Field, event_name: Quoted) {
    if EVENT_SELECTORS.contains_key(event_selector) {
        let existing_event = EVENT_SELECTORS.get(event_selector).unwrap();
        panic(
            f"Event selector collision detected between events '{event_name}' and '{existing_event}'",
        );
    }
    EVENT_SELECTORS.insert(event_selector, event_name);
}

pub comptime fn event(s: TypeDefinition) -> Quoted {
    let (event_interface_impl, event_selector) = generate_event_interface_and_get_selector(s);
    register_event_selector(event_selector, s.name());

    let serialize_impl = derive_serialize_if_not_implemented(s);

    s.add_attribute("abi(events)");

    quote {
        $event_interface_impl
        $serialize_impl
    }
}

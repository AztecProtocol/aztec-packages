use crate::macros::utils::{
    compute_struct_selector, derive_serialize_if_not_implemented, get_trait_impl_method,
};
use poseidon::poseidon2::Poseidon2Hasher;
use std::{collections::umap::UHashMap, hash::BuildHasherDefault, panic};

/// A map from event selector to event name indicating whether the event selector has already been seen during
/// the contract compilation - prevents event selector collisions.
pub comptime mut global EVENT_SELECTORS: UHashMap<Field, Quoted, BuildHasherDefault<Poseidon2Hasher>> =
    UHashMap::default();

comptime fn generate_event_interface_and_get_selector(s: TypeDefinition) -> (Quoted, Field) {
    let name = s.name();

    let event_selector = compute_struct_selector(
        s,
        quote { crate::event::event_selector::EventSelector::from_signature },
    );

    let from_field = get_trait_impl_method(
        quote { crate::event::event_selector::EventSelector }.as_type(),
        quote { crate::protocol_types::traits::FromField },
        quote { from_field },
    );

    (
        quote {
        impl aztec::event::event_interface::EventInterface for $name {
            fn get_event_type_id() -> aztec::event::event_selector::EventSelector {
                $from_field($event_selector)
            }
        }
    },
        event_selector,
    )
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

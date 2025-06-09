use aztec::macros::aztec;

#[aztec]
pub contract EventSelectorCollision {
    use aztec::{
        macros::events::event,
        protocol_types::{
            abis::event_selector::EventSelector, hash::poseidon2_hash_bytes, traits::ToField,
        },
    };

    // TODO: replace this with nice event signatures once Zorzal shares his script
    #[event]
    struct fn_selector_collision {
    }

    #[event]
    struct fn_selector_collision_1442740381 {
    }
}

mod tests {
    use aztec::protocol_types::{
        abis::event_selector::EventSelector,
        hash::{poseidon2_hash_bytes, poseidon2_hash_slice},
        traits::ToField,
    };

    fn compute_selector_from_bytes<let N: u32>(bytes: [u8; N]) -> Field {
        poseidon2_hash_bytes(bytes) as u32 as Field
    }

    #[test]
    unconstrained fn find_colliding_event_selectors() {
        let event_signature = "fn_selector_collision()";
        let event_selector = EventSelector::from_signature(event_signature).to_field();

        let event_signature_2 = "fn_selector_collision_1442740381()";
        let event_selector_2 = EventSelector::from_signature(event_signature_2).to_field();

        std::println(event_selector);
        std::println(event_selector_2);

        // assert_eq(
        //     compute_selector_from_bytes(event_signature.as_bytes()),
        //     event_selector,
        //     "Event selector implementation changed",
        // );

        // // Now we will keep on modifying the event signature until we find a collision.
        // let mut i = 0;
        // let mut found = false;
        // let mut test_signature = "TestEvent_".as_bytes().as_slice().map(|x| x as Field);
        // while !found & (i < 1000000) {
        //     let mut test_signature_copy = test_signature;
        //     for j in 32..127 {
        //         test_signature_copy = test_signature_copy.push_back(j as Field);

        //         let test_selector = poseidon2_hash_slice(test_signature_copy) as u32 as Field;
        //         // let test_selector = EventSelector::from_signature(test_signature);

        //         std::println(test_selector);

        //         if test_selector.eq(event_selector) {
        //             found = true;
        //             std::println(
        //                 f"Found collision! Original: {event_signature} New: {test_signature}",
        //             );
        //         }
        //     }
        //     i += 1;
        //     test_signature = test_signature_copy;
        // }

        // if !found {
        //     std::println("No collision found after 1M attempts");
        // }
    }
}

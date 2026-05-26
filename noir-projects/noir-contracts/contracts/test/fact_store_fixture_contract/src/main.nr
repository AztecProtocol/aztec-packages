// Fixture hosting the hand-written offchain-reception fold so PXE can run it via the simulator.
// The fact-type ids and array bounds MUST match offchain_reception_fixture.ts (created in a later task).
use aztec::macros::aztec;

#[aztec]
pub contract FactStoreFixture {
    use aztec::{macros::functions::external, protocol::traits::{Deserialize, Serialize}};

    global MAX_FACTS: u32 = 8;
    global MAX_PAYLOAD: u32 = 8;

    // Fact type ids. 0 is reserved for empty array slots and never matches a real fact.
    global TX_CONFIRMED_ID: Field = 1;
    global DISCOVERED_ID: Field = 2;
    global FINALIZED_ID: Field = 3;
    global EXPIRED_ID: Field = 4;
    // DELIVERED_ID = 5 is the birth fact; this fold does not inspect it.

    // ReceptionState codes: AWAITING_TX=0, EXPIRED=1, CONFIRMED=2, DISCOVERED=3, FINALIZED=4.

    #[derive(Deserialize, Serialize)]
    pub struct PackedFact {
        fact_type_id: Field,
        payload: [Field; MAX_PAYLOAD],
    }

    // Pure fold: state is a function only of which facts are present in the canonical set.
    #[external("utility")]
    unconstrained fn offchain_reception_fold(facts: [PackedFact; MAX_FACTS]) -> pub Field {
        let mut found_finalized = false;
        let mut found_tx_confirmed = false;
        let mut found_discovered = false;
        let mut found_expired = false;
        for i in 0..MAX_FACTS {
            if facts[i].fact_type_id == FINALIZED_ID {
                found_finalized = true;
            }
            if facts[i].fact_type_id == TX_CONFIRMED_ID {
                found_tx_confirmed = true;
            }
            if facts[i].fact_type_id == DISCOVERED_ID {
                found_discovered = true;
            }
            if facts[i].fact_type_id == EXPIRED_ID {
                found_expired = true;
            }
        }
        let state: Field = if found_finalized {
            4
        } else if found_tx_confirmed {
            if found_discovered {
                3
            } else {
                2
            }
        } else if found_expired {
            1
        } else {
            0
        };
        state
    }
}

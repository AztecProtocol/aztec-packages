// Fixture hosting the hand-written offchain-reception fold so PXE can run it via the simulator.
// The fact-type ids and array bounds MUST match offchain_reception_fixture.ts.
use aztec::macros::aztec;

#[aztec]
pub contract FactStoreFixture {
    use aztec::{macros::functions::external, protocol::traits::{Deserialize, Serialize}};

    global MAX_FACTS: u32 = 8;
    global MAX_PAYLOAD: u32 = 8;

    // Fact type ids. 0 is reserved for empty array slots and never matches a real fact.
    // RECEIVED_ID = 1 is the birth fact; this fold does not inspect it directly.
    global PROCESSED_ID: Field = 2;

    // ReceptionState codes: RECEIVED=0, PROCESSED=1.

    #[derive(Deserialize, Serialize)]
    pub struct PackedFact {
        fact_type_id: Field,
        // packed by the TS side to mirror the stored fact; not inspected by this fold
        payload: [Field; MAX_PAYLOAD],
    }

    // Pure fold: state is a function only of which facts are present in the canonical set.
    // PROCESSED iff any canonical fact is `Processed`, else RECEIVED.
    #[external("utility")]
    unconstrained fn offchain_reception_fold(facts: [PackedFact; MAX_FACTS]) -> pub Field {
        let mut found_processed = false;
        for i in 0..MAX_FACTS {
            if facts[i].fact_type_id == PROCESSED_ID {
                found_processed = true;
            }
        }
        if found_processed {
            1
        } else {
            0
        }
    }
}

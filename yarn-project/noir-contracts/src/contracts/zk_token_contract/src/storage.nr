use dep::aztec3::state_vars::map::Map;

// Global storage variables are a bit flakey at the moment (because they were built during the hackathon), so I'm reverting to regular Noir structs to try to get generics further along.
struct Storage {
    balances: Map,
}

impl Storage {
    fn init() -> Storage {
        Storage {
            balances: Map { storage_slot: 1 },
        }
    }
}
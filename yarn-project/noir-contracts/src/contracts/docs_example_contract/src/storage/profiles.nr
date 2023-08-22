// docs:start:state_vars-MapSingleton
use dep::aztec::state_vars::{
    map::Map,
    singleton::Singleton,
};

use crate::types::profile::{Profile, ProfileMethods, PROFILE_LEN};

fn init(storage_slot: Field) -> Map<Singleton<Profile, PROFILE_LEN>> {
    Map::new(storage_slot, |slot| Singleton::new(slot, ProfileMethods))
}
// docs:end:state_vars-MapSingleton
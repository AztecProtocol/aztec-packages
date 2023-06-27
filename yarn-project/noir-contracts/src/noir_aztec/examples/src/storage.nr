use dep::aztec::state_vars::immutable_singleton::ImmutableSingleton;
use dep::aztec::state_vars::map::Map;
use dep::aztec::state_vars::singleton::Singleton;
use dep::aztec::state_vars::set::Set;
use crate::notes::account_secret_note::AccountSecretNote;
use crate::notes::account_secret_note::AccountSecretNoteInterface;
use crate::notes::account_secret_note::ACCOUNT_SECRET_NOTE_LEN;
use crate::notes::prize_note::PrizeNote;
use crate::notes::prize_note::PrizeNoteInterface;
use crate::notes::prize_note::PRIZE_NOTE_LEN;
use crate::notes::profile_note::ProfileNote;
use crate::notes::profile_note::ProfileNoteInterface;
use crate::notes::profile_note::PROFILE_NOTE_LEN;
use crate::notes::value_note::ValueNote;
use crate::notes::value_note::ValueNoteInterface;
use crate::notes::value_note::VALUE_NOTE_LEN;

struct Storage {
    account_secrets: Map<ImmutableSingleton<AccountSecretNote, ACCOUNT_SECRET_NOTE_LEN>>,
    balances: Map<Set<ValueNote, VALUE_NOTE_LEN>>,
    prizes: Set<PrizeNote, PRIZE_NOTE_LEN>,
    queen: Singleton<ProfileNote, PROFILE_NOTE_LEN>,
}

impl Storage {
    fn init() -> Self {
        Storage {
            // We can use closure syntax to declare concrete state variable constructors succinctly.
            // Here, `s` is a 'derived storage slot', which will be derived by Map::at().
            account_secrets: Map::new(1, |s| ImmutableSingleton::new(s, AccountSecretNoteInterface)),
            balances: Map::new(2, |s| Set::new(s, ValueNoteInterface)),
            prizes: Set::new(3, PrizeNoteInterface),
            queen: Singleton::new(4, ProfileNoteInterface),
        }
    }
}
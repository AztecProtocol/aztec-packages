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

fn create_account_secret(storage_slot: Field) -> ImmutableSingleton<AccountSecretNote, ACCOUNT_SECRET_NOTE_LEN> {
    ImmutableSingleton::new(storage_slot, AccountSecretNoteInterface)
}

fn create_value_note_set(storage_slot: Field) -> Set<ValueNote, VALUE_NOTE_LEN>  {
    Set::new(storage_slot, ValueNoteInterface)
}

struct Storage {
    account_secrets: Map<ImmutableSingleton<AccountSecretNote, ACCOUNT_SECRET_NOTE_LEN>>,
    balances: Map<Set<ValueNote, VALUE_NOTE_LEN>>,
    prizes: Set<PrizeNote, PRIZE_NOTE_LEN>,
    queen: Singleton<ProfileNote, PROFILE_NOTE_LEN>,
    // nft_owners: Map<Singleton<AddressNote>>,
}

impl Storage {
    fn init() -> Self {
        Storage {
            account_secrets: Map::new(1, create_account_secret),
            balances: Map::new(2, create_value_note_set),
            prizes: Set::new(3, PrizeNoteInterface),
            queen: Singleton::new(4, ProfileNoteInterface),
        }
    }
}
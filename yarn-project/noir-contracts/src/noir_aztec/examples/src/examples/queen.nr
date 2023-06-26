use dep::aztec::context::Context;
use crate::notes::profile_note::ProfileNote;
use crate::notes::profile_note::replicate_profile_note;
use crate::storage::Storage;

fn set_first_queen(mut context: Context, storage: Storage, account: Field, score: Field) -> Context {
    let queen = ProfileNote::new(account, score);
    storage.queen.initialise(context, queen)
}

fn replace_queen(mut context: Context, storage: Storage, account: Field, score: Field) -> Context {
    let new_queen = ProfileNote::new(account, score);
    let (context, prev_queen) = storage.queen.replace(context, new_queen);
    assert(score as u32 > prev_queen.score as u32);
    context
}

fn init_or_replace_queen(mut context: Context, storage: Storage, account: Field, score: Field) -> Context {
    let has_queen = storage.queen.is_initialised();
    if (!has_queen) {
        set_first_queen(context, storage, account, score)
    } else {
        replace_queen(context, storage, account, score)
    }
}

fn is_queen(mut context: Context, storage: Storage, account: Field) -> Context {
    let (context, queen) = storage.queen.get_note(context, replicate_profile_note);
    assert(account == queen.address);
    context
}
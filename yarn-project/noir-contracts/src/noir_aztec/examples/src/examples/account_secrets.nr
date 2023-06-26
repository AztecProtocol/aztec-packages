use dep::aztec::oracle;
use dep::aztec::context::Context;
use dep::aztec::state_vars::immutable_singleton::ImmutableSingleton;
use crate::notes::account_secret_note::AccountSecretNote;
use crate::notes::account_secret_note::ACCOUNT_SECRET_NOTE_LEN;
use crate::storage::Storage;

fn register_secret(mut context: Context, storage: Storage, account: Field) -> Context {
    let account_secret: ImmutableSingleton<AccountSecretNote, ACCOUNT_SECRET_NOTE_LEN> = storage.account_secrets.at(account);
    let has_secret = account_secret.is_initialised();
    if (!has_secret) {
        let secret = oracle::get_secret(account);
        let note = AccountSecretNote::new(account, secret);
        context = account_secret.initialise(context, note);
    }
    context
}

fn get_secret(mut context: Context, storage: Storage, account: Field) -> (Context, Field) {
    let account_secret: ImmutableSingleton<AccountSecretNote, ACCOUNT_SECRET_NOTE_LEN> = storage.account_secrets.at(account);
    let (new_context, note) = account_secret.get_note(context);
    context = new_context;
    (context, note.secret)
}
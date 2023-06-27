mod account;
mod storage;
mod notes;
mod examples;
use dep::aztec::call_context::CallContext;
use dep::aztec::context::Context;
use notes::value_note::ValueNote;
use storage::Storage;

global call_context = CallContext {
    msg_sender: 1234567890,
    storage_contract_address: 98765432,
};

fn main(x : Field, y : pub Field) {
    let mut context = Context::new();
    let storage = Storage::init();

    // context = register_secret(context, storage, account);

    // context = mint(context, storage, x, 1);

    // context = add_prize(context, storage, 1, 2);

    // context = is_queen(context, storage, account);

    let note1 = ValueNote::new(x, 1);
    let note2 = ValueNote::new(y, 2);
    assert(note1.value != note2.value);
}

#[test]
fn test_main() {
    main(1, 2);

    // Uncomment to make test fail
    // main(1, 1);
}

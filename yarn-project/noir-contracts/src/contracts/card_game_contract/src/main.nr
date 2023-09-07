mod cards;

use dep::aztec::{
    context::{PrivateContext, PublicContext},
    state_vars::{
        map::Map,
    },
};

use dep::std::option::Option;

use cards::{Deck};

struct Storage {
    collections: Map<Deck>,
}

impl Storage {
    fn init(
        private_context: Option<&mut PrivateContext>,
        public_context: Option<&mut PublicContext>,
    ) -> Self {
        Storage {
            collections: Map::new(
                private_context,
                public_context,
                1,
                |private_context, public_context, slot| {
                    Deck::new(
                        private_context,
                        public_context,
                        slot,
                    )
                },
            )
        }
    }
}

contract CardGame {
    use dep::std::option::Option;
    use dep::aztec::abi::Hasher;
    use dep::value_note::{
        balance_utils,
        value_note::{
            ValueNoteMethods,
            VALUE_NOTE_LEN,
        },
    };

    use dep::aztec::{
        abi,
        constants_gen::{MAX_NOTES_PER_PAGE},
        abi::PrivateContextInputs,
        context::PrivateContext,
        note::{
            note_header::NoteHeader,
            utils as note_utils,
        },
    };

    use crate::Storage;
    use crate::cards::{
        PACK_CARDS,
        Deck, 
        Card,
        CardNote,
        get_pack_cards
    };


    #[aztec(private)]
    fn constructor() {}

    #[aztec(private)]
    fn buyPack(
        seed: Field, // The randomness used to generate the cards. Passed in for now.
    )  {
        let storage = Storage::init(Option::some(&mut context), Option::none());
        let mut cards = get_pack_cards(seed, context.msg_sender());

        let mut collection = storage.collections.at(context.msg_sender());
        let _inserted_cards = collection.add_cards(cards, context.msg_sender());
    }

    unconstrained fn getCollectionCards(owner: Field, offset: u32) -> [Option<Card>; MAX_NOTES_PER_PAGE] {
        let storage = Storage::init(Option::none(), Option::none());
        let collection = storage.collections.at(owner);
        let mut cards = [Option::none(); MAX_NOTES_PER_PAGE];
        let card_notes = collection.view_cards(offset);

        for i in 0..MAX_NOTES_PER_PAGE {
            cards[i] = card_notes[i].map(|card_note: CardNote| card_note.card);
        }

        cards
    } 

    // Computes note hash and nullifier.
    // Note 1: Needs to be defined by every contract producing logs.
    // Note 2: Having it in all the contracts gives us the ability to compute the note hash and nullifier differently for different kind of notes.
    unconstrained fn compute_note_hash_and_nullifier(contract_address: Field, nonce: Field, storage_slot: Field, preimage: [Field; VALUE_NOTE_LEN]) -> [Field; 4] {
        let note_header = NoteHeader { contract_address, nonce, storage_slot };
        note_utils::compute_note_hash_and_nullifier(ValueNoteMethods, note_header, preimage)
    }
}

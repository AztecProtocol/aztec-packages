mod cards;
mod game;

use dep::aztec::{
    context::{PrivateContext, PublicContext},
    state_vars::{
        map::Map,
        public_state::PublicState,
    },
};

use dep::std::option::Option;

use cards::{Deck};
use game::{Game, GameSerialisationMethods, GAME_SERIALISED_LEN};

struct Storage {
    collections: Map<Deck>,
    game_decks: Map<Map<Deck>>,
    games: Map<PublicState<Game, GAME_SERIALISED_LEN>>,
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
            ),
            game_decks: Map::new(
                private_context,
                public_context,
                2,
                |private_context, public_context, slot| {
                    Map::new(
                        private_context,
                        public_context,
                        slot,
                        |private_context, public_context, slot|{
                            Deck::new(
                                private_context,
                                public_context,
                                slot,
                            )
                        }
                    )
                },
            ),
            games: Map::new(
                private_context,
                public_context,
                3,
                |private_context, public_context, slot| {
                    PublicState::new(
                        private_context,
                        public_context,
                        slot,
                        GameSerialisationMethods,
                    )
                },
            )
        }
    }
}

contract CardGame {
    use dep::std::option::Option;
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
        abi::{
            Hasher, PrivateContextInputs,
        },
        context::PrivateContext,
        note::{
            note_header::NoteHeader,
            utils as note_utils,
        },
        oracle::compute_selector::compute_selector
    };

    use crate::Storage;
    use crate::cards::{
        PACK_CARDS,
        Deck, 
        Card,
        CardNote,
        get_pack_cards,
        compute_deck_strength,
    };
    use crate::game::{
        NUMBER_OF_PLAYERS,
        NUMBER_OF_CARDS_DECK,
        PLAYABLE_CARDS,
        PlayerEntry,
        Game
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

    #[aztec(private)]
    fn joinGame(
        game: u32,
        cards_fields: [Field; 2],
    )  {
        let cards = cards_fields.map(|card_field| Card::from_field(card_field));
        let storage = Storage::init(Option::some(&mut context), Option::none());
        let player = context.msg_sender();

        let mut collection = storage.collections.at(player);
        collection.remove_cards(cards, player);
        let mut game_deck = storage.game_decks.at(game as Field).at(player);
        let _added_to_game_deck = game_deck.add_cards(cards.map(|card: Card| {
            CardNote::new(card.strength, card.points, player)
        }), player);
        let selector = compute_selector("onGameJoined(u32,Field,u32)");
        let strength = compute_deck_strength(cards);
        context.call_public_function(context.this_address(), selector, [game as Field, player, strength]);
    }

    #[aztec(public)]
    internal fn onGameJoined(
        game: u32,
        player: Field,
        deck_strength: u32,
    )  {
        let storage = Storage::init(Option::none(), Option::some(&mut context));
        let game_storage = storage.games.at(game as Field);

        let mut game_data = game_storage.read();
        assert(game_data.add_player(PlayerEntry {address: player, deck_strength, points: 0}), "Game full");

        game_storage.write(game_data);
    }

    #[aztec(public)]
    fn startGame(game: u32)  {
        let storage = Storage::init(Option::none(), Option::some(&mut context));
        let game_storage = storage.games.at(game as Field);
        
        let mut game_data = game_storage.read();
        game_data.start_game();
        game_storage.write(game_data);
    }

    #[aztec(private)]
    fn playCard(
        game: u32,
        card: Card,
    )  {
        let storage = Storage::init(Option::some(&mut context), Option::none());
        let player = context.msg_sender();

        let mut game_deck = storage.game_decks.at(game as Field).at(player);
        game_deck.remove_cards([card], player);

        let selector = compute_selector("onCardPlayed(u32,Field,Field)");
        context.call_public_function(context.this_address(), selector, [game as Field, player, card.to_field()]);
    }

    #[aztec(public)]
    internal fn onCardPlayed(game: u32, player: Field, card_as_field: Field) {
        let storage = Storage::init(Option::none(), Option::some(&mut context));
        let game_storage = storage.games.at(game as Field);
        
        let mut game_data = game_storage.read();

        let card = Card::from_field(card_as_field);
        let current_player = game_data.current_player();
        assert(current_player.address == player, "Not your turn");
        game_data.play_card(card);

        game_storage.write(game_data);
    }

    #[aztec(private)]
    fn claimCards(
        game: u32,
        cards_fields: [Field; PLAYABLE_CARDS],
    )  {
        let storage = Storage::init(Option::some(&mut context), Option::none());
        let player = context.msg_sender();
        let cards_notes = cards_fields.map(|card_field| CardNote::from_card(Card::from_field(card_field), player));

        let mut collection = storage.collections.at(player);
        let _inserted_cards = collection.add_cards(cards_notes, player);

        let selector = compute_selector("onCardsClaimed(u32,Field,Field)");
        context.call_public_function(
            context.this_address(), 
            selector, 
            [game as Field, player, dep::std::hash::pedersen(cards_fields)[0]]
        );
    }

    #[aztec(public)]
    internal fn onCardsClaimed(game: u32, player: Field, cards_hash: Field) {
        let storage = Storage::init(Option::none(), Option::some(&mut context));
        let game_storage = storage.games.at(game as Field);
        let mut game_data = game_storage.read();
        
        assert(!game_data.claimed, "Already claimed");
        game_data.claimed = true;

        assert_eq(
            cards_hash, 
            dep::std::hash::pedersen(game_data.rounds_cards.map(|card: Card| card.to_field()))[0]
        );

        let winner = game_data.winner();
        assert_eq(player, winner.address, "Not the winner");

        game_storage.write(game_data);
    }

    unconstrained fn viewCollectionCards(owner: Field, offset: u32) -> [Option<Card>; MAX_NOTES_PER_PAGE] {
        let storage = Storage::init(Option::none(), Option::none());
        let collection = storage.collections.at(owner);
        let mut cards = [Option::none(); MAX_NOTES_PER_PAGE];
        let card_notes = collection.view_cards(offset);

        for i in 0..MAX_NOTES_PER_PAGE {
            cards[i] = card_notes[i].map(|card_note: CardNote| card_note.card);
        }

        cards
    } 

    unconstrained fn viewGameCards(game: u32, player: Field, offset: u32) -> [Option<Card>; MAX_NOTES_PER_PAGE] {
        let storage = Storage::init(Option::none(), Option::none());
        let game_deck = storage.game_decks.at(game as Field).at(player);
        let mut cards = [Option::none(); MAX_NOTES_PER_PAGE];
        let card_notes = game_deck.view_cards(offset);

        for i in 0..MAX_NOTES_PER_PAGE {
            cards[i] = card_notes[i].map(|card_note: CardNote| card_note.card);
        }

        cards
    } 

    unconstrained fn viewGame(game: u32) -> Game {
        Storage::init(Option::none(), Option::none()).games.at(game as Field).read()
    } 

    // Computes note hash and nullifier.
    // Note 1: Needs to be defined by every contract producing logs.
    // Note 2: Having it in all the contracts gives us the ability to compute the note hash and nullifier differently for different kind of notes.
    unconstrained fn compute_note_hash_and_nullifier(contract_address: Field, nonce: Field, storage_slot: Field, preimage: [Field; VALUE_NOTE_LEN]) -> [Field; 4] {
        let note_header = NoteHeader { contract_address, nonce, storage_slot };
        note_utils::compute_note_hash_and_nullifier(ValueNoteMethods, note_header, preimage)
    }
}

// Noir implementation of a simple card game based on a high card mechanic.

contract CGam {
    mod storage;

    use dep::aztec::state_vars::map::Map;
    use dep::aztec::state_vars::set::Set;

    use dep::std;
    use dep::aztec::abi;
    use dep::aztec::abi::PrivateContextInputs;
    use dep::aztec::abi::PublicContextInputs;
    use dep::aztec::context::Context;
    use dep::aztec::types::point::Point;
    use dep::aztec::public_call_stack_item::PublicCallStackItem;

    // oracles
    use dep::aztec::oracle::get_secret_key::get_secret_key;
    use dep::aztec::oracle::logs::emit_encrypted_log;
    use dep::aztec::oracle::logs::emit_unencrypted_log;
    use storage::{
        Card,
        assert_own_card,
        user_cards_private_storage,
        user_decks_private_storage,
        deck_strength_public_storage,
        user_plays_public_storage,
        player_order_public_storage,
        played_cards_public_storage,
        winning_card_public_storage,
        game_points_public_storage,
        winning_user_public_storage,
        user_points_public_storage,
        winner_public_storage,
        user_pub_key_public_storage,
        user_collection_insert,
        user_deck_insert,
        user_deck_get
    };

    //*********************************/
    // Mapping from card_id to CardNote state
    // secret cards: Map<Field, Set<CardNote>>;
    // TODO file bug for why we cant do Map::new
    // global cards: Map = Map {storage_slot: 1};
    //*********************************/

    //PublicState name has been used instead of StorageField  :(
    // global game_id: StorageField = StorageField {storage_slot: 2};

    fn constructor(
        inputs: PrivateContextInputs,
    ) -> distinct pub abi::PrivateCircuitPublicInputs {
        // Return private circuit public inputs. All private functions need to return this as it is part of the input of the private kernel.
        Context::new(inputs, 0).finish()
    }

    // //number of players that joined the game
    // global game_players = StorageMap { storage_slot: 12 };
    // // get the nb of players:
    // //game_players.at(game_id).read()
    // // update the nb of players:

    // //game_players.at(game_id).write(4);

    // //number of players for the game
    // global num_players = StorageMap { storage_slot: 3 };

    // //average strengh of user deck

    // global deck_strength_storage = StorageMap { storage_slot: 4 };

    // //users' deck
    // global user_deck = Map { storage_slot: 5 };

    // //user plays: user_id -> 0 if not yet played, 1 if played
    // global users_plays = StorageMap { storage_slot: 6 };

    // //users order: 0 -> id of the first player, 1->id of the second, ...
    // global player_order = StorageMap { storage_slot: 7 };

    // //played cards: card.id() -> 1
    // global played_cards = StorageMap { storage_slot: 8 };

    // // (currrent) winner card: game_id -> card_id
    // global winning_card = StorageMap { storage_slot: 9};

    // // (current) points at stake: game_id -> points
    // global game_points = StorageMap { storage_slot: 10 };

    // // (currrent) winner card: game_id -> owner.x
    // global winning_user = StorageMap { storage_slot: 16};

    // // user points: game_id+user_id -> points
    // global user_points = StorageMap { storage_slot: 11 };

    // // winner: game_id -> user_id
    // global winner = StorageMap { storage_slot: 13 };

    // // map game_id+user_id to owner.x
    // global user_pub_key = StorageMap { storage_slot: 14 };

    // // TODO feedback: we found it very limiting having resource limits (e.g. read requests) tied to callstacks
    // // This feels potentially something to be entirely revisited (can we be more flexile?), or managed by the user
    // // or at least have very clear errors. BoundedVec could report out of bounds better, at the very least
    global MAX_CARDS = 2; // Limited by square root of read requests (max 4, so 2)
    global MAX_PLAYERS = 2; // Limited by square root of read requests (max 4, so 2)
    global PACK_CARDS = 3; // Limited by number of write requests (max 4)

    // // map game_id to set of notes = card note
    // //global revealed_cards = StorageMap { storage_slot: 15 };

    // // TODO we would like to use real unconstrained fn's
    // /// ABI get_pack_cards_unconstrained type "unconstrained"
    fn get_pack_cards_unconstrained(
        seed: Field,
        owner: Point
    ) -> pub [Field; PACK_CARDS] {
        let sk = get_secret_key(owner);
        let mut user_seed = [0; 32];
        let seeds = seed.to_le_bytes(32);
        let sk_bytes = sk.to_le_bytes(32);
        for i in 0..32 {
            user_seed[i] = seeds[i] ^ sk_bytes[i];
        }
        // generate randomness deterministically from 'public randomness' and user secret
        let random = std::hash::sha256(user_seed);
        // bytes to field
        let mut random_as_field: Field = 0;
        let mut r: Field = 1;
        for i in 0..31 {
            random_as_field += (random[i] as Field )* r;
            r = r*2;
        }
        let mut cards = [0; PACK_CARDS];
        // we generate PACK_CARDS cards
        for i in 0..PACK_CARDS {
            let card_random_traits = random_as_field * (i + 1);
            cards[i] = card_random_traits;
        }
        cards
    }

    fn get_pack_cards(
        seed: Field,
        owner: Point
    ) -> pub [Field; PACK_CARDS] {
        let sk = get_secret_key(owner);
        let mut user_seed = [0; 32];
        let seeds = seed.to_le_bytes(32);
        let sk_bytes = sk.to_le_bytes(32);
        for i in 0..32 {
            user_seed[i] = seeds[i] ^ sk_bytes[i];
        }
        // generate randomness deterministically from 'public randomness' and user secret
        let random = std::hash::sha256(user_seed);
        // bytes to field
        let mut random_as_field: Field = 0;
        let mut r: Field = 1;
        for i in 0..31 {
            random_as_field += (random[i] as Field )* r;
            r = r*2;
        }
        let mut cards = [0; PACK_CARDS];
        // we generate PACK_CARDS cards
        for i in 0..PACK_CARDS {
            let card_random_traits = random_as_field * (i + 1);
            cards[i] = card_random_traits;
        }
        cards
    }

    fn buy_pack(
          //*********************************/
        // Should eventually be hidden:
        inputs: PrivateContextInputs,
        //*********************************/
        seed: Field,    //public randomness
        owner: Point,
    ) -> distinct pub abi::PrivateCircuitPublicInputs {
        let mut context = Context::new(inputs, abi::hash_args([seed, owner.x, owner.y]));
        // check user balance can afford the cards
        // TODO

        // create a note for the c-gam contract with the price of the pack
        // TODO

        // nullify the user notes
        // TODO

        // we generate PACK_CARDS cards
        let pack_cards = get_pack_cards(seed, owner);
        for card_data in pack_cards {
            let card = Card {
                inner: card_data
            };
            context = user_collection_insert(context, owner, card);
        }

        context.finish()
    }

    /// start_game is called by join_game once the expected number of players have joined.
    /// It needs to have a game ID that has not been used for another game yet.
    /// TODO add number of players for the game, but we have max 2 anyway right now due to limited read requests
    open fn start_game(game_id: Field) {
        // // we compute the players play order
        // let player_nb = 2; //num_players.at(game_id).read();

        // // no winner yet
        // let _5 = winner.at(game_id).write(MAX_PLAYERS + 1);

        // // get the player strength
        // let mut player_strengths = [0;MAX_PLAYERS];
        // for i in 0..MAX_PLAYERS {
        //     let mut idx = (game_id + i) as Field;
        //     idx = idx*(idx+1)/2 + game_id;
        //     player_strengths[i] = deck_strength_storage.at(idx).read() as u8;
        // }
        // // get the player order: TODO to review...
        // let sorted = player_strengths.sort();
        // let mut players_turn = [MAX_PLAYERS + 1; MAX_PLAYERS];
        // for j in 0..MAX_PLAYERS {
        //     if j as u8 < player_nb as u8 {
        //         for i in 0..MAX_PLAYERS {
        //             if player_strengths[i] == sorted[MAX_PLAYERS-j] {
        //                 player_strengths[i] = 0;
        //                 if players_turn[j] as u8 >= MAX_PLAYERS as u8 {
        //                     players_turn[j] = i;
        //                 }
        //             }
        //         }
        //     }
        // }
        // //we store the user order
        // for i in 0..MAX_PLAYERS {
        //     // when i is over the actual nb of players, we will set the player_order to 0, which is fine.
        //     let mut idx = (game_id + i) as Field;
        //     idx = idx*(idx+1)/2 + game_id;
        //     player_order.at(idx).write(players_turn[i]);
        // }
    }

    // TODO should only be callable by join_game - how? check caller?
    open fn join_game_pub(game_id: Field, owner: Point, deck_strength: Field) {
        // // we generate a user id:
        // let user_id = game_players.at(game_id).read();
        // let _1 = game_players.at(game_id).write(user_id + 1);

        // // we associate the user_id to the user pub key
        // let mut idx = (game_id + user_id) as Field;
        // idx = idx*(idx+1)/2 + game_id;
        // let _4 = user_pub_key.at(idx).write(owner.x);
        
        // // store the player strength
        // let user_hash = std::hash::pedersen([owner.x, game_id])[0];
        // let _3 = deck_strength_storage.at(user_hash).write(deck_strength as Field);
        // // user has not yet played
        // let _2 = users_plays.at(user_hash).write(0);

        // if user_id == num_players.at(game_id).read() {
        //     start_game(game_id);
        // }
    }

    /// join_game is called with a random UUID that is computed offchain and communicated to other players (possibly onchain).
    /// It needs to have a game ID that has not been used for another game yet.
    // TODO currently we accept our own contract's address, and a selector for join_game_pub
    // TODO ideally there would be an easier way to do this *waves hands*
    fn join_game(
        inputs: PrivateContextInputs,
        game_id: Field,
        user_cards: [Card; MAX_CARDS],
        owner: Point,
        join_game_pub_selector: Field
    ) -> pub abi::PrivateCircuitPublicInputs {
        let mut context = Context::new(inputs, abi::hash_args([
            game_id, 
            user_cards[0].id(),
            user_cards[1].id(), // Up to MAX_CARDS - 1
            owner.x,
            owner.y,
            join_game_pub_selector
        ]));

        //TODO commit to $$

        // checks that cards belong to the user
        for i in 0..MAX_CARDS {
            // TODO it hurts when failing asserts just says 'contraints cant be solved'
            context = assert_own_card(context, user_cards[i], owner);
        }
        // compute the deck strength
        let mut deck_strength: u32 = 0;
        for card in user_cards {
            deck_strength + = card.strength() as u32;
        }
        deck_strength = deck_strength / (MAX_CARDS as u32);

        // Unroll our arguments
        let mut args = [0; abi::MAX_ARGS];
        args[0] = game_id;
        args[1] = owner.x;
        args[2] = owner.y;
        args[3] = deck_strength as Field;
        let (_callStackItem, mut context2) = PublicCallStackItem::call(
            inputs.call_context.storage_contract_address, // address of this contract
            join_game_pub_selector, 
            [game_id, owner.x, owner.y, deck_strength as Field],
            context
        );

        // TODO
        // maps the user_id to its cards = user_deck
        // TODO undo hacks
        for i in 0..MAX_CARDS {
            context2 = user_deck_insert(owner, game_id, i, i, user_cards, context2);
        }

        // for i in 0..MAX_CARDS {
        //     alternative; use a map to a set of notes
        //           Map -> Set.insert(cardn.1)
        //         Map(same key = user_id) -> Set.insert(cardn.2)
        //          get_2() -> card1, card_storage_slot
        //         get_5()
        // }
        context.finish()
    }

    //EXTERNAL
    fn show_card(
        inputs: PrivateContextInputs, 
        card: Card, 
        owner: Point
    ) -> pub abi::PrivateCircuitPublicInputs {
        let mut context = Context::new(inputs, abi::hash_args([card.id(), owner.x, owner.y]));
            // checks that card belongs to the deck and it not already played
        context = assert_own_card(context, card, owner);
        //call open_show_card ... TODO
        context.finish()
    }
    
    // TODO private access control needed for noir contracts
    // only the smart contract should be able to queue this
    open fn open_show_card(
        //*********************************/
        // Should eventually be hidden:
        inputs: PublicContextInputs,
        //*********************************/
        user_id: Field,
        game_id: Field,
        card: Card,
        owner: Point
    ) {
        // checks that card is not already played
        assert(played_cards_public_storage().at(card.id()).read() == 0);

        // let card_note = Note {
        //     value: card.id(),
        //     owner: owner,
        //     is_real: true,
        // };
        ///////////////////////////////////////////////

        // check user turn
        let mut check = true;
        for i in 0..MAX_PLAYERS {
            let mut idx = (game_id + i) as Field;
            idx = idx*(idx+1)/2 + game_id;
            //all previous players must have played
            if i as u8 <user_id as u8 {
                let player_i = player_order_public_storage().at(idx).read();
                let mut j = (game_id + player_i) as Field;
                    j = j*(j+1)/2 + game_id;
                assert(user_plays_public_storage().at(j).read() == 1);
            } else {
                // user must not have played yet
                if i == user_id {
                    assert(user_plays_public_storage().at(idx).read() == 0);
                }
            }
        }

        // we track the winner card: winning_card: game_id -> card_id
        let win_card_id = winning_card_public_storage().at(game_id).read();
        let win_card = Card { inner: win_card_id };
        if win_card.strength() < card.strength() {
            let _1 = winning_card_public_storage().at(game_id).write(card.id());
            winning_user_public_storage().at(game_id).write(owner.x);
        }
        //N.B. when you show a card, it must have strictly more strength than the others to win.
        // we could implement some rules in case of a draw

        // we track the sum of points: game_points:  game_id -> points
        let points = game_points_public_storage().at(game_id).read();
        let _4 = game_points_public_storage().at(game_id).write(points + card.points() as Field);

        // user has played
        let mut idx = (game_id + user_id) as Field;
        idx = idx*(idx+1)/2 + game_id;
        let _3 = player_order_public_storage().at(idx).write(1);

        // set the card as played
        let _5 = played_cards_public_storage().at(card.id()).write(1);

        // count how players have played:
        let mut count = 0;
        for user_id in 0..MAX_PLAYERS {
            let mut idx = (game_id + user_id) as Field;
            idx = idx*(idx+1)/2 + game_id;
            count = count + player_order_public_storage().at(idx).read();
        }
        if count == 2 { // num_players.at(game_id).read() {
            end_turn(game_id);
        }
    }

    // TODO private
    open fn end_turn(game_id: Field) {
        // we reset the 'user has played'
        for i in 0..MAX_PLAYERS {
            let mut idx = (game_id + i) as Field;
            idx = idx*(idx+1)/2 + game_id;
            let _2 = user_plays_public_storage().at(idx).write(0);
        }

        // give the points to the winner of the turn
        let mut user_id = MAX_PLAYERS + 1;
        let win = winning_card_public_storage().at(game_id).read();
        for i in 0..MAX_PLAYERS {
            let mut idx = (game_id + i) as Field;
            idx = idx*(idx+1)/2 + game_id;
            // we could used the 'public shown cards' instead
            if user_pub_key_public_storage().at(idx).read() == winning_user_public_storage().at(game_id).read() {
                user_id = i;
            }
        }

        let turn_points = game_points_public_storage().at(game_id).read();
        let _4 = game_points_public_storage().at(game_id).write(0);
        let mut idx = (game_id + user_id) as Field;
        idx = idx*(idx+1)/2 + game_id;
        let current_points = user_points_public_storage().at(idx).read();
        let _1 = user_points_public_storage().at(idx).write(current_points + turn_points);

        //if all cards are played, we should end the game
        // first we retrive the last player:
        let mut last_player = 0;
        for i in 0..MAX_PLAYERS {
            let user = player_order_public_storage().at(i).read();
            if user != 0 {
                last_player = user;
            }
        }
        //then we check if all his cards are played
        let mut is_end_game = false;
        for i in 0..MAX_CARDS {
            idx = (game_id + (MAX_CARDS as Field)*last_player+(i as Field)) as Field;
            idx = idx*(idx+1)/2 + game_id;
            let card_id = 0; // TODO user_deck.at(idx).get();
            idx = (game_id + card_id) as Field;
            idx = idx*(idx+1)/2 + game_id;
            if is_end_game == false {
                is_end_game = played_cards_public_storage().at(idx).read() == 1;
            }
        }
        if is_end_game {
            end_game(game_id);
        }
    }

    fn end_game(game_id: Field) {
        //compute the winner
        let mut max_points: u32 = 0;
        let mut winner_id = MAX_PLAYERS + 1;
        for i in 0..MAX_PLAYERS {
            let mut idx = (game_id + i) as Field;
            idx = idx*(idx+1)/2 + game_id;
            let user_points: Field = user_points_public_storage().at(idx).read();
            if user_points as u32 > max_points {
                winner_id = i;
                max_points = user_points as u32;
            }
        }
        //store the winner
        let _1 = winner_public_storage().at(game_id).write(winner_id);
    }

    fn private_claim_winnings(inputs: PrivateContextInputs, game_id: Field, owner: Point) -> pub abi::PrivateCircuitPublicInputs {
        let mut initialContext = Context::new(inputs, abi::hash_args([game_id, owner.x, owner.y]));

        // TODO prove we won!!!
        // TODO do we want to burn?
        // // burn the played_cards: N.B. we could track the played card in a public structure and not call this private function
        // for user_id in 0..MAX_PLAYERS {
        //     for i in 0..MAX_CARDS {
        //         let mut idx = (game_id + 5*user_id+i) as Field;
        //         idx = idx*(idx+1)/2 + game_id;
        //         let (mut context, (card_note1, card_note2)) = user_deck.at(idx).get_2(initialContext); //temp
        //         cards.at(game_id).remove(inputs, context,card_note1);
        //     }
        // }

        // TODO send the reward to the user

        initialContext.finish()
    }

    // // EXTERNAL
    open fn claim_winnings(
        game_id: Field,
        owner: Point
    ) {
        let winner: Field = winner_public_storage().at(game_id).read();
        assert(winner as u8 < MAX_PLAYERS as u8);
        // match user public key with user id
        let mut idx = (game_id + winner) as Field;
        idx = idx*(idx+1)/2 + game_id;
        assert(user_pub_key_public_storage().at(idx).read() == owner.x);

        // at the end we need to burn the played_cards: TODO call a private function which is going to do it
    }
}

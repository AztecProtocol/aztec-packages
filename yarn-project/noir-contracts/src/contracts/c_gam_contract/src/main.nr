// Noir implementation of a private token contract. It allows for the minting, and transfer of tokens. This contract
// only works with private state and for this reason user balances are stored as notes (total user balance is
// represented as a set of notes).


fn hash_with_storage_slot(storage_slot: Field, key: Field) -> Field {
    dep::std::hash::pedersen([
        dep::aztec3::MappingStorageSlot,
        storage_slot,
        key
    ])[0]
}

contract CGam {
    // mod card;
    mod user_deck;
    use dep::std;
    use dep::aztec3::abi;
    use dep::aztec3::abi::PrivateContextInputs;
    use dep::aztec3::abi::PublicContextInputs;
    use dep::aztec3::context::PrivateFunctionContext;
    use dep::aztec3::notes::value_note::Note;
    use dep::aztec3::types::point::Point;
    use dep::aztec3::state_vars::map::Map;
    use dep::aztec3::state_vars::storage_map::StorageMap;
    use dep::aztec3::state_vars::storage_field::StorageField;
    use dep::aztec3::state_vars::set::Set;
    use dep::aztec3::public_call_stack_item::PublicCallStackItem;

    // oracles
    use dep::aztec3::oracle::get_secret_key::get_secret_key;
    use dep::aztec3::oracle::logs::emit_encrypted_log;
    use dep::aztec3::oracle::logs::emit_unencrypted_log;

    use user_deck::Card;
    use user_deck::user_deck_insert;
    use crate::hash_with_storage_slot;

    //*********************************/
    // Mapping from card_id to CardNote state
    // secret cards: Map<Field, Set<CardNote>>;
    // TODO file bug for why we cant do Map::new
    global cards: Map = Map {storage_slot: 1};
    //*********************************/

    //PublicState name has been used instead of StorageField  :(
    global game_id: StorageField = StorageField {storage_slot: 2};

    fn constructor(
        inputs: PrivateContextInputs,
    ) -> distinct pub abi::PrivateCircuitPublicInputs {
        // Return private circuit public inputs. All private functions need to return this as it is part of the input of the private kernel.
        PrivateFunctionContext::new().finish(inputs)
    }

    //number of players that joined the game
    global game_players = StorageMap { storage_slot: 12 };
    // get the nb of players:
    //game_players.at(game_id).read()
    // update the nb of players:
    //game_players.at(game_id).write(4);

    //number of players for the game
    global num_players = StorageMap { storage_slot: 3 };

    //average strengh of user deck
    global deck_strength = StorageMap { storage_slot: 4 };

    //users' deck
    global user_deck = Map { storage_slot: 5 };

    //user plays: user_id -> 0 if not yet played, 1 if played
    global users_plays = StorageMap { storage_slot: 6 };

    //users order: 0 -> id of the first player, 1->id of the second, ...
    global player_order = StorageMap { storage_slot: 7 };

    //played cards: card.id() -> 1
    global played_cards = StorageMap { storage_slot: 8 };

    // (currrent) winner card: game_id -> card_id
    global winning_card = StorageMap { storage_slot: 9};

    // (current) points at stake: game_id -> points
    global game_points = StorageMap { storage_slot: 10 };

    // (currrent) winner card: game_id -> owner.x
    global winning_user = StorageMap { storage_slot: 16};

    // user points: game_id+user_id -> points
    global user_points = StorageMap { storage_slot: 11 };

    // winner: game_id -> user_id
    global winner = StorageMap { storage_slot: 13 };

    // map game_id+user_id to owner.x
    global user_pub_key = StorageMap { storage_slot: 14 };

    // TODO feedback: we found it very limiting having resource limits (e.g. read requests) tied to callstacks
    // This feels potentially something to be entirely revisited (can we be more flexile?), or managed by the user
    // or at least have very clear errors. BoundedVec could report out of bounds better, at the very least
    global MAX_CARDS = 2; // Limited by square root of read requests (max 4, so 2)
    global MAX_PLAYERS = 2; // Limited by square root of read requests (max 4, so 2)
    global PACK_CARDS = 3; // Limited by number of write requests (max 4)

    // map game_id to set of notes = card note
    //global revealed_cards = StorageMap { storage_slot: 15 };

    fn buy_pack(
          //*********************************/
        // Should eventually be hidden:
        inputs: PrivateContextInputs,
        //*********************************/
        seed: Field,    //public randomness
        owner: Point,
        ) -> distinct pub abi::PrivateCircuitPublicInputs
    {
        let mut context = PrivateFunctionContext::new();
        context.args = context.args.push_array([seed, owner.x, owner.y]);
        // check user balance can afford the cards
        // TODO

        // create a note for the c-gam contract with the price of the pack
        // TODO

        // nullify the user notes
        // TODO

        // Generate the 'user seed' for generating the cards
        // from a public randomness (in argument for now, could be a call to a L1 contract)
        // and from user secret key (so nobody else can figure out user cards)
        let sk = get_secret_key(owner);
        let mut user_seed = [0; 32];
        let seeds = seed.to_le_bytes(32);
        let sk_bytes = sk.to_le_bytes(32);
        for i in 0..32 {
            user_seed[i] = seeds[i] ^ sk_bytes[i];
        }
        // generate randomness deterministically from 'public randomness' and user secret
        let random = std::hash::sha256(user_seed);
        //bytes to field
        let mut random_as_field: Field = 0;
        let mut r: Field = 1;
        for i in 0..31 {
            random_as_field += (random[i] as Field )* r;
            r = r*2;
        }
        //we generate PACK_CARDS cards
        for i in 0..PACK_CARDS {
            let card_random_traits = random_as_field * (i + 1);
            let card = Card {
                inner: card_random_traits
            };
            //let card_note = CardNote::new(card, owner);
            // let note_hash = card_note.compute_note_hash();
            // let card_storage_slot = hash_with_storage_slot(cards_storage_slot_separator, card.id());
            // let record = hash_with_storage_slot(card_storage_slot, note_hash);
            // context = context.push_new_note_hash(record);
            // // Assert to prevent optimizing away.
            // assert(notify_created_card_note(card_storage_slot, card_note.owner, card_note) == 0);

            // let Set::new(card_id_storage_slot);
            cards.at(card.id()).insert(context, Note::new(card.id(), owner));
        }

        context.finish(inputs)
    }

    open fn create_game (
        //*********************************/
        // Should eventually be hidden:
        inputs: PublicContextInputs,
        //*********************************/
      //  num_players: Field
      ) -> Field
    {
        // FEAT_REQUEST: game_id += 1; for a public state variable.
        let old_id = game_id.read();
        let new_id = old_id + 1;
        game_id.write(new_id)

        //add  number of players for the game
    }

    open fn start_game(g_id: Field) {
        // we compute the players play order
        let player_nb = num_players.at(g_id).read();

        // no winner yet
        let _5 = winner.at(g_id).write(MAX_PLAYERS + 1);

        // get the player strength
        let mut player_strengths = [0;MAX_PLAYERS];
        for i in 0..MAX_PLAYERS {
            let mut idx = (g_id + i) as Field;
            idx = idx*(idx+1)/2 + g_id;
            player_strengths[i] = deck_strength.at(idx).read() as u8;
        }
        // get the player order: TODO to review...
        let sorted = player_strengths.sort();
        let mut players_turn = [MAX_PLAYERS + 1; MAX_PLAYERS];
        for j in 0..MAX_PLAYERS {
            if j as u8 < player_nb as u8 {
                for i in 0..MAX_PLAYERS {
                    if player_strengths[i] == sorted[MAX_PLAYERS-j] {
                        player_strengths[i] = 0;
                        if players_turn[j] as u8 >= MAX_PLAYERS as u8 {
                            players_turn[j] = i;
                        }
                    }
                }
            }
        }
        //we store the user order
        for i in 0..MAX_PLAYERS {
            // when i is over the actual nb of players, we will set the player_order to 0, which is fine.
            let mut idx = (g_id + i) as Field;
            idx = idx*(idx+1)/2 + g_id;
            player_order.at(idx).write(players_turn[i]);
        }
    }

    fn assert_own_card(
        initialContext: PrivateFunctionContext,
        card: Card, 
        owner: Point
    ) -> pub PrivateFunctionContext {
        let (mut context, (note, _unusedNote2)) = cards.at(card.id()).get_2(initialContext);
        assert(note.owner.x == owner.x);
        context
    }

    open fn join_game_pub(g_id: Field, owner: Point, deck_str: Field) {
  
            //we generate a user id:
            let user_id = game_players.at(g_id).read();
            let _1 = game_players.at(g_id).write(user_id + 1);

            //we associate the user_id to the user pub key
            let mut idx = (g_id + user_id) as Field;
            idx = idx*(idx+1)/2 + g_id;
            let _4 = user_pub_key.at(idx).write(owner.x);

          
            // store the player strenght
            let user_hash = std::hash::pedersen([owner.x, g_id])[0];
            let _3 = deck_strength.at(user_hash).write(deck_str as Field);
            // user has not yet played
            let _2 = users_plays.at(user_hash).write(0);

             if user_id == num_players.at(g_id).read() {
                start_game(g_id);
            }
}

    fn join_game(
        inputs: PrivateContextInputs,
        g_id: Field,
        user_cards: [Card; MAX_CARDS],
        owner: Point,
    ) {
        let mut context = PrivateFunctionContext::new();
        context.args = context.args.push_array([g_id, user_cards[0].id(), user_cards[1].id(),
        user_cards[2].id(),
        user_cards[3].id(),
        user_cards[4].id(),
        owner.x, owner.y, ]);

        //TODO commit to $$

        //checks that cards belong to the user
        for i in 0..MAX_CARDS {
            context = assert_own_card(context, user_cards[i], owner);
        }
        // compute the deck strength
        let mut deck_str : u32 = 0;
        for card in user_cards {
            deck_str + = card.strength() as u32;
        }
        deck_str = deck_str / (MAX_CARDS as u32);
    

        // //TODO call join_game_pub()
        // let mut args = [0; abi::MAX_ARGS];
        // args[0] = 0;//? TODO targetValue;
        // let targetContract = 0; ///?? TODO
        // let targetSelector = 0; ///?? TODO
        // let (_callStackItem, mut context2) = PublicCallStackItem::call(targetContract, targetSelector, args, context);

        // // maps the user_id to its cards = user_deck
        // // TODO undo hacks
        // context2 = user_deck_insert(owner, g_id, 0, 0, user_cards, context2);
        // context2 = user_deck_insert(owner, g_id, 1, 1, user_cards, context2);
        // context2 = user_deck_insert(owner, g_id, 2, 2, user_cards, context2);
        // context2 = user_deck_insert(owner, g_id, 3, 3, user_cards, context2);
        // context2 = user_deck_insert(owner, g_id, 4, 4, user_cards, context2);

        // //for i in 0..MAX_CARDS {
        //     //alternative; use a map to a set of notes
        //     //       Map -> Set.insert(cardn.1)
        //     //     Map(same key = user_id) -> Set.insert(cardn.2)
        //     //      get_2() -> card1, card_storage_slot
        //     //     get_5()
        // //}
    }

    // // //TODO should not be a contract function !!
    // // //TODO HACK needed why can't comptime decay to normal Field when passed to pedersen?
    // // fn user_deck_insert(owner: Point, g_id: Field, i_hack_comptime : comptime Field, i : Field, user_cards: [Card; 5], initialContext: PrivateFunctionContext) -> pub PrivateFunctionContext{
    // //     let card_note = Note::new(user_cards[i_hack_comptime].id(), owner);
    // //     let idx = std::hash::pedersen([owner.x, g_id, i])[0];
    // //     user_deck.at(idx).insert(initialContext, card_note)
    // // }

    // //EXTERNAL
    // fn show_card(
    //     inputs: PrivateContextInputs, card: Card, owner: Point) -> pub abi::PrivateCircuitPublicInputs {
    //         let mut context = PrivateFunctionContext::new();
    //         context.args = context.args.push_array([card.id(), owner.x, owner.y]);
    //            // checks that card belongs to the deck and it not already played
    //         context = assert_own_card(context, card, owner);
    //         //call open_show_card ... TODO
    //         context.finish(inputs)
    // }
    
    // // TODO private access control needed for noir contracts
    // // only the smart contract should be able to queue this
    // open fn open_show_card(
    //     //*********************************/
    //     // Should eventually be hidden:
    //     inputs: PublicContextInputs,
    //     //*********************************/
    //     user_id: Field,
    //     g_id: Field,
    //     card: Card,
    //     owner: Point
    // ) {
    //     // checks that card is not already played
    //     assert(played_cards.at(card.id()).read() == 0);

    //     // let card_note = Note {
    //     //     value: card.id(),
    //     //     owner: owner,
    //     //     is_real: true,
    //     // };
    //     ///////////////////////////////////////////////

    //     // check user turn
    //     let mut check = true;
    //     for i in 0..MAX_PLAYERS {
    //         let mut idx = (g_id + i) as Field;
    //         idx = idx*(idx+1)/2 + g_id;
    //         //all previous players must have played
    //         if i as u8 <user_id as u8 {
    //             let player_i = player_order.at(idx).read();
    //             let mut j = (g_id + player_i) as Field;
    //                 j = j*(j+1)/2 + g_id;
    //             assert(users_plays.at(j).read() == 1);
    //         } else {
    //             // user must not have played yet
    //             if i == user_id {
    //                 assert(users_plays.at(idx).read() == 0);
    //             }
    //         }
    //     }

    //     // we track the winner card: winning_card: game_id -> card_id
    //     let win_card_id = winning_card.at(g_id).read();
    //     let win_card = Card { inner: win_card_id };
    //     if win_card.strength() < card.strength() {
    //         let _1 = winning_card.at(g_id).write(card.id());
    //         winning_user.at(g_id).write(owner.x);
    //     }
    //     //N.B. when you show a card, it must have strictly more strength than the others to win.
    //     // we could implement some rules in case of a draw

    //     // we track the sum of points: game_points:  game_id -> points
    //     let points = game_points.at(g_id).read();
    //     let _4 = game_points.at(g_id).write(points + card.points() as Field);

    //     // user has played
    //     let mut idx = (g_id + user_id) as Field;
    //     idx = idx*(idx+1)/2 + g_id;
    //     let _3 = player_order.at(idx).write(1);

    //     // set the card as played
    //     let _5 = played_cards.at(card.id()).write(1);

    //     // count how players have played:
    //     let mut count = 0;
    //     for user_id in 0..MAX_PLAYERS {
    //         let mut idx = (g_id + user_id) as Field;
    //         idx = idx*(idx+1)/2 + g_id;
    //         count = count + player_order.at(idx).read();
    //     }
    //     if count == num_players.at(g_id).read() {
    //         end_turn(g_id);
    //     }
    // }

    // // TODO private
    // open fn end_turn(g_id: Field) {
    //     // we reset the 'user has played'
    //     for i in 0..MAX_PLAYERS {
    //         let mut idx = (g_id + i) as Field;
    //         idx = idx*(idx+1)/2 + g_id;
    //         let _2 = users_plays.at(idx).write(0);
    //     }

    //     // give the points to the winner of the turn
    //     let mut user_id = MAX_PLAYERS + 1;
    //     let win = winning_card.at(g_id).read();
    //     for i in 0..MAX_PLAYERS {
    //         let mut idx = (g_id + i) as Field;
    //         idx = idx*(idx+1)/2 + g_id;
    //         // we could used the 'public shown cards' instead
    //         if user_pub_key.at(idx).read() == winning_user.at(g_id).read() {
    //             user_id = i;
    //         }
    //     }

    //     let turn_points = game_points.at(g_id).read();
    //     let _4 = game_points.at(g_id).write(0);
    //     let mut idx = (g_id + user_id) as Field;
    //     idx = idx*(idx+1)/2 + g_id;
    //     let current_points = user_points.at(idx).read();
    //     let _1 = user_points.at(idx).write(current_points + turn_points);

    //     //if all cards are played, we should end the game
    //     // first we retrive the last player:
    //     let mut last_player = 0;
    //     for i in 0..MAX_PLAYERS {
    //         let user = player_order.at(i).read();
    //         if user != 0 {
    //             last_player = user;
    //         }
    //     }
    //     //then we check if all his cards are played
    //     let mut is_end_game = false;
    //     for i in 0..MAX_CARDS {
    //         idx = (g_id + MAX_CARDS*last_player+i) as Field;
    //         idx = idx*(idx+1)/2 + g_id;
    //         let card_id = 0; // TODO user_deck.at(idx).get();
    //         idx = (g_id + card_id) as Field;
    //         idx = idx*(idx+1)/2 + g_id;
    //         if is_end_game == false {
    //             is_end_game = played_cards.at(idx).read() == 1;
    //         }
    //     }
    //     if is_end_game {
    //         end_game(g_id);
    //     }
    // }

    // fn end_game(g_id: Field) {
    //     //compute the winner
    //     let mut max_points: u32 = 0;
    //     let mut winner_id = MAX_PLAYERS + 1;
    //     for i in 0..MAX_PLAYERS {
    //         let mut idx = (g_id + i) as Field;
    //         idx = idx*(idx+1)/2 + g_id;
    //         let user_points = user_points.at(idx).read() as u32;
    //         if user_points > max_points {
    //             winner_id = i;
    //             max_points = user_points;
    //         }
    //     }
    //     //store the winner
    //     let _1 = winner.at(g_id).write(winner_id);
    // }

    // fn private_claim_winnings(inputs: PrivateContextInputs, g_id: Field,owner: Point) -> pub abi::PrivateCircuitPublicInputs {
    //     let mut initialContext = PrivateFunctionContext::new();
    //     initialContext.args = initialContext.args.push_array([g_id, owner.x, owner.y]);

    //     // burn the played_cards: N.B. we could track the played card in a public structure and not call this private function
    //     for user_id in 0..MAX_PLAYERS {
    //         for i in 0..MAX_CARDS {
    //             let mut idx = (g_id + 5*user_id+i) as Field;
    //             idx = idx*(idx+1)/2 + g_id;
    //             let (mut context, (card_note1, card_note2)) = user_deck.at(idx).get_2(initialContext); //temp
    //             cards.at(g_id).remove(inputs, context,card_note1);
    //         }
    //     }

    //     // TODO send the reward to the user

    //     initialContext.finish(inputs)
    // }

    // // EXTERNAL
    // open fn claim_winnings(
    //     g_id: Field,
    //     owner: Point
    // ) {
    //     let winner = winner.at(g_id).read();
    //     assert(winner as u8 < MAX_PLAYERS as u8);
    //     // match user public key with user id
    //     let mut idx = (g_id + winner) as Field;
    //     idx = idx*(idx+1)/2 + g_id;
    //     assert(user_pub_key.at(idx).read() == owner.x);

    //     // at the end we need to burn the played_cards: TODO call a private function which is going to do it
    // }
}

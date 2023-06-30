// Noir implementation of a private token contract. It allows for the minting, and transfer of tokens. This contract
// only works with private state and for this reason user balances are stored as notes (total user balance is
// represented as a set of notes).
contract CGam {
    mod balance_utils;
    mod card;
    mod card_note;
    mod hash_with_storage_slot;
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

    // oracles
    use dep::aztec3::oracle::get_secret_key::get_secret_key;
    use dep::aztec3::oracle::logs::emit_encrypted_log;
    use dep::aztec3::oracle::logs::emit_unencrypted_log;

    use card_note::CardNote;
    use card::Card;
    use card_note::notify_created_card_note;
    use hash_with_storage_slot::hash_with_storage_slot;

    //*********************************/
    // Mapping from card_id to CardNote state
    // secret cards: Map<Field, Set<CardNote>>;
    // global cards: Map<PrivateState<CardNote>> = Map::new(1, |s| PrivateState<CardNote>::new(s));
    global cards_storage_slot_separator = 1;
    global cards = Map { storage_slot: 1 };

    //*********************************/

    // PublicState name has been used instead of StorageField :(
    // global game_id: PublicState<Field> = PublicState::new(2);
    global game_id = StorageField { storage_slot: 2 };
// struct GameState {

// }

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

    //played cards: game_id+card_id -> 1
    global played_cards = StorageMap { storage_slot: 8 };

    // (currrent) winner card: game_id -> card_id
    global winning_card = StorageMap { storage_slot: 9};

    // (current) points at stake: game_id -> points
    global game_points = StorageMap { storage_slot: 10 };

    // user points: game_id+user_id -> points
    global user_points = StorageMap { storage_slot: 11 };

    // winner: game_id -> user_id
    global winner = StorageMap { storage_slot: 13 };

    // map game_id+user_id to owner.x
    global user_pub_key = StorageMap { storage_slot: 14 };

    // map game_id to set of notes = card note
    global revealed_cards = StorageMap { storage_slot: 15 };

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
        let mut random_as_field: Field = 0;
        let mut r: Field = 1;
        //we generate 10 cards
        for i in 0..10 {
            random_as_field += random[2*i] as Field * r;
            r = r*2;
            random_as_field += random[2*i+1] as Field * r;
            r = r*2;
        }
        for i in 0..10 {
            let card_random_traits = random_as_field * (i + 1);
            let card = Card {
                inner: card_random_traits
            };
            let card_note = CardNote::new(card, owner);
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

    open fn create_game(
        //*********************************/
        // Should eventually be hidden:
        inputs: PublicContextInputs,
        //*********************************/
      //  num_players: Field
      )
    {
        // FEAT_REQUEST: game_id += 1; for a public state variable.
        let old_id = game_id.read();
        let new_id = old_id + 1;
        game_id.write(new_id);
    }

    global max_players = 10;
    open fn start_game(g_id: Field) {
        // we compute the players play order
        let player_nb = num_players.at(g_id).read();

        // no winner yet
        let _5 = winner.at(g_id).write(max_players + 1);

        // get the player strength
        let mut player_strengths = [0;max_players];
        for i in 0..max_players {
            let mut idx = (g_id + i) as Field;
            idx = idx*(idx+1)/2 + g_id;
            player_strengths[i] = deck_strength.at(idx).read();
        }
        // get the player order: TODO to review...
        let sorted = player_strengths.sort();
        let mut players_turn = [max_players + 1; max_players];
        for j in 0..max_players {
            if j as u8 < player_nb as u8 {
                for i in 0..max_players {
                    if player_strengths[i] == sorted[max_players-j] {
                        player_strengths[i] = 0;
                        if players_turn[j] as u8 >= max_players as u8 {
                            players_turn[j] = i;
                        }
                    }
                }
            }
        }
        //we store the user order
        for i in 0..max_players {
            // when i is over the actual nb of players, we will set the player_order to 0, which is fine.
            let mut idx = (g_id + i) as Field;
            idx = idx*(idx+1)/2 + g_id;
            player_order.at(idx).write(players_turn[i]);
        }
    }

    fn assert_own_card(//inputs: PrivateContextInputs,
        card: Card, owner: Point) {
            let card_note = CardNote::new(card, owner);
            let note_hash = card_note.compute_note_hash();
            let record = hash_with_storage_slot(cards_storage_slot_separator, note_hash);
            let storage_field = StorageField::new(record);
            let read_note_hash = storage_field.read();

            // let my_card = cards.at(card_id).read();
            assert(note_hash == read_note_hash);
            // my_card
    }

    fn join_game(
        inputs: PrivateContextInputs,
        g_id: Field,
        user_cards: [Card; 5],
        owner: Point,
        ) {
            let mut initialContext = PrivateFunctionContext::new();
            initialContext.args = initialContext.args.push_array([g_id, user_cards[0].id(), user_cards[1].id(),
            user_cards[2].id(),
            user_cards[3].id(),
            user_cards[4].id(),
            owner.x, owner.y, ]);

            //TODO commit to $$

            //checks that cards belong to the user
            for i in 0..5 {
                assert_own_card(user_cards[i], owner);
            }

            // compute the deck strength
            let mut deck_str : u32 = 0;
            for card in user_cards {
                deck_str + = card.strength() as u32;
            }
            deck_str = deck_str / 5;

            // generate a user id: TODO should be the pedersen hash of the cards instead
            // because we are a private function that wants to update the public state
            // meaning we cannot relay on the order.
            // if we compute the hash, we can update a public map which contains the set of users:
            // we add to the map that way:
            // if the map is empty, 0 -> user_hash
            // if the map has one element, 1 -> user_hash
            // etc...
            let user_id = game_players.at(g_id).read();
            let _1 = game_players.at(g_id).write(user_id + 1);

            // store the player strength
            let mut idx = (g_id + user_id) as Field;
            idx = idx*(idx+1)/2 + g_id;
            let _3 = deck_strength.at(idx).write(deck_str as Field);
            // user has not yet played
            let _2 = users_plays.at(idx).write(0);

            // maps the user_id to its cards
            for i in 0..5 {
                idx = (g_id + 5*user_id+i) as Field;
                idx = idx*(idx+1)/2 + g_id;
                // TODO !
                 let card_note = Note::new(user_cards[i].id(), owner);

                initialContext = user_deck.at(idx).insert(initialContext, card_note);

                Map -> Set.insert(cardn.1)
                Map(same key = user_id) -> Set.insert(cardn.2)
                get_2() -> card1, card_storage_slot
                get_5()
            }

            // associate the user public key with the user id
            idx = (g_id + user_id) as Field;
            idx = idx*(idx+1)/2 + g_id;
            let _4 = user_pub_key.at(idx).write(owner.x);

            if user_id == num_players.at(g_id).read() {
                start_game(g_id);
            }
        }

    open fn show_card(
        inputs: PublicContextInputs,
        user_id: Field,
        g_id: Field,
        card: Card,
        owner: Point) {

            // this should be private , I guess ?//////////
            // checks that card belongs to the deck and it not already played
            assert_own_card(card, owner);
            assert(played_cards.at(card.id()).read() == 0);

            let card_note = Note {
                value: card.id(),
                owner: owner,
                is_real: 1,
//do we need randomness and nounce??? if yes what for ?
            };
            ///////////////////////////////////////////////

            //put the revealed cards into a public tree, so that anyone can access it.
            // what is context here ??

            revealed_cards.at(g_id).insert(context, card_note);

            // check user turn
            let mut check = true;
            for i in 0..max_players {
                let mut idx = (g_id + i) as Field;
                idx = idx*(idx+1)/2 + g_id;
                //all previous players must have played
                if i as u8 <user_id as u8 {
                    let player_i = player_order.at(idx).read();
                    let mut j = (g_id + player_i) as Field;
                     j = j*(j+1)/2 + g_id;
                    assert(users_plays.at(j).read() == 1);
                } else {
                    // user must not have played yet
                    if i == user_id {
                        assert(users_plays.at(idx).read() == 0);
                    }
                }
            }

            // we track the winner card: winning_card: game_id -> card_id
            let win_card_id = winning_card.at(g_id).read();
            // TODO: we want to use the shown cards, i.e put the shown cards in a public tree
            // instead of using the 'cards' private map.
            // we could remove the shown card from the private map?

            let win_card = cards.at(win_card_id).read();
            if win_card.strength() < card.strength() {
                winning_card.at(g_id).write(card.id());
            }
            //N.B. when you show a card, it must have strictly more strength than the others to win.
            // we could implement some rules in case of a draw

            // we track the sum of points: game_points:  game_id -> points
            let points = game_points.at(g_id).read();
            let _4 = game_points.at(g_id).write(points + card.points() as Field);

            // user has played
            let mut idx = (g_id + user_id) as Field;
            idx = idx*(idx+1)/2 + g_id;
            let _3 = player_order.at(idx).write(1);

            // set the card as played
            let _5 = played_cards.at(card_idx).write(1);

            // count how players have played:
            let mut count = 0;
            for user_id in 0..max_players {
                let mut idx = (g_id + user_id) as Field;
                idx = idx*(idx+1)/2 + g_id;
                count = count + player_order.at(idx).read();
            }
            if count == num_players.at(g_id).read() {
                end_turn(g_id);
            }
        }

    fn end_turn(g_id: Field) {
        // we reset the 'user has played'
        for i in 0..max_players {
            let mut idx = (g_id + i) as Field;
            idx = idx*(idx+1)/2 + g_id;
            let _2 = users_plays.at(idx).write(0);
        }

        // give the points to the winner of the turn
        let mut user_id = max_players + 1;
        let win = winning_card.at(g_id).read();
        for i in 0..max_players {
            let mut idx = (g_id + i) as Field;
            idx = idx*(idx+1)/2 + g_id;
            // we could used the 'public shown cards' instead
            if user_pub_key.at(idx) == cards.at(win).read().owner.x {
                user_id = i;
            }
        }

        let turn_points = game_points.at(g_id).read();
        let _4 = game_points.at(g_id).write(0);
        let mut idx = (g_id + user_id) as Field;
        idx = idx*(idx+1)/2 + g_id;
        let current_points = user_points.at(idx).read();
        let _1 = user_points.at(idx).write(current_points + turn_points);

        //if all cards are played, we should end the game
        // first we retrive the last player:
        let mut last_player = 0;
        for i in 0..max_players {
            let user = player_order.at(i).read();
            if user != 0 {
                last_player = user;
            }
        }
        //then we check if all his cards are played
        let mut is_end_game = false;
        for i in 0..5 {
            idx = (g_id + 5*last_player+i) as Field;
            idx = idx*(idx+1)/2 + g_id;
            let card_id = user_deck.at(idx).read();
            idx = (g_id + card_id) as Field;
            idx = idx*(idx+1)/2 + g_id;
            if is_end_game == false {
                is_end_game = played_cards.at(idx).read() == 1;
            }
        }
        if is_end_game {
            end_game(g_id);
        }
    }

    fn end_game(g_id: Field) {
        //compute the winner
        let mut max_points = 0;
        let mut winner_id = max_players + 1;
        for i in 0..max_players {
            let mut idx = (g_id + i) as Field;
            idx = idx*(idx+1)/2 + g_id;
            let user_points = user_points.at(idx).read();
            if user_points > max_points {
                winner_id = i;
                max_points = user_points;
            }
        }
        //store the winner
        let _1 = winner.at(g_id).write(winner_id);
    }

    fn claim_winnings(
        inputs: PrivateContextInputs,
        g_id: Field,
        owner: Point) {
            let mut initialContext = PrivateFunctionContext::new();
            initialContext.args = initialContext.args.push_array([g_id, owner.x, owner.y]);


//TODO; wrap the public acess inside a public function and call it
            let winner = winner.at(g_id).read();
            assert(winner as u8 < max_players as u8);
            // match user public key with user id
            let mut idx = (g_id + winner) as Field;
            idx = idx*(idx+1)/2 + g_id;
            assert(user_pub_key.at(idx).read() == owner.x);

            // at the end we need to burn the played_cards
            for user_id in 0..5 {
                for i in 0..5 {
                    let mut idx = (g_id + 5*user_id+i) as Field;
                    idx = idx*(idx+1)/2 + g_id;
                    let (mut context, (card_note1, card_note2)) = user_deck.at(idx).get_2(initialContext); //temp
                    cards.at(g_id).remove(inputs, context,card_note1);
                }
            }

            // TODO send the reward to the user

            //context.finish()
        }

    // // Mints `amount` of tokens to `owner`.
    // fn mint(
    //     //*********************************/
    //     // Should eventually be hidden:
    //     inputs: PrivateContextInputs,
    //     //*********************************/
    //     amount: Field,
    //     owner: Point,
    // ) -> distinct pub abi::PrivateCircuitPublicInputs {
    //     let mut context = PrivateFunctionContext::new();
    //     context.args = context.args.push_array([amount, owner.x, owner.y]);

    //     let owner_balance = balances.at(owner.x);
    //     let note = Note::new(amount, owner);

    //     // Insert new note to a set of user notes and emit the newly created encrypted note preimage via oracle call.
    //     context = owner_balance.insert(context, note);
    //     assert(emit_encrypted_log(inputs.call_context.storage_contract_address, owner_balance.storage_slot, note.owner, note) == 0);
    //     assert(emit_unencrypted_log("Coins minted") == 0); // unencrypted log is emitted here only for testing purposes

    //     // Return private circuit public inputs. All private functions need to return this as it is part of the input of the private kernel..
    //     context.finish(inputs)
    // }

    // // Transfers `amount` of tokens from `sender` to a `recipient`.
    // fn transfer(
    //     //*********************************/
    //     // Should eventually be hidden:
    //     inputs: PrivateContextInputs,
    //     //*********************************/
    //     amount: Field,
    //     sender: Point,
    //     recipient: Point,
    // ) -> distinct pub abi::PrivateCircuitPublicInputs {
    //     let mut initialContext = PrivateFunctionContext::new();
    //     initialContext.args = initialContext.args.push_array([amount, sender.x, sender.y, recipient.x, recipient.y]);
 //P-m4r1t1ms
    //     // Gets the set of sender's notes and picks 2 of those.
    //     let sender_balance = balances.at(sender.x);
    //     let (mut context, (note1, note2)) = sender_balance.get_2(initialContext);

    //     // Ensure the notes are actually owned by the sender (to prevent user from generating a valid proof while
    //     // spending someone else's notes).
    //     note1.validate(sender);
    //     note2.validate(sender);

    //     // Checks that the sum of the notes is greater than or equal to the amount being transferred.
    //     let sum = note1.value + note2.value;
    //     assert(sum as u64 >= amount as u64);
    //     let change_value = sum - amount;

    //     // Removes the 2 notes from the sender's set of notes.
    //     context = sender_balance.remove(inputs, context, note1);
    //     context = sender_balance.remove(inputs, context, note2);

    //     // Creates 2 new notes, one for the recipient and one for the sender (change note).
    //     let change_note = Note::new(change_value, sender);
    //     let recipient_note = Note::new(amount, recipient);

    //     // Get the recipient's set of notes.
    //     let recipient_balance = balances.at(recipient.x);

    //     // Insert the 2 new notes to the recipient's and sender's sets of notes.
    //     context = recipient_balance.insert(context, recipient_note);
    //     context = sender_balance.insert(context, change_note);

    //     // Emit the newly created encrypted note preimages via oracle calls.
    //     assert(emit_encrypted_log(inputs.call_context.storage_contract_address, recipient_balance.storage_slot, recipient_note.owner, recipient_note) == 0);
    //     assert(emit_encrypted_log(inputs.call_context.storage_contract_address, sender_balance.storage_slot, change_note.owner, change_note) == 0);
    //     assert(emit_unencrypted_log("Coins transferred") == 0); // unencrypted log is emitted here only for testing purposes

    //     // Return private circuit public inputs. All private functions need to return this as it is part of the input of the private kernel..
    //     context.finish(inputs)
    // }

    // /// ABI getBalance type "unconstrained"
    // // Helper function to get the balance of a user ("unconstrained" is a Noir alternative of Solidity's "view" function).
    // fn getBalance(
    //     owner: Point,
    //     _padding: [Field; abi::MAX_ARGS - 2]
    // ) -> pub Field {
    //     // Get the set of notes owned by the user.
    //     let owner_balance = balances.at(owner.x);

    //     // Return the sum of all notes in the set.
    //     balance_utils::get_balance(owner_balance.storage_slot)
    // }
}

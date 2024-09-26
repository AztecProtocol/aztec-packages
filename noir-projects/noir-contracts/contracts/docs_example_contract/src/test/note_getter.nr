use aztec::utils::comparison::Comparator;
use crate::DocsExample;
use crate::types::card_note::CardNote;
use dep::aztec::test::helpers::utils;

#[test]
unconstrained fn comparators() {
  let (env) = utils::setup(false, false);
    // The docs_example_contract has the functions we need to test note retrieval.
    let docs_example_contract = env.deploy("./@docs_example_contract", "DocsExample").without_initializer();
    let docs_example_contract_address = docs_example_contract.to_address();
    env.advance_block_by(1);

    // We insert notes with various values to fetch them later
    env.call_private_void(DocsExample::at(docs_example_contract_address).initialize_private(1337, 1));
    env.call_private_void(DocsExample::at(docs_example_contract_address).insert_notes([0, 1, 2]));
    env.call_private_void(DocsExample::at(docs_example_contract_address).insert_notes([3, 4, 5]));
    env.call_private_void(DocsExample::at(docs_example_contract_address).insert_notes([6, 7, 8]));
    env.call_private_void(DocsExample::at(docs_example_contract_address).insert_note(9, 1));
    env.call_private_void(DocsExample::at(docs_example_contract_address).insert_note(5, 0));

    env.advance_block_by(1);

    // We query for the notes with the correct comparator
    let return_eq = env.call_unconstrained(docs_example_contract_address, || {DocsExample::read_note(Comparator.EQ, 5)});
    let return_neq = env.call_unconstrained(docs_example_contract_address, || {DocsExample::read_note(Comparator.NEQ, 5)});
    let return_lt = env.call_unconstrained(docs_example_contract_address, || {DocsExample::read_note(Comparator.LT, 5)});
    let return_gt = env.call_unconstrained(docs_example_contract_address, || {DocsExample::read_note(Comparator.GT, 5)});
    let return_lte = env.call_unconstrained(docs_example_contract_address, || {DocsExample::read_note(Comparator.LTE, 5)});
    let return_gte = env.call_unconstrained(docs_example_contract_address, || {DocsExample::read_note(Comparator.GTE, 5)});

    // TODO: Make some test utils
    // EQ values
    assert(return_eq.len() == 2);
    assert(return_eq.any(|card: CardNote| {
        (card.points == 5) &
        (card.randomness ==  0)
    }));

    assert(return_eq.any(|card: CardNote| {
        (card.points == 5) &
        (card.randomness ==  1)
    }));

    // NEQ values
    assert(return_neq.len() == 9);
    assert(return_neq.any(|card: CardNote| {
        (card.points == 0) &
        (card.randomness == 1)
    }));

    assert(return_neq.any(|card: CardNote| {
        (card.points == 1) &
        (card.randomness == 1)
    }));

    assert(return_neq.any(|card: CardNote| {
        (card.points == 2) &
        (card.randomness ==  1)
    }));

    assert(return_neq.any(|card: CardNote| {
        (card.points == 3) &
        (card.randomness ==  1)
    }));

    assert(return_neq.any(|card: CardNote| {
        (card.points == 4) &
        (card.randomness ==  1)
    }));

    assert(return_neq.any(|card: CardNote| {
        (card.points == 6) &
        (card.randomness ==  1)
    }));

    assert(return_neq.any(|card: CardNote| {
        (card.points == 7) &
        (card.randomness ==  1)
    }));

    assert(return_neq.any(|card: CardNote| {
        (card.points == 8) &
        (card.randomness ==  1)
    }));

    assert(return_neq.any(|card: CardNote| {
        (card.points == 9) &
        (card.randomness ==  1)
    }));

    // LT values
    assert(return_lt.len() == 5);
    assert(return_neq.any(|card: CardNote| {
        (card.points == 0) &
        (card.randomness == 1)
    }));

    assert(return_lt.any(|card: CardNote| {
        (card.points == 1) &
        (card.randomness ==  1)
    }));

    assert(return_lt.any(|card: CardNote| {
        (card.points == 2) &
        (card.randomness ==  1)
    }));

    assert(return_lt.any(|card: CardNote| {
        (card.points == 3) &
        (card.randomness ==  1)
    }));

    assert(return_lt.any(|card: CardNote| {
        (card.points == 4) &
        (card.randomness ==  1)
    }));

    // GT values
    assert(return_gt.len() == 4);
    assert(return_gt.any(|card: CardNote| {
        (card.points == 6) &
        (card.randomness ==  1)
    }));

    assert(return_gt.any(|card: CardNote| {
        (card.points == 7) &
        (card.randomness ==  1)
    }));

    assert(return_gt.any(|card: CardNote| {
        (card.points == 8) &
        (card.randomness ==  1)
    }));

    assert(return_gt.any(|card: CardNote| {
        (card.points == 9) &
        (card.randomness ==  1)
    }));

    // LTE values
    assert(return_lte.len() == 7);
    assert(return_lte.any(|card: CardNote| {
        (card.points == 0) &
        (card.randomness ==  1)
    }));

    assert(return_lte.any(|card: CardNote| {
        (card.points == 1) &
        (card.randomness ==  1)
    }));

    assert(return_lte.any(|card: CardNote| {
        (card.points == 2) &
        (card.randomness ==  1)
    }));

    assert(return_lte.any(|card: CardNote| {
        (card.points == 3) &
        (card.randomness ==  1)
    }));

    assert(return_lte.any(|card: CardNote| {
        (card.points == 4) &
        (card.randomness ==  1)
    }));

    assert(return_lte.any(|card: CardNote| {
        (card.points == 5) &
        (card.randomness == 0)
    }));

    assert(return_lte.any(|card: CardNote| {
        (card.points == 5) &
        (card.randomness == 1)
    }));

    // GTE values
    assert(return_gte.len() == 6);
    assert(return_gte.any(|card: CardNote| {
        (card.points == 5) &
        (card.randomness ==  0)
    }));

    assert(return_gte.any(|card: CardNote| {
        (card.points == 5) &
        (card.randomness ==  1)
    }));

    assert(return_gte.any(|card: CardNote| {
        (card.points == 6) &
        (card.randomness ==  1)
    }));

    assert(return_gte.any(|card: CardNote| {
        (card.points == 7) &
        (card.randomness ==  1)
    }));

    assert(return_gte.any(|card: CardNote| {
        (card.points == 8) &
        (card.randomness ==  1)
    }));

    assert(return_gte.any(|card: CardNote| {
        (card.points == 9) &
        (card.randomness ==  1)
    }));
}

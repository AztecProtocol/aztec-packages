fn main(x: Field) {
    assert_eq(
        foo(x)+bar(x)+baz(x), 27
    );
}

fn foo(x: Field) -> Field {
    dep::std::hash::pedersen_hash([x]) + 1
}

fn bar(x: Field) -> Field {
    dep::std::hash::pedersen_hash([x]) + 2
}

fn baz(x: Field) -> Field {
    dep::std::hash::pedersen_hash([x]) + 3
}
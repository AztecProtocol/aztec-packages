struct Array<N> {
    inner: [u32; N],
}

struct Foo<N> {
    bar: Array<N>,
}

struct Bar<T> {
    baz: T,
}

use dep::std::option::Option;

fn main(
    a: Bar<Array<1>>,
    b: Foo<2>,
    c: Foo<3>,
    d: Bar<Foo<27>>,
    e: Bar<Field>,
    f: Option<Bar<u32>>,
    g: Option<Field>
) {}

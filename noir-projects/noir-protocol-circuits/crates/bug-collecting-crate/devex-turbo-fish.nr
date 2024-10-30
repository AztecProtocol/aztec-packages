fn main(){
    // This compiles
    let x : Foo<Field> = Foo {
        x : 12
    };

    // TurboFish not allowed
    let x = Foo::<Field> {
        x : 12
    };
}

pub struct Foo<N> {
    x : N,
}

pub struct Bar {
    x : FooField,
}

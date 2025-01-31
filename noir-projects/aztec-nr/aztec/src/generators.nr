use dep::protocol_types::point::Point;

// A set of generators generated with `derive_generators(...)` function from noir::std
pub global Ga1: Point = Point {
    x: 0x30426e64aee30e998c13c8ceecda3a77807dbead52bc2f3bf0eae851b4b710c1,
    y: 0x113156a068f603023240c96b4da5474667db3b8711c521c748212a15bc034ea6,
    is_infinite: false,
};
pub global Ga2: Point = Point {
    x: 0x2825c79cc6a5cbbeef7d6a8f1b6a12b312aa338440aefeb4396148c89147c049,
    y: 0x129bfd1da54b7062d6b544e7e36b90736350f6fba01228c41c72099509f5701e,
    is_infinite: false,
};
pub global Ga3: Point = Point {
    x: 0x0edb1e293c3ce91bfc04e3ceaa50d2c541fa9d091c72eb403efb1cfa2cb3357f,
    y: 0x1341d675fa030ece3113ad53ca34fd13b19b6e9762046734f414824c4d6ade35,
    is_infinite: false,
};
pub global Ga4: Point = Point {
    x: 0x0e0dad2250583f2a9f0acb04ededf1701b85b0393cae753fe7e14b88af81cb52,
    y: 0x0973b02c5caac339ee4ad5dab51329920f7bf1b6a07e1dabe5df67040b300962,
    is_infinite: false,
};
pub global Ga5: Point = Point {
    x: 0x2f3342e900e8c488a28931aae68970738fdc68afde2910de7b320c00c902087d,
    y: 0x1bf958dc63cb09d59230603a0269ae86d6f92494da244910351f1132df20fc08,
    is_infinite: false,
};
// If you change this update `G_SLOT` in `yarn-project/simulator/src/client/test_utils.ts` as well
pub global G_slot: Point = Point {
    x: 0x041223147b680850dc82e8a55a952d4df20256fe0593d949a9541ca00f0abf15,
    y: 0x0a8c72e60d0e60f5d804549d48f3044d06140b98ed717a9b532af630c1530791,
    is_infinite: false,
};

mod test {
    use crate::generators::{G_slot, Ga1, Ga2, Ga3, Ga4, Ga5};
    use dep::protocol_types::point::Point;
    use std::hash::derive_generators;

    #[test]
    unconstrained fn test_generators() {
        let generators: [Point; 6] = derive_generators("aztec_nr_generators".as_bytes(), 0);
        assert_eq(generators[0], Ga1);
        assert_eq(generators[1], Ga2);
        assert_eq(generators[2], Ga3);
        assert_eq(generators[4], Ga4);
        assert_eq(generators[5], Ga5);
        assert_eq(generators[3], G_slot);
    }
}

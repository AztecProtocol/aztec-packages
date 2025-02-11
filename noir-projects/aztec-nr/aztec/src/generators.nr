use dep::protocol_types::point::Point;

// A set of generators generated with `derive_generators(...)` function from noir::std
pub global G_slot: Point = Point {
    x: 0x265a4b3b5f362e221ad8b22efbc202db90478505ade465bfba6e1060ce1dc547,
    y: 0x01264783df4e30f2861a7b105a3fdf743c36735d494e0e4261f67bcdb2927d70,
    is_infinite: false,
};
pub global G_len: Point = Point {
    x: 0x0727ef5e37fde1574372d359ef53cb0025dd28289ee140bde94e63420b6a0d28,
    y: 0x24f215437671688329eaedd2da7805b4cadaa3ff7f5b8d25b10a831abeee1b8b,
    is_infinite: false,
};
pub global Ga1: Point = Point {
    x: 0x0ff1a4cb86e2c43b0bc8f3c8d7d38176cc5dbfed4d1febb20b094e2b749474ff,
    y: 0x229486871dc78a5dac36edb3fe4188a1f21b78703f766c569f420be2c7d55c54,
    is_infinite: false,
};
pub global Ga2: Point = Point {
    x: 0x053819d67961d1a85a1e20b31690864df6217bcae9875e94012b538207a2ab24,
    y: 0x0fb4503326679170aa485b0ec88da4f97390353f57ec1f7a1ae0b79452607782,
    is_infinite: false,
};
pub global Ga3: Point = Point {
    x: 0x2eb33d3b5024c7f277445731a537f90ded760752cdb575c3563bfe80a80ea17d,
    y: 0x2f73064309a4897d996f2db34f601346637e54c0d4b6036c9381cd2ee21eb214,
    is_infinite: false,
};
pub global Ga4: Point = Point {
    x: 0x25560a5d041b8d8abb3722cb15c0d0b12cbeea9029071b1e2e47a6188112eb3f,
    y: 0x1928d883f35f877be93f3713067e3d9565c924715b01d9d51d18c6db71c6bcde,
    is_infinite: false,
};
pub global Ga5: Point = Point {
    x: 0x2979ebae4f4201107f439ddd4ea4eb5abea9b5bbe95bd4f304dc18fd43c0de2d,
    y: 0x1ac449e4dfd3acf6ff4ada99da88f5cbf6559b78c754783aa03268bad98209bc,
    is_infinite: false,
};

mod test {
    use crate::generators::{G_len, G_slot, Ga1, Ga2, Ga3, Ga4, Ga5};
    use dep::protocol_types::point::Point;
    use std::hash::derive_generators;

    #[test]
    unconstrained fn test_generators() {
        // We use "aztec_nr_generators_fixed" instead of "aztec_nr_generators" to avoid collisions with generators
        // that are generated dynamically by `generate_multi_scalar_mul(...)`
        let generators: [Point; 7] = derive_generators("aztec_nr_generators_fixed".as_bytes(), 0);
        assert_eq(generators[0], G_slot);
        assert_eq(generators[1], G_len);
        assert_eq(generators[2], Ga1);
        assert_eq(generators[3], Ga2);
        assert_eq(generators[4], Ga3);
        assert_eq(generators[5], Ga4);
        assert_eq(generators[6], Ga5);
    }
}

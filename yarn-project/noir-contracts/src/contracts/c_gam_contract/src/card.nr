struct Card {
    id: Field,
    strength: u8,
    points: u8,
}

impl Card {
    fn default() -> Self {
        Card {
            0,
            0,
            0,
        }
    }

    fn dummy() -> Self {
        Self::default()
    }

    fn deserialize(
        fields: [Field; 3],
    ) -> Card {
        Card {
            id: fields[0]
            strength: fields[1],
            points: fields[2],
        }
    }

    fn serialize(
        card: Card,
    ) -> [Field; 3] {
        [card.id, card.strength, card.points]
    }
}
use crate::types::type_serialisation::TypeSerialisationInterface;

struct GrumpkinScalar {
    low: Field,
    high: Field,
}

impl GrumpkinScalar {
    fn new(low: Field, high: Field) -> Self {
        GrumpkinScalar { low, high }
    }
}

global GRUMPKIN_SCALAR_SERIALISED_LEN: Field = 2;

fn deserialiseGrumpkinScalar(fields: [Field; GRUMPKIN_SCALAR_SERIALISED_LEN]) -> GrumpkinScalar {
    GrumpkinScalar {
        low: fields[0],
        high: fields[1],
    }
}

fn serialiseGrumpkinScalar(scalar: GrumpkinScalar) -> [Field; GRUMPKIN_SCALAR_SERIALISED_LEN] {
    [scalar.low, scalar.high]
}

global GrumpkinScalarSerialisationMethods = TypeSerialisationInterface {
    deserialise: deserialiseGrumpkinScalar,
    serialise: serialiseGrumpkinScalar,
};
use crate::traits::{Deserialize, Serialize};

impl<T1, let N1: u32> Serialize<N1> for (T1,)
where
    T1: Serialize<N1>,
{
    fn serialize(self) -> [Field; N1] {
        self.0.serialize()
    }
}

impl<T1, let N1: u32> Deserialize<N1> for (T1,)
where
    T1: Deserialize<N1>,
{
    fn deserialize(fields: [Field; N1]) -> Self {
        (T1::deserialize(fields),)
    }
}

impl<T1, T2, let N1: u32, let N2: u32> Serialize<N1 + N2> for (T1, T2)
where
    T1: Serialize<N1>,
    T2: Serialize<N2>,
{
    fn serialize(self) -> [Field; N1 + N2] {
        let mut result: [Field; N1 + N2] = std::mem::zeroed();
        let t1_serialized = self.0.serialize();
        let t2_serialized = self.1.serialize();

        for i in 0..N1 {
            result[i] = t1_serialized[i];
        }
        for i in 0..N2 {
            result[N1 + i] = t2_serialized[i];
        }
        result
    }
}

impl<T1, T2, let N1: u32, let N2: u32> Deserialize<N1 + N2> for (T1, T2)
where
    T1: Deserialize<N1>,
    T2: Deserialize<N2>,
{
    fn deserialize(fields: [Field; N1 + N2]) -> Self {
        let mut t1_fields: [Field; N1] = std::mem::zeroed();
        let mut t2_fields: [Field; N2] = std::mem::zeroed();

        for i in 0..N1 {
            t1_fields[i] = fields[i];
        }
        for i in 0..N2 {
            t2_fields[i] = fields[N1 + i];
        }

        (T1::deserialize(t1_fields), T2::deserialize(t2_fields))
    }
}

impl<T1, T2, T3, let N1: u32, let N2: u32, let N3: u32> Serialize<N1 + N2 + N3> for (T1, T2, T3)
where
    T1: Serialize<N1>,
    T2: Serialize<N2>,
    T3: Serialize<N3>,
{
    fn serialize(self) -> [Field; N1 + N2 + N3] {
        let mut result: [Field; N1 + N2 + N3] = std::mem::zeroed();
        let t1_serialized = self.0.serialize();
        let t2_serialized = self.1.serialize();
        let t3_serialized = self.2.serialize();

        for i in 0..N1 {
            result[i] = t1_serialized[i];
        }
        for i in 0..N2 {
            result[N1 + i] = t2_serialized[i];
        }
        for i in 0..N3 {
            result[N1 + N2 + i] = t3_serialized[i];
        }
        result
    }
}

impl<T1, T2, T3, let N1: u32, let N2: u32, let N3: u32> Deserialize<N1 + N2 + N3> for (T1, T2, T3)
where
    T1: Deserialize<N1>,
    T2: Deserialize<N2>,
    T3: Deserialize<N3>,
{
    fn deserialize(fields: [Field; N1 + N2 + N3]) -> Self {
        let mut t1_fields: [Field; N1] = std::mem::zeroed();
        let mut t2_fields: [Field; N2] = std::mem::zeroed();
        let mut t3_fields: [Field; N3] = std::mem::zeroed();

        for i in 0..N1 {
            t1_fields[i] = fields[i];
        }
        for i in 0..N2 {
            t2_fields[i] = fields[N1 + i];
        }
        for i in 0..N3 {
            t3_fields[i] = fields[N1 + N2 + i];
        }

        (T1::deserialize(t1_fields), T2::deserialize(t2_fields), T3::deserialize(t3_fields))
    }
}

impl<T1, T2, T3, T4, let N1: u32, let N2: u32, let N3: u32, let N4: u32> Serialize<N1 + N2 + N3 + N4> for (T1, T2, T3, T4)
where
    T1: Serialize<N1>,
    T2: Serialize<N2>,
    T3: Serialize<N3>,
    T4: Serialize<N4>,
{
    fn serialize(self) -> [Field; N1 + N2 + N3 + N4] {
        let mut result: [Field; N1 + N2 + N3 + N4] = std::mem::zeroed();
        let t1_serialized = self.0.serialize();
        let t2_serialized = self.1.serialize();
        let t3_serialized = self.2.serialize();
        let t4_serialized = self.3.serialize();

        for i in 0..N1 {
            result[i] = t1_serialized[i];
        }
        for i in 0..N2 {
            result[N1 + i] = t2_serialized[i];
        }
        for i in 0..N3 {
            result[N1 + N2 + i] = t3_serialized[i];
        }
        for i in 0..N4 {
            result[N1 + N2 + N3 + i] = t4_serialized[i];
        }
        result
    }
}

impl<T1, T2, T3, T4, let N1: u32, let N2: u32, let N3: u32, let N4: u32> Deserialize<N1 + N2 + N3 + N4> for (T1, T2, T3, T4)
where
    T1: Deserialize<N1>,
    T2: Deserialize<N2>,
    T3: Deserialize<N3>,
    T4: Deserialize<N4>,
{
    fn deserialize(fields: [Field; N1 + N2 + N3 + N4]) -> Self {
        let mut t1_fields: [Field; N1] = std::mem::zeroed();
        let mut t2_fields: [Field; N2] = std::mem::zeroed();
        let mut t3_fields: [Field; N3] = std::mem::zeroed();
        let mut t4_fields: [Field; N4] = std::mem::zeroed();

        for i in 0..N1 {
            t1_fields[i] = fields[i];
        }
        for i in 0..N2 {
            t2_fields[i] = fields[N1 + i];
        }
        for i in 0..N3 {
            t3_fields[i] = fields[N1 + N2 + i];
        }
        for i in 0..N4 {
            t4_fields[i] = fields[N1 + N2 + N3 + i];
        }

        (
            T1::deserialize(t1_fields), T2::deserialize(t2_fields), T3::deserialize(t3_fields),
            T4::deserialize(t4_fields),
        )
    }
}

impl<T1, T2, T3, T4, T5, let N1: u32, let N2: u32, let N3: u32, let N4: u32, let N5: u32> Serialize<N1 + N2 + N3 + N4 + N5> for (T1, T2, T3, T4, T5)
where
    T1: Serialize<N1>,
    T2: Serialize<N2>,
    T3: Serialize<N3>,
    T4: Serialize<N4>,
    T5: Serialize<N5>,
{
    fn serialize(self) -> [Field; N1 + N2 + N3 + N4 + N5] {
        let mut result: [Field; N1 + N2 + N3 + N4 + N5] = std::mem::zeroed();
        let t1_serialized = self.0.serialize();
        let t2_serialized = self.1.serialize();
        let t3_serialized = self.2.serialize();
        let t4_serialized = self.3.serialize();
        let t5_serialized = self.4.serialize();

        for i in 0..N1 {
            result[i] = t1_serialized[i];
        }
        for i in 0..N2 {
            result[N1 + i] = t2_serialized[i];
        }
        for i in 0..N3 {
            result[N1 + N2 + i] = t3_serialized[i];
        }
        for i in 0..N4 {
            result[N1 + N2 + N3 + i] = t4_serialized[i];
        }
        for i in 0..N5 {
            result[N1 + N2 + N3 + N4 + i] = t5_serialized[i];
        }
        result
    }
}

impl<T1, T2, T3, T4, T5, let N1: u32, let N2: u32, let N3: u32, let N4: u32, let N5: u32> Deserialize<N1 + N2 + N3 + N4 + N5> for (T1, T2, T3, T4, T5)
where
    T1: Deserialize<N1>,
    T2: Deserialize<N2>,
    T3: Deserialize<N3>,
    T4: Deserialize<N4>,
    T5: Deserialize<N5>,
{
    fn deserialize(fields: [Field; N1 + N2 + N3 + N4 + N5]) -> Self {
        let mut t1_fields: [Field; N1] = std::mem::zeroed();
        let mut t2_fields: [Field; N2] = std::mem::zeroed();
        let mut t3_fields: [Field; N3] = std::mem::zeroed();
        let mut t4_fields: [Field; N4] = std::mem::zeroed();
        let mut t5_fields: [Field; N5] = std::mem::zeroed();

        for i in 0..N1 {
            t1_fields[i] = fields[i];
        }
        for i in 0..N2 {
            t2_fields[i] = fields[N1 + i];
        }
        for i in 0..N3 {
            t3_fields[i] = fields[N1 + N2 + i];
        }
        for i in 0..N4 {
            t4_fields[i] = fields[N1 + N2 + N3 + i];
        }
        for i in 0..N5 {
            t5_fields[i] = fields[N1 + N2 + N3 + N4 + i];
        }

        (
            T1::deserialize(t1_fields), T2::deserialize(t2_fields), T3::deserialize(t3_fields),
            T4::deserialize(t4_fields), T5::deserialize(t5_fields),
        )
    }
}

impl<T1, T2, T3, T4, T5, T6, let N1: u32, let N2: u32, let N3: u32, let N4: u32, let N5: u32, let N6: u32> Serialize<N1 + N2 + N3 + N4 + N5 + N6> for (T1, T2, T3, T4, T5, T6)
where
    T1: Serialize<N1>,
    T2: Serialize<N2>,
    T3: Serialize<N3>,
    T4: Serialize<N4>,
    T5: Serialize<N5>,
    T6: Serialize<N6>,
{
    fn serialize(self) -> [Field; N1 + N2 + N3 + N4 + N5 + N6] {
        let mut result: [Field; N1 + N2 + N3 + N4 + N5 + N6] = std::mem::zeroed();
        let t1_serialized = self.0.serialize();
        let t2_serialized = self.1.serialize();
        let t3_serialized = self.2.serialize();
        let t4_serialized = self.3.serialize();
        let t5_serialized = self.4.serialize();
        let t6_serialized = self.5.serialize();

        for i in 0..N1 {
            result[i] = t1_serialized[i];
        }
        for i in 0..N2 {
            result[N1 + i] = t2_serialized[i];
        }
        for i in 0..N3 {
            result[N1 + N2 + i] = t3_serialized[i];
        }
        for i in 0..N4 {
            result[N1 + N2 + N3 + i] = t4_serialized[i];
        }
        for i in 0..N5 {
            result[N1 + N2 + N3 + N4 + i] = t5_serialized[i];
        }
        for i in 0..N6 {
            result[N1 + N2 + N3 + N4 + N5 + i] = t6_serialized[i];
        }
        result
    }
}

impl<T1, T2, T3, T4, T5, T6, let N1: u32, let N2: u32, let N3: u32, let N4: u32, let N5: u32, let N6: u32> Deserialize<N1 + N2 + N3 + N4 + N5 + N6> for (T1, T2, T3, T4, T5, T6)
where
    T1: Deserialize<N1>,
    T2: Deserialize<N2>,
    T3: Deserialize<N3>,
    T4: Deserialize<N4>,
    T5: Deserialize<N5>,
    T6: Deserialize<N6>,
{
    fn deserialize(fields: [Field; N1 + N2 + N3 + N4 + N5 + N6]) -> Self {
        let mut t1_fields: [Field; N1] = std::mem::zeroed();
        let mut t2_fields: [Field; N2] = std::mem::zeroed();
        let mut t3_fields: [Field; N3] = std::mem::zeroed();
        let mut t4_fields: [Field; N4] = std::mem::zeroed();
        let mut t5_fields: [Field; N5] = std::mem::zeroed();
        let mut t6_fields: [Field; N6] = std::mem::zeroed();

        for i in 0..N1 {
            t1_fields[i] = fields[i];
        }
        for i in 0..N2 {
            t2_fields[i] = fields[N1 + i];
        }
        for i in 0..N3 {
            t3_fields[i] = fields[N1 + N2 + i];
        }
        for i in 0..N4 {
            t4_fields[i] = fields[N1 + N2 + N3 + i];
        }
        for i in 0..N5 {
            t5_fields[i] = fields[N1 + N2 + N3 + N4 + i];
        }
        for i in 0..N6 {
            t6_fields[i] = fields[N1 + N2 + N3 + N4 + N5 + i];
        }

        (
            T1::deserialize(t1_fields), T2::deserialize(t2_fields), T3::deserialize(t3_fields),
            T4::deserialize(t4_fields), T5::deserialize(t5_fields), T6::deserialize(t6_fields),
        )
    }
}

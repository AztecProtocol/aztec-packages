pub fn main(in0 : pub(Field), in1 : pub(Field), F : pub(Field)) -> pub Field {
    let mut out : Field = in0;
    if in0.lt((in1))
    {
        out = F;
    }
    out
}

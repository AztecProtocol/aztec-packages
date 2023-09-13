fn arr_copy_slice<T, N, M>(
    src: [T; N],
    mut dst: [T; M],
    offset: Field,
) -> [T; M] {
    for i in 0..dst.len() {
        dst[i] = src[i + offset];
    }
    dst
}

// fn arr_copy_slice_in_struct_lol<U, N, M, K>(
//     src: [Field; N],
//     mut dst: [U; M],
//     deserialise: fn([Field; K]) -> U,
//     offset: Field,
// ) -> [U; M] {
//     for i in 0..dst.len() {
//         let mut serialised = [0; K];
//         for j in 0..K {
//             serialised[j] = src[offset + i * K + j];
//         }
//         dst[i] = deserialise(serialised);
//     }
//     dst
// }


// fn arr_copy_slice_in_struct<U, N, M, K>(
//     src: [Field; N],
//     mut dst: [U; M],
//     deserialise: fn([Field; K]) -> U,
//     offset: Field,
// ) -> [U; M] {
//     for i in 0..dst.len() {
//         let inner_array = arr_copy_slice(src, [0; K], offset + i * K);
//         dst[i] = deserialise(inner_array);
//     }
//     dst
// }

// TODO: Replace these with something smart.
fn arr_copy_slice_in_struct_dumb2<T, U, N, M>(
    src: [T; N],
    mut dst: [U; M],
    deserialise: fn([T; 2]) -> U,
    offset: Field,
) -> [U; M] {
    for i in 0..dst.len() {
        dst[i] = deserialise([src[offset + 2 * i], src[offset + 2 * i + 1]]);
    }
    dst
}

fn arr_copy_slice_in_struct_dumb3<T, U, N, M>(
    src: [T; N],
    mut dst: [U; M],
    deserialise: fn([T; 3]) -> U,
    offset: Field,
) -> [U; M] {
    for i in 0..dst.len() {
        dst[i] = deserialise([src[offset + 2 * i], src[offset + 2 * i + 1], src[offset + 2 * i + 2]]);
    }
    dst
}
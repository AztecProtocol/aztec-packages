use dep::std::option::Option;

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

fn get_array_size<T, N>(arr: [Option<T>; N]) -> Field {
    let mut size = arr.len();
    let mut found = false;
    for i in 0..arr.len() {
        if !found & arr[i].is_none() {
            size = i;
            found = true;
        }
    }
    size
}
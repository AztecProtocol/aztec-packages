use dep::types::{
    abis::tree_leaf_read_request::TreeLeafReadRequest, merkle_tree::assert_check_membership,
    traits::is_empty,
};

pub struct TreeLeafReadRequestHint<let N: u32> {
    sibling_path: [Field; N],
}

pub fn validate_tree_leaf_read_requests<let READ_REQUEST_LEN: u32, let TREE_HEIGHT: u32>(
    read_requests: [TreeLeafReadRequest; READ_REQUEST_LEN],
    hints: [TreeLeafReadRequestHint<TREE_HEIGHT>; READ_REQUEST_LEN],
    tree_root: Field,
) {
    for i in 0..READ_REQUEST_LEN {
        let read_request = read_requests[i];
        if !is_empty(read_request) {
            assert_check_membership(
                read_request.value,
                read_request.leaf_index,
                hints[i].sibling_path,
                tree_root,
            );
        }
    }
}

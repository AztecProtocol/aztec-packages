

interface IRollup {
    function process(bytes memory _proof, bytes calldata _l2Block) external;
}
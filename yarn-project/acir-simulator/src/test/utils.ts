import { AztecAddress, CircuitsWasm, EthAddress, Fr } from "@aztec/circuits.js";
import { computeSecretMessageHash } from "@aztec/circuits.js/abis";
import { L1ToL2Message, L1Actor, L2Actor } from "@aztec/types";
import { sha256ToField} from "@aztec/foundation/crypto";

export const buildL1ToL2Message = async (contentPreimage: Fr[], targetContract: AztecAddress, secret: Fr) => {
    const wasm = await CircuitsWasm.get();

    // Function selector: 0xeeb73071 keccak256('mint(uint256,bytes32,address)')
    const contentBuf = Buffer.concat([
    Buffer.from([0xee, 0xb7, 0x30, 0x71]),
    ...contentPreimage.map(field => field.toBuffer()),
    ]);
    const content = sha256ToField(contentBuf);

    const secretHash = computeSecretMessageHash(wasm, secret);

    // Eventually the kernel will need to prove the kernel portal pair exists within the contract tree,
    // EthAddress.random() will need to be replaced when this happens
    return new L1ToL2Message(
    new L1Actor(EthAddress.random(), 1),
    new L2Actor(targetContract, 1),
    content,
    secretHash,
    0,
    0,
    );
};
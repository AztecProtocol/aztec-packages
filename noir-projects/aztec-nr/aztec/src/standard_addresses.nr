// GENERATED FILE - DO NOT EDIT. RUN `yarn workspace @aztec/standard-contracts run generate`.
use protocol_types::{address::AztecAddress, traits::FromField};

pub global STANDARD_AUTH_REGISTRY_ADDRESS: AztecAddress = AztecAddress::from_field(
<<<<<<< HEAD
    0x04fe1d86b5ae0f926883c34905a3c25cb30924138823a9883e2813d4f8b86ad9,
);

pub global STANDARD_MULTI_CALL_ENTRYPOINT_ADDRESS: AztecAddress = AztecAddress::from_field(
    0x21d17a596e8ae64c399cc7bffaf3f0346ae067a34948510f041dff8babed9e9a,
);

pub global STANDARD_PUBLIC_CHECKS_ADDRESS: AztecAddress = AztecAddress::from_field(
    0x2f96c5a68fc1d04b13b76167a254f0a1a906c2dc0b571fcbca107254f064b045,
);

pub global STANDARD_HANDSHAKE_REGISTRY_ADDRESS: AztecAddress = AztecAddress::from_field(
<<<<<<< HEAD
    0x090d0f9525c99184e3741290b2695c5e3af23f51e96061b74b953111b0d4f59d,
=======
    0x2928fe638695f9566ae51434cbc621d3264d19fe2c925c43b0fc6cd413f531bf,
);

pub global STANDARD_MULTI_CALL_ENTRYPOINT_ADDRESS: AztecAddress = AztecAddress::from_field(
    0x29a301a7ce7166500f5e765dc5731df28bd22ef0aa49697d759313f1e506825d,
);

pub global STANDARD_PUBLIC_CHECKS_ADDRESS: AztecAddress = AztecAddress::from_field(
    0x277e4c930eb878c1eaede8d81dd35439bb8a34808d20ea84feb9e27eba3ea9ba,
);

pub global STANDARD_HANDSHAKE_REGISTRY_ADDRESS: AztecAddress = AztecAddress::from_field(
    0x01a3dddd771199abee0f8f0d2eea60dd1ee6b9cf9e99f524600854628ddb2463,
>>>>>>> 4490597b1a (fix(aztec-nr): prevent recipient forging a colliding handshake (#24403))
=======
    0x06127814dca78709650de6629637194f7381d2e05b35eb9d53a4746636c9aa9d,
>>>>>>> c3a2a8512c (chore: re-pin handshake registry with owner-bound nullifiers (#24893))
);

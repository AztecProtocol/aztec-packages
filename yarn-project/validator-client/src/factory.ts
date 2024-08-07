import { ValidatorClientConfig } from "./config.js";
import { ValidatorClient } from "./validator.js";
import { type P2P } from '@aztec/p2p';

export function createValidatorClient(
    config: ValidatorClientConfig,
    p2pClient: P2P,
    // TODO: will this contain a p2p client where we can register callbacks??

) {
    return config.disableValidator ? undefined : ValidatorClient.new(config, p2pClient)
}
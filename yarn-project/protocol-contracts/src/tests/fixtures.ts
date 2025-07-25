import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

// Generated from end-to-end/src/e2e_deploy_contract/contract_class_registration.test.ts with AZTEC_GENERATE_TEST_DATA=1
export function getSampleContractClassPublishedEventPayload(): Buffer {
  const path = getPathToFixture('ContractClassPublishedEventData.hex');
  return Buffer.from(readFileSync(path).toString(), 'hex');
}

// Generated from end-to-end/src/e2e_deploy_contract/contract_class_registration.test.ts with AZTEC_GENERATE_TEST_DATA=1
export function getSamplePrivateFunctionBroadcastedEventPayload(): Buffer {
  const path = getPathToFixture('PrivateFunctionBroadcastedEventData.hex');
  return Buffer.from(readFileSync(path).toString(), 'hex');
}

// Generated from end-to-end/src/e2e_deploy_contract/contract_class_registration.test.ts with AZTEC_GENERATE_TEST_DATA=1
export function getSampleUtilityFunctionBroadcastedEventPayload(): Buffer {
  const path = getPathToFixture('UtilityFunctionBroadcastedEventData.hex');
  return Buffer.from(readFileSync(path).toString(), 'hex');
}

// Generated from end-to-end/src/e2e_deploy_contract/contract_class_registration.test.ts with AZTEC_GENERATE_TEST_DATA=1
export function getSampleContractInstancePublishedEventPayload(): Buffer {
  const path = getPathToFixture('ContractInstancePublishedEventData.hex');
  return Buffer.from(readFileSync(path).toString(), 'hex');
}

export function getPathToFixture(name: string) {
  return resolve(dirname(fileURLToPath(import.meta.url)), `../../fixtures/${name}`);
}

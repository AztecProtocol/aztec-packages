export { FactStore, type FactCollection } from './fact_store.js';
export { FactService } from './fact_service.js';
export { FactCollectionKey, FactCollectionTypeKey, type OriginBlock } from './fact_store_keys.js';
export type { Fact } from './stored_fact.js';
export {
  OriginBlockState,
  classifyOriginState,
  anchoredTipBlockNumbers,
  toFactWithOriginState,
  type TipBlockNumbers,
  type RetractableFactOrigin,
  type FactWithOriginState,
  type FactCollectionWithOriginState,
} from './origin_state.js';

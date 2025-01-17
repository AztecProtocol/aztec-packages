import bindings from 'bindings';

import { type NativeModule, wrap } from './native_class_wrapper.js';

const nativeModule: NativeModule = bindings('nodejs_module');

export const NativeWorldState = wrap('NativeWorldState', nativeModule.WorldState);

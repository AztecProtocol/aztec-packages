import { TestEnvironment } from 'jest-environment-node';

// What errors should be ignored in after hooks
const IgnoredErrors = ['HttpRequestError', 'CodeError'];

/** Custom Jest environment that ignores any whitelisted unhandled rejections that occur during `after` hooks */
export default class CustomEnvironment extends TestEnvironment {
  constructor(config, context) {
    super(config, context);
  }

  async handleTestEvent(event, state) {
    if (event.name === 'setup') {
      // Jest 29 reports both unhandledRejection and uncaughtException events as plain `error`, without any means to differentiate them
      // (see https://github.com/jestjs/jest/issues/9210). Jest 30 fixes it as part of a larger change (see
      // https://github.com/jestjs/jest/pull/14315/files#diff-9bdc1fdb60c8631b1e346eff6e4899c4e64ae3a44f4f12d0d7ac70c2aabd1d93R12-R29),
      // but we cannot update to 30 as it is still in beta at the time of writing this code. So we remove jest's unhandledRejection listener,
      // replace it with our own, and delegate to the original listener only if the error is not in the ignored list.
      const parentProcess = event.parentProcess;
      const [jestListener] = parentProcess.listeners('unhandledRejection');
      parentProcess.removeAllListeners('unhandledRejection');
      const patchedListener = (err, _promise) => {
        if (state.isInAfterHook && IgnoredErrors.some(error => err && err.name && err.name.includes(error))) {
          // Ignore the error only if it was an unhandled async rejection (not sync exception), it's on the IgnoredErrors list, and we're in an after hook.
          console.error('Ignoring unhandled rejection in after hook:', err);
        } else if (state.isInAfterHook) {
          // Log non-ignored unhandled rejection in an after hook, and pass the error to the original jest listener to fail the test.
          console.error(`Unhandled rejection in after hook:`, err);
          jestListener && jestListener(err);
        } else {
          // Otherwise, just delegate to the original jest listener, to emit the `error` event under the hood.
          jestListener && jestListener(err);
        }
      };
      parentProcess.on('unhandledRejection', patchedListener);
      state.patchedListener = patchedListener;
    } else if (event.name === 'teardown') {
      // Remove the patched handler we added in setup.
      const parentProcess = state.parentProcess;
      parentProcess.removeListener('unhandledRejection', state.patchedListener);
    } else if (event.name === 'hook_start' && event.hook.type.startsWith('after')) {
      // Track that we have entered an after hook.
      state.isInAfterHook = true;
    } else if (
      (event.name === 'hook_success' || event.name === 'hook_failure') &&
      event.hook.type.startsWith('after')
    ) {
      // Reset the flag that we are in an after hook when we exit it.
      state.isInAfterHook = false;
    }
  }
}

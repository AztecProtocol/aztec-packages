/**
 * Browser-safe exports for extension background and content scripts.
 *
 * This module contains ONLY handlers that work in service worker/content script
 * environments without Node.js polyfills.
 *
 * @packageDocumentation
 */
export {
  BackgroundConnectionHandler,
  type PendingDiscovery,
  type ActiveSession,
  type DiscoveryStatus,
  type BackgroundConnectionCallbacks,
  type BackgroundConnectionConfig,
  type BackgroundTransport,
} from './background_connection_handler.js';
export { ContentScriptConnectionHandler, type ContentScriptTransport } from './content_script_connection_handler.js';
export {
  type ContentScriptMessage,
  type BackgroundMessage,
  type MessageSender,
  type MessageOriginType,
  MessageOrigin,
} from './internal_message_types.js';

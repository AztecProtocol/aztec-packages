import { MessageTarget, MessageTypes } from '../config';
import type { BackgroundTask } from '../shared-types';

// docs:start:send-message
/**
 * Sends a message to the background script via chrome.runtime.sendMessage.
 * Used for simple request/response calls (accounts, status, approvals).
 */
export function sendToBackground(message: any): Promise<any> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { ...message, target: MessageTarget.BACKGROUND },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (response?.success) {
          resolve(response.result);
        } else {
          reject(new Error(response?.error || 'Unknown error'));
        }
      }
    );
  });
}
// docs:end:send-message

/**
 * Registry of pending task promises. (#12)
 *
 * When the background pushes a task-update via the port, we resolve/reject
 * the corresponding promise. If the popup was closed and reopened, the initial
 * state push includes all recent tasks — we process completed ones immediately
 * so waitForTask resolves even if the task finished while we were closed.
 */
export const pendingTaskCallbacks = new Map<string, {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
}>();

export function waitForTask(taskId: string, timeoutMs = 300000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      pendingTaskCallbacks.delete(taskId);
      reject(new Error('Task timed out'));
    }, timeoutMs);

    pendingTaskCallbacks.set(taskId, {
      resolve: (value: any) => {
        clearTimeout(timeoutId);
        pendingTaskCallbacks.delete(taskId);
        resolve(value);
      },
      reject: (error: Error) => {
        clearTimeout(timeoutId);
        pendingTaskCallbacks.delete(taskId);
        reject(error);
      },
    });
  });
}

export function handleTaskUpdate(task: BackgroundTask) {
  const callbacks = pendingTaskCallbacks.get(task.id);
  if (!callbacks) return;

  if (task.status === 'success') {
    callbacks.resolve(task.result);
  } else if (task.status === 'error') {
    callbacks.reject(new Error(task.error || 'Task failed'));
  }
}

// docs:start:helpers
export function truncateAddress(address: string): string {
  if (!address) return '';
  if (address.length <= 16) return address;
  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}

/**
 * Creates an account and sets it as active.
 * Shared between SetupScreen (first account) and CreateAccountView (additional accounts).
 */
export async function createAndActivateAccount(alias: string): Promise<void> {
  const { taskId } = await sendToBackground({
    type: MessageTypes.CREATE_ACCOUNT,
    alias,
  });
  const result = await waitForTask(taskId);

  if (result?.address) {
    await sendToBackground({
      type: MessageTypes.SET_ACTIVE_ACCOUNT,
      address: result.address,
    });
  }
}
// docs:end:helpers

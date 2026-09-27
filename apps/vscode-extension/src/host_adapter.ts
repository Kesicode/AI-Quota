/**
 * AI-Quota — Host Adapter
 *
 * Abstracts differences between VS Code, Antigravity IDE, and Cursor.
 * All host-specific code is isolated here — extension.ts never reads the host directly.
 */

import * as vscode from "vscode";

export type IDEHost = "vscode" | "antigravity" | "cursor" | "unknown";

export function detectHost(): IDEHost {
  // appName is set by the IDE
  const name = (vscode.env.appName ?? "").toLowerCase();
  if (name.includes("antigravity") || name.includes("agy")) return "antigravity";
  if (name.includes("cursor")) return "cursor";
  if (name.includes("code")) return "vscode";
  return "unknown";
}

/**
 * Returns true if this host supports the VS Code Secret Storage API
 * (used for credential vault in instant switching).
 */
export function supportsSecretStorage(context: vscode.ExtensionContext): boolean {
  return typeof context.secrets?.store === "function";
}

/**
 * Store a credential in the IDE's native secret storage.
 * Falls back gracefully if not supported.
 */
export async function storeSecret(
  context: vscode.ExtensionContext,
  key: string,
  value: string
): Promise<boolean> {
  try {
    if (supportsSecretStorage(context)) {
      await context.secrets.store(key, value);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Retrieve a credential from the IDE's native secret storage.
 */
export async function retrieveSecret(
  context: vscode.ExtensionContext,
  key: string
): Promise<string | undefined> {
  try {
    if (supportsSecretStorage(context)) {
      return await context.secrets.get(key);
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Delete a credential from the IDE's native secret storage.
 */
export async function deleteSecret(
  context: vscode.ExtensionContext,
  key: string
): Promise<void> {
  try {
    if (supportsSecretStorage(context)) {
      await context.secrets.delete(key);
    }
  } catch {
    // silent
  }
}

/**
 * Open the agent URL in the best way for this host.
 */
export function openUrl(url: string): void {
  vscode.env.openExternal(vscode.Uri.parse(url));
}

/**
 * Show a notification appropriate for this host.
 */
export function showNotification(
  type: "info" | "warning" | "error",
  message: string,
  ...actions: string[]
): Thenable<string | undefined> {
  if (type === "error") return vscode.window.showErrorMessage(message, ...actions);
  if (type === "warning") return vscode.window.showWarningMessage(message, ...actions);
  return vscode.window.showInformationMessage(message, ...actions);
}

import * as vscode from "vscode";

export class LangflowConnectionView implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private baseUrl: string;
  private hasApiKey: boolean;
  private readonly saveEmitter = new vscode.EventEmitter<{ baseUrl: string; apiKey: string }>();
  readonly onDidSave = this.saveEmitter.event;

  constructor(baseUrl: string, hasApiKey: boolean) {
    this.baseUrl = baseUrl;
    this.hasApiKey = hasApiKey;
  }

  update(baseUrl: string, hasApiKey: boolean) {
    this.baseUrl = baseUrl;
    this.hasApiKey = hasApiKey;
    if (this.view) {
      this.view.webview.postMessage({
        type: "state",
        baseUrl: this.baseUrl,
        hasApiKey: this.hasApiKey
      });
    }
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = {
      enableScripts: true
    };
    view.webview.html = this.renderHtml(view.webview);
    view.webview.onDidReceiveMessage((message) => {
      if (message?.type === "save") {
        this.saveEmitter.fire({
          baseUrl: typeof message.baseUrl === "string" ? message.baseUrl : "",
          apiKey: typeof message.apiKey === "string" ? message.apiKey : ""
        });
      }
    });
  }

  private renderHtml(webview: vscode.Webview): string {
    const nonce = String(Date.now());
    const escapedBaseUrl = escapeHtml(this.baseUrl);
    const apiKeyPlaceholder = this.hasApiKey ? "(saved)" : "";

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Langflow Connection</title>
  <style>
    :root {
      color-scheme: light dark;
    }
    body {
      margin: 0;
      padding: 12px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 12px;
    }
    label {
      display: block;
      margin: 0 0 6px;
      font-weight: 600;
    }
    input {
      width: 100%;
      box-sizing: border-box;
      padding: 6px 8px;
      margin-bottom: 10px;
      border: 1px solid var(--vscode-input-border);
      border-radius: 4px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
    }
    button {
      width: 100%;
      padding: 6px 8px;
      border: 1px solid var(--vscode-button-border, transparent);
      border-radius: 4px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      cursor: pointer;
    }
    button:hover {
      background: var(--vscode-button-hoverBackground);
    }
    .hint {
      margin-top: 8px;
      color: var(--vscode-descriptionForeground);
    }
  </style>
</head>
<body>
  <form id="connection-form">
    <label for="baseUrl">Langflow URL</label>
    <input id="baseUrl" name="baseUrl" type="text" value="${escapedBaseUrl}" />

    <label for="apiKey">API Key</label>
    <input id="apiKey" name="apiKey" type="password" placeholder="${apiKeyPlaceholder}" />

    <button type="submit">Save</button>
    <div class="hint">Save to refresh projects and flows.</div>
  </form>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const form = document.getElementById('connection-form');
    const baseUrlInput = document.getElementById('baseUrl');
    const apiKeyInput = document.getElementById('apiKey');

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      vscode.postMessage({
        type: 'save',
        baseUrl: baseUrlInput.value || '',
        apiKey: apiKeyInput.value || ''
      });
    });

    window.addEventListener('message', (event) => {
      const message = event.data;
      if (!message || message.type !== 'state') {
        return;
      }
      if (typeof message.baseUrl === 'string') {
        baseUrlInput.value = message.baseUrl;
      }
      apiKeyInput.placeholder = message.hasApiKey ? '(saved)' : '';
      apiKeyInput.value = '';
    });
  </script>
</body>
</html>`;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

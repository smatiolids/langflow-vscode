import * as vscode from "vscode";

export type ComponentField = {
  key: string;
  displayName: string;
  type: string;
  value: string;
  editable: boolean;
};

export type ComponentPropertiesState = {
  flowId: string;
  componentId: string;
  flowName?: string;
  componentName?: string;
  fields: ComponentField[];
};

export class LangflowPropertiesView implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private state?: ComponentPropertiesState;
  private readonly saveEmitter = new vscode.EventEmitter<{ flowId: string; componentId: string; values: Record<string, string> }>();
  readonly onDidSave = this.saveEmitter.event;

  update(state: ComponentPropertiesState) {
    this.state = state;
    if (this.view) {
      this.view.webview.postMessage({ type: "state", ...state });
    }
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: true };
    view.webview.html = this.renderHtml();

    view.webview.onDidReceiveMessage((message) => {
      if (!message || message.type !== "save" || !this.state) {
        return;
      }
      const values = typeof message.values === "object" && message.values ? message.values : {};
      this.saveEmitter.fire({
        flowId: this.state.flowId,
        componentId: this.state.componentId,
        values
      });
    });

    if (this.state) {
      view.webview.postMessage({ type: "state", ...this.state });
    }
  }

  private renderHtml(): string {
    const nonce = String(Date.now());
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Component Properties</title>
  <style>
    :root { color-scheme: light dark; }
    body {
      margin: 0;
      padding: 12px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 12px;
      color: var(--vscode-foreground);
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th, td {
      text-align: left;
      padding: 6px 4px;
      vertical-align: top;
    }
    th {
      font-weight: 600;
      border-bottom: 1px solid var(--vscode-panel-border);
    }
    tr + tr td {
      border-top: 1px solid var(--vscode-panel-border);
    }
    input {
      width: 100%;
      box-sizing: border-box;
      padding: 4px 6px;
      border: 1px solid var(--vscode-input-border);
      border-radius: 3px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
    }
    input[disabled] {
      opacity: 0.7;
    }
    .empty {
      color: var(--vscode-descriptionForeground);
      padding: 8px 2px;
    }
    .actions {
      margin-top: 10px;
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
  </style>
</head>
<body>
  <div id="header" class="label"></div>
  <div id="content" class="empty">Select a component to see its properties.</div>
  <div class="actions" id="actions" style="display:none;">
    <button id="save">Save Properties</button>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const header = document.getElementById('header');
    const content = document.getElementById('content');
    const actions = document.getElementById('actions');
    const saveButton = document.getElementById('save');
    let currentState = null;

    function render(state) {
      currentState = state;
      if (!state || !state.flowId || !state.componentId) {
        header.textContent = '';
        content.className = 'empty';
        content.textContent = 'Select a component to see its properties.';
        actions.style.display = 'none';
        return;
      }

      header.textContent = (state.flowName && state.componentName)
        ? ('Flow: ' + state.flowName + ' | Component: ' + state.componentName)
        : '';

      if (!Array.isArray(state.fields) || state.fields.length === 0) {
        content.className = 'empty';
        content.textContent = 'Select a component to see its properties.';
        actions.style.display = 'none';
        return;
      }

      content.className = '';
      const rows = state.fields.map((field) => {
        const disabled = field.editable ? '' : 'disabled';
        const safeValue = field.value ?? '';
        return '\\n<tr data-key=\"' + field.key + '\">' +
          '<td>' + field.displayName + '</td>' +
          '<td><input type=\"text\" value=\"' + safeValue.replace(/\"/g, '&quot;') + '\" ' + disabled + '></td>' +
          '</tr>';
      }).join('');

      content.innerHTML = '\\n<table>' +
        '<thead>' +
          '<tr><th>Field</th><th>Value</th></tr>' +
        '</thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table>';
      actions.style.display = 'block';
    }

    saveButton.addEventListener('click', () => {
      if (!currentState) {
        return;
      }
      const values = {};
      document.querySelectorAll('tbody tr').forEach((row) => {
        const key = row.getAttribute('data-key');
        const input = row.querySelector('input');
        if (key && input && !input.disabled) {
          values[key] = input.value;
        }
      });
      vscode.postMessage({ type: 'save', values });
    });

    window.addEventListener('message', (event) => {
      const message = event.data;
      if (!message || message.type !== 'state') {
        return;
      }
      render(message);
    });
  </script>
</body>
</html>`;
  }
}

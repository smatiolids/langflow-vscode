import * as vscode from "vscode";

export type RunFlowInput = {
  componentId: string;
  label: string;
  value: string;
};

export type RunFlowState = {
  flowId: string;
  flowName: string;
  inputs: RunFlowInput[];
};

export class LangflowRunFlowView implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private state?: RunFlowState;
  private readonly runEmitter = new vscode.EventEmitter<{ flowId: string; values: Record<string, string> }>();
  readonly onDidRun = this.runEmitter.event;

  update(state: RunFlowState) {
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
      if (!message || message.type !== "run" || !this.state) {
        return;
      }
      const values = typeof message.values === "object" && message.values ? message.values : {};
      this.runEmitter.fire({ flowId: this.state.flowId, values });
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
  <title>Run Flow</title>
  <style>
    :root { color-scheme: light dark; }
    body {
      margin: 0;
      padding: 12px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 12px;
      color: var(--vscode-foreground);
    }
    .label { font-weight: 600; margin: 0 0 6px; }
    textarea {
      width: 100%;
      min-height: 70px;
      box-sizing: border-box;
      padding: 6px 8px;
      margin-bottom: 10px;
      border: 1px solid var(--vscode-input-border);
      border-radius: 4px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      resize: vertical;
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
    .empty {
      color: var(--vscode-descriptionForeground);
      padding: 6px 2px;
    }
  </style>
</head>
<body>
  <div id="header" class="label"></div>
  <div id="content" class="empty">Select a flow to run.</div>
  <div id="actions" style="display:none;">
    <button id="run">Run</button>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const header = document.getElementById('header');
    const content = document.getElementById('content');
    const actions = document.getElementById('actions');
    const runButton = document.getElementById('run');
    let currentState = null;

    function render(state) {
      currentState = state;
      if (!state || !state.flowId) {
        header.textContent = '';
        content.className = 'empty';
        content.textContent = 'Select a flow to run.';
        actions.style.display = 'none';
        return;
      }

      header.textContent = state.flowName ? ('Flow: ' + state.flowName) : '';
      if (!Array.isArray(state.inputs) || state.inputs.length === 0) {
        content.className = 'empty';
        content.textContent = 'No ChatInput components found in this flow.';
        actions.style.display = 'none';
        return;
      }

      content.className = '';
      const fields = state.inputs.map((input) => {
        return '<div class="label">' + input.label + '</div>' +
          '<textarea data-id="' + input.componentId + '">' + (input.value || '') + '</textarea>';
      }).join('');
      content.innerHTML = fields;
      actions.style.display = 'block';
    }

    runButton.addEventListener('click', () => {
      if (!currentState) {
        return;
      }
      const values = {};
      document.querySelectorAll('textarea[data-id]').forEach((area) => {
        const id = area.getAttribute('data-id');
        if (id) {
          values[id] = area.value;
        }
      });
      vscode.postMessage({ type: 'run', values });
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

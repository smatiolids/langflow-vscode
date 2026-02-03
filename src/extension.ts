import * as vscode from "vscode";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { ComponentDocumentProvider } from "./componentDocumentProvider";
import {
  extractComponentFields,
  extractComponents,
  extractRunFlowInputs,
  updateComponentCode,
  updateComponentFieldValues
} from "./componentUtils";
import { LangflowConnectionView } from "./connectionView";
import { LangflowExplorerProvider } from "./langflowExplorer";
import { LangflowClient } from "./langflowClient";
import { LangflowPropertiesView } from "./propertiesView";
import { LangflowRunFlowView } from "./runFlowView";
import { LangflowState } from "./state";
import type { LangflowComponent, LangflowFlow, LangflowProject } from "./types";

const API_KEY_SECRET = "langflow.apiKey";

export async function activate(context: vscode.ExtensionContext) {
  const state = new LangflowState();
  const config = vscode.workspace.getConfiguration("langflow");
  let baseUrl = config.get<string>("baseUrl", "http://localhost:3000");
  let venvPath = config.get<string>("venvPath", "");
  let currentApiKey = await context.secrets.get(API_KEY_SECRET);
  let connectionSaved = false;
  const client = new LangflowClient(baseUrl, currentApiKey ?? undefined);

  const explorerProvider = new LangflowExplorerProvider(client, state, () => connectionSaved);
  const documentProvider = new ComponentDocumentProvider();
  const connectionView = new LangflowConnectionView(baseUrl, Boolean(currentApiKey), venvPath);
  const propertiesView = new LangflowPropertiesView();
  const runFlowView = new LangflowRunFlowView();
  const flowFileMap = new Map<string, string>();
  const componentFileMap = new Map<string, { flowId: string; component: LangflowComponent }>();
  const diagnostics = vscode.languages.createDiagnosticCollection("langflow");
  const execFileAsync = promisify(execFile);
  let lastFlowId: string | null = null;
  let lastComponentSelection: { flowId: string; componentId: string } | null = null;

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("langflowExplorer", explorerProvider),
    vscode.window.registerWebviewViewProvider("langflowConnection", connectionView),
    vscode.window.registerWebviewViewProvider("langflowProperties", propertiesView),
    vscode.window.registerWebviewViewProvider("langflowRunFlow", runFlowView),
    vscode.workspace.registerTextDocumentContentProvider("langflow", documentProvider)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("langflow.setApiKey", async () => {
      currentApiKey = await promptForApiKey(context, client, true, currentApiKey ?? undefined);
      connectionView.update(baseUrl, Boolean(currentApiKey), venvPath);
      explorerProvider.refresh();
    }),
    vscode.commands.registerCommand("langflow.connect", async () => {
      currentApiKey = await promptForApiKey(context, client, true, currentApiKey ?? undefined);
      connectionView.update(baseUrl, Boolean(currentApiKey), venvPath);
      explorerProvider.refresh();
    }),
    vscode.commands.registerCommand("langflow.refresh", () => {
      explorerProvider.refresh();
    }),
    vscode.commands.registerCommand("langflow.selectFlow", async (project: LangflowProject | null, flow: LangflowFlow) => {
      try {
        await explorerProvider.selectFlow(project, flow);
        propertiesView.update({ flowId: "", componentId: "", flowName: "", componentName: "", fields: [] });
        runFlowView.update({
          flowId: flow.id,
          flowName: flow.name,
          inputs: extractRunFlowInputs(state.getSelection().components)
        });
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to load flow: ${getErrorMessage(error)}`);
      }
    }),
    vscode.commands.registerCommand(
      "langflow.selectComponent",
      async (component: LangflowComponent, flowId?: string) => {
        const resolvedFlowId = flowId ?? state.getSelection().flow?.id;
        if (!resolvedFlowId) {
          vscode.window.showWarningMessage("Select a flow before selecting a component.");
          return;
        }
        if (
          lastComponentSelection &&
          lastComponentSelection.flowId === resolvedFlowId &&
          lastComponentSelection.componentId === component.id
        ) {
          await openComponentCode(component, resolvedFlowId, componentFileMap);
          return;
        }
        propertiesView.update({
          flowId: resolvedFlowId,
          componentId: component.id,
          flowName: state.getSelection().flow?.name ?? "",
          componentName: component.name,
          fields: extractComponentFields(component)
        });
        lastComponentSelection = { flowId: resolvedFlowId, componentId: component.id };
      }
    ),
    vscode.commands.registerCommand("langflow.openFlow", async (node?: { flow?: LangflowFlow }) => {
      try {
        const flow = node?.flow ?? state.getSelection().flow;
        if (!flow) {
          vscode.window.showWarningMessage("Select a flow to open.");
          return;
        }

        const flowData = state.getFlowData(flow.id) ?? (await loadFlowData(flow.id, client));
        if (!flowData) {
          vscode.window.showWarningMessage("Unable to load flow data.");
          return;
        }

        const tempDir = await ensureTempDir();
        const filePath = path.join(tempDir, `${flow.id}.json`);
        await fs.writeFile(filePath, JSON.stringify(flowData.definition, null, 2), "utf8");

        const uri = vscode.Uri.file(filePath);
        flowFileMap.set(uri.fsPath, flow.id);
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.languages.setTextDocumentLanguage(doc, "json");
        await vscode.window.showTextDocument(doc, { preview: false });
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to open flow: ${getErrorMessage(error)}`);
      }
    }),
    vscode.commands.registerCommand("langflow.openComponent", async (component: LangflowComponent, flowId?: string) => {
      const resolvedFlowId = flowId ?? state.getSelection().flow?.id;
      if (!resolvedFlowId) {
        vscode.window.showWarningMessage("Select a flow before opening a component.");
        return;
      }

      await openComponentCode(component, resolvedFlowId, componentFileMap);
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (event) => {
      if (event.affectsConfiguration("langflow.baseUrl")) {
        const updated = vscode.workspace.getConfiguration("langflow").get<string>("baseUrl", baseUrl);
        baseUrl = updated;
        client.configure(updated, currentApiKey ?? undefined);
        connectionView.update(updated, Boolean(currentApiKey), venvPath);
      }
      if (event.affectsConfiguration("langflow.venvPath")) {
        venvPath = vscode.workspace.getConfiguration("langflow").get<string>("venvPath", venvPath);
        await applyVenvPathToPython(venvPath);
        connectionView.update(baseUrl, Boolean(currentApiKey), venvPath);
      }
    })
  );

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (!editor || editor.document.uri.scheme !== "langflow") {
        return;
      }
      const selection = state.getSelection();
      if (selection.flow) {
        connectionView.update(baseUrl, Boolean(currentApiKey), venvPath);
      }
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(async (document) => {
      if (document.uri.scheme !== "langflow") {
        if (document.uri.scheme === "file") {
          if (
            await handleComponentFileSave(
              document,
              componentFileMap,
              client,
              state,
              diagnostics,
              execFileAsync,
              venvPath
            )
          ) {
            return;
          }
          await handleFlowFileSave(document, flowFileMap, client, state);
        }
        return;
      }

      const handle = documentProvider.getHandle(document.uri);
      if (!handle) {
        return;
      }

      const flowData = state.getFlowData(handle.flowId);
      if (!flowData) {
        vscode.window.showWarningMessage("Flow data not loaded yet. Expand the flow in the tree first.");
        return;
      }

      const updatedCode = document.getText();
      updateComponentCode(handle.component, updatedCode);

      try {
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: "Updating Langflow component",
            cancellable: false
          },
          async () => {
            await client.updateFlow(handle.flowId, flowData.definition);
          }
        );
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to update component: ${getErrorMessage(error)}`);
      }
    })
  );

  context.subscriptions.push(
    connectionView.onDidSave(async ({ baseUrl: submittedUrl, apiKey, venvPath: submittedVenvPath }) => {
      const trimmedUrl = submittedUrl.trim();
      if (trimmedUrl && trimmedUrl !== baseUrl) {
        baseUrl = trimmedUrl;
        await config.update("baseUrl", baseUrl, vscode.ConfigurationTarget.Global);
      }

      const trimmedKey = apiKey.trim();
      if (trimmedKey) {
        currentApiKey = trimmedKey;
        await context.secrets.store(API_KEY_SECRET, currentApiKey);
      }

      const trimmedVenvPath = submittedVenvPath.trim();
      if (trimmedVenvPath !== venvPath) {
        venvPath = trimmedVenvPath;
        await config.update("venvPath", venvPath, vscode.ConfigurationTarget.Global);
        await applyVenvPathToPython(venvPath);
      }

      client.configure(baseUrl, currentApiKey ?? undefined);
      connectionSaved = true;
      connectionView.update(baseUrl, Boolean(currentApiKey), venvPath);
      explorerProvider.refresh();
    })
  );

  context.subscriptions.push(
    runFlowView.onDidRun(async ({ flowId, values }) => {
      const output = getRunOutputChannel();
      output.clear();
      output.show(true);
      output.appendLine(`Running flow ${flowId}...`);
      try {
        await client.runFlowStream(flowId, values, (chunk) => {
          output.append(chunk);
        });
        output.appendLine("\nRun completed.");
      } catch (error) {
        const responseText =
          error && typeof error === "object" && "responseText" in error
            ? String((error as { responseText?: string }).responseText ?? "")
            : "";
        const status =
          error && typeof error === "object" && "status" in error
            ? Number((error as { status?: number }).status ?? 0)
            : 0;
        const statusLabel = status ? `HTTP ${status}` : "HTTP error";
        output.appendLine(`\nWARNING: ${statusLabel} - ${getErrorMessage(error)}`);
        if (responseText) {
          output.appendLine(responseText);
        }
        vscode.window.showErrorMessage(`Run failed (${statusLabel}). Check the Langflow Run output.`);
      }
    })
  );

  context.subscriptions.push(
    propertiesView.onDidSave(async ({ flowId, componentId, values }) => {
      const flowData = state.getFlowData(flowId);
      if (!flowData) {
        vscode.window.showWarningMessage("Expand the flow before editing properties.");
        return;
      }

      const component = flowData.components.find((entry) => entry.id === componentId);
      if (!component) {
        vscode.window.showWarningMessage("Component not found for properties update.");
        return;
      }

      updateComponentFieldValues(component, values);
      try {
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: "Updating Langflow component properties",
            cancellable: false
          },
          async () => {
            await client.updateFlow(flowId, flowData.definition);
          }
        );
        state.updateFlowDefinition(flowId, flowData.definition);
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to update component properties: ${getErrorMessage(error)}`);
      }
    })
  );

  context.subscriptions.push(
    state.onDidChangeSelection((selection) => {
      const currentFlowId = selection.flow?.id ?? null;
      if (currentFlowId !== lastFlowId) {
        propertiesView.update({ flowId: "", componentId: "", flowName: "", componentName: "", fields: [] });
        lastFlowId = currentFlowId;
      }
      if (!selection.flow) {
        runFlowView.update({ flowId: "", flowName: "", inputs: [] });
        return;
      }
      runFlowView.update({
        flowId: selection.flow.id,
        flowName: selection.flow.name,
        inputs: extractRunFlowInputs(selection.components)
      });
    })
  );

  await applyVenvPathToPython(venvPath);
  connectionView.update(baseUrl, Boolean(currentApiKey), venvPath);
}

export function deactivate() {}

async function promptForApiKey(
  context: vscode.ExtensionContext,
  client: LangflowClient,
  showInfo: boolean = true,
  existingKey?: string
): Promise<string | undefined> {
  const input = await vscode.window.showInputBox({
    title: "Langflow API Key",
    prompt: "Enter your Langflow API key",
    ignoreFocusOut: true,
    password: true,
    value: existingKey
  });

  if (!input) {
    if (showInfo) {
      vscode.window.showInformationMessage("Langflow API key is required to connect.");
    }
    return existingKey;
  }

  await context.secrets.store(API_KEY_SECRET, input);
  const baseUrl = vscode.workspace.getConfiguration("langflow").get<string>("baseUrl", "http://localhost:3000");
  client.configure(baseUrl, input);
  return input;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

async function openComponentCode(
  component: LangflowComponent,
  flowId: string,
  componentFileMap: Map<string, { flowId: string; component: LangflowComponent }>
) {
  await promptForPythonExtension();

  const targetDir = await resolveComponentCodeDir();
  const safeName = sanitizeFileName(`${flowId}-${component.id || component.name}.py`);
  const filePath = path.join(targetDir, safeName);
  await fs.writeFile(filePath, component.code || "", "utf8");

  const uri = vscode.Uri.file(filePath);
  componentFileMap.set(uri.fsPath, { flowId, component });
  const doc = await vscode.workspace.openTextDocument(uri);
  await vscode.languages.setTextDocumentLanguage(doc, "python");
  await vscode.window.showTextDocument(doc, { preview: false });
}

let runOutputChannel: vscode.OutputChannel | null = null;

function getRunOutputChannel(): vscode.OutputChannel {
  if (!runOutputChannel) {
    runOutputChannel = vscode.window.createOutputChannel("Langflow Run");
  }
  return runOutputChannel;
}

async function promptForPythonExtension() {
  const extensionId = "ms-python.python";
  const extension = vscode.extensions.getExtension(extensionId);
  if (extension) {
    return;
  }

  const action = await vscode.window.showInformationMessage(
    "Install the Python extension to enable IntelliSense and live diagnostics for component code.",
    "Install Python Extension"
  );
  if (action === "Install Python Extension") {
    await vscode.commands.executeCommand("workbench.extensions.search", extensionId);
  }
}

async function ensureTempDir(): Promise<string> {
  const dir = path.join(os.tmpdir(), "langflow-vscode");
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

async function resolveComponentCodeDir(): Promise<string> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    return ensureTempDir();
  }

  const componentEditDir = path.join(workspaceFolder.uri.fsPath, "component_edit");
  try {
    await fs.access(componentEditDir);
    return componentEditDir;
  } catch {
    const action = await vscode.window.showInformationMessage(
      'The folder "component_edit" does not exist in the workspace. Create it for component code files?',
      "Create Folder",
      "Use Temp Folder"
    );

    if (action === "Create Folder") {
      try {
        await fs.mkdir(componentEditDir, { recursive: true });
        return componentEditDir;
      } catch (error) {
        vscode.window.showWarningMessage(
          `Could not create "component_edit". Saving in temp folder instead. ${getErrorMessage(error)}`
        );
        return ensureTempDir();
      }
    }

    return ensureTempDir();
  }
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_.-]/g, "_");
}

async function loadFlowData(flowId: string, client: LangflowClient) {
  const definition = await client.getFlow(flowId);
  if (!definition) {
    return null;
  }
  return { definition };
}

async function applyVenvPathToPython(venvPath: string) {
  const interpreter = await resolvePythonInterpreter(venvPath);
  if (!interpreter) {
    return;
  }

  const pythonConfig = vscode.workspace.getConfiguration("python");
  const current = pythonConfig.get<string>("defaultInterpreterPath", "");
  if (current === interpreter) {
    return;
  }

  const target =
    vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
      ? vscode.ConfigurationTarget.Workspace
      : vscode.ConfigurationTarget.Global;
  await pythonConfig.update("defaultInterpreterPath", interpreter, target);
}

async function getPythonCommands(venvPath: string): Promise<string[]> {
  const commands: string[] = [];
  const interpreter = await resolvePythonInterpreter(venvPath);
  if (interpreter) {
    commands.push(interpreter);
  }
  commands.push("python3", "python");
  return commands;
}

async function resolvePythonInterpreter(venvPath: string): Promise<string | null> {
  const trimmedPath = venvPath.trim();
  if (!trimmedPath) {
    return null;
  }

  const candidates =
    process.platform === "win32"
      ? [path.join(trimmedPath, "Scripts", "python.exe"), path.join(trimmedPath, "Scripts", "python")]
      : [path.join(trimmedPath, "bin", "python3"), path.join(trimmedPath, "bin", "python")];

  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      continue;
    }
  }

  return null;
}

async function handleComponentFileSave(
  document: vscode.TextDocument,
  componentFileMap: Map<string, { flowId: string; component: LangflowComponent }>,
  client: LangflowClient,
  state: LangflowState,
  diagnostics: vscode.DiagnosticCollection,
  execFileAsync: (file: string, args: string[]) => Promise<{ stdout: string; stderr: string }>,
  venvPath: string
): Promise<boolean> {
  const entry = componentFileMap.get(document.uri.fsPath);
  if (!entry) {
    return false;
  }

  diagnostics.delete(document.uri);
  const syntaxResult = await checkPythonSyntax(document, diagnostics, execFileAsync, venvPath);
  if (!syntaxResult) {
    return true;
  }

  const updatedCode = document.getText();
  const existing = state.getFlowData(entry.flowId);

  try {
    const definition = existing?.definition ?? (await client.getFlow(entry.flowId));
    if (!definition) {
      vscode.window.showWarningMessage("Unable to load flow data to update component.");
      return true;
    }

    const components = extractComponents(definition);
    const match = entry.component.id
      ? components.find((component) => component.id === entry.component.id)
      : components.find((component) => component.name === entry.component.name);
    if (!match) {
      vscode.window.showWarningMessage("Component not found in flow definition.");
      return true;
    }
    updateComponentCode(match, updatedCode);
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Updating Langflow component",
        cancellable: false
      },
        async () => {
          await client.updateFlow(entry.flowId, definition);
        }
      );
    state.updateFlowDefinition(entry.flowId, definition);
    return true;
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to update component: ${getErrorMessage(error)}`);
    return true;
  }
}

async function checkPythonSyntax(
  document: vscode.TextDocument,
  diagnostics: vscode.DiagnosticCollection,
  execFileAsync: (file: string, args: string[]) => Promise<{ stdout: string; stderr: string }>,
  venvPath: string
): Promise<boolean> {
  const pythonCommands = await getPythonCommands(venvPath);
  let lastError: unknown = null;

  for (const cmd of pythonCommands) {
    try {
      await execFileAsync(cmd, ["-m", "py_compile", document.uri.fsPath]);
      return true;
    } catch (error) {
      lastError = error;
      const stderr = extractStderr(error);
      if (stderr) {
        const diagnostic = parsePythonSyntaxError(stderr, document);
        if (diagnostic) {
          diagnostics.set(document.uri, [diagnostic]);
        }
        vscode.window.showErrorMessage("Python syntax error. Fix it before saving.");
        return false;
      }
    }
  }

  vscode.window.showErrorMessage(
    `Unable to run Python syntax check. Ensure Python is installed. ${getErrorMessage(lastError)}`
  );
  return false;
}

function extractStderr(error: unknown): string {
  if (error && typeof error === "object" && "stderr" in error) {
    const stderr = (error as { stderr?: string }).stderr;
    return typeof stderr === "string" ? stderr : "";
  }
  return "";
}

function parsePythonSyntaxError(stderr: string, document: vscode.TextDocument): vscode.Diagnostic | null {
  const lines = stderr.split(/\r?\n/);
  let lineNumber: number | null = null;
  let caretIndex = -1;

  for (let i = 0; i < lines.length; i += 1) {
    const match = lines[i].match(/line (\\d+)/);
    if (match) {
      lineNumber = Number(match[1]);
      caretIndex = i + 2;
      break;
    }
  }

  if (!lineNumber || lineNumber < 1 || lineNumber > document.lineCount) {
    return null;
  }

  const messageLine = lines.find((line) => line.startsWith("SyntaxError")) ?? "SyntaxError";
  const lineText = document.lineAt(lineNumber - 1).text;
  let column = 0;

  if (caretIndex >= 0 && caretIndex < lines.length) {
    const caretLine = lines[caretIndex];
    const caretPos = caretLine.indexOf("^");
    if (caretPos >= 0) {
      column = Math.min(caretPos, Math.max(lineText.length - 1, 0));
    }
  }

  const range = new vscode.Range(
    new vscode.Position(lineNumber - 1, column),
    new vscode.Position(lineNumber - 1, Math.min(column + 1, lineText.length))
  );
  const diagnostic = new vscode.Diagnostic(range, messageLine, vscode.DiagnosticSeverity.Error);
  diagnostic.source = "Langflow";
  return diagnostic;
}

async function handleFlowFileSave(
  document: vscode.TextDocument,
  flowFileMap: Map<string, string>,
  client: LangflowClient,
  state: LangflowState
) {
  const flowId = flowFileMap.get(document.uri.fsPath);
  if (!flowId) {
    return;
  }

  try {
    const parsed = JSON.parse(document.getText());
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Updating Langflow flow",
        cancellable: false
      },
      async () => {
        await client.updateFlow(flowId, parsed);
      }
    );
    state.updateFlowDefinition(flowId, parsed);
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to update flow: ${getErrorMessage(error)}`);
  }
}

import * as vscode from "vscode";
import type { LangflowComponent } from "./types";

export type ComponentHandle = {
  flowId: string;
  component: LangflowComponent;
};

export class ComponentDocumentProvider implements vscode.TextDocumentContentProvider {
  private readonly changeEmitter = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this.changeEmitter.event;

  private readonly handles = new Map<string, ComponentHandle>();

  provideTextDocumentContent(uri: vscode.Uri): string {
    const handle = this.handles.get(uri.toString());
    if (!handle) {
      return "";
    }

    return handle.component.code || "";
  }

  registerHandle(uri: vscode.Uri, handle: ComponentHandle) {
    this.handles.set(uri.toString(), handle);
    this.changeEmitter.fire(uri);
  }

  getHandle(uri: vscode.Uri): ComponentHandle | undefined {
    return this.handles.get(uri.toString());
  }
}

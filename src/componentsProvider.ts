import * as vscode from "vscode";
import { LangflowState } from "./state";
import type { LangflowComponent } from "./types";

export type ComponentNode = {
  component: LangflowComponent;
};

export class LangflowComponentsProvider implements vscode.TreeDataProvider<ComponentNode> {
  private readonly refreshEmitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.refreshEmitter.event;

  private components: LangflowComponent[] = [];

  constructor(private readonly state: LangflowState) {
    this.state.onDidChangeSelection((selection) => {
      this.components = selection.components;
      this.refresh();
    });
  }

  refresh() {
    this.refreshEmitter.fire();
  }

  getChildren(): ComponentNode[] {
    return this.components.map((component) => ({ component }));
  }

  getTreeItem(element: ComponentNode): vscode.TreeItem {
    const item = new vscode.TreeItem(element.component.name, vscode.TreeItemCollapsibleState.None);
    item.contextValue = "langflowComponent";
    item.command = {
      title: "Open Component",
      command: "langflow.openComponent",
      arguments: [element.component]
    };
    return item;
  }
}

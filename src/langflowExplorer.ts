import * as vscode from "vscode";
import { extractComponents } from "./componentUtils";
import { LangflowClient } from "./langflowClient";
import { LangflowState } from "./state";
import type { LangflowComponent, LangflowFlow, LangflowProject } from "./types";

export type ExplorerNode =
  | { kind: "project"; project: LangflowProject }
  | { kind: "flow"; project: LangflowProject | null; flow: LangflowFlow }
  | { kind: "component"; flow: LangflowFlow; component: LangflowComponent };

export class LangflowExplorerProvider implements vscode.TreeDataProvider<ExplorerNode> {
  private readonly refreshEmitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.refreshEmitter.event;

  constructor(
    private readonly client: LangflowClient,
    private readonly state: LangflowState
  ) {}

  refresh() {
    this.refreshEmitter.fire();
  }

  async getChildren(element?: ExplorerNode): Promise<ExplorerNode[]> {
    if (!element) {
      const projects = await this.client.listProjects();
      if (projects.length === 0) {
        const flows = await this.client.listFlows();
        return flows.map((flow) => ({ kind: "flow", project: null, flow }));
      }
      return projects.map((project) => ({ kind: "project", project }));
    }

    if (element.kind === "project") {
      const flows = await this.client.listFlows(element.project.id);
      return flows.map((flow) => ({ kind: "flow", project: element.project, flow }));
    }

    if (element.kind === "flow") {
      const definition = await this.client.getFlow(element.flow.id);
      if (!definition) {
        return [];
      }
      const components = extractComponents(definition);
      this.state.setFlowData(element.project, element.flow, definition, components);
      return components.map((component) => ({
        kind: "component",
        flow: element.flow,
        component
      }));
    }

    return [];
  }

  getTreeItem(element: ExplorerNode): vscode.TreeItem {
    if (element.kind === "project") {
      const item = new vscode.TreeItem(element.project.name, vscode.TreeItemCollapsibleState.Collapsed);
      item.contextValue = "langflowProject";
      return item;
    }

    if (element.kind === "flow") {
      const item = new vscode.TreeItem(element.flow.name, vscode.TreeItemCollapsibleState.Collapsed);
      item.contextValue = "langflowFlow";
      return item;
    }

    const item = new vscode.TreeItem(element.component.name, vscode.TreeItemCollapsibleState.None);
    item.contextValue = "langflowComponent";
    item.command = {
      title: "Select Component",
      command: "langflow.selectComponent",
      arguments: [element.component, element.flow.id]
    };
    return item;
  }

  async selectFlow(project: LangflowProject | null, flow: LangflowFlow) {
    const definition = await this.client.getFlow(flow.id);
    if (!definition) {
      throw new Error("Flow definition not found");
    }

    const components = extractComponents(definition);
    this.state.setFlowData(project, flow, definition, components);
  }
}

import * as vscode from "vscode";
import type { LangflowComponent, LangflowFlow, LangflowFlowDefinition, LangflowProject } from "./types";

export type FlowSelection = {
  project: LangflowProject | null;
  flow: LangflowFlow | null;
  definition: LangflowFlowDefinition | null;
  components: LangflowComponent[];
};

export class LangflowState {
  private readonly flowData = new Map<string, { definition: LangflowFlowDefinition; components: LangflowComponent[] }>();
  private selection: FlowSelection = {
    project: null,
    flow: null,
    definition: null,
    components: []
  };

  private readonly selectionEmitter = new vscode.EventEmitter<FlowSelection>();
  readonly onDidChangeSelection = this.selectionEmitter.event;

  updateSelection(selection: FlowSelection) {
    this.selection = selection;
    this.selectionEmitter.fire(this.selection);
  }

  getSelection(): FlowSelection {
    return this.selection;
  }

  setFlowData(
    project: LangflowProject | null,
    flow: LangflowFlow,
    definition: LangflowFlowDefinition,
    components: LangflowComponent[]
  ) {
    this.flowData.set(flow.id, { definition, components });
    this.updateSelection({
      project,
      flow,
      definition,
      components
    });
  }

  getFlowData(flowId: string) {
    return this.flowData.get(flowId);
  }

  updateFlowDefinition(flowId: string, definition: LangflowFlowDefinition) {
    const existing = this.flowData.get(flowId);
    if (existing) {
      this.flowData.set(flowId, { definition, components: existing.components });
    }
    if (this.selection.flow?.id === flowId) {
      this.updateSelection({
        project: this.selection.project,
        flow: this.selection.flow,
        definition,
        components: existing ? existing.components : this.selection.components
      });
    }
  }
}

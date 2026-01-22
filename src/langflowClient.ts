import type { LangflowFlow, LangflowFlowDefinition, LangflowProject } from "./types";
import { randomUUID } from "crypto";

export class LangflowClient {
  private baseUrl: string;
  private apiKey?: string;

  constructor(baseUrl: string, apiKey?: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.apiKey = apiKey;
  }

  configure(baseUrl: string, apiKey?: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.apiKey = apiKey;
  }

  async listProjects(): Promise<LangflowProject[]> {
    const data = await this.request("/api/v1/projects");
    const items = normalizeList(data);
    return items.map(this.toProject).sort((a, b) => a.name.localeCompare(b.name));
  }

  async listFlows(projectId?: string): Promise<LangflowFlow[]> {
    if (!projectId) {
      return [];
    }

    try {
      const project = await this.request(`/api/v1/projects/${encodeURIComponent(projectId)}?is_component=false`);
      const flows = extractFlowsFromProject(project);
      if (flows) {
        return flows.map(this.toFlow).sort((a, b) => a.name.localeCompare(b.name));
      }
    } catch (error) {
      if (!isNotFoundError(error)) {
        throw error;
      }
    }

    return [];
  }

  async getFlow(flowId: string): Promise<LangflowFlowDefinition | null> {
    const data = await this.request(`/api/v1/flows/${encodeURIComponent(flowId)}`);
    return typeof data === "object" && data !== null ? (data as LangflowFlowDefinition) : null;
  }

  async updateFlow(flowId: string, flowDefinition: LangflowFlowDefinition): Promise<void> {
    await this.request(`/api/v1/flows/${encodeURIComponent(flowId)}`, {
      method: "PATCH",
      body: JSON.stringify(flowDefinition)
    });
  }

  async runFlowStream(
    flowIdOrName: string,
    inputs: Record<string, string>,
    onChunk: (chunk: string) => void
  ): Promise<void> {
    const tweaks: Record<string, { input_value: string }> = {};
    for (const [componentId, value] of Object.entries(inputs)) {
      tweaks[componentId] = { input_value: value };
    }

    const body = {
      input_type: "chat",
      output_type: "chat",
      tweaks,
      session_id: randomUUID()
    };

    const response = await fetch(`${this.baseUrl}/api/v1/run/${encodeURIComponent(flowIdOrName)}?stream=true`, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const text = await response.text();
      const error = new Error(`Langflow API error (${response.status}): ${text || response.statusText}`);
      (error as { responseText?: string; status?: number }).responseText = text;
      (error as { responseText?: string; status?: number }).status = response.status;
      throw error;
    }

    if (!response.body) {
      const payload = await response.text();
      if (payload) {
        onChunk(payload);
      }
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      if (value) {
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) {
            continue;
          }
          if (trimmed.startsWith("data:")) {
            onChunk(`${trimmed.slice(5).trim()}\n`);
          } else {
            onChunk(`${trimmed}\n`);
          }
        }
      }
    }

    if (buffer.trim()) {
      onChunk(`${buffer.trim()}\n`);
    }
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json"
    };

    if (this.apiKey) {
      headers["x-api-key"] = this.apiKey;
    }

    return headers;
  }

  private async request(path: string, options: RequestInit = {}) {
    const headers = this.buildHeaders();

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        ...headers,
        ...(options.headers ?? {})
      }
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Langflow API error (${response.status}): ${text || response.statusText}`);
    }

    if (response.status === 204) {
      return null;
    }

    return response.json();
  }

  private toProject(raw: any): LangflowProject {
    const name = raw?.name ?? raw?.title ?? raw?.project_name ?? raw?.project?.name;
    return {
      id: String(raw.id ?? raw._id ?? raw.project_id ?? ""),
      name: String(name ?? "Untitled Project")
    };
  }

  private toFlow(raw: any): LangflowFlow {
    const name =
      raw?.name ??
      raw?.title ??
      raw?.flow_name ??
      raw?.flow?.name ??
      raw?.data?.name ??
      raw?.data?.flow?.name;
    return {
      id: String(raw.id ?? raw._id ?? raw.flow_id ?? raw?.data?.id ?? raw?.flow?.id ?? ""),
      name: String(name ?? "Untitled Flow"),
      projectId: raw.project_id
        ? String(raw.project_id)
        : raw.folder_id
        ? String(raw.folder_id)
        : raw?.flow?.folder_id
        ? String(raw.flow.folder_id)
        : undefined
    };
  }
}

function extractFlowsFromProject(project: unknown): unknown[] | null {
  if (!project || typeof project !== "object") {
    return null;
  }
  const record = project as Record<string, unknown>;
  if (record.flows) {
    const flows = normalizeList(record.flows);
    if (flows.length > 0) {
      return flows;
    }
  }
  if (record.data && typeof record.data === "object") {
    const data = record.data as Record<string, unknown>;
    if (data.flows) {
      const flows = normalizeList(data.flows);
      if (flows.length > 0) {
        return flows;
      }
    }
  }
  if (record.project && typeof record.project === "object") {
    const projectNode = record.project as Record<string, unknown>;
    if (projectNode.flows) {
      const flows = normalizeList(projectNode.flows);
      if (flows.length > 0) {
        return flows;
      }
    }
  }
  const deepFlows = findFlowsDeep(record, 3);
  if (deepFlows && deepFlows.length > 0) {
    return deepFlows;
  }
  return null;
}

function isNotFoundError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return error.message.includes("(404)") || error.message.includes("No detail found");
}

function normalizeList(data: unknown): unknown[] {
  if (Array.isArray(data)) {
    return data;
  }
  if (!data || typeof data !== "object") {
    return [];
  }
  const record = data as Record<string, unknown>;
  if (Array.isArray(record.items)) {
    return record.items;
  }
  if (Array.isArray(record.data)) {
    return record.data;
  }
  if (Array.isArray(record.results)) {
    return record.results;
  }
  return [];
}

function findFlowsDeep(value: unknown, depth: number): unknown[] | null {
  if (depth < 0 || !value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (record.flows) {
    const flows = normalizeList(record.flows);
    if (flows.length > 0) {
      return flows;
    }
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findFlowsDeep(item, depth - 1);
      if (found && found.length > 0) {
        return found;
      }
    }
    return null;
  }

  for (const key of Object.keys(record)) {
    const found = findFlowsDeep(record[key], depth - 1);
    if (found && found.length > 0) {
      return found;
    }
  }

  return null;
}

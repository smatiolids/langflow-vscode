import type { LangflowComponent, LangflowFlowDefinition } from "./types";
import type { ComponentField } from "./propertiesView";
import type { RunFlowInput } from "./runFlowView";

type UnknownRecord = Record<string, unknown>;

type ComponentShape = {
  id?: string | number;
  name?: string;
  data?: UnknownRecord;
  code?: string;
  [key: string]: unknown;
};

export function extractComponents(flow: LangflowFlowDefinition): LangflowComponent[] {
  const nodes = findNodes(flow);
  if (!nodes) {
    return [];
  }

  return nodes.map((node) => {
    const component = node as ComponentShape;
    const id = String(component.id ?? component.data?.id ?? "");
    const name = String(
      component.data?.node && typeof component.data?.node === "object"
        ? ((component.data.node as UnknownRecord).display_name ??
            (component.data.node as UnknownRecord).name ??
            component.name ??
            component.data?.name ??
            component.data?.label)
        : component.name ?? component.data?.name ?? component.data?.label ?? "Component"
    );
    const code = extractCode(component) ?? "";

    return {
      id,
      name,
      code,
      raw: component
    };
  });
}

export function extractComponentFields(component: LangflowComponent): ComponentField[] {
  const raw = component.raw as ComponentShape;
  const node = getComponentNode(raw);
  if (!node) {
    return [];
  }

  const fieldOrder = Array.isArray(node.field_order) ? (node.field_order as string[]) : [];
  const template = node.template && typeof node.template === "object" ? (node.template as UnknownRecord) : null;
  if (!template || fieldOrder.length === 0) {
    return [];
  }

  return fieldOrder
    .map((fieldKey) => {
      const field = template[fieldKey];
      if (!field || typeof field !== "object") {
        return null;
      }
      const record = field as UnknownRecord;
      const type = typeof record.type === "string" ? record.type : "";
      const displayName = typeof record.display_name === "string" ? record.display_name : fieldKey;
      const value = record.value != null ? String(record.value) : "";
      const editable = type === "str";
      return { key: fieldKey, displayName, type, value, editable } as ComponentField;
    })
    .filter((field): field is ComponentField => Boolean(field));
}

export function updateComponentFieldValues(component: LangflowComponent, values: Record<string, string>) {
  const raw = component.raw as ComponentShape;
  const node = getComponentNode(raw);
  if (!node) {
    return;
  }
  if (!node.template || typeof node.template !== "object") {
    return;
  }

  const template = node.template as UnknownRecord;
  for (const [key, value] of Object.entries(values)) {
    const field = template[key];
    if (field && typeof field === "object") {
      const record = field as UnknownRecord;
      if (record.type === "str") {
        record.value = value;
      }
    }
  }

  markComponentEdited(raw);
}

export function updateComponentCode(component: LangflowComponent, newCode: string) {
  const raw = component.raw as ComponentShape;

  if (raw.data && typeof raw.data === "object" && "code" in raw.data) {
    const data = raw.data as UnknownRecord;
    if (data.code && typeof data.code === "object") {
      (data.code as UnknownRecord).value = newCode;
    } else {
      data.code = newCode;
    }
  } else if ("code" in raw) {
    raw.code = newCode;
  } else if (raw.data && typeof raw.data === "object") {
    const data = raw.data as UnknownRecord;
    if (data.node && typeof data.node === "object") {
      const node = data.node as UnknownRecord;
      if (node.template && typeof node.template === "object") {
        const template = node.template as UnknownRecord;
        if (template.code && typeof template.code === "object") {
          (template.code as UnknownRecord).value = newCode;
        } else {
          template.code = newCode;
        }
      }
    } else if (data.template && typeof data.template === "object") {
      const template = data.template as UnknownRecord;
      if (template.code && typeof template.code === "object") {
        (template.code as UnknownRecord).value = newCode;
      } else {
        template.code = newCode;
      }
    } else {
      data.code = newCode;
    }
  } else {
    raw.code = newCode;
  }

  component.code = newCode;
  markComponentEdited(raw);
}

function extractCode(component: ComponentShape): string | undefined {
  if (component.data && typeof component.data === "object") {
    const data = component.data as UnknownRecord;
    if (data.code && typeof data.code === "object") {
      const codeRecord = data.code as UnknownRecord;
      if (typeof codeRecord.value === "string") {
        return codeRecord.value;
      }
    }
    if (typeof data.code === "string") {
      return data.code;
    }
    if (data.node && typeof data.node === "object") {
      const node = data.node as UnknownRecord;
      if (node.template && typeof node.template === "object") {
        const template = node.template as UnknownRecord;
        if (template.code && typeof template.code === "object") {
          const codeRecord = template.code as UnknownRecord;
          if (typeof codeRecord.value === "string") {
            return codeRecord.value;
          }
        }
        if (typeof template.code === "string") {
          return template.code;
        }
      }
    }
    if (data.template && typeof data.template === "object") {
      const template = data.template as UnknownRecord;
      if (template.code && typeof template.code === "object") {
        const codeRecord = template.code as UnknownRecord;
        if (typeof codeRecord.value === "string") {
          return codeRecord.value;
        }
      }
      if (typeof template.code === "string") {
        return template.code;
      }
    }
  }

  if (typeof component.code === "string") {
    return component.code;
  }

  return undefined;
}

function getComponentNode(component: ComponentShape): UnknownRecord | null {
  if (component.data && typeof component.data === "object") {
    const data = component.data as UnknownRecord;
    if (data.node && typeof data.node === "object") {
      return data.node as UnknownRecord;
    }
  }
  return null;
}

function markComponentEdited(component: ComponentShape) {
  if (component.data && typeof component.data === "object") {
    const data = component.data as UnknownRecord;
    data.edited = true;
    if (data.node && typeof data.node === "object") {
      (data.node as UnknownRecord).edited = true;
    }
  }
  component.edited = true;
}

export function extractRunFlowInputs(components: LangflowComponent[]): RunFlowInput[] {
  return components
    .map((component) => {
      const node = getComponentNode(component.raw as ComponentShape);
      if (!node) {
        return null;
      }
      const rawComponent = component.raw as ComponentShape;
      const data = rawComponent.data as UnknownRecord | undefined;
      const dataType = data && typeof data.type === "string" ? data.type : "";
      if (dataType !== "ChatInput") {
        return null;
      }
      const label =
        typeof node.display_name === "string"
          ? node.display_name
          : typeof node.name === "string"
          ? node.name
          : component.name;
      const template = node.template && typeof node.template === "object" ? (node.template as UnknownRecord) : null;
      let value = "";
      if (template && template.input_value && typeof template.input_value === "object") {
        const field = template.input_value as UnknownRecord;
        if (field.value != null) {
          value = String(field.value);
        }
      }
      return { componentId: component.id, label, value } as RunFlowInput;
    })
    .filter((input): input is RunFlowInput => Boolean(input));
}

function findNodes(flow: LangflowFlowDefinition): ComponentShape[] | null {
  const direct = (flow as UnknownRecord).nodes;
  if (Array.isArray(direct)) {
    return direct as ComponentShape[];
  }

  if (flow.data && typeof flow.data === "object") {
    const data = flow.data as UnknownRecord;
    if (Array.isArray(data.nodes)) {
      return data.nodes as ComponentShape[];
    }
    if (data.graph && typeof data.graph === "object") {
      const graph = data.graph as UnknownRecord;
      if (Array.isArray(graph.nodes)) {
        return graph.nodes as ComponentShape[];
      }
    }
  }

  return null;
}

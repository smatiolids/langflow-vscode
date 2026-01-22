export type LangflowProject = {
  id: string;
  name: string;
};

export type LangflowFlow = {
  id: string;
  name: string;
  projectId?: string;
};

export type LangflowComponent = {
  id: string;
  name: string;
  code: string;
  raw: unknown;
};

export type LangflowFlowDefinition = {
  id?: string;
  name?: string;
  data?: unknown;
  [key: string]: unknown;
};

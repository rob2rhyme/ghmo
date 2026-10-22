export type DocFieldType = "text" | "date" | "select" | "textarea" | "checkbox";

export type DocFieldOption = {
  label: string;
  value: string;
};

export type DocField = {
  id: string;
  label: string;
  type: DocFieldType;
  placeholder?: string;
  hint?: string;
  required?: boolean;
  options?: DocFieldOption[];
  rows?: number;
  defaultValue?: string;
};

export type DocTemplateStep = {
  id: string;
  title: string;
  fieldKeys: string[];
};

export type DocTemplateMeta = {
  id: string;
  /** Bump when the wording or layout changes. Saved documents remember the version they were made with. */
  version: number;
  title: string;
  category: string;
  description: string;
  fields: DocField[];
  steps?: DocTemplateStep[];
};

export type DocTemplate = DocTemplateMeta & {
  renderHtml: (inputs: Record<string, string>) => string;
};

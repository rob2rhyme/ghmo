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

export type DocTemplateMeta = {
  id: string;
  title: string;
  category: string;
  description: string;
  fields: DocField[];
};

export type DocTemplate = DocTemplateMeta & {
  renderHtml: (inputs: Record<string, string>) => string;
};

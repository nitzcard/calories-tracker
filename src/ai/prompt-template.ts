export function renderPromptTemplate(
  template: string,
  values: Record<string, string | number | null | undefined>,
) {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const value = values[key];
    return value == null ? "" : String(value);
  }).trim();
}

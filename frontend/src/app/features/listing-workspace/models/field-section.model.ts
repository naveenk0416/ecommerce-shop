export interface FieldConfig {
  key: string;
  label: string;
  maxLength: number;
  multiline?: boolean;
}

export interface FieldSection {
  title: string;
  icon: string;
  description: string;
  fields: FieldConfig[];
}

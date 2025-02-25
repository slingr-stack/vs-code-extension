
interface FieldRules {
  required?: boolean;
}

interface BaseField {
  label: string;
  name: string;
  type: string;
  multiplicity?: 'one' | 'many';
  rules?: FieldRules;
  
}

interface TextRules extends FieldRules {
  maxLength?: number;
}

interface NumberRules extends FieldRules {
  maxDecimals?: number;
}

export interface TextField extends BaseField {
  type: 'text';
  rules?: TextRules;
}

export  interface NumberField extends BaseField {
  type: 'number';
  rules?: NumberRules;
}

export interface RelationshipField extends BaseField {
  type: 'relationship';
  entity: string;
}

export type EntityField = TextField | NumberField | RelationshipField;

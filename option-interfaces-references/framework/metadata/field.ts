
export interface Field {
    label: string;
    name: string;
    type: 'text' | 'number' | 'date';
    required?: boolean;
    unique?: boolean;
    defaultValue?: any; 
    calculation?: () => any;
}
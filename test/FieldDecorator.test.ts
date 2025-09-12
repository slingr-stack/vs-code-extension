import 'reflect-metadata';
import { BaseModel, Field, Model, Text } from '../index';
import { MODEL_FIELDS } from '../src/model/metadata';

@Model({
  docs: "Test model for Field decorator without parameters"
})
class TestFieldModel extends BaseModel {
  
  // Test @Field() without parameters (new functionality)
  @Field()
  @Text()
  name!: string;
  
  // Test @Field({}) with empty object (existing functionality)
  @Field({})
  @Text()
  description!: string;
  
  // Test @Field with options (existing functionality)
  @Field({ required: true })
  @Text()
  requiredField!: string;
}

describe('Field Decorator Without Parameters', () => {
  
  describe('Basic Usage Tests', () => {
    
    it('should allow @Field() without parameters', async () => {
      const model = new TestFieldModel();
      model.name = 'Test Name';
      model.description = 'Test Description';
      model.requiredField = 'Required Value';
      
      const errors = await model.validate();
      expect(errors).toHaveLength(0);
    });

    it('should behave the same as @Field({}) with empty object', async () => {
      const model = new TestFieldModel();
      model.requiredField = 'Required Value';
      
      // Both name and description should behave the same (optional fields)
      const errors = await model.validate();
      expect(errors).toHaveLength(0);
    });

    it('should still work with required fields', async () => {
      const model = new TestFieldModel();
      // Not setting requiredField
      
      const errors = await model.validate();
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(error => error.property === 'requiredField')).toBe(true);
    });
  });

  describe('JSON Serialization Tests', () => {
    
    it('should serialize fields with @Field() correctly', () => {
      const model = new TestFieldModel();
      model.name = 'Test Name';
      model.description = 'Test Description';
      model.requiredField = 'Required Value';
      
      const json = model.toJSON();
      expect(json.name).toBe('Test Name');
      expect(json.description).toBe('Test Description');
      expect(json.requiredField).toBe('Required Value');
    });

    it('should deserialize fields with @Field() correctly', () => {
      const json = {
        name: 'Test Name',
        description: 'Test Description',
        requiredField: 'Required Value'
      };
      
      const model = TestFieldModel.fromJSON(json);
      expect(model.name).toBe('Test Name');
      expect(model.description).toBe('Test Description');
      expect(model.requiredField).toBe('Required Value');
    });
  });

  describe('Metadata Tests', () => {
    
    it('should register fields with @Field() in metadata', () => {
      const fields = Reflect.getMetadata(MODEL_FIELDS, TestFieldModel) || [];
      expect(fields).toContain('name');
      expect(fields).toContain('description');
      expect(fields).toContain('requiredField');
    });
  });
});
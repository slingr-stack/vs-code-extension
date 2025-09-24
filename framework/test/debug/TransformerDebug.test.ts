import number from 'financial-number';
import { FinancialNumberTransformer } from '../../src/datasources/typeorm/ValueTransformers';

describe('FinancialNumberTransformer behavior', () => {
  it('should handle decimal transformer correctly', () => {
    const decimalTransformer = new FinancialNumberTransformer(2, 'truncate');
    
    // Test with undefined
    expect(decimalTransformer.to(undefined)).toBeNull();
    expect(decimalTransformer.from(undefined)).toBeUndefined();
    
    // Test with null
    expect(decimalTransformer.to(null)).toBeNull();
    expect(decimalTransformer.from(null)).toBeUndefined();
    
    // Test with value that should be truncated
    const decimalValue = number('123.456');
    const toResult = decimalTransformer.to(decimalValue);
    console.log('Decimal to() result:', toResult);
    expect(toResult).toBe('123.45');
    
    const fromResult = decimalTransformer.from('123.456');
    console.log('Decimal from() result:', fromResult?.toString());
    expect(fromResult?.toString()).toBe('123.45');
  });
  
  it('should handle money transformer correctly', () => {
    const moneyTransformer = new FinancialNumberTransformer(2, 'roundHalfToEven');
    
    // Test with undefined
    expect(moneyTransformer.to(undefined)).toBeNull();
    expect(moneyTransformer.from(undefined)).toBeUndefined();
    
    // Test with null
    expect(moneyTransformer.to(null)).toBeNull();
    expect(moneyTransformer.from(null)).toBeUndefined();
    
    // Test with value that should be rounded
    const moneyValue = number('123.456');
    const toResult = moneyTransformer.to(moneyValue);
    console.log('Money to() result:', toResult);
    expect(toResult).toBe('123.46');
    
    const fromResult = moneyTransformer.from('123.456');
    console.log('Money from() result:', fromResult?.toString());
    expect(fromResult?.toString()).toBe('123.46');
  });
});

import number from 'financial-number';
import { FinancialNumberTransformer } from './src/datasources/typeorm/ValueTransformers.js';

console.log('Testing FinancialNumberTransformer...');

// Test Decimal transformer (truncate)
const decimalTransformer = new FinancialNumberTransformer(2, 'truncate');

console.log('\n=== Decimal Transformer (truncate) ===');

// Test with undefined
console.log('undefined -> to():', decimalTransformer.to(undefined));
console.log('undefined -> from():', decimalTransformer.from(undefined));

// Test with null
console.log('null -> to():', decimalTransformer.to(null));
console.log('null -> from():', decimalTransformer.from(null));

// Test with value that should be truncated
const decimalValue = number('123.456');
console.log('123.456 financial number -> to():', decimalTransformer.to(decimalValue));
console.log('123.456 string -> from():', decimalTransformer.from('123.456'));

// Test Money transformer (roundHalfToEven)
const moneyTransformer = new FinancialNumberTransformer(2, 'roundHalfToEven');

console.log('\n=== Money Transformer (roundHalfToEven) ===');

// Test with undefined
console.log('undefined -> to():', moneyTransformer.to(undefined));
console.log('undefined -> from():', moneyTransformer.from(undefined));

// Test with null
console.log('null -> to():', moneyTransformer.to(null));
console.log('null -> from():', moneyTransformer.from(null));

// Test with value that should be rounded
const moneyValue = number('123.456');
console.log('123.456 financial number -> to():', moneyTransformer.to(moneyValue));
console.log('123.456 string -> from():', moneyTransformer.from('123.456'));

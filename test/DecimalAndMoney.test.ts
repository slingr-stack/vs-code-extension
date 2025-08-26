import 'reflect-metadata';
import { plainToClass, classToPlain, instanceToPlain } from 'class-transformer';
import { Money } from 'bigint-money';
import { Product } from './model/Product';


describe('Decimal Decorator and Type', () => {

    describe('JSON Serialization (toJSON)', () => {
        it('should serialize a Decimal value to a string with correct decimal places', () => {
            const product = new Product();
            product.name = 'Test';
            product.price = new Money('123.456', 'XXX'); // Internamente tiene más decimales

            const json = JSON.stringify(product);
            expect(json).toEqual('{"name":"Test","price":"123.46"}'); 
        });
    });

    describe('JSON Deserialization (fromJSON)', () => {
        it('should deserialize a valid string to a Money object', async () => {
            const json = { name: 'Mortgage', price: '99.99', interestRate: '0.1234' };
            const product = new Product()
            product.
        });

        it('should apply rounding correctly (roundHalfToEven)', () => {
            // 4.255 se redondea a 4.26 (par)
            const json1 = { name: 'Product 1', price: '4.255' };
            const product1 = plainToClass(Product, json1);
            expect(product1.price.toFixed(2)).toBe('4.26');

            // 4.245 se redondea a 4.24 (par)
            const json2 = { name: 'Product 2', price: '4.245' };
            const product2 = plainToClass(Product, json2);
            expect(product2.price.toFixed(2)).toBe('4.24');
        });

        it('should fail validation if roundingType is "Error" and decimals are more than allowed', async () => {
            const json = { name: 'Mortgage', interestRate: '0.12345' }; // 5 decimales, se esperan 4
            const product = plainToClass(Product, json);

            const errors = await product.validate();
            expect(errors.length).toBeGreaterThan(0);
            expect(errors[0]?.property).toBe('interestRate');
            expect(errors[0]?.constraints).toHaveProperty('isDecimal');
        });

        it('should pass validation if roundingType is "Error" and decimals match or are less', async () => {
            const json = { name: 'Mortgage', interestRate: '0.1234' }; // 4 decimales
            const product = plainToClass(Product, json);

            const errors = await product.validate();
            expect(errors).toHaveLength(0);
        });
    });

    describe('Validations', () => {
        it('should fail if value is less than min', async () => {
            const json = { name: 'Test', price: '0.00' };
            const product = plainToClass(Product, json);

            const errors = await product.validate();
            expect(errors.length).toBeGreaterThan(0);
            expect(errors[0]?.property).toBe('price');
            expect(errors[0]?.constraints).toHaveProperty('min');
        });

        it('should fail if value is greater than max', async () => {
            const json = { name: 'Test', price: '1000.01' };
            const product = plainToClass(Product, json);

            const errors = await product.validate();
            expect(errors.length).toBeGreaterThan(0);
            expect(errors[0]?.property).toBe('price');
            expect(errors[0]?.constraints).toHaveProperty('max');
        });

        it('should fail if value is not positive', async () => {
            const json = { name: 'Test', price: '0' };
            const product = plainToClass(Product, json);

            const errors = await product.validate();
            expect(errors.length).toBeGreaterThan(0);
            expect(errors[0]?.property).toBe('price');
            expect(errors[0]?.constraints).toHaveProperty('isPositive');
        });
    });
});
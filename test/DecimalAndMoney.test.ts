import 'reflect-metadata';
import { plainToClass } from 'class-transformer';
import { Money } from 'bigint-money';
import { SimpleProduct } from './model/SimpleProduct';


describe('Decimal Decorator and Type', () => {

    describe('JSON Serialization (toJSON)', () => {
        it('should serialize a Decimal value to a string with correct decimal places using Truncate', () => {
            const product = new SimpleProduct();
            product.name = 'Test';
            product.priceTruncate = new Money('123.456', 'XXX'); // Input with more decimals.

            product.toJSON();
            expect(product.toJSON()).toEqual({
                name: 'Test',
                priceTruncate: '123.45'
            });

        });

        it("should serialize a Decimal value to a string with correct decimal places using roundHalfToEven", () => {
            const product = new SimpleProduct();
            product.name = 'Test';
            product.priceHalfToEven = new Money('123.456', 'XXX'); // Input with more decimals.

            // 1. Call the .toJSON() method directly from your BaseModel.
            const jsonObject = product.toJSON();

            // 2. Compare the resulting object.
            //    'roundHalfToEven' with 2 decimals on '123.456' should result in '123.46'.
            expect(jsonObject).toEqual({
                name: 'Test',
                priceHalfToEven: '123.46'
            });
        });

    });

    describe('Validations', () => {
        it('should fail if value is less than min', async () => {
            const json = { name: 'Test', priceTruncate: '0.00' };
            const product = plainToClass(SimpleProduct, json);

            const errors = await product.validate();
            expect(errors.length).toBeGreaterThan(0);
            expect(errors[0]?.property).toBe('priceTruncate');
            expect(errors[0]?.constraints).toHaveProperty('min');
        });

        it('should fail if value is greater than max', async () => {
            const json = { name: 'Test', priceTruncate: '1000.01' };
            const product = plainToClass(SimpleProduct, json);

            const errors = await product.validate();
            expect(errors.length).toBeGreaterThan(0);
            expect(errors[0]?.property).toBe('priceTruncate');
            expect(errors[0]?.constraints).toHaveProperty('max');
        });

        it('should fail if value is not positive', async () => {
            const json = { name: 'Test', priceTruncate: '0' };
            const product = plainToClass(SimpleProduct, json);

            const errors = await product.validate();
            expect(errors.length).toBeGreaterThan(0);
            expect(errors[0]?.property).toBe('priceTruncate');
            expect(errors[0]?.constraints).toHaveProperty('isPositive');
        });
    });

    describe('Deserialization (from JSON)', () => {
        it('should deserialize a JSON string to a Decimal value', () => {
            const json = { name: 'Test', priceTruncate: '123.45' };
            const product = SimpleProduct.fromJSON(json);
            product.validate();
            
        });


    });
});
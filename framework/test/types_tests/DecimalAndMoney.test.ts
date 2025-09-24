import 'reflect-metadata';
import { DecimalMoneyModel } from '../model/DecimalMoneyModel';
import { decimal, money } from '../../index';

describe('@Decimal Decorator', () => {

    describe('JSON Serialization (toJSON)', () => {
        it('should serialize a Decimal value with truncate rounding', () => {
            const product = new DecimalMoneyModel();
            product.name = 'Test';
            product.priceTruncate = decimal('123.456'); // Input with more decimals

            const jsonObject = product.toJSON();

            expect(jsonObject).toEqual({
                name: 'Test',
                priceTruncate: '123.45', // '123.456' truncated to 2 decimals
            });
        });

        it('should serialize a Decimal value with roundHalfToEven (round half up)', () => {
            const product = new DecimalMoneyModel();
            product.name = 'Test';
            product.priceRound = decimal('123.455');

            const jsonObject = product.toJSON();

            expect(jsonObject).toEqual({
                name: 'Test',
                priceRound: '123.46',
            });
        });
    });

    describe('Deserialization (fromJSON)', () => {
        it('should deserialize a JSON string to a Decimal value', async () => {
            const json = { name: 'Test', priceTruncate: '123.45' };
            const product = DecimalMoneyModel.fromJSON(json);

            const errors = await product.validate();
            expect(errors).toHaveLength(0);

            expect(product.priceTruncate.toString()).toBe('123.45');
        });

        it('should round the value on deserialization and pass validation (Truncate) ', async () => {
            const json = { name: 'Test', priceTruncate: '123.4563' };
            const product = DecimalMoneyModel.fromJSON(json); // Should be truncated to 123.45

            const errors = await product.validate();
            expect(errors).toHaveLength(0); // Validation should pass
            expect(product.priceTruncate.toString()).toBe('123.45');
        });

        it('should round the value on deserialization and pass validation (Round Half To Even)', async () => {
            const json = { name: 'Test', priceRound: '123.455' };
            const product = DecimalMoneyModel.fromJSON(json); // Should be rounded to 123.46

            const errors = await product.validate();
            expect(errors).toHaveLength(0); // Validation should pass
            expect(product.priceRound.toString()).toBe('123.46');
        });
    });

    describe('Validations', () => {
        it('should fail if value is less than min', async () => {
            const json = { name: 'Test', priceTruncate: '0.00' };
            const product = DecimalMoneyModel.fromJSON(json);

            const errors = await product.validate();
            expect(errors.length).toBeGreaterThan(0);
            expect(errors[0]?.property).toBe('priceTruncate');
            expect(errors[0]?.constraints).toHaveProperty('min');
        });

        it('should fail if value is greater than max', async () => {
            const json = { name: 'Test', priceTruncate: '1000.01' };
            const product = DecimalMoneyModel.fromJSON(json);

            const errors = await product.validate();
            expect(errors.length).toBeGreaterThan(0);
            expect(errors[0]?.property).toBe('priceTruncate');
            expect(errors[0]?.constraints).toHaveProperty('max');
        });

        it('should fail if value is not positive', async () => {
            const json = { name: 'Test', priceTruncate: '-5.00' };
            const product = DecimalMoneyModel.fromJSON(json);

            const errors = await product.validate();
            expect(errors.length).toBeGreaterThan(0);
            expect(errors[0]?.property).toBe('priceTruncate');
            expect(errors[0]?.constraints).toHaveProperty('isPositive');
        });

        it('should fail if value is not negative', async () => {
            const json = { name: 'Test', priceNegative: '2.00' };
            const product = DecimalMoneyModel.fromJSON(json);

            const errors = await product.validate();
            expect(errors.length).toBeGreaterThan(0);
            expect(errors[0]?.property).toBe('priceNegative');
            expect(errors[0]?.constraints).toHaveProperty('isNegative');
        });

        it("should fail if an incorrect number of decimals is set manually", async () => {
            const product = new DecimalMoneyModel();
            product.name = 'Test';
            product.priceTruncate = decimal('123.456'); // Set a value with more than 2 decimals

            const errors = await product.validate();
            expect(errors.length).toBeGreaterThan(0);
            expect(errors[0]?.property).toBe('priceTruncate');
            expect(errors[0]?.constraints).toHaveProperty('isDecimal');
        });
    });

});

describe('@Money Decorator', () => {
    describe('JSON Serialization and Deserialization', () => {
        it('should correctly serialize and deserialize a Money value', async () => {
            const product = new DecimalMoneyModel();
            product.name = 'Ice Cream';
            product.priceMoney = money('1.25');

            const jsonObject = product.toJSON();
            expect(jsonObject.priceMoney).toBe('1.25');

            const newProduct = DecimalMoneyModel.fromJSON(jsonObject);
            const errors = await newProduct.validate();
            expect(errors).toHaveLength(0);
            expect(newProduct.priceMoney.toString()).toBe('1.25');
        });

        it('should round the value on deserialization and pass validation', async () => {
            const json = { name: 'Ice Cream', priceMoney: '1.259' };
            const product = DecimalMoneyModel.fromJSON(json);

            const errors = await product.validate();
            expect(errors).toHaveLength(0);
            expect(product.priceMoney.toString()).toBe('1.26');
        });
    });

    describe('Validations', () => {
        it('should fail if an incorrect number of decimals is set manually', async () => {
            const product = new DecimalMoneyModel();
            product.name = 'Ice Cream';
            product.priceMoney = money('1.245');

            const errors = await product.validate();
            expect(errors.length).toBeGreaterThan(0);
            expect(errors[0]?.property).toBe('priceMoney');
            expect(errors[0]?.constraints).toHaveProperty('isMoney');
        });

        it('should pass validation when the correct number of decimals is set manually', async () => {
            const product = new DecimalMoneyModel();
            product.name = 'Ice Cream';
            product.priceMoney = money('1.25');

            const errors = await product.validate();
            expect(errors).toHaveLength(0);
        });
    });
});
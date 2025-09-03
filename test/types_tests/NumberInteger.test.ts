import { NumberIntegerModel } from "../model/NumberIntegerModel";

describe('Number and Integer Decorators', () => {

    // Pruebas para el decorador @Number
    describe('@Number Decorator', () => {
        it('should pass validation for a valid number within range', async () => {
            const model = new NumberIntegerModel();
            model.decimalNumber = 50.5;
            const errors = await model.validate();
            const fieldErrors = errors.filter(e => e.property === 'decimalNumber');
            expect(fieldErrors).toHaveLength(0);
        });

        it('should fail if value is less than min', async () => {
            const model = new NumberIntegerModel();
            model.decimalNumber = 10.4;
            const errors = await model.validate();
            const fieldError = errors.find(e => e.property === 'decimalNumber');
            expect(fieldError).toBeDefined();
            expect(fieldError?.constraints).toHaveProperty('min');
        });

        it('should fail if value is greater than max', async () => {
            const model = new NumberIntegerModel();
            model.decimalNumber = 100.6;
            const errors = await model.validate();
            const fieldError = errors.find(e => e.property === 'decimalNumber');
            expect(fieldError).toBeDefined();
            expect(fieldError?.constraints).toHaveProperty('max');
        });

        it('should fail if a positive number is not positive', async () => {
            const model = new NumberIntegerModel();
            model.positiveNumber = -5;
            const errors = await model.validate();
            const fieldError = errors.find(e => e.property === 'positiveNumber');
            expect(fieldError).toBeDefined();
            expect(fieldError?.constraints).toHaveProperty('isPositive');
        });

        it('should fail if a negative number is not negative', async () => {
            const model = new NumberIntegerModel();
            model.negativeNumber = 5;
            const errors = await model.validate();
            const fieldError = errors.find(e => e.property === 'negativeNumber');
            expect(fieldError).toBeDefined();
            expect(fieldError?.constraints).toHaveProperty('isNegative');
        });
    });

    // Pruebas para el decorador @Integer
    describe('@Integer Decorator', () => {
        it('should pass validation for a valid integer', async () => {
            const model = new NumberIntegerModel();
            model.quantity = 50;
            const errors = await model.validate();
            const fieldErrors = errors.filter(e => e.property === 'quantity');
            expect(fieldErrors).toHaveLength(0);
        });

        it('should fail validation for a floating-point number', async () => {
            const model = new NumberIntegerModel();
            model.quantity = 50.5;
            const errors = await model.validate();
            const fieldError = errors.find(e => e.property === 'quantity');
            expect(fieldError).toBeDefined();
            expect(fieldError?.constraints).toHaveProperty('isInteger', 'quantity must be an integer');
        });

        it('should fail if integer is less than min', async () => {
            const model = new NumberIntegerModel();
            model.quantity = -1;
            const errors = await model.validate();
            const fieldError = errors.find(e => e.property === 'quantity');
            expect(fieldError).toBeDefined();
            expect(fieldError?.constraints).toHaveProperty('min');
        });

        it('should fail if a positive integer is zero', async () => {
            const model = new NumberIntegerModel();
            model.positiveInteger = 0; // positive requires > 0
            const errors = await model.validate();
            const fieldError = errors.find(e => e.property === 'positiveInteger');
            expect(fieldError).toBeDefined();
            expect(fieldError?.constraints).toHaveProperty('isPositive');
        });

        it('should fail if a negative integer is zero', async () => {
            const model = new NumberIntegerModel();
            model.negativeInteger = 0; // negative requires < 0
            const errors = await model.validate();
            const fieldError = errors.find(e => e.property === 'negativeInteger');
            expect(fieldError).toBeDefined();
            expect(fieldError?.constraints).toHaveProperty('isNegative');
        });
    });
});
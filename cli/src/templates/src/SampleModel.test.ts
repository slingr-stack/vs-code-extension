import { Person } from './SampleModel';

describe('Person Model', () => {
    describe('Validation Tests', () => {
        it('should validate a valid adult person', async () => {
            const personData = {
                firstName: 'John',
                lastName: 'Doe',
                email: 'john@example.com',
                age: 25,
                phoneNumber: '123-456-7890',
                additionalInfo: '<p>Some info</p>',
                isActive: true
            };

            const person = Person.fromJSON(personData);
            const errors = await person.validate();

            expect(errors.length).toBe(0);
        });

        it('should validate a valid minor person with parent email', async () => {
            const personData = {
                firstName: 'Jane',
                lastName: 'Smith',
                email: 'jane@example.com',
                age: 16,
                parentEmail: 'parent@example.com',
                additionalInfo: '<p>Minor info</p>',
                isActive: false
            };

            const person = Person.fromJSON(personData);
            const errors = await person.validate();

            expect(errors.length).toBe(0);
        });

        it('should fail validation when firstName is too short', async () => {
            const personData = {
                firstName: 'J',
                lastName: 'Doe',
                email: 'john@example.com',
                age: 25
            };

            const person = Person.fromJSON(personData);
            const errors = await person.validate();

            expect(errors.length).toBeGreaterThan(0);
            const firstNameError = errors.find(e => e.property === 'firstName');
            expect(firstNameError).toBeDefined();
            expect(firstNameError?.constraints).toHaveProperty('minLength');
        });

        it('should fail validation when firstName contains numbers', async () => {
            const personData = {
                firstName: 'John123',
                lastName: 'Doe',
                email: 'john@example.com',
                age: 25
            };

            const person = Person.fromJSON(personData);
            const errors = await person.validate();

            expect(errors.length).toBeGreaterThan(0);
            const firstNameError = errors.find(e => e.property === 'firstName');
            expect(firstNameError).toBeDefined();
            expect(firstNameError?.constraints).toHaveProperty('matches');
        });

        it('should fail validation when email is invalid', async () => {
            const personData = {
                firstName: 'John',
                lastName: 'Doe',
                email: 'invalid-email',
                age: 25
            };

            const person = Person.fromJSON(personData);
            const errors = await person.validate();

            expect(errors.length).toBeGreaterThan(0);
            const emailError = errors.find(e => e.property === 'email');
            expect(emailError).toBeDefined();
            expect(emailError?.constraints).toHaveProperty('isEmail');
        });

        it('should fail validation when age is negative', async () => {
            const personData = {
                firstName: 'John',
                lastName: 'Doe',
                email: 'john@example.com',
                age: -5
            };

            const person = Person.fromJSON(personData);
            const errors = await person.validate();

            expect(errors.length).toBeGreaterThan(0);
            const ageError = errors.find(e => e.property === 'age');
            expect(ageError).toBeDefined();
            expect(ageError?.constraints).toHaveProperty('invalidAge');
        });

        it('should fail validation when age is too high', async () => {
            const personData = {
                firstName: 'John',
                lastName: 'Doe',
                email: 'john@example.com',
                age: 150
            };

            const person = Person.fromJSON(personData);
            const errors = await person.validate();

            expect(errors.length).toBeGreaterThan(0);
            const ageError = errors.find(e => e.property === 'age');
            expect(ageError).toBeDefined();
            expect(ageError?.constraints).toHaveProperty('invalidAge');
        });

        it('should require parentEmail for minors', async () => {
            const personData = {
                firstName: 'Jane',
                lastName: 'Smith',
                email: 'jane@example.com',
                age: 16
                // parentEmail missing
            };

            const person = Person.fromJSON(personData);
            const errors = await person.validate();

            expect(errors.length).toBeGreaterThan(0);
            const parentEmailError = errors.find(e => e.property === 'parentEmail');
            expect(parentEmailError).toBeDefined();
            expect(parentEmailError?.constraints).toHaveProperty('isNotEmpty');
        });

        it('should not require parentEmail for adults', async () => {
            const personData = {
                firstName: 'John',
                lastName: 'Doe',
                email: 'john@example.com',
                age: 25
                // parentEmail not provided
            };

            const person = Person.fromJSON(personData);
            const errors = await person.validate();

            // Should not have parentEmail error
            const parentEmailError = errors.find(e => e.property === 'parentEmail');
            expect(parentEmailError).toBeUndefined();
        });
    });

    describe('JSON Serialization Tests', () => {
        it('should exclude internalId from JSON output', () => {
            const personData = {
                firstName: 'John',
                lastName: 'Doe',
                email: 'john@example.com',
                age: 25,
                internalId: 'secret-123',
                isActive: true
            };

            const person = Person.fromJSON(personData);
            const json = person.toJSON();

            expect(json).not.toHaveProperty('internalId');
            expect(json).toHaveProperty('firstName', 'John');
            expect(json).toHaveProperty('lastName', 'Doe');
            expect(json).toHaveProperty('email', 'john@example.com');
            expect(json).toHaveProperty('age', 25);
            expect(json).toHaveProperty('isActive', true);
        });

        it('should include phoneNumber for adults', () => {
            const personData = {
                firstName: 'John',
                lastName: 'Doe',
                email: 'john@example.com',
                age: 25,
                phoneNumber: '123-456-7890'
            };

            const person = Person.fromJSON(personData);
            const json = person.toJSON();

            expect(json).toHaveProperty('phoneNumber', '123-456-7890');
        });

        it('should exclude phoneNumber for minors', () => {
            const personData = {
                firstName: 'Jane',
                lastName: 'Smith',
                email: 'jane@example.com',
                age: 16,
                parentEmail: 'parent@example.com',
                phoneNumber: '123-456-7890'
            };

            const person = Person.fromJSON(personData);
            const json = person.toJSON();

            expect(json).not.toHaveProperty('phoneNumber');
            expect(json).toHaveProperty('firstName', 'Jane');
            expect(json).toHaveProperty('parentEmail', 'parent@example.com');
        });
    });

    describe('Field Type Tests', () => {
        it('should handle boolean field correctly', async () => {
            const personData = {
                firstName: 'John',
                lastName: 'Doe',
                email: 'john@example.com',
                age: 25,
                isActive: true
            };

            const person = Person.fromJSON(personData);
            const errors = await person.validate();

            expect(errors.length).toBe(0);
            expect(person.isActive).toBe(true);
        });

        it('should handle HTML field correctly', async () => {
            const personData = {
                firstName: 'John',
                lastName: 'Doe',
                email: 'john@example.com',
                age: 25,
                additionalInfo: '<p>This is <strong>HTML</strong> content</p>'
            };

            const person = Person.fromJSON(personData);
            const errors = await person.validate();

            expect(errors.length).toBe(0);
            expect(person.additionalInfo).toBe('<p>This is <strong>HTML</strong> content</p>');
        });
    });

    describe('Edge Cases', () => {
        it('should handle missing required fields', async () => {
            const personData = {
                // Missing firstName, lastName, age
                email: 'john@example.com'
            };

            const person = Person.fromJSON(personData);
            const errors = await person.validate();

            expect(errors.length).toBeGreaterThan(0);

            const firstNameError = errors.find(e => e.property === 'firstName');
            const lastNameError = errors.find(e => e.property === 'lastName');
            const ageError = errors.find(e => e.property === 'age');

            expect(firstNameError).toBeDefined();
            expect(lastNameError).toBeDefined();
            expect(ageError).toBeDefined();
        });

        it('should handle boundary age values', async () => {
            const personData = {
                firstName: 'John',
                lastName: 'Doe',
                email: 'john@example.com',
                age: 18 // Boundary between minor and adult
            };

            const person = Person.fromJSON(personData);
            const errors = await person.validate();

            expect(errors.length).toBe(0);

            // At 18, parentEmail should not be required
            const parentEmailError = errors.find(e => e.property === 'parentEmail');
            expect(parentEmailError).toBeUndefined();
        });
    });
});
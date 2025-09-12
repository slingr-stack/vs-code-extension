import { 
    TypeORMSqlDataSource, 
    PersistentModel, 
    Field, 
    Model, 
    Decimal, 
    Money, 
    DateTimeRange, 
    DateTimeRangeValue,
    Text,
    DecimalNumber,
    MoneyNumber,
    dateTimeRange
} from "../../index";
import { validateSync } from 'class-validator';
import number from 'financial-number';
import { MODEL_FIELDS } from "../../src/model/metadata";

// Test model for complex type persistence
@Model({
    docs: "Test model for complex types: Decimal, Money, and DateTimeRange",
})
class ComplexTypesModel extends PersistentModel {
    @Field({
        required: true,
    })
    @Text()
    name!: string;

    @Field({})
    @Decimal({
        decimals: 2,
        roundingType: 'truncate',
        min: '0.01',
        max: '1000.00',
    })
    priceDecimal?: DecimalNumber | undefined;

    @Field({})
    @Money({
        decimals: 2,
        roundingType: 'roundHalfToEven',
        positive: true,
        min: '0.01',
        max: '10000.00'
    })
    priceMoney?: MoneyNumber | undefined;

    @Field({
        required: true,
    })
    @DateTimeRange({
        from: false,
        to: false,
    })
    activeRange!: DateTimeRangeValue;

    @Field({})
    @DateTimeRange({
        from: true,
        to: true,
    })
    flexibleRange?: DateTimeRangeValue | undefined;
}

describe("Complex Types Persistence in SQL Databases", () => {
    let dataSource: TypeORMSqlDataSource;
    let testEntity: ComplexTypesModel;

    beforeAll(async () => {
        // Create a TypeORM data source with SQLite for testing
        dataSource = new TypeORMSqlDataSource({
            type: "sqlite",
            filename: ":memory:",
            managed: true,
            synchronize: true,
            logging: false
        });

        // Configure the ComplexTypesModel with the data source
        const modelOptions = { dataSource };
        Reflect.defineMetadata("model:dataSource", dataSource, ComplexTypesModel);
        dataSource.configureModel(ComplexTypesModel, modelOptions);

        // Configure all fields with the data source
        const fieldNames = Reflect.getMetadata(MODEL_FIELDS, ComplexTypesModel) || [];
        fieldNames.forEach((fieldName: string) => {
            const fieldType = Reflect.getMetadata('field:type', ComplexTypesModel.prototype, fieldName);
            const fieldTypeOptions = Reflect.getMetadata('field:type:options', ComplexTypesModel.prototype, fieldName);
            const fieldRequired = Reflect.getMetadata('field:required', ComplexTypesModel.prototype, fieldName);

            if (fieldType) {
                dataSource.configureField(
                    ComplexTypesModel.prototype,
                    fieldName,
                    fieldType,
                    {
                        ...fieldTypeOptions,
                        required: fieldRequired
                    }
                );
            }
        });

        // Initialize the data source
        await dataSource.initialize(dataSource.getOptions());
    });

    beforeEach(() => {
        testEntity = new ComplexTypesModel();
        testEntity.name = "Complex Types Test";
        
        // Set up Decimal value
        testEntity.priceDecimal = number("123.45");
        
        // Set up Money value
        testEntity.priceMoney = number("999.99");
        
        // Set up required DateTimeRange
        const activeRange = dateTimeRange('2024-01-01T00:00:00Z', '2024-12-31T23:59:59Z');
        testEntity.activeRange = activeRange;
        
        // Set up optional DateTimeRange
        const flexibleRange = dateTimeRange('2024-06-01T00:00:00Z', '2024-08-31T23:59:59Z');
        testEntity.flexibleRange = flexibleRange;
    });

    afterAll(async () => {
        if (dataSource.isConnected()) {
            await dataSource.disconnect();
        }
    });

    describe("Decimal Type Persistence", () => {
        it("should save and retrieve Decimal values correctly", async () => {
            const savedEntity = await dataSource.save(testEntity);
            
            expect(savedEntity.id).toBeDefined();
            expect(savedEntity.priceDecimal).toBeDefined();
            expect(savedEntity.priceDecimal!.toString()).toBe("123.45");
            
            // Verify the value is a FinancialNumber object
            expect(typeof savedEntity.priceDecimal!.plus).toBe('function');
            expect(savedEntity.priceDecimal!.plus("1.00").toString()).toBe("124.45");
        });

        it("should handle null Decimal values", async () => {
            testEntity.priceDecimal = undefined;
            
            const savedEntity = await dataSource.save(testEntity);
            
            expect(savedEntity.priceDecimal).toBeUndefined();
        });

        it("should persist Decimal precision correctly", async () => {
            testEntity.priceDecimal = number("123.456");  // Will be truncated to 2 decimals
            
            const savedEntity = await dataSource.save(testEntity);
            
            // Should be truncated based on decorator config
            expect(savedEntity.priceDecimal!.toString()).toBe("123.45");
        });

        it("should retrieve Decimal from database with proper type", async () => {
            const savedEntity = await dataSource.save(testEntity);
            const retrievedEntity = await dataSource.findOneById(ComplexTypesModel, savedEntity.id);
            
            expect(retrievedEntity).not.toBeNull();
            expect(retrievedEntity!.priceDecimal).toBeDefined();
            expect(typeof retrievedEntity!.priceDecimal!.toString).toBe('function');
            expect(typeof retrievedEntity!.priceDecimal!.plus).toBe('function');
            expect(retrievedEntity!.priceDecimal!.toString()).toBe("123.45");
        });
    });

    describe("Money Type Persistence", () => {
        it("should save and retrieve Money values correctly", async () => {
            const savedEntity = await dataSource.save(testEntity);
            
            expect(savedEntity.id).toBeDefined();
            expect(savedEntity.priceMoney).toBeDefined();
            expect(savedEntity.priceMoney!.toString()).toBe("999.99");
            
            // Verify the value is a FinancialNumber object
            expect(typeof savedEntity.priceMoney!.plus).toBe('function');
            expect(savedEntity.priceMoney!.plus("0.01").toString()).toBe("1000.00");
        });

        it("should handle null Money values", async () => {
            testEntity.priceMoney = undefined;
            
            const savedEntity = await dataSource.save(testEntity);
            
            expect(savedEntity.priceMoney).toBeUndefined();
        });

        it("should persist Money with correct rounding", async () => {
            testEntity.priceMoney = number("123.456");  // Will be rounded to 2 decimals
            
            const savedEntity = await dataSource.save(testEntity);
            
            // Should be rounded based on decorator config (roundHalfToEven)
            expect(savedEntity.priceMoney!.toString()).toBe("123.46");
        });

        it("should retrieve Money from database with proper type", async () => {
            const savedEntity = await dataSource.save(testEntity);
            const retrievedEntity = await dataSource.findOneById(ComplexTypesModel, savedEntity.id);
            
            expect(retrievedEntity).not.toBeNull();
            expect(retrievedEntity!.priceMoney).toBeDefined();
            expect(typeof retrievedEntity!.priceMoney!.toString).toBe('function');
            expect(typeof retrievedEntity!.priceMoney!.plus).toBe('function');
            expect(retrievedEntity!.priceMoney!.toString()).toBe("999.99");
        });
    });

    describe("DateTimeRange Type Persistence", () => {
        it("should save and retrieve DateTimeRange values correctly", async () => {
            const savedEntity = await dataSource.save(testEntity);
            
            expect(savedEntity.id).toBeDefined();
            expect(savedEntity.activeRange).toBeDefined();
            expect(savedEntity.activeRange.from).toBeDefined();
            expect(savedEntity.activeRange.to).toBeDefined();
            
            // Verify dates are preserved (use UTC methods for timezone-independent testing)
            expect(savedEntity.activeRange.from!.getUTCFullYear()).toBe(2024);
            expect(savedEntity.activeRange.from!.getUTCMonth()).toBe(0); // January
            expect(savedEntity.activeRange.to!.getUTCFullYear()).toBe(2024);
            expect(savedEntity.activeRange.to!.getUTCMonth()).toBe(11); // December
        });

        it("should handle optional DateTimeRange values", async () => {
            const savedEntity = await dataSource.save(testEntity);
            
            expect(savedEntity.flexibleRange).toBeDefined();
            expect(savedEntity.flexibleRange!.from).toBeDefined();
            expect(savedEntity.flexibleRange!.to).toBeDefined();
            expect(savedEntity.flexibleRange!.from!.getUTCMonth()).toBe(5); // June
            expect(savedEntity.flexibleRange!.to!.getUTCMonth()).toBe(7); // August
        });

        it("should handle null DateTimeRange values", async () => {
            testEntity.flexibleRange = undefined;
            
            const savedEntity = await dataSource.save(testEntity);
            
            expect(savedEntity.flexibleRange).toBeUndefined();
        });

        it("should handle partial DateTimeRange values (open ranges)", async () => {
            // Create a range with only 'from' date
            const partialRange = new DateTimeRangeValue();
            partialRange.from = new Date('2024-01-01T00:00:00Z');
            // partialRange.to remains undefined
            testEntity.flexibleRange = partialRange;
            
            const savedEntity = await dataSource.save(testEntity);
            
            expect(savedEntity.flexibleRange).toBeDefined();
            expect(savedEntity.flexibleRange!.from).toBeDefined();
            expect(savedEntity.flexibleRange!.to).toBeUndefined();
        });

        it("should retrieve DateTimeRange from database with proper type", async () => {
            const savedEntity = await dataSource.save(testEntity);
            const retrievedEntity = await dataSource.findOneById(ComplexTypesModel, savedEntity.id);
            
            expect(retrievedEntity).not.toBeNull();
            expect(retrievedEntity!.activeRange).toBeDefined();
            expect(retrievedEntity!.activeRange).toBeInstanceOf(DateTimeRangeValue);
            expect(retrievedEntity!.activeRange.from).toBeInstanceOf(Date);
            expect(retrievedEntity!.activeRange.to).toBeInstanceOf(Date);
            
            // Verify date values are correct
            expect(retrievedEntity!.activeRange.from!.getTime()).toBe(new Date('2024-01-01T00:00:00Z').getTime());
            expect(retrievedEntity!.activeRange.to!.getTime()).toBe(new Date('2024-12-31T23:59:59Z').getTime());
        });
    });

    describe("Complex Types in Queries", () => {
        let savedEntity1: ComplexTypesModel;
        let savedEntity2: ComplexTypesModel;

        beforeEach(async () => {
            // Clean up any existing data
            const allEntities = await dataSource.find(ComplexTypesModel);
            for (const entity of allEntities) {
                await dataSource.delete(ComplexTypesModel, entity.id);
            }
            
            // Create first test entity
            const entity1 = new ComplexTypesModel();
            entity1.name = "Entity 1";
            entity1.priceDecimal = number("100.00");
            entity1.priceMoney = number("200.00");

            const range1 = dateTimeRange('2024-01-01T00:00:00Z', '2024-06-30T23:59:59Z');
            entity1.activeRange = range1;
            
            savedEntity1 = await dataSource.save(entity1);

            // Create second test entity
            const entity2 = new ComplexTypesModel();
            entity2.name = "Entity 2";
            entity2.priceDecimal = number("150.00");
            entity2.priceMoney = number("300.00");

            const range2 = dateTimeRange('2024-07-01T00:00:00Z', '2024-12-31T23:59:59Z');
            entity2.activeRange = range2;
            
            savedEntity2 = await dataSource.save(entity2);
        });

        it("should find all entities with complex types loaded", async () => {
            const entities = await dataSource.find(ComplexTypesModel);
            
            expect(entities).toHaveLength(2);
            
            for (const entity of entities) {
                expect(entity.priceDecimal).toBeDefined();
                expect(entity.priceMoney).toBeDefined();
                expect(entity.activeRange).toBeDefined();
                expect(entity.activeRange).toBeInstanceOf(DateTimeRangeValue);
                expect(typeof entity.priceDecimal!.toString).toBe('function');
                expect(typeof entity.priceMoney!.toString).toBe('function');
            }
        });

        it("should find entities by criteria with complex types loaded", async () => {
            const entities = await dataSource.find(ComplexTypesModel, { name: "Entity 1" });
            
            expect(entities).toHaveLength(1);
            const entity = entities[0]!;
            expect(entity.name).toBe("Entity 1");
            expect(entity.priceDecimal!.toString()).toBe("100.00");
            expect(entity.priceMoney!.toString()).toBe("200.00");
            expect(entity.activeRange.from!.getUTCMonth()).toBe(0); // January
        });
    });

    describe("Complex Types Updates", () => {
        let savedEntity: ComplexTypesModel;

        beforeEach(async () => {
            savedEntity = await dataSource.save(testEntity);
        });

        it("should update Decimal values correctly", async () => {
            savedEntity.priceDecimal = number("456.78");
            
            const updatedEntity = await dataSource.save(savedEntity);
            
            expect(updatedEntity.priceDecimal!.toString()).toBe("456.78");
            
            // Verify in database
            const retrievedEntity = await dataSource.findOneById(ComplexTypesModel, savedEntity.id);
            expect(retrievedEntity!.priceDecimal!.toString()).toBe("456.78");
        });

        it("should update Money values correctly", async () => {
            savedEntity.priceMoney = number("555.55");
            
            const updatedEntity = await dataSource.save(savedEntity);
            
            expect(updatedEntity.priceMoney!.toString()).toBe("555.55");
            
            // Verify in database
            const retrievedEntity = await dataSource.findOneById(ComplexTypesModel, savedEntity.id);
            expect(retrievedEntity!.priceMoney!.toString()).toBe("555.55");
        });

        it("should update DateTimeRange values correctly", async () => {
            const newRange = dateTimeRange('2025-01-01T00:00:00Z', '2025-12-31T23:59:59Z');
            savedEntity.activeRange = newRange;
            
            const updatedEntity = await dataSource.save(savedEntity);
            
            expect(updatedEntity.activeRange.from!.getUTCFullYear()).toBe(2025);
            expect(updatedEntity.activeRange.to!.getUTCFullYear()).toBe(2025);
            
            // Verify in database
            const retrievedEntity = await dataSource.findOneById(ComplexTypesModel, savedEntity.id);
            expect(retrievedEntity!.activeRange.from!.getUTCFullYear()).toBe(2025);
            expect(retrievedEntity!.activeRange.to!.getUTCFullYear()).toBe(2025);
        });
    });

    describe("Complex Types Validation", () => {
        it("should validate Decimal constraints", async () => {
            // Test minimum value constraint
            testEntity.priceDecimal = number("0.001"); // Below minimum
            
            const errors = validateSync(testEntity);
            const decimalErrors = errors.filter(e => e.property === 'priceDecimal');
            expect(decimalErrors.length).toBeGreaterThan(0);
        });

        it("should validate Money constraints", async () => {
            // Test maximum value constraint
            testEntity.priceMoney = number("20000.00"); // Above maximum
            
            const errors = validateSync(testEntity);
            const moneyErrors = errors.filter(e => e.property === 'priceMoney');
            expect(moneyErrors.length).toBeGreaterThan(0);
        });

        it("should validate DateTimeRange constraints", async () => {
            // Test invalid range (from > to)
            const invalidRange = dateTimeRange('2024-12-31T23:59:59Z', '2024-01-01T00:00:00Z');
            testEntity.activeRange = invalidRange;
            
            const errors = validateSync(testEntity);
            const rangeErrors = errors.filter(e => e.property === 'activeRange');
            expect(rangeErrors.length).toBeGreaterThan(0);
        });
    });

    describe("Complex Types JSON Serialization", () => {
        it("should serialize and deserialize complex types correctly", async () => {
            const savedEntity = await dataSource.save(testEntity);
            
            // Serialize to JSON
            const jsonString = JSON.stringify(savedEntity);
            expect(jsonString).toContain('"name":"Complex Types Test"');
            expect(jsonString).toContain('"123.45"'); // Decimal value
            expect(jsonString).toContain('"999.99"'); // Money value
            expect(jsonString).toContain('"2024-01-01T00:00:00.000Z"'); // DateTimeRange from
            
            // Parse back from JSON
            const parsedData = JSON.parse(jsonString);
            expect(parsedData.name).toBe("Complex Types Test");
            expect(parsedData.priceDecimal).toBe("123.45");
            expect(parsedData.priceMoney).toBe("999.99");
            expect(parsedData.activeRange.from).toBe("2024-01-01T00:00:00.000Z");
        });
    });
});

import { 
    TypeORMSqlDataSource, 
    PersistentModel, 
    Field, 
    Model, 
    DateTimeRange, 
    DateTimeRangeType,
    Text
} from "../../index";

// Test model for DateTimeRange array persistence
@Model({
    docs: "Test model for DateTimeRange array persistence in SQL databases",
})
class DateTimeRangeArrayPersistenceModel extends PersistentModel {
    @Field({
        required: true,
    })
    @Text({ minLength: 1, maxLength: 100 })
    name!: string;

    @Field({})
    @DateTimeRange({ from: true, to: true })
    dateRanges?: DateTimeRangeType[];

    @Field({
        required: true,
    })
    @DateTimeRange({ from: false, to: false })
    requiredDateRanges!: DateTimeRangeType[];

    @Field({})
    @DateTimeRange({ from: true, to: false })
    mixedDateRanges?: DateTimeRangeType[];
}

describe("DateTimeRange Array Persistence in SQL Databases", () => {
    let dataSource: TypeORMSqlDataSource;
    let testEntity: DateTimeRangeArrayPersistenceModel;

    beforeAll(async () => {
        // Create a TypeORM data source with SQLite for testing
        dataSource = new TypeORMSqlDataSource({
            type: "sqlite",
            filename: ":memory:",
            managed: true,
            synchronize: true,
            logging: false
        });

        // Configure the DateTimeRangeArrayPersistenceModel with the data source
        const modelOptions = { dataSource };
        Reflect.defineMetadata("model:dataSource", dataSource, DateTimeRangeArrayPersistenceModel);
        dataSource.configureModel(DateTimeRangeArrayPersistenceModel, modelOptions);

        // Configure all fields with the data source
        const fieldNames = Reflect.getMetadata('model:fields', DateTimeRangeArrayPersistenceModel) || [];
        fieldNames.forEach((fieldName: string) => {
            const fieldType = Reflect.getMetadata('field:type', DateTimeRangeArrayPersistenceModel.prototype, fieldName);
            const fieldTypeOptions = Reflect.getMetadata('field:type:options', DateTimeRangeArrayPersistenceModel.prototype, fieldName);
            const fieldRequired = Reflect.getMetadata('field:required', DateTimeRangeArrayPersistenceModel.prototype, fieldName);

            if (fieldType) {
                dataSource.configureField(
                    DateTimeRangeArrayPersistenceModel.prototype,
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
        testEntity = new DateTimeRangeArrayPersistenceModel();
        testEntity.name = "DateTimeRange Array Test";
        
        // Set up required DateTimeRange array
        const range1 = new DateTimeRangeType();
        range1.from = new Date('2024-01-01T00:00:00Z');
        range1.to = new Date('2024-01-31T23:59:59Z');
        
        const range2 = new DateTimeRangeType();
        range2.from = new Date('2024-02-01T00:00:00Z');
        range2.to = new Date('2024-02-28T23:59:59Z');
        
        testEntity.requiredDateRanges = [range1, range2];
        
        // Set up optional DateTimeRange array
        const range3 = new DateTimeRangeType();
        range3.from = new Date('2024-03-01T00:00:00Z');
        range3.to = new Date('2024-03-31T23:59:59Z');
        
        const range4 = new DateTimeRangeType();
        range4.from = new Date('2024-04-01T00:00:00Z');
        range4.to = new Date('2024-04-30T23:59:59Z');
        
        testEntity.dateRanges = [range3, range4];
        
        // Set up mixed DateTimeRange array (some with openStart)
        const range5 = new DateTimeRangeType();
        // range5.from remains undefined for open start
        range5.to = new Date('2024-05-31T23:59:59Z');
        
        const range6 = new DateTimeRangeType();
        range6.from = new Date('2024-06-01T00:00:00Z');
        range6.to = new Date('2024-06-30T23:59:59Z');
        
        testEntity.mixedDateRanges = [range5, range6];
    });

    afterAll(async () => {
        if (dataSource.isConnected()) {
            await dataSource.disconnect();
        }
    });

    describe("Basic Array Persistence", () => {
        it("should save and retrieve DateTimeRange arrays correctly", async () => {
            const savedEntity = await dataSource.save(testEntity);
            
            expect(savedEntity.id).toBeDefined();
            expect(savedEntity.name).toBe("DateTimeRange Array Test");
            
            // Check required array
            expect(Array.isArray(savedEntity.requiredDateRanges)).toBe(true);
            expect(savedEntity.requiredDateRanges).toHaveLength(2);
            expect(savedEntity.requiredDateRanges[0]).toBeInstanceOf(DateTimeRangeType);
            expect(savedEntity.requiredDateRanges[0]!.from).toBeInstanceOf(Date);
            expect(savedEntity.requiredDateRanges[0]!.to).toBeInstanceOf(Date);
            expect(savedEntity.requiredDateRanges[0]!.from!.toISOString()).toBe('2024-01-01T00:00:00.000Z');
            expect(savedEntity.requiredDateRanges[0]!.to!.toISOString()).toBe('2024-01-31T23:59:59.000Z');
            
            expect(savedEntity.requiredDateRanges[1]!.from!.toISOString()).toBe('2024-02-01T00:00:00.000Z');
            expect(savedEntity.requiredDateRanges[1]!.to!.toISOString()).toBe('2024-02-28T23:59:59.000Z');
            
            // Check optional array
            expect(Array.isArray(savedEntity.dateRanges)).toBe(true);
            expect(savedEntity.dateRanges).toHaveLength(2);
            expect(savedEntity.dateRanges![0]).toBeInstanceOf(DateTimeRangeType);
            expect(savedEntity.dateRanges![0]!.from!.toISOString()).toBe('2024-03-01T00:00:00.000Z');
            expect(savedEntity.dateRanges![0]!.to!.toISOString()).toBe('2024-03-31T23:59:59.000Z');
            
            // Check mixed array (with open starts)
            expect(Array.isArray(savedEntity.mixedDateRanges)).toBe(true);
            expect(savedEntity.mixedDateRanges).toHaveLength(2);
            expect(savedEntity.mixedDateRanges![0]!.from).toBeUndefined(); // open start
            expect(savedEntity.mixedDateRanges![0]!.to!.toISOString()).toBe('2024-05-31T23:59:59.000Z');
            expect(savedEntity.mixedDateRanges![1]!.from!.toISOString()).toBe('2024-06-01T00:00:00.000Z');
            expect(savedEntity.mixedDateRanges![1]!.to!.toISOString()).toBe('2024-06-30T23:59:59.000Z');
        });

        it("should retrieve saved entity by ID and maintain DateTimeRange array integrity", async () => {
            const savedEntity = await dataSource.save(testEntity);
            const retrievedEntity = await dataSource.findOneById(DateTimeRangeArrayPersistenceModel, savedEntity.id!);
            
            expect(retrievedEntity).toBeDefined();
            expect(retrievedEntity!.id).toBe(savedEntity.id);
            expect(retrievedEntity!.name).toBe("DateTimeRange Array Test");
            
            // Verify required array integrity
            expect(Array.isArray(retrievedEntity!.requiredDateRanges)).toBe(true);
            expect(retrievedEntity!.requiredDateRanges).toHaveLength(2);
            expect(retrievedEntity!.requiredDateRanges[0]).toBeInstanceOf(DateTimeRangeType);
            expect(retrievedEntity!.requiredDateRanges[0]!.from).toBeInstanceOf(Date);
            expect(retrievedEntity!.requiredDateRanges[0]!.to).toBeInstanceOf(Date);
            
            // Verify optional array integrity
            expect(Array.isArray(retrievedEntity!.dateRanges)).toBe(true);
            expect(retrievedEntity!.dateRanges).toHaveLength(2);
            expect(retrievedEntity!.dateRanges![0]).toBeInstanceOf(DateTimeRangeType);
            
            // Verify mixed array integrity
            expect(Array.isArray(retrievedEntity!.mixedDateRanges)).toBe(true);
            expect(retrievedEntity!.mixedDateRanges).toHaveLength(2);
            expect(retrievedEntity!.mixedDateRanges![0]!.from).toBeUndefined(); // open start preserved
            expect(retrievedEntity!.mixedDateRanges![0]!.to).toBeInstanceOf(Date);
        });
    });

    describe("Edge Cases and Empty Arrays", () => {
        it("should handle empty DateTimeRange arrays", async () => {
            testEntity.dateRanges = [];
            testEntity.requiredDateRanges = [];
            testEntity.mixedDateRanges = [];
            
            const savedEntity = await dataSource.save(testEntity);
            
            expect(savedEntity.dateRanges).toEqual([]);
            expect(savedEntity.requiredDateRanges).toEqual([]);
            expect(savedEntity.mixedDateRanges).toEqual([]);
            
            const retrievedEntity = await dataSource.findOneById(DateTimeRangeArrayPersistenceModel, savedEntity.id!);
            expect(retrievedEntity!.dateRanges).toEqual([]);
            expect(retrievedEntity!.requiredDateRanges).toEqual([]);
            expect(retrievedEntity!.mixedDateRanges).toEqual([]);
        });

        it("should handle undefined optional DateTimeRange arrays", async () => {
            delete (testEntity as any).dateRanges;
            delete (testEntity as any).mixedDateRanges;
            
            const savedEntity = await dataSource.save(testEntity);
            
            // When properties are deleted, they become empty arrays in the relational model
            expect(savedEntity.dateRanges).toEqual([]);
            expect(savedEntity.mixedDateRanges).toEqual([]);
            expect(Array.isArray(savedEntity.requiredDateRanges)).toBe(true);
            expect(savedEntity.requiredDateRanges).toHaveLength(2);
            
            const retrievedEntity = await dataSource.findOneById(DateTimeRangeArrayPersistenceModel, savedEntity.id!);
            expect(retrievedEntity!.dateRanges).toEqual([]);
            expect(retrievedEntity!.mixedDateRanges).toEqual([]);
            expect(Array.isArray(retrievedEntity!.requiredDateRanges)).toBe(true);
        });

        it("should handle arrays with single DateTimeRange element", async () => {
            const singleRange = new DateTimeRangeType();
            singleRange.from = new Date('2024-07-01T00:00:00Z');
            singleRange.to = new Date('2024-07-31T23:59:59Z');
            
            testEntity.dateRanges = [singleRange];
            testEntity.requiredDateRanges = [singleRange];
            testEntity.mixedDateRanges = [singleRange];
            
            const savedEntity = await dataSource.save(testEntity);
            
            expect(savedEntity.dateRanges).toHaveLength(1);
            expect(savedEntity.requiredDateRanges).toHaveLength(1);
            expect(savedEntity.mixedDateRanges).toHaveLength(1);
            
            expect(savedEntity.dateRanges![0]!.from!.toISOString()).toBe('2024-07-01T00:00:00.000Z');
            expect(savedEntity.dateRanges![0]!.to!.toISOString()).toBe('2024-07-31T23:59:59.000Z');
            
            const retrievedEntity = await dataSource.findOneById(DateTimeRangeArrayPersistenceModel, savedEntity.id!);
            expect(retrievedEntity!.dateRanges).toHaveLength(1);
            expect(retrievedEntity!.dateRanges![0]).toBeInstanceOf(DateTimeRangeType);
            expect(retrievedEntity!.dateRanges![0]!.from).toBeInstanceOf(Date);
            expect(retrievedEntity!.dateRanges![0]!.to).toBeInstanceOf(Date);
        });
    });

    describe("Complex Array Operations", () => {
        it("should handle large DateTimeRange arrays", async () => {
            const manyRanges: DateTimeRangeType[] = [];
            
            // Create 10 DateTimeRange objects
            for (let i = 0; i < 10; i++) {
                const range = new DateTimeRangeType();
                range.from = new Date(`2024-${String(i + 1).padStart(2, '0')}-01T00:00:00Z`);
                range.to = new Date(`2024-${String(i + 1).padStart(2, '0')}-28T23:59:59Z`);
                manyRanges.push(range);
            }
            
            testEntity.dateRanges = manyRanges;
            testEntity.requiredDateRanges = manyRanges.slice(0, 5); // First 5 for required
            
            const savedEntity = await dataSource.save(testEntity);
            
            expect(savedEntity.dateRanges).toHaveLength(10);
            expect(savedEntity.requiredDateRanges).toHaveLength(5);
            
            const retrievedEntity = await dataSource.findOneById(DateTimeRangeArrayPersistenceModel, savedEntity.id!);
            expect(retrievedEntity!.dateRanges).toHaveLength(10);
            expect(retrievedEntity!.requiredDateRanges).toHaveLength(5);
            
            // Verify first and last elements
            expect(retrievedEntity!.dateRanges![0]!.from!.toISOString()).toBe('2024-01-01T00:00:00.000Z');
            expect(retrievedEntity!.dateRanges![9]!.from!.toISOString()).toBe('2024-10-01T00:00:00.000Z');
        });

        it("should handle arrays with mixed open/closed DateTimeRanges", async () => {
            const mixedRanges: DateTimeRangeType[] = [];
            
            // Fully closed range
            const closedRange = new DateTimeRangeType();
            closedRange.from = new Date('2024-01-01T00:00:00Z');
            closedRange.to = new Date('2024-01-31T23:59:59Z');
            mixedRanges.push(closedRange);
            
            // Open start range
            const openStartRange = new DateTimeRangeType();
            // openStartRange.from = undefined;
            openStartRange.to = new Date('2024-02-28T23:59:59Z');
            mixedRanges.push(openStartRange);
            
            // Open end range
            const openEndRange = new DateTimeRangeType();
            openEndRange.from = new Date('2024-03-01T00:00:00Z');
            // openEndRange.to = undefined;
            mixedRanges.push(openEndRange);
            
            // Fully open range
            const fullyOpenRange = new DateTimeRangeType();
            // fullyOpenRange.from = undefined;
            // fullyOpenRange.to = undefined;
            mixedRanges.push(fullyOpenRange);
            
            testEntity.dateRanges = mixedRanges;
            testEntity.requiredDateRanges = [closedRange]; // Only use closed range for required field
            
            const savedEntity = await dataSource.save(testEntity);
            
            expect(savedEntity.dateRanges).toHaveLength(4);
            
            // Verify closed range
            expect(savedEntity.dateRanges![0]!.from).toBeInstanceOf(Date);
            expect(savedEntity.dateRanges![0]!.to).toBeInstanceOf(Date);
            
            // Verify open start range
            expect(savedEntity.dateRanges![1]!.from).toBeUndefined();
            expect(savedEntity.dateRanges![1]!.to).toBeInstanceOf(Date);
            
            // Verify open end range
            expect(savedEntity.dateRanges![2]!.from).toBeInstanceOf(Date);
            expect(savedEntity.dateRanges![2]!.to).toBeUndefined();
            
            // Verify fully open range
            expect(savedEntity.dateRanges![3]!.from).toBeUndefined();
            expect(savedEntity.dateRanges![3]!.to).toBeUndefined();
            
            const retrievedEntity = await dataSource.findOneById(DateTimeRangeArrayPersistenceModel, savedEntity.id!);
            
            // Verify persistence maintained all the open/closed states
            expect(retrievedEntity!.dateRanges![0]!.from).toBeInstanceOf(Date);
            expect(retrievedEntity!.dateRanges![0]!.to).toBeInstanceOf(Date);
            expect(retrievedEntity!.dateRanges![1]!.from).toBeUndefined();
            expect(retrievedEntity!.dateRanges![1]!.to).toBeInstanceOf(Date);
            expect(retrievedEntity!.dateRanges![2]!.from).toBeInstanceOf(Date);
            expect(retrievedEntity!.dateRanges![2]!.to).toBeUndefined();
            expect(retrievedEntity!.dateRanges![3]!.from).toBeUndefined();
            expect(retrievedEntity!.dateRanges![3]!.to).toBeUndefined();
        });
    });

    describe("Update Operations", () => {
        it("should update DateTimeRange arrays correctly", async () => {
            // Save initial entity
            const savedEntity = await dataSource.save(testEntity);
            
            // Update the arrays
            const newRange1 = new DateTimeRangeType();
            newRange1.from = new Date('2024-08-01T00:00:00Z');
            newRange1.to = new Date('2024-08-31T23:59:59Z');
            
            const newRange2 = new DateTimeRangeType();
            newRange2.from = new Date('2024-09-01T00:00:00Z');
            newRange2.to = new Date('2024-09-30T23:59:59Z');
            
            savedEntity.dateRanges = [newRange1];
            savedEntity.requiredDateRanges = [newRange1, newRange2];
            savedEntity.mixedDateRanges = []; // Explicitly set to empty array
            
            const updatedEntity = await dataSource.save(savedEntity);
            
            expect(updatedEntity.dateRanges).toHaveLength(1);
            expect(updatedEntity.requiredDateRanges).toHaveLength(2);
            expect(updatedEntity.mixedDateRanges).toEqual([]);
            
            expect(updatedEntity.dateRanges![0]!.from!.toISOString()).toBe('2024-08-01T00:00:00.000Z');
            expect(updatedEntity.requiredDateRanges[1]!.from!.toISOString()).toBe('2024-09-01T00:00:00.000Z');
            
            // Verify update persistence
            const retrievedEntity = await dataSource.findOneById(DateTimeRangeArrayPersistenceModel, updatedEntity.id!);
            expect(retrievedEntity!.dateRanges).toHaveLength(1);
            expect(retrievedEntity!.requiredDateRanges).toHaveLength(2);
            expect(retrievedEntity!.mixedDateRanges).toEqual([]);
        });
    });

    describe("Validation with Persistence", () => {
        it("should validate DateTimeRange arrays before persistence", async () => {
            // Create an entity that should pass validation
            const validEntity = new DateTimeRangeArrayPersistenceModel();
            validEntity.name = "Valid Entity";
            
            const validRange = new DateTimeRangeType();
            validRange.from = new Date('2024-01-01T00:00:00Z');
            validRange.to = new Date('2024-01-31T23:59:59Z');
            
            validEntity.requiredDateRanges = [validRange];
            
            const errors = await validEntity.validate();
            expect(errors).toHaveLength(0);
            
            const savedEntity = await dataSource.save(validEntity);
            expect(savedEntity.id).toBeDefined();
        });
    });
});

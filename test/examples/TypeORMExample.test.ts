import { TypeORMSqlDataSource } from '../../index';

describe('TypeORM DataSource Example', () => {
  it('should demonstrate basic usage with managed schemas', async () => {
    // 1. Create the data source with managed schemas enabled
    const mainDataSource = new TypeORMSqlDataSource({
      type: "sqlite",
      managed: true,  // Enable managed schemas - synchronize will be automatically enabled
      filename: ":memory:",
      logging: false,
      // Note: synchronize not explicitly set - will default to true when managed=true
    });

    console.log('=== TypeORM DataSource Example - Managed Schemas ===');

    // 2. Initialize the data source
    console.log('Initializing data source...');
    await mainDataSource.initialize(mainDataSource.getOptions());
    console.log('✓ Data source initialized successfully');

    // 3. Check configuration
    const options = mainDataSource.getOptions() as any;
    console.log('Configuration:');
    console.log('- Type:', options.type);
    console.log('- Managed:', options.managed);
    console.log('- Filename:', options.filename);
    console.log('- Automatic schema synchronization enabled for development');

    // 4. Check connection status
    console.log('\nConnection status:');
    console.log('- Connected:', mainDataSource.isConnected());
    console.log('- Initialized:', mainDataSource.getInitializationStatus());
    
    const stats = mainDataSource.getConnectionStats();
    console.log('- Stats:', stats);

    // 5. Verify TypeORM instance is available
    const typeormInstance = mainDataSource.getTypeORMDataSource();
    console.log('- TypeORM instance available:', !!typeormInstance);
    console.log('- TypeORM initialized:', typeormInstance.isInitialized);

    // 6. Test that the instance is working
    expect(mainDataSource.isConnected()).toBe(true);
    expect(mainDataSource.getInitializationStatus()).toBe(true);
    expect(typeormInstance).toBeDefined();
    expect(typeormInstance.isInitialized).toBe(true);

    // 7. Clean up
    await mainDataSource.disconnect();
    console.log('✓ Data source disconnected');
    
    expect(mainDataSource.isConnected()).toBe(false);
    
    console.log('\n=== Example completed successfully ===');
  });

  it('should demonstrate non-managed schema configuration', async () => {
    // Example of a non-managed data source where developer controls schema
    const nonManagedDataSource = new TypeORMSqlDataSource({
      type: "sqlite",
      managed: false,  // Schema not managed by Slingr
      filename: ":memory:",
      logging: false,
      synchronize: false,  // Explicitly disable synchronization
    });

    console.log('\n=== TypeORM DataSource Example - Non-Managed Schemas ===');

    await nonManagedDataSource.initialize(nonManagedDataSource.getOptions());
    console.log('✓ Non-managed data source initialized');
    console.log('- Developer must handle schema changes manually');
    
    await nonManagedDataSource.disconnect();
    console.log('✓ Non-managed data source disconnected');
  });
});

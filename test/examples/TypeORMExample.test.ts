import { TypeORMSqlDataSource } from '@/datasources/typeorm/TypeORMSqlDataSource';

describe('TypeORM DataSource Example', () => {
  it('should demonstrate basic usage', async () => {
    // 1. Create the data source
    const mainDataSource = new TypeORMSqlDataSource({
      type: "sqlite",
      managed: true,
      filename: ":memory:",
      logging: false,
      synchronize: true,
    });

    console.log('=== TypeORM DataSource Example ===');

    // 2. Initialize the data source
    console.log('Initializing data source...');
    await mainDataSource.initialize();
    console.log('✓ Data source initialized successfully');

    // 3. Check configuration
    const options = mainDataSource.getOptions() as any;
    console.log('Configuration:');
    console.log('- Type:', options.type);
    console.log('- Managed:', options.managed);
    console.log('- Filename:', options.filename);

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
});

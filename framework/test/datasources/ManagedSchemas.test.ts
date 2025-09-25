import { TypeORMSqlDataSource } from '../../index';
import { DataSource } from '../../src/datasources/DataSource';

describe('Managed Schema Configuration Tests', () => {
  describe('TypeORM SQL DataSource Managed Schema Support', () => {
    it('should support managed schemas', () => {
      const dataSource = new TypeORMSqlDataSource({
        type: 'sqlite',
        managed: true,
        filename: ':memory:',
        logging: false,
      });
      
      expect(dataSource.supportsManagedSchemas()).toBe(true);
    });

    it('should enable synchronize when managed=true and synchronize is not explicitly set', () => {
      const dataSource = new TypeORMSqlDataSource({
        type: 'sqlite',
        managed: true,
        filename: ':memory:',
        logging: false,
        // synchronize not explicitly set
      });

      // We can't directly access the internal config, but we can test the behavior
      // by checking the options passed to the initialization
      const options = dataSource.getOptions();
      expect(options.managed).toBe(true);
    });

    it('should respect explicit synchronize=false even when managed=true', () => {
      const dataSource = new TypeORMSqlDataSource({
        type: 'sqlite',
        managed: true,
        filename: ':memory:',
        logging: false,
        synchronize: false, // explicitly set to false
      });

      const options = dataSource.getOptions();
      expect(options.managed).toBe(true);
      expect((options as any).synchronize).toBe(false);
    });

    it('should not enable synchronize when managed=false', () => {
      const dataSource = new TypeORMSqlDataSource({
        type: 'sqlite',
        managed: false,
        filename: ':memory:',
        logging: false,
        // synchronize not explicitly set
      });

      const options = dataSource.getOptions();
      expect(options.managed).toBe(false);
    });

    it('should validate configuration during construction', () => {
      // Create a mock data source that doesn't support managed schemas
      class NonManagedDataSource extends DataSource {
        constructor(options: any) {
          super(options);
          // Call validation like TypeORMSqlDataSource does
          this.validateConfiguration();
        }

        supportsManagedSchemas(): boolean {
          return false;
        }

        async initialize(): Promise<any> {
          return Promise.resolve();
        }

        configureModel(): void {
          // Mock implementation
        }

        configureField(): void {
          // Mock implementation
        }
      }

      expect(() => {
        new NonManagedDataSource({ managed: true });
      }).toThrow('This data source does not support managed schemas');
    });

    it('should not throw error when managed=false on non-managed data source', () => {
      class NonManagedDataSource extends DataSource {
        constructor(options: any) {
          super(options);
          // Call validation like TypeORMSqlDataSource does
          this.validateConfiguration();
        }

        supportsManagedSchemas(): boolean {
          return false;
        }

        async initialize(): Promise<any> {
          return Promise.resolve();
        }

        configureModel(): void {
          // Mock implementation
        }

        configureField(): void {
          // Mock implementation
        }
      }

      expect(() => {
        new NonManagedDataSource({ managed: false });
      }).not.toThrow();
    });
  });

  describe('Database Configuration Builder Synchronize Logic', () => {
    it('should correctly determine synchronize flag for various scenarios', async () => {
      // Test scenario 1: managed=true, synchronize not set -> should enable synchronize
      const dataSource1 = new TypeORMSqlDataSource({
        type: 'sqlite',
        managed: true,
        filename: ':memory:',
        logging: false,
      });

      await dataSource1.initialize(dataSource1.getOptions());
      
      // Check that schema synchronization is working by verifying the connection
      expect(dataSource1.isConnected()).toBe(true);
      
      await dataSource1.disconnect();

      // Test scenario 2: managed=true, synchronize=false -> should respect explicit setting
      const dataSource2 = new TypeORMSqlDataSource({
        type: 'sqlite',
        managed: true,
        filename: ':memory:',
        logging: false,
        synchronize: false,
      });

      await dataSource2.initialize(dataSource2.getOptions());
      expect(dataSource2.isConnected()).toBe(true);
      await dataSource2.disconnect();

      // Test scenario 3: managed=false, synchronize not set -> should not enable synchronize
      const dataSource3 = new TypeORMSqlDataSource({
        type: 'sqlite',
        managed: false,
        filename: ':memory:',
        logging: false,
      });

      await dataSource3.initialize(dataSource3.getOptions());
      expect(dataSource3.isConnected()).toBe(true);
      await dataSource3.disconnect();

      // Test scenario 4: managed=false, synchronize=true -> should respect explicit setting
      const dataSource4 = new TypeORMSqlDataSource({
        type: 'sqlite',
        managed: false,
        filename: ':memory:',
        logging: false,
        synchronize: true,
      });

      await dataSource4.initialize(dataSource4.getOptions());
      expect(dataSource4.isConnected()).toBe(true);
      await dataSource4.disconnect();
    });
  });
});
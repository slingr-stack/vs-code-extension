import { TypeORMSqlDataSource } from '../../index';

describe('TypeORM SQL DataSource - Basic Connection Tests', () => {
  describe('SQLite Connection', () => {
    it('should connect to in-memory SQLite database', async () => {
      const dataSource = new TypeORMSqlDataSource({
        type: 'sqlite',
        managed: true,
        filename: ':memory:',
        logging: false,
        synchronize: true,
      });

      await dataSource.initialize(dataSource.getOptions());
      
      expect(dataSource.isConnected()).toBe(true);
      expect(dataSource.getInitializationStatus()).toBe(true);
      
      const stats = dataSource.getConnectionStats();
      expect(stats.isConnected).toBe(true);
      
      await dataSource.disconnect();
      expect(dataSource.isConnected()).toBe(false);
    });

    it('should connect to file-based SQLite database', async () => {
      const dataSource = new TypeORMSqlDataSource({
        type: 'sqlite',
        managed: true,
        filename: './test-db.sqlite',
        logging: false,
        synchronize: true,
      });

      await dataSource.initialize(dataSource.getOptions());
      
      expect(dataSource.isConnected()).toBe(true);
      
      // Clean up
      await dataSource.disconnect();
      
      // Clean up the file
      const fs = require('fs');
      if (fs.existsSync('./test-db.sqlite')) {
        fs.unlinkSync('./test-db.sqlite');
      }
    });
  });

  describe('Connection Configuration', () => {
    it('should handle various connection options', async () => {
      const dataSource = new TypeORMSqlDataSource({
        type: 'sqlite',
        managed: true,
        filename: ':memory:',
        logging: true,
        synchronize: false,
        connectTimeout: 5000,
        maxConnections: 15,
        minConnections: 3,
      });

      const options = dataSource.getOptions();
      expect(options).toMatchObject({
        type: 'sqlite',
        managed: true,
        filename: ':memory:',
        logging: true,
        synchronize: false,
        connectTimeout: 5000,
        maxConnections: 15,
        minConnections: 3,
      });

      await dataSource.initialize(dataSource.getOptions());
      expect(dataSource.isConnected()).toBe(true);
      
      await dataSource.disconnect();
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid database configuration gracefully', async () => {
      const dataSource = new TypeORMSqlDataSource({
        type: 'postgres',
        managed: true,
        host: 'nonexistent-host',
        port: 9999,
        username: 'invalid',
        password: 'invalid',
        database: 'invalid',
        connectTimeout: 1000,
      });

      await expect(dataSource.initialize(dataSource.getOptions()))
        .rejects
        .toThrow();
        
      expect(dataSource.isConnected()).toBe(false);
    });

    it('should prevent getTypeORMDataSource operation on disconnected datasource', async () => {
      const dataSource = new TypeORMSqlDataSource({
        type: 'sqlite',
        managed: true,
        filename: ':memory:',
      });

      expect(() => dataSource.getTypeORMDataSource())
        .toThrow('TypeORM DataSource not initialized');
    });
  });

  describe('Multiple DataSource Management', () => {
    it('should handle multiple independent data sources', async () => {
      const dataSource1 = new TypeORMSqlDataSource({
        type: 'sqlite',
        managed: true,
        filename: ':memory:',
        logging: false,
      });

      const dataSource2 = new TypeORMSqlDataSource({
        type: 'sqlite',
        managed: true,
        filename: ':memory:',
        logging: false,
      });

      // Initialize both
      await dataSource1.initialize(dataSource1.getOptions());
      await dataSource2.initialize(dataSource2.getOptions());

      expect(dataSource1.isConnected()).toBe(true);
      expect(dataSource2.isConnected()).toBe(true);

      // Disconnect one
      await dataSource1.disconnect();
      expect(dataSource1.isConnected()).toBe(false);
      expect(dataSource2.isConnected()).toBe(true);

      // Disconnect the other
      await dataSource2.disconnect();
      expect(dataSource2.isConnected()).toBe(false);
    });
  });
});

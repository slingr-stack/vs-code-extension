import { TypeORMSqlDataSource } from '../../index';

describe('Configuration Validation Tests', () => {
  describe('Early Configuration Validation', () => {
    let consoleSpy: jest.SpyInstance;

    beforeEach(() => {
      consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleSpy.mockRestore();
    });

    it('should validate configuration during construction', () => {
      // This should succeed - valid managed configuration
      expect(() => {
        new TypeORMSqlDataSource({
          type: 'sqlite',
          managed: true,
          filename: ':memory:',
          logging: false,
        });
      }).not.toThrow();
    });

    it('should warn when synchronize=true with managed=false', () => {
      // This should warn but not throw
      const dataSource = new TypeORMSqlDataSource({
        type: 'sqlite',
        managed: false,
        filename: ':memory:',
        logging: false,
        synchronize: true, // Explicit synchronize with non-managed schema
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Warning: synchronize=true with managed=false')
      );

      expect(dataSource).toBeDefined();
    });

    it('should not warn when synchronize=false with managed=false', () => {
      new TypeORMSqlDataSource({
        type: 'sqlite',
        managed: false,
        filename: ':memory:',
        logging: false,
        synchronize: false, // Explicit synchronize with non-managed schema
      });

      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('should not warn when managed=true (default synchronize behavior)', () => {
      new TypeORMSqlDataSource({
        type: 'sqlite',
        managed: true,
        filename: ':memory:',
        logging: false,
        // synchronize not explicitly set - should default to true
      });

      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('should not warn when managed=true with explicit synchronize=true', () => {
      new TypeORMSqlDataSource({
        type: 'sqlite',
        managed: true,
        filename: ':memory:',
        logging: false,
        synchronize: true, // Explicit synchronize with managed schema
      });

      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('should not warn when managed=true with explicit synchronize=false', () => {
      new TypeORMSqlDataSource({
        type: 'sqlite',
        managed: true,
        filename: ':memory:',
        logging: false,
        synchronize: false, // Explicit override of default behavior
      });

      expect(consoleSpy).not.toHaveBeenCalled();
    });
  });

  describe('Configuration Consistency Validation', () => {
    it('should properly determine synchronize flag during initialization', async () => {
      // Test case 1: managed=true, synchronize not set -> should enable
      const dataSource1 = new TypeORMSqlDataSource({
        type: 'sqlite',
        managed: true,
        filename: ':memory:',
        logging: false,
      });

      await dataSource1.initialize(dataSource1.getOptions());
      expect(dataSource1.isConnected()).toBe(true);
      await dataSource1.disconnect();

      // Test case 2: managed=false, synchronize not set -> should disable
      const dataSource2 = new TypeORMSqlDataSource({
        type: 'sqlite',
        managed: false,
        filename: ':memory:',
        logging: false,
      });

      await dataSource2.initialize(dataSource2.getOptions());
      expect(dataSource2.isConnected()).toBe(true);
      await dataSource2.disconnect();

      // Test case 3: managed=true, synchronize=false -> should respect explicit setting
      const dataSource3 = new TypeORMSqlDataSource({
        type: 'sqlite',
        managed: true,
        filename: ':memory:',
        logging: false,
        synchronize: false,
      });

      await dataSource3.initialize(dataSource3.getOptions());
      expect(dataSource3.isConnected()).toBe(true);
      await dataSource3.disconnect();
    });
  });
});
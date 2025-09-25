import * as vscode from 'vscode';
import { CacheUpdateEvent, DataSourceMetadata, MetadataCache } from '../cache/cache';

/**
 * SQLTools connection configuration interface
 */
interface SQLToolsConnection {
    name: string;
    driver: string;
    server?: string;
    port?: number;
    database?: string;
    username?: string;
    password?: string;
    connectionTimeout?: number;
}

// Maps TypeORM dialect names to SQLTools driver names
const driverMap: { [key: string]: string } = {
    'postgres': 'PostgreSQL',
    'mysql': 'MySQL',
    'mariadb': 'MariaDB',
};

// Map of TypeORM dialect to the required VS Code extension ID for the driver
const driverExtensionMap: { [key: string]: string } = {
    'postgres': 'mtxr.sqltools-driver-pg',
    'mysql': 'mtxr.sqltools-driver-mysql',
    'mariadb': 'mtxr.sqltools-driver-mariadb',
};

/**
 * Validates if a data source has the minimum required configuration for SQLTools
 */
function isValidDataSource(ds: DataSourceMetadata): boolean {
    return !!(ds.options.type && (ds.options.host || ds.options.server));
}

/**
 * Sanitizes a string value, returning undefined if empty or invalid
 */
function sanitizeString(value: string | undefined): string | undefined {
    if (value && value.trim()) {
        return value.trim();
    }
    return undefined;
}

/**
 * Sanitizes a numeric value, returning undefined if invalid
 */
function sanitizeNumber(value: number | string | undefined): number | undefined {
    if (typeof value === 'number' && value > 0) {
        return value;
    }
    if (typeof value === 'string') {
        const parsed = parseInt(value, 10);
        if (!isNaN(parsed) && parsed > 0) {
            return parsed;
        }
    }
    return undefined;
}

/**
 * Updates the SQLTools configuration with the provided data sources.
 * Filters out invalid data sources and sanitizes configuration values to prevent
 * SQLTools connection issues with empty or inconsistent values.
 * @param sqlDataSources Array of SQL data source metadata
 * @returns Promise that resolves when the configuration is updated
 */
async function updateSqlToolsConfig(sqlDataSources: DataSourceMetadata[]): Promise<void> {
    if (sqlDataSources.length === 0) {
        return;
    }
    const sqlToolsExtension = vscode.extensions.getExtension('mtxr.sqltools');
    if (!sqlToolsExtension) {
        const selection = await vscode.window.showInformationMessage(
            'The SQLTools extension is recommended for Slingr projects with SQL data sources. Would you like to install it?',
            'Install',
            'Ignore'
        );
        if (selection === 'Install') {
            await vscode.commands.executeCommand('workbench.extensions.installExtension', 'mtxr.sqltools');
        }
    }

    // Check for required drivers
    const requiredButNotInstalledDrivers = new Set<string>();
    for (const ds of sqlDataSources) {
        const driverId = driverExtensionMap[ds.options.type];
        if (driverId && !vscode.extensions.getExtension(driverId)) {
            requiredButNotInstalledDrivers.add(driverId);
        }
    }

    // Prompt to install each missing driver
    for (const driverId of requiredButNotInstalledDrivers) {
        const driverName = driverId.split('-').pop()?.toUpperCase() || 'Driver';
        const selection = await vscode.window.showInformationMessage(
            `The SQLTools Driver for ${driverName} is required to connect to your data source. Would you like to install it?`,
            'Install',
            'Ignore'
        );
        if (selection === 'Install') {
            await vscode.commands.executeCommand('workbench.extensions.installExtension', driverId);
        }
    }

    const newSlingrConnections: SQLToolsConnection[] = sqlDataSources
        .filter(isValidDataSource)
        .map(ds => {
            const driver = driverMap[ds.options.type] || ds.options.type;
            const connection: SQLToolsConnection = {
                name: `Slingr: ${ds.name}`,
                driver: driver,
            };

            // Handle server/host variations - server is required for SQLTools
            connection.server = sanitizeString(ds.options.host || ds.options.server) || 'localhost';
            
            // Add optional properties only if they have valid values
            const port = sanitizeNumber(ds.options.port);
            if (port) {
                connection.port = port;
            }
            
            const database = sanitizeString(ds.options.database);
            if (database) {
                connection.database = database;
            }
            
            const username = sanitizeString(ds.options.username);
            if (username) {
                connection.username = username;
            }
            
            const password = sanitizeString(ds.options.password);
            if (password) {
                connection.password = password;
            }
            
            const connectionTimeout = sanitizeNumber(ds.options.connectionTimeout);
            if (connectionTimeout) {
                connection.connectionTimeout = connectionTimeout;
            }

            return connection;
        });

    const config = vscode.workspace.getConfiguration();
    const existingConnections = config.get<any[]>('sqltools.connections') || [];
    const userConnections = existingConnections.filter(c => !c.name.startsWith('Slingr:'));
    const finalConnections = [...userConnections, ...newSlingrConnections];
    await config.update('sqltools.connections', finalConnections, vscode.ConfigurationTarget.Workspace);
}


/**
 * Sets up the listener for data source changes to keep SQLTools config in sync.
 * @param context The extension context.
 * @param cache The metadata cache.
 */
export function setupSqlToolsIntegration(context: vscode.ExtensionContext, cache: MetadataCache) {
    const disposable = cache.onDidUpdate((event: CacheUpdateEvent) => {
        // Only act when the infrastructure update has successfully completed
        if (event.type === 'dataSource') {
            // The rest of the logic is the same!
            const allSqlDataSources = cache.getSqlDataSources();
            updateSqlToolsConfig(allSqlDataSources);
        }
    });
    context.subscriptions.push(disposable);

    // Initial sync on activation
    const initialSqlDataSources = cache.getSqlDataSources();
    if (initialSqlDataSources.length > 0) {
        updateSqlToolsConfig(initialSqlDataSources);
    }
}
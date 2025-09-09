import * as vscode from 'vscode';
import { DataSourceMetadata, MetadataCache } from '../cache/cache';

// The driverMap and updateSqlToolsConfig function remain exactly the same as before.
// ... (no changes to driverMap or updateSqlToolsConfig)

// Maps TypeORM dialect names to SQLTools driver names
const driverMap: { [key: string]: string } = {
    'postgres': 'PostgreSQL',
    'mysql': 'MySQL',
    'mariadb': 'MariaDB',
    'mssql': 'MSSQL',
};

// Map of TypeORM dialect to the required VS Code extension ID for the driver
const driverExtensionMap: { [key: string]: string } = {
    'postgres': 'mtxr.sqltools-driver-pg',
    'mysql': 'mtxr.sqltools-driver-mysql',
    'mariadb': 'mtxr.sqltools-driver-mariadb',
    'mssql': 'mtxr.sqltools-driver-mssql',
};

async function updateSqlToolsConfig(sqlDataSources: DataSourceMetadata[]): Promise<void> {
    // This function's implementation does not need to change.
    if (sqlDataSources.length === 0) {
        // Optionally, we could clear existing Slingr connections here if the list is empty
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
        return;
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

    const newSlingrConnections = sqlDataSources.map(ds => {
        const driver = driverMap[ds.options.type] || ds.options.type;
        return {
            name: `Slingr: ${ds.name}`,
            driver: driver,
            server: ds.options.host,
            port: ds.options.port,
            database: ds.options.database,
            username: ds.options.username,
            password: ds.options.password,
        };
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
    // Subscribe to the existing onInfrastructureChange event.
    const disposable = cache.onInfrastructureChange(changedUri => {
        // We only act on changes within the dataSources directory.
        if (changedUri.path.includes('/src/dataSources/')) {
            // When a change is detected, we get the *current state* of all
            // SQL data sources from the cache and run the update logic.
            const allSqlDataSources = cache.getSqlDataSources();
            updateSqlToolsConfig(allSqlDataSources);
        }
    });
    context.subscriptions.push(disposable);

    // Run once on activation for any data sources that already exist when VS Code opens.
    const initialSqlDataSources = cache.getSqlDataSources();
    if (initialSqlDataSources.length > 0) {
        updateSqlToolsConfig(initialSqlDataSources);
    }
}
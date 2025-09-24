import { Args, Command, Flags } from '@oclif/core'
import fs from 'fs-extra'
import inquirer from 'inquirer'
import * as yaml from 'js-yaml'
import * as path from 'path'
import { checkPortsUsage, findAvailablePort } from '../../utils/port-checker.js'

interface DataSource {
    // Allowed DB types
    type: 'postgres' | 'mysql' | 'sqlite'
    name: string
    managed?: boolean
    host?: string
    port?: number
    username?: string
    password?: string
    database?: string
    logging?: boolean
    synchronize?: boolean
    connectTimeout?: number
}

export default class InfraUpdate extends Command {
    static description = 'Update infrastructure configuration based on metadata'
    static examples = [
        '<%= config.bin %> <%= command.id %>',
        '<%= config.bin %> <%= command.id %> --file postgres.ts',
        '<%= config.bin %> <%= command.id %> -f mysql.ts',
        '<%= config.bin %> <%= command.id %> --all',
        '<%= config.bin %> <%= command.id %> -a'
    ]

    static flags = {
        file: Flags.string({
            char: 'f',
            description: 'Optional: Specific data source file to update',
            required: false
        }),
        all: Flags.boolean({
            char: 'a',
            description: 'Update all available data sources',
            required: false
        })
    }

    private async readDataSources(specificFile?: string): Promise<DataSource[]> {
        const datasourcesDir = path.join(process.cwd(), 'src', 'dataSources')
        if (!fs.existsSync(datasourcesDir)) {
            throw new Error('No dataSources directory found. Make sure you have a src/dataSources/ folder.')
        }

        // Ensure file has .ts extension if specified
        const normalizeFileName = (file: string) =>
            file.endsWith('.ts') ? file : `${file}.ts`

        const files = specificFile ?
            [normalizeFileName(specificFile)] :
            (await fs.readdir(datasourcesDir)).filter(f => f.endsWith('.ts'))

        const dataSources: DataSource[] = []
        for (const file of files) {
            const filePath = path.join(datasourcesDir, file)
            const fileContent = await fs.readFile(filePath, 'utf-8')
            const extractRaw = (key: string): string | null => {
                const re = new RegExp(key + "\\s*:\\s*([^,\n]+)", 'i')
                const m = fileContent.match(re)
                return m ? m[1].trim() : null
            }
            const interpret = (raw: string | null): any => {
                if (!raw) return undefined
                raw = raw.replace(/,$/, '').trim()
                if (/^(true|false)$/i.test(raw)) return raw.toLowerCase() === 'true'
                let m = raw.match(/parseInt\([^|]+\|\|\s*['"]([^'"]+)['"]\)/i)
                if (m) return parseInt(m[1], 10)
                m = raw.match(/process\.env\.[A-Z0-9_]+\s*\|\|\s*['"]([^'"]+)['"]/i)
                if (m) return m[1]
                m = raw.match(/^['"]([^'"]+)['"]$/)
                if (m) return m[1]
                m = raw.match(/^(\d+)$/)
                if (m) return parseInt(m[1], 10)
                return raw
            }
            const typeRaw = extractRaw('type')
            if (!typeRaw) continue
            let typeVal = (typeRaw.match(/['"]([^'"]+)['"]/i) || [null, typeRaw])[1].toLowerCase()
            if (typeVal === 'postgresql') typeVal = 'postgres'
            if (!['mysql', 'postgres', 'sqlite'].includes(typeVal)) {
                this.warn(`Skipping unsupported database type: ${typeVal}. Only PostgreSQL, MySQL and SQLite are supported.`)
                continue
            }
            const name = file.replace('.ts', '')
            const dataSource: DataSource = {
                type: typeVal as DataSource['type'],
                name,
                managed: interpret(extractRaw('managed')) ?? undefined,
                host: interpret(extractRaw('host')) ?? undefined,
                port: interpret(extractRaw('port')) ?? (typeVal === 'mysql' ? 3306 : 5432),
                username: interpret(extractRaw('username')) ?? (typeVal === 'mysql' ? 'root' : 'postgres'),
                password: interpret(extractRaw('password')) ?? (typeVal === 'mysql' ? 'root' : 'postgres'),
                database: interpret(extractRaw('database')) ?? 'slingr',
                logging: interpret(extractRaw('logging')) ?? undefined,
                synchronize: interpret(extractRaw('synchronize')) ?? undefined,
                connectTimeout: interpret(extractRaw('connectTimeout')) ?? undefined,
            }
            dataSources.push(dataSource)
        }
        return dataSources
    }

    private async generateDockerCompose(dataSources: DataSource[], updateSingleService = false): Promise<Record<string, any>> {
        let compose: {
            services: Record<string, any>
            volumes: Record<string, null>
        }

        // Read existing docker-compose.yml when updating a single service
        if (updateSingleService && await fs.pathExists('docker-compose.yml')) {
            try {
                const existingCompose = yaml.load(await fs.readFile('docker-compose.yml', 'utf-8')) as {
                    services?: Record<string, any>
                    volumes?: Record<string, null>
                }
                compose = {
                    services: existingCompose?.services || {},
                    volumes: existingCompose?.volumes || {}
                }
            } catch (error) {
                this.warn('Could not read existing docker-compose.yml, creating new one')
                compose = { services: {}, volumes: {} }
            }
        } else {
            compose = { services: {}, volumes: {} }
        }

        dataSources.forEach(ds => {
            switch (ds.type) {
                case 'postgres':
                    compose.services[`${ds.name}-db`] = {
                        image: 'postgres:15-alpine',
                        ports: [`${ds.port || 5432}:5432`],
                        volumes: [`${ds.name}-data:/var/lib/postgresql/data`],
                        environment: {
                            POSTGRES_USER: ds.username || 'postgres',
                            POSTGRES_PASSWORD: ds.password || 'postgres',
                            POSTGRES_DB: ds.database || 'slingr',
                        },
                        healthcheck: {
                            test: ["CMD-SHELL", "pg_isready"],
                            interval: "2s",
                            timeout: "5s",
                            retries: 15,
                            start_period: "10s"
                        }
                    }
                    compose.volumes[`${ds.name}-data`] = null
                    break
                case 'mysql':
                    {
                        const env: Record<string, any> = {
                            MYSQL_DATABASE: ds.database || 'slingr',
                        }
                        if ((ds.username || '').toLowerCase() === 'root') {
                            env.MYSQL_ROOT_PASSWORD = ds.password || 'root'
                        } else {
                            env.MYSQL_USER = ds.username || 'slingr'
                            env.MYSQL_PASSWORD = ds.password || 'slingr'
                        }

                        compose.services[`${ds.name}-db`] = {
                            image: 'mysql:8.0',
                            ports: [`${ds.port || 3306}:3306`],
                            volumes: [`${ds.name}-data:/var/lib/mysql`],
                            environment: env,
                            healthcheck: {
                                test: ["CMD", "mysqladmin", "ping", "-h", "localhost"],
                                timeout: "20s",
                                retries: 10
                            }
                        }
                        compose.volumes[`${ds.name}-data`] = null
                    }
                    break
                case 'sqlite':
                    // SQLite stores its data in a file, so we need a volume to persist it
                    compose.services[`${ds.name}-db`] = {
                        image: 'keinos/sqlite3:latest',
                        volumes: [
                            `${ds.name}-data:/data`
                        ],
                        environment: {
                            DB_FILE: ds.database || 'slingr.db'
                        },
                        command: ["sh", "-c", "sqlite3 /data/${DB_FILE}"]
                    }
                    compose.volumes[`${ds.name}-data`] = null
                    break
            }
        })

        return compose
    }

    private async checkPortsBeforeGeneration(dataSources: DataSource[]): Promise<void> {
        const ports = dataSources.map(ds => ds.port || (ds.type === 'mysql' ? 3306 : 5432))
        const portUsage = await checkPortsUsage(ports)

        const conflictingPorts = portUsage.filter(p => p.inUse && !p.isProjectDocker)
        const dockerPorts = portUsage.filter(p => p.inUse && p.isProjectDocker)

        // Show info about existing Docker containers
        if (dockerPorts.length > 0) {
            this.log('ℹ️  Found existing project containers:')
            for (const dockerPort of dockerPorts) {
                const dataSource = dataSources.find(ds => (ds.port || (ds.type === 'mysql' ? 3306 : 5432)) === dockerPort.port)
                if (dataSource) {
                    this.log(`   ✅ Port ${dockerPort.port} - ${dataSource.name} (${dockerPort.containerName})`)
                }
            }
            this.log('')
        }

        if (conflictingPorts.length > 0) {
            this.warn('⚠️  Warning: Some ports are currently in use')

            for (const conflictPort of conflictingPorts) {
                const dataSource = dataSources.find(ds => (ds.port || (ds.type === 'mysql' ? 3306 : 5432)) === conflictPort.port)
                if (dataSource) {
                    this.warn(`⚠️  Port ${conflictPort.port} is in use (needed for ${dataSource.name} - ${dataSource.type})`)
                    if (conflictPort.process) {
                        this.warn(`   Currently used by: ${conflictPort.process}`)
                    }

                    // Suggest alternative ports
                    const alternativePort = await findAvailablePort(conflictPort.port + 1, 10)
                    if (alternativePort) {
                        this.warn(`   💡 Consider using port ${alternativePort} instead`)
                    }
                }
            }

            this.warn('💡 Note: Docker containers may fail to start due to these port conflicts')
            this.warn('Consider updating your datasource files to use different ports\n')
        }
    }

    async run(): Promise<void> {
        try {
            const { flags } = await this.parse(InfraUpdate)
            this.log('Reading metadata and updating infrastructure configuration...')

            const dataSources = await this.readDataSources(flags.file)
            if (dataSources.length === 0) {
                this.log('No data sources found in configuration.')
                return
            }

            let selectedDataSources: DataSource[]

            if (flags.all) {
                // When using --all flag, select all available data sources
                selectedDataSources = dataSources
                this.log(`Using all data sources (${dataSources.length} found):`)
                dataSources.forEach(ds => {
                    this.log(`  - ${ds.name} (${ds.type})`)
                })
            } else if (dataSources.length === 1 || flags.file) {
                // Auto-select when there's only one data source or when using --file flag
                selectedDataSources = dataSources
                this.log(`Using data source: ${dataSources[0].name} (${dataSources[0].type})`)
            } else {
                // Show interactive selection for multiple data sources
                const answers = await inquirer.prompt([
                    {
                        type: 'checkbox',
                        name: 'selectedDataSources',
                        message: 'Select the data sources you want to update:',
                        choices: dataSources.map(ds => ({
                            name: `${ds.name} (${ds.type})`,
                            value: ds,
                            checked: true
                        }))
                    }
                ])

                selectedDataSources = answers.selectedDataSources as DataSource[]
                if (selectedDataSources.length === 0) {
                    this.log('No data sources selected. Exiting...')
                    return
                }
            }

            // Check if we're updating a single service
            const isSingleUpdate = selectedDataSources.length === 1 && !flags.all

            // Check for port conflicts before generating docker-compose
            await this.checkPortsBeforeGeneration(selectedDataSources)

            const dockerCompose = await this.generateDockerCompose(selectedDataSources, isSingleUpdate)
            const yamlContent = yaml.dump(dockerCompose)

            await fs.writeFile('docker-compose.yml', yamlContent)
            this.log('Successfully generated docker-compose.yml with database configurations.')
        } catch (error) {
            this.error((error as Error).message)
        }
    }
}
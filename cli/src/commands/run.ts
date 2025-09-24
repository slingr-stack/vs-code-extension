import { Command, Flags } from '@oclif/core'
import fs from 'fs-extra'
import { execSync } from 'node:child_process'
import path from 'node:path'

import { extractDataSourcePorts } from '../utils/datasource-parser.js'
import { checkPortsUsage, findAvailablePort } from '../utils/port-checker.js'

export default class Run extends Command {
    static override description = 'Run a Slingr application locally'
static override examples = [
        '<%= config.bin %> <%= command.id %>',
        '<%= config.bin %> <%= command.id %> --skip-infra'
    ]
static override flags = {
        help: Flags.help({ char: 'h' }),
        'skip-infra': Flags.boolean({
            char: 'i',
            description: 'Skip infrastructure setup and checks',
            required: false,
        })
    }

    public async run(): Promise<void> {
        const { flags } = await this.parse(Run)

        try {
            // Check if we're in a Slingr app directory
            const packageJsonPath = path.join(process.cwd(), 'package.json')
            if (!await fs.pathExists(packageJsonPath)) {
                this.error('Not in a Slingr application directory. Please run this command from your app\'s root directory.')
            }

            const packageJson = await fs.readJSON(packageJsonPath)
            if (!packageJson.dependencies?.['slingr-framework']) {
                this.error('This directory does not contain a Slingr application.')
            }

            // Step 1: Build slingr-framework
            await this.buildFramework()

            // Step 2: Generate code
            await this.generateCode()

            // Step 3: Update and check infrastructure
            if (!flags['skip-infra']) {
                await this.checkInfrastructure()
            }

            // Execute index.ts
            this.log('Starting application...')
            execSync('npm run dev', { stdio: 'inherit' })

        } catch (error) {
            this.error((error as Error).message)
        }
    }

    private async buildFramework(): Promise<void> {
        const currentDir = process.cwd()
        const nodeModulesPath = path.join(currentDir, 'node_modules', 'slingr-framework')
        const distPath = path.join(nodeModulesPath, 'dist')
        const mainFile = path.join(distPath, 'index.js')

        this.log(`Looking for slingr-framework in: ${nodeModulesPath}`)

        if (!await fs.pathExists(nodeModulesPath)) {
            this.error('slingr-framework not found in node_modules. Please run npm install first.')
        }

        // Check if framework is already built
        if (await fs.pathExists(mainFile)) {
            this.log('✅ slingr-framework is already built')
            return
        }

        this.log('📦 Building slingr-framework...')

        try {
            this.log('Changing to framework directory...')
            process.chdir(nodeModulesPath)

            // Check if tsconfig.build.json exists, if not, try with regular tsconfig.json or default tsc
            const tsconfigBuildPath = path.join(nodeModulesPath, 'tsconfig.build.json')
            const tsconfigPath = path.join(nodeModulesPath, 'tsconfig.json')

            if (await fs.pathExists(tsconfigBuildPath)) {
                this.log('Building framework with tsconfig.build.json...')
                execSync('npm run build', { stdio: 'inherit' })
            } else if (await fs.pathExists(tsconfigPath)) {
                this.log('Building framework with tsconfig.json...')
                execSync('npx tsc', { stdio: 'inherit' })
            } else {
                this.log('Building framework with default TypeScript settings...')
                execSync('npx tsc --outDir dist --declaration', { stdio: 'inherit' })
            }
        } catch (error) {
            this.warn(`Failed to build framework: ${(error as Error).message}`)
            this.warn('Framework build failed, but continuing anyway. This might cause runtime issues.')
        } finally {
            this.log('Returning to project directory...')
            process.chdir(currentDir)
        }
    }

    private async checkInfrastructure(): Promise<void> {
        const dataSources = await this.loadDataSources()

        // Check port availability before starting services
        await this.checkPortAvailability()

        // Run infra update command to ensure latest infrastructure configuration
        await this.config.runCommand('infra:update', ['--all'])

        // Check if docker is installed
        try {
            execSync('docker --version', { stdio: 'pipe' })
        } catch {
            this.error('Docker is not installed. Please install Docker to run infrastructure services.')
        }

            // Check if Docker Engine is running
            try {
                execSync('docker info', { stdio: 'pipe' })
            } catch {
                this.error('Docker Engine is not running. Please start Docker Desktop or the Docker service before continuing.')
            }

        // Check if docker-compose is installed
        try {
            execSync('docker compose version', { stdio: 'pipe' })
        } catch {
            this.error('Docker Compose is not installed. Please install Docker Compose to run infrastructure services.')
        }

        // Start infrastructure services
        this.log('Starting infrastructure services...')
        try {
            execSync('docker compose up -d', { stdio: 'inherit' })
        } catch {
            this.error('Failed to start Docker services. This might be due to port conflicts or other Docker issues.')
        }

        // Wait for services to be healthy
        this.log('Waiting for services to be ready...')
        for (const ds of dataSources) {
            const serviceName = `${ds.name}-db`
            this.log(`Checking ${serviceName}...`)

            let attempts = 0
            const maxAttempts = 30

            while (attempts < maxAttempts) {
                try {
                    const containerInfo = execSync(`docker ps -f name=${serviceName} --format '{{.Status}}'`, { encoding: 'utf-8' })

                    if (containerInfo.includes('healthy')) {
                        this.log(`Service ${serviceName} is healthy`)
                        break
                    }
                } catch {
                    // Continue trying
                }

                await new Promise(resolve => setTimeout(resolve, 1000))
                attempts++

                if (attempts === maxAttempts) {
                    this.error(`Service ${serviceName} is not healthy after ${maxAttempts} seconds`)
                }
            }
        }
    }

    private async checkPortAvailability(): Promise<void> {
        this.log('Checking port availability for datasources...')

        const dataSourcePorts = await extractDataSourcePorts()

        if (dataSourcePorts.length === 0) {
            return
        }

        const ports = dataSourcePorts.map(ds => ds.port)
        const portUsage = await checkPortsUsage(ports)

        const conflictingPorts = portUsage.filter(p => p.inUse && !p.isProjectDocker)
        const dockerPorts = portUsage.filter(p => p.inUse && p.isProjectDocker)

        // Show info about existing Docker containers
        if (dockerPorts.length > 0) {
            this.log('ℹ️  Found existing project containers:')
            for (const dockerPort of dockerPorts) {
                const dataSource = dataSourcePorts.find(ds => ds.port === dockerPort.port)
                if (dataSource) {
                    this.log(`   ✅ Port ${dockerPort.port} - ${dataSource.type} (${dockerPort.containerName})`)
                }
            }

            this.log('')
        }

        if (conflictingPorts.length > 0) {
            this.log('⚠️  Port conflicts detected!')
            this.log('')

            for (const conflictPort of conflictingPorts) {
                const dataSource = dataSourcePorts.find(ds => ds.port === conflictPort.port)
                if (dataSource) {
                    this.log(`❌ Port ${conflictPort.port} is already in use (required by ${dataSource.fileName})`)
                    this.log(`   Database type: ${dataSource.type}`)
                    if (conflictPort.process) {
                        this.log(`   Currently used by: ${conflictPort.process}`)
                    }

                    // Suggest alternative ports
                    const alternativePort = await findAvailablePort(conflictPort.port + 1, 10)
                    if (alternativePort) {
                        this.log(`   💡 Suggested alternative: port ${alternativePort}`)
                        this.log(`   To use this port, update ${dataSource.fileName} and change the port to ${alternativePort}`)
                    }

                    this.log('')
                }
            }

            this.log('💡 Solutions:')
            this.log('1. Stop the processes using these ports')
            this.log('2. Update your datasource files to use different ports')
            this.log('3. Use --skip-infra flag to run without infrastructure')
            this.log('')

            this.error(`Cannot start infrastructure due to port conflicts. Please resolve the port conflicts above.`)
        } else {
            this.log('✅ All required ports are available')
        }
    }

    private async generateCode(): Promise<void> {
        // Compile TypeScript code
        this.log('Compiling TypeScript code...')
        execSync('npm run build', { stdio: 'inherit' })
    }

 private async loadDataSources(): Promise<Array<{ name: string; type: string; }>> {
        const dataSources: Array<{ name: string; type: string; }> = []
        const dataSourcesPath = path.join(process.cwd(), 'src', 'dataSources')

        if (await fs.pathExists(dataSourcesPath)) {
            const files = await fs.readdir(dataSourcesPath)
            for (const file of files) {
                if (file.endsWith('.ts')) {
                    const content = await fs.readFile(path.join(dataSourcesPath, file), 'utf8')
                    const typeMatch = content.match(/type:\s*['"]([^'"]+)['"]/)
                    if (typeMatch) {
                        let type = typeMatch[1]
                        if (type === 'postgresql') type = 'postgres'

                        dataSources.push({
                            name: file.replace('.ts', ''),
                            type
                        })
                    }
                }
            }
        }

        return dataSources
    }
}
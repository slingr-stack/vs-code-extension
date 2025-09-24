import { Command, Flags } from '@oclif/core'
import fs from 'fs-extra'
import { execSync } from 'child_process'

export default class InfraDown extends Command {
    static description = 'Stop infrastructure services using Docker Compose (data is preserved by default)'
    static examples = [
        '<%= config.bin %> <%= command.id %> # Stop services, preserve data',
        '<%= config.bin %> <%= command.id %> --volumes # Stop services and delete all data'
    ]

    static flags = {
        volumes: Flags.boolean({
            char: 'v',
            description: 'Remove volumes as well (WARNING: This will delete all data)',
            default: false
        }),
        help: Flags.help({ char: 'h' })
    }

    private async checkDockerComposeFile(): Promise<void> {
        const dockerComposeFile = 'docker-compose.yml'

        if (!await fs.pathExists(dockerComposeFile)) {
            this.error('No docker-compose.yml file found. Please run "slingr infra update" first to generate the infrastructure configuration.')
        }
    }

    private async checkDockerInstallation(): Promise<void> {
        try {
            execSync('docker --version', { stdio: 'pipe' })
        } catch (error) {
            this.error('Docker is not installed. Please install Docker to run infrastructure services.')
        }

        try {
            execSync('docker compose version', { stdio: 'pipe' })
        } catch (error) {
            this.error('Docker Compose is not installed. Please install Docker Compose to run infrastructure services.')
        }
    }

    async run(): Promise<void> {
        const { flags } = await this.parse(InfraDown)

        try {
            // Check if docker-compose.yml exists
            await this.checkDockerComposeFile()

            // Check if Docker and Docker Compose are installed
            await this.checkDockerInstallation()

            // Stop infrastructure services
            this.log('🔽 Stopping infrastructure services...')

            const composeCommand = flags.volumes ?
                'docker compose down -v' :
                'docker compose down'

            if (flags.volumes) {
                this.log('⚠️  WARNING: This will remove all volumes and permanently delete all data!')
            } else {
                this.log('ℹ️  Data will be preserved. Use --volumes flag to remove all data.')
            }

            execSync(composeCommand, { stdio: 'inherit' })

            if (flags.volumes) {
                this.log('✅ Infrastructure services stopped and all data removed.')
            } else {
                this.log('✅ Infrastructure services stopped (data preserved).')
            }

        } catch (error) {
            this.error((error as Error).message)
        }
    }
}
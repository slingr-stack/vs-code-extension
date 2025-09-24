import { Command, Flags } from '@oclif/core'
import fs from 'fs-extra'
import { execSync } from 'child_process'

export default class InfraUp extends Command {
    static description = 'Start infrastructure services using Docker Compose'
    static examples = [
        '<%= config.bin %> <%= command.id %>',
        '<%= config.bin %> <%= command.id %> --detach'
    ]

    static flags = {
        detach: Flags.boolean({
            char: 'd',
            description: 'Run services in detached mode (background)',
            default: true
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
        const { flags } = await this.parse(InfraUp)

        try {
            // Check if docker-compose.yml exists
            await this.checkDockerComposeFile()

            // Check if Docker and Docker Compose are installed
            await this.checkDockerInstallation()

            // Start infrastructure services
            this.log('Starting infrastructure services...')

            const composeCommand = flags.detach ?
                'docker compose up -d' :
                'docker compose up'

            execSync(composeCommand, { stdio: 'inherit' })

            if (flags.detach) {
                this.log('Infrastructure services started in detached mode.')
                this.log('Use "docker compose ps" to check service status.')
            }

        } catch (error) {
            this.error((error as Error).message)
        }
    }
}
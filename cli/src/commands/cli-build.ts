import { Command } from '@oclif/core'
import { execSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export default class CliBuild extends Command {
    static aliases = ['cli-build']
static description = 'Rebuild the Slingr CLI tool itself. This command is used for CLI development and maintenance, not for building Slingr applications.'
static examples = [
        '<%= config.bin %> <%= command.id %>',
        'Description: Use this command when you need to rebuild the Slingr CLI after making changes to the CLI codebase.'
    ]
    static strict = false

    public async run(): Promise<void> {
        const __filename = fileURLToPath(import.meta.url)
        const __dirname = dirname(__filename)
        const cliRootPath = join(__dirname, '..', '..')

        try {
            this.log('Rebuilding Slingr CLI tool...')
            execSync('npm run build', {
                cwd: cliRootPath,
                stdio: 'inherit'
            })
            
            this.log('Updating OCLIF manifest and documentation...')
            execSync('npm run prepack', {
                cwd: cliRootPath,
                stdio: 'inherit'
            })
            
            this.log('Slingr CLI rebuild completed successfully!')
        } catch (error) {
            this.error('Failed to rebuild Slingr CLI')
            throw error
        }
    }
}
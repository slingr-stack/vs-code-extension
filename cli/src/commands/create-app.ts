import { Args, Command, Flags } from '@oclif/core'
import fse from 'fs-extra'
import inquirer from 'inquirer'
import path from 'node:path'

import { AppAnswers, createProjectStructure } from '../project-structure.js'

export default class CreateApp extends Command {
  static override args = {
    name: Args.string({
      description: 'Name of the application to create',
      required: false
    })
  }
  static override description = 'Create a new Slingr application'
  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> my-app',
    '<%= config.bin %> <%= command.id %> task-manager',
    '<%= config.bin %> <%= command.id %> my-crm --type="CRM" --backend --frontend --database=postgres --description="A CRM system for managing customers"'
  ]
  static override flags = {
    backend: Flags.boolean({
      allowNo: true,
      char: 'b',
      description: 'Include backend for the application'
    }),
    database: Flags.string({
      char: 'd',
      description: 'Database to use (postgres or mysql)',
      options: ['postgres', 'mysql']
    }),
    description: Flags.string({
      char: 'D',
      description: 'Description of what the application needs to do'
    }),
    frontend: Flags.boolean({
      allowNo: true,
      char: 'f',
      description: 'Include frontend for the application'
    }),
    help: Flags.help({ char: 'h' }),
    type: Flags.string({
      char: 't',
      description: 'Type of application (e.g., CRM, task manager, ERP)',
    })
  }

  public async run(): Promise<void> {
    const { args, flags } = await this.parse(CreateApp)
    let appName = args.name

    // If no name is provided, ask for it
    if (appName) {
      // Check if directory already exists when name is provided as argument
      const targetDir = path.join(process.cwd(), appName)
      if (await fse.pathExists(targetDir)) {
        this.error(`Directory ${appName} already exists!`)
      }
    } else {
      const response = await inquirer.prompt<{ name: string }>([
        {
          message: 'What is the name of your application?',
          name: 'name',
          type: 'input',
          async validate(input: string) {
            if (input.length === 0) return 'Please provide a name for your application'
            const targetDir = path.join(process.cwd(), input)
            if (await fse.pathExists(targetDir)) {
              return `Directory ${input} already exists!`
            }

            return true
          }
        }
      ])
      appName = response.name
    }

    let answers: AppAnswers

    // Check if all flags are provided
    const hasAllFlags = flags.type &&
      flags.backend !== undefined &&
      flags.frontend !== undefined &&
      flags.database &&
      flags.description

    if (hasAllFlags) {
      // Use provided flags
      answers = {
        appType: flags.type!,
        database: flags.database as 'mysql' | 'postgres',
        description: flags.description!,
        hasBackend: flags.backend!,
        hasFrontend: flags.frontend!
      }
    } else {
      this.log('')
      this.log('Hi! Before we get started, we are going to ask you some information about your application.')
      this.log('')

      // Interactive questions, pre-filling with any provided flags
      answers = await inquirer.prompt<AppAnswers>([
        {
          default: flags.type,
          message: 'What type of application are you going to create? ',
          name: 'appType',
          suffix: "For example, a CRM, a task manager, an ERP, etc.\n",
          type: 'input',
          validate: (input: string) => input.length > 0 || 'Please provide an application type'
        },
        {
          default: flags.backend ?? true,
          message: 'OK! Now, are you going to create a backend for your app?',
          name: 'hasBackend',
          type: 'confirm'
        },
        {
          default: flags.frontend ?? true,
          message: 'Good! Do you also want to create the frontend with Slingr?',
          name: 'hasFrontend',
          type: 'confirm',
        },
        {
          choices: [
            { name: 'PostgreSQL', value: 'postgres' },
            { name: 'MySQL', value: 'mysql' }
          ],
          default: flags.database || 'postgres',
          message: 'Which database do you want to use?',
          name: 'database',
          type: 'list'
        },
        {
          default: flags.description,
          message: 'Perfect! Please, provide a description of what your app needs to do:\n',
          name: 'description',
          type: 'input',
          validate: (input: string) => input.length > 0 || 'Please provide a description'
        }
      ])
    }

    this.log('')
    this.log("That's very useful, thanks for the information!")
    this.log('')

    // Create the project structure
    await createProjectStructure(appName, answers)

    this.log(`Project ${appName} created successfully!`)
    this.log(`To get started:`)
    this.log(`  cd ${appName}`)
    this.log(`  npm install`)
  }
}
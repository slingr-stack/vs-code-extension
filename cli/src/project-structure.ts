import fse from 'fs-extra'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export interface AppAnswers {
    appType: string
    description: string
    hasBackend: boolean
    hasFrontend: boolean
    database: string
}

async function copyTemplateFile(templatePath: string, targetPath: string, replacements?: Record<string, string>): Promise<void> {
    let content = await fse.readFile(templatePath, 'utf8')

    // Apply replacements if provided
    if (replacements) {
        for (const [placeholder, value] of Object.entries(replacements)) {
            content = content.replaceAll(placeholder, value)
        }
    }

    await fse.outputFile(targetPath, content)
}

export async function createProjectStructure(appName: string, answers: AppAnswers): Promise<void> {
    const targetDir = path.join(process.cwd(), appName)
    const currentDir = path.dirname(fileURLToPath(import.meta.url))
    // When running from dist/, we need to go up one level to reach the project root
    const projectRoot = path.resolve(currentDir, '..')
    const templatesDir = path.join(projectRoot, 'src', 'templates')

    // Create directory structure
    await fse.ensureDir(targetDir)
    await fse.ensureDir(path.join(targetDir, '.vscode'))
    await fse.ensureDir(path.join(targetDir, '.github'))
    await fse.ensureDir(path.join(targetDir, 'src', 'data'))
    await fse.ensureDir(path.join(targetDir, 'src', 'dataSources'))
    await fse.ensureDir(path.join(targetDir, 'docs'))

    // Copy .vscode files from templates
    await fse.copy(
        path.join(templatesDir, 'vscode', 'extensions.json'),
        path.join(targetDir, '.vscode', 'extensions.json')
    )

    await fse.copy(
        path.join(templatesDir, 'vscode', 'settings.json'),
        path.join(targetDir, '.vscode', 'settings.json')
    )

    // Copy tsconfig.json from templates
    await copyTemplateFile(
        path.join(templatesDir, 'config', 'tsconfig.json.template'),
        path.join(targetDir, 'tsconfig.json')
    )

    // Copy .gitignore from templates
    await fse.copy(
        path.join(templatesDir, 'config', '.gitignore'),
        path.join(targetDir, '.gitignore')
    )

    // Copy jest.config.ts from templates
    await fse.copy(
        path.join(templatesDir, 'config', 'jest.config.ts'),
        path.join(targetDir, 'jest.config.ts')
    )

    // Copy jest.setup.ts from templates
    await fse.copy(
        path.join(templatesDir, 'config', 'jest.setup.ts'),
        path.join(targetDir, 'jest.setup.ts')
    )

    // Copy and process src files from templates
    const replacements = {
        '{{APP_NAME}}': appName
    }

    await copyTemplateFile(
        path.join(templatesDir, 'src', 'index.ts'),
        path.join(targetDir, 'src', 'index.ts'),
        replacements
    )

    // Copiar el template de datasource correspondiente según el tipo de base de datos
    if (answers.hasBackend) {
        let dbType = answers.database.toLowerCase()
        let templateFile = ''
        let targetFile = ''
        switch (dbType) {
            case 'postgres':
            case 'postgresql':
                templateFile = path.join(templatesDir, 'dataSources', 'postgres.ts.template')
                targetFile = path.join(targetDir, 'src', 'dataSources', 'postgres.ts')
                break
            case 'mysql':
                templateFile = path.join(templatesDir, 'dataSources', 'mysql.ts.template')
                targetFile = path.join(targetDir, 'src', 'dataSources', 'mysql.ts')
                break
            // Agregar más casos si hay más templates
            default:
                templateFile = path.join(templatesDir, 'dataSources', 'postgres.ts.template')
                targetFile = path.join(targetDir, 'src', 'dataSources', 'postgres.ts')
        }
        await copyTemplateFile(
            templateFile,
            targetFile,
            { '{{APP_NAME}}': appName }
        )
    }

    // Copy sample model files
    await fse.copy(
        path.join(templatesDir, 'src', 'SampleModel.ts'),
        path.join(targetDir, 'src', 'data', 'SampleModel.ts')
    )

    await fse.copy(
        path.join(templatesDir, 'src', 'SampleModel.test.ts'),
        path.join(targetDir, 'src', 'data', 'SampleModel.test.ts')
    )

    // Copy templated .github/copilot-instructions.md
    await copyTemplateFile(
        path.join(templatesDir, '.github', 'copilot-instructions.md.template'),
        path.join(targetDir, '.github', 'copilot-instructions.md'),
        {
            '{{APP_NAME}}': appName,
            '{{APP_TYPE}}': answers.appType,
            '{{DESCRIPTION}}': answers.description,
            '{{HAS_BACKEND}}': answers.hasBackend ? 'Yes' : 'No',
            '{{HAS_FRONTEND}}': answers.hasFrontend ? 'Yes' : 'No',
            '{{DB_TYPE}}': answers.database
        }
    )

    // Copy package.json template
    await copyTemplateFile(
        path.join(templatesDir, 'package.json.template'),
        path.join(targetDir, 'package.json'),
        {
            '{{APP_NAME}}': appName,
            '{{DESCRIPTION}}': answers.description,
            '{{APP_KEYWORD}}': answers.appType.toLowerCase().replaceAll(/\s+/g, '-')
        }
    )

    // Copy docs/app-description.md template
    await copyTemplateFile(
        path.join(templatesDir, 'docs', 'app-description.md.template'),
        path.join(targetDir, 'docs', 'app-description.md'),
        {
            '{{APP_NAME}}': appName,
            '{{DESCRIPTION}}': answers.description,
            '{{APP_TYPE}}': answers.appType,
            '{{HAS_BACKEND}}': answers.hasBackend ? 'Included' : 'Not included',
            '{{HAS_FRONTEND}}': answers.hasFrontend ? 'Included' : 'Not included',
            '{{DB_TYPE}}': answers.database
        }
    )
}
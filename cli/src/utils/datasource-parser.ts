import fs from 'fs-extra'
import path from 'path'

export interface DataSourcePortInfo {
    fileName: string
    type: string
    port: number
    host?: string
    database?: string
}

/**
 * Extract port information from datasource files
 */
export async function extractDataSourcePorts(specificFile?: string): Promise<DataSourcePortInfo[]> {
    const datasourcesDir = path.join(process.cwd(), 'src', 'dataSources')

    if (!fs.existsSync(datasourcesDir)) {
        return []
    }

    // Ensure file has .ts extension if specified
    const normalizeFileName = (file: string) =>
        file.endsWith('.ts') ? file : `${file}.ts`

    const files = specificFile ?
        [normalizeFileName(specificFile)] :
        (await fs.readdir(datasourcesDir)).filter(f => f.endsWith('.ts'))

    const dataSources: DataSourcePortInfo[] = []

    for (const file of files) {
        const filePath = path.join(datasourcesDir, file)

        if (!fs.existsSync(filePath)) {
            continue
        }

        const fileContent = await fs.readFile(filePath, 'utf-8')

        // Extract values using regex
        const extractRaw = (key: string): string | null => {
            const re = new RegExp(key + "\\s*:\\s*([^,\n]+)", 'i')
            const m = fileContent.match(re)
            return m ? m[1].trim() : null
        }

        const interpret = (raw: string | null): any => {
            if (!raw) return undefined
            raw = raw.replace(/,$/, '').trim()

            // Handle boolean values
            if (/^(true|false)$/i.test(raw)) return raw.toLowerCase() === 'true'

            // Handle parseInt with fallback
            let m = raw.match(/parseInt\([^|]+\|\|\s*['"]([^'"]+)['"]\)/i)
            if (m) return parseInt(m[1], 10)

            // Handle environment variables with fallback
            m = raw.match(/process\.env\.[A-Z0-9_]+\s*\|\|\s*['"]([^'"]+)['"]/i)
            if (m) return m[1]

            // Handle quoted strings
            m = raw.match(/^['"]([^'"]+)['"]$/)
            if (m) return m[1]

            // Handle plain numbers
            m = raw.match(/^(\d+)$/)
            if (m) return parseInt(m[1], 10)

            return raw
        }

        const typeRaw = extractRaw('type')
        if (!typeRaw) continue

        let typeVal = (typeRaw.match(/['"]([^'"]+)['"]/i) || [null, typeRaw])[1].toLowerCase()
        if (typeVal === 'postgresql') typeVal = 'postgres'

        if (!['mysql', 'postgres', 'sqlite'].includes(typeVal)) {
            continue
        }

        const portRaw = extractRaw('port')
        const port = interpret(portRaw) ?? (typeVal === 'mysql' ? 3306 : 5432)

        if (typeof port === 'number') {
            dataSources.push({
                fileName: file,
                type: typeVal,
                port,
                host: interpret(extractRaw('host')) ?? 'localhost',
                database: interpret(extractRaw('database')) ?? undefined
            })
        }
    }

    return dataSources
}
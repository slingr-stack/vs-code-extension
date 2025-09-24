import { execSync } from 'child_process'
import * as net from 'net'

/**
 * Check if a port is being used by a Docker container from the current project
 */
export function isPortUsedByProjectDocker(port: number): { isDocker: boolean; containerName?: string; containerId?: string } {
    try {
        // Get current working directory name as project identifier
        const projectName = process.cwd().split('/').pop()?.toLowerCase() || 'unknown'

        // Check if there are Docker containers using this port with project-related names
        const dockerPs = execSync(`docker ps --format "table {{.Names}}\\t{{.Ports}}" | grep ":${port}->"`, {
            encoding: 'utf-8',
            stdio: 'pipe'
        })

        const lines = dockerPs.trim().split('\n').filter(line => line.includes(':'))

        for (const line of lines) {
            const [containerName, ports] = line.split('\t')

            // Check if container name contains project name or database-related patterns
            if (containerName.includes(projectName) ||
                containerName.includes('-db') ||
                containerName.includes('mysql') ||
                containerName.includes('postgres') ||
                containerName.includes('sqlite')) {

                // Get container ID
                try {
                    const containerId = execSync(`docker ps --filter name=${containerName} --format "{{.ID}}"`, {
                        encoding: 'utf-8',
                        stdio: 'pipe'
                    }).trim()

                    return {
                        isDocker: true,
                        containerName,
                        containerId
                    }
                } catch {
                    return {
                        isDocker: true,
                        containerName
                    }
                }
            }
        }

        return { isDocker: false }
    } catch {
        return { isDocker: false }
    }
}

/**
 * Check if a port is currently in use using system tools
 */
export async function isPortInUse(port: number, host = 'localhost'): Promise<boolean> {
    try {
        // First try using lsof (most reliable on macOS and Linux)
        const lsofResult = execSync(`lsof -ti:${port}`, { encoding: 'utf-8', stdio: 'pipe' })
        return lsofResult.trim().length > 0
    } catch {
        try {
            // Fallback: try netstat 
            const netstatResult = execSync(`netstat -tulpn 2>/dev/null | grep :${port}`, {
                encoding: 'utf-8',
                stdio: 'pipe'
            })
            return netstatResult.trim().length > 0
        } catch {
            // Final fallback: try to bind to the port
            return new Promise((resolve) => {
                const server = net.createServer()

                server.listen(port, host, () => {
                    server.once('close', () => {
                        resolve(false) // Port is available
                    })
                    server.close()
                })

                server.on('error', () => {
                    resolve(true) // Port is in use
                })
            })
        }
    }
}

/**
 * Find what process is using a specific port
 */
export function getProcessUsingPort(port: number): string | null {
    try {
        // Use lsof to find what's using the port (works on macOS and Linux)
        const result = execSync(`lsof -ti:${port}`, { encoding: 'utf-8', stdio: 'pipe' })
        const pid = result.trim()

        if (pid) {
            try {
                // Get process info
                const processInfo = execSync(`ps -p ${pid} -o pid,comm,args --no-headers`, {
                    encoding: 'utf-8',
                    stdio: 'pipe'
                })
                return processInfo.trim()
            } catch {
                return `Process ID: ${pid}`
            }
        }
    } catch (error) {
        // lsof might not be available or port might not be in use
        try {
            // Fallback: try netstat (more widely available)
            const result = execSync(`netstat -tulpn 2>/dev/null | grep :${port}`, {
                encoding: 'utf-8',
                stdio: 'pipe'
            })
            return result.trim()
        } catch {
            // If both fail, we can't determine what's using the port
        }
    }

    return null
}

/**
 * Find an available port starting from a given port
 */
export async function findAvailablePort(startingPort: number, maxAttempts = 10): Promise<number | null> {
    for (let port = startingPort; port < startingPort + maxAttempts; port++) {
        if (!(await isPortInUse(port))) {
            return port
        }
    }
    return null
}

/**
 * Check multiple ports and return information about their usage
 */
export async function checkPortsUsage(ports: number[]): Promise<Array<{
    port: number
    inUse: boolean
    isProjectDocker?: boolean
    containerName?: string
    containerId?: string
    process?: string
}>> {
    const results = []

    for (const port of ports) {
        const inUse = await isPortInUse(port)
        const dockerInfo = isPortUsedByProjectDocker(port)

        const result: {
            port: number
            inUse: boolean
            isProjectDocker?: boolean
            containerName?: string
            containerId?: string
            process?: string
        } = {
            port,
            inUse,
            isProjectDocker: dockerInfo.isDocker,
            containerName: dockerInfo.containerName,
            containerId: dockerInfo.containerId
        }

        if (inUse && !dockerInfo.isDocker) {
            // Only get process info if it's not a project Docker container
            const process = getProcessUsingPort(port)
            if (process) {
                result.process = process
            }
        }

        results.push(result)
    }

    return results
}
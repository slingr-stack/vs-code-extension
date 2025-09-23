export class PerformanceProfiler {
    private static measurements: Map<string, { count: number, totalTime: number, maxTime: number }> = new Map();
    
    static async measure<T>(operation: string, fn: () => Promise<T> | T): Promise<T> {
        const start = performance.now();
        try {
            const result = await fn();
            const duration = performance.now() - start;
            this.recordMeasurement(operation, duration);
            
            if (duration > 100) { // Log operations > 100ms
                console.log(`[PERF] ${operation}: ${duration.toFixed(2)}ms`);
            }
            
            return result;
        } catch (error) {
            const duration = performance.now() - start;
            console.error(`[PERF] ${operation} FAILED after ${duration.toFixed(2)}ms:`, error);
            throw error;
        }
    }
    
    private static recordMeasurement(operation: string, duration: number) {
        const existing = this.measurements.get(operation) || { count: 0, totalTime: 0, maxTime: 0 };
        existing.count++;
        existing.totalTime += duration;
        existing.maxTime = Math.max(existing.maxTime, duration);
        this.measurements.set(operation, existing);
    }
    
    static getReport(): string {
        let report = '\n=== PERFORMANCE REPORT ===\n';
        const sorted = Array.from(this.measurements.entries())
            .sort(([,a], [,b]) => b.totalTime - a.totalTime);
            
        for (const [operation, stats] of sorted) {
            const avgTime = stats.totalTime / stats.count;
            report += `${operation}: ${stats.count} calls, ${stats.totalTime.toFixed(2)}ms total, ${avgTime.toFixed(2)}ms avg, ${stats.maxTime.toFixed(2)}ms max\n`;
        }
        
        return report;
    }
    
    static reset() {
        this.measurements.clear();
    }
}
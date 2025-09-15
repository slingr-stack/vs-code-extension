import * as vscode from 'vscode';

export class SlingrTaskProvider implements vscode.TaskProvider {
    static SlingrTaskType = 'slingr';

    /**
     * This method is called by VS Code to discover all tasks provided by this extension.
     */
    public provideTasks(token?: vscode.CancellationToken): vscode.ProviderResult<vscode.Task[]> {
        // Define the task's properties. This must match the definition in package.json
        const taskDefinition: vscode.TaskDefinition = {
            type: SlingrTaskProvider.SlingrTaskType,
            task: 'run'
        };
        const execution = new vscode.ShellExecution('slingr run');

        // This problem matcher tells VS Code when the background task is "ready"
        const problemMatcher = "$slingr-runner";

        // Create the final Task object that VS Code will execute.
        const slingrRunTask = new vscode.Task(
            taskDefinition,
            vscode.TaskScope.Workspace,
            'slingr: run environment',
            'slingr',
            execution,
            problemMatcher
        );

        slingrRunTask.isBackground = true;
        slingrRunTask.presentationOptions = {
            reveal: vscode.TaskRevealKind.Always,
            panel: vscode.TaskPanelKind.New,
            clear: true
        };

        return [slingrRunTask];
    }

    /**
     * This method is called by VS Code when it needs to execute a task that
     * might be defined in a user's tasks.json. We provide a full definition.
     */
    public resolveTask(_task: vscode.Task, token?: vscode.CancellationToken): vscode.ProviderResult<vscode.Task> {
        const task = _task.definition.task;
        if (task === 'run') {
            const definition: vscode.TaskDefinition = <any>_task.definition;
            const resolvedTask = new vscode.Task(
                definition,
                _task.scope ?? vscode.TaskScope.Workspace,
                definition.task,
                'slingr',
                new vscode.ShellExecution('slingr run')
            );
            resolvedTask.isBackground = true;
            return resolvedTask;
        }
        return undefined;
    }
}
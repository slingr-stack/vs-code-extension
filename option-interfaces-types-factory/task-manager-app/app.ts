import { App } from "../framework/app";
import { projectsEntity } from "./model/entities/projects";
import { tasksEntity } from "./model/entities/tasks";
import { timeLogsEntity } from "./model/entities/timeLogs";
import { projectsGridView } from "./ui/views/projectsGrid";
import { tasksGridView } from "./ui/views/tasksGrid";
import { timeLogsGridView } from "./ui/views/timeLogsGrid";

export const app: App = {
    entities: {
        projects: projectsEntity,
        tasks: tasksEntity,
        timeLogs: timeLogsEntity
    },
    views: {
        projectsGrid: projectsGridView,
        tasksGrid: tasksGridView,
        timeLogsGrid: timeLogsGridView
    }
};
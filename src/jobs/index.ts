/**
 * Central job bootstrapper - starts PgBoss and registers all jobs.
 */
import { boss } from './boss.js';

// Import all job definitions (this registers them with the boss singleton)
import './refresh-report-datum.js';
import './update-report-dataset-for-account.js';
import './update-report-datasets.js';
import './sync-ad-entities.js';

export async function startJobs(): Promise<void> {
    if (boss.isStarted) {
        return;
    }

    await boss.start();
    await boss.registerAll();
}

export async function stopJobs(): Promise<void> {
    await boss.stop();
}

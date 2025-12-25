/**
 * Central job bootstrapper - starts PgBoss and registers all jobs.
 */
import { boss } from './boss.js';

// Import all job definitions (this registers them with the boss singleton)
import './update-report-status.js';
import './update-report-dataset-for-account.js';
import './update-report-datasets.js';
import './sync-ad-entities.js';
import './summarize-daily-target-stream-for-account.js';
import './summarize-daily-target-stream.js';
import './cleanup-ams-metrics.js';

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

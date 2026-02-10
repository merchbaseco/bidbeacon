/**
 * Central job bootstrapper - starts PgBoss and registers all jobs.
 */
import { boss } from './boss.js';

// Import all job definitions (this registers them with the boss singleton)
import './update-report-status';
import './update-report-dataset-for-account';
import './update-report-datasets';
import './sync-ad-entities';
import './sync-ad-entities-for-account';
import './summarize-daily-target-stream-for-account';
import './summarize-daily-target-stream';
import './summarize-hourly-target-stream-for-account';
import './summarize-hourly-target-stream';
import './cleanup-ams-metrics';

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

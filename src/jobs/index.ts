/**
 * Central job bootstrapper - starts PgBoss and registers all jobs.
 */
import { boss } from './boss.js';

// Import all job definitions (this registers them with the boss singleton)
import './update-report-dataset-metadata.js';
import './request-report-for-date.js';
import './sync-profiles.js';
import './sync-advertiser-accounts.js';

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

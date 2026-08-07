import { resolve } from 'node:path';
import { packageAccountManagementSkill } from './account-management-skill-package';

const sourceDirectory = resolve('skills/bidbeacon-account-management');
const distributionDirectory = resolve(process.argv[2] ?? 'dist/skills/bidbeacon-account-management');
const result = await packageAccountManagementSkill(sourceDirectory, distributionDirectory);
console.log(`Packaged ${result.name}: ${result.files.length} files at ${distributionDirectory}.`);

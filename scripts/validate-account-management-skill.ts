import { resolve } from 'node:path';
import { validateAccountManagementSkill } from './account-management-skill-package';

const skillDirectory = resolve(process.argv[2] ?? 'skills/bidbeacon-amazon-ads');
const result = await validateAccountManagementSkill(skillDirectory);
console.log(`Validated ${result.name}: ${result.files.length} files.`);

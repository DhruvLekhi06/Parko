import { migrate, close } from './db.js';

await migrate();
console.log('migration complete');
await close();

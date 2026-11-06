// THE FLASH — server entry
import { createApp } from './app.js';
import { env } from './env.js';
import { seed } from './seed.js';

const app = createApp();
await seed(app.db);

app.listen(env.port, () => {
  console.log(`\n⚡ THE FLASH API ready on http://localhost:${env.port}`);
  console.log(`   DB: ${env.dbPath}`);
});

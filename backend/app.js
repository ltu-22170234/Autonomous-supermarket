import { openDatabase } from './db.js';
import { createApp } from './createApp.js';
const db = openDatabase();
const app = createApp(db);
const port = 3001;
app.listen(port, '127.0.0.1', () => {
  console.log(`Backend running at http://127.0.0.1:${port}`);
});

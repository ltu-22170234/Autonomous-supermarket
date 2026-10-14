import { openDatabase } from '../db.js';
import { updateOpeningCatalogue } from '../services/openingCatalogue.js';

const db = openDatabase();
try {
  console.log(JSON.stringify(updateOpeningCatalogue(db), null, 2));
} finally {
  db.close();
}

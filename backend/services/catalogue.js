import { seedCatalogue } from '../data/catalogue.js';
import { modelConfig } from '../model/config.js';

export const productColumns = ['product_id','name','category','pack_size','purchase_cost_cents','selling_price_cents','initial_quantity','perishable','shelf_life_days','popularity_weight'];
export function clientError(message, status = 400) { return Object.assign(new Error(message), { status }); }

export function validateProduct(input) {
  if (!input || typeof input !== 'object') throw clientError('A product object is required.');
  const p = Object.fromEntries(productColumns.map((key) => [key, input[key]]));
  if (typeof p.product_id !== 'string' || !/^[A-Za-z0-9_-]{1,40}$/.test(p.product_id)) throw clientError('Product ID must contain 1–40 letters, numbers, underscores or hyphens.');
  for (const field of ['name','pack_size']) if (typeof p[field] !== 'string' || !p[field].trim() || p[field].length>150) throw clientError(`${field} must be non-empty text of at most 150 characters.`);
  if (!modelConfig.catalogue.categories.some((c) => c.id===p.category)) throw clientError('Choose a valid category.');
  for (const field of ['purchase_cost_cents','selling_price_cents','initial_quantity','popularity_weight']) if (!Number.isSafeInteger(p[field])) throw clientError(`${field} must be a whole integer.`);
  if (p.purchase_cost_cents<=0 || p.selling_price_cents<p.purchase_cost_cents || p.selling_price_cents>1000000) throw clientError('Costs must be positive and selling price must be at least purchase cost, within A$10,000 per unit.');
  if (p.initial_quantity<0 || p.initial_quantity>100000) throw clientError('Initial quantity must be between 0 and 100,000.');
  if (p.popularity_weight<1 || p.popularity_weight>5) throw clientError('Popularity weight must be 1–5.');
  if (![0,1,false,true].includes(p.perishable)) throw clientError('Perishable must be true or false.');
  p.perishable = Number(p.perishable);
  if (p.perishable && (!Number.isInteger(p.shelf_life_days) || p.shelf_life_days<1 || p.shelf_life_days>3650)) throw clientError('Perishable products require a shelf life of 1–3650 days.');
  if (!p.perishable) p.shelf_life_days = null;
  p.name=p.name.trim(); p.pack_size=p.pack_size.trim();
  return p;
}
export const openingCost = (products) => products.reduce((sum,p) => sum+p.purchase_cost_cents*p.initial_quantity,0);
export function validateCatalogue(products) {
  if (!Array.isArray(products) || !products.length) throw clientError('Add at least one product before starting a run.');
  const validated = products.map(validateProduct);
  if (new Set(validated.map((p)=>p.product_id)).size!==validated.length) throw clientError('Product IDs must be unique.');
  if (openingCost(validated)>modelConfig.finance.openingInventoryBudgetCents) throw clientError('Opening inventory exceeds the A$40,000 maximum.');
  return validated;
}
export function catalogueSummary(db) {
  const products=db.prepare('SELECT * FROM products ORDER BY product_id').all();
  return { products, openingInventoryCostCents: openingCost(products), openingInventoryBudgetCents: 4000000, openingOperatingCashCents: 1500000 };
}
export function seedProducts(db) {
  if (db.prepare("SELECT value FROM app_settings WHERE key='catalogue_seeded'").get()) return;
  const products=validateCatalogue(seedCatalogue);
  const insert=db.prepare(`INSERT OR IGNORE INTO products (${productColumns.join(',')}) VALUES (${productColumns.map(()=>'?').join(',')})`);
  db.exec('BEGIN');
  try {
    products.forEach((p)=>insert.run(...productColumns.map((key)=>p[key])));
    db.prepare("INSERT INTO app_settings(key,value) VALUES ('catalogue_seeded','v1')").run();
    db.exec('COMMIT');
  } catch(e) { db.exec('ROLLBACK'); throw e; }
}
export function saveProduct(db,input,existingId=null) {
  const p=validateProduct(input);
  if(existingId && p.product_id!==existingId) throw clientError('Product ID cannot be changed during an edit.');
  const current=db.prepare('SELECT * FROM products ORDER BY product_id').all();
  if(existingId && !current.some((x)=>x.product_id===existingId)) throw clientError('Product not found.',404);
  if(!existingId && current.some((x)=>x.product_id===p.product_id)) throw clientError('Product ID already exists.',409);
  validateCatalogue([...current.filter((x)=>x.product_id!==p.product_id),p]);
  if(existingId) db.prepare(`UPDATE products SET ${productColumns.slice(1).map((c)=>`${c}=?`).join(',')} WHERE product_id=?`).run(...productColumns.slice(1).map((c)=>p[c]),existingId);
  else db.prepare(`INSERT INTO products (${productColumns.join(',')}) VALUES (${productColumns.map(()=>'?').join(',')})`).run(...productColumns.map((c)=>p[c]));
  return p;
}
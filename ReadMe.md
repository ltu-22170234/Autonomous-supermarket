# CBD Market- Autonomous supermarket prototype
A local React + Vite, Node.js + Express and SQLite application for a fictional small unattended supermarket near Swanston Street/ Melbourne town hall. It simulates 60 days, retains operating history and provides the four required client acceptance areas in the website.

# Install and run locally

Open a terminal in the project root.
Install the dependencies
```sh
node --version
npm --version
npm ci
npm --prefix backend ci
npm --prefix frontend ci
```
Start the complete application:
```sh
npm run dev
```

Keep the terminal open and visit  http://127.0.0.1:5173/.
Stop both services with **Ctrl+C**

| Service | Address | Purpose |
| --- | --- | --- |
| React frontend | `http://127.0.0.1:5173/` | Store management and reporting interface |
| Express backend | `http://127.0.0.1:3001/` | JSON API; no frontend page at this address |
| Health check | `http://127.0.0.1:3001/api/health` | Backend and database readiness |

## SQLite storage and the submitted Run

The primary database is **backend/database/supermarket.sqlite**.
```text
project-root/
  README.md
  backend/
    db.js
    database/
      init.sql              # Schema; not the saved operating history
      supermarket.sqlite    # Active catalogue and complete saved runs
```
`backen/db.js` resolves `./database/supermarket.sqlite` against its own module location using `import.meta.url`. Moving the complete project to another folder preserves this relationship. There is one primary database containing several separate runs, rather than a database file for each run.

| SQLite tables | Retained evidence |
| --- | --- |
| `products` | Editable catalogue used to initialise future runs |
| `runs`, `run_configuration`, `run_products` | Run identity/status/designation, frozen assumptions, random seed and opening product/inventory snapshot |
| `customers`, `demand_items` | Arrival time, shopping mission and requested/fulfilled units, including no-purchase visits |
| `transactions`, `transaction_items` | Completed purchases, revenue, COGS, quantities and the batches used for each sale |
| `inventory_batches`, `inventory_movements`, `daily_inventory` | Receipt/expiry dates, opening stock, receipts, sales, write-offs and daily product balances |
| `replenishment_orders`, `replenishment_items`, `cash_movements`, `brain_events` | Paid orders, quantities, affordability evidence, cash balances and conditions/actions/reasons |
| `daily_records` | One commercial and operating summary for every simulated day |

Batch stock is calculated from recorded movement quantities; the `current_batch_stock` SQLite view exposes these balances. Stored history remains available after stopping/restarting the application or refreshing the browser.

### How the submitted Run loads
1. `backend/app.js` calls `openDatabase()` and passes the connection to the Express application. SQLite foreign keys and history-protection triggers are enabled, missing schema is created and catalogue seeding is checked. Existing simulation history is retained.
2. React requests `api/health`, `api/model` and `api/runs`. The model endpoint supplies defaults for **future** runs. The runs endpoint lists persisted runs with submitted ones first and completed-day counts.
3. / `frontend/src/App.jsx` initially chooses the run whose `is_submitted` flag is `1`. If there is no designated run, it falls back to the latest completed run.
4. The slected Run ID is passed to the Model Declaration, commercial report, Daily reports and assurance components. These requests `/api/runs/<Run ID>/model`. `/report`,`/days/<day>` and `/assurance`.
5. Backend queries retrieve that run's frozen configuration and stored history. **Loading the page does not recreate, replay or resume the submitted run**

he database bundled with this project identifies:

| Evidence | Saved value |
| --- | --- |
| Submitted Run name | **Run manager checkpoint** |
| Submitted Run ID | **`RUN-7c5b1eaa-b17d-4379-9382-8ece046a36b5`** |
| Run status and history | Completed; **60/60 days** retained |
| Model / engine version | **1.0.0 / 1.0.0** |
| Day 1 | **2026-01-05** |
| Product range | **60 products** across eight categories |
| Opening inventory purchase cost | **A$3,143.90** |
| Opening operating cash | **A$15,000.00**, funded separately |

## Inspection guide
Open the application and confirm that **Saved runs** marks **Run manager checkpoint** as **Submitted Run**. CLick its name if aother run is selected. All report views below ues the selected Run ID, which appear in the report heading.

### Suggested inspection sequence
1. Open **http://127.0.0.1:5173/** after starting both services. Near the top, locate **Saved runs** beneath **Create a simulation run**. The submitted row shows its name, Run ID, completed status, **60/60** retained days and **Submitted Run** badge. A selected run's name also displays **Selected**.
2. Click **Run manager checkpoint** to select it. Scroll to **Model declaration** and expand the assumptions. This the saved 1.0.0 declaration, even though **View draft model** shows the 1.1.0 defaults for new runs.
3. Scroll to **60-Day commercial report** and confirm its Run ID matches the submitted row. **Commercial performance** is initially selected. The navigation buttons within this report switch the view. these are sections of the same page rather than separate routes.
4. Review **Commmercial performance**, **Inventory and operations** and **Findings and recommendations** for the first three acceptance areas. The findings provide the written commercial reasoning and recommendations inside the website.
5. Click **Daily reports**, select **Day 1**, **Day 30** or **Day 60** with **Inspect day**, and inspect the daily totals and ledgers. Any of the 60 days is available.
6. Click **Reconciliation checks** to open **Commercial Assurance**. Confirm the Run ID, overall status, **60/60 days retained**, individual checks and **Retained evidence** counts. Any failing check displays its exception details. **Inspect Day 60 cash ledger** returns directly to the corresponding daily evidence.

| Required evidence | Where to find it |
| --- | --- |
| Submitted Run | **Saved runs**, including Run ID, status, retained days and submission badge |
| Model Declaration | **Model Declaration** below the run manager; expand the operating-rule and limitation sections |
| 60-Day Commercial Report, Part 1 | **Commercial performance**: store totals, shopper/basket measures, daily customer activity, category and product results |
| Part 2: inventory and autonomous operations | **Inventory and operations**: event counts, inventory health, significant conditions/actions/outcomes, persistent availability problems and closing stock |
| Part 3: commercial diagnosis | **Findings and recommendations**: three observation/evidence/diagnosis/implication/recommendation chains with model limitations |
| Part 4: Commercial Assurance | **Reconciliation checks**, opening the **Commercial Assurance** view with PASS/FAIL checks, exceptions and retained record counts |
| Daily Reports | **Daily Reports**, then choose any Day 1–60 using **Inspect day**, **Previous day** or **Next day** |

To follow the audit trail, use **Inspect Day** links from findings and operational cases, click product names to open frozen product details and inventory/batch/Brain hisotry and click sale or customer identifiers in Daily Reports to inspect basket, transaction and batch-allocation evidence.**Persistenct availability problems** includes expandable daily tables connecting requested/sold/unmet units, closing estimates, orders and next-day receipts and outcomes. 

The reusable Daily report contains **Daily inventory**, **Store Brain evidence**, **Transactions**, **All customer visits**, **Replenishment orders**, **Operating cash ledger** and **Inventory movement ledger**. Its heading shows the simulated date and weekday/weekend classification. Click **Sale #...** for sold quantities, unit prices/costs, batch receipt/expiry dates and the original intended basket. Click **Customer #...** for requested versus fulfilled products, including visits with no completed sale. Click a product name for its frozen catalogue settings and 60-day stock history. Use **Close** to return from an audit dialog.

For example, an expiry finding can be followed to its **Inspect Day** link, the daily Brain expiry action and inventory movement, then the product's batch history. A revenue total can be checked against the day's transaction list, an individual sale's lines, and its linked cash-ledger entry. Keep the same Run ID throughout the audit; changing the selected run switches every report and declaration to that run's evidence.

Assurance checks cover history completeness and opening budgets; inventory reconciliation; overselling, negative stock and expired sales; transaction/daily revenue and COGS; customer/demand reconciliation; operating cash; affordable next-day receipts; inventory valuation/write-offs; and database foreign keys. Legitimate stockouts, expiry losses and cash constraints are business outcomes, rather than automatic integrity failures. Missing event types are shown as zero.

## Create and inspect and additional run
1. In **Create a simulation run**, enter a **Run name** and **Day 1 date**.
2. Set **Base weekday customers** and **Base weekend customers**. Defaults are 160 and 130; each accepts a whole number from 0 to 500.
3. Optionally supply a **Random seed** from 0 to 4,294,967,295. Leave it blank to generate and store a seed automatically. Seed 0 is valid.
4. Click **Start 60-day run** and wait for completion. The backend processes the entire history in one request; there is no day-by-day animation.
5. The new run is selected automatically. Inspect its saved Model Declaration, reports, Daily Reports and Commercial Assurance. Earlier runs remain available in **Saved runs**.

## Architecture and data flow
```text
React management controls and report views
                 |
            /api via Vite
                 |
         Express JSON routes
                 |
Draft configuration + current catalogue
                 |
     Frozen configuration/product snapshot
                 |
   Customer world -> sales -> Store Brain
                 |
   SQLite operating history and daily records
                 |
   Report queries + reconciliation/assurance
                 |
     React reports and linked audit views
```

| Location | Responsibility |
| --- | --- |
| `backend/model/config.js`, `declaration.js` | Defaults for future runs and readable declarations saved at run start |
| `backend/data/catalogue.js`, `services/catalogue.js` | Seed range, pack sizes, costs/prices, popularity and catalogue validation |
| `backend/db.js`, `database/init.sql` | SQLite connection, schema, constraints and append-only history triggers |
| `backend/services/simulation.js` | Run snapshots, seeded customer/shopping generation, batches, sales, cash and daily evidence |
| `backend/services/brain.js` | Inventory assessment, replenishment allocation and eligible batch fulfilment |
| `backend/services/reports.js` | Run-scoped reports, findings, daily/audit queries and submission designation |
| `backend/services/assurance.js` | Reconciliation and integrity checks derived from recorded history |
| `backend/createApp.js`, `app.js` | Express routes and localhost server startup |
| `frontend/src/components/` | Run manager, Model Declaration, Catalogue, report views and audit dialog |
| `frontend/src/services/`, `hooks/` | API requests, formatting and cancellable data loading |

### From model inputs to auditable reports

1. **Configure:** the draft rules in `model/config.js` define customer activity, shopping missions, expiry and Brain rules. The editable SQLite `products` catalogue supplies the product range, costs, prices and opening quantities. The run form can override date, customer bases and seed.
2. **Freeze:** `POST /api/runs` validates the settings and budget, allocates a new Run ID, and saves `run_configuration` and `run_products` snapshots before the daily cycle. Subsequent catalogue/default changes apply to another run.
3. **Operate and record:** `simulation.js` maintains working batch and cash state in memory while inserting customers, intended demand, completed sales, batch allocations, stock/cash movements, orders and Brain events into SQLite. Each day also records `daily_records` and per-product `daily_inventory`. All 60 days are committed in one transaction; a failed run rolls back its inserts.
4. **Report:** `reports.js` aggregates sales, demand, stock movements and orders for the requested Run ID. It joins frozen product/category data to produce 60-day summaries, daily views, material cases, findings and audit details. Reports do not sample fresh customers or use an edited live catalogue to reprice historical sales.
5. **Assure:** `assurance.js` separately compares transaction headers with sale lines and daily totals, batch movements with stock snapshots, receipts with paid orders, and cash balances with recorded movements. React displays the resulting statuses, exception details and supporting counts. Selecting a run for submission invokes these checks before changing its designation.

| Read-only API path | Evidence returned |
| --- | --- |
| `/api/runs` | Saved run identities, submission flag and retained-day counts |
| `/api/runs/<Run ID>/model` | Saved model configuration, declaration and seed |
| `/api/runs/<Run ID>/report` | 60-day totals, category/product performance, operational cases and findings |
| `/api/runs/<Run ID>/days/<1–60>` | Daily summary and underlying customer, transaction, inventory, order, cash and Brain records |
| `/api/runs/<Run ID>/assurance` | Integrity checks, reconciliation rows, exceptions and record counts |
| `/api/runs/<Run ID>/products/<Product ID>` | Frozen product details, daily stock history, batches and Brain events |
| `/api/runs/<Run ID>/transactions/<Transaction ID>` | Sale lines, batch allocations and original requested basket |
| `/api/runs/<Run ID>/customers/<Customer ID>` | Arrival/mission, intended basket and fulfilment evidence |

These paths are available through the frontend's `/api` proxy on port 5173 or directly on the backend at port 3001. Replace angle-bracket placeholders with identifiers shown in the website.

The central reconciliation relationships are:

```text
Opening units + receipts - units sold - expired units = closing units
Transaction revenue = sum(quantity * recorded selling price)
Daily revenue = sum(recorded transaction totals for that day)
60-day revenue = sum(the 60 daily revenue figures)
Closing cash = A$15,000 + sales revenue - paid replenishment
```

All monetary ledger amounts use integer cents. COGS is the purchase cost of sold units; paid replenishment is a cash movement that can purchase units still in inventory or later written off. Consequently, gross profit and the change in cash need not match. Assurance tests these accounting relationships rather than treating a profitable run as automatically trustworthy.

## Customer world and Store brain
A 24-hour CBD store uses a daily count of `round(base customers × uniform multiplier from 0.8 to 1.2)`. Saturday/Sunday use weekend settings. Weighted time bands give weekdays a stronger lunchtime peak, and visitors are processed in arrival order. Three shopping missions—lunch/snack/drink, grocery top-up, and household/personal essentials—control category preferences and distinct basket-line ranges (1–3, 3–6 and 1–4). Weekday/weekend mission weights differ. Product selection uses relative popularity weights of 1–5. Each line requests one unit with 85% probability or two with 15% probability.

| Shopping mission | Weekday share | Weekend share | Distinct lines | Main preferences |
| --- | --- | --- | --- | --- |
| Lunch, snack or drink | 45% | 30% | 1–3 | Drinks, ready-to-eat food, snacks and fresh products |
| Grocery top-up | 35% | 45% | 3–6 | Pantry, dairy and fresh products, with smaller weights for other categories |
| Household or personal essentials | 20% | 25% | 1–4 | Household, personal, pantry, dairy and drinks |

For each visitor, a weighted time band and arrival minute are sampled, and a mission is selected using the weekday/weekend probabilities. The weekday 10:00–14:00 band receives 40% of arrivals, versus 28% on weekends. Basket-line counts are sampled within the mission's range. Each line selects an eligible category, then a not-yet-selected product using popularity weights; the same product is not selected twice within one intended basket. These are declared scenario assumptions, not observed Melbourne footfall.

Intended baskets are generated before availability checks. Only available, non-expired units are supplied; unfulfilled requests and visits without purchases remain recorded. The store does not substitute products. The range spans pantry, drinks, snacks, dairy/chilled, fresh/bakery, ready-to-eat, household and personal/convenience products. Opening quantities use popularity-based bootstrap demand and conservative stock cover, especially for short-lived items; spending the entire inventory budget is not a goal.

For example, a request for two units when only one valid unit is available records two requested, one fulfilled and one unmet. Only the fulfilled unit enters the sale, COGS and cash ledger. If no requested line can be fulfilled, the visitor and demand remain in history but no completed transaction is created. Customers, completed transactions and requested units therefore describe different quantities.

### Autonomous daily cycle and stock rules

**Daily cycle.** Receive yesterday's paid orders; remove expired batches; process customers and sales; review closing stock; place affordable orders on Days 1–59; retain daily totals and product evidence. Orders are paid when placed and arrive before the next day's customers. There is no Day 60 closing order because the simulation has no Day 61.

**Inventory rules.** A batch expires on `received day + shelf-life days`; expired stock is removed before sales. Fulfilment uses earliest expiry first, then receipt order. Remaining perishable stock within two days of expiry is flagged. Sold-out means zero closing saleable stock; low-stock means positive closing stock at or below two days of estimated demand. Tomorrow-expiring units are excluded when assessing replenishment needs. After 14 completed days, products whose recent 14-day sales are less than half their closing stock are flagged as slow movers.

**Demand versions and ordering.** The Submitted Run (1.0.0) estimates demand from the last up to seven completed days of **sales**, including zero-sale days. New runs (1.1.0) use **requested units, including unmet requests**, over the same window, multiplied by **1.10**. Both apply a 0.25-unit/day minimum. Normal target cover is seven days for non-perishables and three for perishables, capped by shelf life; slow-mover targets fall to three and one respectively. Orders cover the gap between target and usable stock when the reorder threshold is reached. Priority is projected sold-out products, lower cover, higher unit margin, then product ID. Quantities are reduced or deferred when cash cannot fund them; individual manager approval is not required.

### Replenishment calculation and worked example

For current 1.1.0 runs, the closing review uses:

```text
Estimated daily demand = max(0.25, mean recent requested units * 1.10)
Low-stock threshold = ceil(estimated daily demand * 2)
Target units = ceil(estimated daily demand * effective cover days)
Effective perishable cover = min(selected cover, max(1, shelf life - 1))
Desired order = max(0, target units - stock usable tomorrow)
Affordable order = min(desired order, floor(remaining cash / unit cost))
```

The desired-order formula is applied only when tomorrow's usable stock is at/below the threshold and the day is 1–59. The observation window includes the current completed day and up to six preceding days, including zeros; future shopper requests are never used. Before any completed-day observations exist, the bootstrap estimate is twice the product's popularity weight. Slow-mover status uses actual sales, even in 1.1.0, and reduces the selected cover before calculating the target.

**Illustrative example, not a reported simulation record:** at Day 10 close, a three-day perishable product has a recent mean of 10 requested units/day and five units usable tomorrow. The 1.1.0 estimate is 11, the threshold is 22, and shelf-life-capped cover is two days, giving a target of 22. Desired replenishment is therefore 17 units. If its purchase cost is A$2 and A$20 remains after higher-priority orders, the Brain orders 10 units for A$20, records seven deferred units under a cash constraint, and deducts the cost immediately. The ten units arrive before Day 11 customers, bringing usable stock to 15 before that day's sales/expiry changes. The delivered batch expires on Day 14. Its receipt, sales, expiry and closing balance remain traceable through the ledgers.

The Brain records the condition, reason, evidence and action for each relevant product/day event. Expiry actions remove units and record their purchase-cost loss; expiry warnings flag attention; slow-mover actions reduce future cover; low-stock/sold-out responses link any order; cash-constraint events explain reduced/deferred quantities. A receipt is an operational outcome, not proof that every later request was fulfilled: the daily availability table also exposes next-day sales and unmet units.

## AI collaboration
 I used OpenAI codex/ ChatGPT throughout this project to assist with  product-data drafting, modelling ideas,
coding, debugging, testing, analysis, visualisation and documentation. 

### Examples of changed, corrected or rejected AI-generated output
| Error or issue | Cause | Fix|
| --- | --- | --- |
| Table products has no column named product_id| The existing SQLite table differed from the scheman expected by catalogue.js | Align the stabase scheman with the catalogue's coloumn names|
| Variable name not consistent | Configuration and declaration code used different property names | Use recording consistently |
| ReferenceError: modelConfig is not defined | createApp.js referenced configuration without importing it | Import modelConfig from model/config.js |
| Post /api/runs HTTP 404/invalid Json | The run-creation route was missing | Add the POST route using simulateRun() before the API fallback |

 ** Demand estimation was revised after evidence review.
 The original sales-based approach could reinforce under-ordering during stockouts. The saved sandwich history showed 245 unment units and 51 sold-out closing events. The revised implementaion uses observed requests plust a declared safety allowance, preserves cash/expiry constraints, increments the model/engine versions and creates a separate  run instead of rewriting the original.
 


## Known limitations and troubleshooting

**Modelling limitations:** synthetic customer activity and product preferences; fixed prices with no discounts, substitution or price elasticity; all opening stock treated as freshly received; simplified calendar days with no daylight-saving hour adjustments, public holidays, weather or seasonality; fixed next-day supplier lead time without case sizes, minimum orders, shelf capacity or delivery delays. The new demand rule assumes intended requests can be observed, which would need a real lost-demand measurement method. Its 10% allowance is an assumption, not a calibrated optimum. Zero slow-mover or cash-constraint events in a commercial run do not demonstrate those branches.

**Commercial boundary:** gross profit is revenue minus COGS; expiry/write-offs are reported separately. Cash is opening cash plus sales receipts minus paid replenishment. Inventory is valued at recorded purchase cost. Rent, fit-out, refrigeration, utilities, insurance, autonomous-store hardware and corporate overhead are excluded; GST is not separately modelled. Positive trading profit/cash does not establish full-store viability.

**Technical limitations:** simulation and SQLite processing are synchronous and can block API responses during a run or assurance check. Bundled run durations range from approximately **2.03 to 7.66 seconds**; slower machines or larger customer settings may exceed a few seconds. The prototype is for local marker use and has no authentication, supplier integration, customer checkout hardware or multi-user production controls. Assurance checks establish internal consistency, not the accuracy of external demand assumptions.

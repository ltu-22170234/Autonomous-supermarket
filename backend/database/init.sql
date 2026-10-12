PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
INSERT OR IGNORE INTO app_metadata (key, value)
VALUES ('application', 'Supermarket Simulator');
CREATE TABLE IF NOT EXISTS products (
    product_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    pack_size TEXT NOT NULL,

    purchase_cost_cents INTEGER NOT NULL
        CHECK (purchase_cost_cents > 0),

    selling_price_cents INTEGER NOT NULL
        CHECK (selling_price_cents > 0),

    initial_quantity INTEGER NOT NULL
        CHECK (initial_quantity >= 0),

    perishable INTEGER NOT NULL
        CHECK (perishable IN (0, 1)),

    shelf_life_days INTEGER,

    popularity_weight INTEGER NOT NULL
        CHECK (popularity_weight BETWEEN 1 AND 5),

    CHECK (
        (
            perishable = 1
            AND shelf_life_days IS NOT NULL
            AND shelf_life_days >= 1
        )
        OR
        (
            perishable = 0
            AND shelf_life_days IS NULL
        )
    )
);
CREATE TABLE IF NOT EXISTS runs (
    run_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    status TEXT NOT NULL
        CHECK (status IN ('running', 'completed', 'failed')),

    model_version TEXT NOT NULL,
    engine_version TEXT NOT NULL,
    start_date TEXT NOT NULL,

    simulation_days INTEGER NOT NULL
        CHECK (simulation_days = 60),

    opening_inventory_cost_cents INTEGER NOT NULL
        CHECK (opening_inventory_cost_cents BETWEEN 0 AND 4000000),

    opening_cash_cents INTEGER NOT NULL
        CHECK (opening_cash_cents = 1500000),

    created_at TEXT NOT NULL,
    completed_at TEXT,
    duration_ms INTEGER,

    is_submitted INTEGER NOT NULL DEFAULT 0
        CHECK (is_submitted IN (0, 1)),

    CHECK (is_submitted = 0 OR status = 'completed')
);

CREATE UNIQUE INDEX IF NOT EXISTS one_submitted_run
ON runs(is_submitted)
WHERE is_submitted = 1;


CREATE TABLE IF NOT EXISTS run_configuration (
    run_id TEXT PRIMARY KEY REFERENCES runs(run_id),

    configuration_json TEXT NOT NULL
        CHECK (json_valid(configuration_json)),

    declaration_json TEXT NOT NULL
        CHECK (json_valid(declaration_json)),

    random_seed INTEGER NOT NULL
        CHECK (random_seed BETWEEN 0 AND 4294967295)
);


CREATE TABLE IF NOT EXISTS run_products (
    run_id TEXT NOT NULL REFERENCES runs(run_id),
    product_id TEXT NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    pack_size TEXT NOT NULL,

    purchase_cost_cents INTEGER NOT NULL
        CHECK (purchase_cost_cents > 0),

    selling_price_cents INTEGER NOT NULL
        CHECK (selling_price_cents > 0),

    initial_quantity INTEGER NOT NULL
        CHECK (initial_quantity >= 0),

    perishable INTEGER NOT NULL
        CHECK (perishable IN (0, 1)),

    shelf_life_days INTEGER,

    popularity_weight INTEGER NOT NULL
        CHECK (popularity_weight BETWEEN 1 AND 5),

    PRIMARY KEY (run_id, product_id),

    CHECK (
        (
            perishable = 1
            AND shelf_life_days IS NOT NULL
            AND shelf_life_days >= 1
        )
        OR
        (
            perishable = 0
            AND shelf_life_days IS NULL
        )
    )
);
CREATE TABLE IF NOT EXISTS customers (
    customer_id INTEGER PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES runs(run_id),

    day INTEGER NOT NULL CHECK (day BETWEEN 1 AND 60),

    arrival_minute INTEGER NOT NULL
        CHECK (arrival_minute BETWEEN 0 AND 1439),

    mission TEXT NOT NULL,

    UNIQUE (run_id, customer_id)
);


CREATE TABLE IF NOT EXISTS demand_items (
    demand_id INTEGER PRIMARY KEY,
    run_id TEXT NOT NULL,
    day INTEGER NOT NULL CHECK (day BETWEEN 1 AND 60),
    customer_id INTEGER NOT NULL,
    product_id TEXT NOT NULL,

    requested_units INTEGER NOT NULL
        CHECK (requested_units > 0),

    fulfilled_units INTEGER NOT NULL
        CHECK (
            fulfilled_units >= 0
            AND fulfilled_units <= requested_units
        ),

    UNIQUE (customer_id, product_id),

    FOREIGN KEY (run_id, customer_id)
        REFERENCES customers(run_id, customer_id),

    FOREIGN KEY (run_id, product_id)
        REFERENCES run_products(run_id, product_id)
);


CREATE TABLE IF NOT EXISTS transactions (
    transaction_id INTEGER PRIMARY KEY,
    run_id TEXT NOT NULL,
    day INTEGER NOT NULL CHECK (day BETWEEN 1 AND 60),
    customer_id INTEGER NOT NULL UNIQUE,

    revenue_cents INTEGER NOT NULL CHECK (revenue_cents > 0),
    cogs_cents INTEGER NOT NULL CHECK (cogs_cents > 0),
    units_sold INTEGER NOT NULL CHECK (units_sold > 0),
    line_count INTEGER NOT NULL CHECK (line_count > 0),

    UNIQUE (run_id, transaction_id),

    FOREIGN KEY (run_id, customer_id)
        REFERENCES customers(run_id, customer_id)
);
CREATE TABLE IF NOT EXISTS replenishment_orders (
    order_id INTEGER PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES runs(run_id),

    ordered_day INTEGER NOT NULL
        CHECK (ordered_day BETWEEN 1 AND 59),

    arrival_day INTEGER NOT NULL
        CHECK (arrival_day = ordered_day + 1),

    total_cost_cents INTEGER NOT NULL
        CHECK (total_cost_cents > 0),

    cash_before_cents INTEGER NOT NULL
        CHECK (cash_before_cents >= total_cost_cents),

    cash_after_cents INTEGER NOT NULL
        CHECK (
            cash_after_cents =
            cash_before_cents - total_cost_cents
        ),

    UNIQUE (run_id, order_id)
);


CREATE TABLE IF NOT EXISTS replenishment_items (
    order_item_id INTEGER PRIMARY KEY,
    run_id TEXT NOT NULL,
    order_id INTEGER NOT NULL,
    product_id TEXT NOT NULL,

    desired_units INTEGER NOT NULL CHECK (desired_units > 0),

    quantity INTEGER NOT NULL
        CHECK (quantity > 0 AND quantity <= desired_units),

    unit_cost_cents INTEGER NOT NULL CHECK (unit_cost_cents > 0),

    total_cost_cents INTEGER NOT NULL
        CHECK (total_cost_cents = quantity * unit_cost_cents),

    UNIQUE (run_id, order_item_id),
    UNIQUE (order_id, product_id),

    FOREIGN KEY (run_id, order_id)
        REFERENCES replenishment_orders(run_id, order_id),

    FOREIGN KEY (run_id, product_id)
        REFERENCES run_products(run_id, product_id)
);


CREATE TABLE IF NOT EXISTS inventory_batches (
    batch_id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    product_id TEXT NOT NULL,

    received_day INTEGER NOT NULL
        CHECK (received_day BETWEEN 1 AND 60),

    expires_on_day INTEGER
        CHECK (expires_on_day > received_day),

    quantity_received INTEGER NOT NULL
        CHECK (quantity_received > 0),

    unit_cost_cents INTEGER NOT NULL
        CHECK (unit_cost_cents > 0),

    source TEXT NOT NULL
        CHECK (source IN ('opening', 'replenishment')),

    order_item_id INTEGER UNIQUE,

    UNIQUE (run_id, batch_id),

    FOREIGN KEY (run_id, product_id)
        REFERENCES run_products(run_id, product_id),

    FOREIGN KEY (run_id, order_item_id)
        REFERENCES replenishment_items(run_id, order_item_id),

    CHECK (
        (
            source = 'opening'
            AND order_item_id IS NULL
            AND received_day = 1
        )
        OR
        (
            source = 'replenishment'
            AND order_item_id IS NOT NULL
        )
    )
);
CREATE TABLE IF NOT EXISTS transaction_items (
    item_id INTEGER PRIMARY KEY,
    run_id TEXT NOT NULL,
    transaction_id INTEGER NOT NULL,
    product_id TEXT NOT NULL,
    batch_id TEXT NOT NULL,

    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents > 0),
    unit_cost_cents INTEGER NOT NULL CHECK (unit_cost_cents > 0),

    revenue_cents INTEGER NOT NULL
        CHECK (revenue_cents = quantity * unit_price_cents),

    cogs_cents INTEGER NOT NULL
        CHECK (cogs_cents = quantity * unit_cost_cents),

    UNIQUE (run_id, item_id),

    FOREIGN KEY (run_id, transaction_id)
        REFERENCES transactions(run_id, transaction_id),

    FOREIGN KEY (run_id, product_id)
        REFERENCES run_products(run_id, product_id),

    FOREIGN KEY (run_id, batch_id)
        REFERENCES inventory_batches(run_id, batch_id)
);


CREATE TABLE IF NOT EXISTS brain_events (
    event_id INTEGER PRIMARY KEY,
    run_id TEXT NOT NULL,
    day INTEGER NOT NULL CHECK (day BETWEEN 1 AND 60),
    product_id TEXT NOT NULL,

    event_type TEXT NOT NULL CHECK (
        event_type IN (
            'low_stock',
            'sold_out',
            'expiry_warning',
            'expiry',
            'slow_mover',
            'replenishment',
            'cash_constraint'
        )
    ),

    action TEXT NOT NULL,
    reason TEXT NOT NULL,

    evidence_json TEXT NOT NULL
        CHECK (json_valid(evidence_json)),

    order_id INTEGER,

    UNIQUE (run_id, day, product_id, event_type),
    UNIQUE (run_id, event_id),

    FOREIGN KEY (run_id, product_id)
        REFERENCES run_products(run_id, product_id),

    FOREIGN KEY (run_id, order_id)
        REFERENCES replenishment_orders(run_id, order_id)
);
CREATE TABLE IF NOT EXISTS inventory_movements (
    movement_id INTEGER PRIMARY KEY,
    run_id TEXT NOT NULL,
    day INTEGER NOT NULL CHECK (day BETWEEN 1 AND 60),
    product_id TEXT NOT NULL,
    batch_id TEXT NOT NULL,

    movement_type TEXT NOT NULL CHECK (
        movement_type IN ('opening', 'receipt', 'sale', 'expiry')
    ),

    quantity_delta INTEGER NOT NULL,

    transaction_item_id INTEGER UNIQUE,
    order_item_id INTEGER,
    event_id INTEGER,

    FOREIGN KEY (run_id, product_id)
        REFERENCES run_products(run_id, product_id),

    FOREIGN KEY (run_id, batch_id)
        REFERENCES inventory_batches(run_id, batch_id),

    FOREIGN KEY (run_id, transaction_item_id)
        REFERENCES transaction_items(run_id, item_id),

    FOREIGN KEY (run_id, order_item_id)
        REFERENCES replenishment_items(run_id, order_item_id),

    FOREIGN KEY (run_id, event_id)
        REFERENCES brain_events(run_id, event_id),

    CHECK (
        (
            movement_type IN ('opening', 'receipt')
            AND quantity_delta > 0
        )
        OR
        (
            movement_type IN ('sale', 'expiry')
            AND quantity_delta < 0
        )
    ),

    CHECK (
        (
            movement_type = 'sale'
            AND transaction_item_id IS NOT NULL
        )
        OR
        (
            movement_type != 'sale'
            AND transaction_item_id IS NULL
        )
    ),

    CHECK (
        (
            movement_type = 'expiry'
            AND event_id IS NOT NULL
        )
        OR movement_type != 'expiry'
    )
);


CREATE TABLE IF NOT EXISTS cash_movements (
    cash_id INTEGER PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES runs(run_id),
    day INTEGER NOT NULL CHECK (day BETWEEN 1 AND 60),

    movement_type TEXT NOT NULL CHECK (
        movement_type IN ('opening', 'sale', 'replenishment')
    ),

    amount_cents INTEGER NOT NULL,

    balance_after_cents INTEGER NOT NULL
        CHECK (balance_after_cents >= 0),

    transaction_id INTEGER UNIQUE,
    order_id INTEGER UNIQUE,

    FOREIGN KEY (run_id, transaction_id)
        REFERENCES transactions(run_id, transaction_id),

    FOREIGN KEY (run_id, order_id)
        REFERENCES replenishment_orders(run_id, order_id),

    CHECK (
        (
            movement_type IN ('opening', 'sale')
            AND amount_cents > 0
        )
        OR
        (
            movement_type = 'replenishment'
            AND amount_cents < 0
        )
    ),

    CHECK (
        (
            movement_type = 'opening'
            AND transaction_id IS NULL
            AND order_id IS NULL
            AND day = 1
        )
        OR
        (
            movement_type = 'sale'
            AND transaction_id IS NOT NULL
            AND order_id IS NULL
        )
        OR
        (
            movement_type = 'replenishment'
            AND order_id IS NOT NULL
            AND transaction_id IS NULL
        )
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS one_opening_cash
ON cash_movements(run_id)
WHERE movement_type = 'opening';
CREATE TABLE IF NOT EXISTS daily_records (
    run_id TEXT NOT NULL REFERENCES runs(run_id),
    day INTEGER NOT NULL CHECK (day BETWEEN 1 AND 60),
    calendar_date TEXT NOT NULL,

    is_weekend INTEGER NOT NULL CHECK (is_weekend IN (0, 1)),

    customer_count INTEGER NOT NULL,
    transaction_count INTEGER NOT NULL,
    units_sold INTEGER NOT NULL,
    intended_units INTEGER NOT NULL,
    unmet_units INTEGER NOT NULL,

    revenue_cents INTEGER NOT NULL,
    cogs_cents INTEGER NOT NULL,
    write_off_cents INTEGER NOT NULL,
    write_off_units INTEGER NOT NULL,

    opening_cash_cents INTEGER NOT NULL,

    closing_cash_cents INTEGER NOT NULL
        CHECK (closing_cash_cents >= 0),

    replenishment_spend_cents INTEGER NOT NULL,
    received_units INTEGER NOT NULL,

    closing_stock_units INTEGER NOT NULL
        CHECK (closing_stock_units >= 0),

    closing_inventory_value_cents INTEGER NOT NULL
        CHECK (closing_inventory_value_cents >= 0),

    PRIMARY KEY (run_id, day)
);


CREATE TABLE IF NOT EXISTS daily_inventory (
    run_id TEXT NOT NULL,
    day INTEGER NOT NULL,
    product_id TEXT NOT NULL,

    opening_units INTEGER NOT NULL CHECK (opening_units >= 0),
    received_units INTEGER NOT NULL CHECK (received_units >= 0),
    sold_units INTEGER NOT NULL CHECK (sold_units >= 0),
    expired_units INTEGER NOT NULL CHECK (expired_units >= 0),
    closing_units INTEGER NOT NULL CHECK (closing_units >= 0),

    closing_value_cents INTEGER NOT NULL
        CHECK (closing_value_cents >= 0),

    demand_estimate REAL NOT NULL CHECK (demand_estimate > 0),

    low_stock_threshold INTEGER NOT NULL
        CHECK (low_stock_threshold >= 1),

    is_slow_mover INTEGER NOT NULL
        CHECK (is_slow_mover IN (0, 1)),

    PRIMARY KEY (run_id, day, product_id),

    FOREIGN KEY (run_id, day)
        REFERENCES daily_records(run_id, day),

    FOREIGN KEY (run_id, product_id)
        REFERENCES run_products(run_id, product_id)
);
CREATE INDEX IF NOT EXISTS customers_run_day
ON customers(run_id, day);

CREATE INDEX IF NOT EXISTS transactions_run_day
ON transactions(run_id, day);

CREATE INDEX IF NOT EXISTS demand_run_product
ON demand_items(run_id, product_id, day);

CREATE INDEX IF NOT EXISTS demand_run_day
ON demand_items(run_id, day);

CREATE INDEX IF NOT EXISTS transaction_items_run_product
ON transaction_items(run_id, product_id, transaction_id);

CREATE INDEX IF NOT EXISTS transaction_items_transaction
ON transaction_items(transaction_id, product_id);

CREATE INDEX IF NOT EXISTS movements_run_product_day
ON inventory_movements(run_id, product_id, day);

CREATE INDEX IF NOT EXISTS movements_run_batch
ON inventory_movements(run_id, batch_id, movement_id);

CREATE INDEX IF NOT EXISTS movements_batch
ON inventory_movements(batch_id, movement_id);

CREATE INDEX IF NOT EXISTS cash_run_day
ON cash_movements(run_id, day, cash_id);

CREATE INDEX IF NOT EXISTS brain_run_day
ON brain_events(run_id, day);

CREATE INDEX IF NOT EXISTS orders_run_day
ON replenishment_orders(run_id, ordered_day);


CREATE VIEW IF NOT EXISTS current_batch_stock AS
SELECT
    b.*,
    COALESCE(SUM(m.quantity_delta), 0) AS remaining_units
FROM inventory_batches AS b
LEFT JOIN inventory_movements AS m
    ON m.run_id = b.run_id
    AND m.batch_id = b.batch_id
GROUP BY b.batch_id;
export const SCHEMA = /* sql */ `
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  tier TEXT NOT NULL,
  location TEXT NOT NULL,
  scenario TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS accounts (
  customer_id TEXT PRIMARY KEY REFERENCES customers(id),
  status TEXT NOT NULL,
  failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  last_login_at TEXT,
  two_factor INTEGER NOT NULL DEFAULT 0,
  lock_reason TEXT
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  status TEXT NOT NULL,
  total REAL NOT NULL,
  items TEXT NOT NULL,
  delivered_items TEXT,
  created_at TEXT NOT NULL,
  delivered_at TEXT
);

CREATE TABLE IF NOT EXISTS shipments (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  carrier TEXT NOT NULL,
  tracking_number TEXT NOT NULL,
  status TEXT NOT NULL,
  events TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  order_id TEXT,
  amount REAL NOT NULL,
  status TEXT NOT NULL,
  gateway_status TEXT NOT NULL,
  method TEXT NOT NULL,
  merchant TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS subscriptions (
  customer_id TEXT PRIMARY KEY REFERENCES customers(id),
  plan TEXT NOT NULL,
  status TEXT NOT NULL,
  sync_status TEXT NOT NULL,
  renews_at TEXT,
  payment_txn_id TEXT
);

CREATE TABLE IF NOT EXISTS kb_articles (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  type TEXT NOT NULL,
  tags TEXT NOT NULL,
  intents TEXT NOT NULL,
  content TEXT NOT NULL,
  workflow TEXT,
  source TEXT NOT NULL DEFAULT 'seed',
  status TEXT NOT NULL DEFAULT 'published',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  channel TEXT NOT NULL DEFAULT 'web',
  status TEXT NOT NULL,
  intent TEXT,
  category TEXT,
  priority TEXT,
  sentiment TEXT,
  confidence REAL,
  summary TEXT,
  issue_state TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  resolved_at TEXT,
  resolution_type TEXT
);
CREATE INDEX IF NOT EXISTS idx_conversations_customer ON conversations(customer_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_conversations_created ON conversations(created_at);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  meta TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);

CREATE TABLE IF NOT EXISTS agent_runs (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  message_id TEXT,
  steps TEXT NOT NULL,
  llm_calls INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_runs_conversation ON agent_runs(conversation_id, created_at);

CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT REFERENCES conversations(id),
  customer_id TEXT NOT NULL REFERENCES customers(id),
  title TEXT NOT NULL,
  issue TEXT NOT NULL,
  investigation TEXT NOT NULL,
  actions_taken TEXT NOT NULL,
  recommended_next TEXT NOT NULL,
  status TEXT NOT NULL,
  status_label TEXT NOT NULL,
  priority TEXT NOT NULL,
  category TEXT NOT NULL,
  intent TEXT NOT NULL,
  sentiment TEXT NOT NULL,
  team TEXT NOT NULL,
  assignee TEXT,
  escalation_reasons TEXT NOT NULL,
  sla_due_at TEXT NOT NULL,
  first_response_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);

CREATE TABLE IF NOT EXISTS ticket_events (
  id TEXT PRIMARY KEY,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  actor TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ticket_events_ticket ON ticket_events(ticket_id, created_at);

CREATE TABLE IF NOT EXISTS csat (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL,
  rating INTEGER NOT NULL,
  comment TEXT,
  sentiment TEXT NOT NULL,
  resolution_quality TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS service_records (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  order_id TEXT,
  conversation_id TEXT,
  status TEXT NOT NULL,
  details TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('customer', 'admin')),
  customer_id TEXT REFERENCES customers(id),
  created_at TEXT NOT NULL,
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS products (
  sku TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price REAL NOT NULL CHECK (price >= 0),
  category TEXT NOT NULL,
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  description TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS inventory_events (
  id TEXT PRIMARY KEY,
  sku TEXT NOT NULL,
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL,
  ref TEXT,
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_inventory_events ON inventory_events(created_at);

CREATE TABLE IF NOT EXISTS pending_actions (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  conversation_id TEXT NOT NULL,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,
  amount REAL NOT NULL,
  summary TEXT NOT NULL,
  status TEXT NOT NULL,
  result TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_pending_customer ON pending_actions(customer_id, status);

CREATE TABLE IF NOT EXISTS security_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  customer_id TEXT,
  conversation_id TEXT,
  severity TEXT NOT NULL,
  detail TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_security_events ON security_events(created_at);
`;

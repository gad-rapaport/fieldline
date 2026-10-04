-- Fieldline initial schema.
-- Index choices are explained in docs/ARCHITECTURE.md#indexes.

CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TYPE user_role AS ENUM ('admin', 'technician', 'viewer');
CREATE TYPE request_status AS ENUM ('new', 'assigned', 'in_progress', 'on_hold', 'resolved', 'closed', 'cancelled');
-- Enum order matters: ORDER BY priority DESC puts urgent first.
CREATE TYPE request_priority AS ENUM ('low', 'normal', 'high', 'urgent');

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         citext NOT NULL UNIQUE,
  full_name     text NOT NULL CHECK (length(full_name) BETWEEN 1 AND 120),
  role          user_role NOT NULL,
  password_hash text NOT NULL,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Only a SHA-256 digest of the session token is stored, so a database leak does not leak live sessions.
CREATE TABLE sessions (
  id_hash    bytea PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  csrf_token text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX sessions_user_idx ON sessions (user_id);
CREATE INDEX sessions_expires_idx ON sessions (expires_at);

CREATE TABLE customers (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL CHECK (length(name) BETWEEN 2 AND 160),
  contact_name text NOT NULL DEFAULT '' CHECK (length(contact_name) <= 120),
  email        citext,
  phone        text NOT NULL DEFAULT '' CHECK (length(phone) <= 40),
  address      text NOT NULL DEFAULT '' CHECK (length(address) <= 240),
  city         text NOT NULL CHECK (length(city) BETWEEN 1 AND 80),
  notes        text NOT NULL DEFAULT '' CHECK (length(notes) <= 2000),
  version      integer NOT NULL DEFAULT 1,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
-- Business rule: one customer record per name and city. Also backs duplicate detection on create.
CREATE UNIQUE INDEX customers_name_city_uq ON customers (lower(name), lower(city));
-- Substring search on customer name (ILIKE '%term%') cannot use a B-tree; trigram GIN can.
CREATE INDEX customers_name_trgm_idx ON customers USING gin (name gin_trgm_ops);

CREATE TABLE service_requests (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref         bigint GENERATED ALWAYS AS IDENTITY (START WITH 1001) UNIQUE,
  customer_id uuid NOT NULL REFERENCES customers (id) ON DELETE RESTRICT,
  title       text NOT NULL CHECK (length(title) BETWEEN 3 AND 160),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 5000),
  priority    request_priority NOT NULL DEFAULT 'normal',
  status      request_status NOT NULL DEFAULT 'new',
  assignee_id uuid REFERENCES users (id) ON DELETE RESTRICT,
  due_at      timestamptz,
  created_by  uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  version     integer NOT NULL DEFAULT 1,
  -- The status machine is enforced in the service layer; these constraints are the last line of defence.
  CONSTRAINT service_requests_assignee_matches_status CHECK (
    (status = 'new' AND assignee_id IS NULL)
    OR status = 'cancelled'
    OR (status NOT IN ('new', 'cancelled') AND assignee_id IS NOT NULL)
  ),
  CONSTRAINT service_requests_resolved_at_matches_status CHECK (
    (status IN ('resolved', 'closed')) = (resolved_at IS NOT NULL)
  )
);
-- List screen: filter by status, newest first. Also serves dashboard status counts.
CREATE INDEX service_requests_status_created_idx ON service_requests (status, created_at DESC);
-- Technician queue and workload aggregation.
CREATE INDEX service_requests_assignee_status_idx ON service_requests (assignee_id, status);
-- Customer detail page: request history for one customer.
CREATE INDEX service_requests_customer_created_idx ON service_requests (customer_id, created_at DESC);
-- Overdue detection only ever looks at open requests; a partial index keeps it small.
CREATE INDEX service_requests_open_due_idx ON service_requests (due_at)
  WHERE status NOT IN ('resolved', 'closed', 'cancelled');
CREATE INDEX service_requests_title_trgm_idx ON service_requests USING gin (title gin_trgm_ops);

CREATE TABLE tasks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id  uuid NOT NULL REFERENCES service_requests (id) ON DELETE CASCADE,
  title       text NOT NULL CHECK (length(title) BETWEEN 2 AND 160),
  assignee_id uuid REFERENCES users (id) ON DELETE RESTRICT,
  is_done     boolean NOT NULL DEFAULT false,
  done_at     timestamptz,
  position    integer NOT NULL,
  version     integer NOT NULL DEFAULT 1,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tasks_done_at_matches_flag CHECK (is_done = (done_at IS NOT NULL))
);
CREATE INDEX tasks_request_position_idx ON tasks (request_id, position);
CREATE INDEX tasks_assignee_open_idx ON tasks (assignee_id) WHERE NOT is_done;

CREATE TABLE request_notes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES service_requests (id) ON DELETE CASCADE,
  author_id  uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  kind       text NOT NULL DEFAULT 'comment' CHECK (kind IN ('comment', 'resolution', 'cancellation', 'hold')),
  body       text NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX request_notes_request_created_idx ON request_notes (request_id, created_at);

CREATE TABLE activity_log (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id    uuid REFERENCES users (id) ON DELETE SET NULL,
  entity_type text NOT NULL CHECK (entity_type IN ('customer', 'request', 'task', 'session')),
  entity_id   uuid,
  action      text NOT NULL,
  summary     text NOT NULL,
  details     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
-- Timeline of one entity, newest first.
CREATE INDEX activity_log_entity_idx ON activity_log (entity_type, entity_id, id DESC);
-- Admin filter "what did this person do".
CREATE INDEX activity_log_actor_idx ON activity_log (actor_id, id DESC);

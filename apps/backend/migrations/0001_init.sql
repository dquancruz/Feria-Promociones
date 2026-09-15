CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE catalog_item_type AS ENUM ('service', 'product');
CREATE TYPE registration_status AS ENUM ('draft', 'confirmed');

CREATE TABLE catalog_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type catalog_item_type NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT UNIQUE NOT NULL,
  status registration_status NOT NULL DEFAULT 'draft',
  nombre TEXT NOT NULL DEFAULT '',
  apellidos TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  attend_at TIMESTAMPTZ,
  service_discount_pct NUMERIC(4, 2) NOT NULL DEFAULT 0,
  product_discount_pct NUMERIC(4, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at TIMESTAMPTZ
);

CREATE TABLE registration_items (
  registration_id UUID NOT NULL REFERENCES registrations (id) ON DELETE CASCADE,
  catalog_item_id UUID NOT NULL REFERENCES catalog_items (id),
  price_cents_snapshot INTEGER NOT NULL,
  PRIMARY KEY (registration_id, catalog_item_id)
);

CREATE INDEX registrations_email_idx ON registrations (email);
CREATE INDEX registration_items_catalog_item_id_idx ON registration_items (catalog_item_id);

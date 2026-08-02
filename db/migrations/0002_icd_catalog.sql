-- Manual mirror of config/SchemaBootstrap: the hospital's ICD reference
-- catalogs (code master tables). The app creates these at every startup and
-- seeds them from src/main/resources/db/icd_catalog_seed.sql when empty, so
-- running this file by hand is only ever needed for a DB the app never boots
-- against. Data lives in the resource seed, not here.

CREATE TABLE IF NOT EXISTS imed.icd_10 (
    code        text PRIMARY KEY,
    description text
);

CREATE TABLE IF NOT EXISTS imed.icd_9 (
    code        text PRIMARY KEY,
    description text
);

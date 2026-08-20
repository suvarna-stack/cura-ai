-- V2 — the hospital's ICD reference catalogs (code master tables).
--
-- Tables only; the ~1000 catalog rows are V6. They are split because the tables
-- are needed before V4 adds L02.4 (the one code the catalog lacks), and keeping
-- a 127KB data file out of the DDL file keeps this one readable.

CREATE TABLE IF NOT EXISTS imed.icd_10 (
    code        text PRIMARY KEY,
    description text
);

CREATE TABLE IF NOT EXISTS imed.icd_9 (
    code        text PRIMARY KEY,
    description text
);

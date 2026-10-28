-- =============================================================================
-- HemoConnect — Supabase PostgreSQL Database Schema
-- Complete, Idempotent, and Safe to Run Multiple Times
-- =============================================================================

-- Enable UUID extension (supported in PostgreSQL / Supabase)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- Table 1: donors
-- Stores registered blood donors willing to donate
-- =============================================================================
CREATE TABLE IF NOT EXISTS donors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name TEXT NOT NULL,
    age INTEGER NOT NULL CHECK (age >= 18 AND age <= 65),
    blood_group TEXT NOT NULL CHECK (blood_group IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
    phone TEXT NOT NULL CHECK (length(trim(phone)) >= 7 AND length(trim(phone)) <= 25),
    city TEXT NOT NULL,
    last_donation_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Comments for documentation
COMMENT ON TABLE donors IS 'Registered voluntary blood donors';
COMMENT ON COLUMN donors.id IS 'Unique identifier (UUID v4)';
COMMENT ON COLUMN donors.full_name IS 'Full legal or preferred name of the donor';
COMMENT ON COLUMN donors.age IS 'Donor age (must be between 18 and 65 years)';
COMMENT ON COLUMN donors.blood_group IS 'ABO/Rh blood group (A+, A-, B+, B-, AB+, AB-, O+, O-)';
COMMENT ON COLUMN donors.phone IS 'Primary contact telephone/mobile number';
COMMENT ON COLUMN donors.city IS 'City or residential area of the donor';
COMMENT ON COLUMN donors.last_donation_date IS 'Optional date of most recent donation';
COMMENT ON COLUMN donors.created_at IS 'Timestamp when the donor record was created';

-- Indexes for donors
CREATE INDEX IF NOT EXISTS idx_donors_blood_group ON donors(blood_group);
CREATE INDEX IF NOT EXISTS idx_donors_city ON donors(city);
CREATE INDEX IF NOT EXISTS idx_donors_created_at ON donors(created_at DESC);

-- =============================================================================
-- Table 2: recievers
-- Note: Exact name "recievers" as requested for compatibility with existing DB
-- Stores blood requests submitted for patients/receivers in need
-- =============================================================================
CREATE TABLE IF NOT EXISTS recievers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name TEXT NOT NULL,
    age INTEGER NOT NULL CHECK (age >= 0 AND age <= 120),
    blood_group TEXT NOT NULL CHECK (blood_group IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
    phone TEXT NOT NULL CHECK (length(trim(phone)) >= 7 AND length(trim(phone)) <= 25),
    city TEXT NOT NULL,
    units INTEGER NOT NULL CHECK (units > 0),
    hospital TEXT NOT NULL,
    urgency TEXT NOT NULL CHECK (urgency IN ('Low', 'Medium', 'High', 'Normal', 'Urgent', 'Critical')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Comments for documentation
COMMENT ON TABLE recievers IS 'Blood donation requests for patients and receivers';
COMMENT ON COLUMN recievers.id IS 'Unique identifier (UUID v4)';
COMMENT ON COLUMN recievers.full_name IS 'Full name of receiver or patient';
COMMENT ON COLUMN recievers.age IS 'Receiver age (must be between 0 and 120 years)';
COMMENT ON COLUMN recievers.blood_group IS 'Required ABO/Rh blood group';
COMMENT ON COLUMN recievers.phone IS 'Contact number of the requester/coordinator';
COMMENT ON COLUMN recievers.city IS 'City where the blood is required';
COMMENT ON COLUMN recievers.units IS 'Number of blood units needed (must be > 0)';
COMMENT ON COLUMN recievers.hospital IS 'Hospital or medical center name';
COMMENT ON COLUMN recievers.urgency IS 'Urgency level (Low, Medium, High, Normal, Urgent, Critical)';
COMMENT ON COLUMN recievers.created_at IS 'Timestamp when the request was recorded';

-- Indexes for recievers
CREATE INDEX IF NOT EXISTS idx_recievers_blood_group ON recievers(blood_group);
CREATE INDEX IF NOT EXISTS idx_recievers_city ON recievers(city);
CREATE INDEX IF NOT EXISTS idx_recievers_created_at ON recievers(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recievers_urgency ON recievers(urgency);

-- =============================================================================
-- Table 3: users (for Member Authentication)
-- Stores registered member credentials with securely hashed passwords
-- =============================================================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'donor' CHECK (role IN ('donor', 'recipient', 'admin')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Comments for users table
COMMENT ON TABLE users IS 'User member accounts for authentication';
COMMENT ON COLUMN users.id IS 'Unique member identifier (UUID v4)';
COMMENT ON COLUMN users.name IS 'Full display name of user';
COMMENT ON COLUMN users.email IS 'Unique email address for login';
COMMENT ON COLUMN users.password_hash IS 'Bcrypt salted password hash';
COMMENT ON COLUMN users.role IS 'User role: donor, recipient, or admin';
COMMENT ON COLUMN users.created_at IS 'Timestamp when user registered';

-- Index for user email lookup
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- =============================================================================
-- Row Level Security (RLS) Configuration
-- Optional: If RLS is enabled on Supabase, the service_role key bypasses RLS.
-- These policies grant public read/write access via Supabase Client when needed.
-- =============================================================================
ALTER TABLE donors ENABLE ROW LEVEL SECURITY;
ALTER TABLE recievers ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS automatically.
-- For anon / public API access (if queried directly from Supabase frontend):
DO $$
BEGIN
    -- donors policies
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'donors' AND policyname = 'Allow public read donors') THEN
        CREATE POLICY "Allow public read donors" ON donors FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'donors' AND policyname = 'Allow public insert donors') THEN
        CREATE POLICY "Allow public insert donors" ON donors FOR INSERT WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'donors' AND policyname = 'Allow public delete donors') THEN
        CREATE POLICY "Allow public delete donors" ON donors FOR DELETE USING (true);
    END IF;

    -- recievers policies
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'recievers' AND policyname = 'Allow public read recievers') THEN
        CREATE POLICY "Allow public read recievers" ON recievers FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'recievers' AND policyname = 'Allow public insert recievers') THEN
        CREATE POLICY "Allow public insert recievers" ON recievers FOR INSERT WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'recievers' AND policyname = 'Allow public delete recievers') THEN
        CREATE POLICY "Allow public delete recievers" ON recievers FOR DELETE USING (true);
    END IF;

    -- users policies (read & insert allowed)
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'users' AND policyname = 'Allow public insert users') THEN
        CREATE POLICY "Allow public insert users" ON users FOR INSERT WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'users' AND policyname = 'Allow public read users') THEN
        CREATE POLICY "Allow public read users" ON users FOR SELECT USING (true);
    END IF;
END $$;

-- =============================================================================
-- Safe Column Migration Checks (For existing tables with slight variations)
-- =============================================================================
DO $$
BEGIN
    -- Ensure last_donation_date exists in donors
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'donors' AND column_name = 'last_donation_date') THEN
        ALTER TABLE donors ADD COLUMN last_donation_date DATE;
    END IF;

    -- Ensure units exists in recievers
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'recievers' AND column_name = 'units') THEN
        ALTER TABLE recievers ADD COLUMN units INTEGER DEFAULT 1;
    END IF;

    -- Ensure hospital exists in recievers
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'recievers' AND column_name = 'hospital') THEN
        ALTER TABLE recievers ADD COLUMN hospital TEXT DEFAULT 'General Hospital';
    END IF;

    -- Ensure urgency exists in recievers
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'recievers' AND column_name = 'urgency') THEN
        ALTER TABLE recievers ADD COLUMN urgency TEXT DEFAULT 'Normal';
    END IF;
END $$;

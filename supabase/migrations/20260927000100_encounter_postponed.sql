-- Separate migration: a new enum value cannot be used in the transaction that adds it.
alter type public.encounter_status add value if not exists 'postponed' after 'scheduled';

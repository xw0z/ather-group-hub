
-- Drop NOT NULL first so we can null orphan owners
ALTER TABLE public.purity_trips ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.purity_clients ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.purity_activity_log ALTER COLUMN user_id DROP NOT NULL;

-- Null orphan owner references so the new FKs can be installed
UPDATE public.purity_clients
  SET user_id = NULL
  WHERE user_id IS NOT NULL
    AND user_id NOT IN (SELECT id FROM auth.users);

UPDATE public.purity_trips
  SET user_id = NULL
  WHERE user_id IS NOT NULL
    AND user_id NOT IN (SELECT id FROM auth.users);

UPDATE public.purity_activity_log
  SET user_id = NULL
  WHERE user_id IS NOT NULL
    AND user_id NOT IN (SELECT id FROM auth.users);

-- Re-add FKs with ON DELETE SET NULL
ALTER TABLE public.purity_trips DROP CONSTRAINT IF EXISTS purity_trips_user_id_fkey;
ALTER TABLE public.purity_trips
  ADD CONSTRAINT purity_trips_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.purity_clients DROP CONSTRAINT IF EXISTS purity_clients_user_id_fkey;
ALTER TABLE public.purity_clients
  ADD CONSTRAINT purity_clients_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.purity_activity_log DROP CONSTRAINT IF EXISTS purity_activity_log_user_id_fkey;
ALTER TABLE public.purity_activity_log
  ADD CONSTRAINT purity_activity_log_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

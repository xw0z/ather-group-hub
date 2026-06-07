
-- 1) Column + unique index + format check
ALTER TABLE public.refinery_clients
  ADD COLUMN IF NOT EXISTS code text;

CREATE UNIQUE INDEX IF NOT EXISTS refinery_clients_code_unique
  ON public.refinery_clients(code) WHERE code IS NOT NULL;

ALTER TABLE public.refinery_clients
  DROP CONSTRAINT IF EXISTS refinery_clients_code_format;
ALTER TABLE public.refinery_clients
  ADD CONSTRAINT refinery_clients_code_format
  CHECK (code IS NULL OR code ~ '^[A-Z]{2}[0-9]{4}$');

-- 2) Generator: meaningful 2-letter prefix + unique 4 random digits
CREATE OR REPLACE FUNCTION public.refinery_generate_client_code(_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cleaned text;
  words text[];
  word1 text;
  word2 text;
  prefix text;
  candidate text;
  attempts int;
  i int;
BEGIN
  cleaned := upper(regexp_replace(coalesce(_name,''), '[^A-Za-z ]', '', 'g'));
  cleaned := trim(regexp_replace(cleaned, '\s+', ' ', 'g'));
  IF cleaned = '' THEN cleaned := 'XX'; END IF;

  words := regexp_split_to_array(cleaned, ' ');
  word1 := words[1];
  word2 := CASE WHEN coalesce(array_length(words,1),0) >= 2 THEN words[2] ELSE NULL END;

  FOR attempts IN 1..20 LOOP
    prefix := NULL;
    IF word2 IS NOT NULL THEN
      IF attempts = 1 AND length(word1) >= 1 AND length(word2) >= 1 THEN
        prefix := substring(word1,1,1) || substring(word2,1,1);
      ELSIF attempts <= length(word2) AND length(word1) >= 1 THEN
        prefix := substring(word1,1,1) || substring(word2, attempts, 1);
      ELSIF (attempts - length(word2) + 1) <= length(word1) AND length(word1) >= 2 THEN
        i := attempts - length(word2) + 1;
        IF i >= 2 THEN
          prefix := substring(word1,1,1) || substring(word1, i, 1);
        END IF;
      END IF;
    ELSE
      IF attempts = 1 AND length(word1) >= 2 THEN
        prefix := substring(word1,1,2);
      ELSIF (attempts + 1) <= length(word1) THEN
        prefix := substring(word1,1,1) || substring(word1, attempts + 1, 1);
      END IF;
    END IF;

    IF prefix IS NULL OR length(prefix) <> 2 OR prefix !~ '^[A-Z]{2}$' THEN
      CONTINUE;
    END IF;

    -- Prefer unused prefix
    IF NOT EXISTS (SELECT 1 FROM public.refinery_clients WHERE substring(code,1,2) = prefix) THEN
      FOR i IN 1..50 LOOP
        candidate := prefix || lpad((floor(random()*10000))::int::text, 4, '0');
        IF NOT EXISTS (SELECT 1 FROM public.refinery_clients WHERE code = candidate) THEN
          RETURN candidate;
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  -- Fallback: reuse natural prefix, just ensure full code is unique
  prefix := CASE
    WHEN word2 IS NOT NULL AND length(word1) >= 1 AND length(word2) >= 1
      THEN substring(word1,1,1) || substring(word2,1,1)
    WHEN length(word1) >= 2
      THEN substring(word1,1,2)
    ELSE 'XX'
  END;
  IF prefix !~ '^[A-Z]{2}$' THEN prefix := 'XX'; END IF;

  FOR i IN 1..500 LOOP
    candidate := prefix || lpad((floor(random()*10000))::int::text, 4, '0');
    IF NOT EXISTS (SELECT 1 FROM public.refinery_clients WHERE code = candidate) THEN
      RETURN candidate;
    END IF;
  END LOOP;

  RAISE EXCEPTION 'Could not generate a unique client code';
END $$;

-- 3) Trigger: auto-fill / uppercase code on insert+update
CREATE OR REPLACE FUNCTION public.refinery_clients_set_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.code IS NULL OR btrim(NEW.code) = '' THEN
    NEW.code := public.refinery_generate_client_code(NEW.name);
  ELSE
    NEW.code := upper(btrim(NEW.code));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_rclients_set_code_ins ON public.refinery_clients;
CREATE TRIGGER trg_rclients_set_code_ins
  BEFORE INSERT ON public.refinery_clients
  FOR EACH ROW EXECUTE FUNCTION public.refinery_clients_set_code();

DROP TRIGGER IF EXISTS trg_rclients_set_code_upd ON public.refinery_clients;
CREATE TRIGGER trg_rclients_set_code_upd
  BEFORE UPDATE OF code ON public.refinery_clients
  FOR EACH ROW EXECUTE FUNCTION public.refinery_clients_set_code();

-- 4) Backfill any existing clients without a code (after the reset there are none, but keep it safe)
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id, name FROM public.refinery_clients WHERE code IS NULL LOOP
    UPDATE public.refinery_clients
      SET code = public.refinery_generate_client_code(r.name)
      WHERE id = r.id;
  END LOOP;
END $$;

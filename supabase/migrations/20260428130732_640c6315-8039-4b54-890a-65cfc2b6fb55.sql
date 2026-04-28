ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS source_text text,
  ADD COLUMN IF NOT EXISTS generation_status text NOT NULL DEFAULT 'ready';

ALTER TABLE public.topics
  ADD COLUMN IF NOT EXISTS generation_status text NOT NULL DEFAULT 'ready',
  ADD COLUMN IF NOT EXISTS difficulty_level integer NOT NULL DEFAULT 5;
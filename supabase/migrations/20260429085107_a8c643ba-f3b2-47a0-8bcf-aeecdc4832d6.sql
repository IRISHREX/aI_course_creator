ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS idx_courses_tags ON public.courses USING GIN(tags);
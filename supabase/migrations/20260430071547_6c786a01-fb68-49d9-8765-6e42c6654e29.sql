-- 1. Topic version history
CREATE TABLE public.topic_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id uuid NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  title text NOT NULL,
  summary text NOT NULL DEFAULT '',
  content jsonb NOT NULL DEFAULT '[]'::jsonb,
  quiz jsonb NOT NULL DEFAULT '[]'::jsonb,
  visualization text,
  mindmap jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  note text
);
CREATE INDEX idx_topic_versions_topic ON public.topic_versions(topic_id, created_at DESC);
ALTER TABLE public.topic_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Versions readable by admin" ON public.topic_versions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Versions insert by admin" ON public.topic_versions FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Versions delete by admin" ON public.topic_versions FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 2. Mindmap + TOC fields
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS mindmap jsonb;
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS toc jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.topics ADD COLUMN IF NOT EXISTS mindmap jsonb;

-- 3. Previous Year Questions
CREATE TABLE public.course_pyq (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  topic_id uuid REFERENCES public.topics(id) ON DELETE SET NULL,
  year int,
  question text NOT NULL,
  answer text NOT NULL DEFAULT '',
  marks int,
  source text,
  order_index int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_course_pyq_course ON public.course_pyq(course_id, year DESC, order_index);
ALTER TABLE public.course_pyq ENABLE ROW LEVEL SECURITY;
CREATE POLICY "PYQ readable by everyone" ON public.course_pyq FOR SELECT USING (true);
CREATE POLICY "PYQ insert by admin" ON public.course_pyq FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "PYQ update by admin" ON public.course_pyq FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "PYQ delete by admin" ON public.course_pyq FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER trg_pyq_updated BEFORE UPDATE ON public.course_pyq
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 4. Lesson images bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('lesson-images', 'lesson-images', true)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Lesson images public read" ON storage.objects FOR SELECT
  USING (bucket_id = 'lesson-images');
CREATE POLICY "Lesson images admin insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'lesson-images' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Lesson images admin update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'lesson-images' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Lesson images admin delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'lesson-images' AND public.has_role(auth.uid(), 'admin'));
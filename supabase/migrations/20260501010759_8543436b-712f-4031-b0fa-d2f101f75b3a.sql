CREATE TABLE public.bookmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  topic_id uuid NOT NULL,
  course_id uuid NOT NULL,
  page_index integer NOT NULL DEFAULT 0,
  word_index integer NOT NULL DEFAULT 0,
  label text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bookmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Bookmarks select own" ON public.bookmarks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Bookmarks insert own" ON public.bookmarks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Bookmarks update own" ON public.bookmarks FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Bookmarks delete own" ON public.bookmarks FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_bookmarks_user ON public.bookmarks(user_id, created_at DESC);
CREATE INDEX idx_bookmarks_topic ON public.bookmarks(topic_id);
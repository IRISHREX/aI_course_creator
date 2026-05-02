-- Add ingestion_source to course_pyq
ALTER TABLE public.course_pyq
  ADD COLUMN IF NOT EXISTS ingestion_source text DEFAULT 'manual';

-- PYQ <-> Topic many-to-many join
CREATE TABLE IF NOT EXISTS public.pyq_topics (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pyq_id uuid NOT NULL REFERENCES public.course_pyq(id) ON DELETE CASCADE,
  topic_id uuid NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pyq_id, topic_id)
);
CREATE INDEX IF NOT EXISTS pyq_topics_topic_idx ON public.pyq_topics(topic_id);
CREATE INDEX IF NOT EXISTS pyq_topics_pyq_idx ON public.pyq_topics(pyq_id);

ALTER TABLE public.pyq_topics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pyq_topics readable by everyone"
ON public.pyq_topics FOR SELECT USING (true);

CREATE POLICY "pyq_topics insert by admin"
ON public.pyq_topics FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "pyq_topics delete by admin"
ON public.pyq_topics FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

-- Update handle_new_user_role to grant super_admin to the configured email
CREATE OR REPLACE FUNCTION public.handle_new_user_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user') ON CONFLICT DO NOTHING;
  IF lower(NEW.email) IN ('sohejavadeveloper@gmail.com','soheljavadeveloper@gmail.com') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin') ON CONFLICT DO NOTHING;
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'super_admin') ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- Backfill super_admin & admin for the configured email if user already exists
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'super_admin'::app_role
FROM auth.users u
WHERE lower(u.email) IN ('sohejavadeveloper@gmail.com','soheljavadeveloper@gmail.com')
ON CONFLICT DO NOTHING;

INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'admin'::app_role
FROM auth.users u
WHERE lower(u.email) IN ('sohejavadeveloper@gmail.com','soheljavadeveloper@gmail.com')
ON CONFLICT DO NOTHING;

-- Update user_roles policies: super_admin can manage all
DROP POLICY IF EXISTS "Roles manageable by admin" ON public.user_roles;
DROP POLICY IF EXISTS "Roles readable by self" ON public.user_roles;

CREATE POLICY "Roles readable by self or staff"
ON public.user_roles FOR SELECT
USING (
  auth.uid() = user_id
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'super_admin')
);

CREATE POLICY "Roles manageable by super admin"
ON public.user_roles FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- Allow profiles viewable by staff for the admin dashboard
DROP POLICY IF EXISTS "Profiles viewable by staff" ON public.profiles;
CREATE POLICY "Profiles viewable by staff"
ON public.profiles FOR SELECT
USING (
  auth.uid() = id
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'super_admin')
);
-- 1. Roles enum + user_roles table
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL DEFAULT 'user',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE POLICY "Roles readable by self" ON public.user_roles
  FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Roles manageable by admin" ON public.user_roles
  FOR ALL USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 2. Courses table
CREATE TABLE public.courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  cover_emoji text DEFAULT '📡',
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Courses readable by everyone" ON public.courses FOR SELECT USING (true);
CREATE POLICY "Courses insert by admin" ON public.courses FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Courses update by admin" ON public.courses FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Courses delete by admin" ON public.courses FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 3. Add course_id to topics
ALTER TABLE public.topics ADD COLUMN course_id uuid REFERENCES public.courses(id) ON DELETE CASCADE;

-- Seed Mobile Computing course and link existing topics
INSERT INTO public.courses (slug, title, description, cover_emoji, order_index)
VALUES ('mobile-computing', 'Mobile Computing', 'Foundations to 5G — interactive lessons with visualizations, AI quizzes, and a certificate.', '📡', 1);

UPDATE public.topics SET course_id = (SELECT id FROM public.courses WHERE slug = 'mobile-computing')
WHERE course_id IS NULL;

ALTER TABLE public.topics ALTER COLUMN course_id SET NOT NULL;
CREATE INDEX idx_topics_course ON public.topics(course_id, unit, order_index);

-- 4. Tighten topic RLS to admin-only edits
DROP POLICY IF EXISTS "Topics insert by authenticated" ON public.topics;
DROP POLICY IF EXISTS "Topics update by authenticated" ON public.topics;
DROP POLICY IF EXISTS "Topics delete by authenticated" ON public.topics;

CREATE POLICY "Topics insert by admin" ON public.topics FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Topics update by admin" ON public.topics FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Topics delete by admin" ON public.topics FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 5. Grant admin to sohil if account exists
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role FROM auth.users
WHERE lower(email) = 'javadeveloper@therategmail.com'
ON CONFLICT DO NOTHING;

-- 6. Auto-assign 'user' role on signup, and admin if email matches
CREATE OR REPLACE FUNCTION public.handle_new_user_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user') ON CONFLICT DO NOTHING;
  IF lower(NEW.email) = 'javadeveloper@therategmail.com' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin') ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_role ON auth.users;
CREATE TRIGGER on_auth_user_created_role
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_role();
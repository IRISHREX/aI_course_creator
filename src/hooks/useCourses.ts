import { useCallback, useEffect, useState } from "react";
import { backendApi } from "@/integrations/api/client";

export interface Course {
  id: string;
  slug: string;
  title: string;
  description: string;
  cover_emoji: string | null;
  order_index: number;
  tags?: string[] | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export const useCourses = () => {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    const { data } = await backendApi.from("courses").select("*").order("order_index");
    setCourses((data as unknown as Course[]) ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  return { courses, loading, refresh };
};

export const useCourseBySlug = (slug: string | undefined) => {
  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    if (!slug) { setCourse(null); setLoading(false); return; }
    setLoading(true);
    backendApi.from("courses").select("*").eq("slug", slug).maybeSingle()
      .then(({ data }) => {
        if (!active) return;
        setCourse(data as unknown as Course);
        setLoading(false);
      });
    return () => { active = false; };
  }, [slug]);
  return { course, loading };
};

import { useEffect, useState } from "react";
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
  const refresh = async () => {
    const { data } = await backendApi.from("courses").select("*").order("order_index");
    setCourses((data as any as Course[]) ?? []);
    setLoading(false);
  };
  useEffect(() => { refresh(); }, []);
  return { courses, loading, refresh };
};

export const useCourseBySlug = (slug: string | undefined) => {
  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!slug) return;
    backendApi.from("courses").select("*").eq("slug", slug).maybeSingle()
      .then(({ data }) => { setCourse(data as any as Course); setLoading(false); });
  }, [slug]);
  return { course, loading };
};

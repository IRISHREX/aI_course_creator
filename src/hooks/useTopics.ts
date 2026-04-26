import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface QuizQ { q: string; options: string[]; answer: number }
export interface Topic {
  id: string;
  slug: string;
  unit: number;
  order_index: number;
  title: string;
  summary: string;
  content: any[];
  visualization: string | null;
  quiz: QuizQ[];
}
export interface Progress {
  topic_id: string;
  viewed: boolean;
  best_quiz_score: number;
  passed: boolean;
  attempts: number;
}

export const useTopics = () => {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    supabase.from("topics").select("*").order("unit").order("order_index").then(({ data }) => {
      if (active) { setTopics((data as Topic[]) ?? []); setLoading(false); }
    });
    return () => { active = false; };
  }, []);
  return { topics, loading, setTopics };
};

export const useProgress = () => {
  const { user } = useAuth();
  const [progress, setProgress] = useState<Record<string, Progress>>({});
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    if (!user) { setProgress({}); setLoading(false); return; }
    const { data } = await supabase.from("topic_progress").select("*").eq("user_id", user.id);
    const map: Record<string, Progress> = {};
    (data ?? []).forEach((p: any) => { map[p.topic_id] = p; });
    setProgress(map);
    setLoading(false);
  };

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [user?.id]);

  const markViewed = async (topicId: string) => {
    if (!user) return;
    const existing = progress[topicId];
    const next = { user_id: user.id, topic_id: topicId, viewed: true,
      best_quiz_score: existing?.best_quiz_score ?? 0, passed: existing?.passed ?? false,
      attempts: existing?.attempts ?? 0 };
    await supabase.from("topic_progress").upsert(next, { onConflict: "user_id,topic_id" });
    refresh();
  };

  const recordQuiz = async (topicId: string, score: number, total: number) => {
    if (!user) return;
    const pct = Math.round((score / total) * 100);
    const existing = progress[topicId];
    const best = Math.max(existing?.best_quiz_score ?? 0, pct);
    const passed = best >= 70;
    await supabase.from("topic_progress").upsert({
      user_id: user.id, topic_id: topicId, viewed: true,
      best_quiz_score: best, passed,
      attempts: (existing?.attempts ?? 0) + 1,
    }, { onConflict: "user_id,topic_id" });
    refresh();
    return { pct, passed };
  };

  return { progress, loading, markViewed, recordQuiz, refresh };
};

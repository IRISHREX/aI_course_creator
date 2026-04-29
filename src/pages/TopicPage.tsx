import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useAdmin";
import { useProgress, type Topic } from "@/hooks/useTopics";
import { useCourseBySlug } from "@/hooks/useCourses";
import { Visualization } from "@/components/Visualization";
import { Button } from "@/components/ui/button";
import { ReadMode, blocksToReadable } from "@/components/ReadMode";
import { ArrowLeft, ArrowRight, Edit3, Sparkles, Brain } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";

export default function TopicPage() {
  const { courseSlug, slug } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const { isAdmin } = useIsAdmin();
  const { course } = useCourseBySlug(courseSlug);
  const { progress, markViewed } = useProgress();
  const [topic, setTopic] = useState<Topic | null>(null);
  const [neighbors, setNeighbors] = useState<{ prev?: Topic; next?: Topic }>({});
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (!slug || !course?.id) return;
    (async () => {
      const { data: all } = await supabase.from("topics").select("*").eq("course_id", course.id).order("unit").order("order_index");
      const list = (all as any as Topic[]) ?? [];
      const idx = list.findIndex(t => t.slug === slug);
      if (idx >= 0) {
        setTopic(list[idx]);
        setNeighbors({ prev: list[idx - 1], next: list[idx + 1] });
      }
    })();
  }, [slug, course?.id]);

  useEffect(() => { if (topic && user) markViewed(topic.id); /* eslint-disable-next-line */ }, [topic?.id, user?.id]);

  if (!topic) return <div className="container py-20 text-muted-foreground">Loading…</div>;

  const p = progress[topic.id];

  const generateExtraQuiz = async () => {
    if (!isAdmin) { toast.error("Only admins can modify quizzes"); return; }
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-quiz", {
        body: { title: topic.title, summary: topic.summary, content: topic.content },
      });
      if (error) throw error;
      if (data?.questions?.length) {
        const merged = [...topic.quiz, ...data.questions];
        const { error: upErr } = await supabase.from("topics").update({ quiz: merged }).eq("id", topic.id);
        if (upErr) throw upErr;
        setTopic({ ...topic, quiz: merged });
        toast.success(`Added ${data.questions.length} AI-generated questions`);
      }
    } catch (e: any) {
      toast.error(e.message || "AI generation failed");
    } finally { setGenerating(false); }
  };

  const linkPrefix = `/course/${courseSlug}`;

  return (
    <div className="container max-w-5xl py-10">
      <div className="flex items-center justify-between mb-6">
        <Button asChild variant="ghost" size="sm">
          <Link to={linkPrefix}><ArrowLeft className="h-4 w-4 mr-1" /> {course?.title || "Course"}</Link>
        </Button>
        <div className="flex items-center gap-2">
          <ReadMode text={blocksToReadable(topic.title, topic.summary, topic.content)} />
          {isAdmin && (
            <Button asChild variant="neon" size="sm">
              <Link to={`${linkPrefix}/topic/${topic.slug}/edit`}><Edit3 className="h-4 w-4 mr-1" /> Edit</Link>
            </Button>
          )}
        </div>
      </div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="text-xs font-mono text-primary tracking-widest mb-2">UNIT {topic.unit} · LESSON {topic.order_index}</div>
        <h1 className="font-display text-3xl md:text-5xl font-bold">{topic.title}</h1>
        <p className="text-lg text-muted-foreground mt-3">{topic.summary}</p>
      </motion.div>

      <div className="my-8">
        <Visualization kind={topic.visualization} />
      </div>

      <div className="space-y-5">
        {topic.content.map((block: any, i: number) => {
          if (block.type === "text") return (
            <motion.p key={i} initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }}
              className="text-lg leading-relaxed">{block.value}</motion.p>
          );
          if (block.type === "highlight") return (
            <motion.div key={i} initial={{ opacity: 0, x: -10 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}
              className="glass border-l-4 border-primary p-5 rounded-xl flex gap-3">
              <Sparkles className="h-5 w-5 text-primary flex-none mt-0.5" />
              <div className="text-base">{block.value}</div>
            </motion.div>
          );
          if (block.type === "list") return (
            <div key={i} className="glass rounded-2xl p-6">
              {block.title && <div className="font-display font-bold text-lg mb-4">{block.title}</div>}
              <ul className="space-y-2">
                {block.items?.map((it: string, j: number) => (
                  <motion.li key={j} initial={{ opacity: 0, x: -10 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}
                    transition={{ delay: j * 0.05 }} className="flex gap-3">
                    <span className="h-6 w-6 rounded-full bg-primary/20 text-primary grid place-items-center text-xs font-mono mt-0.5">{j + 1}</span>
                    <span>{it}</span>
                  </motion.li>
                ))}
              </ul>
            </div>
          );
          if (block.type === "timeline") return (
            <div key={i} className="glass rounded-2xl p-6">
              <div className="space-y-3">
                {block.items?.map((it: any, j: number) => (
                  <motion.div key={j} initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}
                    transition={{ delay: j * 0.1 }} className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-xl bg-gradient-primary grid place-items-center font-display font-bold text-primary-foreground shadow-glow">{it.label}</div>
                    <div className="flex-1 h-px bg-border" />
                    <div className="flex-1 text-sm">{it.desc}</div>
                  </motion.div>
                ))}
              </div>
            </div>
          );
          return null;
        })}
      </div>

      {topic.quiz.length > 0 && (
        <div className="mt-10 glass rounded-2xl p-6 flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="font-display font-bold text-xl flex items-center gap-2"><Brain className="h-5 w-5 text-primary" /> Test yourself</div>
            <div className="text-sm text-muted-foreground">{topic.quiz.length} questions · pass with 70%+ {p?.passed && <span className="text-success">· Passed at {p.best_quiz_score}%</span>}</div>
          </div>
          <div className="flex gap-2">
            {isAdmin && (
              <Button variant="neon" size="sm" onClick={generateExtraQuiz} disabled={generating}>
                <Sparkles className="h-4 w-4 mr-1" /> {generating ? "Generating…" : "AI: add questions"}
              </Button>
            )}
            <Button variant="hero" size="lg" onClick={() => nav(`${linkPrefix}/topic/${topic.slug}/quiz`)}>
              Start quiz <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      <div className="mt-8 flex justify-between gap-4">
        {neighbors.prev ? (
          <Button asChild variant="ghost"><Link to={`${linkPrefix}/topic/${neighbors.prev.slug}`}><ArrowLeft className="h-4 w-4 mr-1" />{neighbors.prev.title}</Link></Button>
        ) : <span />}
        {neighbors.next && (
          <Button asChild variant="ghost"><Link to={`${linkPrefix}/topic/${neighbors.next.slug}`}>{neighbors.next.title}<ArrowRight className="h-4 w-4 ml-1" /></Link></Button>
        )}
      </div>
    </div>
  );
}

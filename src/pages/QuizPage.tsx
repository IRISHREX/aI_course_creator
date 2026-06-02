import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { backendApi } from "@/integrations/api/client";
import { useAuth } from "@/hooks/useAuth";
import { useProgress, type Topic } from "@/hooks/useTopics";
import { Button } from "@/components/ui/button";
import { ReadMode } from "@/components/ReadMode";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, BookOpen, Check, RotateCw, Trophy, X } from "lucide-react";

type QuizItem = {
  q: string;
  options: string[];
  answer: number;
  topicId: string;
  topicTitle: string;
};

const readableQuiz = (topics: Topic[]): QuizItem[] => topics.flatMap((topic) =>
  (Array.isArray(topic.quiz) ? topic.quiz : [])
    .slice(0, 10)
    .filter((q) => q?.q && Array.isArray(q.options) && q.options.length === 4 && Number.isInteger(q.answer))
    .map((q) => ({ ...q, topicId: topic.id, topicTitle: topic.title }))
);

export default function QuizPage() {
  const { courseSlug, slug } = useParams();
  const linkPrefix = `/course/${courseSlug}`;
  const { user } = useAuth();
  const { recordQuiz } = useProgress();
  const [topic, setTopic] = useState<Topic | null>(null);
  const [courseTitle, setCourseTitle] = useState("");
  const [quizItems, setQuizItems] = useState<QuizItem[]>([]);
  const [loadingQuiz, setLoadingQuiz] = useState(true);
  const [i, setI] = useState(0);
  const [picks, setPicks] = useState<number[]>([]);
  const [picked, setPicked] = useState<number | null>(null);
  const [done, setDone] = useState(false);
  const [result, setResult] = useState<{ pct: number; passed: boolean } | null>(null);

  useEffect(() => {
    setLoadingQuiz(true);
    setI(0);
    setPicks([]);
    setPicked(null);
    setDone(false);
    setResult(null);

    if (slug) {
      backendApi.from("topics").select("*").eq("slug", slug).maybeSingle().then(({ data }) => {
        const nextTopic = data as any as Topic;
        setTopic(nextTopic);
        setCourseTitle("");
        setQuizItems(readableQuiz(nextTopic ? [nextTopic] : []));
        setLoadingQuiz(false);
      });
      return;
    }

    (async () => {
      const { data: course } = await backendApi.from("courses").select("id,title").eq("slug", courseSlug!).maybeSingle();
      if (!course?.id) {
        setTopic(null);
        setCourseTitle("");
        setQuizItems([]);
        setLoadingQuiz(false);
        return;
      }
      const { data: topics } = await backendApi.from("topics").select("*").eq("course_id", course.id).order("unit").order("order_index");
      setTopic(null);
      setCourseTitle((course as any).title || "Course");
      setQuizItems(readableQuiz(((topics as any) || []) as Topic[]));
      setLoadingQuiz(false);
    })();
  }, [slug, courseSlug]);

  if (loadingQuiz) return <div className="container py-20 text-muted-foreground">Loading...</div>;
  if (!user) return (
    <div className="container py-20 text-center">
      <p className="text-muted-foreground mb-4">Sign in to take the quiz and earn your certificate.</p>
      <Button asChild variant="hero"><Link to="/auth">Sign in</Link></Button>
    </div>
  );
  if (!quizItems.length) return (
    <div className="container max-w-xl py-20 text-center">
      <BookOpen className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
      <h1 className="font-display text-2xl font-bold">No readable MCQs yet</h1>
      <p className="mt-2 text-muted-foreground">This quiz needs questions with 4 options and one correct answer.</p>
      <Button asChild variant="hero" className="mt-5"><Link to={linkPrefix}>Back to course</Link></Button>
    </div>
  );

  const isCourseQuiz = !slug;
  const q = quizItems[i];
  const total = quizItems.length;
  const correctCount = picks.filter((p, idx) => p === quizItems[idx]?.answer).length;
  const quizTitle = isCourseQuiz ? `${courseTitle} - full course MCQ` : topic?.title || "Quiz";
  const questionReadText = [
    `Question ${i + 1} of ${total}.`,
    q.q,
    ...q.options.map((opt, idx) => `Option ${String.fromCharCode(65 + idx)}. ${opt}`),
  ].join(" ");

  const choose = (n: number) => {
    if (picked !== null) return;
    setPicked(n);
    const newPicks = [...picks, n];
    setPicks(newPicks);
    setTimeout(async () => {
      if (i + 1 >= total) {
        const correct = newPicks.filter((p, idx) => p === quizItems[idx]?.answer).length;
        const pct = Math.round((correct / total) * 100);
        const passed = pct >= 70;

        if (isCourseQuiz) {
          const byTopic = new Map<string, { score: number; total: number }>();
          quizItems.forEach((item, idx) => {
            const current = byTopic.get(item.topicId) || { score: 0, total: 0 };
            current.total += 1;
            if (newPicks[idx] === item.answer) current.score += 1;
            byTopic.set(item.topicId, current);
          });
          for (const [topicId, stats] of byTopic) {
            await recordQuiz(topicId, stats.score, stats.total);
          }
          setResult({ pct, passed });
        } else if (topic) {
          const r = await recordQuiz(topic.id, correct, total);
          if (r) setResult(r);
        }
        setDone(true);
      } else {
        setI(i + 1);
        setPicked(null);
      }
    }, 900);
  };

  const reset = () => { setI(0); setPicks([]); setPicked(null); setDone(false); setResult(null); };

  if (done && result) {
    return (
      <div className="container max-w-2xl py-16 text-center">
        <motion.div initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          className="glass rounded-3xl p-10 shadow-elevated">
          <div className={`mx-auto h-24 w-24 rounded-full grid place-items-center mb-6 ${result.passed ? "bg-success/20 text-success animate-pulse-glow" : "bg-warning/20 text-warning"}`}>
            <Trophy className="h-12 w-12" />
          </div>
          <h1 className="font-display text-4xl font-bold">{result.passed ? "Passed!" : "Almost there"}</h1>
          <p className="text-6xl font-display font-bold text-gradient mt-4">{result.pct}%</p>
          <p className="text-muted-foreground mt-2">{correctCount} of {total} correct</p>
          <div className="flex gap-3 justify-center mt-8">
            <Button variant="neon" onClick={reset}><RotateCw className="h-4 w-4 mr-1" /> Retry</Button>
            <Button asChild variant="hero"><Link to={linkPrefix}>Continue <ArrowRight className="h-4 w-4 ml-1" /></Link></Button>
          </div>
          {result.passed && (
            <Button asChild variant="ghost" className="mt-3"><Link to={`${linkPrefix}/certificate`}>Check certificate progress</Link></Button>
          )}
        </motion.div>
      </div>
    );
  }

  return (
    <div className="container max-w-2xl py-12">
      <div className="flex items-center justify-between mb-6 gap-4">
        <div>
          <div className="text-xs font-mono text-muted-foreground">{quizTitle}</div>
          {isCourseQuiz && <div className="text-[11px] text-primary mt-1">{q.topicTitle}</div>}
        </div>
        <div className="flex items-center gap-2">
          <ReadMode text={questionReadText} />
          <div className="text-xs font-mono text-primary">Q {i + 1} / {total}</div>
        </div>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-8">
        <motion.div className="h-full bg-gradient-primary" initial={{ width: 0 }} animate={{ width: `${(i / total) * 100}%` }} />
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={i} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
          <h2 className="font-display text-2xl md:text-3xl font-semibold mb-8">{q.q}</h2>
          <div className="space-y-3">
            {q.options.map((opt, n) => {
              const isPicked = picked === n;
              const isCorrect = picked !== null && n === q.answer;
              const isWrong = isPicked && n !== q.answer;
              return (
                <motion.button
                  key={n}
                  whileHover={picked === null ? { x: 4 } : {}}
                  onClick={() => choose(n)}
                  disabled={picked !== null}
                  className={`w-full text-left glass rounded-xl p-4 flex items-center gap-3 transition-all border-2 ${
                    isCorrect ? "border-success bg-success/10" :
                    isWrong ? "border-destructive bg-destructive/10" :
                    picked !== null && n === q.answer ? "border-success bg-success/10" :
                    "border-transparent hover:border-primary/40"
                  }`}
                >
                  <span className="h-9 w-9 rounded-lg bg-primary/10 text-primary grid place-items-center font-mono text-sm">
                    {String.fromCharCode(65 + n)}
                  </span>
                  <span className="flex-1">{opt}</span>
                  {isCorrect && <Check className="h-5 w-5 text-success" />}
                  {isWrong && <X className="h-5 w-5 text-destructive" />}
                </motion.button>
              );
            })}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

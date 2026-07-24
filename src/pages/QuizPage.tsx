import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { backendApi } from "@/integrations/api/client";
import { useAuth } from "@/hooks/useAuth";
import { useProgress, type Topic } from "@/hooks/useTopics";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ReadMode } from "@/components/ReadMode";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, BookOpen, Check, CircleHelp, Flame, RotateCw, Target, Trophy, Volume2, VolumeX, X } from "lucide-react";
import { useCourseSettings } from "@/lib/appSettings";
import { playLessonSound } from "@/lib/lessonExperience";

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
  const [courseId, setCourseId] = useState<string | undefined>();
  const [courseTitle, setCourseTitle] = useState("");
  const [quizItems, setQuizItems] = useState<QuizItem[]>([]);
  const [loadingQuiz, setLoadingQuiz] = useState(true);
  const [i, setI] = useState(0);
  const [picks, setPicks] = useState<number[]>([]);
  const [picked, setPicked] = useState<number | null>(null);
  const [done, setDone] = useState(false);
  const [result, setResult] = useState<{ pct: number; passed: boolean } | null>(null);
  const [courseSettings, setCourseSettingsValue] = useCourseSettings(courseId);

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
        setCourseId(nextTopic?.course_id);
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
        setCourseId(undefined);
        setCourseTitle("");
        setQuizItems([]);
        setLoadingQuiz(false);
        return;
      }
      setCourseId(course.id);
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
  const streak = picks.slice().reverse().findIndex((pick, idx) => pick !== quizItems[picks.length - 1 - idx]?.answer);
  const visibleStreak = streak === -1 ? picks.length : streak;
  const progressValue = Math.round(((done ? total : i) / total) * 100);
  const quizTitle = isCourseQuiz ? `${courseTitle} - full course MCQ` : topic?.title || "Quiz";
  const questionReadText = [
    `Question ${i + 1} of ${total}.`,
    q.q,
    ...q.options.map((opt, idx) => `Option ${String.fromCharCode(65 + idx)}. ${opt}`),
  ].join(" ");

  const choose = (n: number) => {
    if (picked !== null) return;
    setPicked(n);
    playLessonSound(n === q.answer ? "success" : "error", courseSettings.lessonSoundsEnabled);
    const newPicks = [...picks, n];
    setPicks(newPicks);
    setTimeout(async () => {
      if (i + 1 >= total) {
        const correct = newPicks.filter((p, idx) => p === quizItems[idx]?.answer).length;
        const pct = Math.round((correct / total) * 100);
        const passed = pct >= 70;
        playLessonSound(passed ? "complete" : "error", courseSettings.lessonSoundsEnabled);

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
  const setSounds = (lessonSoundsEnabled: boolean) => {
    const next = { ...courseSettings, lessonSoundsEnabled };
    setCourseSettingsValue(next);
    playLessonSound("tap", lessonSoundsEnabled);
  };

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
          {courseSettings.quizEnhanced && (
            <div className="mt-5 grid gap-2 sm:grid-cols-3">
              <div className="rounded-xl border border-border/60 bg-background/40 p-3">
                <Target className="mx-auto mb-1 h-4 w-4 text-primary" />
                <div className="text-xs text-muted-foreground">Accuracy</div>
                <div className="font-display text-xl font-bold">{result.pct}%</div>
              </div>
              <div className="rounded-xl border border-border/60 bg-background/40 p-3">
                <Check className="mx-auto mb-1 h-4 w-4 text-success" />
                <div className="text-xs text-muted-foreground">Correct</div>
                <div className="font-display text-xl font-bold">{correctCount}</div>
              </div>
              <div className="rounded-xl border border-border/60 bg-background/40 p-3">
                <CircleHelp className="mx-auto mb-1 h-4 w-4 text-warning" />
                <div className="text-xs text-muted-foreground">Review</div>
                <div className="font-display text-xl font-bold">{total - correctCount}</div>
              </div>
            </div>
          )}
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
    <div className="container max-w-3xl py-10">
      <div className="mb-5 rounded-2xl border border-border/70 bg-background/70 p-4 shadow-sm backdrop-blur">
        <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-xs font-mono text-muted-foreground">{quizTitle}</div>
          {isCourseQuiz && <div className="text-[11px] text-primary mt-1">{q.topicTitle}</div>}
        </div>
        <div className="flex items-center gap-2">
          <ReadMode text={questionReadText} />
          <Button variant={courseSettings.lessonSoundsEnabled ? "neon" : "ghost"} size="icon" onClick={() => setSounds(!courseSettings.lessonSoundsEnabled)} title="Sounds on/off">
            {courseSettings.lessonSoundsEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </Button>
          <Badge variant="outline" className="font-mono">Q {i + 1} / {total}</Badge>
        </div>
      </div>
        <Progress value={progressValue} className="mt-4 h-2" />
        {courseSettings.quizEnhanced && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="secondary"><Target className="mr-1 h-3 w-3" /> {correctCount}/{picks.length || 0} correct</Badge>
            <Badge variant="outline"><Flame className="mr-1 h-3 w-3 text-warning" /> Streak {visibleStreak}</Badge>
            <Badge variant="outline">Pass mark 70%</Badge>
          </div>
        )}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={i} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
          <h2 className="font-display text-2xl md:text-3xl font-semibold mb-6 leading-tight">{q.q}</h2>
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
                  className={`w-full text-left rounded-xl p-4 flex items-center gap-3 transition-all border-2 bg-background/70 shadow-sm backdrop-blur ${
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
          {picked !== null && courseSettings.quizEnhanced && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`mt-5 rounded-xl border p-4 text-sm ${picked === q.answer ? "border-success/40 bg-success/10 text-success" : "border-destructive/40 bg-destructive/10 text-destructive"}`}>
              {picked === q.answer ? "Nice. That answer matches the lesson concept." : `Review this one. Correct answer: ${String.fromCharCode(65 + q.answer)}.`}
            </motion.div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

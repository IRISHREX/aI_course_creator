import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProgress, type Topic } from "@/hooks/useTopics";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { Check, X, Trophy, RotateCw, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import ThreeBackground from "@/components/ThreeBackground";

export default function QuizPage() {
  const { courseSlug, slug } = useParams();
  const nav = useNavigate();
  const linkPrefix = `/course/${courseSlug}`;
  const { user } = useAuth();
  const { recordQuiz } = useProgress();
  const [topic, setTopic] = useState<Topic | null>(null);
  const [i, setI] = useState(0);
  const [picks, setPicks] = useState<number[]>([]);
  const [picked, setPicked] = useState<number | null>(null);
  const [done, setDone] = useState(false);
  const [result, setResult] = useState<{ pct: number; passed: boolean } | null>(null);

  useEffect(() => {
    supabase.from("topics").select("*").eq("slug", slug!).maybeSingle().then(({ data }) => {
      setTopic(data as any as Topic);
    });
  }, [slug]);

  if (!topic) return <div className="container py-20 text-muted-foreground">Loading…</div>;
  if (!user) return (
    <div className="container py-20 text-center">
      <p className="text-muted-foreground mb-4">Sign in to take the quiz and earn your certificate.</p>
      <Button asChild variant="hero"><Link to="/auth">Sign in</Link></Button>
    </div>
  );

  const q = topic.quiz[i];
  const total = topic.quiz.length;
  const correctCount = picks.filter((p, idx) => p === topic.quiz[idx]?.answer).length;

  const choose = (n: number) => {
    if (picked !== null) return;
    setPicked(n);
    const newPicks = [...picks, n];
    setPicks(newPicks);
    setTimeout(async () => {
      if (i + 1 >= total) {
        const r = await recordQuiz(topic.id, newPicks.filter((p, idx) => p === topic.quiz[idx]?.answer).length, total);
        if (r) setResult(r);
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
    <>
      <ThreeBackground />
      <div className="container max-w-2xl py-12">
      <div className="flex items-center justify-between mb-6">
        <div className="text-xs font-mono text-muted-foreground">{topic.title}</div>
        <div className="text-xs font-mono text-primary">Q {i + 1} / {total}</div>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-8">
        <motion.div className="h-full bg-gradient-primary" initial={{ width: 0 }} animate={{ width: `${((i) / total) * 100}%` }} />
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
                    isWrong   ? "border-destructive bg-destructive/10" :
                    picked !== null && n === q.answer ? "border-success bg-success/10" :
                    "border-transparent hover:border-primary/40"
                  }`}>
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
    </>
  );
}

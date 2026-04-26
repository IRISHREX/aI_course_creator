import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useTopics, useProgress } from "@/hooks/useTopics";
import { CheckCircle2, Circle, Lock, Sparkles } from "lucide-react";

const UNIT_NAMES: Record<number, string> = {
  1: "Foundations", 2: "Cellular Networks", 3: "GSM & GPRS", 4: "Wireless & Data", 5: "Advanced Topics",
};

export default function CourseMap() {
  const { topics, loading } = useTopics();
  const { progress } = useProgress();

  if (loading) return <div className="container py-20 text-muted-foreground">Loading map…</div>;

  const byUnit: Record<number, typeof topics> = {};
  topics.forEach(t => { (byUnit[t.unit] ||= []).push(t); });

  return (
    <div className="container py-12">
      <div className="mb-10">
        <h1 className="font-display text-4xl md:text-5xl font-bold">Course <span className="text-gradient">Map</span></h1>
        <p className="text-muted-foreground mt-2">Click any node to enter the lesson. Glowing nodes are completed.</p>
      </div>

      <div className="space-y-12">
        {Object.keys(byUnit).map(k => {
          const u = Number(k);
          const items = byUnit[u];
          return (
            <motion.section key={u} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
              <div className="flex items-center gap-3 mb-6">
                <div className="h-10 w-10 rounded-xl bg-gradient-primary grid place-items-center font-display font-bold text-primary-foreground shadow-glow">{u}</div>
                <div>
                  <div className="text-xs font-mono text-muted-foreground">UNIT {u}</div>
                  <div className="font-display text-xl font-bold">{UNIT_NAMES[u]}</div>
                </div>
              </div>

              {/* Constellation row */}
              <div className="relative">
                {/* connecting line */}
                <div className="absolute top-1/2 left-4 right-4 h-px bg-gradient-to-r from-primary/40 via-secondary/40 to-primary/40 hidden md:block" />
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 relative">
                  {items.map((t, i) => {
                    const p = progress[t.id];
                    const passed = p?.passed;
                    const viewed = p?.viewed;
                    return (
                      <Link key={t.id} to={`/topic/${t.slug}`} className="group">
                        <motion.div
                          whileHover={{ y: -4, scale: 1.02 }}
                          className={`relative glass rounded-2xl p-4 h-full transition-all ${
                            passed ? "border-success/60 shadow-glow" : viewed ? "border-primary/50" : "hover:border-primary/40"
                          }`}>
                          <div className="flex items-start justify-between mb-2">
                            <div className={`h-9 w-9 rounded-lg grid place-items-center font-mono text-xs ${
                              passed ? "bg-success/20 text-success" : "bg-primary/10 text-primary"
                            }`}>
                              {u}.{t.order_index}
                            </div>
                            {passed ? <CheckCircle2 className="h-5 w-5 text-success animate-pulse-glow" /> :
                             viewed ? <Sparkles className="h-5 w-5 text-primary" /> :
                                      <Circle className="h-5 w-5 text-muted-foreground" />}
                          </div>
                          <div className="font-display font-semibold leading-tight">{t.title}</div>
                          <div className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{t.summary}</div>
                          {p && (
                            <div className="mt-3 text-[10px] font-mono text-muted-foreground">
                              best: <span className={passed ? "text-success" : "text-warning"}>{p.best_quiz_score}%</span>
                            </div>
                          )}
                        </motion.div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </motion.section>
          );
        })}
      </div>
    </div>
  );
}

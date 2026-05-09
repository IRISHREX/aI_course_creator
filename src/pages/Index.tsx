import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Radio, BookOpen, Sparkles, Award, Brain, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCourses } from "@/hooks/useCourses";
import ThreeSphereHome from "@/components/ThreeSphereHome";

const Index = () => {
  const { courses } = useCourses();

  return (
    <div className="relative overflow-hidden">
      <ThreeSphereHome />
      <section className="relative overflow-hidden">
        <div className="container py-24 md:py-32 grid md:grid-cols-2 gap-10 items-center">
          <div>
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass text-xs font-mono text-primary">
              <span className="h-2 w-2 rounded-full bg-primary animate-pulse-glow" />
              AI-POWERED LEARNING
            </motion.div>
            <h1 className="font-display text-5xl md:text-7xl font-bold mt-5 leading-[1.05]">
              Learn anything <span className="text-gradient">in motion.</span>
            </h1>
            <p className="mt-5 text-lg text-muted-foreground max-w-lg">
              Multi-course platform with animated visualizations, AI-generated quizzes, progress tracking, and downloadable certificates. Upload your own course material and let AI structure it.
            </p>
            <div className="flex gap-3 mt-8 flex-wrap">
              <Button asChild variant="hero" size="lg">
                <Link to="/courses"><BookOpen className="mr-1" /> Browse courses</Link>
              </Button>
            </div>
            <div className="flex gap-6 mt-10 text-sm">
              <div><div className="font-display text-2xl font-bold text-gradient">{courses.length}</div><div className="text-xs text-muted-foreground">courses</div></div>
              <div><div className="font-display text-2xl font-bold text-gradient">AI</div><div className="text-xs text-muted-foreground">quiz gen</div></div>
              <div><div className="font-display text-2xl font-bold text-gradient">∞</div><div className="text-xs text-muted-foreground">topics</div></div>
            </div>
          </div>

          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7 }}
            className="relative aspect-square max-w-md mx-auto">
            <div className="absolute inset-0 grid-bg rounded-3xl glass overflow-hidden">
              <div className="absolute inset-0 grid place-items-center">
                <div className="relative">
                  <div className="h-20 w-20 rounded-2xl bg-gradient-primary grid place-items-center shadow-glow animate-pulse-glow">
                    <Radio className="h-10 w-10 text-primary-foreground" />
                  </div>
                  {[0, 0.7, 1.4].map((d, i) => (
                    <span key={i} className="absolute inset-0 rounded-2xl border-2 border-primary animate-signal" style={{ animationDelay: `${d}s` }} />
                  ))}
                  {[Wifi, Brain, Sparkles, Award].map((Ic, i) => (
                    <div key={i} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-orbit"
                      style={{ animationDelay: `${i * -3}s` }}>
                      <div className="h-10 w-10 rounded-xl glass grid place-items-center text-primary shadow-glow-purple">
                        <Ic className="h-5 w-5" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      <section className="container py-16 grid md:grid-cols-3 gap-5">
        {[
          { icon: BookOpen, title: "Multi-Course", desc: "One platform, many courses. Upload PDFs or Google Docs and AI generates structured lessons." },
          { icon: Brain, title: "AI Quiz Generator", desc: "Generate fresh practice questions with Lovable AI on any topic." },
          { icon: Award, title: "Earn a Certificate", desc: "Pass every quiz (≥70%) to unlock and download your certificate per course." },
        ].map((f, i) => (
          <motion.div key={f.title} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }} transition={{ delay: i * 0.1 }}
            className="glass rounded-2xl p-6 hover:shadow-glow transition-all">
            <div className="h-12 w-12 rounded-xl bg-gradient-primary grid place-items-center shadow-glow mb-4">
              <f.icon className="h-6 w-6 text-primary-foreground" />
            </div>
            <h3 className="font-display font-bold text-xl mb-2">{f.title}</h3>
            <p className="text-sm text-muted-foreground">{f.desc}</p>
          </motion.div>
        ))}
      </section>
    </div>
  );
};

export default Index;

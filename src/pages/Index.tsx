import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Award, BookOpen, Brain } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCourses } from "@/hooks/useCourses";
import ThreeSphereHome from "@/components/ThreeSphereHome";

const Index = () => {
  const { courses } = useCourses();

  return (
    <div className="relative overflow-hidden">
      <ThreeSphereHome />

      <section className="relative overflow-hidden">
        <div className="container min-h-[calc(100vh-4rem)] py-10 md:py-20 grid lg:grid-cols-[minmax(0,0.9fr)_minmax(360px,0.8fr)] gap-8 items-center">
          <div className="relative z-10">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-card/45 px-3 py-1 text-xs font-mono text-primary shadow-sm"
            >
              <span className="h-2 w-2 rounded-full bg-primary" />
              AI-POWERED LEARNING
            </motion.div>

            <h1 className="font-display text-6xl md:text-7xl lg:text-8xl font-bold mt-6 leading-[1.02] max-w-2xl">
              Learn anything <span className="text-gradient">in motion.</span>
            </h1>

            <p className="mt-6 text-lg md:text-xl leading-8 text-muted-foreground max-w-xl">
              Multi-course platform with animated visualizations, AI-generated quizzes, progress tracking, and downloadable certificates. Upload your own course material and let AI structure it.
            </p>

            <div className="flex gap-3 mt-8 flex-wrap">
              <Button asChild variant="hero" size="lg">
                <Link to="/courses">
                  <BookOpen className="mr-1" />
                  Browse courses
                </Link>
              </Button>
            </div>

            <div className="flex gap-8 mt-12 text-sm">
              <div>
                <div className="font-display text-3xl font-bold text-gradient">{courses.length}</div>
                <div className="text-xs text-muted-foreground">courses</div>
              </div>
              <div>
                <div className="font-display text-3xl font-bold text-gradient">AI</div>
                <div className="text-xs text-muted-foreground">quiz gen</div>
              </div>
              <div>
                <div className="font-display text-3xl font-bold text-gradient">∞</div>
                <div className="text-xs text-muted-foreground">topics</div>
              </div>
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7 }}
            className="hidden lg:block min-h-[460px]"
            aria-hidden="true"
          />
        </div>
      </section>

      <section className="container py-16 grid md:grid-cols-3 gap-5">
        {[
          { icon: BookOpen, title: "Multi-Course", desc: "One platform, many courses. Upload PDFs or Google Docs and AI generates structured lessons." },
          { icon: Brain, title: "AI Quiz Generator", desc: "Generate fresh practice questions with Lovable AI on any topic." },
          { icon: Award, title: "Earn a Certificate", desc: "Pass every quiz (>=70%) to unlock and download your certificate per course." },
        ].map((f, i) => (
          <motion.div
            key={f.title}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.1 }}
            className="glass rounded-lg p-6 hover:shadow-glow transition-all"
          >
            <div className="h-12 w-12 rounded-lg bg-gradient-primary grid place-items-center shadow-glow mb-4">
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

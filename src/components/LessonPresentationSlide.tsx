import { motion } from "framer-motion";
import { ArrowRight, BookOpen, Braces, Lightbulb, Route, Sparkles } from "lucide-react";
import type { PresentationSlide } from "@/lib/lessonPresentation";
import { BlockRenderer } from "@/components/BlockRenderer";
import { Mindmap } from "@/components/Mindmap";

const icons = {
  title: BookOpen,
  bullets: Lightbulb,
  process: Route,
  comparison: Sparkles,
  timeline: Route,
  code: Braces,
  visual: Sparkles,
};

type Props = {
  slide: PresentationSlide;
  activeItem: number;
  sequence: number;
};

const itemMotion = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
};

function EmphasizedText({ children }: { children: string }) {
  const parts = children.split(/(`[^`]+`|\b[A-Z][A-Z0-9+#.-]{1,}\b|\b(?:definition|example|advantage|disadvantage|important|key)\b)/gi);
  return (
    <>
      {parts.map((part, index) => {
        const highlighted = /^`.*`$/.test(part)
          || /^[A-Z][A-Z0-9+#.-]{1,}$/.test(part)
          || /^(definition|example|advantage|disadvantage|important|key)$/i.test(part);
        return highlighted
          ? <span key={`${part}-${index}`} className="font-semibold text-cyan-300">{part.replace(/^`|`$/g, "")}</span>
          : part;
      })}
    </>
  );
}

export function LessonPresentationSlide({ slide, activeItem, sequence }: Props) {
  const Icon = icons[slide.layout];
  const bullets = slide.bullets || [];
  const items = slide.steps || bullets;
  const titleBullets = bullets.length
    ? bullets
    : [slide.narration.split(/(?<=[.!?])\s+/)[0]].filter(Boolean);
  const bulletGrid = bullets.length > 4 ? "sm:grid-cols-2 lg:grid-cols-3" : "sm:grid-cols-2";

  return (
    <motion.article
      key={`${slide.id}-${sequence}`}
      initial={{ opacity: 0, x: 36, scale: 0.985 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: -36, scale: 0.985 }}
      transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
      className="relative flex aspect-video w-full min-h-[560px] overflow-hidden rounded-lg border border-white/10 bg-[#0b1018]/95 text-white shadow-[0_30px_100px_rgba(0,0,0,0.65)] sm:min-h-[500px]"
    >
      <motion.div
        className="absolute inset-x-0 top-0 h-1 bg-cyan-400"
        initial={{ scaleX: 0, transformOrigin: "left" }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 0.8 }}
      />
      <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full border-[42px] border-cyan-300/10" />
      <div className="absolute bottom-14 left-0 h-px w-1/3 bg-cyan-300/20" />
      <div className="relative z-10 flex w-full flex-col p-6 sm:p-10 lg:p-14">
        <header className="mb-4 flex items-center justify-between gap-5 sm:mb-8">
          <p className="font-mono text-xs uppercase tracking-[0.22em] text-cyan-300">{slide.eyebrow}</p>
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-md border border-cyan-300/30 bg-cyan-300/10 text-cyan-200 shadow-[0_0_30px_rgba(34,211,238,0.18)]">
            <Icon className="h-5 w-5" />
          </div>
        </header>

        <motion.h1
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, duration: 0.5 }}
          className="max-w-5xl font-display text-3xl font-bold leading-[1.04] text-white sm:text-5xl lg:text-6xl"
        >
          <EmphasizedText>{slide.title}</EmphasizedText>
        </motion.h1>

        {slide.layout === "title" && (
          <div className="mt-auto grid max-w-4xl gap-4 border-l-2 border-primary pl-6">
            {titleBullets.map((item, index) => (
              <motion.p {...itemMotion} transition={{ delay: 0.18 + index * 0.1 }} key={item} className="text-lg leading-relaxed text-white/65 sm:text-2xl">
                <EmphasizedText>{item}</EmphasizedText>
              </motion.p>
            ))}
          </div>
        )}

        {(slide.layout === "bullets" || (slide.layout === "visual" && !slide.imageUrl && !slide.sourceBlock)) && (
          <div className={`mt-5 grid flex-1 content-center gap-2 sm:mt-8 sm:gap-3 ${bulletGrid}`}>
            {bullets.map((item, index) => (
              <motion.div
                {...itemMotion}
                transition={{ delay: 0.1 + index * 0.07 }}
                key={`${item}-${index}`}
                className={`flex items-start gap-2 rounded-md border p-2.5 transition-all duration-500 sm:min-h-20 sm:gap-3 sm:p-4 ${activeItem === index ? "border-cyan-300/70 bg-cyan-300/12 shadow-[0_0_36px_rgba(34,211,238,0.12)]" : "border-white/10 bg-white/[0.045]"}`}
              >
                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-md font-mono text-sm font-bold ${activeItem === index ? "bg-cyan-300 text-slate-950" : "bg-white/10 text-cyan-300"}`}>{index + 1}</span>
                <p className="text-sm font-medium leading-snug text-white/85 sm:text-lg sm:leading-relaxed"><EmphasizedText>{item}</EmphasizedText></p>
              </motion.div>
            ))}
          </div>
        )}

        {slide.layout === "process" && (slide.diagramCode || slide.sourceBlock?.type === "flowchart") ? (
          <div className="mt-8 grid flex-1 place-items-center overflow-auto rounded-md border border-white/10 bg-black/25 p-5">
            <div className="w-full max-w-4xl">
              <BlockRenderer block={slide.sourceBlock || { type: "flowchart", title: slide.title, code: slide.diagramCode }} />
            </div>
          </div>
        ) : (slide.layout === "process" || slide.layout === "timeline") && (
          <div className="mt-12 flex flex-1 items-center overflow-x-auto pb-4">
            <div className="flex min-w-full items-stretch">
              {items.map((item, index) => (
                <div key={`${item}-${index}`} className="flex min-w-0 flex-1 items-center">
                  <motion.div
                    {...itemMotion}
                    transition={{ delay: 0.1 + index * 0.08 }}
                    className={`flex min-h-40 min-w-44 flex-1 flex-col justify-between rounded-md border p-5 transition-all duration-500 ${activeItem === index ? "border-cyan-300/70 bg-cyan-300/10" : "border-white/10 bg-white/[0.045]"}`}
                  >
                    <span className="font-mono text-3xl font-bold text-cyan-300/70">{String(index + 1).padStart(2, "0")}</span>
                    <p className="mt-5 text-base font-semibold leading-snug text-white/85"><EmphasizedText>{item}</EmphasizedText></p>
                  </motion.div>
                  {index < items.length - 1 && <ArrowRight className="mx-2 h-6 w-6 shrink-0 text-cyan-300" />}
                </div>
              ))}
            </div>
          </div>
        )}

        {slide.layout === "comparison" && (
          <div className="mt-10 overflow-auto rounded-md border border-white/10">
            <table className="w-full border-collapse text-left">
              <thead className="bg-cyan-300/15 text-cyan-100">
                <tr>{slide.headers?.map((header) => <th key={header} className="p-4 text-sm font-semibold">{header}</th>)}</tr>
              </thead>
              <tbody>{slide.rows?.map((row, rowIndex) => (
                <tr key={rowIndex} className={rowIndex % 2 ? "bg-white/[0.06]" : "bg-black/20"}>
                  {row.map((cell, index) => <td key={index} className="border-t border-white/10 p-4 text-sm leading-relaxed text-white/80 sm:text-base"><EmphasizedText>{cell}</EmphasizedText></td>)}
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}

        {slide.layout === "code" && (
          <div className="mt-8 grid flex-1 gap-5 lg:grid-cols-[1.4fr_0.6fr]">
            <pre className="max-h-[360px] overflow-auto rounded-md border border-border bg-[#101418] p-6 text-sm leading-7 text-emerald-100"><code>{slide.code}</code></pre>
            <div className="space-y-3">{bullets.map((item, index) => <p key={item} className={`rounded-md border p-4 leading-relaxed ${activeItem === index ? "border-cyan-300/70 bg-cyan-300/10" : "border-white/10 bg-white/[0.045]"}`}><EmphasizedText>{item}</EmphasizedText></p>)}</div>
          </div>
        )}

        {slide.layout === "visual" && slide.sourceBlock && slide.sourceBlock.type !== "image" && (
          <div className="mt-8 grid flex-1 place-items-center overflow-auto rounded-md border border-white/10 bg-white/[0.04] p-5">
            <div className="w-full max-w-4xl"><BlockRenderer block={slide.sourceBlock} /></div>
          </div>
        )}

        {slide.layout === "visual" && slide.mindmap && (
          <div className="mt-8 min-h-0 flex-1 overflow-auto rounded-md border border-white/10 bg-white/[0.04] p-3">
            <Mindmap data={slide.mindmap as Parameters<typeof Mindmap>[0]["data"]} fitView />
          </div>
        )}

        {slide.layout === "visual" && slide.imageUrl && (
          <div className="mt-8 grid flex-1 items-center gap-8 lg:grid-cols-[1.25fr_0.75fr]">
            <img src={slide.imageUrl} alt={slide.caption || slide.title} className="max-h-[390px] w-full rounded-md border border-white/10 object-contain" />
            <div className="space-y-4">{bullets.map((item) => <p key={item} className="border-l-2 border-cyan-300 pl-4 text-lg leading-relaxed text-white/80"><EmphasizedText>{item}</EmphasizedText></p>)}</div>
          </div>
        )}

        <footer className="mt-auto hidden items-end justify-between pt-6 text-xs text-white/35 sm:flex">
          <span>Signal Academy</span>
          <span className="font-mono uppercase">{slide.layout}</span>
        </footer>
      </div>
    </motion.article>
  );
}

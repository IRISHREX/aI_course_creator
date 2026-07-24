import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { BlockRenderer, blockToText, countWords } from "@/components/BlockRenderer";
import { paginate } from "@/lib/lessonPaging";
import { KaraokeReadMode, karaokeSeek } from "@/components/KaraokeReadMode";
import { pageReadable } from "@/lib/lessonPaging";
import {
  ArrowLeft, ArrowRight, X, Play, Pause, ChevronLeft, ChevronRight,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  blocks: any[];
  startPage?: number;
}

/** Cinema-style presentation mode with subtle 3D ambient background. */
export function PlayMode({ open, onClose, title, subtitle, blocks, startPage = 0 }: Props) {
  const pages = useMemo(() => paginate(blocks || []), [blocks]);
  const [idx, setIdx] = useState(startPage);
  const [autoplay, setAutoplay] = useState(false);
  const [activeWord, setActiveWord] = useState<number | null>(null);
  const bgRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { if (open) setIdx(Math.min(startPage, Math.max(0, pages.length - 1))); }, [open, startPage, pages.length]);
  useEffect(() => { setActiveWord(null); }, [idx]);

  // Keyboard nav
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") { e.preventDefault(); setIdx((i) => Math.min(pages.length - 1, i + 1)); }
      else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
      else if (e.key.toLowerCase() === "p") setAutoplay((a) => !a);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, pages.length, onClose]);

  // Autoplay every ~18s
  useEffect(() => {
    if (!open || !autoplay) return;
    const t = setInterval(() => {
      setIdx((i) => (i < pages.length - 1 ? i + 1 : (setAutoplay(false), i)));
    }, 18000);
    return () => clearInterval(t);
  }, [open, autoplay, pages.length]);

  // 3D ambient background
  useEffect(() => {
    if (!open) return;
    const el = bgRef.current;
    if (!el) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const setSize = () => renderer.setSize(el.clientWidth, el.clientHeight);
    setSize();
    renderer.domElement.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;";
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, el.clientWidth / el.clientHeight, 0.1, 100);
    camera.position.z = 22;

    // Floating particle field
    const geo = new THREE.BufferGeometry();
    const N = 600;
    const positions = new Float32Array(N * 3);
    const speeds = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      positions[i * 3 + 0] = (Math.random() - 0.5) * 60;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 40;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 30;
      speeds[i] = 0.02 + Math.random() * 0.05;
    }
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0x66f0ff, size: 0.08, transparent: true, opacity: 0.75,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const points = new THREE.Points(geo, mat);
    scene.add(points);

    // Soft rotating wireframe ring for depth
    const ringGeo = new THREE.TorusGeometry(14, 0.05, 8, 200);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xa78bfa, transparent: true, opacity: 0.2, wireframe: true });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2.4;
    scene.add(ring);

    let raf = 0;
    let mounted = true;
    const tick = () => {
      if (!mounted) return;
      const pos = geo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < N; i++) {
        let y = pos.getY(i) + speeds[i] * 0.05;
        if (y > 20) y = -20;
        pos.setY(i, y);
      }
      pos.needsUpdate = true;
      points.rotation.y += 0.0006;
      ring.rotation.z += 0.0015;
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const onResize = () => {
      camera.aspect = el.clientWidth / el.clientHeight;
      camera.updateProjectionMatrix();
      setSize();
    };
    window.addEventListener("resize", onResize);
    return () => {
      mounted = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      renderer.domElement.remove();
      geo.dispose(); mat.dispose(); ringGeo.dispose(); ringMat.dispose();
      renderer.dispose();
    };
  }, [open]);

  if (!open) return null;

  const page = pages[idx];
  const pageText = page ? pageReadable(page.blocks) : "";

  // Touch swipe gestures
  const touchRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchRef.current = { x: t.clientX, y: t.clientY, t: Date.now() };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const s = touchRef.current;
    if (!s) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    const dt = Date.now() - s.t;
    touchRef.current = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.4 && dt < 700) {
      if (dx < 0) setIdx((i) => Math.min(pages.length - 1, i + 1));
      else setIdx((i) => Math.max(0, i - 1));
    } else if (dy < -80 && Math.abs(dy) > Math.abs(dx) * 1.4) {
      // swipe up to exit
      onClose();
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] cinema-vignette overflow-hidden"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {/* Ambient 3D layer */}
      <div ref={bgRef} className="absolute inset-0 overflow-hidden opacity-60 sm:opacity-70" />

      {/* Top bar */}
      <div className="absolute top-3 sm:top-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 max-w-[calc(100vw-1rem)]">
        <div className="toolbar-pill">
          <Button variant="ghost" size="sm" onClick={onClose} className="h-9 sm:h-8 px-3 rounded-full" aria-label="Exit play mode">
            <X className="h-4 w-4 sm:mr-1" /> <span className="hidden sm:inline">Exit</span>
          </Button>
          <div className="h-4 w-px bg-border/60 mx-0.5" />
          <Button variant="ghost" size="icon" className="h-9 w-9 sm:h-8 sm:w-8" onClick={() => setAutoplay((a) => !a)} title="Toggle autoplay (P)" aria-label="Toggle autoplay">
            {autoplay ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>
          <KaraokeReadMode text={pageText} onWordIndex={setActiveWord} />
          <div className="hidden sm:block h-4 w-px bg-border/60 mx-0.5" />
          <span className="hidden sm:inline-block px-2 text-[11px] font-mono text-muted-foreground tabular-nums">
            {idx + 1} / {pages.length}
          </span>
        </div>
      </div>

      {/* Slide */}
      <div className="absolute inset-0 flex items-center justify-center overflow-y-auto px-3 sm:px-6 pt-20 pb-28 sm:pt-24 sm:pb-24">
        <AnimatePresence mode="wait">
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 24, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.985 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="relative w-full max-w-4xl my-auto"
          >
            {idx === 0 && (
              <div className="mb-6 sm:mb-8 text-center px-2">
                <div className="text-[10px] sm:text-[11px] tracking-[0.3em] font-mono text-primary/80 uppercase mb-2 sm:mb-3">Presenting</div>
                <h1 className="font-display text-xl sm:text-3xl md:text-5xl font-bold leading-tight text-gradient">{title}</h1>
                {subtitle && <p className="mt-3 sm:mt-4 text-xs sm:text-sm md:text-base text-muted-foreground max-w-2xl mx-auto">{subtitle}</p>}
              </div>
            )}
            <div className="glass rounded-2xl border-white/10 p-4 sm:p-8 md:p-12 shadow-2xl shadow-black/50 space-y-4 sm:space-y-6 backdrop-blur-2xl">
              {page && (() => {
                let off = 0;
                return page.blocks.map((b: any, i: number) => {
                  const wo = off;
                  off += countWords(blockToText(b));
                  return (
                    <BlockRenderer
                      key={i}
                      block={b}
                      wordOffset={wo}
                      activeWordIndex={activeWord}
                      onWordClick={(w) => karaokeSeek(w)}
                    />
                  );
                });
              })()}
            </div>
            {/* Mobile-only swipe hint on first slide */}
            {idx === 0 && (
              <div className="sm:hidden mt-4 text-center text-[10px] font-mono uppercase tracking-widest text-muted-foreground/70">
                Swipe ← → to navigate · swipe ↑ to exit
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom nav — thumb-safe */}
      <div className="absolute bottom-3 sm:bottom-6 left-1/2 -translate-x-1/2 z-10 max-w-[calc(100vw-1rem)]">
        <div className="toolbar-pill">
          <Button
            variant="ghost"
            size="icon"
            className="h-11 w-11 sm:h-9 sm:w-9"
            disabled={idx === 0}
            onClick={() => setIdx((i) => Math.max(0, i - 1))}
            aria-label="Previous slide"
          >
            <ChevronLeft className="h-5 w-5 sm:h-4 sm:w-4" />
          </Button>
          <div className="flex items-center gap-1 px-2 max-w-[45vw] overflow-hidden">
            {/* Compact dots: on mobile, cap total dots shown with a windowed range */}
            {(() => {
              const total = pages.length;
              const maxDots = 9;
              if (total <= maxDots) {
                return pages.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setIdx(i)}
                    aria-label={`Go to slide ${i + 1}`}
                    className={`h-2 rounded-full transition-all duration-300 ${i === idx ? "w-6 sm:w-8 bg-primary shadow-[0_0_10px_hsl(var(--primary))]" : "w-2 bg-muted hover:bg-primary/40"}`}
                  />
                ));
              }
              const start = Math.max(0, Math.min(idx - Math.floor(maxDots / 2), total - maxDots));
              return Array.from({ length: maxDots }, (_, k) => {
                const i = start + k;
                return (
                  <button
                    key={i}
                    onClick={() => setIdx(i)}
                    aria-label={`Go to slide ${i + 1}`}
                    className={`h-2 rounded-full transition-all duration-300 ${i === idx ? "w-6 sm:w-8 bg-primary shadow-[0_0_10px_hsl(var(--primary))]" : "w-2 bg-muted hover:bg-primary/40"}`}
                  />
                );
              });
            })()}
          </div>
          <span className="sm:hidden px-1.5 text-[10px] font-mono text-muted-foreground tabular-nums">
            {idx + 1}/{pages.length}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-11 w-11 sm:h-9 sm:w-9"
            disabled={idx === pages.length - 1}
            onClick={() => setIdx((i) => Math.min(pages.length - 1, i + 1))}
            aria-label="Next slide"
          >
            <ChevronRight className="h-5 w-5 sm:h-4 sm:w-4" />
          </Button>
        </div>
      </div>

      {/* Edge tap zones — desktop only (mobile uses swipe) */}
      <button
        aria-label="Previous slide"
        className="hidden sm:flex absolute left-0 top-0 h-full w-[10%] cursor-w-resize opacity-0 hover:opacity-100 transition-opacity items-center justify-start pl-4"
        onClick={() => setIdx((i) => Math.max(0, i - 1))}
      >
        <ArrowLeft className="h-8 w-8 text-primary/70" />
      </button>
      <button
        aria-label="Next slide"
        className="hidden sm:flex absolute right-0 top-0 h-full w-[10%] cursor-e-resize opacity-0 hover:opacity-100 transition-opacity items-center justify-end pr-4"
        onClick={() => setIdx((i) => Math.min(pages.length - 1, i + 1))}
      >
        <ArrowRight className="h-8 w-8 text-primary/70" />
      </button>
    </div>,
    document.body,
  );
}

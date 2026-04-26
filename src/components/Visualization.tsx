import { motion } from "framer-motion";

/**
 * Pure SVG/CSS visualizations keyed by topic.visualization.
 * No external image deps — all animated.
 */

const Wrap = ({ children }: { children: React.ReactNode }) => (
  <div className="relative w-full aspect-video rounded-2xl glass overflow-hidden grid-bg">
    {children}
  </div>
);

const Phone = ({ x = 50, y = 50 }: { x?: number; y?: number }) => (
  <g transform={`translate(${x} ${y})`}>
    <rect x="-12" y="-22" width="24" height="44" rx="5" fill="hsl(var(--card))" stroke="hsl(var(--primary))" strokeWidth="1.5" />
    <rect x="-9" y="-18" width="18" height="32" rx="2" fill="hsl(var(--primary)/0.15)" />
    <circle cx="0" cy="18" r="1.5" fill="hsl(var(--primary))" />
  </g>
);

const Tower = ({ x, y, color = "hsl(var(--primary))" }: any) => (
  <g transform={`translate(${x} ${y})`}>
    <polygon points="0,-30 -8,15 8,15" fill="none" stroke={color} strokeWidth="1.5" />
    <line x1="-4" y1="0" x2="4" y2="0" stroke={color} strokeWidth="1" />
    <line x1="-6" y1="8" x2="6" y2="8" stroke={color} strokeWidth="1" />
    <circle cx="0" cy="-30" r="2" fill={color} />
  </g>
);

const Signal = ({ x, y, delay = 0, color = "hsl(var(--primary))" }: any) => (
  <circle cx={x} cy={y} r="6" fill="none" stroke={color} strokeWidth="1.5"
    style={{ transformOrigin: `${x}px ${y}px`, animationDelay: `${delay}s` }}
    className="animate-signal opacity-0" />
);

export function Visualization({ kind }: { kind: string | null }) {
  if (!kind) return null;

  switch (kind) {
    case "intro":
    case "characteristics":
      return (
        <Wrap>
          <svg viewBox="0 0 400 225" className="w-full h-full">
            <Tower x={200} y={130} />
            {[0, 0.6, 1.2].map((d, i) => <Signal key={i} x={200} y={100} delay={d} />)}
            <Phone x={80} y={150} />
            <Phone x={320} y={150} />
            <motion.g animate={{ x: [0, 60, 0] }} transition={{ duration: 6, repeat: Infinity }}>
              <Phone x={150} y={170} />
            </motion.g>
          </svg>
        </Wrap>
      );

    case "pillars":
      return (
        <Wrap>
          <div className="absolute inset-0 grid grid-cols-5 gap-2 p-6">
            {["Nomadic","Anywhere","VHE","Portable","Ubiquitous"].map((p, i) => (
              <motion.div key={p}
                initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
                transition={{ delay: i * 0.15 }}
                className="flex flex-col items-center justify-end">
                <motion.div
                  animate={{ height: [60, 120, 60] }}
                  transition={{ duration: 3, repeat: Infinity, delay: i * 0.3 }}
                  className="w-full bg-gradient-primary rounded-t-lg shadow-glow"
                />
                <span className="text-[10px] font-mono mt-2 text-muted-foreground">{p}</span>
              </motion.div>
            ))}
          </div>
        </Wrap>
      );

    case "challenges":
      return (
        <Wrap>
          <div className="absolute inset-0 flex items-center justify-around p-6">
            {[
              { icon: "🔋", label: "Battery" },
              { icon: "📶", label: "Network" },
              { icon: "🔒", label: "Security" },
              { icon: "⚡", label: "CPU" },
              { icon: "📱", label: "Screen" },
            ].map((c, i) => (
              <motion.div key={c.label} className="text-center"
                animate={{ y: [0, -8, 0] }}
                transition={{ duration: 2.5, repeat: Infinity, delay: i * 0.3 }}>
                <div className="text-4xl mb-2">{c.icon}</div>
                <div className="text-xs font-mono text-muted-foreground">{c.label}</div>
              </motion.div>
            ))}
          </div>
        </Wrap>
      );

    case "telephony":
      return (
        <Wrap>
          <svg viewBox="0 0 400 225" className="w-full h-full">
            <Phone x={60} y={130} />
            <Tower x={200} y={130} />
            <Tower x={340} y={130} color="hsl(var(--secondary))" />
            <motion.line x1="60" y1="120" x2="200" y2="100" stroke="hsl(var(--primary))" strokeDasharray="4 4"
              animate={{ strokeDashoffset: [0, -16] }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} />
            <motion.line x1="200" y1="100" x2="340" y2="100" stroke="hsl(var(--secondary))" strokeDasharray="4 4"
              animate={{ strokeDashoffset: [0, -16] }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} />
            {[0, 0.6, 1.2].map((d, i) => <Signal key={i} x={200} y={100} delay={d} />)}
            <text x="200" y="200" textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize="10" fontFamily="monospace">MS → BS → MSC</text>
          </svg>
        </Wrap>
      );

    case "generations":
      return (
        <Wrap>
          <div className="absolute inset-0 flex items-end justify-between p-8 gap-3">
            {[
              { g: "1G", h: 20, c: "hsl(186 100% 30%)" },
              { g: "2G", h: 35, c: "hsl(186 100% 40%)" },
              { g: "3G", h: 55, c: "hsl(220 100% 55%)" },
              { g: "4G", h: 80, c: "hsl(270 90% 60%)" },
              { g: "5G", h: 100, c: "hsl(310 100% 65%)" },
            ].map((g, i) => (
              <motion.div key={g.g} className="flex-1 flex flex-col items-center gap-2"
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.15 }}>
                <motion.div
                  className="w-full rounded-t-lg shadow-glow relative overflow-hidden"
                  style={{ background: g.c, height: `${g.h}%` }}
                  animate={{ boxShadow: [`0 0 10px ${g.c}`, `0 0 30px ${g.c}`, `0 0 10px ${g.c}`] }}
                  transition={{ duration: 2, repeat: Infinity, delay: i * 0.3 }}
                >
                  <div className="absolute inset-0 animate-shimmer" />
                </motion.div>
                <span className="font-display font-bold text-sm">{g.g}</span>
              </motion.div>
            ))}
          </div>
        </Wrap>
      );

    case "cells":
    case "reuse": {
      // Hex grid
      const hexes = [
        { x: 100, y: 80, c: 0 }, { x: 160, y: 115, c: 1 }, { x: 220, y: 80, c: 2 },
        { x: 280, y: 115, c: 3 }, { x: 100, y: 150, c: 4 }, { x: 160, y: 185, c: 5 },
        { x: 220, y: 150, c: 6 }, { x: 280, y: 185, c: 0 }, { x: 340, y: 80, c: 1 },
        { x: 340, y: 150, c: 2 },
      ];
      const colors = ["hsl(186 100% 55%)", "hsl(270 90% 65%)", "hsl(310 100% 60%)", "hsl(145 80% 55%)",
                      "hsl(45 100% 60%)", "hsl(220 90% 60%)", "hsl(0 80% 60%)"];
      return (
        <Wrap>
          <svg viewBox="0 0 400 225" className="w-full h-full">
            {hexes.map((h, i) => (
              <motion.polygon key={i}
                points={`${h.x},${h.y-30} ${h.x+26},${h.y-15} ${h.x+26},${h.y+15} ${h.x},${h.y+30} ${h.x-26},${h.y+15} ${h.x-26},${h.y-15}`}
                fill={`${colors[h.c]}33`} stroke={colors[h.c]} strokeWidth="1.5"
                initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.08 }} />
            ))}
            {hexes.map((h, i) => (
              <text key={`t${i}`} x={h.x} y={h.y+3} textAnchor="middle" fill="hsl(var(--foreground))" fontSize="9" fontFamily="monospace">F{h.c+1}</text>
            ))}
          </svg>
        </Wrap>
      );
    }

    case "handoff": {
      return (
        <Wrap>
          <svg viewBox="0 0 400 225" className="w-full h-full">
            <Tower x={100} y={140} />
            <Tower x={300} y={140} color="hsl(var(--secondary))" />
            <motion.g animate={{ x: [0, 200, 0] }} transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}>
              <Phone x={100} y={170} />
            </motion.g>
            {[0, 0.7].map((d, i) => <Signal key={`a${i}`} x={100} y={110} delay={d} />)}
            {[0.4, 1.1].map((d, i) => <Signal key={`b${i}`} x={300} y={110} delay={d} color="hsl(var(--secondary))" />)}
            <text x="200" y="40" textAnchor="middle" fill="hsl(var(--primary))" fontSize="11" fontFamily="monospace">HANDOFF</text>
          </svg>
        </Wrap>
      );
    }

    case "gsm":
    case "gprs":
      return (
        <Wrap>
          <div className="absolute inset-0 p-6 flex flex-col justify-center gap-2">
            {["MS — Mobile Station", "BTS — Base Transceiver", "BSC — Controller", "MSC — Switching", "PSTN / Internet"].map((l, i) => (
              <motion.div key={l}
                initial={{ x: -30, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
                transition={{ delay: i * 0.15 }}
                className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-gradient-primary grid place-items-center font-mono text-xs text-primary-foreground shadow-glow">{i + 1}</div>
                <div className="flex-1 h-px bg-gradient-to-r from-primary/60 to-transparent" />
                <div className="font-mono text-xs text-foreground">{l}</div>
              </motion.div>
            ))}
          </div>
        </Wrap>
      );

    case "networks":
      return (
        <Wrap>
          <svg viewBox="0 0 400 225" className="w-full h-full">
            {[{ r: 30, l: "WLAN" }, { r: 65, l: "WMAN" }, { r: 100, l: "WWAN" }].map((c, i) => (
              <motion.circle key={c.l} cx="200" cy="115" r={c.r}
                fill="none" stroke="hsl(var(--primary))" strokeWidth="1.5" strokeDasharray="3 4"
                initial={{ opacity: 0 }} animate={{ opacity: 1 - i * 0.25 }}
                transition={{ delay: i * 0.3 }} />
            ))}
            <circle cx="200" cy="115" r="6" fill="hsl(var(--primary))" className="animate-pulse-glow" />
            <text x="200" y="118" textAnchor="middle" fontSize="6" fill="hsl(var(--primary-foreground))" fontFamily="monospace">AP</text>
            <text x="200" y="40" textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize="10" fontFamily="monospace">WLAN ⊂ WMAN ⊂ WWAN</text>
          </svg>
        </Wrap>
      );

    case "db":
      return (
        <Wrap>
          <svg viewBox="0 0 400 225" className="w-full h-full">
            <ellipse cx="320" cy="60" rx="40" ry="12" fill="none" stroke="hsl(var(--secondary))" strokeWidth="1.5" />
            <rect x="280" y="60" width="80" height="60" fill="hsl(var(--secondary)/0.15)" stroke="hsl(var(--secondary))" strokeWidth="1.5" />
            <ellipse cx="320" cy="120" rx="40" ry="12" fill="hsl(var(--secondary)/0.3)" stroke="hsl(var(--secondary))" strokeWidth="1.5" />
            <text x="320" y="145" textAnchor="middle" fontSize="9" fill="hsl(var(--muted-foreground))" fontFamily="monospace">SERVER</text>
            <Phone x={80} y={130} />
            <text x="80" y="170" textAnchor="middle" fontSize="9" fill="hsl(var(--muted-foreground))" fontFamily="monospace">LOCAL CACHE</text>
            <motion.line x1="100" y1="120" x2="280" y2="90" stroke="hsl(var(--primary))" strokeWidth="2"
              animate={{ pathLength: [0, 1, 0] }} transition={{ duration: 2.5, repeat: Infinity }} />
            <motion.text fontSize="10" fill="hsl(var(--primary))" fontFamily="monospace"
              animate={{ x: [100, 280, 100] }} transition={{ duration: 2.5, repeat: Infinity }}>
              <tspan y="100">↔ sync</tspan>
            </motion.text>
          </svg>
        </Wrap>
      );

    case "bluetooth":
      return (
        <Wrap>
          <svg viewBox="0 0 400 225" className="w-full h-full">
            <circle cx="200" cy="115" r="14" fill="hsl(var(--primary))" className="animate-pulse-glow" />
            <text x="200" y="118" textAnchor="middle" fontSize="9" fontFamily="monospace" fill="hsl(var(--primary-foreground))">M</text>
            {[0, 1, 2, 3, 4, 5, 6].map((i) => {
              const a = (i / 7) * Math.PI * 2;
              const x = 200 + Math.cos(a) * 75;
              const y = 115 + Math.sin(a) * 75;
              return (
                <g key={i}>
                  <motion.line x1="200" y1="115" x2={x} y2={y} stroke="hsl(var(--primary)/0.4)" strokeWidth="1" strokeDasharray="3 3"
                    animate={{ strokeDashoffset: [0, -12] }} transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }} />
                  <circle cx={x} cy={y} r="9" fill="hsl(var(--secondary)/0.3)" stroke="hsl(var(--secondary))" />
                  <text x={x} y={y+3} textAnchor="middle" fontSize="8" fill="hsl(var(--foreground))" fontFamily="monospace">S{i+1}</text>
                </g>
              );
            })}
          </svg>
        </Wrap>
      );

    case "mobileip":
      return (
        <Wrap>
          <svg viewBox="0 0 400 225" className="w-full h-full">
            <Tower x={70} y={120} />
            <Tower x={330} y={120} color="hsl(var(--secondary))" />
            <text x="70" y="170" textAnchor="middle" fontSize="9" fill="hsl(var(--muted-foreground))" fontFamily="monospace">HOME</text>
            <text x="330" y="170" textAnchor="middle" fontSize="9" fill="hsl(var(--muted-foreground))" fontFamily="monospace">FOREIGN</text>
            <motion.g animate={{ x: [0, 260, 0] }} transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}>
              <Phone x={70} y={150} />
              <text x="70" y="195" textAnchor="middle" fontSize="9" fill="hsl(var(--primary))" fontFamily="monospace">IP fixed</text>
            </motion.g>
          </svg>
        </Wrap>
      );

    case "adhoc":
      return (
        <Wrap>
          <svg viewBox="0 0 400 225" className="w-full h-full">
            {[
              { x: 80, y: 80 }, { x: 200, y: 50 }, { x: 320, y: 90 },
              { x: 110, y: 170 }, { x: 220, y: 180 }, { x: 320, y: 170 },
            ].map((n, i) => (
              <g key={i}>
                <circle cx={n.x} cy={n.y} r="10" fill="hsl(var(--primary)/0.25)" stroke="hsl(var(--primary))" strokeWidth="1.5" className="animate-pulse-glow" />
                <text x={n.x} y={n.y + 3} textAnchor="middle" fontSize="9" fill="hsl(var(--foreground))" fontFamily="monospace">{i + 1}</text>
              </g>
            ))}
            {[[0,1],[1,2],[0,3],[3,4],[1,4],[4,5],[2,5],[2,1]].map(([a,b], i) => {
              const pts = [{ x: 80, y: 80 }, { x: 200, y: 50 }, { x: 320, y: 90 }, { x: 110, y: 170 }, { x: 220, y: 180 }, { x: 320, y: 170 }];
              return <motion.line key={i} x1={pts[a].x} y1={pts[a].y} x2={pts[b].x} y2={pts[b].y}
                stroke="hsl(var(--secondary)/0.6)" strokeWidth="1" strokeDasharray="3 3"
                animate={{ strokeDashoffset: [0, -12] }} transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }} />;
            })}
          </svg>
        </Wrap>
      );

    default:
      return (
        <Wrap>
          <div className="absolute inset-0 grid place-items-center">
            <div className="text-6xl animate-float">📡</div>
          </div>
        </Wrap>
      );
  }
}

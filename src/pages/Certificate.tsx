import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useTopics, useProgress } from "@/hooks/useTopics";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Award, Download, Lock } from "lucide-react";
import { motion } from "framer-motion";

export default function Certificate() {
  const { user } = useAuth();
  const { topics } = useTopics();
  const { progress } = useProgress();
  const [name, setName] = useState("");
  const [editing, setEditing] = useState(false);
  const certRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle()
      .then(({ data }) => setName(data?.display_name || user.email?.split("@")[0] || "Learner"));
  }, [user]);

  const total = topics.length;
  const passed = topics.filter(t => progress[t.id]?.passed).length;
  const allPassed = total > 0 && passed === total;

  const saveName = async () => {
    if (!user || !name.trim()) return;
    await supabase.from("profiles").upsert({ id: user.id, display_name: name.trim() });
    setEditing(false);
  };

  const downloadPNG = async () => {
    if (!certRef.current) return;
    // dynamic import to avoid bundling if unused
    const html2canvas = (await import("html2canvas")).default;
    const canvas = await html2canvas(certRef.current, { backgroundColor: "#0a0c1a", scale: 2 });
    const link = document.createElement("a");
    link.download = `signal-mobile-computing-certificate-${Date.now()}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  if (!user) return (
    <div className="container max-w-xl py-20 text-center">
      <Lock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
      <h1 className="font-display text-3xl font-bold">Sign in to view your certificate</h1>
      <Button asChild variant="hero" className="mt-6"><Link to="/auth">Sign in</Link></Button>
    </div>
  );

  return (
    <div className="container max-w-4xl py-12">
      <h1 className="font-display text-4xl font-bold mb-2">Your <span className="text-gradient">Certificate</span></h1>
      <p className="text-muted-foreground mb-8">{allPassed ? "Congratulations — every topic passed." : `Pass all topics to unlock (${passed}/${total} done).`}</p>

      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[220px]">
          <Label>Name on certificate</Label>
          <div className="flex gap-2 mt-1">
            <Input value={name} onChange={e => { setName(e.target.value); setEditing(true); }} />
            {editing && <Button onClick={saveName} variant="neon">Save</Button>}
          </div>
        </div>
        <Button onClick={downloadPNG} variant="hero" disabled={!allPassed}>
          <Download className="h-4 w-4 mr-1" /> Download PNG
        </Button>
      </div>

      {/* Certificate canvas */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div ref={certRef} className={`relative aspect-[1.4/1] rounded-3xl p-10 md:p-14 overflow-hidden border-2 ${allPassed ? "border-primary shadow-glow" : "border-border opacity-60"}`}
          style={{ background: "linear-gradient(135deg, hsl(232 40% 8%) 0%, hsl(270 30% 12%) 100%)" }}>
          <div className="absolute inset-0 grid-bg opacity-30" />
          {/* corner ornaments */}
          <div className="absolute top-6 left-6 h-12 w-12 border-t-2 border-l-2 border-primary rounded-tl-2xl" />
          <div className="absolute top-6 right-6 h-12 w-12 border-t-2 border-r-2 border-primary rounded-tr-2xl" />
          <div className="absolute bottom-6 left-6 h-12 w-12 border-b-2 border-l-2 border-primary rounded-bl-2xl" />
          <div className="absolute bottom-6 right-6 h-12 w-12 border-b-2 border-r-2 border-primary rounded-br-2xl" />

          <div className="relative h-full flex flex-col items-center justify-center text-center">
            <div className="h-16 w-16 rounded-2xl bg-gradient-primary grid place-items-center shadow-glow mb-4">
              <Award className="h-8 w-8 text-primary-foreground" />
            </div>
            <div className="text-xs font-mono tracking-[0.4em] text-primary">SIGNAL ACADEMY</div>
            <div className="text-sm uppercase tracking-widest text-muted-foreground mt-3">Certificate of Completion</div>
            <div className="text-xs text-muted-foreground mt-4">This certifies that</div>
            <div className="font-display text-3xl md:text-5xl font-bold text-gradient mt-2">{name || "Your Name"}</div>
            <div className="text-xs text-muted-foreground mt-4 max-w-md">has successfully completed the interactive course</div>
            <div className="font-display text-xl md:text-2xl font-semibold mt-2">Mobile Computing — Foundations to 5G</div>
            <div className="text-xs text-muted-foreground mt-6">covering {total} topics across 5 units · {passed}/{total} passed</div>
            <div className="mt-8 flex gap-10 text-xs font-mono text-muted-foreground">
              <div>
                <div className="text-foreground">{new Date().toLocaleDateString()}</div>
                <div className="border-t border-border/60 mt-1 pt-1">Issued</div>
              </div>
              <div>
                <div className="text-foreground">SIG-{user.id.slice(0, 8).toUpperCase()}</div>
                <div className="border-t border-border/60 mt-1 pt-1">Cert ID</div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {!allPassed && (
        <div className="mt-6 glass rounded-xl p-4 text-sm">
          <strong className="text-warning">Locked:</strong> pass quizzes for {total - passed} more topic(s) to unlock the download.
        </div>
      )}
    </div>
  );
}

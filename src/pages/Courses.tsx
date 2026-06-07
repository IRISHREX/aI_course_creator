import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import { useCourses } from "@/hooks/useCourses";
import { useIsAdmin } from "@/hooks/useAdmin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowUpDown, BookOpen, CalendarDays, Check, ChevronDown, PlayCircle, Plus, SlidersHorizontal, Sparkles, Tag, Trash2, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { backendApi } from "@/integrations/api/client";
import { toast } from "sonner";

type SortMode = "manual" | "newest" | "oldest" | "updated" | "az" | "za";
type DateMode = "all" | "today" | "7d" | "30d" | "year" | "custom";

function courseTime(value: string | null | undefined) {
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function dateInputTime(value: string, endOfDay = false) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  if (endOfDay) date.setHours(23, 59, 59, 999);
  const time = date.getTime();
  return Number.isFinite(time) ? time : null;
}

export default function Courses() {
  const { courses, loading, refresh } = useCourses();
  const { isAdmin } = useIsAdmin();
  const navigate = useNavigate();
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [sortMode, setSortMode] = useState<SortMode>("manual");
  const [dateMode, setDateMode] = useState<DateMode>("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const allTags = useMemo(() => {
    const set = new Set<string>();
    courses.forEach(c => (c.tags || []).forEach(t => set.add(t)));
    return Array.from(set).sort();
  }, [courses]);

  const dateRange = useMemo(() => {
    const now = new Date();
    if (dateMode === "all") return { start: null as number | null, end: null as number | null };
    if (dateMode === "today") return { start: startOfDay(now).getTime(), end: now.getTime() };
    if (dateMode === "7d") return { start: now.getTime() - 7 * 24 * 60 * 60 * 1000, end: now.getTime() };
    if (dateMode === "30d") return { start: now.getTime() - 30 * 24 * 60 * 60 * 1000, end: now.getTime() };
    if (dateMode === "year") return { start: new Date(now.getFullYear(), 0, 1).getTime(), end: now.getTime() };
    return { start: dateInputTime(customStart), end: dateInputTime(customEnd, true) };
  }, [customEnd, customStart, dateMode]);

  const filteredCourses = useMemo(() => {
    const filtered = courses.filter(c => {
      const matchesTags = activeTags.length === 0 || activeTags.every(t => (c.tags || []).includes(t));
      const created = courseTime(c.created_at);
      const matchesStart = dateRange.start == null || created >= dateRange.start;
      const matchesEnd = dateRange.end == null || created <= dateRange.end;
      return matchesTags && matchesStart && matchesEnd;
    });

    return [...filtered].sort((a, b) => {
      if (sortMode === "newest") return courseTime(b.created_at) - courseTime(a.created_at);
      if (sortMode === "oldest") return courseTime(a.created_at) - courseTime(b.created_at);
      if (sortMode === "updated") return courseTime(b.updated_at) - courseTime(a.updated_at);
      if (sortMode === "az") return a.title.localeCompare(b.title);
      if (sortMode === "za") return b.title.localeCompare(a.title);
      return (a.order_index ?? 0) - (b.order_index ?? 0);
    });
  }, [courses, activeTags, dateRange, sortMode]);

  const toggleTag = (t: string) => {
    setActiveTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  };

  const resetFilters = () => {
    setActiveTags([]);
    setDateMode("all");
    setSortMode("manual");
    setCustomStart("");
    setCustomEnd("");
  };

  const remove = async (id: string, title: string) => {
    if (!confirm(`Delete "${title}" and all its lessons?`)) return;
    const { error } = await backendApi.from("courses").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Course deleted"); refresh(); }
  };

  const hasActiveFilters = activeTags.length > 0 || dateMode !== "all" || sortMode !== "manual";

  return (
    <div className="container py-12">
      <div className="flex items-end justify-between flex-wrap gap-4 mb-8">
        <div>
          <div className="text-xs font-mono text-primary tracking-widest mb-2">SIGNAL ACADEMY</div>
          <h1 className="font-display text-4xl md:text-5xl font-bold">All <span className="text-gradient">Courses</span></h1>
          <p className="text-muted-foreground mt-2">Pick a course to start learning. Each lesson includes visualizations & quizzes.</p>
        </div>
        {isAdmin && (
          <Button asChild variant="hero">
            <Link to="/admin/upload"><Plus className="h-4 w-4 mr-1" /> Upload course</Link>
          </Button>
        )}
      </div>

      <div className="glass rounded-2xl p-4 mb-8 flex flex-wrap items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-primary/20 bg-primary/10" title="Filters" aria-label="Filters">
          <SlidersHorizontal className="h-4 w-4 text-primary" />
        </div>

        {allTags.length > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-border/70 bg-background/45" title="Tags" aria-label="Tags">
              <Tag className="h-4 w-4 text-primary" />
            </div>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="min-w-[200px] justify-between">
                  <span className="truncate">
                    {activeTags.length === 0
                      ? "Select tags..."
                      : `${activeTags.length} tag${activeTags.length > 1 ? "s" : ""} selected`}
                  </span>
                  <ChevronDown className="h-4 w-4 opacity-60 ml-2 shrink-0" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search tags..." />
                  <CommandList>
                    <CommandEmpty>No tags found.</CommandEmpty>
                    <CommandGroup>
                      {allTags.map(t => {
                        const active = activeTags.includes(t);
                        return (
                          <CommandItem key={t} onSelect={() => toggleTag(t)} className="cursor-pointer">
                            <div className={`mr-2 h-4 w-4 rounded border flex items-center justify-center ${active ? "bg-primary border-primary" : "border-muted-foreground/40"}`}>
                              {active && <Check className="h-3 w-3 text-primary-foreground" />}
                            </div>
                            <span className="flex-1">#{t}</span>
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-border/70 bg-background/45" title="Date" aria-label="Date">
            <CalendarDays className="h-4 w-4 text-primary" />
          </div>
          <Select value={dateMode} onValueChange={(value) => setDateMode(value as DateMode)}>
            <SelectTrigger className="h-9 w-[160px] bg-background/70">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All dates</SelectItem>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="year">This year</SelectItem>
              <SelectItem value="custom">Custom range</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {dateMode === "custom" && (
          <div className="flex flex-wrap items-center gap-2">
            <Input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="h-9 w-[150px] bg-background/70" />
            <span className="text-xs text-muted-foreground">to</span>
            <Input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="h-9 w-[150px] bg-background/70" />
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-border/70 bg-background/45" title="Sort" aria-label="Sort">
            <ArrowUpDown className="h-4 w-4 text-primary" />
          </div>
          <Select value={sortMode} onValueChange={(value) => setSortMode(value as SortMode)}>
            <SelectTrigger className="h-9 w-[190px] bg-background/70">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="manual">Course order</SelectItem>
              <SelectItem value="newest">Newest first</SelectItem>
              <SelectItem value="oldest">Chronological</SelectItem>
              <SelectItem value="updated">Recently updated</SelectItem>
              <SelectItem value="az">Title A-Z</SelectItem>
              <SelectItem value="za">Title Z-A</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {activeTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {activeTags.map(t => (
              <span key={t} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/15 text-primary text-xs border border-primary/40">
                #{t}
                <button onClick={() => toggleTag(t)} className="hover:text-destructive"><X className="h-3 w-3" /></button>
              </span>
            ))}
          </div>
        )}

        {hasActiveFilters && (
          <button onClick={resetFilters} className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border/70 bg-background/45 text-muted-foreground hover:border-destructive/50 hover:text-destructive" title="Reset filters" aria-label="Reset filters">
            <X className="h-4 w-4" />
          </button>
        )}

        <span className="text-[11px] text-muted-foreground ml-auto">
          {filteredCourses.length} of {courses.length} courses
        </span>
      </div>

      {loading ? (
        <div className="text-muted-foreground">Loading...</div>
      ) : filteredCourses.length === 0 ? (
        <div className="glass rounded-2xl p-10 text-center">
          <BookOpen className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">
            {courses.length === 0 ? "No courses yet." : "No courses match the selected filters."}
          </p>
          {isAdmin && courses.length === 0 && <Button asChild variant="hero" className="mt-4"><Link to="/admin/upload">Upload first course</Link></Button>}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredCourses.map((c, i) => (
            <motion.div key={c.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Link to={`/course/${c.slug}`} className="block group">
                <div className="glass rounded-2xl p-6 h-full hover:shadow-glow transition-all border border-border/60 hover:border-primary/60 relative overflow-hidden">
                  <div className="absolute -right-6 -top-6 text-7xl opacity-10 group-hover:opacity-30 transition">{c.cover_emoji || "📡"}</div>
                  <div className="text-4xl mb-4">{c.cover_emoji || "📡"}</div>
                  <h3 className="font-display text-xl font-bold mb-2 group-hover:text-gradient">{c.title}</h3>
                  <p className="text-sm text-muted-foreground line-clamp-3">{c.description}</p>
                  {c.tags && c.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-3">
                      {c.tags.slice(0, 4).map(t => (
                        <span
                          key={t}
                          onClick={(e) => { e.preventDefault(); toggleTag(t); }}
                          className={`px-2 py-0.5 rounded-full text-[10px] border cursor-pointer ${
                            activeTags.includes(t)
                              ? "bg-primary/20 text-primary border-primary/50"
                              : "bg-muted/40 text-muted-foreground border-border hover:border-primary/60"
                          }`}
                        >
                          #{t}
                        </span>
                      ))}
                      {c.tags.length > 4 && <span className="text-[10px] text-muted-foreground">+{c.tags.length - 4}</span>}
                    </div>
                  )}
                  <div className="mt-5 flex items-center justify-between gap-2">
                    <span className="text-xs font-mono text-primary inline-flex items-center gap-1"><Sparkles className="h-3 w-3" /> Open course -&gt;</span>
                    <button
                      onClick={(e) => { e.preventDefault(); navigate(`/course/${c.slug}/read`); }}
                      className="inline-flex h-8 items-center gap-1 rounded-md border border-primary/50 bg-primary/10 px-2 text-xs font-medium text-primary transition hover:bg-primary/20"
                      title="Play course slides"
                      aria-label={`Play ${c.title} slides`}
                    >
                      <PlayCircle className="h-3.5 w-3.5" />
                      Play
                    </button>
                    {isAdmin && (
                      <button onClick={(e) => { e.preventDefault(); remove(c.id, c.title); }}
                        className="text-muted-foreground hover:text-destructive p-1">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

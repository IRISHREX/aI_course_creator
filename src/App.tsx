import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { lazy, Suspense } from "react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { ThemeProvider } from "@/hooks/useTheme";
import { TopNav } from "@/components/TopNav";
import ThreeBackground from "@/components/ThreeBackground";

const AdminLayout = lazy(() => import("@/components/AdminLayout").then((module) => ({ default: module.AdminLayout })));
const Index = lazy(() => import("./pages/Index"));
const Auth = lazy(() => import("./pages/Auth"));
const Courses = lazy(() => import("./pages/Courses"));
const CourseDetail = lazy(() => import("./pages/CourseDetail"));
const CourseEdit = lazy(() => import("./pages/CourseEdit"));
const AdminUpload = lazy(() => import("./pages/AdminUpload"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const AdminUsers = lazy(() => import("./pages/AdminUsers"));
const AdminPYQUpload = lazy(() => import("./pages/AdminPYQUpload"));
const AdminSettings = lazy(() => import("./pages/AdminSettings"));
const TopicPage = lazy(() => import("./pages/TopicPage"));
const TopicEdit = lazy(() => import("./pages/TopicEdit"));
const CourseSettings = lazy(() => import("./pages/CourseSettings"));
const QuizPage = lazy(() => import("./pages/QuizPage"));
const CoverageBoard = lazy(() => import("./pages/CoverageBoard"));
const Certificate = lazy(() => import("./pages/Certificate"));
const CoursePYQ = lazy(() => import("./pages/CoursePYQ"));
const Bookmarks = lazy(() => import("./pages/Bookmarks"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

const PageFallback = () => (
  <div className="container py-20 text-sm text-muted-foreground">Loading...</div>
);

const Content = () => {
  const location = useLocation();

  const showThreeBackground = location.pathname !== "/" && !location.pathname.startsWith("/course/");

  return (
    <ThemeProvider>
      {showThreeBackground && <ThreeBackground />}
      <div className="min-h-screen flex flex-col">
        <TopNav />
        <main className="flex-1">
          <Suspense fallback={<PageFallback />}>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/courses" element={<Courses />} />
              <Route path="/admin" element={<AdminLayout />}>
                <Route index element={<AdminDashboard />} />
                <Route path="upload" element={<AdminUpload />} />
                <Route path="users" element={<AdminUsers />} />
                <Route path="pyq-upload" element={<AdminPYQUpload />} />
                <Route path="settings" element={<AdminSettings />} />
              </Route>
              <Route path="/bookmarks" element={<Bookmarks />} />
              <Route path="/course/:courseSlug" element={<CourseDetail />} />
              <Route path="/course/:courseSlug/edit" element={<CourseEdit />} />
              <Route path="/course/:courseSlug/settings" element={<CourseSettings />} />
              <Route path="/course/:courseSlug/board" element={<CoverageBoard />} />
              <Route path="/course/:courseSlug/certificate" element={<Certificate />} />
              <Route path="/course/:courseSlug/pyq" element={<CoursePYQ />} />
              <Route path="/course/:courseSlug/quiz" element={<QuizPage />} />
              <Route path="/course/:courseSlug/topic/:slug" element={<TopicPage />} />
              <Route path="/course/:courseSlug/topic/:slug/edit" element={<TopicEdit />} />
              <Route path="/course/:courseSlug/topic/:slug/quiz" element={<QuizPage />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </main>
      </div>
    </ThemeProvider>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Content />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

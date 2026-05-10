import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { ThemeProvider } from "@/hooks/useTheme";
import { TopNav } from "@/components/TopNav";
import ThreePageBackground from "@/components/ThreePageBackground";
import { AdminLayout } from "@/components/AdminLayout";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Courses from "./pages/Courses";
import CourseDetail from "./pages/CourseDetail";
import CourseEdit from "./pages/CourseEdit";
import AdminUpload from "./pages/AdminUpload";
import AdminDashboard from "./pages/AdminDashboard";
import AdminUsers from "./pages/AdminUsers";
import AdminPYQUpload from "./pages/AdminPYQUpload";
import TopicPage from "./pages/TopicPage";
import TopicEdit from "./pages/TopicEdit";
import QuizPage from "./pages/QuizPage";
import CoverageBoard from "./pages/CoverageBoard";
import Certificate from "./pages/Certificate";
import CoursePYQ from "./pages/CoursePYQ";
import Bookmarks from "./pages/Bookmarks";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const Content = () => {
  const location = useLocation();

  return (
    <ThemeProvider>
      {location.pathname !== "/" && <ThreePageBackground />}
      <div className="min-h-screen flex flex-col">
        <TopNav />
        <main className="flex-1">
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/courses" element={<Courses />} />
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<AdminDashboard />} />
              <Route path="upload" element={<AdminUpload />} />
              <Route path="users" element={<AdminUsers />} />
              <Route path="pyq-upload" element={<AdminPYQUpload />} />
            </Route>
            <Route path="/bookmarks" element={<Bookmarks />} />
            <Route path="/course/:courseSlug" element={<CourseDetail />} />
            <Route path="/course/:courseSlug/edit" element={<CourseEdit />} />
            <Route path="/course/:courseSlug/board" element={<CoverageBoard />} />
            <Route path="/course/:courseSlug/certificate" element={<Certificate />} />
            <Route path="/course/:courseSlug/pyq" element={<CoursePYQ />} />
            <Route path="/course/:courseSlug/quiz" element={<QuizPage />} />
            <Route path="/course/:courseSlug/topic/:slug" element={<TopicPage />} />
            <Route path="/course/:courseSlug/topic/:slug/edit" element={<TopicEdit />} />
            <Route path="/course/:courseSlug/topic/:slug/quiz" element={<QuizPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
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

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { TopNav } from "@/components/TopNav";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import CourseMap from "./pages/CourseMap";
import TopicPage from "./pages/TopicPage";
import TopicEdit from "./pages/TopicEdit";
import QuizPage from "./pages/QuizPage";
import CoverageBoard from "./pages/CoverageBoard";
import Certificate from "./pages/Certificate";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <div className="min-h-screen flex flex-col">
            <TopNav />
            <main className="flex-1">
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/map" element={<CourseMap />} />
                <Route path="/topic/:slug" element={<TopicPage />} />
                <Route path="/topic/:slug/edit" element={<TopicEdit />} />
                <Route path="/topic/:slug/quiz" element={<QuizPage />} />
                <Route path="/board" element={<CoverageBoard />} />
                <Route path="/certificate" element={<Certificate />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </main>
          </div>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

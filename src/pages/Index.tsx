import { useEffect } from "react";

// The full Lesson Teacher app (Ghana edition · v15) is a self-contained
// static bundle in /public/app/. We mount it inside an iframe so the existing
// vanilla-JS engine, Firebase auth, live arena, exam booklet, parent
// dashboard, languages module and AI tutor all work unchanged.
const Index = () => {
  useEffect(() => {
    document.title = "Lesson Teacher — AI Tutor for the Ghanaian Curriculum";
  }, []);

  return (
    <iframe
      src="/app/index.html"
      title="Lesson Teacher — Ghana"
      allow="autoplay; microphone; clipboard-read; clipboard-write"
      className="fixed inset-0 h-screen w-screen border-0"
    />
  );
};

export default Index;

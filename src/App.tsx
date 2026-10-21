import { useEffect } from "react";
import { Link, Route, Routes, useLocation } from "react-router-dom";
import { PageShell } from "@/components/PageShell";
import { unlockSound } from "@/lib/sound";
import { Landing } from "./pages/Landing";
import { Write } from "./pages/Write";
import { Sent } from "./pages/Sent";
import { CanPage } from "./pages/CanPage";
import { ManagePage } from "./pages/ManagePage";

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [pathname]);
  return null;
}

function NotFound() {
  return (
    <PageShell narrow>
      <div className="center-state">
        <span className="empty-mark">?</span>
        <div>
          <p className="eyebrow">Lost in the mail</p>
          <h1 className="display-sm mt-3">这一页不在邮路上。</h1>
          <p className="body-copy mt-4">
            也许链接少了一段，也许它从来没有被写下来过。
          </p>
        </div>
        <Link to="/" className="btn btn-outline">
          回首页
        </Link>
      </div>
    </PageShell>
  );
}

export default function App() {
  useEffect(() => {
    const unlock = () => unlockSound();
    window.addEventListener("pointerdown", unlock, {
      once: true,
      passive: true,
    });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/write" element={<Write />} />
        <Route path="/sent/:id" element={<Sent />} />
        <Route path="/c/:id" element={<CanPage />} />
        <Route path="/m/:id" element={<ManagePage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
}

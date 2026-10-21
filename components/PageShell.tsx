import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { SoundToggle } from "@/components/SoundToggle";

interface PageShellProps {
  children: ReactNode;
  right?: ReactNode;
  narrow?: boolean;
  footerNote?: string;
}

export function PageShell({
  children,
  right,
  narrow = false,
  footerNote,
}: PageShellProps) {
  return (
    <div className="site-shell">
      <header className="container site-header">
        <Link to="/" className="brand" aria-label="LoveCan 爱意罐头，回到首页">
          <span className="brand-seal" aria-hidden="true">
            L
          </span>
          <span className="brand-mark">LoveCan</span>
          <span className="brand-cn">爱意罐头</span>
        </Link>
        <div className="header-tools">
          <SoundToggle />
          {right ?? (
            <Link to="/write/" className="btn btn-outline btn-sm">
              封一罐
            </Link>
          )}
        </div>
      </header>
      <main className={`site-main ${narrow ? "container-narrow" : "container"}`}>
        {children}
      </main>
      <footer className="site-footer">
        <div className="container footer-row">
          <div>
            <p>LoveCan · 爱意罐头</p>
            <p className="mt-1 opacity-80">
              {footerNote ?? "封一罐爱，等它到期。"}
            </p>
          </div>
          <p className="max-w-[22rem] md:text-right">
            信和声音在离开你之前就已上锁。钥匙只在你收到的那条链接里。
          </p>
        </div>
      </footer>
    </div>
  );
}

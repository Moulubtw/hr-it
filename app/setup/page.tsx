import Link from "next/link";
import { SetupForm } from "@/components/setup/SetupForm";
import { GridLines } from "@/components/ui/GridLines";

export const metadata = { title: "Настройка — HR‑IT" };

export default function SetupPage() {
  return (
    <>
      <GridLines />
      <main className="relative z-10 flex flex-1 flex-col px-[var(--gutter)]">
        <header className="flex items-center justify-between border-b border-line py-5">
          <Link href="/" className="display text-[15px] tracking-[-0.02em] hover:opacity-70">
            HR‑IT
          </Link>
          <span className="label">Настройка сессии</span>
        </header>
        <h1 className="display pb-6 pt-16 text-[clamp(32px,7vw,112px)] font-extrabold">
          Кто будет <br className="hidden sm:block" />
          напротив?
        </h1>
        <SetupForm />
      </main>
    </>
  );
}

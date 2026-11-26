import type { Metadata, Viewport } from "next";
import { Onest, Unbounded } from "next/font/google";
import "./globals.css";

const unbounded = Unbounded({
  variable: "--font-unbounded",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "600", "800"],
  display: "swap",
});

const onest = Onest({
  variable: "--font-onest",
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "HR‑IT — тренажёр собеседований",
  description:
    "Репетиция собеседования на любую вакансию: грейд, сложность, тон интервьюера и разбор каждого ответа.",
};

export const viewport: Viewport = {
  themeColor: "#0b0b0b",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ru"
      className={`${unbounded.variable} ${onest.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-bg text-text-1">
        {children}
        <div className="grain" aria-hidden />
      </body>
    </html>
  );
}

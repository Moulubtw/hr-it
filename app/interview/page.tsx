"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { InterviewScene } from "@/components/stage/InterviewScene";

function FromQuery() {
  const id = useSearchParams().get("id") ?? "";
  return <InterviewScene key={id} id={id} />;
}

export default function InterviewPage() {
  return (
    <Suspense fallback={<span className="label p-[var(--gutter)]">Загрузка…</span>}>
      <FromQuery />
    </Suspense>
  );
}

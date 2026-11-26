"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ReportView } from "@/components/report/ReportView";

function FromQuery() {
  const id = useSearchParams().get("id") ?? "";
  return <ReportView key={id} id={id} />;
}

export default function ReportPage() {
  return (
    <Suspense fallback={<span className="label p-[var(--gutter)]">Загрузка…</span>}>
      <FromQuery />
    </Suspense>
  );
}

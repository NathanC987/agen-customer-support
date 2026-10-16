import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { KnowledgeBrowser } from "@/components/knowledge/knowledge-browser";
import { PageHeader } from "@/components/shell/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { listKb } from "@/lib/db/repo";

export const metadata: Metadata = { title: "Knowledge Base" };

async function KnowledgeContent() {
  await connection();
  return <KnowledgeBrowser articles={listKb(true)} />;
}

export default function KnowledgePage() {
  return (
    <>
      <PageHeader title="Knowledge Base" description="FAQs, policies, product docs and the troubleshooting workflows agents select from" />
      <div className="p-4 md:p-6">
        <Suspense fallback={<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-44 rounded-xl" />)}</div>}>
          <KnowledgeContent />
        </Suspense>
      </div>
    </>
  );
}

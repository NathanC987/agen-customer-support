import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { ChatWorkspace } from "@/components/chat/chat-workspace";
import { Skeleton } from "@/components/ui/skeleton";
import { redirect } from "next/navigation";
import { getCustomer } from "@/lib/db/repo";
import { requirePageUser } from "@/lib/auth/session";
import { geminiModel, llmConfigured } from "@/lib/llm/gemini";

export const metadata: Metadata = { title: "Support Chat" };

async function ChatLoader() {
  await connection();
  const user = await requirePageUser("customer");
  const me = user.customerId ? getCustomer(user.customerId) : undefined;
  if (!me) redirect("/login");
  // a customer only ever sees and chats as themselves
  const customers = [me];
  const model = geminiModel().replace(/^gemini-/, "Gemini ").replace(/-/g, " ").replace(/\b(\w)/g, (c) => c.toUpperCase());
  return <ChatWorkspace customers={customers} llmReady={llmConfigured()} model={model} />;
}

export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-svh flex-col">
          <div className="h-14 border-b" />
          <div className="flex flex-1">
            <Skeleton className="m-3 hidden w-66 lg:block" />
            <div className="flex-1 p-6"><Skeleton className="mx-auto h-40 max-w-3xl" /></div>
            <Skeleton className="m-3 hidden w-96 xl:block" />
          </div>
        </div>
      }
    >
      <ChatLoader />
    </Suspense>
  );
}

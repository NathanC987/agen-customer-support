import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { requirePageUser } from "@/lib/auth/session";
import { PageHeader } from "@/components/shell/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { InventoryManager } from "@/components/inventory/inventory-manager";
import { listProducts, recentInventoryEvents } from "@/lib/commerce";
import { ragStatus } from "@/lib/rag";

export const metadata: Metadata = { title: "Inventory" };

async function InventoryContent() {
  await connection();
  await requirePageUser("admin");
  const rag = await ragStatus();
  return <InventoryManager products={listProducts(true)} events={recentInventoryEvents(15)} vectorProducts={rag.ok ? rag.products : null} />;
}

export default function InventoryPage() {
  return (
    <>
      <PageHeader title="Inventory" description="Live stock for the catalog the AI agent sells from — orders, cancellations and replacements move it automatically" />
      <div className="p-4 md:p-6">
        <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
          <InventoryContent />
        </Suspense>
      </div>
    </>
  );
}

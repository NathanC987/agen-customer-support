import { Suspense } from "react";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { getSessionUser } from "@/lib/auth/session";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <Suspense fallback={<AppSidebar user={null} />}>
        <SidebarWithUser />
      </Suspense>
      <SidebarInset className="min-w-0">{children}</SidebarInset>
    </SidebarProvider>
  );
}

/** Reads the session at request time (behind Suspense, so the shell stays static). */
async function SidebarWithUser() {
  const user = await getSessionUser();
  return <AppSidebar user={user && { name: user.name, email: user.email, role: user.role }} />;
}

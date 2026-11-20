"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useTransition } from "react";
import { useTheme } from "next-themes";
import { BookOpen, Boxes, LayoutDashboard, LogOut, MessagesSquare, Monitor, Moon, MoreHorizontal, RotateCcw, Sparkles, Sun, Ticket } from "lucide-react";
import { toast } from "sonner";
import { resetDemo } from "@/app/actions";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface SidebarUser {
  name: string;
  email: string;
  role: "customer" | "admin";
}

const NAV = [
  { href: "/chat", label: "Support Chat", icon: MessagesSquare, role: "customer" },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, role: "admin" },
  { href: "/tickets", label: "Tickets", icon: Ticket, role: "admin" },
  { href: "/inventory", label: "Inventory", icon: Boxes, role: "admin" },
  { href: "/knowledge", label: "Knowledge Base", icon: BookOpen, role: "admin" },
] as const;

async function signOut() {
  await fetch("/api/auth/logout", { method: "POST" });
  // full reload on purpose: drops every client-side cache of the signed-out user's data
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign("/login");
}

export function AppSidebar({ user }: { user: SidebarUser | null }) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [resetting, startReset] = useTransition();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild className="hover:bg-transparent">
              <Link href={user?.role === "admin" ? "/dashboard" : "/chat"}>
                <span className="flex aspect-square size-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm">
                  <Sparkles className="size-4" />
                </span>
                <span className="grid flex-1 text-left leading-tight">
                  <span className="truncate font-semibold">Nimbus Support</span>
                  <span className="truncate text-xs text-muted-foreground">{user?.role === "admin" ? "Admin console" : "Customer support"}</span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{user?.role === "admin" ? "Admin" : "Workspace"}</SidebarGroupLabel>
          <SidebarGroupContent>
            <Suspense fallback={<NavLinks pathname="" role={user?.role} />}>
              <ActiveNavLinks role={user?.role} />
            </Suspense>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton tooltip="Account & settings" size="lg">
                  <MoreHorizontal />
                  <span className="grid min-w-0 flex-1 text-left leading-tight">
                    <span className="truncate text-sm font-medium">{user?.name ?? "Settings"}</span>
                    {user && <span className="truncate text-[11px] text-muted-foreground">{user.role === "admin" ? "Administrator" : user.email}</span>}
                  </span>
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-56">
                <DropdownMenuLabel>Theme</DropdownMenuLabel>
                <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
                  <DropdownMenuRadioItem value="light">
                    <Sun /> Light
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="dark">
                    <Moon /> Dark
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="system">
                    <Monitor /> System
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
                {user?.role === "admin" && <DropdownMenuSeparator />}
                {user?.role === "admin" && (
                <DropdownMenuItem
                  disabled={resetting}
                  onSelect={() =>
                    startReset(async () => {
                      const res = await resetDemo();
                      if (res.ok) {
                        toast.success("Demo data reset");
                        router.refresh();
                      } else toast.error(res.error);
                    })
                  }
                >
                  <RotateCcw /> Reset demo data
                </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => void signOut()}>
                  <LogOut /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function ActiveNavLinks({ role }: { role?: SidebarUser["role"] }) {
  return <NavLinks pathname={usePathname()} role={role} />;
}

function NavLinks({ pathname, role }: { pathname: string; role?: SidebarUser["role"] }) {
  return (
    <SidebarMenu>
      {NAV.filter((item) => item.role === role).map((item) => (
        <SidebarMenuItem key={item.href}>
          <SidebarMenuButton asChild isActive={pathname.startsWith(item.href)} tooltip={item.label}>
            <Link href={item.href}>
              <item.icon />
              <span>{item.label}</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );
}

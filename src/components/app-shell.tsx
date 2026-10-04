import { Link, useNavigate } from "@tanstack/react-router";
import {
  FileSpreadsheet,
  LayoutDashboard,
  Languages,
  LogOut,
  Mail,
  Menu,
  MessageCircleReply,
  Moon,
  ScrollText,
  Search,
  Send,
  Settings,
  Sun,
  User,
  Users,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";

import { BrandMark } from "@/components/brand";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { initials, useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";

const nav = [
  { to: "/dashboard", label: { en: "Dashboard", bn: "ড্যাশবোর্ড" }, icon: LayoutDashboard },
  { to: "/leads", label: { en: "Leads", bn: "লিডস" }, icon: Users },
  { to: "/import", label: { en: "Import Data", bn: "ডেটা ইমপোর্ট" }, icon: FileSpreadsheet },
  { to: "/compose", label: { en: "Email Composer", bn: "ইমেইল কম্পোজার" }, icon: Mail },
  { to: "/campaigns", label: { en: "Sending History", bn: "সেন্ডিং হিস্ট্রি" }, icon: Send },
  { to: "/replies", label: { en: "Replies", bn: "রিপ্লাই" }, icon: MessageCircleReply },
  { to: "/accounts", label: { en: "Sending Accounts", bn: "সেন্ডিং অ্যাকাউন্ট" }, icon: User },
  { to: "/logs", label: { en: "Campaign Logs", bn: "ক্যাম্পেইন লগ" }, icon: ScrollText },
  { to: "/settings", label: { en: "Settings", bn: "সেটিংস" }, icon: Settings },
] as const;

type Language = "en" | "bn";

function NavLinks({ language, onNavigate }: { language: Language; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-1">
      {nav.map(({ to, label, icon: Icon }) => (
        <Link
          key={to}
          to={to}
          onClick={onNavigate}
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[status=active]:bg-sidebar-accent data-[status=active]:text-sidebar-accent-foreground"
          activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground" }}
        >
          <Icon className="size-4 shrink-0" />
          {label[language]}
        </Link>
      ))}
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [language, setLanguage] = useState<Language>(() => {
    if (typeof window === "undefined") return "en";
    return window.localStorage.getItem("leadpilot-language") === "bn" ? "bn" : "en";
  });
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
  const accountsQuery = useQuery({
    queryKey: ["smtp-accounts"],
    queryFn: () =>
      api<Array<{ isActive: boolean; dailyLimit: number; sentToday: number }>>(
        "smtp/accounts.php",
      ).then((r) => r.data),
  });
  const activeAccounts = (accountsQuery.data ?? []).filter((account) => account.isActive);
  const sentToday = activeAccounts.reduce((sum, account) => sum + Number(account.sentToday), 0);
  const dailyLimit = activeAccounts.reduce((sum, account) => sum + Number(account.dailyLimit), 0);

  const name = user?.name ?? "Account";

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <aside className="hidden h-screen w-64 shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar lg:flex">
        <div className="px-5 py-5">
          <BrandMark />
        </div>
        <div className="flex-1 overflow-hidden px-3 pb-6">
          <NavLinks language={language} />
        </div>
        <div className="border-t border-sidebar-border p-4">
          <div className="rounded-xl bg-sidebar-accent/60 p-3">
            <p className="text-xs font-medium text-sidebar-accent-foreground">Daily sending</p>
            <p className="mt-1 text-lg font-semibold">
              {sentToday} / {dailyLimit}
            </p>
            <p className="text-xs text-muted-foreground">
              Across {activeAccounts.length} active account{activeAccounts.length === 1 ? "" : "s"}
            </p>
          </div>
        </div>
      </aside>

      <div className="flex h-screen min-w-0 flex-1 flex-col overflow-y-auto">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-card/85 px-4 backdrop-blur md:px-6">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 bg-sidebar p-0">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <div className="px-5 py-5">
                <BrandMark />
              </div>
              <div className="px-3 pb-8">
                <NavLinks language={language} onNavigate={() => setMobileOpen(false)} />
              </div>
            </SheetContent>
          </Sheet>

          <div className="relative hidden max-w-md flex-1 sm:block">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search leads and sending history…"
              className="h-9 bg-background pl-9"
            />
          </div>

          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
              {theme === "dark" ? <Sun className="size-5" /> : <Moon className="size-5" />}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Select language">
                  <Languages className="size-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>{language === "bn" ? "ভাষা" : "Language"}</DropdownMenuLabel>
                <DropdownMenuItem
                  onClick={() => {
                    setLanguage("en");
                    window.localStorage.setItem("leadpilot-language", "en");
                    document.documentElement.lang = "en";
                  }}
                >
                  English {language === "en" ? "✓" : ""}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    setLanguage("bn");
                    window.localStorage.setItem("leadpilot-language", "bn");
                    document.documentElement.lang = "bn";
                  }}
                >
                  বাংলা {language === "bn" ? "✓" : ""}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="ml-1 flex items-center gap-2 rounded-full p-1 transition-colors hover:bg-accent">
                  <Avatar className="size-8">
                    <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                      {initials(name) || "LP"}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden pr-1 text-sm font-medium md:inline">{name}</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <p className="text-sm font-medium">{name}</p>
                  <p className="text-xs font-normal text-muted-foreground">{user?.email}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/settings">
                    <User className="size-4" /> Profile
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/settings">
                    <Settings className="size-4" /> Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={async () => {
                    await logout();
                    navigate({ to: "/" });
                  }}
                >
                  <LogOut className="size-4" /> Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 md:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-7xl space-y-6">{children}</div>
        </main>
      </div>
    </div>
  );
}

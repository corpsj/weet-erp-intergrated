"use client";

import { AppShell, Burger, Button, Divider, Group, NavLink, Paper, Text, Box, rem, ScrollArea, Stack, Badge, Tooltip } from "@mantine/core";
import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import {
  IconBolt,
  IconBuildingStore,
  IconCalculator,
  IconCalendar,
  IconCheckbox,
  IconChevronLeft,
  IconChevronRight,
  IconHome,
  IconKey,
  IconNotes,
  IconReceipt,
  IconReceipt2,
  IconSearch,
  IconSettings,
  IconTransferIn,
  IconUser,
} from "@tabler/icons-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { NotificationProvider, useNotifications, type MenuId } from "@/contexts/NotificationContext";
import { ThemeToggle } from "@/components/ThemeToggle";

const groupedNavItems = [
  {
    group: "워크스페이스",
    items: [
      { label: "허브", icon: IconHome, link: "/" },
      { label: "캘린더", icon: IconCalendar, link: "/calendar" },
      { label: "To-Do", icon: IconCheckbox, link: "/todo" },
      { label: "메모", icon: IconNotes, link: "/memos" },
    ],
  },
  {
    group: "ERP 솔루션",
    items: [
      { label: "경비 청구", icon: IconReceipt, link: "/expenses" },
      { label: "공과금", icon: IconBolt, link: "/utility-bills" },
      { label: "세금계산서", icon: IconReceipt2, link: "/tax-invoices" },
      { label: "입출금 내역", icon: IconTransferIn, link: "/transactions" },
    ],
  },
  {
    group: "보안 도구",
    items: [{ label: "계정 공유", icon: IconKey, link: "/vault" }],
  },
  {
    group: "weet Tools",
    items: [{ label: "견적 시스템", icon: IconCalculator, link: "/estimate/materials" }],
  },
  {
    group: "관리",
    items: [
      { label: "설정", icon: IconSettings, link: "/settings" },
    ],
  },
];

// Map link path to MenuId
const linkToMenuId: Record<string, MenuId> = {
  "/": "notice",
  "/estimate/materials": "estimate",
  "/todo": "todo",
  "/memos": "memo",
  "/expenses": "expense",
  "/utility-bills": "utility",
  "/tax-invoices": "tax",
  "/transactions": "transaction",
};

interface SidebarContentProps {
  close: () => void;
  pathname: string;
  collapsed?: boolean;
}

function SidebarContent({ close, pathname, collapsed }: SidebarContentProps) {
  const { unreadCounts } = useNotifications();

  return (
    <ScrollArea style={{ flex: 1, paddingRight: collapsed ? 0 : 4 }} type="scroll" offsetScrollbars>
      {groupedNavItems.map((group) => (
        <Box key={group.group} mb={collapsed ? "md" : "xl"}>
          {!collapsed && (
            <Text size="xs" c="indigo.7" fw={800} tt="uppercase" mb="xs" style={{ letterSpacing: '0.05em' }}>
              {group.group}
            </Text>
          )}
          <Stack gap={collapsed ? 8 : 4} align={collapsed ? "center" : "stretch"}>
            {group.items.map((item) => {
              const menuId = linkToMenuId[item.link];
              const count = menuId ? unreadCounts[menuId] : 0;
              const isActive = item.link.startsWith("/estimate") ? pathname.startsWith("/estimate") : pathname === item.link;

              const navLink = (
                <NavLink
                  key={item.link}
                  component={Link}
                  href={item.link}
                  label={
                    !collapsed ? (
                      <Group justify="space-between" wrap="nowrap">
                        <Text size="sm" fw={600} style={{ fontSize: '14px' }}>{item.label}</Text>
                        {count > 0 && (
                          <Badge size="xs" circle color="red">
                            {count > 99 ? '99+' : count}
                          </Badge>
                        )}
                      </Group>
                    ) : null
                  }
                  leftSection={
                    <Box className={count > 0 ? "pulse-active" : ""}>
                      <item.icon size={collapsed ? 22 : 20} stroke={2} color={isActive ? 'var(--mantine-color-white)' : 'var(--mantine-color-indigo-5)'} />
                    </Box>
                  }
                  active={isActive}
                  variant="filled"
                  onClick={close}
                  styles={{
                    root: {
                      transition: 'all 0.2s ease',
                      borderRadius: 'var(--mantine-radius-md)',
                      padding: collapsed ? '10px' : '10px 12px',
                      backgroundColor: isActive ? 'var(--mantine-color-indigo-6)' : 'transparent',
                      color: isActive ? 'var(--mantine-color-white)' : 'var(--mantine-color-gray-7)',
                      display: 'flex',
                      justifyContent: collapsed ? 'center' : 'flex-start',
                      width: collapsed ? 44 : 'auto',
                      height: collapsed ? 44 : 'auto',
                      margin: collapsed ? '0 auto' : '0',
                    },
                    section: {
                      margin: collapsed ? 0 : undefined,
                    }
                  }}
                  color="indigo"
                  className="nav-link"
                  data-collapsed={collapsed}
                />
              );

              if (collapsed) {
                return (
                  <Tooltip
                    key={item.link}
                    label={item.label}
                    position="right"
                    offset={20}
                    withArrow
                    transitionProps={{ transition: 'fade', duration: 200 }}
                  >
                    {navLink}
                  </Tooltip>
                );
              }

              return navLink;
            })}
          </Stack>
        </Box>
      ))}
    </ScrollArea>
  );
}

function DashboardLayoutContent({ children }: { children: React.ReactNode }) {
  const [opened, { toggle, close }] = useDisclosure();
  const [desktopCollapsed, { toggle: toggleDesktop }] = useDisclosure(false);
  const isMobile = useMediaQuery("(max-width: 48em)");
  const pathname = usePathname();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState<string | null>(null);

  const isLegacyEstimateLogin = pathname.startsWith("/estimate/login");

  useEffect(() => {
    if (isLegacyEstimateLogin) {
      setLoading(false);
      return;
    }

    setLoading(true);
    let mounted = true;

    const ensureSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;

      if (data.session) {
        const user = data.session.user;
        const { data: profile } = await supabase
          .from("app_users")
          .select("name")
          .eq("id", user.id)
          .maybeSingle();

        const sessionName = (() => {
          const meta = user.user_metadata as Record<string, unknown> | undefined;
          const metaName = meta?.name;
          if (typeof metaName === "string" && metaName.trim()) return metaName.trim();
          const email = user.email;
          if (typeof email === "string" && email.includes("@")) return email.split("@")[0];
          return null;
        })();

        const resolvedName = profile?.name ?? sessionName ?? null;
        setDisplayName(resolvedName);

        if (!profile?.name && resolvedName) {
          await supabase.from("app_users").upsert(
            {
              id: user.id,
              name: resolvedName,
              initials: resolvedName.slice(0, 2),
              color: null,
            },
            { onConflict: "id" }
          );
        }

        setLoading(false);
        return;
      }

      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    };

    void ensureSession();

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setDisplayName(null);
        setLoading(true);
        router.replace(`/login?next=${encodeURIComponent(window.location.pathname)}`);
        return;
      }
      const user = session.user;
      const meta = user.user_metadata as Record<string, unknown> | undefined;
      const metaName = typeof meta?.name === "string" ? (meta.name as string).trim() : "";
      const email = user.email;
      const fallback = typeof email === "string" && email.includes("@") ? email.split("@")[0] : null;
      setDisplayName(metaName || fallback);
      setLoading(false);
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, [isLegacyEstimateLogin, router]);

  if (isLegacyEstimateLogin) {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <Box className="app-shell" p="xl">
        <Paper className="app-surface" p="xl" maw={520}>
          <Text fw={600} className="brand-title">
            WE-ET ERP
          </Text>
          <Text c="dimmed" mt="xs">
            인증 정보를 확인하는 중입니다...
          </Text>
        </Paper>
      </Box>
    );
  }

  return (
    <AppShell
      className="app-shell"
      header={{ height: 64 }}
      navbar={{
        width: { base: desktopCollapsed ? 80 : 260, sm: desktopCollapsed ? 80 : 260 },
        breakpoint: "sm",
        collapsed: { mobile: false }
      }}
      footer={{ height: 80, offset: true }}
      padding="md"
    >
      <AppShell.Header style={{ borderBottom: '1px solid var(--border)', background: 'var(--panel)' }}>
        <Group h="100%" px="lg" justify="space-between">
          <Group gap="sm">
            <Text className="brand-title" fw={900} size="xl" style={{ fontSize: rem(22), color: 'var(--mantine-color-gray-9)' }}>
              WE-ET ERP
            </Text>
          </Group>
          <Group gap="xs">
            <ThemeToggle />
            {displayName && (
              <Text size="sm" fw={700} c="dimmed" className="desktop-only" mr="xs">
                {displayName}님 환영합니다
              </Text>
            )}
            <Button
              variant="default"
              color="gray"
              radius="md"
              size="sm"
              onClick={async () => {
                await supabase.auth.signOut();
                router.replace("/login");
              }}
            >
              로그아웃
            </Button>
          </Group>
        </Group>
      </AppShell.Header>

      {/* Mobile Menu Backdrop */}
      {isMobile && opened && (
        <Box
          onClick={close}
          style={{
            position: 'fixed',
            top: 64,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.05)',
            zIndex: 1050,
            cursor: 'pointer'
          }}
        />
      )}

      <AppShell.Navbar p="md" className="sidebar-glass" style={{
        borderRight: '1px solid var(--border)',
        width: isMobile ? (desktopCollapsed ? 80 : 260) : (desktopCollapsed ? 80 : 260),
        maxWidth: isMobile ? (desktopCollapsed ? 80 : '100%') : '100%',
        height: isMobile ? 'calc(100dvh - 64px)' : 'auto',
        top: 64,
        zIndex: isMobile ? 1100 : 100,
        transition: 'width 0.2s ease, transform 0.2s ease',
        overflow: 'visible',
      }}>
        <Box style={{ height: '100%', overflow: 'hidden' }}>
          <SidebarContent close={close} pathname={pathname} collapsed={desktopCollapsed} />
        </Box>

        {/* Bookmark style toggle button */}
        <Box
          onClick={toggleDesktop}
          style={{
            position: 'absolute',
            right: -20, // More overlap
            top: '50%',
            transform: 'translateY(-50%)',
            width: 20,
            height: 60,
            backgroundColor: 'var(--panel)',
            border: '1px solid var(--border)',
            borderLeft: 'none',
            borderRadius: '0 12px 12px 0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            zIndex: 1001,
            boxShadow: '4px 0 10px rgba(0,0,0,0.08)',
            transition: 'all 0.2s ease',
          }}
          className="sidebar-toggle-bookmark"
        >
          {desktopCollapsed ? (
            <IconChevronRight size={14} stroke={3} color="var(--mantine-color-indigo-6)" />
          ) : (
            <IconChevronLeft size={14} stroke={3} color="var(--mantine-color-indigo-6)" />
          )}
        </Box>
      </AppShell.Navbar>

      <AppShell.Main style={{ background: 'var(--surface)' }}>{children}</AppShell.Main>

      <AppShell.Footer hiddenFrom="sm" p="0" style={{ borderTop: 'none', background: 'transparent', zIndex: 1000, height: 'auto' }}>
        <Box
          style={{
            background: 'var(--panel)',
            borderTop: '1px solid var(--border)',
            paddingBottom: 'env(safe-area-inset-bottom)',
            boxShadow: '0 -2px 10px rgba(0,0,0,0.05)'
          }}
        >
          <Group grow gap={0} p={0} justify="space-around">
            {[
              { label: "허브", icon: IconHome, link: "/" },
              { label: "캘린더", icon: IconCalendar, link: "/calendar" },
              { label: "To-Do", icon: IconCheckbox, link: "/todo" },
              { label: "경비", icon: IconReceipt, link: "/expenses" },
              { label: "공과금", icon: IconBolt, link: "/utility-bills" },
            ].map((item) => {
              const active = pathname === item.link;
              return (
                <Button
                  key={item.link}
                  component={Link}
                  href={item.link}
                  variant="subtle"
                  color={active ? "indigo" : "gray"}
                  radius={0}
                  h={50}
                  px={0}
                  style={{
                    flexDirection: 'column',
                    gap: 0,
                    height: 50,
                    padding: '4px 0',
                    backgroundColor: active ? 'var(--mantine-color-indigo-0)' : 'transparent',
                    transition: 'all 0.2s ease',
                    borderTop: active ? '2px solid var(--mantine-color-indigo-6)' : '2px solid transparent',
                  }}
                >
                  <item.icon
                    size={20}
                    stroke={active ? 2.5 : 2}
                    color={active ? 'var(--mantine-color-indigo-6)' : 'var(--mantine-color-gray-6)'}
                  />
                  <Text
                    size="xs"
                    fw={active ? 800 : 500}
                    style={{
                      fontSize: '9px',
                      marginTop: -2,
                      color: active ? 'var(--mantine-color-indigo-7)' : 'var(--mantine-color-gray-6)'
                    }}
                  >
                    {item.label}
                  </Text>
                </Button>
              );
            })}
          </Group>
        </Box>
      </AppShell.Footer>
    </AppShell>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <NotificationProvider>
      <DashboardLayoutContent>{children}</DashboardLayoutContent>
    </NotificationProvider>
  );
}

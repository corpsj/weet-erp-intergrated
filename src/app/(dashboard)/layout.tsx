"use client";

import { AppShell, Burger, Button, Divider, Group, NavLink, Paper, Text, Box, rem, ScrollArea, Stack } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  IconBolt,
  IconBuildingStore,
  IconCalculator,
  IconCalendar,
  IconCheckbox,
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
    items: [{ label: "견적 시스템", icon: IconCalculator, link: "/estimate" }],
  },
  {
    group: "관리",
    items: [
      { label: "설정", icon: IconSettings, link: "/settings" },
    ],
  },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [opened, { toggle, close }] = useDisclosure();
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
        router.replace(`/login?next=${encodeURIComponent(pathname)}`);
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
  }, [isLegacyEstimateLogin, pathname, router]);

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
      navbar={{ width: 260, breakpoint: "sm", collapsed: { mobile: !opened } }}
      footer={{ height: 80, offset: true }}
      padding="md"
    >
      <AppShell.Header style={{ borderBottom: '1px solid var(--mantine-color-gray-2)', background: 'var(--mantine-color-white)' }}>
        <Group h="100%" px="lg" justify="space-between">
          <Group gap="sm">
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
            <Text className="brand-title" fw={900} size="xl" style={{ fontSize: rem(22), color: 'var(--mantine-color-gray-9)' }}>
              WE-ET ERP
            </Text>
          </Group>
          <Group gap="xs">
            {displayName && (
              <Text size="sm" fw={700} c="gray.7" className="desktop-only" mr="xs">
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

      <AppShell.Navbar p="md" style={{ borderRight: '1px solid var(--mantine-color-gray-2)', background: 'var(--mantine-color-gray-0)' }}>
        <ScrollArea style={{ flex: 1 }} type="scroll">
          {groupedNavItems.map((group) => (
            <Box key={group.group} mb="xl">
              <Text size="xs" c="indigo.7" fw={800} tt="uppercase" mb="xs" style={{ letterSpacing: '0.05em' }}>
                {group.group}
              </Text>
              <Stack gap={4}>
                {group.items.map((item) => (
                  <NavLink
                    key={item.link}
                    component={Link}
                    href={item.link}
                    label={item.label}
                    leftSection={<item.icon size={20} stroke={2} />}
                    active={item.link === "/estimate" ? pathname.startsWith("/estimate") : pathname === item.link}
                    variant="filled"
                    onClick={close}
                    styles={{
                      root: {
                        transition: 'all 0.1s ease',
                        borderRadius: 'var(--mantine-radius-md)',
                        padding: '10px 12px',
                        backgroundColor: (item.link === "/estimate" ? pathname.startsWith("/estimate") : pathname === item.link)
                          ? 'var(--mantine-color-indigo-6)'
                          : 'transparent',
                        color: (item.link === "/estimate" ? pathname.startsWith("/estimate") : pathname === item.link)
                          ? 'var(--mantine-color-white)'
                          : 'var(--mantine-color-gray-7)',
                      },
                      label: { fontWeight: 600, fontSize: '14px' },
                      section: { color: (item.link === "/estimate" ? pathname.startsWith("/estimate") : pathname === item.link) ? 'inherit' : 'var(--mantine-color-indigo-5)' }
                    }}
                  />
                ))}
              </Stack>
            </Box>
          ))}
        </ScrollArea>
      </AppShell.Navbar>

      <AppShell.Main style={{ background: 'var(--mantine-color-gray-0)' }}>{children}</AppShell.Main>

      <AppShell.Footer hiddenFrom="sm" p="0" style={{ borderTop: 'none', background: 'transparent', zIndex: 1000, height: 'auto' }}>
        <Box
          style={{
            background: 'var(--mantine-color-white)',
            borderTop: '1px solid var(--mantine-color-gray-2)',
            paddingBottom: 'max(env(safe-area-inset-bottom), 12px)',
            boxShadow: '0 -2px 10px rgba(0,0,0,0.05)'
          }}
        >
          <Group grow gap={0} p={4} justify="space-around">
            {[
              { label: "허브", icon: IconHome, link: "/" },
              { label: "To-Do", icon: IconCheckbox, link: "/todo" },
              { label: "메모", icon: IconNotes, link: "/memos" },
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
                  radius="md"
                  h={60}
                  px={0}
                  style={{
                    flexDirection: 'column',
                    gap: 2,
                    height: 'auto',
                    padding: '8px 0',
                    backgroundColor: active ? 'var(--mantine-color-indigo-0)' : 'transparent',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <item.icon
                    size={24}
                    stroke={active ? 2.5 : 2}
                    color={active ? 'var(--mantine-color-indigo-6)' : 'var(--mantine-color-gray-6)'}
                  />
                  <Text
                    size="xs"
                    fw={active ? 800 : 600}
                    style={{
                      fontSize: '10px',
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

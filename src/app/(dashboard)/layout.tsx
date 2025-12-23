"use client";

import { AppShell, Burger, Button, Divider, Group, NavLink, Paper, Text, Box } from "@mantine/core";
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
      { label: "세금계산서", icon: IconReceipt2, link: "/tax-invoices" },
      { label: "입출금 내역", icon: IconTransferIn, link: "/transactions" },
      { label: "공과금", icon: IconBolt, link: "/utility-bills" },
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
      header={{ height: 68 }}
      navbar={{ width: 260, breakpoint: "sm", collapsed: { mobile: !opened } }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="lg" justify="space-between">
          <Group>
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
            <Box>
              <Text className="brand-title" fw={700} size="lg">
                WE-ET ERP
              </Text>
            </Box>
          </Group>
          <Group gap="xs">
            {displayName && (
              <Text size="sm" c="dimmed">
                {displayName}
              </Text>
            )}
            <Button
              variant="light"
              color="gray"
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

      <AppShell.Navbar p="md">
        {groupedNavItems.map((group) => (
          <Box key={group.group} mb="md">
            <Text size="xs" c="dimmed" fw={600} tt="uppercase">
              {group.group}
            </Text>
            <Divider my="sm" />
            {group.items.map((item) => (
              <NavLink
                key={item.link}
                component={Link}
                href={item.link}
                label={item.label}
                leftSection={<item.icon size={18} stroke={1.5} />}
                active={item.link === "/estimate" ? pathname.startsWith("/estimate") : pathname === item.link}
                variant="light"
                mb={6}
                onClick={close}
                hiddenFrom={item.label === "견적 시스템" ? "sm" : undefined}
              />
            ))}
          </Box>
        ))}
      </AppShell.Navbar>

      <AppShell.Main>{children}</AppShell.Main>
    </AppShell>
  );
}

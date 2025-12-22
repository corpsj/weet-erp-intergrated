"use client";

import { AppShell, Burger, Group, NavLink, Text, Box, Divider, Button, Paper } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  IconCalendar,
  IconCheckbox,
  IconHome,
  IconCalculator,
  IconSettings,
  IconUser,
  IconKey,
  IconReceipt,
} from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

const navItems = [
  { label: "허브", icon: IconHome, link: "/" },
  { label: "캘린더", icon: IconCalendar, link: "/calendar" },
  { label: "To-Do", icon: IconCheckbox, link: "/todo" },
  { label: "견적", icon: IconCalculator, link: "/estimate" },
  { label: "계정 공유", icon: IconKey, link: "/vault" },
  { label: "경비 청구", icon: IconReceipt, link: "/expenses" },
  { label: "프로필", icon: IconUser, link: "/profile" },
  { label: "설정", icon: IconSettings, link: "/settings" },
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
      const nextName = metaName || fallback;
      setDisplayName(nextName);
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
            weet ERP
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
                weet ERP
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
        <Text size="xs" c="dimmed" fw={600} tt="uppercase">
          메뉴
        </Text>
        <Divider my="sm" />
        {navItems.map((item) => (
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
          />
        ))}
      </AppShell.Navbar>

      <AppShell.Main>{children}</AppShell.Main>
    </AppShell>
  );
}

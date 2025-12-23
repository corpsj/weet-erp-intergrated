"use client";

import { Box, Button, Group, Paper, Stack, Tabs, Text } from "@mantine/core";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

const tabItems = [
  { value: "materials", label: "자재별 단가", href: "/estimate/materials" },
  { value: "presets", label: "공정 프리셋", href: "/estimate/presets" },
  { value: "estimate", label: "최종 견적", href: "/estimate" },
];

export default function EstimateLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState<string | null>(null);

  const isLoginPage = pathname.startsWith("/estimate/login");

  useEffect(() => {
    if (isLoginPage) {
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
        router.replace(`/login?next=${encodeURIComponent(pathname)}`);
        setDisplayName(null);
        setLoading(true);
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
  }, [isLoginPage, pathname, router]);

  const activeTab = useMemo(() => {
    if (pathname.startsWith("/estimate/materials")) return "materials";
    if (pathname.startsWith("/estimate/presets")) return "presets";
    return "estimate";
  }, [pathname]);

  if (isLoginPage) {
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
    <Stack gap="md">
      <Paper className="app-surface" p="md" radius="md">
        <Group justify="space-between" align="center" wrap="nowrap">
          <Box>
            <Text className="brand-title" fw={700} size="lg">
              견적 모듈
            </Text>
            <Text size="sm" c="dimmed">
              자재, 프리셋, 견적 산출
            </Text>
          </Box>
          <Group gap="xs">
            {displayName && (
              <Text size="sm" c="dimmed">
                {displayName}
              </Text>
            )}
          </Group>
        </Group>
        <Tabs value={activeTab} variant="pills" mt="sm">
          <Tabs.List>
            {tabItems.map((item) => (
              <Tabs.Tab key={item.value} value={item.value} component={Link} href={item.href as any}>
                {item.label}
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs>
      </Paper>
      {children}
    </Stack>
  );
}

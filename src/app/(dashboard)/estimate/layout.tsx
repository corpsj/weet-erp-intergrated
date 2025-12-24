"use client";

import { Box, Paper, Stack, Tabs, Text, Group } from "@mantine/core";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

const tabItems = [
  { value: "materials", label: "자재별 단가", href: "/estimate/materials" },
  { value: "presets", label: "공정 프리셋", href: "/estimate/presets" },
  { value: "estimate", label: "최종 견적", href: "/estimate" },
];

export default function EstimateLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [displayName, setDisplayName] = useState<string | null>(null);

  const isLoginPage = pathname.startsWith("/estimate/login");

  useEffect(() => {
    if (isLoginPage) return;

    let mounted = true;

    const fetchProfile = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted || !session) return;

      const user = session.user;
      const { data: profile } = await supabase
        .from("app_users")
        .select("name")
        .eq("id", user.id)
        .maybeSingle();

      if (profile?.name) {
        setDisplayName(profile.name);
      } else {
        const meta = user.user_metadata;
        setDisplayName(meta?.name || user.email?.split("@")[0] || null);
      }
    };

    void fetchProfile();

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      if (!session) {
        setDisplayName(null);
        return;
      }
      const user = session.user;
      const meta = user.user_metadata;
      setDisplayName(meta?.name || user.email?.split("@")[0] || null);
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, [isLoginPage]);

  const activeTab = useMemo(() => {
    if (pathname.startsWith("/estimate/materials")) return "materials";
    if (pathname.startsWith("/estimate/presets")) return "presets";
    return "estimate";
  }, [pathname]);

  if (isLoginPage) {
    return <>{children}</>;
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

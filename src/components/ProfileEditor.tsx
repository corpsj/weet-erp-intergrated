"use client";

import { Button, Group, Paper, Stack, Text, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

const toInitials = (name: string) => {
  const trimmed = name.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 2);
};

const nameFromSession = (session: any) => {
  const metaName = session?.user?.user_metadata?.name;
  if (typeof metaName === "string" && metaName.trim()) return metaName.trim();
  const email = session?.user?.email;
  if (typeof email === "string" && email.includes("@")) return email.split("@")[0];
  return null;
};

export function ProfileEditor() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      const userId = session?.user?.id;
      if (!mounted) return;
      if (!userId) {
        setLoading(false);
        return;
      }

      const { data: profile } = await supabase
        .from("app_users")
        .select("name")
        .eq("id", userId)
        .maybeSingle();

      if (!mounted) return;

      setName(profile?.name ?? nameFromSession(session) ?? "");
      setLoading(false);
    };

    void load();

    return () => {
      mounted = false;
    };
  }, []);

  const save = useCallback(async () => {
    const nextName = name.trim();
    if (!nextName) {
      notifications.show({ title: "이름 필요", message: "이름을 입력하세요.", color: "yellow" });
      return;
    }

    setSaving(true);

    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id;
    if (!userId) {
      setSaving(false);
      notifications.show({ title: "저장 실패", message: "로그인이 필요합니다.", color: "red" });
      return;
    }

    const { error: authError } = await supabase.auth.updateUser({
      data: { name: nextName },
    });

    if (authError) {
      setSaving(false);
      notifications.show({ title: "저장 실패", message: authError.message, color: "red" });
      return;
    }

    const { error: profileError } = await supabase.from("app_users").upsert(
      {
        id: userId,
        name: nextName,
        initials: toInitials(nextName),
        color: null,
      },
      { onConflict: "id" }
    );

    setSaving(false);

    if (profileError) {
      notifications.show({ title: "저장 실패", message: profileError.message, color: "red" });
      return;
    }

    notifications.show({ title: "저장 완료", message: "프로필이 업데이트되었습니다.", color: "gray" });
  }, [name]);

  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap="sm">
        <Text fw={600}>프로필</Text>
        <TextInput
          label="이름"
          placeholder="홍길동"
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
          disabled={loading}
          required
        />
        <Group justify="flex-end">
          <Button color="gray" onClick={() => void save()} loading={saving} disabled={loading}>
            저장
          </Button>
        </Group>
        <Text size="xs" c="dimmed">
          이름은 상단 표시 및 담당자 목록에 사용됩니다.
        </Text>
      </Stack>
    </Paper>
  );
}


"use client";

import { Button, ColorSwatch, Group, Paper, Stack, Text, TextInput, Textarea, rem, CheckIcon } from "@mantine/core";
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
  const [position, setPosition] = useState("");
  const [bio, setBio] = useState("");
  const [color, setColor] = useState<string | null>(null);

  const colors = [
    "#2e2e2e", "#fa5252", "#e64980", "#be4bdb", "#7950f2",
    "#4c6ef5", "#228be6", "#15aabf", "#12b886", "#40c057",
    "#82c91e", "#fab005", "#fd7e14"
  ];

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
        .select("name, color, position, bio")
        .eq("id", userId)
        .maybeSingle();

      if (!mounted) return;

      setName(profile?.name ?? nameFromSession(session) ?? "");
      setPosition((profile as any)?.position ?? "");
      setBio((profile as any)?.bio ?? "");
      setColor(profile?.color ?? null);
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
        color: color,
        position: position.trim() || null,
        bio: bio.trim() || null,
      },
      { onConflict: "id" }
    );

    setSaving(false);

    if (profileError) {
      notifications.show({ title: "저장 실패", message: profileError.message, color: "red" });
      return;
    }

    notifications.show({ title: "저장 완료", message: "프로필이 업데이트되었습니다.", color: "gray" });
  }, [name, position, bio, color]);

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
        <TextInput
          label="직책"
          placeholder=""
          value={position}
          onChange={(event) => setPosition(event.currentTarget.value)}
          disabled={loading}
        />
        <Textarea
          label="자기소개"
          placeholder="나를 소개하는 한 마디"
          value={bio}
          onChange={(event) => setBio(event.currentTarget.value)}
          disabled={loading}
          autosize
          minRows={2}
        />

        <Stack gap={4}>
          <Text size="sm" fw={500}>퍼스널 컬러</Text>
          <Group gap="xs">
            {colors.map((c) => (
              <ColorSwatch
                key={c}
                color={c}
                onClick={() => setColor(c)}
                style={{ cursor: "pointer", color: "#fff" }}
              >
                {color === c && <CheckIcon style={{ width: rem(12), height: rem(12) }} />}
              </ColorSwatch>
            ))}
          </Group>
        </Stack>

        <Group justify="flex-end" mt="md">
          <Button color="gray" onClick={() => void save()} loading={saving} disabled={loading}>
            저장
          </Button>
        </Group>
        <Text size="xs" c="dimmed">
          기본 정보는 상단 표시 및 전체 시스템 내 담당자 정보에 사용됩니다.
        </Text>
      </Stack>
    </Paper>
  );
}


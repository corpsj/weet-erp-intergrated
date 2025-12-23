"use client";

import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Card,
  Checkbox,
  Grid,
  Group,
  Modal,
  Paper,
  Stack,
  Text,
  TextInput,
  Textarea,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconPlus, IconRefresh, IconTrash } from "@tabler/icons-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type InfoCard = {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  sort_index: number | null;
  created_at: string;
  updated_at: string;
};

const fetchWithAuth = async (input: RequestInfo | URL, init?: RequestInit) => {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("로그인이 필요합니다.");
  return fetch(input, { ...init, headers: { ...(init?.headers ?? {}), authorization: `Bearer ${token}` } });
};

export default function InfoPage() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<InfoCard[]>([]);

  const [opened, setOpened] = useState(false);
  const [editing, setEditing] = useState<InfoCard | null>(null);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetchWithAuth("/api/info-cards");
      const payload = (await response.json().catch(() => null)) as any;
      if (!response.ok) throw new Error(payload?.message ?? "불러오기 실패");
      setItems((payload?.items ?? []) as InfoCard[]);
    } catch (error) {
      notifications.show({
        title: "불러오기 실패",
        message: error instanceof Error ? error.message : "알 수 없는 오류",
        color: "red",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = useCallback(() => {
    setEditing(null);
    setTitle("");
    setBody("");
    setPinned(false);
    setOpened(true);
  }, []);

  const openEdit = useCallback((item: InfoCard) => {
    setEditing(item);
    setTitle(item.title);
    setBody(item.body);
    setPinned(item.pinned);
    setOpened(true);
  }, []);

  const save = useCallback(async () => {
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      notifications.show({ title: "제목 필요", message: "제목을 입력하세요.", color: "yellow" });
      return;
    }

    setSaving(true);
    try {
      const response = await fetchWithAuth(editing ? `/api/info-cards/${editing.id}` : "/api/info-cards", {
        method: editing ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: cleanTitle, body, pinned }),
      });
      const payload = (await response.json().catch(() => null)) as any;
      if (!response.ok) throw new Error(payload?.message ?? "저장 실패");
      setOpened(false);
      await load();
      notifications.show({ title: "저장 완료", message: "회사 정보가 저장되었습니다.", color: "gray" });
    } catch (error) {
      notifications.show({
        title: "저장 실패",
        message: error instanceof Error ? error.message : "알 수 없는 오류",
        color: "red",
      });
    } finally {
      setSaving(false);
    }
  }, [body, editing, load, pinned, title]);

  const remove = useCallback(async (id: string) => {
    const ok = window.confirm("삭제할까요? (복구 불가)");
    if (!ok) return;
    try {
      const response = await fetchWithAuth(`/api/info-cards/${id}`, { method: "DELETE" });
      const payload = (await response.json().catch(() => null)) as any;
      if (!response.ok) throw new Error(payload?.message ?? "삭제 실패");
      setItems((prev) => prev.filter((x) => x.id !== id));
      notifications.show({ title: "삭제 완료", message: "삭제되었습니다.", color: "gray" });
    } catch (error) {
      notifications.show({
        title: "삭제 실패",
        message: error instanceof Error ? error.message : "알 수 없는 오류",
        color: "red",
      });
    }
  }, []);

  const pinnedItems = useMemo(() => items.filter((x) => x.pinned), [items]);
  const normalItems = useMemo(() => items.filter((x) => !x.pinned), [items]);

  const renderCard = (item: InfoCard) => (
    <Card withBorder radius="md" padding="md">
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Stack gap={4} style={{ flex: 1 }}>
          <Text fw={700}>{item.title}</Text>
          <Text size="sm" c="dimmed" style={{ whiteSpace: "pre-wrap" }}>
            {item.body}
          </Text>
        </Stack>
        <ActionIcon variant="subtle" color="red" onClick={() => void remove(item.id)} aria-label="delete">
          <IconTrash size={16} />
        </ActionIcon>
      </Group>
      <Group justify="flex-end" mt="sm">
        <Button size="xs" variant="light" color="gray" onClick={() => openEdit(item)}>
          편집
        </Button>
      </Group>
    </Card>
  );

  return (
    <Box p="md">
      <Group justify="space-between" mb="lg">
        <div>
          <Title order={2}>회사 정보</Title>
          <Text c="dimmed" size="sm">
            사업자정보/공지/자주 쓰는 텍스트를 카드로 관리합니다.
          </Text>
        </div>
        <Group gap="xs">
          <Button
            leftSection={<IconRefresh size={16} />}
            variant="light"
            color="gray"
            onClick={() => void load()}
            loading={loading}
          >
            새로고침
          </Button>
          <Button leftSection={<IconPlus size={16} />} color="indigo" radius="md" onClick={openCreate}>
            카드 추가
          </Button>
        </Group>
      </Group>

      <Paper p="lg" radius="md" withBorder bg="var(--mantine-color-white)" shadow="xs">
        {!!pinnedItems.length && (
          <Stack gap="md" mb="lg">
            <Group gap="xs">
              <Badge variant="light" color="gray">
                고정
              </Badge>
              <Text size="sm" c="dimmed">
                자주 보는 정보를 고정해두세요.
              </Text>
            </Group>
            <Grid gutter="md">
              {pinnedItems.map((item) => (
                <Grid.Col key={item.id} span={{ base: 12, md: 6, lg: 4 }}>
                  {renderCard(item)}
                </Grid.Col>
              ))}
            </Grid>
          </Stack>
        )}

        <Grid gutter="md">
          {normalItems.map((item) => (
            <Grid.Col key={item.id} span={{ base: 12, md: 6, lg: 4 }}>
              {renderCard(item)}
            </Grid.Col>
          ))}
        </Grid>

        {!items.length && !loading && <Text size="sm" c="dimmed">등록된 카드가 없습니다.</Text>}
      </Paper>

      <Modal opened={opened} onClose={() => setOpened(false)} title={<Text fw={900}>{editing ? "카드 편집" : "카드 추가"}</Text>} centered radius="md">
        <Stack gap="sm">
          <TextInput label="제목" value={title} onChange={(e) => setTitle(e.currentTarget.value)} required />
          <Textarea label="내용" value={body} onChange={(e) => setBody(e.currentTarget.value)} autosize minRows={4} />
          <Checkbox label="고정" checked={pinned} onChange={(e) => setPinned(e.currentTarget.checked)} />
          <Group justify="flex-end">
            <Button variant="light" color="gray" onClick={() => setOpened(false)}>
              취소
            </Button>
            <Button color="indigo" radius="md" onClick={() => void save()} loading={saving}>
              저장
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Box>
  );
}


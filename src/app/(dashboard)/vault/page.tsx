"use client";

import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Group,
  Modal,
  Paper,
  Stack,
  Table,
  Text,
  TextInput,
  Textarea,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconCopy, IconEye, IconEyeOff, IconPlus, IconRefresh, IconTrash } from "@tabler/icons-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type VaultEntry = {
  id: string;
  title: string;
  url: string | null;
  username: string | null;
  note: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
};

const fetchWithAuth = async (input: RequestInfo | URL, init?: RequestInit) => {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("로그인이 필요합니다.");
  return fetch(input, { ...init, headers: { ...(init?.headers ?? {}), authorization: `Bearer ${token}` } });
};

export default function VaultPage() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<VaultEntry[]>([]);
  const [revealed, setRevealed] = useState<Record<string, string>>({});

  const [opened, setOpened] = useState(false);
  const [editing, setEditing] = useState<VaultEntry | null>(null);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [note, setNote] = useState("");
  const [tags, setTags] = useState("");

  const openCreate = useCallback(() => {
    setEditing(null);
    setTitle("");
    setUrl("");
    setUsername("");
    setPassword("");
    setNote("");
    setTags("");
    setOpened(true);
  }, []);

  const openEdit = useCallback((item: VaultEntry) => {
    setEditing(item);
    setTitle(item.title);
    setUrl(item.url ?? "");
    setUsername(item.username ?? "");
    setPassword("");
    setNote(item.note ?? "");
    setTags(item.tags?.join(", ") ?? "");
    setOpened(true);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetchWithAuth("/api/vault");
      const payload = (await response.json().catch(() => null)) as any;
      if (!response.ok) throw new Error(payload?.message ?? "불러오기 실패");
      setItems((payload?.items ?? []) as VaultEntry[]);
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

  const save = useCallback(async () => {
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      notifications.show({ title: "제목 필요", message: "제목을 입력하세요.", color: "yellow" });
      return;
    }
    if (!editing && !password) {
      notifications.show({ title: "비밀번호 필요", message: "비밀번호를 입력하세요.", color: "yellow" });
      return;
    }

    const tagList = tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 20);

    setSaving(true);
    try {
      const response = await fetchWithAuth(editing ? `/api/vault/${editing.id}` : "/api/vault", {
        method: editing ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: cleanTitle,
          url: url.trim() || null,
          username: username.trim() || null,
          password: password || undefined,
          note: note || null,
          tags: tagList,
        }),
      });
      const payload = (await response.json().catch(() => null)) as any;
      if (!response.ok) throw new Error(payload?.message ?? "저장 실패");
      setOpened(false);
      await load();
      notifications.show({ title: "저장 완료", message: "계정이 저장되었습니다.", color: "gray" });
    } catch (error) {
      notifications.show({
        title: "저장 실패",
        message: error instanceof Error ? error.message : "알 수 없는 오류",
        color: "red",
      });
    } finally {
      setSaving(false);
    }
  }, [editing, load, note, password, tags, title, url, username]);

  const reveal = useCallback(
    async (id: string) => {
      if (revealed[id]) return;
      try {
        const response = await fetchWithAuth(`/api/vault/${id}/reveal`);
        const payload = (await response.json().catch(() => null)) as any;
        if (!response.ok) throw new Error(payload?.message ?? "표시 실패");
        const value = String(payload?.password ?? "");
        setRevealed((prev) => ({ ...prev, [id]: value }));
      } catch (error) {
        notifications.show({
          title: "표시 실패",
          message: error instanceof Error ? error.message : "알 수 없는 오류",
          color: "red",
        });
      }
    },
    [revealed]
  );

  const copyPassword = useCallback(
    async (id: string) => {
      const value = revealed[id];
      if (!value) {
        notifications.show({ title: "복사 실패", message: "먼저 비밀번호를 표시하세요.", color: "yellow" });
        return;
      }
      try {
        await navigator.clipboard.writeText(value);
        notifications.show({ title: "복사됨", message: "비밀번호가 복사되었습니다.", color: "gray" });
      } catch {
        notifications.show({ title: "복사 실패", message: "클립보드 접근이 불가합니다.", color: "red" });
      }
    },
    [revealed]
  );

  const remove = useCallback(async (id: string) => {
    const ok = window.confirm("삭제할까요? (복구 불가)");
    if (!ok) return;
    try {
      const response = await fetchWithAuth(`/api/vault/${id}`, { method: "DELETE" });
      const payload = (await response.json().catch(() => null)) as any;
      if (!response.ok) throw new Error(payload?.message ?? "삭제 실패");
      setRevealed((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setItems((prev) => prev.filter((item) => item.id !== id));
      notifications.show({ title: "삭제 완료", message: "삭제되었습니다.", color: "gray" });
    } catch (error) {
      notifications.show({
        title: "삭제 실패",
        message: error instanceof Error ? error.message : "알 수 없는 오류",
        color: "red",
      });
    }
  }, []);

  const rows = useMemo(() => {
    return items.map((item) => (
      <Table.Tr key={item.id}>
        <Table.Td>
          <Text fw={600}>{item.title}</Text>
          {item.url && (
            <Text size="xs" c="dimmed" lineClamp={1}>
              {item.url}
            </Text>
          )}
        </Table.Td>
        <Table.Td>
          <Text size="sm">{item.username ?? "-"}</Text>
        </Table.Td>
        <Table.Td>
          <Group gap={6}>
            {(item.tags ?? []).slice(0, 3).map((tag) => (
              <Badge key={tag} variant="light" color="gray">
                {tag}
              </Badge>
            ))}
          </Group>
        </Table.Td>
        <Table.Td>
          <Group gap="xs" justify="flex-end" wrap="nowrap">
            <ActionIcon
              variant="subtle"
              color="gray"
              onClick={() =>
                revealed[item.id]
                  ? setRevealed((prev) => {
                    const next = { ...prev };
                    delete next[item.id];
                    return next;
                  })
                  : void reveal(item.id)
              }
              aria-label="reveal"
            >
              {revealed[item.id] ? <IconEyeOff size={16} /> : <IconEye size={16} />}
            </ActionIcon>
            <ActionIcon variant="subtle" color="gray" onClick={() => void copyPassword(item.id)} aria-label="copy">
              <IconCopy size={16} />
            </ActionIcon>
            <Button size="xs" variant="light" color="gray" onClick={() => openEdit(item)}>
              편집
            </Button>
            <ActionIcon variant="subtle" color="red" onClick={() => void remove(item.id)} aria-label="delete">
              <IconTrash size={16} />
            </ActionIcon>
          </Group>
        </Table.Td>
      </Table.Tr>
    ));
  }, [copyPassword, items, openEdit, remove, reveal, revealed]);

  return (
    <Box p="md">
      <Group justify="space-between" mb="lg">
        <div>
          <Title order={2}>계정 공유</Title>
          <Text c="dimmed" size="sm">
            회사에서 사용하는 사이트 계정/비밀번호를 공유합니다.
          </Text>
        </div>
        <Group gap="xs">
          <Button leftSection={<IconRefresh size={16} />} variant="light" color="gray" onClick={() => void load()} loading={loading}>
            새로고침
          </Button>
          <Button leftSection={<IconPlus size={16} />} color="gray" onClick={openCreate}>
            추가
          </Button>
        </Group>
      </Group>

      <Paper className="app-surface" p="lg" radius="md">
        <Table verticalSpacing="sm" highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>항목</Table.Th>
              <Table.Th>아이디</Table.Th>
              <Table.Th>태그</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>{rows}</Table.Tbody>
        </Table>
        {!items.length && !loading && <Text size="sm" c="dimmed">등록된 계정이 없습니다.</Text>}
      </Paper>

      <Modal opened={opened} onClose={() => setOpened(false)} title={editing ? "계정 편집" : "계정 추가"} centered>
        <Stack gap="sm">
          <TextInput label="제목" value={title} onChange={(e) => setTitle(e.currentTarget.value)} required />
          <TextInput label="URL" value={url} onChange={(e) => setUrl(e.currentTarget.value)} placeholder="https://..." />
          <TextInput label="아이디" value={username} onChange={(e) => setUsername(e.currentTarget.value)} />
          <TextInput
            label="비밀번호"
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
            placeholder={editing ? "(변경 시에만 입력)" : ""}
            required={!editing}
          />
          <TextInput label="태그(쉼표로 구분)" value={tags} onChange={(e) => setTags(e.currentTarget.value)} />
          <Textarea label="메모" value={note} onChange={(e) => setNote(e.currentTarget.value)} autosize minRows={3} />
          <Group justify="flex-end">
            <Button variant="light" color="gray" onClick={() => setOpened(false)}>
              취소
            </Button>
            <Button color="gray" onClick={() => void save()} loading={saving}>
              저장
            </Button>
          </Group>
          <Text size="xs" c="dimmed">
            비밀번호는 서버에서 암호화되어 저장됩니다.
          </Text>
        </Stack>
      </Modal>
    </Box>
  );
}


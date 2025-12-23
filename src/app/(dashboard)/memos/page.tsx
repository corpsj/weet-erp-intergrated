"use client";

import {
  ActionIcon,
  Box,
  Button,
  FileButton,
  Group,
  Modal,
  Paper,
  Stack,
  Table,
  Text,
  TextInput,
  Textarea,
  Title,
  SimpleGrid,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconPaperclip, IconPlus, IconSearch, IconTrash } from "@tabler/icons-react";
import dayjs from "dayjs";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Memo = {
  id: string;
  title: string | null;
  body: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type Attachment = {
  id: string;
  memo_id: string;
  object_path: string;
  filename: string | null;
  content_type: string | null;
  size_bytes: number | null;
  created_at: string;
};

const fetchWithAuth = async (input: RequestInfo | URL, init?: RequestInit) => {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("로그인이 필요합니다.");
  return fetch(input, { ...init, headers: { ...(init?.headers ?? {}), authorization: `Bearer ${token}` } });
};

export default function MemosPage() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Memo[]>([]);

  const [opened, setOpened] = useState(false);
  const [editing, setEditing] = useState<Memo | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetchWithAuth("/api/memos");
      const payload = (await response.json().catch(() => null)) as any;
      if (!response.ok) throw new Error(payload?.message ?? "불러오기 실패");
      setItems((payload?.items ?? []) as Memo[]);
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

  const loadAttachments = useCallback(async (memoId: string) => {
    const response = await fetchWithAuth(`/api/memos/${memoId}/attachments`);
    const payload = (await response.json().catch(() => null)) as any;
    if (!response.ok) throw new Error(payload?.message ?? "첨부 불러오기 실패");
    setAttachments((payload?.items ?? []) as Attachment[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = useCallback(() => {
    setEditing(null);
    setTitle("");
    setBody("");
    setAttachments([]);
    setOpened(true);
  }, []);

  const openEdit = useCallback(
    async (item: Memo) => {
      setEditing(item);
      setTitle(item.title ?? "");
      setBody(item.body);
      setAttachments([]);
      setOpened(true);
      try {
        await loadAttachments(item.id);
      } catch { }
    },
    [loadAttachments]
  );

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const response = await fetchWithAuth(editing ? `/api/memos/${editing.id}` : "/api/memos", {
        method: editing ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: title.trim() || null, body }),
      });
      const payload = (await response.json().catch(() => null)) as any;
      if (!response.ok) throw new Error(payload?.message ?? "저장 실패");
      setOpened(false);
      await load();
      notifications.show({ title: "저장 완료", message: "메모가 저장되었습니다.", color: "gray" });
    } catch (error) {
      notifications.show({
        title: "저장 실패",
        message: error instanceof Error ? error.message : "알 수 없는 오류",
        color: "red",
      });
    } finally {
      setSaving(false);
    }
  }, [body, editing, load, title]);

  const remove = useCallback(async (id: string) => {
    const ok = window.confirm("삭제할까요? (복구 불가)");
    if (!ok) return;
    try {
      const response = await fetchWithAuth(`/api/memos/${id}`, { method: "DELETE" });
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

  const upload = useCallback(
    async (file: File) => {
      if (!editing) {
        notifications.show({ title: "업로드 불가", message: "먼저 저장한 뒤 업로드하세요.", color: "yellow" });
        return;
      }
      setUploading(true);
      try {
        const form = new FormData();
        form.set("file", file);
        const response = await fetchWithAuth(`/api/memos/${editing.id}/attachments`, { method: "POST", body: form });
        const payload = (await response.json().catch(() => null)) as any;
        if (!response.ok) throw new Error(payload?.message ?? "업로드 실패");
        await loadAttachments(editing.id);
        notifications.show({ title: "업로드 완료", message: "첨부가 업로드되었습니다.", color: "gray" });
      } catch (error) {
        notifications.show({
          title: "업로드 실패",
          message: error instanceof Error ? error.message : "알 수 없는 오류",
          color: "red",
        });
      } finally {
        setUploading(false);
      }
    },
    [editing, loadAttachments]
  );

  const openAttachment = useCallback(async (attachmentId: string) => {
    try {
      const response = await fetchWithAuth(`/api/memos/attachments/${attachmentId}/download`);
      const payload = (await response.json().catch(() => null)) as any;
      if (!response.ok) throw new Error(payload?.message ?? "열기 실패");
      const url = String(payload?.url ?? "");
      if (!url) throw new Error("URL missing");
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      notifications.show({
        title: "열기 실패",
        message: error instanceof Error ? error.message : "알 수 없는 오류",
        color: "red",
      });
    }
  }, []);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const q = searchQuery.toLowerCase();
      return (
        item.title?.toLowerCase().includes(q) ||
        item.body.toLowerCase().includes(q)
      );
    });
  }, [items, searchQuery]);

  const cards = useMemo(() => {
    return filteredItems.map((item) => (
      <Paper
        key={item.id}
        withBorder
        p="lg"
        radius="md"
        className="app-surface"
        style={{ cursor: "pointer", transition: "transform 0.2s" }}
        onClick={() => void openEdit(item)}
      >
        <Stack gap="md" h="100%">
          <Group justify="space-between" align="flex-start" wrap="nowrap">
            <Text fw={700} size="lg" lineClamp={1} style={{ flex: 1 }}>
              {item.title || "(제목 없음)"}
            </Text>
            <ActionIcon
              variant="subtle"
              color="red"
              onClick={(e) => {
                e.stopPropagation();
                void remove(item.id);
              }}
              aria-label="delete"
            >
              <IconTrash size={18} />
            </ActionIcon>
          </Group>

          <Text size="sm" lineClamp={4} c="dimmed" style={{ whiteSpace: "pre-wrap", flex: 1 }}>
            {item.body}
          </Text>

          <Group justify="space-between" align="center" mt="auto">
            <Text size="xs" c="dimmed">
              {dayjs(item.created_at).format("YYYY-MM-DD HH:mm")}
            </Text>
            <Button size="compact-xs" variant="light" color="gray">
              자세히 보기
            </Button>
          </Group>
        </Stack>
      </Paper>
    ));
  }, [filteredItems, openEdit, remove]);

  return (
    <>
      <Stack gap="lg">
        <Paper className="app-surface" p="lg" radius="md">
          <Group gap="md">
            <TextInput
              placeholder="메모 제목 또는 내용 검색..."
              size="md"
              leftSection={<IconSearch size={18} />}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.currentTarget.value)}
              style={{ flex: 1 }}
            />
            <Group gap="xs">
              <Button leftSection={<IconPlus size={16} />} color="gray" onClick={openCreate}>
                작성
              </Button>
            </Group>
          </Group>
        </Paper>

        <Box>
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="lg">
            {cards}
          </SimpleGrid>
          {!filteredItems.length && !loading && (
            <Paper p="xl" withBorder radius="md" style={{ textAlign: "center", borderStyle: "dashed" }}>
              <Text size="sm" c="dimmed">등록된 메모가 없거나 검색 결과가 없습니다.</Text>
            </Paper>
          )}
        </Box>
      </Stack>

      <Modal opened={opened} onClose={() => setOpened(false)} title={editing ? "메모 편집" : "메모 작성"} centered size="lg">
        <Stack gap="sm">
          <TextInput label="제목" value={title} onChange={(e) => setTitle(e.currentTarget.value)} />
          <Textarea label="내용" value={body} onChange={(e) => setBody(e.currentTarget.value)} autosize minRows={8} />

          <Paper withBorder p="md" radius="md">
            <Group justify="space-between" align="center" mb="xs">
              <Text fw={600}>첨부</Text>
              <FileButton onChange={(file) => file && void upload(file)} accept="*/*">
                {(props) => (
                  <Button
                    {...props}
                    size="xs"
                    variant="light"
                    color="gray"
                    leftSection={<IconPaperclip size={14} />}
                    loading={uploading}
                  >
                    업로드
                  </Button>
                )}
              </FileButton>
            </Group>
            {editing ? (
              attachments.length ? (
                <Stack gap={6}>
                  {attachments.map((a) => (
                    <Button
                      key={a.id}
                      variant="subtle"
                      color="gray"
                      justify="space-between"
                      onClick={() => void openAttachment(a.id)}
                      leftSection={<IconPaperclip size={14} />}
                    >
                      {a.filename ?? a.object_path}
                    </Button>
                  ))}
                </Stack>
              ) : (
                <Text size="sm" c="dimmed">
                  업로드된 첨부가 없습니다.
                </Text>
              )
            ) : (
              <Text size="sm" c="dimmed">
                먼저 저장한 뒤 첨부를 업로드하세요.
              </Text>
            )}
          </Paper>

          <Group justify="flex-end">
            <Button variant="light" color="gray" onClick={() => setOpened(false)}>
              닫기
            </Button>
            <Button color="gray" onClick={() => void save()} loading={saving}>
              저장
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}


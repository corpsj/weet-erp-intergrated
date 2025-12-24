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
  Container,
  Skeleton,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useMediaQuery } from "@mantine/hooks";
import { IconCopy, IconEye, IconEyeOff, IconPlus, IconTrash } from "@tabler/icons-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";

type VaultEntry = {
  id: string;
  title: string;
  url: string | null;
  username: string | null;
  note: string | null;
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
  const isMobile = useMediaQuery("(max-width: 768px)");
  const queryClient = useQueryClient();
  const [revealed, setRevealed] = useState<Record<string, string>>({});

  const [opened, setOpened] = useState(false);
  const [editing, setEditing] = useState<VaultEntry | null>(null);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [note, setNote] = useState("");

  const [query, setQuery] = useState("");

  const openCreate = useCallback(() => {
    setEditing(null);
    setTitle("");
    setUrl("");
    setUsername("");
    setPassword("");
    setNote("");
    setOpened(true);
  }, []);

  const openEdit = useCallback((item: VaultEntry) => {
    setEditing(item);
    setTitle(item.title);
    setUrl(item.url ?? "");
    setUsername(item.username ?? "");
    setPassword("");
    setNote(item.note ?? "");
    setOpened(true);
  }, []);

  const { data: items = [], isLoading: loading } = useQuery<VaultEntry[]>({
    queryKey: ["vault"],
    queryFn: async () => {
      const response = await fetchWithAuth("/api/vault");
      const payload = (await response.json().catch(() => null)) as any;
      if (!response.ok) throw new Error(payload?.message ?? "불러오기 실패");
      return (payload?.items ?? []) as VaultEntry[];
    },
  });

  const load = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["vault"] });
  }, [queryClient]);

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
        }),
      });
      const payload = (await response.json().catch(() => null)) as any;
      if (!response.ok) throw new Error(payload?.message ?? "저장 실패");
      setOpened(false);
      await queryClient.invalidateQueries({ queryKey: ["vault"] });
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
  }, [editing, load, note, password, title, url, username]);

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

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetchWithAuth(`/api/vault/${id}`, { method: "DELETE" });
      const payload = (await response.json().catch(() => null)) as any;
      if (!response.ok) throw new Error(payload?.message ?? "삭제 실패");
    },
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: ["vault"] });
      const previous = queryClient.getQueryData<VaultEntry[]>(["vault"]);
      queryClient.setQueryData<VaultEntry[]>(["vault"], (old) => old?.filter((item) => item.id !== id));
      return { previous };
    },
    onError: (err, id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["vault"], context.previous);
      }
      notifications.show({ title: "삭제 실패", message: err.message, color: "red" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["vault"] });
    },
    onSuccess: () => {
      notifications.show({ title: "삭제 완료", message: "삭제되었습니다.", color: "gray" });
    },
  });

  const remove = useCallback(async (id: string) => {
    const ok = window.confirm("삭제할까요? (복구 불가)");
    if (!ok) return;
    deleteMutation.mutate(id);
  }, [deleteMutation]);


  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesQuery =
        !query.trim() ||
        item.title.toLowerCase().includes(query.toLowerCase()) ||
        (item.url || "").toLowerCase().includes(query.toLowerCase()) ||
        (item.username || "").toLowerCase().includes(query.toLowerCase()) ||
        (item.note || "").toLowerCase().includes(query.toLowerCase());
      return matchesQuery;
    });
  }, [items, query]);

  const desktopRows = useMemo(() => {
    if (loading) {
      return Array(5).fill(0).map((_, i) => (
        <Table.Tr key={i}>
          <Table.Td><Skeleton height={20} width="60%" /></Table.Td>
          <Table.Td><Skeleton height={16} width="40%" /></Table.Td>
          <Table.Td><Skeleton height={20} width="50%" /></Table.Td>
          <Table.Td><Skeleton height={16} width="80%" /></Table.Td>
          <Table.Td><Group justify="flex-end"><Skeleton height={20} width={40} /></Group></Table.Td>
        </Table.Tr>
      ));
    }

    return filteredItems.map((item) => (
      <Table.Tr key={item.id}>
        <Table.Td>
          <Box style={{ minHeight: '44px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <Text fw={800} size="sm" style={{ lineHeight: 1.2, letterSpacing: '-0.01em' }}>{item.title}</Text>
            {item.url && (
              <Text
                size="xs"
                c="indigo.6"
                fw={600}
                lineClamp={1}
                component="a"
                href={item.url.startsWith("http") ? item.url : `https://${item.url}`}
                target="_blank"
                style={{ textDecoration: "none", lineHeight: 1.2 }}
              >
                {item.url}
              </Text>
            )}
          </Box>
        </Table.Td>
        <Table.Td>
          <Text size="sm" fw={600} ff="monospace">{item.username ?? "-"}</Text>
        </Table.Td>
        <Table.Td>
          <Group gap={8} wrap="nowrap" align="center">
            <Text size="sm" ff="monospace" fw={600} c={revealed[item.id] ? "dark" : "dimmed"}>
              {revealed[item.id] ? revealed[item.id] : "••••••••"}
            </Text>
            <Group gap={4}>
              <ActionIcon
                variant="light"
                color="indigo"
                radius="md"
                size="sm"
                onClick={() =>
                  revealed[item.id]
                    ? setRevealed((prev) => {
                      const next = { ...prev };
                      delete next[item.id];
                      return next;
                    })
                    : void reveal(item.id)
                }
                title="비밀번호 표시/숨기기"
              >
                {revealed[item.id] ? <IconEyeOff size={16} /> : <IconEye size={16} />}
              </ActionIcon>
              <ActionIcon variant="light" color="indigo" radius="md" size="sm" onClick={() => void copyPassword(item.id)} title="복사">
                <IconCopy size={16} />
              </ActionIcon>
            </Group>
          </Group>
        </Table.Td>
        <Table.Td>
          <Text size="sm" c="dimmed" lineClamp={1}>
            {item.note || "-"}
          </Text>
        </Table.Td>
        <Table.Td>
          <Group gap="xs" justify="flex-end" wrap="nowrap">
            <Button size="compact-xs" variant="subtle" color="indigo" radius="md" onClick={() => openEdit(item)}>
              편집
            </Button>
            <ActionIcon variant="subtle" color="red" radius="md" size="sm" onClick={() => void remove(item.id)}>
              <IconTrash size={16} />
            </ActionIcon>
          </Group>
        </Table.Td>
      </Table.Tr>
    ));
  }, [copyPassword, filteredItems, remove, reveal, revealed]);

  const mobileCards = useMemo(() => {
    if (loading) {
      return Array(3).fill(0).map((_, i) => (
        <Paper key={i} p="md" radius="md" withBorder shadow="xs" mb="sm">
          <Stack gap="sm">
            <Skeleton height={20} width="50%" />
            <Skeleton height={60} radius="md" />
            <Skeleton height={14} width="80%" />
          </Stack>
        </Paper>
      ));
    }

    return filteredItems.map((item) => (
      <Paper key={item.id} p="md" radius="md" withBorder shadow="xs" mb="sm" style={{ background: 'var(--mantine-color-white)' }}>
        <Stack gap="sm">
          <Group justify="space-between" wrap="nowrap" align="flex-start">
            <Stack gap={2} style={{ flex: 1 }}>
              <Text fw={900} size="md" style={{ letterSpacing: '-0.02em' }}>{item.title}</Text>
              {item.url && (
                <Text
                  size="xs"
                  c="indigo.6"
                  fw={700}
                  lineClamp={1}
                  component="a"
                  href={item.url.startsWith("http") ? item.url : `https://${item.url}`}
                  target="_blank"
                  style={{ textDecoration: 'none' }}
                >
                  {item.url}
                </Text>
              )}
            </Stack>
            <Group gap={4}>
              <Button size="compact-xs" variant="light" color="indigo" radius="md" onClick={() => openEdit(item)}>
                편집
              </Button>
              <ActionIcon variant="subtle" color="red" radius="md" size="sm" onClick={() => void remove(item.id)}>
                <IconTrash size={16} />
              </ActionIcon>
            </Group>
          </Group>

          <Paper withBorder p="xs" radius="md" bg="gray.0" style={{ borderStyle: 'dashed' }}>
            <Stack gap={8}>
              <Group justify="space-between">
                <Text size="xs" c="dimmed" fw={800} tt="uppercase">아이디</Text>
                <Text size="sm" fw={700} ff="monospace">{item.username || '(없음)'}</Text>
              </Group>
              <Group justify="space-between">
                <Text size="xs" c="dimmed" fw={800} tt="uppercase">비밀번호</Text>
                <Group gap={6}>
                  <Text size="sm" fw={700} ff="monospace" c={revealed[item.id] ? "indigo.7" : "gray.5"}>
                    {revealed[item.id] ? revealed[item.id] : "••••••••"}
                  </Text>
                  <ActionIcon
                    variant="filled"
                    color="indigo"
                    radius="md"
                    size="sm"
                    onClick={() => revealed[item.id] ? setRevealed(prev => {
                      const n = { ...prev };
                      delete n[item.id];
                      return n;
                    }) : void reveal(item.id)}
                  >
                    {revealed[item.id] ? <IconEyeOff size={14} /> : <IconEye size={14} />}
                  </ActionIcon>
                  <ActionIcon
                    variant="light"
                    color="indigo"
                    radius="md"
                    size="sm"
                    disabled={!revealed[item.id]}
                    onClick={() => void copyPassword(item.id)}
                  >
                    <IconCopy size={14} />
                  </ActionIcon>
                </Group>
              </Group>
            </Stack>
          </Paper>

          {item.note && (
            <Text size="xs" c="dimmed" lineClamp={2} style={{ background: 'var(--mantine-color-gray-0)', padding: '6px 10px', borderRadius: '8px' }}>
              {item.note}
            </Text>
          )}
        </Stack>
      </Paper>
    ));
  }, [copyPassword, filteredItems, remove, reveal, revealed]);

  return (
    <Container size="md" py="xl" px={isMobile ? "md" : "xl"}>
      <Box hiddenFrom="md" px="md" mb="lg">
        <Title order={2} fw={800} style={{ letterSpacing: '-0.02em' }}>계정 공유</Title>
      </Box>
      <Group justify="space-between" mb="xl" visibleFrom="md">
        <Box>
          <Title order={1} fw={800} style={{ letterSpacing: '-0.02em' }}>계정 공유</Title>
          <Text c="dimmed" size="sm" fw={500}>
            공동으로 사용하는 사이트 계정 정보를 안전하게 관리합니다.
          </Text>
        </Box>
        <Button
          leftSection={<IconPlus size={18} />}
          color="indigo"
          radius="md"
          variant="light"
          onClick={openCreate}
          size="md"
        >
          계정 추가
        </Button>
      </Group>

      <Paper p="md" radius="md" withBorder bg="var(--mantine-color-white)" shadow="xs" mb="lg">
        <Stack gap="md">
          <TextInput
            placeholder="계정명, 아이디, URL 검색..."
            size="sm"
            radius="md"
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            style={{ flex: 1 }}
          />

          <Box className="desktop-only">
            <Table.ScrollContainer minWidth={800}>
              <Table verticalSpacing="md" highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th style={{ width: "25%" }}><Text size="xs" fw={800} tt="uppercase">항목</Text></Table.Th>
                    <Table.Th style={{ width: "20%" }}><Text size="xs" fw={800} tt="uppercase">아이디</Text></Table.Th>
                    <Table.Th style={{ width: "20%" }}><Text size="xs" fw={800} tt="uppercase">비밀번호</Text></Table.Th>
                    <Table.Th style={{ width: "25%" }}><Text size="xs" fw={800} tt="uppercase">메모</Text></Table.Th>
                    <Table.Th style={{ width: "10%" }} />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>{desktopRows}</Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </Box>

          <Box className="mobile-only">
            <Stack gap="sm">
              {mobileCards}
            </Stack>
          </Box>

          {!filteredItems.length && !loading && (
            <Paper p="xl" withBorder radius="md" style={{ textAlign: 'center', borderStyle: 'dashed', background: 'transparent' }}>
              <Text size="sm" c="dimmed" py="xl">등록된 계정이 없거나 검색 결과가 없습니다.</Text>
            </Paper>
          )}
        </Stack>
      </Paper>

      {/* FAB for Mobile */}
      <ActionIcon
        size={64}
        radius="md"
        color="indigo"
        variant="filled"
        className="mobile-only"
        style={{
          position: 'fixed',
          bottom: '100px',
          right: '24px',
          boxShadow: '0 8px 24px rgba(99, 102, 241, 0.4)',
          zIndex: 100
        }}
        onClick={openCreate}
      >
        <IconPlus size={32} />
      </ActionIcon>

      <Modal opened={opened} onClose={() => setOpened(false)} title={<Text fw={900}>{editing ? "계정 편집" : "계정 추가"}</Text>} centered radius="md">
        <Stack gap="sm">
          <TextInput label="사이트/항목명" radius="md" value={title} onChange={(e) => setTitle(e.currentTarget.value)} required placeholder="예: 구글 워크스페이스" />
          <TextInput label="접속 URL" radius="md" value={url} onChange={(e) => setUrl(e.currentTarget.value)} placeholder="https://..." />
          <TextInput label="아이디/사용자명" radius="md" value={username} onChange={(e) => setUsername(e.currentTarget.value)} />
          <TextInput
            label="비밀번호"
            radius="md"
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
            placeholder={editing ? "(변경 시에만 입력)" : ""}
            required={!editing}
          />
          <Textarea label="추가 메모" radius="md" value={note} onChange={(e) => setNote(e.currentTarget.value)} autosize minRows={3} />

          <Paper p="xs" radius="md" bg="blue.0" mt="xs">
            <Text size="xs" c="blue.7" fw={700}>
              비밀번호는 서버에서 암호화되어 안전하게 저장됩니다.
            </Text>
          </Paper>

          <Group justify="flex-end" mt="md">
            <Button variant="subtle" color="gray" radius="md" onClick={() => setOpened(false)}>
              취소
            </Button>
            <Button color="indigo" radius="md" onClick={() => void save()} loading={saving} px="xl">
              저장하기
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Container>
  );
}

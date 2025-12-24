"use client";

import {
  ActionIcon,
  Badge,
  Box,
  Button,
  FileButton,
  Divider,
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
  Container,
  Affix,
  Transition,
  Center,
  Loader,
} from "@mantine/core";
import { DateInput } from "@mantine/dates";
import { notifications } from "@mantine/notifications";
import { useMediaQuery } from "@mantine/hooks";
import { IconSearch, IconReceipt, IconPlus, IconTrash, IconPaperclip } from "@tabler/icons-react";
import dayjs from "dayjs";
import { useCallback, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useQuery, useQueryClient } from "@tanstack/react-query";

type ExpenseClaim = {
  id: string;
  title: string;
  amount: number;
  spent_at: string;
  category: string | null;
  note: string | null;
  status: "unpaid" | "paid";
  created_at: string;
};

type Receipt = {
  id: string;
  claim_id: string;
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

const statusColor = (status: ExpenseClaim["status"]) => {
  if (status === "paid") return "green";
  return "orange";
};

const statusLabel = (status: ExpenseClaim["status"]) => {
  return status === "paid" ? "지급 완료" : "미지급";
};

export default function ExpensesPage() {
  const isMobile = useMediaQuery("(max-width: 768px)");
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<ExpenseClaim["status"] | "all">("all");

  const [opened, setOpened] = useState(false);
  const [editing, setEditing] = useState<ExpenseClaim | null>(null);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [spentAt, setSpentAt] = useState<Date | null>(new Date());
  const [category, setCategory] = useState("");
  const [note, setNote] = useState("");

  const [uploading, setUploading] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const { data: items = [], isLoading: loading } = useQuery<ExpenseClaim[]>({
    queryKey: ["expenses"],
    queryFn: async () => {
      const response = await fetchWithAuth("/api/expenses");
      const payload = (await response.json().catch(() => null)) as any;
      if (!response.ok) throw new Error(payload?.message ?? "불러오기 실패");
      return (payload?.items ?? []) as ExpenseClaim[];
    },
  });

  const { data: receipts = [] } = useQuery<Receipt[]>({
    queryKey: ["receipts", editing?.id],
    queryFn: async () => {
      if (!editing?.id) return [];
      const response = await fetchWithAuth(`/api/expenses/${editing.id}/receipts`);
      const payload = (await response.json().catch(() => null)) as any;
      if (!response.ok) throw new Error(payload?.message ?? "영수증 불러오기 실패");
      return (payload?.items ?? []) as Receipt[];
    },
    enabled: !!editing?.id,
  });

  const openCreate = useCallback(() => {
    setEditing(null);
    setTitle("");
    setAmount("");
    setSpentAt(new Date());
    setCategory("");
    setNote("");
    setPendingFile(null);
    setOpened(true);
  }, []);

  const openEdit = useCallback(
    async (item: ExpenseClaim) => {
      setEditing(item);
      setTitle(item.title);
      setAmount(String(item.amount));
      setSpentAt(new Date(item.spent_at));
      setCategory(item.category ?? "");
      setNote(item.note ?? "");
      setPendingFile(null);
      setOpened(true);
      // Receipts are fetched automatically by useQuery
    },
    []
  );

  const uploadReceipt = useCallback(
    async (file: File, claimId?: string) => {
      const targetId = claimId || editing?.id;
      if (!targetId) {
        setPendingFile(file);
        return;
      }

      setUploading(true);
      try {
        const form = new FormData();
        form.set("file", file);
        const response = await fetchWithAuth(`/api/expenses/${targetId}/receipts`, {
          method: "POST",
          body: form,
        });
        const payload = (await response.json().catch(() => null)) as any;
        if (!response.ok) throw new Error(payload?.message ?? "등록 실패");

        await queryClient.invalidateQueries({ queryKey: ["receipts", targetId] });
        notifications.show({ title: "업로드 완료", message: "영수증이 업로드되었습니다.", color: "gray" });
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
    [editing, queryClient]
  );

  const save = useCallback(async () => {
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      notifications.show({ title: "제목 필요", message: "제목을 입력하세요.", color: "yellow" });
      return;
    }
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      notifications.show({ title: "금액 오류", message: "금액을 올바르게 입력하세요.", color: "red" });
      return;
    }
    if (!spentAt) {
      notifications.show({ title: "사용일 필요", message: "사용일을 선택하세요.", color: "yellow" });
      return;
    }

    setSaving(true);
    try {
      const response = await fetchWithAuth(editing ? `/api/expenses/${editing.id}` : "/api/expenses", {
        method: editing ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: cleanTitle,
          amount: numericAmount,
          spent_at: dayjs(spentAt).format("YYYY-MM-DD"),
          category: category.trim() || null,
          note: note || null,
        }),
      });
      const payload = (await response.json().catch(() => null)) as any;
      if (!response.ok) throw new Error(payload?.message ?? "저장 실패");

      const newClaim = payload?.item as ExpenseClaim;

      // If there's a pending file, upload it now
      if (pendingFile && newClaim) {
        await uploadReceipt(pendingFile, newClaim.id);
        setPendingFile(null);
      }

      setOpened(false);
      await queryClient.invalidateQueries({ queryKey: ["expenses"] });
      notifications.show({ title: "저장 완료", message: "경비가 저장되었습니다.", color: "gray" });
    } catch (error) {
      notifications.show({
        title: "저장 실패",
        message: error instanceof Error ? error.message : "알 수 없는 오류",
        color: "red",
      });
    } finally {
      setSaving(false);
    }
  }, [amount, category, editing, note, pendingFile, spentAt, title, uploadReceipt, queryClient]);

  const action = useCallback(
    async (item: ExpenseClaim, nextStatus: "unpaid" | "paid") => {
      try {
        const response = await fetchWithAuth(`/api/expenses/${item.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status: nextStatus }),
        });
        const payload = (await response.json().catch(() => null)) as any;
        if (!response.ok) throw new Error(payload?.message ?? "처리 실패");

        await queryClient.invalidateQueries({ queryKey: ["expenses"] });
        notifications.show({ title: "상태 변경", message: `상태가 ${statusLabel(nextStatus)}로 변경되었습니다.`, color: "blue" });
      } catch (error) {
        notifications.show({
          title: "처리 실패",
          message: error instanceof Error ? error.message : "알 수 없는 오류",
          color: "red",
        });
      }
    },
    [queryClient]
  );

  const remove = useCallback(async (id: string) => {
    const ok = window.confirm("삭제할까요? (복구 불가)");
    if (!ok) return;
    try {
      const response = await fetchWithAuth(`/api/expenses/${id}`, { method: "DELETE" });
      const payload = (await response.json().catch(() => null)) as any;
      if (!response.ok) throw new Error(payload?.message ?? "삭제 실패");

      await queryClient.invalidateQueries({ queryKey: ["expenses"] });
      notifications.show({ title: "삭제 완료", message: "삭제되었습니다.", color: "gray" });
    } catch (error) {
      notifications.show({
        title: "삭제 실패",
        message: error instanceof Error ? error.message : "알 수 없는 오류",
        color: "red",
      });
    }
  }, [queryClient]);

  const filteredItems = useMemo(() => {
    if (statusFilter === "all") return items;
    return items.filter((item) => item.status === statusFilter);
  }, [items, statusFilter]);

  const mobileRows = useMemo(() => {
    return filteredItems.map((item) => (
      <Paper
        key={item.id}
        p="xs"
        radius="md"
        withBorder
        style={{
          transition: "transform 0.1s, box-shadow 0.1s",
          cursor: "pointer",
          marginBottom: 6,
          background: 'var(--mantine-color-white)',
        }}
        onClick={() => void openEdit(item)}
      >
        <Group justify="space-between" wrap="nowrap" gap="xs">
          <Group gap={8} style={{ flex: 1, overflow: 'hidden' }} wrap="nowrap">
            <Badge
              variant="dot"
              color={statusColor(item.status)}
              size="xs"
              px={0}
              style={{ flexShrink: 0 }}
            />
            <Stack gap={0} style={{ overflow: 'hidden' }}>
              <Text fw={700} size="sm" truncate>
                {item.title}
              </Text>
              <Text size="10px" c="dimmed" fw={500}>
                {item.category ?? "기타"} • {dayjs(item.spent_at).format("MM.DD")}
              </Text>
            </Stack>
          </Group>

          <Group gap="xs" style={{ flexShrink: 0 }} wrap="nowrap">
            <Text fw={800} size="sm" c="indigo.8">
              {Number(item.amount).toLocaleString()}원
            </Text>
            <ActionIcon
              variant="subtle"
              color="gray"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                void remove(item.id);
              }}
            >
              <IconTrash size={14} />
            </ActionIcon>
          </Group>
        </Group>
      </Paper>
    ));
  }, [action, openEdit, filteredItems, remove]);

  const desktopRows = useMemo(() => {
    return filteredItems.map((item) => (
      <Table.Tr key={item.id} onClick={() => void openEdit(item)} style={{ cursor: 'pointer' }}>
        <Table.Td>
          <Text size="sm" fw={600}>{dayjs(item.spent_at).format("YYYY.MM.DD")}</Text>
        </Table.Td>
        <Table.Td>
          <Badge variant="light" color="gray" radius="sm">{item.category ?? "기타"}</Badge>
        </Table.Td>
        <Table.Td>
          <Text size="sm" fw={700}>{item.title}</Text>
        </Table.Td>
        <Table.Td>
          <Text size="sm" fw={800} ta="right">{Number(item.amount).toLocaleString()}원</Text>
        </Table.Td>
        <Table.Td>
          <Badge
            variant="dot"
            color={statusColor(item.status)}
            style={{ cursor: "pointer" }}
            onClick={(e) => {
              e.stopPropagation();
              void action(item, item.status === "unpaid" ? "paid" : "unpaid");
            }}
          >
            {statusLabel(item.status)}
          </Badge>
        </Table.Td>
        <Table.Td>
          <Group gap={4} justify="flex-end">
            <ActionIcon
              variant="subtle"
              color="red"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                void remove(item.id);
              }}
            >
              <IconTrash size={16} />
            </ActionIcon>
          </Group>
        </Table.Td>
      </Table.Tr>
    ));
  }, [action, openEdit, filteredItems, remove]);

  return (
    <Container size="xl" py="xl" px={isMobile ? "md" : "xl"}>
      {/* Desktop Header Button */}
      <Group justify="space-between" mb="xl" visibleFrom="md" align="flex-end">
        <Box>
          <Title order={1} fw={800} style={{ letterSpacing: '-0.02em' }}>경비 청구</Title>
          <Text c="dimmed" size="sm" fw={500}>
            현장/사무 경비 청구 내역을 관리하고 지급을 처리합니다.
          </Text>
        </Box>
        <Button
          leftSection={<IconPlus size={18} />}
          color="indigo"
          radius="md"
          onClick={openCreate}
          size="md"
          variant="light"
        >
          경비 내역 등록
        </Button>
      </Group>

      <Box hiddenFrom="md" mb="lg" px="md">
        <Title order={2} fw={800} style={{ letterSpacing: '-0.02em' }}>경비 청구</Title>
        <Text c="dimmed" size="xs" fw={700}>경비 청구 내역 관리 및 지급 처리</Text>
      </Box>

      <Paper withBorder radius="md" bg="var(--mantine-color-white)">
        <Stack gap={0}>
          <Box p="md">
            <Group justify="space-between" wrap="nowrap">
              <Group gap="xs" wrap="wrap">
                {["all", "unpaid", "paid"].map((s) => (
                  <Button
                    key={s}
                    variant={statusFilter === s ? "filled" : "light"}
                    color={s === "all" ? "gray" : statusColor(s as any)}
                    size="compact-sm"
                    radius="xl"
                    onClick={() => setStatusFilter(s as any)}
                  >
                    {s === "all" ? "전체" : statusLabel(s as any)}
                  </Button>
                ))}
              </Group>
              <Box className="desktop-only">
                <Text size="xs" fw={700} c="dimmed">검색 결과: {filteredItems.length}건</Text>
              </Box>
            </Group>
          </Box>

          <Divider />

          <Box className="mobile-only" p="md">
            {loading ? (
              <Center py="xl">
                <Stack align="center" gap="xs">
                  <Loader size="md" color="indigo" />
                  <Text size="sm" c="dimmed">경비 내역을 불러오는 중...</Text>
                </Stack>
              </Center>
            ) : mobileRows}
          </Box>

          <Box className="desktop-only">
            {loading ? (
              <Center py="xl">
                <Stack align="center" gap="xs">
                  <Loader size="md" color="indigo" />
                  <Text size="sm" c="dimmed">경비 내역을 불러오는 중...</Text>
                </Stack>
              </Center>
            ) : (
              <Table.ScrollContainer minWidth={800}>
                <Table verticalSpacing="sm" highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th style={{ width: 120 }}>사용일</Table.Th>
                      <Table.Th style={{ width: 140 }}>카테고리</Table.Th>
                      <Table.Th>제목</Table.Th>
                      <Table.Th style={{ width: 150, textAlign: 'right' }}>금액</Table.Th>
                      <Table.Th style={{ width: 120 }}>상태</Table.Th>
                      <Table.Th style={{ width: 60 }}></Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {desktopRows}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            )}
          </Box>

          {!filteredItems.length && !loading && (
            <Paper p="xl" style={{ textAlign: "center", borderStyle: "dashed" }}>
              <Text size="sm" c="dimmed">
                등록된 경비가 없거나 필터와 일치하는 항목이 없습니다.
              </Text>
            </Paper>
          )}
        </Stack>
      </Paper>

      <Modal opened={opened} onClose={() => setOpened(false)} title={editing ? "경비 상세" : "경비 등록"} centered size="lg">
        <Stack gap="sm">
          <TextInput label="제목" placeholder="무엇에 대한 경비인가요?" value={title} onChange={(e) => setTitle(e.currentTarget.value)} required radius="md" />
          <Group grow>
            <TextInput label="금액(원)" placeholder="0" value={amount} onChange={(e) => setAmount(e.currentTarget.value)} required radius="md" />
            <DateInput label="사용일" value={spentAt} onChange={(v) => setSpentAt(v as Date | null)} valueFormat="YYYY-MM-DD" required radius="md" />
          </Group>
          <TextInput label="카테고리" value={category} onChange={(e) => setCategory(e.currentTarget.value)} placeholder="현장명 또는 식비, 유류비 등" radius="md" />
          <Textarea label="상세 메모" placeholder="추가 설명이 필요하다면 적어주세요" value={note} onChange={(e) => setNote(e.currentTarget.value)} autosize minRows={3} radius="md" />

          <Box mt="xs">
            <Paper withBorder p="md" radius="md" bg="gray.0">
              <Group justify="space-between" align="center" mb="sm">
                <Group gap={4}>
                  <Text size="sm" fw={700}>영수증 증빙</Text>
                  <Text size="xs" c="dimmed">(선택사항)</Text>
                </Group>
                <FileButton onChange={(file) => file && void uploadReceipt(file)} accept="image/*">
                  {(props) => (
                    <Button {...props} size="xs" variant="light" color="indigo" radius="md" leftSection={<IconPaperclip size={14} />} loading={uploading}>
                      {editing || pendingFile ? "파일 교체" : "파일 찾기"}
                    </Button>
                  )}
                </FileButton>
              </Group>

              <Box>
                {editing ? (
                  receipts.length ? (
                    <Stack gap={6}>
                      {receipts.map((r) => (
                        <Text key={r.id} size="sm" c="dimmed">
                          {r.filename ?? r.object_path}
                        </Text>
                      ))}
                    </Stack>
                  ) : (
                    <Text size="sm" c="dimmed">업로드된 영수증이 없습니다.</Text>
                  )
                ) : (
                  pendingFile ? (
                    <Text size="sm" c="blue" fw={500}>선택됨: {pendingFile.name}</Text>
                  ) : (
                    <Text size="sm" c="dimmed">선택된 파일이 없습니다.</Text>
                  )
                )}
              </Box>
            </Paper>
          </Box>

          <Group justify="flex-end" mt="xl" gap="sm">
            <Button variant="subtle" color="gray" radius="md" onClick={() => setOpened(false)}>
              닫기
            </Button>
            <Button color="indigo" radius="md" onClick={() => void save()} loading={saving} px="xl">
              정보 저장하기
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Universal FAB - Mobile Only */}
      <Affix position={{ bottom: 80, right: 40 }} className="mobile-only">
        <Transition transition="slide-up" mounted={true}>
          {(transitionStyles) => (
            <ActionIcon
              size={64}
              radius="xl"
              color="indigo"
              variant="filled"
              style={{
                ...transitionStyles,
                boxShadow: '0 8px 24px rgba(99, 102, 241, 0.4)',
                zIndex: 1000,
              }}
              onClick={openCreate}
            >
              <IconPlus size={32} />
            </ActionIcon>
          )}
        </Transition>
      </Affix>
    </Container >
  );
}

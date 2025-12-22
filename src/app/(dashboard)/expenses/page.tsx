"use client";

import {
  ActionIcon,
  Badge,
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
import { DateInput } from "@mantine/dates";
import { notifications } from "@mantine/notifications";
import { IconPlus, IconRefresh, IconSend, IconCheck, IconX, IconCash, IconTrash, IconPaperclip } from "@tabler/icons-react";
import dayjs from "dayjs";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type ExpenseClaim = {
  id: string;
  title: string;
  amount: number;
  spent_at: string;
  category: string | null;
  note: string | null;
  status: "draft" | "submitted" | "approved" | "rejected" | "paid";
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
  if (status === "approved") return "blue";
  if (status === "rejected") return "red";
  if (status === "submitted") return "yellow";
  return "gray";
};

const statusLabel = (status: ExpenseClaim["status"]) => {
  if (status === "paid") return "지급완료";
  if (status === "approved") return "승인";
  if (status === "rejected") return "반려";
  if (status === "submitted") return "제출됨";
  return "작성중";
};

export default function ExpensesPage() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ExpenseClaim[]>([]);
  const [statusFilter, setStatusFilter] = useState<ExpenseClaim["status"] | "all">("all");

  const [opened, setOpened] = useState(false);
  const [editing, setEditing] = useState<ExpenseClaim | null>(null);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [spentAt, setSpentAt] = useState<Date | null>(new Date());
  const [category, setCategory] = useState("");
  const [note, setNote] = useState("");

  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetchWithAuth("/api/expenses");
      const payload = (await response.json().catch(() => null)) as any;
      if (!response.ok) throw new Error(payload?.message ?? "불러오기 실패");
      setItems((payload?.items ?? []) as ExpenseClaim[]);
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

  const loadReceipts = useCallback(async (claimId: string) => {
    try {
      const response = await fetchWithAuth(`/api/expenses/${claimId}/receipts`);
      const payload = (await response.json().catch(() => null)) as any;
      if (!response.ok) throw new Error(payload?.message ?? "영수증 불러오기 실패");
      setReceipts((payload?.items ?? []) as Receipt[]);
    } catch (error) {
      notifications.show({
        title: "영수증 불러오기 실패",
        message: error instanceof Error ? error.message : "알 수 없는 오류",
        color: "red",
      });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = useCallback(() => {
    setEditing(null);
    setTitle("");
    setAmount("");
    setSpentAt(new Date());
    setCategory("");
    setNote("");
    setReceipts([]);
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
      setReceipts([]);
      setOpened(true);
      await loadReceipts(item.id);
    },
    [loadReceipts]
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
      setOpened(false);
      await load();
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
  }, [amount, category, editing, load, note, spentAt, title]);

  const action = useCallback(
    async (item: ExpenseClaim, nextAction: "submit" | "approve" | "reject" | "pay") => {
      try {
        const response = await fetchWithAuth(`/api/expenses/${item.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: nextAction }),
        });
        const payload = (await response.json().catch(() => null)) as any;
        if (!response.ok) throw new Error(payload?.message ?? "처리 실패");
        setItems((prev) => prev.map((x) => (x.id === item.id ? (payload?.item as ExpenseClaim) : x)));
      } catch (error) {
        notifications.show({
          title: "처리 실패",
          message: error instanceof Error ? error.message : "알 수 없는 오류",
          color: "red",
        });
      }
    },
    []
  );

  const remove = useCallback(async (id: string) => {
    const ok = window.confirm("삭제할까요? (복구 불가)");
    if (!ok) return;
    try {
      const response = await fetchWithAuth(`/api/expenses/${id}`, { method: "DELETE" });
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

  const uploadReceipt = useCallback(
    async (file: File) => {
      if (!editing) {
        notifications.show({ title: "업로드 불가", message: "먼저 저장한 뒤 업로드하세요.", color: "yellow" });
        return;
      }

      setUploading(true);
      try {
        const form = new FormData();
        form.set("file", file);
        const response = await fetchWithAuth(`/api/expenses/${editing.id}/receipts`, {
          method: "POST",
          body: form,
        });
        const payload = (await response.json().catch(() => null)) as any;
        if (!response.ok) throw new Error(payload?.message ?? "등록 실패");
        await loadReceipts(editing.id);
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
    [editing, loadReceipts]
  );

  const stats = useMemo(() => {
    return items.reduce(
      (acc, item) => {
        const amt = Number(item.amount) || 0;
        acc.total += amt;
        if (item.status === "submitted") acc.pending += amt;
        if (item.status === "approved" || item.status === "paid") acc.approved += amt;
        return acc;
      },
      { total: 0, pending: 0, approved: 0 }
    );
  }, [items]);

  const filteredItems = useMemo(() => {
    if (statusFilter === "all") return items;
    return items.filter((item) => item.status === statusFilter);
  }, [items, statusFilter]);

  const rows = useMemo(() => {
    return filteredItems.map((item) => (
      <Table.Tr key={item.id}>
        <Table.Td>
          <Stack gap={0}>
            <Text fw={600} size="sm">{item.title}</Text>
            <Text size="xs" c="dimmed">
              {dayjs(item.spent_at).format("YYYY-MM-DD")} · {item.category ?? "기타"}
            </Text>
          </Stack>
        </Table.Td>
        <Table.Td>
          <Text fw={700} size="md" ta="right" pr="xl">
            {Number(item.amount).toLocaleString()}원
          </Text>
        </Table.Td>
        <Table.Td>
          <Badge variant="dot" color={statusColor(item.status)} size="sm">
            {statusLabel(item.status)}
          </Badge>
        </Table.Td>
        <Table.Td>
          <Group gap="xs" justify="flex-end" wrap="nowrap">
            <Button size="compact-xs" variant="light" color="gray" onClick={() => void openEdit(item)}>
              열기
            </Button>
            {item.status === "draft" && (
              <ActionIcon variant="subtle" color="blue" size="sm" onClick={() => void action(item, "submit")}>
                <IconSend size={16} />
              </ActionIcon>
            )}
            {item.status === "submitted" && (
              <>
                <ActionIcon variant="subtle" color="blue" size="sm" onClick={() => void action(item, "approve")}>
                  <IconCheck size={16} />
                </ActionIcon>
                <ActionIcon variant="subtle" color="red" size="sm" onClick={() => void action(item, "reject")}>
                  <IconX size={16} />
                </ActionIcon>
              </>
            )}
            {item.status === "approved" && (
              <ActionIcon variant="subtle" color="green" size="sm" onClick={() => void action(item, "pay")}>
                <IconCash size={16} />
              </ActionIcon>
            )}
            <ActionIcon variant="subtle" color="red" size="sm" onClick={() => void remove(item.id)}>
              <IconTrash size={16} />
            </ActionIcon>
          </Group>
        </Table.Td>
      </Table.Tr>
    ));
  }, [action, openEdit, filteredItems, remove]);

  return (
    <Box p="md">
      <Group justify="space-between" mb="lg">
        <div>
          <Title order={2}>경비 청구</Title>
          <Text c="dimmed" size="sm">
            개인 선결제 내역을 등록하고, 승인/지급 완료 처리를 합니다.
          </Text>
        </div>
        <Button leftSection={<IconPlus size={16} />} color="gray" onClick={openCreate} size="md">
          경비 등록
        </Button>
      </Group>

      <SimpleGrid cols={{ base: 1, sm: 3 }} mb="xl" spacing="md">
        <Paper withBorder p="md" radius="md" style={{ borderLeft: "4px solid var(--mantine-color-gray-3)" }}>
          <Text size="xs" c="dimmed" fw={700} tt="uppercase">총 청구액</Text>
          <Text size="xl" fw={800}>{stats.total.toLocaleString()}원</Text>
        </Paper>
        <Paper withBorder p="md" radius="md" style={{ borderLeft: "4px solid var(--mantine-color-yellow-5)" }}>
          <Text size="xs" c="dimmed" fw={700} tt="uppercase">승인 대기</Text>
          <Text size="xl" fw={800} c="yellow.7">{stats.pending.toLocaleString()}원</Text>
        </Paper>
        <Paper withBorder p="md" radius="md" style={{ borderLeft: "4px solid var(--mantine-color-green-5)" }}>
          <Text size="xs" c="dimmed" fw={700} tt="uppercase">승인/지급 완료</Text>
          <Text size="xl" fw={800} c="green.7">{stats.approved.toLocaleString()}원</Text>
        </Paper>
      </SimpleGrid>

      <Paper className="app-surface" p="lg" radius="md">
        <Stack gap="md">
          <Group justify="space-between">
            <Group gap={6}>
              {["all", "draft", "submitted", "approved", "paid", "rejected"].map((s) => (
                <Badge
                  key={s}
                  variant={statusFilter === s ? "filled" : "light"}
                  color={s === "all" ? "gray" : statusColor(s as any)}
                  size="sm"
                  style={{ cursor: "pointer" }}
                  onClick={() => setStatusFilter(s as any)}
                >
                  {s === "all" ? "전체" : statusLabel(s as any)}
                </Badge>
              ))}
            </Group>
            <Button leftSection={<IconRefresh size={16} />} variant="light" color="gray" size="xs" onClick={() => void load()} loading={loading}>
              새로고침
            </Button>
          </Group>

          <Table.ScrollContainer minWidth={800}>
            <Table verticalSpacing="xs" highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th style={{ width: "40%" }}>내역</Table.Th>
                  <Table.Th style={{ width: "25%", textAlign: "right", paddingRight: "var(--mantine-spacing-xl)" }}>금액</Table.Th>
                  <Table.Th style={{ width: "15%" }}>상태</Table.Th>
                  <Table.Th style={{ width: "20%" }} />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>{rows}</Table.Tbody>
            </Table>
          </Table.ScrollContainer>
          {!filteredItems.length && !loading && (
            <Text size="sm" c="dimmed" ta="center" py="xl">
              등록된 경비가 없거나 필터와 일치하는 항목이 없습니다.
            </Text>
          )}
        </Stack>
      </Paper>

      <Modal opened={opened} onClose={() => setOpened(false)} title={editing ? "경비 상세" : "경비 등록"} centered size="lg">
        <Stack gap="sm">
          <TextInput label="제목" value={title} onChange={(e) => setTitle(e.currentTarget.value)} required />
          <Group grow>
            <TextInput label="금액(원)" value={amount} onChange={(e) => setAmount(e.currentTarget.value)} required />
            <DateInput label="사용일" value={spentAt} onChange={(v) => setSpentAt(v as Date | null)} valueFormat="YYYY-MM-DD" required />
          </Group>
          <TextInput label="카테고리" value={category} onChange={(e) => setCategory(e.currentTarget.value)} placeholder="예: 교통/식대/소모품" />
          <Textarea label="메모" value={note} onChange={(e) => setNote(e.currentTarget.value)} autosize minRows={3} />

          <Paper withBorder p="md" radius="md">
            <Group justify="space-between" align="center" mb="xs">
              <Text fw={600}>영수증</Text>
              <FileButton onChange={(file) => file && void uploadReceipt(file)} accept="image/*">
                {(props) => (
                  <Button {...props} size="xs" variant="light" color="gray" leftSection={<IconPaperclip size={14} />} loading={uploading}>
                    업로드
                  </Button>
                )}
              </FileButton>
            </Group>
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
                <Text size="sm" c="dimmed">
                  업로드된 영수증이 없습니다.
                </Text>
              )
            ) : (
              <Text size="sm" c="dimmed">
                먼저 저장한 뒤 영수증을 업로드하세요.
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
    </Box>
  );
}

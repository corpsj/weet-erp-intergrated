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
  Container,
} from "@mantine/core";
import { DateInput } from "@mantine/dates";
import { notifications } from "@mantine/notifications";
import { IconCalendar as IconCalendarTabler, IconCheckbox, IconSearch, IconReceipt, IconChartBar, IconPlus, IconRefresh, IconTrash, IconPaperclip } from "@tabler/icons-react";
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
  const [pendingFile, setPendingFile] = useState<File | null>(null);

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
      setReceipts([]);
      setPendingFile(null);
      setOpened(true);
      await loadReceipts(item.id);
    },
    [loadReceipts]
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
        if (editing?.id === targetId) {
          await loadReceipts(targetId);
        }
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
  }, [amount, category, editing, load, note, pendingFile, spentAt, title, uploadReceipt]);

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
        const updated = payload?.item as ExpenseClaim;
        setItems((prev) => prev.map((x) => (x.id === item.id ? updated : x)));
        notifications.show({ title: "상태 변경", message: `상태가 ${statusLabel(nextStatus)}로 변경되었습니다.`, color: "blue" });
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

  const stats = useMemo(() => {
    return items.reduce(
      (acc, item) => {
        const amt = Number(item.amount) || 0;
        acc.total += amt;
        if (item.status === "unpaid") acc.unpaidTotal += amt;
        if (item.status === "paid") acc.paidTotal += amt;
        return acc;
      },
      { total: 0, unpaidTotal: 0, paidTotal: 0 }
    );
  }, [items]);

  const filteredItems = useMemo(() => {
    if (statusFilter === "all") return items;
    return items.filter((item) => item.status === statusFilter);
  }, [items, statusFilter]);

  const rows = useMemo(() => {
    return filteredItems.map((item) => (
      <Paper
        key={item.id}
        p="sm"
        radius="md"
        withBorder
        style={{
          transition: "transform 0.1s, box-shadow 0.1s",
          cursor: "pointer",
          marginBottom: "var(--mantine-spacing-xs)",
        }}
        onClick={() => void openEdit(item)}
        className="expense-card"
      >
        <Group justify="space-between" wrap="nowrap">
          <Group gap="md" style={{ flex: 1 }}>
            <Box style={{ width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: "rgba(0,0,0,0.03)" }}>
              <IconReceipt size={20} color="var(--mantine-color-gray-6)" />
            </Box>
            <Stack gap={0}>
              <Text fw={600} size="sm">
                {item.title}
              </Text>
              <Text size="xs" c="dimmed">
                {item.category ?? "기타"}
              </Text>
            </Stack>
          </Group>

          <Group gap="xl" wrap="nowrap" style={{ flexShrink: 0 }}>
            <Stack gap={0} align="flex-end">
              <Text fw={700} size="sm">
                {Number(item.amount).toLocaleString()}원
              </Text>
              <Text size="xs" c="dimmed">
                {dayjs(item.spent_at).format("YY.MM.DD")}
              </Text>
            </Stack>

            <Group gap="xs" wrap="nowrap" style={{ width: 140, justifyContent: "flex-end" }}>
              <Badge
                variant="filled"
                color={statusColor(item.status)}
                size="md"
                style={{ cursor: "pointer", userSelect: "none" }}
                onClick={(e) => {
                  e.stopPropagation();
                  void action(item, item.status === "unpaid" ? "paid" : "unpaid");
                }}
              >
                {statusLabel(item.status)}
              </Badge>
              <ActionIcon
                variant="subtle"
                color="red"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  void remove(item.id);
                }}
                title="삭제"
              >
                <IconTrash size={15} />
              </ActionIcon>
            </Group>
          </Group>
        </Group>
      </Paper>
    ));
  }, [action, openEdit, filteredItems, remove]);

  return (
    <Container size={800} py="xl">
      <Group justify="space-between" mb="lg">
        <div>
          <Title order={2}>경비 청구</Title>
          <Text c="dimmed" size="sm">
            개인별 청구 내역을 관리하고 승인/지급을 처리합니다.
          </Text>
        </div>
        <Button leftSection={<IconPlus size={16} />} color="gray" onClick={openCreate} size="md">
          경비 등록
        </Button>
      </Group>

      <Stack gap="md">
        <Group justify="space-between">
          <Group gap={6}>
            {["all", "unpaid", "paid"].map((s) => (
              <Badge
                key={s}
                variant={statusFilter === s ? "filled" : "light"}
                color={s === "all" ? "gray" : statusColor(s as any)}
                size="md"
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

        <Box>
          {rows}
          {!filteredItems.length && !loading && (
            <Paper p="xl" withBorder radius="md" style={{ textAlign: "center", borderStyle: "dashed" }}>
              <Text size="sm" c="dimmed">
                등록된 경비가 없거나 필터와 일치하는 항목이 없습니다.
              </Text>
            </Paper>
          )}
        </Box>
      </Stack>

      <Modal opened={opened} onClose={() => setOpened(false)} title={editing ? "경비 상세" : "경비 등록"} centered size="lg">
        <Stack gap="sm">
          <TextInput label="제목" value={title} onChange={(e) => setTitle(e.currentTarget.value)} required />
          <Group grow>
            <TextInput label="금액(원)" value={amount} onChange={(e) => setAmount(e.currentTarget.value)} required />
            <DateInput label="사용일" value={spentAt} onChange={(v) => setSpentAt(v as Date | null)} valueFormat="YYYY-MM-DD" required />
          </Group>
          <TextInput label="카테고리" value={category} onChange={(e) => setCategory(e.currentTarget.value)} placeholder="예: 교통/식대/소모품" />
          <Textarea label="메모" value={note} onChange={(e) => setNote(e.currentTarget.value)} autosize minRows={3} />

          <Box mt="xs">
            <Paper withBorder p="md" radius="md">
              <Group justify="space-between" align="center" mb="xs">
                <Group gap={4}>
                  <Text size="sm" fw={700}>영수증</Text>
                  <Text size="xs" c="dimmed">(선택사항)</Text>
                </Group>
                <FileButton onChange={(file) => file && void uploadReceipt(file)} accept="image/*">
                  {(props) => (
                    <Button {...props} size="xs" variant="light" color="gray" leftSection={<IconPaperclip size={14} />} loading={uploading}>
                      {editing || pendingFile ? "파일 교체" : "파일 선택"}
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

          <Group justify="flex-end" mt="md" gap="xs">
            <Button variant="subtle" color="gray" onClick={() => setOpened(false)}>
              닫기
            </Button>
            <Button color="gray" onClick={() => void save()} loading={saving}>
              내용 저장
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Container>
  );
}

"use client";

import {
  Badge,
  Box,
  Button,
  Container,
  Group,
  Paper,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { MonthPickerInput } from "@mantine/dates";
import { notifications } from "@mantine/notifications";
import { IconBolt, IconPlus, IconRefresh } from "@tabler/icons-react";
import dayjs from "dayjs";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type UtilityBill = {
  id: string;
  vendor_name: string | null;
  bill_type: string | null;
  amount_due: number | null;
  due_date: string | null;
  status: "PROCESSING" | "NEEDS_REVIEW" | "CONFIRMED" | "REJECTED";
  processing_stage: string | null;
  created_at: string;
};

type ApiListResponse<T> = {
  items?: T[];
  message?: string;
};

const fetchWithAuth = async (input: RequestInfo | URL, init?: RequestInit) => {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("로그인이 필요합니다.");
  return fetch(input, { ...init, headers: { ...(init?.headers ?? {}), authorization: `Bearer ${token}` } });
};

const statusColor = (status: UtilityBill["status"]) => {
  switch (status) {
    case "CONFIRMED":
      return "green";
    case "NEEDS_REVIEW":
      return "orange";
    case "REJECTED":
      return "red";
    default:
      return "blue";
  }
};

const statusLabel = (status: UtilityBill["status"]) => {
  switch (status) {
    case "CONFIRMED":
      return "확정";
    case "NEEDS_REVIEW":
      return "검수 필요";
    case "REJECTED":
      return "폐기";
    default:
      return "처리중";
  }
};

const billTypeLabel = (value: string | null) => {
  switch (value) {
    case "ELECTRICITY":
      return "전기";
    case "WATER":
      return "수도";
    case "GAS":
      return "가스";
    case "TELECOM":
      return "통신";
    case "TAX":
      return "세금";
    default:
      return "기타";
  }
};

export default function UtilityBillsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<UtilityBill[]>([]);
  const [statusFilter, setStatusFilter] = useState<UtilityBill["status"] | "all">("all");
  const [monthFilter, setMonthFilter] = useState<Date | null>(null);
  const [siteFilter, setSiteFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams();
      if (statusFilter !== "all") query.set("status", statusFilter);
      if (monthFilter) query.set("month", dayjs(monthFilter).format("YYYY-MM"));
      if (siteFilter.trim()) query.set("site_id", siteFilter.trim());

      const response = await fetchWithAuth(`/api/utility-bills?${query.toString()}`);
      const payload = (await response.json().catch(() => null)) as ApiListResponse<UtilityBill> | null;
      if (!response.ok) throw new Error(payload?.message ?? "불러오기 실패");
      setItems((payload?.items ?? []) as UtilityBill[]);
    } catch (error) {
      notifications.show({
        title: "불러오기 실패",
        message: error instanceof Error ? error.message : "알 수 없는 오류",
        color: "red",
      });
    } finally {
      setLoading(false);
    }
  }, [monthFilter, siteFilter, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => {
    return items.map((item) => (
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
        onClick={() => router.push(`/utility-bills/${item.id}`)}
      >
        <Group justify="space-between" wrap="nowrap">
          <Group gap="md" style={{ flex: 1 }}>
            <Box style={{ width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: "rgba(0,0,0,0.03)" }}>
              <IconBolt size={20} color="var(--mantine-color-gray-6)" />
            </Box>
            <Stack gap={0}>
              <Text fw={600} size="sm">
                {item.vendor_name || "공과금 고지서"}
              </Text>
              <Text size="xs" c="dimmed">
                {billTypeLabel(item.bill_type)} · {item.due_date ? dayjs(item.due_date).format("YY.MM.DD") : "기한 미확인"}
              </Text>
            </Stack>
          </Group>

          <Group gap="xl" wrap="nowrap" style={{ flexShrink: 0 }}>
            <Stack gap={0} align="flex-end">
              <Text fw={700} size="sm">
                {item.amount_due ? item.amount_due.toLocaleString() : "-"}원
              </Text>
              <Text size="xs" c="dimmed">
                {item.processing_stage === "DONE" ? "처리 완료" : item.processing_stage ?? "처리중"}
              </Text>
            </Stack>

            <Badge variant="filled" color={statusColor(item.status)} size="md">
              {statusLabel(item.status)}
            </Badge>
          </Group>
        </Group>
      </Paper>
    ));
  }, [items, router]);

  return (
    <Container size={880} py="xl">
      <Group justify="space-between" mb="lg">
        <div>
          <Title order={2}>공과금 고지서</Title>
          <Text c="dimmed" size="sm">
            촬영/업로드한 고지서를 자동으로 분석해 기록합니다.
          </Text>
        </div>
        <Group>
          <Button leftSection={<IconRefresh size={16} />} variant="light" color="gray" size="sm" onClick={() => void load()} loading={loading}>
            새로고침
          </Button>
          <Button leftSection={<IconPlus size={16} />} color="gray" onClick={() => router.push("/utility-bills/new")}>
            업로드
          </Button>
        </Group>
      </Group>

      <Paper withBorder radius="md" p="md" mb="lg">
        <Group align="flex-end" wrap="wrap">
          <Group gap={6}>
            {["all", "PROCESSING", "NEEDS_REVIEW", "CONFIRMED", "REJECTED"].map((status) => (
              <Badge
                key={status}
                variant={statusFilter === status ? "filled" : "light"}
                color={status === "all" ? "gray" : statusColor(status as UtilityBill["status"])}
                size="md"
                style={{ cursor: "pointer" }}
                onClick={() => setStatusFilter(status as UtilityBill["status"] | "all")}
              >
                {status === "all" ? "전체" : statusLabel(status as UtilityBill["status"])}
              </Badge>
            ))}
          </Group>
          <MonthPickerInput
            label="월 필터"
            placeholder="YYYY-MM"
            value={monthFilter}
            onChange={setMonthFilter}
            valueFormat="YYYY-MM"
            size="sm"
          />
          <TextInput
            label="현장"
            placeholder="site_id"
            value={siteFilter}
            onChange={(event) => setSiteFilter(event.currentTarget.value)}
            size="sm"
          />
          <Button variant="light" color="gray" size="sm" onClick={() => void load()} loading={loading}>
            필터 적용
          </Button>
        </Group>
      </Paper>

      <Stack gap="xs">
        {rows}
        {!items.length && !loading && (
          <Paper p="xl" withBorder radius="md" style={{ textAlign: "center", borderStyle: "dashed" }}>
            <Text size="sm" c="dimmed">
              조건에 맞는 공과금 고지서가 없습니다.
            </Text>
          </Paper>
        )}
      </Stack>
    </Container>
  );
}

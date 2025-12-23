"use client";

import {
  Badge,
  Button,
  Container,
  Grid,
  Group,
  Image,
  Paper,
  Progress,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { DateInput } from "@mantine/dates";
import { notifications } from "@mantine/notifications";
import { IconRefresh, IconThumbDown, IconThumbUp } from "@tabler/icons-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Evidence = {
  amount_text?: string | null;
  due_date_text?: string | null;
  vendor_text?: string | null;
};

type ExtractedJson = {
  evidence?: Evidence;
  [key: string]: unknown;
};

type UtilityBillDetail = {
  id: string;
  vendor_name: string | null;
  bill_type: string | null;
  amount_due: number | null;
  due_date: string | null;
  billing_period_start: string | null;
  billing_period_end: string | null;
  customer_no: string | null;
  payment_account: string | null;
  status: "PROCESSING" | "NEEDS_REVIEW" | "CONFIRMED" | "REJECTED";
  confidence: number | null;
  ocr_mode: string | null;
  template_id: string | null;
  raw_ocr_text: string | null;
  extracted_json: ExtractedJson | null;
  processing_stage: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  original_url: string | null;
  processed_url: string | null;
  trackA_url: string | null;
  trackB_url: string | null;
};

type ApiItemResponse<T> = {
  item?: T;
  message?: string;
};

const fetchWithAuth = async (input: RequestInfo | URL, init?: RequestInit) => {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("로그인이 필요합니다.");
  return fetch(input, { ...init, headers: { ...(init?.headers ?? {}), authorization: `Bearer ${token}` } });
};

const toDate = (value: string | null) => (value ? new Date(`${value}T00:00:00`) : null);

const formatDate = (value: Date | null) => {
  if (!value) return null;
  const year = value.getFullYear();
  const mm = String(value.getMonth() + 1).padStart(2, "0");
  const dd = String(value.getDate()).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
};

const statusColor = (status: UtilityBillDetail["status"]) => {
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

const statusLabel = (status: UtilityBillDetail["status"]) => {
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

export default function UtilityBillDetailPage() {
  const params = useParams<{ id: string }>();
  const billId = typeof params?.id === "string" ? params.id : "";
  const [loading, setLoading] = useState(true);
  const [item, setItem] = useState<UtilityBillDetail | null>(null);
  const [view, setView] = useState<"processed" | "original">("processed");

  const [vendorName, setVendorName] = useState("");
  const [billType, setBillType] = useState("ETC");
  const [amountDue, setAmountDue] = useState<number | string>("");
  const [dueDate, setDueDate] = useState<Date | null>(null);
  const [billingStart, setBillingStart] = useState<Date | null>(null);
  const [billingEnd, setBillingEnd] = useState<Date | null>(null);
  const [customerNo, setCustomerNo] = useState("");
  const [paymentAccount, setPaymentAccount] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!billId) return;
    setLoading(true);
    try {
      const response = await fetchWithAuth(`/api/utility-bills/${billId}`);
      const payload = (await response.json().catch(() => null)) as ApiItemResponse<UtilityBillDetail> | null;
      if (!response.ok) throw new Error(payload?.message ?? "불러오기 실패");
      setItem(payload?.item as UtilityBillDetail);
    } catch (error) {
      notifications.show({
        title: "불러오기 실패",
        message: error instanceof Error ? error.message : "알 수 없는 오류",
        color: "red",
      });
    } finally {
      setLoading(false);
    }
  }, [billId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!item) return;
    setVendorName(item.vendor_name ?? "");
    setBillType(item.bill_type ?? "ETC");
    setAmountDue(item.amount_due ?? "");
    setDueDate(toDate(item.due_date));
    setBillingStart(toDate(item.billing_period_start));
    setBillingEnd(toDate(item.billing_period_end));
    setCustomerNo(item.customer_no ?? "");
    setPaymentAccount(item.payment_account ?? "");
  }, [item]);

  useEffect(() => {
    if (!item || item.status !== "PROCESSING") return;
    const timer = setInterval(() => {
      void load();
    }, 5000);
    return () => clearInterval(timer);
  }, [item, load]);

  const evidence = useMemo(() => {
    const extracted = item?.extracted_json ?? {};
    return extracted?.evidence ?? {};
  }, [item]);

  const confirm = useCallback(async () => {
    if (!billId) return;
    setSaving(true);
    try {
      const response = await fetchWithAuth(`/api/utility-bills/${billId}/confirm`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          vendor_name: vendorName,
          bill_type: billType,
          amount_due: amountDue,
          due_date: formatDate(dueDate),
          billing_period_start: formatDate(billingStart),
          billing_period_end: formatDate(billingEnd),
          customer_no: customerNo,
          payment_account: paymentAccount,
        }),
      });
      const payload = (await response.json().catch(() => null)) as ApiItemResponse<UtilityBillDetail> | null;
      if (!response.ok) throw new Error(payload?.message ?? "확정 실패");
      setItem(payload?.item as UtilityBillDetail);
      notifications.show({ title: "확정 완료", message: "검수가 완료되었습니다.", color: "gray" });
    } catch (error) {
      notifications.show({
        title: "확정 실패",
        message: error instanceof Error ? error.message : "알 수 없는 오류",
        color: "red",
      });
    } finally {
      setSaving(false);
    }
  }, [amountDue, billId, billingEnd, billingStart, billType, customerNo, dueDate, paymentAccount, vendorName]);

  const retry = useCallback(async () => {
    if (!billId) return;
    setSaving(true);
    try {
      const response = await fetchWithAuth(`/api/utility-bills/${billId}/retry`, { method: "POST" });
      const payload = (await response.json().catch(() => null)) as ApiItemResponse<UtilityBillDetail> | null;
      if (!response.ok) throw new Error(payload?.message ?? "재처리 실패");
      setItem(payload?.item as UtilityBillDetail);
      notifications.show({ title: "재처리 시작", message: "다시 분석을 시작했습니다.", color: "gray" });
    } catch (error) {
      notifications.show({
        title: "재처리 실패",
        message: error instanceof Error ? error.message : "알 수 없는 오류",
        color: "red",
      });
    } finally {
      setSaving(false);
    }
  }, [billId]);

  const reject = useCallback(async () => {
    if (!billId) return;
    const ok = window.confirm("고지서를 폐기하시겠습니까?");
    if (!ok) return;
    setSaving(true);
    try {
      const response = await fetchWithAuth(`/api/utility-bills/${billId}/reject`, { method: "POST" });
      const payload = (await response.json().catch(() => null)) as ApiItemResponse<UtilityBillDetail> | null;
      if (!response.ok) throw new Error(payload?.message ?? "폐기 실패");
      setItem(payload?.item as UtilityBillDetail);
      notifications.show({ title: "폐기 완료", message: "고지서가 폐기되었습니다.", color: "gray" });
    } catch (error) {
      notifications.show({
        title: "폐기 실패",
        message: error instanceof Error ? error.message : "알 수 없는 오류",
        color: "red",
      });
    } finally {
      setSaving(false);
    }
  }, [billId]);

  const previewUrl = view === "processed" ? item?.processed_url : item?.original_url;

  return (
    <Container size={1100} py="xl">
      <Group justify="space-between" mb="lg">
        <div>
          <Title order={2}>공과금 고지서 검수</Title>
          <Text c="dimmed" size="sm">
            스캔본을 확인하고 필드를 수정한 뒤 확정하세요.
          </Text>
        </div>
        <Group>
          <Button leftSection={<IconRefresh size={16} />} variant="light" color="gray" onClick={() => void load()} loading={loading}>
            새로고침
          </Button>
          {item && (
            <Badge color={statusColor(item.status)} variant="filled" size="lg">
              {statusLabel(item.status)}
            </Badge>
          )}
        </Group>
      </Group>

      <Grid gutter="lg">
        <Grid.Col span={{ base: 12, md: 7 }}>
          <Paper withBorder radius="md" p="md">
            <Group justify="space-between" mb="sm">
              <Text fw={600}>스캔본 미리보기</Text>
              <SegmentedControl
                size="xs"
                value={view}
                onChange={(value) => setView(value as "processed" | "original")}
                data={[
                  { value: "processed", label: "스캔본" },
                  { value: "original", label: "원본" },
                ]}
              />
            </Group>
            {previewUrl ? (
              <Image src={previewUrl} alt="utility bill preview" radius="sm" fit="contain" />
            ) : (
              <Paper p="xl" radius="md" withBorder style={{ borderStyle: "dashed", textAlign: "center" }}>
                <Text size="sm" c="dimmed">
                  이미지를 불러오는 중입니다.
                </Text>
              </Paper>
            )}
            <Group mt="sm" gap="xs">
              <Badge variant="light" color="gray">
                OCR: {item?.ocr_mode ?? "-"}
              </Badge>
              {item?.template_id && (
                <Badge variant="light" color="gray">
                  Template: {item.template_id}
                </Badge>
              )}
            </Group>
          </Paper>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 5 }}>
          <Paper withBorder radius="md" p="md">
            <Stack gap="sm">
              <Group justify="space-between">
                <Text fw={600}>필드 검수</Text>
                {item?.confidence !== null && (
                  <Group gap="xs">
                    <Text size="xs" c="dimmed">
                      신뢰도
                    </Text>
                    <Text size="xs" fw={700}>
                      {(item.confidence * 100).toFixed(0)}%
                    </Text>
                  </Group>
                )}
              </Group>

              {item?.confidence !== null && (
                <Progress value={Math.min(100, Math.max(0, item.confidence * 100))} color={statusColor(item.status)} />
              )}

              {item?.last_error_message && (
                <Text size="xs" c="red">
                  {item.last_error_message}
                </Text>
              )}

              <TextInput
                label="공급자"
                value={vendorName}
                onChange={(event) => setVendorName(event.currentTarget.value)}
                description={evidence?.vendor_text ? `근거: ${evidence.vendor_text}` : undefined}
              />
              <Select
                label="공과금 유형"
                data={[
                  { value: "ELECTRICITY", label: "전기" },
                  { value: "WATER", label: "수도" },
                  { value: "GAS", label: "가스" },
                  { value: "TELECOM", label: "통신" },
                  { value: "TAX", label: "세금" },
                  { value: "ETC", label: "기타" },
                ]}
                value={billType}
                onChange={(value) => setBillType(value || "ETC")}
              />
              <TextInput
                label="납부 금액"
                value={amountDue}
                onChange={(event) => setAmountDue(event.currentTarget.value)}
                description={evidence?.amount_text ? `근거: ${evidence.amount_text}` : undefined}
              />
              <DateInput
                label="납부 기한"
                value={dueDate}
                onChange={(value) => setDueDate(value as Date | null)}
                valueFormat="YYYY-MM-DD"
                description={evidence?.due_date_text ? `근거: ${evidence.due_date_text}` : undefined}
              />

              <Group grow>
                <DateInput
                  label="청구 시작"
                  value={billingStart}
                  onChange={(value) => setBillingStart(value as Date | null)}
                  valueFormat="YYYY-MM-DD"
                />
                <DateInput
                  label="청구 종료"
                  value={billingEnd}
                  onChange={(value) => setBillingEnd(value as Date | null)}
                  valueFormat="YYYY-MM-DD"
                />
              </Group>

              <TextInput
                label="고객 번호"
                value={customerNo}
                onChange={(event) => setCustomerNo(event.currentTarget.value)}
              />
              <TextInput
                label="납부 계좌"
                value={paymentAccount}
                onChange={(event) => setPaymentAccount(event.currentTarget.value)}
              />

              <Group justify="space-between" mt="md">
                <Button variant="light" color="gray" leftSection={<IconRefresh size={16} />} onClick={() => void retry()} loading={saving}>
                  재처리
                </Button>
                <Group>
                  <Button variant="subtle" color="red" leftSection={<IconThumbDown size={16} />} onClick={() => void reject()} loading={saving}>
                    폐기
                  </Button>
                  <Button color="gray" leftSection={<IconThumbUp size={16} />} onClick={() => void confirm()} loading={saving} disabled={item?.status === "PROCESSING"}>
                    확정
                  </Button>
                </Group>
              </Group>
            </Stack>
          </Paper>
        </Grid.Col>
      </Grid>
    </Container>
  );
}

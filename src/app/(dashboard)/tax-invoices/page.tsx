"use client";

import {
    ActionIcon,
    Badge,
    Box,
    Button,
    Card,
    Container,
    Divider,
    Grid,
    Group,
    Modal,
    NumberInput,
    Paper,
    Select,
    Stack,
    Table,
    Text,
    TextInput,
    Title,
} from "@mantine/core";
import { DateInput } from "@mantine/dates";
import { notifications } from "@mantine/notifications";
import { IconPlus, IconTrash, IconReceipt2, IconReceipt } from "@tabler/icons-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import dayjs from "dayjs";

type TaxInvoice = {
    id: string;
    type: "sales" | "purchase";
    issue_date: string;
    supplier_name: string;
    supplier_reg_number: string;
    receiver_name: string;
    receiver_reg_number: string;
    amount: number;
    vat: number;
    total_amount: number;
    description: string;
    status: "issued" | "cancelled";
    created_at: string;
};

const fetchWithAuth = async (input: RequestInfo | URL, init?: RequestInit) => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("로그인이 필요합니다.");
    return fetch(input, { ...init, headers: { ...(init?.headers ?? {}), authorization: `Bearer ${token}` } });
};

export default function TaxInvoicesPage() {
    const [loading, setLoading] = useState(true);
    const [items, setItems] = useState<TaxInvoice[]>([]);
    const [opened, setOpened] = useState(false);
    const [saving, setSaving] = useState(false);

    // Form State
    const [type, setType] = useState<string>("sales");
    const [issueDate, setIssueDate] = useState<Date | null>(new Date());
    const [supplierName, setSupplierName] = useState("");
    const [supplierRegNum, setSupplierRegNum] = useState("");
    const [receiverName, setReceiverName] = useState("");
    const [receiverRegNum, setReceiverRegNum] = useState("");
    const [amount, setAmount] = useState<number | string>(0);
    const [vat, setVat] = useState<number | string>(0);
    const [description, setDescription] = useState("");

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const response = await fetchWithAuth("/api/tax-invoices");
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.message || "불러오기 실패");
            setItems(payload.items || []);
        } catch (error) {
            notifications.show({ title: "오류", message: error instanceof Error ? error.message : "알 수 없는 오류", color: "red" });
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const save = async () => {
        if (!issueDate || !supplierName || !receiverName) {
            notifications.show({ title: "입력 확인", message: "필수 항목을 입력하세요.", color: "yellow" });
            return;
        }

        setSaving(true);
        try {
            const numAmount = Number(amount);
            const numVat = Number(vat);
            const payload = {
                type,
                issue_date: dayjs(issueDate).format("YYYY-MM-DD"),
                supplier_name: supplierName,
                supplier_reg_number: supplierRegNum,
                receiver_name: receiverName,
                receiver_reg_number: receiverRegNum,
                amount: numAmount,
                vat: numVat,
                total_amount: numAmount + numVat,
                description,
                status: "issued",
            };

            const response = await fetchWithAuth("/api/tax-invoices", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const errPayload = await response.json();
                throw new Error(errPayload.message || "저장 실패");
            }

            setOpened(false);
            await load();
            notifications.show({ title: "성공", message: "세금계산서가 등록되었습니다.", color: "green" });
        } catch (error) {
            notifications.show({ title: "오류", message: error instanceof Error ? error.message : "알 수 없는 오류", color: "red" });
        } finally {
            setSaving(false);
        }
    };

    const remove = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!window.confirm("정말 삭제하시겠습니까?")) return;
        try {
            const response = await fetchWithAuth(`/api/tax-invoices/${id}`, { method: "DELETE" });
            if (!response.ok) throw new Error("삭제 실패");
            setItems((prev) => prev.filter((x) => x.id !== id));
            notifications.show({ title: "성공", message: "삭제되었습니다.", color: "gray" });
        } catch (error) {
            notifications.show({ title: "오류", message: error instanceof Error ? error.message : "알 수 없는 오류", color: "red" });
        }
    };

    const summary = useMemo(() => {
        return items.reduce(
            (acc, cur) => {
                if (cur.type === "sales") {
                    acc.sales += cur.amount;
                    acc.salesVat += cur.vat;
                } else {
                    acc.purchase += cur.amount;
                    acc.purchaseVat += cur.vat;
                }
                return acc;
            },
            { sales: 0, salesVat: 0, purchase: 0, purchaseVat: 0 }
        );
    }, [items]);

    const rows = items.map((item) => (
        <Paper
            key={item.id}
            p="md"
            radius="md"
            withBorder
            mb="xs"
            className="app-surface"
            style={{ cursor: "default" }}
        >
            <Group justify="space-between" wrap="nowrap">
                <Group gap="md" style={{ flex: 1 }}>
                    <Box style={{ width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: "rgba(0,0,0,0.03)" }}>
                        <IconReceipt2 size={20} color="var(--mantine-color-gray-6)" />
                    </Box>
                    <Stack gap={0}>
                        <Group gap="xs">
                            <Badge color={item.type === "sales" ? "blue" : "red"} variant="light" size="sm">
                                {item.type === "sales" ? "매출" : "매입"}
                            </Badge>
                            <Text fw={600} size="sm">
                                {item.type === "sales" ? item.receiver_name : item.supplier_name}
                            </Text>
                        </Group>
                        <Text size="xs" c="dimmed">
                            {dayjs(item.issue_date).format("YYYY.MM.DD")} {item.description && `| ${item.description}`}
                        </Text>
                    </Stack>
                </Group>

                <Group gap="xl" wrap="nowrap">
                    <Stack gap={0} align="flex-end">
                        <Text fw={700} size="sm">
                            {item.amount.toLocaleString()}원
                        </Text>
                        <Text size="xs" c="dimmed">
                            부가세 {item.vat.toLocaleString()}원
                        </Text>
                    </Stack>
                    <ActionIcon variant="subtle" color="red" size="sm" onClick={(e) => void remove(item.id, e)}>
                        <IconTrash size={16} />
                    </ActionIcon>
                </Group>
            </Group>
        </Paper>
    ));

    return (
        <Container size={800} py="xl">
            <Group justify="space-between" mb="lg">
                <div>
                    <Title order={2}>세금계산서 관리</Title>
                    <Text c="dimmed" size="sm">매출 및 매입 세금계산서를 통합 관리합니다.</Text>
                </div>
                <Group>
                    <Button color="gray" leftSection={<IconPlus size={16} />} onClick={() => setOpened(true)}>계산서 추가</Button>
                </Group>
            </Group>

            <Grid mb="xl">
                <Grid.Col span={{ base: 6, md: 4 }}>
                    <Paper withBorder p="md" radius="md" className="app-surface">
                        <Text size="xs" c="dimmed" fw={700} tt="uppercase">총 매출액</Text>
                        <Text size="lg" fw={700}>{summary.sales.toLocaleString()}원</Text>
                        <Text size="xs" c="blue">부가세: {summary.salesVat.toLocaleString()}원</Text>
                    </Paper>
                </Grid.Col>
                <Grid.Col span={{ base: 6, md: 4 }}>
                    <Paper withBorder p="md" radius="md" className="app-surface">
                        <Text size="xs" c="dimmed" fw={700} tt="uppercase">총 매입액</Text>
                        <Text size="lg" fw={700}>{summary.purchase.toLocaleString()}원</Text>
                        <Text size="xs" c="red">부가세: {summary.purchaseVat.toLocaleString()}원</Text>
                    </Paper>
                </Grid.Col>
                <Grid.Col span={{ base: 12, md: 4 }}>
                    <Paper withBorder p="md" radius="md" className="app-surface">
                        <Text size="xs" c="dimmed" fw={700} tt="uppercase">부가세 수지</Text>
                        <Text size="lg" fw={700} c={summary.salesVat - summary.purchaseVat >= 0 ? "blue" : "red"}>
                            {(summary.salesVat - summary.purchaseVat).toLocaleString()}원
                        </Text>
                        <Text size="xs">{summary.salesVat - summary.purchaseVat >= 0 ? "납부 예정" : "환급 예정"}</Text>
                    </Paper>
                </Grid.Col>
            </Grid>

            <Stack gap="xs">
                {rows}
                {!items.length && !loading && (
                    <Paper p="xl" withBorder radius="md" style={{ textAlign: "center", borderStyle: "dashed" }}>
                        <Text size="sm" c="dimmed">등록된 세금계산서 내역이 없습니다.</Text>
                    </Paper>
                )}
            </Stack>

            <Modal opened={opened} onClose={() => setOpened(false)} title="세금계산서 등록" centered size="lg">
                <Stack gap="sm">
                    <Grid>
                        <Grid.Col span={6}>
                            <Select label="구분" data={[{ value: "sales", label: "매출" }, { value: "purchase", label: "매입" }]} value={type} onChange={(v) => setType(v || "sales")} />
                        </Grid.Col>
                        <Grid.Col span={6}>
                            <DateInput label="발행일" value={issueDate} onChange={(v) => setIssueDate(v ? new Date(v) : null)} placeholder="날짜 선택" />
                        </Grid.Col>
                    </Grid>

                    <Divider label="공급자 정보" labelPosition="center" />
                    <Grid>
                        <Grid.Col span={6}><TextInput label="공급자명" value={supplierName} onChange={(e) => setSupplierName(e.currentTarget.value)} required /></Grid.Col>
                        <Grid.Col span={6}><TextInput label="사업자번호" value={supplierRegNum} onChange={(e) => setSupplierRegNum(e.currentTarget.value)} /></Grid.Col>
                    </Grid>

                    <Divider label="공급받는자 정보" labelPosition="center" />
                    <Grid>
                        <Grid.Col span={6}><TextInput label="공급받는자명" value={receiverName} onChange={(e) => setReceiverName(e.currentTarget.value)} required /></Grid.Col>
                        <Grid.Col span={6}><TextInput label="사업자번호" value={receiverRegNum} onChange={(e) => setReceiverRegNum(e.currentTarget.value)} /></Grid.Col>
                    </Grid>

                    <Divider label="금액 정보" labelPosition="center" />
                    <Grid>
                        <Grid.Col span={6}>
                            <NumberInput
                                label="공급가액"
                                value={amount}
                                onChange={(v) => {
                                    setAmount(v);
                                    if (typeof v === "number") setVat(Math.floor(v * 0.1));
                                }}
                                thousandSeparator
                                suffix="원"
                            />
                        </Grid.Col>
                        <Grid.Col span={6}>
                            <NumberInput label="부가세" value={vat} onChange={setVat} thousandSeparator suffix="원" />
                        </Grid.Col>
                    </Grid>

                    <TextInput label="품목/비고" value={description} onChange={(e) => setDescription(e.currentTarget.value)} />

                    <Group justify="flex-end" mt="md">
                        <Button variant="light" color="gray" onClick={() => setOpened(false)}>취소</Button>
                        <Button color="gray" onClick={() => void save()} loading={saving}>저장하기</Button>
                    </Group>
                </Stack>
            </Modal>
        </Container>
    );
}

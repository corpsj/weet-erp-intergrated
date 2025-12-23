"use client";

import {
    ActionIcon,
    Badge,
    Box,
    Button,
    Container,
    Divider,
    Grid,
    Group,
    Modal,
    NumberInput,
    Paper,
    Select,
    Stack,
    Text,
    TextInput,
    Title,
} from "@mantine/core";
import { DateTimePicker } from "@mantine/dates";
import { notifications } from "@mantine/notifications";
import { IconPlus, IconTrash, IconTransferIn, IconArrowDownLeft, IconArrowUpRight } from "@tabler/icons-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import dayjs from "dayjs";

type Transaction = {
    id: string;
    transaction_date: string;
    type: "deposit" | "withdrawal";
    amount: number;
    description: string;
    bank_name: string;
    account_number: string;
    balance_after: number;
    category: string;
    created_at: string;
};

const fetchWithAuth = async (input: RequestInfo | URL, init?: RequestInit) => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("로그인이 필요합니다.");
    return fetch(input, { ...init, headers: { ...(init?.headers ?? {}), authorization: `Bearer ${token}` } });
};

export default function TransactionsPage() {
    const [loading, setLoading] = useState(true);
    const [items, setItems] = useState<Transaction[]>([]);
    const [opened, setOpened] = useState(false);
    const [saving, setSaving] = useState(false);

    // Form State
    const [type, setType] = useState<string>("deposit");
    const [transactionDate, setTransactionDate] = useState<Date | null>(new Date());
    const [amount, setAmount] = useState<number | string>(0);
    const [description, setDescription] = useState("");
    const [bankName, setBankName] = useState("");
    const [accountNumber, setAccountNumber] = useState("");
    const [category, setCategory] = useState("");

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const response = await fetchWithAuth("/api/bank-transactions");
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
        if (!transactionDate || !amount) {
            notifications.show({ title: "입력 확인", message: "일시와 금액을 입력하세요.", color: "yellow" });
            return;
        }

        setSaving(true);
        try {
            const payload = {
                transaction_date: transactionDate.toISOString(),
                type,
                amount: Number(amount),
                description,
                bank_name: bankName,
                account_number: accountNumber,
                category,
            };

            const response = await fetchWithAuth("/api/bank-transactions", {
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
            notifications.show({ title: "성공", message: "거래 내역이 등록되었습니다.", color: "green" });
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
            const response = await fetchWithAuth(`/api/bank-transactions/${id}`, { method: "DELETE" });
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
                if (cur.type === "deposit") acc.income += cur.amount;
                else acc.expense += cur.amount;
                return acc;
            },
            { income: 0, expense: 0 }
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
                    <Box style={{
                        width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8,
                        backgroundColor: item.type === "deposit" ? "var(--mantine-color-blue-0)" : "var(--mantine-color-red-0)"
                    }}>
                        {item.type === "deposit" ? (
                            <IconArrowDownLeft size={22} color="var(--mantine-color-blue-6)" />
                        ) : (
                            <IconArrowUpRight size={22} color="var(--mantine-color-red-6)" />
                        )}
                    </Box>
                    <Stack gap={0}>
                        <Text fw={600} size="sm">
                            {item.description || (item.type === "deposit" ? "입금" : "출금")}
                        </Text>
                        <Text size="xs" c="dimmed">
                            {dayjs(item.transaction_date).format("YYYY.MM.DD HH:mm")} | {item.bank_name} ({item.account_number})
                        </Text>
                    </Stack>
                </Group>

                <Group gap="xl" wrap="nowrap">
                    <Stack gap={0} align="flex-end">
                        <Text fw={700} size="sm" c={item.type === "deposit" ? "blue" : "red"}>
                            {item.type === "deposit" ? "+" : "-"}{item.amount.toLocaleString()}원
                        </Text>
                        {item.category && (
                            <Badge variant="outline" color="gray" size="xs">{item.category}</Badge>
                        )}
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
                    <Title order={2}>입출금 내역</Title>
                    <Text c="dimmed" size="sm">은행 거래 내역을 관리하고 지출과 연동합니다.</Text>
                </div>
                <Group>
                    <Button color="gray" leftSection={<IconPlus size={16} />} onClick={() => setOpened(true)}>거래 추가</Button>
                </Group>
            </Group>

            <Grid mb="xl">
                <Grid.Col span={{ base: 6, md: 4 }}>
                    <Paper withBorder p="md" radius="md" className="app-surface">
                        <Text size="xs" c="dimmed" fw={700} tt="uppercase">총 입금</Text>
                        <Text size="lg" fw={700} color="blue">{summary.income.toLocaleString()}원</Text>
                    </Paper>
                </Grid.Col>
                <Grid.Col span={{ base: 6, md: 4 }}>
                    <Paper withBorder p="md" radius="md" className="app-surface">
                        <Text size="xs" c="dimmed" fw={700} tt="uppercase">총 출금</Text>
                        <Text size="lg" fw={700} color="red">{summary.expense.toLocaleString()}원</Text>
                    </Paper>
                </Grid.Col>
                <Grid.Col span={{ base: 12, md: 4 }}>
                    <Paper withBorder p="md" radius="md" className="app-surface">
                        <Text size="xs" c="dimmed" fw={700} tt="uppercase">수지합계</Text>
                        <Text size="lg" fw={700} color={summary.income - summary.expense >= 0 ? "blue" : "red"}>
                            {(summary.income - summary.expense).toLocaleString()}원
                        </Text>
                    </Paper>
                </Grid.Col>
            </Grid>

            <Stack gap="xs">
                {rows}
                {!items.length && !loading && (
                    <Paper p="xl" withBorder radius="md" style={{ textAlign: "center", borderStyle: "dashed" }}>
                        <Text size="sm" c="dimmed">거래 내역이 없습니다.</Text>
                    </Paper>
                )}
            </Stack>

            <Modal opened={opened} onClose={() => setOpened(false)} title="거래 내역 등록" centered size="md">
                <Stack gap="sm">
                    <Grid>
                        <Grid.Col span={6}>
                            <Select label="구분" data={[{ value: "deposit", label: "입금" }, { value: "withdrawal", label: "출금" }]} value={type} onChange={(v) => setType(v || "deposit")} />
                        </Grid.Col>
                        <Grid.Col span={6}>
                            <DateTimePicker label="거래일시" value={transactionDate} onChange={(v) => setTransactionDate(v ? new Date(v) : null)} placeholder="날짜 및 시간 선택" />
                        </Grid.Col>
                    </Grid>

                    <NumberInput label="금액" value={amount} onChange={setAmount} thousandSeparator suffix="원" required />
                    <TextInput label="내용/적요" value={description} onChange={(e) => setDescription(e.currentTarget.value)} placeholder="" />

                    <Grid>
                        <Grid.Col span={6}><TextInput label="은행명" value={bankName} onChange={(e) => setBankName(e.currentTarget.value)} /></Grid.Col>
                        <Grid.Col span={6}><TextInput label="계좌번호" value={accountNumber} onChange={(e) => setAccountNumber(e.currentTarget.value)} /></Grid.Col>
                    </Grid>

                    <TextInput label="분류" value={category} onChange={(e) => setCategory(e.currentTarget.value)} placeholder="" />

                    <Group justify="flex-end" mt="md">
                        <Button variant="light" color="gray" onClick={() => setOpened(false)}>취소</Button>
                        <Button color="gray" onClick={() => void save()} loading={saving}>저장하기</Button>
                    </Group>
                </Stack>
            </Modal>
        </Container>
    );
}

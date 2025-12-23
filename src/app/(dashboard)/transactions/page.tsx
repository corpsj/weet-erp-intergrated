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
    Affix,
    Transition,
} from "@mantine/core";
import { DateTimePicker } from "@mantine/dates";
import { notifications } from "@mantine/notifications";
import { useMediaQuery } from "@mantine/hooks";
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
    const isMobile = useMediaQuery("(max-width: 768px)");
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
            mb="sm"
            style={{
                cursor: "pointer",
                background: 'var(--mantine-color-white)',
                boxShadow: 'var(--mantine-shadow-xs)',
                transition: 'all 0.1s ease'
            }}
            className="transaction-row"
            onClick={() => {/* Edit logic if any */ }}
        >
            <Stack gap="sm">
                <Group justify="space-between" wrap="nowrap" align="center">
                    <Group gap="md" wrap="nowrap" style={{ flex: 1 }}>
                        <Box style={{
                            width: 44,
                            height: 44,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            borderRadius: 8,
                            backgroundColor: "var(--mantine-color-gray-1)",
                            flexShrink: 0
                        }}>
                            {item.type === "deposit" ? (
                                <IconArrowDownLeft size={24} color="var(--mantine-color-blue-6)" />
                            ) : (
                                <IconArrowUpRight size={24} color="var(--mantine-color-orange-6)" />
                            )}
                        </Box>
                        <Stack gap={0} style={{ overflow: 'hidden' }}>
                            <Text fw={700} size="sm" c="gray.9" lineClamp={1}>
                                {item.description || (item.type === "deposit" ? "입금" : "출금")}
                            </Text>
                            <Text size="xs" c="dimmed" fw={600} mt={2}>
                                {item.bank_name} • {dayjs(item.transaction_date).format("MM.DD HH:mm")}
                            </Text>
                        </Stack>
                    </Group>

                    <Stack gap={2} align="flex-end" style={{ flexShrink: 0 }}>
                        <Text fw={800} size="md" c={item.type === "deposit" ? "blue.7" : "orange.7"} style={{ letterSpacing: '-0.02em' }}>
                            {item.type === "deposit" ? "+" : "-"}{item.amount.toLocaleString()}원
                        </Text>
                        {item.category && (
                            <Badge variant="light" color="gray" size="xs" radius="sm">{item.category}</Badge>
                        )}
                    </Stack>
                </Group>

                <Group justify="flex-end">
                    <ActionIcon variant="subtle" color="gray" size="sm" radius="md" onClick={(e) => void remove(item.id, e)}>
                        <IconTrash size={16} />
                    </ActionIcon>
                </Group>
            </Stack>
        </Paper>
    ));

    return (
        <Container size="xl" py="xl" px={isMobile ? "md" : "xl"}>
            <Box hiddenFrom="md" px="md" mb="lg">
                <Title order={2} fw={800} style={{ letterSpacing: '-0.02em' }}>입출금 내역</Title>
            </Box>
            <Group justify="space-between" mb="xl" visibleFrom="md" align="flex-end">
                <Box>
                    <Title order={1} fw={800} style={{ letterSpacing: '-0.02em' }}>입출금 내역</Title>
                    <Text c="dimmed" size="sm" fw={500}>등록된 은행 거래 내역을 관리하고 지출과 연동합니다.</Text>
                </Box>
                <Button
                    color="indigo"
                    radius="md"
                    leftSection={<IconPlus size={18} />}
                    onClick={() => setOpened(true)}
                    size="md"
                    variant="light"
                >
                    거래 내역 추가
                </Button>
            </Group>

            <Paper withBorder p="md" radius="md" bg="var(--mantine-color-white)" mb="xl">
                <Grid gutter="md">
                    <Grid.Col span={{ base: 6, md: 4 }}>
                        <Stack gap={4}>
                            <Text size="xs" c="dimmed" fw={800} tt="uppercase">총 입금</Text>
                            <Text size="lg" fw={900} c="blue.7">{summary.income.toLocaleString()}원</Text>
                        </Stack>
                    </Grid.Col>
                    <Grid.Col span={{ base: 6, md: 4 }}>
                        <Stack gap={4}>
                            <Text size="xs" c="dimmed" fw={800} tt="uppercase">총 출금</Text>
                            <Text size="lg" fw={900} c="orange.7">{summary.expense.toLocaleString()}원</Text>
                        </Stack>
                    </Grid.Col>
                    <Grid.Col span={{ base: 12, md: 4 }}>
                        <Stack gap={4} align="flex-end" style={{ textAlign: 'right' }}>
                            <Text size="xs" c="dimmed" fw={800} tt="uppercase">합계 잔액</Text>
                            <Text size="lg" fw={900} c={summary.income - summary.expense >= 0 ? "indigo.7" : "red.7"}>
                                {(summary.income - summary.expense).toLocaleString()}원
                            </Text>
                        </Stack>
                    </Grid.Col>
                </Grid>
            </Paper>

            <Stack gap="xs">
                {rows}
                {!items.length && !loading && (
                    <Paper p="xl" withBorder radius="md" style={{ textAlign: "center", borderStyle: "dashed" }}>
                        <Text size="sm" c="dimmed">거래 내역이 없습니다.</Text>
                    </Paper>
                )}
            </Stack>

            <Modal opened={opened} onClose={() => setOpened(false)} title={<Text fw={800}>거래 내역 등록</Text>} centered size="md" radius="md">
                <Stack gap="md">
                    <Grid gutter="sm">
                        <Grid.Col span={6}>
                            <Select label="구분" radius="md" data={[{ value: "deposit", label: "입금" }, { value: "withdrawal", label: "출금" }]} value={type} onChange={(v) => setType(v || "deposit")} />
                        </Grid.Col>
                        <Grid.Col span={6}>
                            <DateTimePicker label="거래일시" radius="md" value={transactionDate} onChange={(v) => setTransactionDate(v ? new Date(v) : null)} placeholder="일시 선택" />
                        </Grid.Col>
                    </Grid>

                    <NumberInput label="거래 금액" radius="md" placeholder="0" value={amount} onChange={setAmount} thousandSeparator suffix="원" required />
                    <TextInput label="내용/적요" radius="md" placeholder="거래처명 또는 항목" value={description} onChange={(e) => setDescription(e.currentTarget.value)} />

                    <Grid gutter="sm">
                        <Grid.Col span={6}><TextInput label="은행명" radius="md" value={bankName} onChange={(e) => setBankName(e.currentTarget.value)} /></Grid.Col>
                        <Grid.Col span={6}><TextInput label="계좌번호" radius="md" value={accountNumber} onChange={(e) => setAccountNumber(e.currentTarget.value)} /></Grid.Col>
                    </Grid>

                    <TextInput label="분류" radius="md" placeholder="식비, 자재비 등" value={category} onChange={(e) => setCategory(e.currentTarget.value)} />

                    <Group justify="flex-end" mt="xl" gap="sm">
                        <Button variant="subtle" color="gray" radius="md" onClick={() => setOpened(false)}>취소</Button>
                        <Button color="indigo" radius="md" onClick={() => void save()} loading={saving} px="xl">저장하기</Button>
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
                            onClick={() => setOpened(true)}
                        >
                            <IconPlus size={32} />
                        </ActionIcon>
                    )}
                </Transition>
            </Affix>
        </Container>
    );
}

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
    Affix,
    Transition,
    Skeleton,
} from "@mantine/core";
import { DateInput } from "@mantine/dates";
import { notifications } from "@mantine/notifications";
import { useMediaQuery } from "@mantine/hooks";
import { IconSearch, IconPlus, IconCheck, IconX, IconTrash, IconReceipt2 } from "@tabler/icons-react";
import { useCallback, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import dayjs from "dayjs";
import { useQuery, useQueryClient } from "@tanstack/react-query";

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
    const isMobile = useMediaQuery("(max-width: 768px)");
    const queryClient = useQueryClient();
    const [typeFilter, setTypeFilter] = useState<string>("all");
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

    const { data: items = [], isLoading: loading } = useQuery<TaxInvoice[]>({
        queryKey: ["tax-invoices"],
        queryFn: async () => {
            const response = await fetchWithAuth("/api/tax-invoices");
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.message || "불러오기 실패");
            return payload.items || [];
        },
    });

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
            await queryClient.invalidateQueries({ queryKey: ["tax-invoices"] });
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
            await queryClient.invalidateQueries({ queryKey: ["tax-invoices"] });
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

    const filteredItems = useMemo(() => {
        if (typeFilter === "all") return items;
        return items.filter(item => item.type === typeFilter);
    }, [items, typeFilter]);

    const skeletons = useMemo(() => {
        return Array(3).fill(0).map((_, i) => (
            <Paper key={i} p="md" radius="md" withBorder bg="var(--panel)">
                <Stack gap="sm">
                    <Group justify="space-between">
                        <Skeleton height={20} width={80} radius="xl" />
                        <Skeleton height={20} width={100} radius="xl" />
                    </Group>
                    <Skeleton height={24} width="70%" radius="xl" />
                    <Group justify="space-between">
                        <Skeleton height={14} width={120} radius="xl" />
                        <Skeleton height={14} width={60} radius="xl" />
                    </Group>
                </Stack>
            </Paper>
        ));
    }, []);

    const mobileRows = filteredItems.map((item) => (
        <Paper
            key={item.id}
            p="md"
            radius="md"
            withBorder
            mb="sm"
            style={{
                cursor: "pointer",
                background: 'var(--panel)',
                boxShadow: 'var(--mantine-shadow-xs)',
                transition: 'all 0.1s ease'
            }}
            className="invoice-row"
        >
            <Group justify="space-between" wrap="nowrap">
                <Group gap="md" style={{ flex: 1 }}>
                    <Box style={{
                        width: 44,
                        height: 44,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: 8,
                        backgroundColor: "var(--mantine-color-default)",
                        flexShrink: 0
                    }}>
                        <IconReceipt2 size={22} color="var(--mantine-color-indigo-6)" />
                    </Box>
                    <Stack gap={0}>
                        <Group gap="xs">
                            <Badge color={item.type === "sales" ? "indigo" : "red"} variant="light" size="sm" radius="sm">
                                {item.type === "sales" ? "매출" : "매입"}
                            </Badge>
                            <Text fw={700} size="sm" c="var(--ink)">
                                {item.type === "sales" ? item.receiver_name : item.supplier_name}
                            </Text>
                        </Group>
                        <Text size="xs" c="dimmed" fw={500} mt={2}>
                            {dayjs(item.issue_date).format("YYYY.MM.DD")} {item.description && `• ${item.description}`}
                        </Text>
                    </Stack>
                </Group>

                <Group gap="xl" wrap="nowrap">
                    <Stack gap={0} align="flex-end">
                        <Text fw={800} size="md" c="indigo.9">
                            {item.amount.toLocaleString()}원
                        </Text>
                        <Text size="xs" c="dimmed" fw={600}>
                            VAT {item.vat.toLocaleString()}원
                        </Text>
                    </Stack>
                    <ActionIcon variant="subtle" color="gray" size="md" radius="md" onClick={(e) => void remove(item.id, e)}>
                        <IconTrash size={18} />
                    </ActionIcon>
                </Group>
            </Group>
        </Paper>
    ));
    const desktopRows = filteredItems.map((item) => (
        <Table.Tr key={item.id} onClick={(e) => {/* Edit logic if any */ }} style={{ cursor: 'pointer' }}>
            <Table.Td>
                <Text size="sm" fw={600}>{dayjs(item.issue_date).format("YYYY.MM.DD")}</Text>
            </Table.Td>
            <Table.Td>
                <Badge color={item.type === "sales" ? "indigo" : "red"} variant="dot" size="sm">
                    {item.type === "sales" ? "매출" : "매입"}
                </Badge>
            </Table.Td>
            <Table.Td>
                <Text size="sm" fw={700}>{item.type === "sales" ? item.receiver_name : item.supplier_name}</Text>
            </Table.Td>
            <Table.Td>
                <Text size="sm" c="dimmed" truncate style={{ maxWidth: 200 }}>{item.description || "-"}</Text>
            </Table.Td>
            <Table.Td>
                <Text size="sm" fw={800} ta="right">{item.amount.toLocaleString()}원</Text>
            </Table.Td>
            <Table.Td>
                <Text size="xs" c="dimmed" ta="right">{item.vat.toLocaleString()}원</Text>
            </Table.Td>
            <Table.Td onClick={(e) => e.stopPropagation()}>
                <Group justify="flex-end">
                    <ActionIcon variant="subtle" color="gray" size="sm" radius="md" onClick={(e) => void remove(item.id, e)}>
                        <IconTrash size={16} />
                    </ActionIcon>
                </Group>
            </Table.Td>
        </Table.Tr>
    ));
    return (
        <Container size="xl" py="xl" px={isMobile ? "md" : "xl"}>
            <Box hiddenFrom="md" px="md" mb="lg">
                <Title order={2} fw={800} style={{ letterSpacing: '-0.02em' }}>세금계산서 관리</Title>
            </Box>
            <Group justify="space-between" mb="xl" align="flex-end" visibleFrom="md">
                <div>
                    <Title order={1} fw={800} style={{ letterSpacing: '-0.02em' }}>세금계산서 관리</Title>
                    <Text c="dimmed" size="sm" fw={500}>매출 및 매입 세금계산서를 통합 관리합니다.</Text>
                </div>
                <Group>
                    <Button
                        leftSection={<IconPlus size={18} />}
                        color="indigo"
                        radius="md"
                        variant="light"
                        onClick={() => setOpened(true)}
                        size="md"
                    >
                        세금계산서 추가
                    </Button>
                </Group>
            </Group>

            <Grid mb="xl">
                <Grid.Col span={{ base: 6, md: 4 }}>
                    <Paper withBorder p="md" radius="md" bg="var(--panel)">
                        <Text size="xs" c="dimmed" fw={800} tt="uppercase" mb={4}>총 매출액</Text>
                        <Text size="xl" fw={900} c="indigo.9">{summary.sales.toLocaleString()}원</Text>
                        <Text size="xs" c="dimmed" fw={600}>부가세: {summary.salesVat.toLocaleString()}원</Text>
                    </Paper>
                </Grid.Col>
                <Grid.Col span={{ base: 6, md: 4 }}>
                    <Paper withBorder p="md" radius="md" bg="var(--panel)">
                        <Text size="xs" c="dimmed" fw={800} tt="uppercase" mb={4}>총 매입액</Text>
                        <Text size="xl" fw={900} c="red.8">{summary.purchase.toLocaleString()}원</Text>
                        <Text size="xs" c="dimmed" fw={600}>부가세: {summary.purchaseVat.toLocaleString()}원</Text>
                    </Paper>
                </Grid.Col>
                <Grid.Col span={{ base: 12, md: 4 }}>
                    <Paper withBorder p="md" radius="md" bg="var(--panel)">
                        <Text size="xs" c="dimmed" fw={800} tt="uppercase" mb={4}>부가세 수지</Text>
                        <Text size="xl" fw={900} c={summary.salesVat - summary.purchaseVat >= 0 ? "indigo.7" : "red.7"}>
                            {(summary.salesVat - summary.purchaseVat).toLocaleString()}원
                        </Text>
                        <Badge variant="light" color={summary.salesVat - summary.purchaseVat >= 0 ? "indigo" : "red"} size="sm" radius="sm">
                            {summary.salesVat - summary.purchaseVat >= 0 ? "납부 예정" : "환급 예정"}
                        </Badge>
                    </Paper>
                </Grid.Col>
            </Grid>

            <Paper withBorder radius="md" bg="var(--panel)">
                <Stack gap={0}>
                    <Box p="md">
                        <Group justify="space-between" wrap="nowrap">
                            <Group gap="xs">
                                {[
                                    { id: "all", label: "전체", color: "gray" },
                                    { id: "sales", label: "매출", color: "indigo" },
                                    { id: "purchase", label: "매입", color: "red" },
                                ].map((s) => (
                                    <Button
                                        key={s.id}
                                        variant={typeFilter === s.id ? "filled" : "light"}
                                        color={s.color}
                                        size="compact-sm"
                                        radius="xl"
                                        onClick={() => setTypeFilter(s.id)}
                                    >
                                        {s.label}
                                    </Button>
                                ))}
                            </Group>
                            <Box className="desktop-only">
                                <Text size="xs" fw={700} c="dimmed">내역: {filteredItems.length}건</Text>
                            </Box>
                        </Group>
                    </Box>

                    <Divider />

                    <Box p="md" hiddenFrom="md">
                        {loading ? skeletons : mobileRows}
                        {!filteredItems.length && !loading && (
                            <Paper p="xl" withBorder radius="md" style={{ textAlign: "center", borderStyle: "dashed" }}>
                                <Text size="sm" c="dimmed">내역이 없습니다.</Text>
                            </Paper>
                        )}
                    </Box>

                    <Box visibleFrom="md">
                        {loading ? (
                            <Box p="md">
                                <Stack gap="xs">
                                    {Array(5).fill(0).map((_, i) => <Skeleton key={i} height={40} radius="sm" />)}
                                </Stack>
                            </Box>
                        ) : (
                            <Table.ScrollContainer minWidth={800}>
                                <Table verticalSpacing="sm" highlightOnHover>
                                    <Table.Thead>
                                        <Table.Tr>
                                            <Table.Th>발행일</Table.Th>
                                            <Table.Th>구분</Table.Th>
                                            <Table.Th>상호(이름)</Table.Th>
                                            <Table.Th>품목/비고</Table.Th>
                                            <Table.Th style={{ textAlign: 'right' }}>공급가액</Table.Th>
                                            <Table.Th style={{ textAlign: 'right' }}>부가세</Table.Th>
                                            <Table.Th />
                                        </Table.Tr>
                                    </Table.Thead>
                                    <Table.Tbody>
                                        {desktopRows}
                                    </Table.Tbody>
                                </Table>
                            </Table.ScrollContainer>
                        )}
                        {!filteredItems.length && !loading && (
                            <Paper p="xl" m="md" withBorder radius="md" style={{ textAlign: "center", borderStyle: "dashed" }}>
                                <Text size="sm" c="dimmed">등록된 세금계산서 내역이 없습니다.</Text>
                            </Paper>
                        )}
                    </Box>
                </Stack>
            </Paper>

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

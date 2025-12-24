"use client";

import {
    ActionIcon,
    Badge,
    Box,
    Button,
    Container,
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
    Loader,
    Image,
    SimpleGrid,
    Divider,
    SegmentedControl,
    Grid,
    ScrollArea,
    Center,
    Card,
    FileInput,
    Drawer,
    Affix,
    Transition,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { useMediaQuery } from "@mantine/hooks";
import {
    IconBolt,
    IconPlus,
    IconTrash,
    IconUpload,
    IconEdit,
    IconSearch,
    IconPhoto,
} from "@tabler/icons-react";
import dayjs from "dayjs";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { UtilityBill } from "@/lib/types";
import { useQuery, useQueryClient } from "@tanstack/react-query";

const fetchWithAuth = async (input: RequestInfo | URL, init?: RequestInit) => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("로그인이 필요합니다.");
    return fetch(input, {
        ...init,
        headers: {
            ...(init?.headers ?? {}),
            authorization: `Bearer ${token}`,
        },
    });
};

export default function UtilityBillsPage() {
    const isMobile = useMediaQuery("(max-width: 768px)");
    const queryClient = useQueryClient();
    const [search, setSearch] = useState("");
    const [categoryFilter, setCategoryFilter] = useState("전체");
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [mobileDetailOpen, setMobileDetailOpen] = useState(false);

    const [isEditing, setIsEditing] = useState(false);
    const [editing, setEditing] = useState<Partial<UtilityBill> | null>(null);
    const [saving, setSaving] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [modalFile, setModalFile] = useState<File | null>(null);
    const [uploadKey, setUploadKey] = useState(0);
    const [sessionBlobUrls, setSessionBlobUrls] = useState<Record<string, string>>({});
    const [lightboxOpened, { open: openLightbox, close: closeLightbox }] = useDisclosure(false);

    // Auto-save note states
    const [localNote, setLocalNote] = useState("");
    const [savingNote, setSavingNote] = useState(false);
    const [lastSavedId, setLastSavedId] = useState<string | null>(null);

    const { data: items = [], isLoading: loading } = useQuery<UtilityBill[]>({
        queryKey: ["utility-bills"],
        queryFn: async () => {
            const response = await fetchWithAuth("/api/utility-bills");
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.message || "불러오기 실패");
            return payload.items || [];
        },
    });

    const load = useCallback(async () => {
        await queryClient.invalidateQueries({ queryKey: ["utility-bills"] });
    }, [queryClient]);

    useEffect(() => {
        const item = items.find(x => x.id === selectedId);
        if (item && selectedId !== lastSavedId) {
            setLocalNote(item.note || "");
            setLastSavedId(selectedId);
        }
    }, [selectedId, items, lastSavedId]);

    // Debounced Note Auto-save
    useEffect(() => {
        const item = items.find(x => x.id === selectedId);
        if (!item || localNote === (item.note || "")) return;

        const timer = setTimeout(async () => {
            setSavingNote(true);
            try {
                const res = await fetchWithAuth(`/api/utility-bills/${selectedId}`, {
                    method: "PATCH",
                    body: JSON.stringify({ note: localNote }),
                });
                if (res.ok) {
                    queryClient.setQueryData<UtilityBill[]>(["utility-bills"], (old) =>
                        old?.map(x => x.id === selectedId ? { ...x, note: localNote } : x)
                    );
                }
            } catch (err) {
                console.error("Auto-save note failed:", err);
            } finally {
                setSavingNote(false);
            }
        }, 1000);

        return () => clearTimeout(timer);
    }, [localNote, selectedId, items]);

    const onUpload = async (file: File | null) => {
        if (!file) return;

        const tempId = "temp-" + Math.random().toString(36).slice(2);
        const localUrl = URL.createObjectURL(file);

        const newItem: UtilityBill = {
            id: tempId,
            company_id: "",
            category: "분석 중",
            billing_month: dayjs().format("YYYY-MM"),
            amount: 0,
            image_url: localUrl,
            note: "",
            status: "processing",
            is_paid: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };

        setSessionBlobUrls(prev => ({ ...prev, [tempId]: localUrl }));
        queryClient.setQueryData<UtilityBill[]>(["utility-bills"], (old) => [newItem, ...(old || [])]);
        setSelectedId(tempId);
        setIsEditing(false);
        setEditing(null);

        try {
            const ext = file.name.split(".").pop();
            const path = `utility-bills/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
            const { data: uploadData, error: uploadError } = await supabase.storage
                .from("receipts")
                .upload(path, file);

            let imageUrl = null;
            if (uploadError) {
                console.error("Storage upload error:", uploadError);
                notifications.show({ title: "이미지 업로드 실패", message: uploadError.message, color: "orange" });
            } else if (uploadData) {
                const { data: urlData } = supabase.storage.from("receipts").getPublicUrl(path);
                imageUrl = urlData.publicUrl;
                console.log("Uploaded Image URL:", imageUrl);
            }

            const formData = new FormData();
            formData.append("file", file);
            const aiRes = await fetchWithAuth("/api/utility-bills/process", {
                method: "POST",
                body: formData,
            });
            const aiPayload = await aiRes.json();
            if (!aiRes.ok) throw new Error(aiPayload.message || "AI 분석 실패");

            const result = aiPayload.result;

            const saveRes = await fetchWithAuth("/api/utility-bills", {
                method: "POST",
                body: JSON.stringify({
                    category: result.category || "기타",
                    billing_month: result.billing_month || dayjs().format("YYYY-MM"),
                    amount: result.amount || 0,
                    image_url: path, // Save the PATH, not the full URL
                    note: "",
                    status: "processed",
                }),
            });

            const savedPayload = await saveRes.json();
            if (!saveRes.ok) throw new Error("데이터 저장 실패");

            // Ensure we save the PERMANENT image URL to the database, never the blob URL
            const permanentImageUrl = imageUrl || savedPayload.item.image_url;
            console.log("[onUpload] Permanent URL:", permanentImageUrl);
            const savedItem = { ...savedPayload.item, image_url: permanentImageUrl || localUrl };

            if (!savedItem || !savedItem.id) throw new Error("분석 결과 저장에 실패했습니다.");

            notifications.show({ title: "완료", message: "분석 및 업로드가 완료되었습니다.", color: "green" });

            queryClient.setQueryData<UtilityBill[]>(["utility-bills"], (old) =>
                old?.map(x => x.id === tempId ? savedItem : x)
            );
            setSessionBlobUrls(prev => ({ ...prev, [savedItem.id]: localUrl }));
            setSelectedId(savedItem.id);
            setUploadKey(prev => prev + 1);
        } catch (error: any) {
            console.error("고지서 분석 및 저장 오류:", error);
            notifications.show({ title: "실패", message: error.message, color: "red" });
            queryClient.setQueryData<UtilityBill[]>(["utility-bills"], (old) =>
                old?.filter(x => x.id !== tempId)
            );
            setSelectedId(null);
        }
    };

    const save = async () => {
        if (!editing?.category || !editing?.billing_month) {
            notifications.show({ message: "항목과 청구년월은 필수입니다.", color: "yellow" });
            return;
        }

        setSaving(true);
        try {
            let imageUrl = editing.image_url;

            // 1. If there's a new file selected in the modal, upload it first
            if (modalFile) {
                const ext = modalFile.name.split(".").pop();
                const path = `utility-bills/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
                const { data: uploadData, error: uploadError } = await supabase.storage
                    .from("receipts")
                    .upload(path, modalFile);

                if (uploadError) throw new Error("이미지 업로드 실패: " + uploadError.message);

                const { data: urlData } = supabase.storage.from("receipts").getPublicUrl(path);
                imageUrl = urlData.publicUrl;
                // We only need the path for the database, not the full public URL here.
                imageUrl = path;
            }

            const method = editing.id ? "PATCH" : "POST";
            const url = editing.id ? `/api/utility-bills/${editing.id}` : "/api/utility-bills";

            // Sanitize image_url: if it's a blob URL, we must replace it with the relative path or null
            // If imageUrl was just uploaded, it's the path.
            let finalImageUrl = imageUrl || editing.image_url;
            if (finalImageUrl?.startsWith('http') && finalImageUrl.includes('/public/receipts/')) {
                finalImageUrl = finalImageUrl.split('/public/receipts/').pop() || null;
            } else if (finalImageUrl?.startsWith('blob:')) {
                finalImageUrl = null; // Should have been handled by imageUrl upload
            }

            const sanitizedEditing = {
                ...editing,
                image_url: finalImageUrl,
                status: "manual" // Always set to manual if edited
            };

            const response = await fetchWithAuth(url, {
                method,
                body: JSON.stringify(sanitizedEditing),
            });
            if (!response.ok) throw new Error("저장 실패");

            notifications.show({ title: "성공", message: "저장되었습니다.", color: "green" });
            setIsEditing(false);
            setModalFile(null);
            load();
        } catch (error: any) {
            notifications.show({ title: "오류", message: error.message, color: "red" });
        } finally {
            setSaving(false);
        }
    };

    const togglePaid = async (item: UtilityBill) => {
        const newPaid = !item.is_paid;
        try {
            const res = await fetchWithAuth(`/api/utility-bills/${item.id}`, {
                method: "PATCH",
                body: JSON.stringify({ is_paid: newPaid }),
            });
            if (!res.ok) throw new Error("상태 변경 실패");

            queryClient.setQueryData<UtilityBill[]>(["utility-bills"], (old) =>
                old?.map(x => x.id === item.id ? { ...x, is_paid: newPaid } : x)
            );
            notifications.show({
                message: newPaid ? "납부 완료로 표시되었습니다." : "납부 전으로 표시되었습니다.",
                color: "indigo",
                autoClose: 2000
            });
        } catch (error: any) {
            notifications.show({ title: "오류", message: error.message, color: "red" });
        }
    };

    const remove = async (id: string) => {
        if (!id || id === 'undefined' || id.startsWith('temp-') || typeof id !== 'string') {
            notifications.show({ title: "삭제 불가", message: "아직 저장되지 않았거나 유효하지 않은 항목입니다.", color: "yellow" });
            return;
        }

        try {
            const res = await fetchWithAuth(`/api/utility-bills/${id}`, { method: "DELETE" });
            if (!res.ok) {
                const payload = await res.json().catch(() => ({}));
                throw new Error(payload.message || "삭제 실패");
            }

            notifications.show({ message: "삭제되었습니다.", color: "green" });
            setDeletingId(null);
            if (selectedId === id) setSelectedId(null);
            load();
        } catch (error: any) {
            notifications.show({ title: "삭제 오류", message: error.message, color: "red" });
        }
    };

    const filteredItems = useMemo(() => {
        return items.filter((item) => {
            const matchesSearch =
                (item.category || "").includes(search) ||
                (item.billing_month || "").includes(search) ||
                (item.note || "").includes(search);

            if (categoryFilter === "전체") return matchesSearch;
            if (categoryFilter === "보험") return matchesSearch && (item.category || "").includes("보험");
            return matchesSearch && (item.category || "") === categoryFilter;
        });
    }, [items, search, categoryFilter]);

    const selectedItem = useMemo(() => items.find(x => x.id === selectedId), [items, selectedId]);

    const renderDetailContent = () => (
        <Stack h="100%">
            <Group justify="space-between" align="center" mb="xs">
                <Title order={4}>고지서 정보</Title>
                <Group gap="xs">
                    {selectedItem && !isEditing && selectedItem.status !== 'processing' && (
                        <>
                            <Button
                                size="compact-xs"
                                variant="light"
                                radius="md"
                                leftSection={<IconEdit size={14} />}
                                onClick={() => { setEditing(selectedItem); setIsEditing(true); }}
                            >
                                수정
                            </Button>
                            {deletingId === selectedItem.id ? (
                                <Group gap={4}>
                                    <Button size="compact-xs" color="red" variant="filled" radius="md" onClick={() => remove(selectedItem.id)}>삭제 확인</Button>
                                    <Button size="compact-xs" color="gray" variant="subtle" radius="md" onClick={() => setDeletingId(null)}>취소</Button>
                                </Group>
                            ) : (
                                <ActionIcon variant="light" color="red" size="sm" onClick={() => setDeletingId(selectedItem.id)}>
                                    <IconTrash size={14} />
                                </ActionIcon>
                            )}
                        </>
                    )}
                </Group>
            </Group>
            <Divider mb="md" />

            {selectedId ? (
                <Stack h="100%" gap="md" style={{ flex: 1 }}>
                    <ScrollArea style={{ flex: 1 }}>
                        {isEditing ? (
                            <Stack gap="sm">
                                <TextInput
                                    label="분류"
                                    value={editing?.category || ""}
                                    onChange={(e) => setEditing({ ...editing, category: e.currentTarget.value } as any)}
                                    required
                                    radius="md"
                                />
                                <TextInput
                                    label="청구년월"
                                    placeholder="YYYY-MM"
                                    value={editing?.billing_month || ""}
                                    onChange={(e) => setEditing({ ...editing, billing_month: e.currentTarget.value } as any)}
                                    required
                                    radius="md"
                                />
                                <TextInput
                                    label="납부금액(원)"
                                    type="number"
                                    value={editing?.amount || 0}
                                    onChange={(e) => setEditing({ ...editing, amount: Number(e.currentTarget.value) } as any)}
                                    required
                                    radius="md"
                                />
                                <Textarea
                                    label="메모"
                                    value={editing?.note || ""}
                                    onChange={(e) => setEditing({ ...editing, note: e.currentTarget.value } as any)}
                                    minRows={3}
                                    radius="md"
                                />
                                <Group grow mt="md">
                                    <Button variant="outline" color="gray" radius="md" onClick={() => { setIsEditing(false); setModalFile(null); }}>취소</Button>
                                    <Button color="indigo" radius="md" onClick={save} loading={saving}>저장</Button>
                                </Group>
                            </Stack>
                        ) : (
                            <Stack gap="md">
                                <Stack gap={4}>
                                    <Text size="xs" fw={700} c="dimmed">납부 상태</Text>
                                    <Group gap="xs">
                                        <Badge
                                            variant={selectedItem?.is_paid ? "filled" : "light"}
                                            color={selectedItem?.is_paid ? "green" : "gray"}
                                            radius="md"
                                            style={{ cursor: "pointer" }}
                                            onClick={() => togglePaid(selectedItem!)}
                                        >
                                            {selectedItem?.is_paid ? "납부 완료" : "납부 전 (클릭하여 전환)"}
                                        </Badge>
                                        {selectedItem?.status === 'processing' ? (
                                            <Badge variant="dot" color="indigo" radius="md">AI 분석 중</Badge>
                                        ) : (
                                            <Badge variant="light" color={selectedItem?.status === "processed" ? "indigo" : "gray"} radius="md">
                                                {selectedItem?.status === "processed" ? "AI 자동 분석" : "수동 입력"}
                                            </Badge>
                                        )}
                                    </Group>
                                </Stack>

                                <SimpleGrid cols={2}>
                                    <Stack gap={4}>
                                        <Text size="xs" fw={700} c="dimmed">분류</Text>
                                        <Text fw={500}>{selectedItem?.category}</Text>
                                    </Stack>
                                    <Stack gap={4}>
                                        <Text size="xs" fw={700} c="dimmed">청구년월</Text>
                                        <Text fw={500}>{selectedItem?.billing_month}</Text>
                                    </Stack>
                                </SimpleGrid>

                                <Stack gap={4}>
                                    <Text size="xs" fw={700} c="dimmed">납부금액</Text>
                                    <Text size="xl" fw={800} color="indigo">
                                        {selectedItem?.status === 'processing' ? "-" : `${(selectedItem?.amount || 0).toLocaleString()}원`}
                                    </Text>
                                </Stack>

                                <Stack gap={4}>
                                    <Group justify="space-between" align="center">
                                        <Text fw={500} size="sm">메모</Text>
                                        {savingNote && <Text size="xs" c="indigo">저장 중...</Text>}
                                    </Group>
                                    <Textarea
                                        placeholder="메모를 입력하세요..."
                                        value={localNote}
                                        onChange={(e) => setLocalNote(e.currentTarget.value)}
                                        minRows={3}
                                        autosize
                                        styles={{ input: { fontSize: 'var(--mantine-font-size-sm)' } }}
                                    />
                                </Stack>
                            </Stack>
                        )}
                    </ScrollArea>

                    <Box mt="md">
                        <Paper withBorder p="xs" radius="md" bg="white">
                            {(modalFile || sessionBlobUrls[selectedId!] || (isEditing ? editing?.image_url : selectedItem?.image_url)) ? (
                                <Image
                                    src={modalFile ? URL.createObjectURL(modalFile) : (sessionBlobUrls[selectedId!] || (isEditing ? editing?.image_url : selectedItem?.image_url))}
                                    alt="Bill Preview"
                                    radius="md"
                                    fit="contain"
                                    mah={500}
                                    style={{ cursor: "pointer" }}
                                    onClick={openLightbox}
                                    fallbackSrc="https://placehold.co/600x800?text=이미지를 불러올 수 없습니다"
                                    onError={() => {
                                        const currentSrc = modalFile ? "blob-modal" : (sessionBlobUrls[selectedId!] || (isEditing ? editing?.image_url : selectedItem?.image_url));
                                        console.error("Image load failed for URL:", currentSrc);
                                    }}
                                />
                            ) : (
                                <Center h={200}>
                                    <Stack align="center" gap="xs">
                                        <IconPhoto size={32} color="gray" />
                                        <Text size="xs" c="dimmed">이미지가 없습니다.</Text>
                                    </Stack>
                                </Center>
                            )}
                            {isEditing && (
                                <Box mt="xs" style={{ textAlign: "center" }}>
                                    <FileButton onChange={setModalFile} accept="image/*">
                                        {(props) => (
                                            <Button {...props} variant="light" size="compact-xs" radius="md" leftSection={<IconUpload size={14} />}>
                                                이미지 변경
                                            </Button>
                                        )}
                                    </FileButton>
                                </Box>
                            )}
                        </Paper>
                    </Box>
                </Stack>
            ) : (
                <Center style={{ flex: 1 }}>
                    <Stack align="center" gap="xs">
                        <IconSearch size={48} color="var(--mantine-color-gray-3)" stroke={1.5} />
                        <Text c="dimmed" size="sm" ta="center">
                            목록에서 고지서를 선택하면<br />상세 정보와 미리보기가 나타납니다.
                        </Text>
                    </Stack>
                </Center>
            )}
        </Stack>
    );

    return (
        <Container size="xl" py="xl" px={isMobile ? "md" : "xl"}>
            <Stack gap="lg">
                <Box hiddenFrom="md" px="md" mb="xs">
                    <Title order={2} fw={800} style={{ letterSpacing: '-0.02em' }}>운영 공과금 내역</Title>
                </Box>
                <Group justify="space-between" mb="xl" visibleFrom="md" align="flex-end">
                    <Box>
                        <Title order={1} fw={800} style={{ letterSpacing: '-0.02em' }}>운영 공과금 내역</Title>
                        <Text c="dimmed" size="sm" fw={500}>
                            수수료, 공과금, 기타 청구 내역을 관리합니다.
                        </Text>
                    </Box>
                    <Group gap="sm">
                        <FileButton key={`btn-upload-${uploadKey}`} onChange={onUpload} accept="image/*">
                            {(props) => (
                                <Button
                                    {...props}
                                    size="md"
                                    variant="light"
                                    color="indigo"
                                    radius="md"
                                    leftSection={<IconUpload size={18} />}
                                >
                                    고지서 업로드
                                </Button>
                            )}
                        </FileButton>
                        <Button
                            size="md"
                            variant="light"
                            color="indigo"
                            radius="md"
                            leftSection={<IconPlus size={18} />}
                            onClick={() => {
                                setEditing({});
                                setIsEditing(true);
                            }}
                        >
                            직접 입력
                        </Button>
                    </Group>
                </Group>

                <Grid gutter="md" align="stretch">
                    <Grid.Col span={{ base: 12, md: 6 }}>
                        <Paper withBorder p="md" radius="md" h="100%" bg="var(--mantine-color-white)" shadow="xs">
                            <Group justify="space-between" mb="md">
                                <SegmentedControl
                                    value={categoryFilter}
                                    onChange={setCategoryFilter}
                                    data={["전체", "전기세", "보험", "세금"]}
                                    size="sm"
                                />
                                <TextInput
                                    placeholder="검색..."
                                    leftSection={<IconSearch size={16} />}
                                    value={search}
                                    onChange={(e) => setSearch(e.currentTarget.value)}
                                    style={{ flex: 1, maxWidth: 150 }}
                                />
                            </Group>

                            <ScrollArea h={700} offsetScrollbars visibleFrom="md">
                                <Table highlightOnHover verticalSpacing="sm">
                                    <Table.Thead>
                                        <Table.Tr>
                                            <Table.Th>분류</Table.Th>
                                            <Table.Th>청구월</Table.Th>
                                            <Table.Th>금액</Table.Th>
                                            <Table.Th style={{ width: 80 }}>상태</Table.Th>
                                        </Table.Tr>
                                    </Table.Thead>
                                    <Table.Tbody>
                                        {loading ? (
                                            <Table.Tr>
                                                <Table.Td colSpan={4} style={{ textAlign: "center", padding: "40px" }}>
                                                    <Stack align="center" gap="xs">
                                                        <Loader size="md" color="indigo" />
                                                        <Text size="sm" c="dimmed">고지서 내역을 불러오는 중...</Text>
                                                    </Stack>
                                                </Table.Td>
                                            </Table.Tr>
                                        ) : filteredItems.map((item) => (
                                            <Table.Tr
                                                key={item.id}
                                                onClick={() => {
                                                    setSelectedId(item.id);
                                                    setIsEditing(false);
                                                    setEditing(item);
                                                }}
                                                bg={item.status === 'processing' ? 'var(--mantine-color-indigo-0)' : (selectedId === item.id ? 'var(--mantine-color-indigo-light)' : undefined)}
                                                style={{
                                                    cursor: 'pointer',
                                                    opacity: item.status === 'processing' ? 0.8 : 1,
                                                }}
                                            >
                                                <Table.Td>
                                                    <Group gap={4}>
                                                        <Text size="sm" fw={700}>
                                                            {item.category || "미지정"}
                                                        </Text>
                                                        {item.status === 'processing' && <Loader size={10} color="indigo" />}
                                                    </Group>
                                                </Table.Td>
                                                <Table.Td>
                                                    <Text size="sm" fw={700}>{item.billing_month || "-"}</Text>
                                                </Table.Td>
                                                <Table.Td>
                                                    <Text size="sm" fw={700}>
                                                        {item.status === 'processing' ? "-" : `${(item.amount || 0).toLocaleString()}원`}
                                                    </Text>
                                                </Table.Td>
                                                <Table.Td onClick={(e) => e.stopPropagation()}>
                                                    {item.status === 'processing' ? (
                                                        <Badge variant="dot" size="xs" radius="md">분석 중</Badge>
                                                    ) : (
                                                        <Badge
                                                            color={item.is_paid ? "green" : "gray"}
                                                            variant="light"
                                                            radius="md"
                                                            size="lg"
                                                            style={{ cursor: "pointer" }}
                                                            onClick={() => togglePaid(item)}
                                                        >
                                                            {item.is_paid ? "납부" : "납부 전"}
                                                        </Badge>
                                                    )}
                                                </Table.Td>
                                            </Table.Tr>
                                        ))}
                                        {filteredItems.length === 0 && (
                                            <Table.Tr style={{ pointerEvents: 'none' }}>
                                                <Table.Td colSpan={4} style={{ textAlign: "center", padding: "40px" }}>
                                                    <Text c="dimmed" size="xs">데이터가 없습니다.</Text>
                                                </Table.Td>
                                            </Table.Tr>
                                        )}
                                    </Table.Tbody>
                                </Table>
                            </ScrollArea>

                            {/* Mobile List View */}
                            <Stack hiddenFrom="md" gap="md">
                                {loading ? (
                                    <Center py="xl">
                                        <Stack align="center" gap="xs">
                                            <Loader size="md" color="indigo" />
                                            <Text size="sm" c="dimmed">고지서 내역을 불러오는 중...</Text>
                                        </Stack>
                                    </Center>
                                ) : filteredItems.map(item => (
                                    <Card
                                        key={item.id}
                                        shadow="xs"
                                        padding="md"
                                        radius="md"
                                        withBorder
                                        onClick={() => {
                                            setEditing(item);
                                            setSelectedId(item.id);
                                            setIsEditing(false);
                                            setMobileDetailOpen(true);
                                        }}
                                        style={{
                                            borderColor: selectedId === item.id ? 'var(--mantine-color-indigo-4)' : undefined,
                                            backgroundColor: item.status === 'processing' ? 'var(--mantine-color-gray-0)' : 'white'
                                        }}
                                    >
                                        <Group justify="space-between" mb={4}>
                                            <Group gap={6}>
                                                <Badge
                                                    size="xs"
                                                    variant="light"
                                                    color={item.status === 'processing' ? "orange" : (item.is_paid ? "indigo" : "gray")}
                                                    radius="sm"
                                                >
                                                    {item.status === 'processing' ? "분석 중" : (item.is_paid ? "완료" : "미납")}
                                                </Badge>
                                                <Text fw={700} size="sm">{item.category}</Text>
                                            </Group>
                                            <Text size="xs" c="dimmed" fw={600}>{dayjs(item.created_at).format('MM.DD')}</Text>
                                        </Group>

                                        <Group justify="space-between" align="flex-end">
                                            <Text size="xs" c="dimmed">{item.billing_month}</Text>
                                            <Group gap={4} align="flex-end">
                                                {item.status === 'processing' && <Loader size={12} color="indigo" />}
                                                <Text fw={800} size="md" c="indigo">
                                                    {item.amount > 0 ? `${item.amount.toLocaleString()}원` : '-'}
                                                </Text>
                                            </Group>
                                        </Group>
                                    </Card>
                                ))}
                                {!filteredItems.length && (
                                    <Text c="dimmed" ta="center" py="xl">내역이 없습니다.</Text>
                                )}
                            </Stack>
                        </Paper>
                    </Grid.Col>

                    <Grid.Col span={{ base: 12, md: 6 }} className="desktop-only">
                        <Paper p="md" radius="md" h="100%" bg="var(--mantine-color-white)" withBorder shadow="xs">
                            {renderDetailContent()}
                        </Paper>
                    </Grid.Col>
                </Grid>
            </Stack>

            {/* Universal FAB - Mobile Only */}
            <Affix position={{ bottom: 80, right: 40 }} className="mobile-only">
                <Transition transition="slide-up" mounted={true}>
                    {(transitionStyles) => (
                        <FileButton key={`fab-${uploadKey}`} onChange={onUpload} accept="image/*">
                            {(props) => (
                                <ActionIcon
                                    {...props}
                                    size={64}
                                    radius="xl"
                                    color="indigo"
                                    variant="filled"
                                    style={{
                                        ...transitionStyles,
                                        boxShadow: '0 8px 24px rgba(99, 102, 241, 0.4)',
                                        zIndex: 1000,
                                    }}
                                >
                                    <IconPlus size={32} />
                                </ActionIcon>
                            )}
                        </FileButton>
                    )}
                </Transition>
            </Affix>

            <Modal
                opened={lightboxOpened}
                onClose={closeLightbox}
                size="auto"
                padding={0}
                withCloseButton={false}
                centered
            >
                {(modalFile || sessionBlobUrls[selectedId!] || (isEditing ? editing?.image_url : selectedItem?.image_url)) && (
                    <Image
                        src={modalFile ? URL.createObjectURL(modalFile) : (sessionBlobUrls[selectedId!] || (isEditing ? editing?.image_url : selectedItem?.image_url))}
                        alt="Bill Preview Full"
                        fit="contain"
                        mah="90vh"
                        maw="90vw"
                        onClick={closeLightbox}
                        style={{ cursor: 'zoom-out' }}
                    />
                )}
            </Modal>

            <Drawer
                opened={mobileDetailOpen}
                onClose={() => setMobileDetailOpen(false)}
                position="bottom"
                size="90%"
                radius="xl"
                title={<Text fw={800} size="xl" style={{ letterSpacing: '-0.02em' }}>납부 상세 정보</Text>}
                styles={{
                    header: { padding: '20px' },
                    body: { padding: '20px', paddingBottom: 'calc(20px + env(safe-area-inset-bottom))' },
                    content: { borderRadius: '24px 24px 0 0' }
                }}
            >
                <ScrollArea style={{ height: 'calc(85vh - 60px)' }}>
                    {renderDetailContent()}
                </ScrollArea>
            </Drawer>
        </Container>
    );
}

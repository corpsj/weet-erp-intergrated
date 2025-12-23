"use client";

import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Checkbox,
  Group,
  Paper,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
  Title,
  Divider,
  Grid,
  rem,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconEye,
  IconEyeOff,
  IconRefresh,
  IconCopy,
  IconTrash,
  IconUser,
  IconTicket,
  IconShieldLock,
  IconSettings,
  IconUsers,
} from "@tabler/icons-react";
import dayjs from "dayjs";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { AppUser } from "@/lib/types";
import { ProfileEditor } from "@/components/ProfileEditor";

type InviteCodeItem = {
  id: string;
  active: boolean;
  note: string | null;
  expires_at: string | null;
  max_uses: number | null;
  uses_count: number;
  last_used_at: string | null;
  created_at: string;
};

type AiModelResponse = {
  model?: string;
  message?: string;
};

const formatDateTime = (value: string | null) => {
  if (!value) return "-";
  return dayjs(value).format("YYYY-MM-DD HH:mm");
};

const normalizeInt = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return Math.floor(parsed);
};

const fetchWithAuth = async (input: RequestInfo | URL, init?: RequestInit) => {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new Error("로그인이 필요합니다.");
  }
  return fetch(input, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      authorization: `Bearer ${token}`,
    },
  });
};

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<string | null>("profile");
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<InviteCodeItem[]>([]);
  const [revealedById, setRevealedById] = useState<Record<string, string>>({});

  const [note, setNote] = useState("");
  const [expiresInDays, setExpiresInDays] = useState("3");
  const [unlimited, setUnlimited] = useState(false);
  const [maxUses, setMaxUses] = useState("1");
  const [creating, setCreating] = useState(false);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [savingAiModel, setSavingAiModel] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetchWithAuth("/api/settings/invite-codes");
      const payload = (await response.json().catch(() => null)) as any;
      if (!response.ok) {
        throw new Error(payload?.message ?? "불러오기에 실패했습니다.");
      }
      setItems((payload?.items ?? []) as InviteCodeItem[]);
    } catch (error) {
      notifications.show({
        title: "승인코드 불러오기 실패",
        message: error instanceof Error ? error.message : "알 수 없는 오류",
        color: "red",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const response = await fetchWithAuth("/api/settings/users");
      const payload = (await response.json().catch(() => null)) as any;
      if (!response.ok) {
        throw new Error(payload?.message ?? "사용자 정보를 불러오는데 실패했습니다.");
      }
      setUsers((payload?.items ?? []) as AppUser[]);
    } catch (error) {
      notifications.show({
        title: "사용자 정보 불러오기 실패",
        message: error instanceof Error ? error.message : "알 수 없는 오류",
        color: "red",
      });
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  const loadAiModel = useCallback(async () => {
    // Removed
  }, []);

  const saveAiModel = useCallback(async () => {
    // Removed
  }, []);

  useEffect(() => {
    void load();
    void loadUsers();
    void loadAiModel();
  }, [load, loadUsers, loadAiModel]);

  const createInvite = useCallback(async () => {
    const days = normalizeInt(expiresInDays) ?? 3;
    if (days <= 0) {
      notifications.show({ title: "입력 오류", message: "만료일(일)은 1 이상이어야 합니다.", color: "red" });
      return;
    }

    const parsedMaxUses = unlimited ? 0 : normalizeInt(maxUses) ?? 1;
    if (!unlimited && parsedMaxUses <= 0) {
      notifications.show({ title: "입력 오류", message: "사용횟수는 1 이상이어야 합니다.", color: "red" });
      return;
    }

    setCreating(true);
    try {
      const response = await fetchWithAuth("/api/settings/invite-codes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          note: note.trim() || null,
          expiresInDays: days,
          maxUses: unlimited ? 0 : parsedMaxUses,
        }),
      });
      const payload = (await response.json().catch(() => null)) as any;
      if (!response.ok) {
        throw new Error(payload?.message ?? "생성에 실패했습니다.");
      }

      const code = String(payload?.code ?? "");
      if (code) {
        setRevealedById((prev) => ({ ...prev, [payload?.item?.id]: code }));
        try {
          await navigator.clipboard.writeText(code);
          notifications.show({ title: "승인코드 생성", message: `코드: ${code} (클립보드 복사됨)`, color: "gray" });
        } catch {
          notifications.show({ title: "승인코드 생성", message: `코드: ${code}`, color: "gray" });
        }
      } else {
        notifications.show({ title: "승인코드 생성", message: "생성되었습니다.", color: "gray" });
      }

      setNote("");
      setExpiresInDays("3");
      setUnlimited(false);
      setMaxUses("1");
      await load();
    } catch (error) {
      notifications.show({
        title: "승인코드 생성 실패",
        message: error instanceof Error ? error.message : "알 수 없는 오류",
        color: "red",
      });
    } finally {
      setCreating(false);
    }
  }, [expiresInDays, load, maxUses, note, unlimited]);

  const reveal = useCallback(
    async (id: string) => {
      if (revealedById[id]) return;
      try {
        const response = await fetchWithAuth(`/api/settings/invite-codes/${id}/reveal`);
        const payload = (await response.json().catch(() => null)) as any;
        if (!response.ok) {
          throw new Error(payload?.message ?? "표시 실패");
        }
        const code = String(payload?.code ?? "");
        if (code) {
          setRevealedById((prev) => ({ ...prev, [id]: code }));
        }
      } catch (error) {
        notifications.show({
          title: "승인코드 표시 실패",
          message: error instanceof Error ? error.message : "알 수 없는 오류",
          color: "red",
        });
      }
    },
    [revealedById]
  );

  const toggleActive = useCallback(async (id: string, active: boolean) => {
    try {
      const response = await fetchWithAuth(`/api/settings/invite-codes/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ active }),
      });
      const payload = (await response.json().catch(() => null)) as any;
      if (!response.ok) {
        throw new Error(payload?.message ?? "변경 실패");
      }
      setItems((prev) => prev.map((item) => (item.id === id ? { ...item, active } : item)));
    } catch (error) {
      notifications.show({
        title: "상태 변경 실패",
        message: error instanceof Error ? error.message : "알 수 없는 오류",
        color: "red",
      });
    }
  }, []);

  const deleteInvite = useCallback(async (id: string) => {
    const ok = window.confirm("이 승인코드를 삭제할까요? (복구 불가)");
    if (!ok) return;

    try {
      const response = await fetchWithAuth(`/api/settings/invite-codes/${id}`, { method: "DELETE" });
      const payload = (await response.json().catch(() => null)) as any;
      if (!response.ok) {
        throw new Error(payload?.message ?? "삭제 실패");
      }
      setRevealedById((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setItems((prev) => prev.filter((item) => item.id !== id));
      notifications.show({ title: "삭제 완료", message: "승인코드가 삭제되었습니다.", color: "gray" });
    } catch (error) {
      notifications.show({
        title: "삭제 실패",
        message: error instanceof Error ? error.message : "알 수 없는 오류",
        color: "red",
      });
    }
  }, []);

  const copy = useCallback(
    async (id: string) => {
      const code = revealedById[id];
      if (!code) {
        notifications.show({ title: "복사 실패", message: "먼저 코드를 표시하세요.", color: "yellow" });
        return;
      }
      try {
        await navigator.clipboard.writeText(code);
        notifications.show({ title: "복사됨", message: code, color: "gray" });
      } catch {
        notifications.show({ title: "복사 실패", message: "클립보드 접근이 불가합니다.", color: "red" });
      }
    },
    [revealedById]
  );
  const deleteUser = useCallback(async (id: string) => {
    const ok = window.confirm("이 사용자를 삭제하시겠습니까? (복구 불가)");
    if (!ok) return;

    try {
      const response = await fetchWithAuth(`/api/settings/users?id=${id}`, { method: "DELETE" });
      const payload = (await response.json().catch(() => null)) as any;
      if (!response.ok) {
        throw new Error(payload?.message ?? "삭제 실패");
      }
      setUsers((prev) => prev.filter((u) => u.id !== id));
      notifications.show({ title: "삭제 완료", message: "사용자가 삭제되었습니다.", color: "gray" });
    } catch (error) {
      notifications.show({
        title: "삭제 실패",
        message: error instanceof Error ? error.message : "알 수 없는 오류",
        color: "red",
      });
    }
  }, []);

  const rows = useMemo(() => {
    return items.map((item) => {
      const exhausted =
        typeof item.max_uses === "number" && item.max_uses > 0 ? item.uses_count >= item.max_uses : false;
      const statusColor = !item.active ? "gray" : exhausted ? "red" : "green";
      const statusLabel = !item.active ? "비활성" : exhausted ? "소진" : "활성";

      const code = revealedById[item.id] ?? "••••••";
      const usesLabel = item.max_uses === null ? `${item.uses_count}/∞` : `${item.uses_count}/${item.max_uses}`;

      return (
        <Table.Tr key={item.id}>
          <Table.Td>
            <Badge variant="dot" color={statusColor} size="sm">
              {statusLabel}
            </Badge>
          </Table.Td>
          <Table.Td>
            <Group gap="xs" wrap="nowrap">
              <Text fw={600} size="sm" style={{ letterSpacing: "0.08em", fontFamily: "monospace" }}>
                {code}
              </Text>
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                onClick={() =>
                  revealedById[item.id]
                    ? setRevealedById((prev) => {
                      const next = { ...prev };
                      delete next[item.id];
                      return next;
                    })
                    : void reveal(item.id)
                }
              >
                {revealedById[item.id] ? <IconEyeOff size={14} /> : <IconEye size={14} />}
              </ActionIcon>
              <ActionIcon variant="subtle" color="gray" size="sm" onClick={() => void copy(item.id)}>
                <IconCopy size={14} />
              </ActionIcon>
            </Group>
          </Table.Td>
          <Table.Td>
            <Text size="xs">{usesLabel}</Text>
          </Table.Td>
          <Table.Td>
            <Text size="xs">{formatDateTime(item.expires_at)}</Text>
          </Table.Td>
          <Table.Td>
            <Text size="xs" truncate maw={120}>
              {item.note ?? "-"}
            </Text>
          </Table.Td>
          <Table.Td>
            <Group gap="xs" justify="flex-end" wrap="nowrap">
              <Button
                size="compact-xs"
                variant="light"
                color="gray"
                onClick={() => void toggleActive(item.id, !item.active)}
              >
                {item.active ? "차단" : "복구"}
              </Button>
              <ActionIcon
                variant="subtle"
                color="red"
                size="sm"
                onClick={() => void deleteInvite(item.id)}
                aria-label="delete"
              >
                <IconTrash size={14} />
              </ActionIcon>
            </Group>
          </Table.Td>
        </Table.Tr>
      );
    });
  }, [copy, deleteInvite, items, reveal, revealedById, toggleActive]);

  const userRows = useMemo(() => {
    return users.map((u) => {
      return (
        <Table.Tr key={u.id}>
          <Table.Td>
            <Badge variant="dot" color={u.name ? "green" : "gray"} size="sm">
              {u.name ? "활성" : "대기"}
            </Badge>
          </Table.Td>
          <Table.Td>
            <Text fw={600} size="sm">
              {u.name || "미설정"}
            </Text>
          </Table.Td>
          <Table.Td>
            <Text size="xs">{u.initials || "-"}</Text>
          </Table.Td>
          <Table.Td>
            <Text size="xs">{formatDateTime(u.created_at)}</Text>
          </Table.Td>
          <Table.Td>
            <Group gap="xs" justify="flex-end" wrap="nowrap">
              <ActionIcon
                variant="subtle"
                color="red"
                size="sm"
                onClick={() => void deleteUser(u.id)}
                aria-label="delete user"
              >
                <IconTrash size={14} />
              </ActionIcon>
            </Group>
          </Table.Td>
        </Table.Tr>
      );
    });
  }, [deleteUser, users]);

  const navStyles = {
    tabsList: {
      borderRight: `1px solid var(--mantine-color-gray-2)`,
      paddingRight: "md",
    },
    tab: {
      justifyContent: "flex-start",
      padding: `${rem(10)} ${rem(16)}`,
      borderRadius: "var(--mantine-radius-md)",
      fontWeight: 500,
    },
  };

  const tabsStyles = {
    tab: {
      ...navStyles.tab,
      "&[data-active]": {
        backgroundColor: "var(--mantine-color-gray-1)",
        color: "var(--mantine-color-black)",
      },
    },
  };

  return (
    <Box p="xl" maw={1200} mx="auto">
      <Group justify="space-between" mb={40}>
        <div>
          <Title order={1} mb={4}>
            설정
          </Title>
          <Text c="dimmed" size="sm">
            애플리케이션 및 계정 환경설정을 관리합니다.
          </Text>
        </div>
        <Button
          leftSection={<IconRefresh size={16} />}
          variant="subtle"
          color="gray"
          onClick={() => {
            void load();
          }}
          loading={loading}
        >
          전체 새로고침
        </Button>
      </Group>

      <Tabs
        orientation="vertical"
        value={activeTab}
        onChange={setActiveTab}
        variant="unstyled"
        styles={tabsStyles}
      >
        <Grid gutter={40} style={{ width: "100%" }}>
          <Grid.Col span={{ base: 12, sm: 3 }}>
            <Tabs.List w="100%">
              <Tabs.Tab
                value="profile"
                leftSection={<IconUser size={18} />}
              >
                프로필 설정
              </Tabs.Tab>
              <Tabs.Tab
                value="invites"
                leftSection={<IconTicket size={18} />}
              >
                승인코드 관리
              </Tabs.Tab>
              <Tabs.Tab
                value="users"
                leftSection={<IconUsers size={18} />}
              >
                사용자 관리
              </Tabs.Tab>
              <Tabs.Tab
                value="security"
                leftSection={<IconShieldLock size={18} />}
              >
                보안 및 관리
              </Tabs.Tab>
            </Tabs.List>
          </Grid.Col>

          <Grid.Col span={{ base: 12, sm: 9 }}>
            <Box>
              <Tabs.Panel value="profile">
                <Stack gap="xl">
                  <Box>
                    <Title order={3} mb="xs">
                      프로필 설정
                    </Title>
                    <Text size="sm" c="dimmed" mb="xl">
                      내 이름 및 표시 정보를 관리합니다.
                    </Text>
                  </Box>
                  <ProfileEditor />
                </Stack>
              </Tabs.Panel>

              <Tabs.Panel value="invites">
                <Stack gap="xl">
                  <Box>
                    <Title order={3} mb="xs">
                      승인코드 관리
                    </Title>
                    <Text size="sm" c="dimmed" mb="xl">
                      새로운 사용자를 승인하거나 기존 코드를 관리합니다.
                    </Text>
                  </Box>

                  <Paper withBorder p="xl" radius="md">
                    <Stack gap="lg">
                      <Grid align="flex-end">
                        <Grid.Col span={{ base: 12, sm: 4 }}>
                          <TextInput
                            label="만료 기한"
                            description="일 단위 입력"
                            placeholder="3"
                            value={expiresInDays}
                            onChange={(event) => setExpiresInDays(event.currentTarget.value)}
                          />
                        </Grid.Col>
                        <Grid.Col span={{ base: 12, sm: 4 }}>
                          <TextInput
                            label="최대 사용 횟수"
                            description={unlimited ? "제한 없음" : "사용 가능한 횟수"}
                            placeholder="1"
                            value={maxUses}
                            onChange={(event) => setMaxUses(event.currentTarget.value)}
                            disabled={unlimited}
                          />
                        </Grid.Col>
                        <Grid.Col span={{ base: 12, sm: 4 }}>
                          <Checkbox
                            label="무제한 사용 허용"
                            checked={unlimited}
                            onChange={(event) => setUnlimited(event.currentTarget.checked)}
                            mb={10}
                          />
                        </Grid.Col>
                      </Grid>

                      <TextInput
                        label="용도 및 메모"
                        placeholder=""
                        value={note}
                        onChange={(event) => setNote(event.currentTarget.value)}
                      />

                      <Group justify="flex-end">
                        <Button
                          variant="light"
                          color="gray"
                          onClick={() => void createInvite()}
                          loading={creating}
                        >
                          승인코드 생성 및 복사
                        </Button>
                      </Group>
                    </Stack>
                  </Paper>

                  <Box>
                    <Title order={4} mb="md">
                      활동 중인 코드
                    </Title>
                    <Paper withBorder radius="md" style={{ overflow: "hidden" }}>
                      <Table verticalSpacing="sm">
                        <Table.Thead bg="gray.0">
                          <Table.Tr>
                            <Table.Th>상태</Table.Th>
                            <Table.Th>코드</Table.Th>
                            <Table.Th>사용 현황</Table.Th>
                            <Table.Th>만료일</Table.Th>
                            <Table.Th>메모</Table.Th>
                            <Table.Th />
                          </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                          {rows.length > 0 ? (
                            rows
                          ) : (
                            <Table.Tr>
                              <Table.Td colSpan={6}>
                                <Text ta="center" size="sm" py="xl" c="dimmed">
                                  생성된 코드가 없습니다.
                                </Text>
                              </Table.Td>
                            </Table.Tr>
                          )}
                        </Table.Tbody>
                      </Table>
                    </Paper>
                  </Box>
                </Stack>
              </Tabs.Panel>

              <Tabs.Panel value="users">
                <Stack gap="xl">
                  <Box>
                    <Title order={3} mb="xs">
                      사용자 관리
                    </Title>
                    <Text size="sm" c="dimmed" mb="xl">
                      사용자 목록을 확인하고 관리합니다.
                    </Text>
                  </Box>

                  <Box>
                    <Paper withBorder radius="md" style={{ overflow: "hidden" }}>
                      <Table verticalSpacing="sm">
                        <Table.Thead bg="gray.0">
                          <Table.Tr>
                            <Table.Th>상태</Table.Th>
                            <Table.Th>이름</Table.Th>
                            <Table.Th>이니셜</Table.Th>
                            <Table.Th>가입일</Table.Th>
                            <Table.Th />
                          </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                          {userRows.length > 0 ? (
                            userRows
                          ) : (
                            <Table.Tr>
                              <Table.Td colSpan={5}>
                                <Text ta="center" size="sm" py="xl" c="dimmed">
                                  사용자가 없습니다.
                                </Text>
                              </Table.Td>
                            </Table.Tr>
                          )}
                        </Table.Tbody>
                      </Table>
                    </Paper>
                  </Box>
                </Stack>
              </Tabs.Panel>

              <Tabs.Panel value="security">
                <Stack gap="xl">
                  <Box>
                    <Title order={3} mb="xs">
                      보안 및 계정 관리
                    </Title>
                    <Text size="sm" c="dimmed" mb="xl">
                      비밀번호를 변경하거나 계정 보안 옵션을 설정합니다.
                    </Text>
                  </Box>

                  <Paper withBorder p="xl" radius="md">
                    <Stack gap="lg">
                      <Box>
                        <Text fw={600} size="sm">
                          비밀번호 변경
                        </Text>
                        <Text size="xs" c="dimmed" mb="md">
                          주기적인 비밀번호 변경은 보안에 중요합니다.
                        </Text>
                        <Button variant="light" color="gray" size="sm" disabled>
                          변경하기 (준비 중)
                        </Button>
                      </Box>
                      <Divider />
                      <Box>
                        <Text fw={600} size="sm" c="red">
                          데이터 초기화
                        </Text>
                        <Text size="xs" c="dimmed" mb="md">
                          계정의 모든 데이터를 삭제하고 초기화합니다. 이 작업은 되돌릴 수 없습니다.
                        </Text>
                        <Button variant="outline" color="red" size="sm" disabled>
                          계정 데이터 삭제
                        </Button>
                      </Box>
                    </Stack>
                  </Paper>
                </Stack>
              </Tabs.Panel>

            </Box>
          </Grid.Col>
        </Grid>
      </Tabs >
    </Box >
  );
}

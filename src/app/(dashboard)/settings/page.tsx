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
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconEye, IconEyeOff, IconRefresh, IconCopy } from "@tabler/icons-react";
import dayjs from "dayjs";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
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
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<InviteCodeItem[]>([]);
  const [revealedById, setRevealedById] = useState<Record<string, string>>({});

  const [note, setNote] = useState("");
  const [expiresInDays, setExpiresInDays] = useState("3");
  const [unlimited, setUnlimited] = useState(false);
  const [maxUses, setMaxUses] = useState("1");
  const [creating, setCreating] = useState(false);

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
        title: "초대코드 불러오기 실패",
        message: error instanceof Error ? error.message : "알 수 없는 오류",
        color: "red",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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
          notifications.show({ title: "초대코드 생성", message: `코드: ${code} (클립보드 복사됨)`, color: "gray" });
        } catch {
          notifications.show({ title: "초대코드 생성", message: `코드: ${code}`, color: "gray" });
        }
      } else {
        notifications.show({ title: "초대코드 생성", message: "생성되었습니다.", color: "gray" });
      }

      setNote("");
      setExpiresInDays("3");
      setUnlimited(false);
      setMaxUses("1");
      await load();
    } catch (error) {
      notifications.show({
        title: "초대코드 생성 실패",
        message: error instanceof Error ? error.message : "알 수 없는 오류",
        color: "red",
      });
    } finally {
      setCreating(false);
    }
  }, [expiresInDays, load, maxUses, note, unlimited]);

  const reveal = useCallback(async (id: string) => {
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
        title: "초대코드 표시 실패",
        message: error instanceof Error ? error.message : "알 수 없는 오류",
        color: "red",
      });
    }
  }, [revealedById]);

  const toggleActive = useCallback(
    async (id: string, active: boolean) => {
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
    },
    []
  );

  const copy = useCallback(async (id: string) => {
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
  }, [revealedById]);

  const rows = useMemo(() => {
    return items.map((item) => {
      const exhausted =
        typeof item.max_uses === "number" && item.max_uses > 0 ? item.uses_count >= item.max_uses : false;
      const statusColor = !item.active ? "gray" : exhausted ? "red" : "gray";
      const statusLabel = !item.active ? "비활성" : exhausted ? "소진" : "활성";

      const code = revealedById[item.id] ?? "••••••";
      const usesLabel = item.max_uses === null ? `${item.uses_count}/∞` : `${item.uses_count}/${item.max_uses}`;

      return (
        <Table.Tr key={item.id}>
          <Table.Td>
            <Badge variant="light" color={statusColor}>
              {statusLabel}
            </Badge>
          </Table.Td>
          <Table.Td>
            <Group gap="xs" wrap="nowrap">
              <Text fw={600} style={{ letterSpacing: "0.08em" }}>
                {code}
              </Text>
              <ActionIcon
                variant="subtle"
                color="gray"
                onClick={() => (revealedById[item.id] ? setRevealedById((prev) => {
                  const next = { ...prev };
                  delete next[item.id];
                  return next;
                }) : void reveal(item.id))}
                aria-label="reveal"
              >
                {revealedById[item.id] ? <IconEyeOff size={16} /> : <IconEye size={16} />}
              </ActionIcon>
              <ActionIcon variant="subtle" color="gray" onClick={() => void copy(item.id)} aria-label="copy">
                <IconCopy size={16} />
              </ActionIcon>
            </Group>
          </Table.Td>
          <Table.Td>
            <Text size="sm">{usesLabel}</Text>
          </Table.Td>
          <Table.Td>
            <Text size="sm">{formatDateTime(item.expires_at)}</Text>
          </Table.Td>
          <Table.Td>
            <Text size="sm">{item.note ?? "-"}</Text>
          </Table.Td>
          <Table.Td>
            <Group gap="xs" justify="flex-end">
              <Button
                size="xs"
                variant="light"
                color="gray"
                onClick={() => void toggleActive(item.id, !item.active)}
              >
                {item.active ? "비활성화" : "활성화"}
              </Button>
            </Group>
          </Table.Td>
        </Table.Tr>
      );
    });
  }, [copy, items, reveal, revealedById, toggleActive]);

  return (
    <Box p="md">
      <Group justify="space-between" mb="lg">
        <div>
          <Title order={2}>설정</Title>
          <Text c="dimmed" size="sm">
            계정 및 초대코드 설정
          </Text>
        </div>
        <Button
          leftSection={<IconRefresh size={16} />}
          variant="light"
          color="gray"
          onClick={() => void load()}
          loading={loading}
        >
          새로고침
        </Button>
      </Group>

      <Paper className="app-surface" p="lg" radius="md">
        <Tabs defaultValue="invites" variant="pills">
          <Tabs.List>
            <Tabs.Tab value="invites">초대코드</Tabs.Tab>
            <Tabs.Tab value="profile">프로필</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="invites" pt="md">
            <Stack gap="md">
              <Paper withBorder p="md" radius="md">
                <Stack gap="sm">
                  <Group justify="space-between" align="flex-end">
                    <TextInput
                      label="만료(일)"
                      value={expiresInDays}
                      onChange={(event) => setExpiresInDays(event.currentTarget.value)}
                      w={160}
                    />
                    <Group align="flex-end" gap="md">
                      <Checkbox
                        label="무제한"
                        checked={unlimited}
                        onChange={(event) => setUnlimited(event.currentTarget.checked)}
                      />
                      <TextInput
                        label="사용횟수"
                        value={maxUses}
                        onChange={(event) => setMaxUses(event.currentTarget.value)}
                        w={160}
                        disabled={unlimited}
                      />
                    </Group>
                  </Group>
                  <TextInput
                    label="메모"
                    placeholder="예: 12/25 견적 담당자"
                    value={note}
                    onChange={(event) => setNote(event.currentTarget.value)}
                  />
                  <Group justify="flex-end">
                    <Button color="gray" onClick={() => void createInvite()} loading={creating}>
                      초대코드 생성
                    </Button>
                  </Group>
                  <Text size="xs" c="dimmed">
                    코드는 6자리 영문/숫자로 생성되며, 생성 직후 1회 클립보드로 복사됩니다. (눈 아이콘으로 다시 볼 수 있음)
                  </Text>
                </Stack>
              </Paper>

              <Table verticalSpacing="sm" highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>상태</Table.Th>
                    <Table.Th>코드</Table.Th>
                    <Table.Th>사용</Table.Th>
                    <Table.Th>만료</Table.Th>
                    <Table.Th>메모</Table.Th>
                    <Table.Th />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>{rows}</Table.Tbody>
              </Table>
              {!items.length && <Text size="sm" c="dimmed">등록된 초대코드가 없습니다.</Text>}
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="profile" pt="md">
            <Stack gap="md">
              <ProfileEditor />
              <Text size="xs" c="dimmed">
                초대코드 관리가 필요 없으면 초대코드 탭은 사용하지 않아도 됩니다.
              </Text>
            </Stack>
          </Tabs.Panel>
        </Tabs>
      </Paper>
    </Box>
  );
}

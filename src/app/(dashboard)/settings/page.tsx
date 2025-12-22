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
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconEye, IconEyeOff, IconRefresh, IconCopy } from "@tabler/icons-react";
import dayjs from "dayjs";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { ColorPicker, ColorSwatch, CheckIcon } from "@mantine/core";

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

  // My Account State
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileName, setProfileName] = useState("");
  const [profileInitials, setProfileInitials] = useState("");
  const [profileColor, setProfileColor] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  const profileColors = ["blue", "gray", "green", "red", "yellow", "teal", "orange", "grape"];

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

  const loadProfile = useCallback(async () => {
    setProfileLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: profile } = await supabase
        .from("app_users")
        .select("*")
        .eq("id", session.user.id)
        .maybeSingle();

      if (profile) {
        setProfileName(profile.name);
        setProfileInitials(profile.initials ?? "");
        setProfileColor(profile.color);
      } else {
        // Fallback to auth metadata if no profile exists yet
        const meta = session.user.user_metadata as any;
        setProfileName(meta?.name ?? "");
        setProfileInitials(meta?.name?.slice(0, 2) ?? "");
      }
    } catch (error) {
      console.error("Profile load error:", error);
    } finally {
      setProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    void loadProfile();
  }, [load, loadProfile]);

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

  const saveProfile = useCallback(async () => {
    if (!profileName.trim()) {
      notifications.show({ title: "입력 오류", message: "이름을 입력해주세요.", color: "red" });
      return;
    }

    setSavingProfile(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("로그인 세션이 없습니다.");

      const userId = session.user.id;

      // 1. Update app_users
      const { error: profileError } = await supabase.from("app_users").upsert({
        id: userId,
        name: profileName.trim(),
        initials: profileInitials.trim() || null,
        color: profileColor,
      });

      if (profileError) throw profileError;

      // 2. Update Auth Metadata
      const { error: authError } = await supabase.auth.updateUser({
        data: { name: profileName.trim() }
      });

      if (authError) throw authError;

      notifications.show({ title: "저장 완료", message: "프로필 정보가 업데이트되었습니다.", color: "gray" });

      // Optional: force reload logic if needed, but DashboardLayout should pick it up via auth state change or manual refresh
    } catch (error) {
      notifications.show({
        title: "저장 실패",
        message: error instanceof Error ? error.message : "알 수 없는 오류",
        color: "red",
      });
    } finally {
      setSavingProfile(false);
    }
  }, [profileColor, profileInitials, profileName]);

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

          <Tabs.Panel value="account" pt="xl">
            <Stack gap="xl" maw={480}>
              <Box>
                <Title order={4} mb="xs">프로필 설정</Title>
                <Text size="sm" c="dimmed" mb="lg">
                  시스템 전체에 표시되는 내 정보를 관리합니다.
                </Text>

                <Stack gap="md">
                  <TextInput
                    label="표시 이름"
                    placeholder="홍길동"
                    value={profileName}
                    onChange={(e) => setProfileName(e.currentTarget.value)}
                    required
                  />
                  <TextInput
                    label="이니셜 (2자)"
                    placeholder="HK"
                    maxLength={2}
                    value={profileInitials}
                    onChange={(e) => setProfileInitials(e.currentTarget.value)}
                  />
                  <Box>
                    <Text size="sm" fw={500} mb={8}>프로필 색상</Text>
                    <Group gap="xs">
                      {profileColors.map((color) => (
                        <ColorSwatch
                          key={color}
                          color={`var(--mantine-color-${color}-6)`}
                          component="button"
                          onClick={() => setProfileColor(color)}
                          style={{ cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                        >
                          {profileColor === color && (
                            <CheckIcon style={{ width: 12, height: 12, color: "white" }} />
                          )}
                        </ColorSwatch>
                      ))}
                    </Group>
                  </Box>

                  <Group justify="flex-end" mt="md">
                    <Button
                      color="gray"
                      onClick={saveProfile}
                      loading={savingProfile}
                    >
                      변경사항 저장
                    </Button>
                  </Group>
                </Stack>
              </Box>

              <Divider />

              <Box>
                <Title order={4} mb="xs" c="red">위험 구역</Title>
                <Text size="sm" c="dimmed" mb="md">
                  계정 보안 및 데이터 관리 설정입니다.
                </Text>
                <Button variant="light" color="red" size="sm" disabled>
                  비밀번호 변경 (준비 중)
                </Button>
              </Box>
            </Stack>
          </Tabs.Panel>
        </Tabs>
      </Paper>
    </Box>
  );
}

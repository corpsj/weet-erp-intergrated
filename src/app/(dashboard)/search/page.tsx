"use client";

import { Box, Button, Group, Paper, Stack, Table, Text, TextInput, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type InfoResult = { id: string; title: string; body: string; pinned: boolean; updated_at: string };
type MemoResult = { id: string; title: string | null; body: string; created_at: string };
type TodoResult = { id: string; title: string; status: string; priority: string; created_at: string };

const fetchWithAuth = async (input: RequestInfo | URL, init?: RequestInit) => {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("로그인이 필요합니다.");
  return fetch(input, { ...init, headers: { ...(init?.headers ?? {}), authorization: `Bearer ${token}` } });
};

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<InfoResult[]>([]);
  const [memos, setMemos] = useState<MemoResult[]>([]);
  const [todos, setTodos] = useState<TodoResult[]>([]);

  const run = useCallback(async () => {
    const q = query.trim();
    setLoading(true);
    try {
      const response = await fetchWithAuth(`/api/search?q=${encodeURIComponent(q)}`);
      const payload = (await response.json().catch(() => null)) as any;
      if (!response.ok) throw new Error(payload?.message ?? "검색 실패");
      setInfo((payload?.results?.info ?? []) as InfoResult[]);
      setMemos((payload?.results?.memos ?? []) as MemoResult[]);
      setTodos((payload?.results?.todos ?? []) as TodoResult[]);
    } catch (error) {
      notifications.show({
        title: "검색 실패",
        message: error instanceof Error ? error.message : "알 수 없는 오류",
        color: "red",
      });
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    setInfo([]);
    setMemos([]);
    setTodos([]);
  }, [query]);

  const hasResults = useMemo(() => info.length + memos.length + todos.length > 0, [info.length, memos.length, todos.length]);

  return (
    <Box p="md">
      <Group justify="space-between" mb="lg">
        <div>
          <Title order={2}>검색</Title>
          <Text c="dimmed" size="sm">
            회사 정보/메모/To-Do를 한 번에 검색합니다. (본문 포함)
          </Text>
        </div>
      </Group>

      <Paper className="app-surface" p="lg" radius="md">
        <Group align="flex-end" wrap="nowrap">
          <TextInput
            label="검색어"
            placeholder="예: 사업자번호, 계좌, ○○ 결제, ..."
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            w="100%"
          />
          <Button color="gray" onClick={() => void run()} loading={loading}>
            검색
          </Button>
        </Group>

        <Stack gap="lg" mt="lg">
          <div>
            <Text fw={700} mb="xs">
              회사 정보
            </Text>
            <Table verticalSpacing="sm" highlightOnHover>
              <Table.Tbody>
                {info.map((x) => (
                  <Table.Tr key={x.id}>
                    <Table.Td>
                      <Button component={Link} href="/info" variant="subtle" color="gray">
                        {x.title}
                      </Button>
                      <Text size="sm" c="dimmed" lineClamp={2} style={{ whiteSpace: "pre-wrap" }}>
                        {x.body}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
            {!info.length && <Text size="sm" c="dimmed">결과 없음</Text>}
          </div>

          <div>
            <Text fw={700} mb="xs">
              메모
            </Text>
            <Table verticalSpacing="sm" highlightOnHover>
              <Table.Tbody>
                {memos.map((x) => (
                  <Table.Tr key={x.id}>
                    <Table.Td>
                      <Button component={Link} href="/memos" variant="subtle" color="gray">
                        {x.title || "(제목 없음)"}
                      </Button>
                      <Text size="sm" c="dimmed" lineClamp={2} style={{ whiteSpace: "pre-wrap" }}>
                        {x.body}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
            {!memos.length && <Text size="sm" c="dimmed">결과 없음</Text>}
          </div>

          <div>
            <Text fw={700} mb="xs">
              To-Do
            </Text>
            <Table verticalSpacing="sm" highlightOnHover>
              <Table.Tbody>
                {todos.map((x) => (
                  <Table.Tr key={x.id}>
                    <Table.Td>
                      <Button component={Link} href="/todo" variant="subtle" color="gray">
                        {x.title}
                      </Button>
                      <Text size="sm" c="dimmed">
                        {x.status} · {x.priority}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
            {!todos.length && <Text size="sm" c="dimmed">결과 없음</Text>}
          </div>

          {!loading && query.trim() && !hasResults && <Text size="sm" c="dimmed">전체 결과가 없습니다.</Text>}
        </Stack>
      </Paper>
    </Box>
  );
}


"use client";

import { Badge, Button, Container, Grid, Group, Paper, Stack, Text, TextInput, Title, SimpleGrid, ScrollArea, Box, rem, Divider } from "@mantine/core";
import { Calendar, type DateStringValue } from "@mantine/dates";
import { IconCheckbox, IconSearch, IconReceipt, IconChartBar } from "@tabler/icons-react";
import dayjs from "dayjs";
import { useMemo, useState } from "react";
import "dayjs/locale/ko";
import { supabase } from "@/lib/supabaseClient";
import type { AppUser, CalendarEvent, Todo, TodoPriority, TodoStatus } from "@/lib/types";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

dayjs.locale("ko");

type ExpenseStats = {
  total: number;
  pending: number;
  approved: number;
};

type UtilityStats = {
  total: number;
  unpaidCount: number;
};

const statusLabels: Record<TodoStatus, string> = {
  todo: "대기",
  in_progress: "진행",
  done: "완료",
};

const priorityLabels: Record<TodoPriority, string> = {
  high: "높음",
  medium: "중간",
  low: "낮음",
};

const statusOrder: Record<TodoStatus, number> = {
  todo: 0,
  in_progress: 1,
  done: 2,
};

const priorityOrder: Record<TodoPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

const statusColor = (status: TodoStatus) => {
  if (status === "done") return "green";
  if (status === "in_progress") return "blue";
  return "gray";
};

const priorityColor = (priority: TodoPriority) => {
  if (priority === "high") return "red";
  if (priority === "medium") return "yellow";
  return "gray";
};

export default function HubPage() {
  const router = useRouter();
  const [currentDate, setCurrentDate] = useState<DateStringValue>(dayjs().format("YYYY-MM-DD"));
  const [searchQuery, setSearchQuery] = useState("");

  const { data: todos = [] } = useQuery<Todo[]>({
    queryKey: ["todos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("todos")
        .select("*")
        .order("due_date", { ascending: true })
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: users = [] } = useQuery<AppUser[]>({
    queryKey: ["users"],
    queryFn: async () => {
      const { data, error } = await supabase.from("app_users").select("*").order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: events = [] } = useQuery<CalendarEvent[]>({
    queryKey: ["events", currentDate],
    queryFn: async () => {
      const startDate = dayjs(currentDate).startOf("month").format("YYYY-MM-DD");
      const endDate = dayjs(currentDate).endOf("month").format("YYYY-MM-DD");

      const { data, error } = await supabase
        .from("calendar_events")
        .select("*")
        .gte("event_date", startDate)
        .lte("event_date", endDate)
        .order("event_date", { ascending: true });

      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: stats = { expense: { total: 0, pending: 0, approved: 0 }, utility: { total: 0, unpaidCount: 0 } } } = useQuery({
    queryKey: ["hubStats"],
    queryFn: async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("No session");

      const [expRes, utilRes] = await Promise.all([
        fetch("/api/expenses", { headers: { authorization: `Bearer ${token}` } }),
        fetch("/api/utility-bills", { headers: { authorization: `Bearer ${token}` } }),
      ]);

      let expense = { total: 0, pending: 0, approved: 0 };
      if (expRes.ok) {
        const expPayload = await expRes.json();
        if (expPayload.items) {
          expense = (expPayload.items as any[]).reduce(
            (acc, item) => {
              const amt = Number(item.amount) || 0;
              acc.total += amt;
              if (item.status === "unpaid") acc.pending += amt;
              if (item.status === "paid") acc.approved += amt;
              return acc;
            },
            { total: 0, pending: 0, approved: 0 }
          );
        }
      }

      let utility = { total: 0, unpaidCount: 0 };
      if (utilRes.ok) {
        const utilPayload = await utilRes.json();
        if (utilPayload.items) {
          utility = (utilPayload.items as any[]).reduce(
            (acc, item) => {
              const amt = Number(item.amount) || 0;
              acc.total += amt;
              if (!item.is_paid) acc.unpaidCount += 1;
              return acc;
            },
            { total: 0, unpaidCount: 0 }
          );
        }
      }

      return { expense, utility };
    },
  });

  const { data: displayName } = useQuery({
    queryKey: ["currentUserProfile"],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { data: profile } = await supabase
          .from("app_users")
          .select("name")
          .eq("id", session.user.id)
          .maybeSingle();
        return profile?.name || session.user.user_metadata?.name || session.user.email?.split("@")[0] || null;
      }
      return null;
    },
  });

  const summaryTodos = useMemo(() => {
    const active = todos.filter((todo) => todo.status !== "done");
    const done = todos.filter((todo) => todo.status === "done");

    const sortByPriority = (list: Todo[]) =>
      [...list].sort((a, b) => {
        const statusDiff = statusOrder[a.status] - statusOrder[b.status];
        if (statusDiff !== 0) return statusDiff;

        const aPriority = priorityOrder[a.priority] ?? 1;
        const bPriority = priorityOrder[b.priority] ?? 1;
        if (aPriority !== bPriority) return aPriority - bPriority;

        const aDue = a.due_date ? dayjs(a.due_date).valueOf() : Number.POSITIVE_INFINITY;
        const bDue = b.due_date ? dayjs(b.due_date).valueOf() : Number.POSITIVE_INFINITY;
        if (aDue !== bDue) return aDue - bDue;

        return dayjs(b.created_at).valueOf() - dayjs(a.created_at).valueOf();
      });

    return [...sortByPriority(active), ...sortByPriority(done)];
  }, [todos]);

  const eventsByDate = useMemo(() => {
    return events.reduce<Record<string, CalendarEvent[]>>((acc, event) => {
      const key = event.event_date;
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(event);
      return acc;
    }, {});
  }, [events]);

  const selectedEvents = useMemo(() => {
    return events.filter((event) => dayjs(event.event_date).isSame(currentDate, "day"));
  }, [events, currentDate]);

  return (
    <>
      <Container size="xl" p="md">
        <Stack gap="xl">
          <Box className="animate-fade-in-up">
            <Group justify="space-between" align="flex-end" mb="lg">
              <Box>
                <Title order={1} fw={800} style={{ fontSize: rem(28), letterSpacing: '-0.02em' }}>
                  안녕하세요, {displayName ? `${displayName}님` : '관리자님'} 👋
                </Title>
                <Text c="dimmed" size="sm" fw={500}>
                  오늘도 효율적인 업무를 도와드릴게요.
                </Text>
              </Box>
              <Stack gap={0} align="flex-end" className="desktop-only">
                <Text fw={700} size="md">
                  {dayjs().format("YYYY년 M월 D일")}
                </Text>
                <Text c="dimmed" size="xs">
                  {dayjs().format("dddd")}
                </Text>
              </Stack>
            </Group>

            <Paper
              p="md"
              radius="md"
              withBorder
              bg="var(--mantine-color-white)"
              shadow="xs"
            >
              <TextInput
                placeholder="찾으시는 업무나 일정이 있으신가요?"
                size="lg"
                variant="unstyled"
                leftSection={<IconSearch size={22} color="var(--mantine-color-gray-6)" />}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.currentTarget.value)}
                styles={{
                  input: {
                    fontSize: "18px",
                    fontWeight: 500,
                    paddingLeft: '48px'
                  },
                }}
              />
            </Paper>
          </Box>

          <Grid gutter="lg">
            <Grid.Col span={{ base: 12, md: 8 }}>
              <Paper
                className="app-surface"
                p="lg"
                radius="md"
              >
                <Group justify="space-between" mb="md">
                  <Group gap="xs">
                    <Title order={4}>캘린더</Title>
                    <Badge variant="light" color="gray" radius="md">
                      이번 달 {events.length}건
                    </Badge>
                  </Group>
                  <Group gap="xs">
                    <Text size="sm" c="dimmed" fw={600}>
                      {dayjs(currentDate).format("M월")}
                    </Text>
                    <Button
                      size="xs"
                      variant="light"
                      color="gray"
                      radius="md"
                      onClick={() => setCurrentDate(dayjs().format("YYYY-MM-DD"))}
                    >
                      오늘
                    </Button>
                  </Group>
                </Group>
                <Calendar
                  className="desktop-only"
                  size="md"
                  locale="ko"
                  firstDayOfWeek={0}
                  date={currentDate}
                  onDateChange={setCurrentDate}
                  getDayProps={(date) => {
                    const isSelected = dayjs(date).isSame(currentDate, "day");
                    return {
                      selected: isSelected,
                      onClick: () => setCurrentDate(date),
                      style: {
                        borderRadius: 'var(--mantine-radius-md)',
                      },
                    };
                  }}
                  withCellSpacing={false}
                  style={{ width: "100%" }}
                  styles={{
                    month: { width: "100%", tableLayout: "fixed" },
                    monthCell: { verticalAlign: "top", padding: '2px' },
                    day: {
                      width: "100%",
                      minHeight: 50,
                      height: "auto",
                      aspectRatio: "1/1",
                      alignItems: "flex-start",
                      justifyContent: "flex-start",
                      padding: "4px",
                      cursor: "pointer",
                      fontSize: rem(14),
                    },
                    weekday: { textAlign: "center", fontSize: rem(12), color: 'var(--mantine-color-gray-5)', fontWeight: 700 },
                  }}
                  renderDay={(date) => {
                    const key = dayjs(date).format("YYYY-MM-DD");
                    const dayEvents = eventsByDate[key] ?? [];
                    const visibleEvents = dayEvents.slice(0, 2);
                    const extraCount = dayEvents.length - visibleEvents.length;
                    return (
                      <div style={{ display: "flex", flexDirection: "column", gap: 2, width: "100%", height: "100%", position: 'relative' }}>
                        <Text size="sm" fw={700} ta="center" style={{ width: "100%", zIndex: 1 }}>
                          {dayjs(date).date()}
                        </Text>

                        {/* Desktop: Text View */}
                        <div className="desktop-only" style={{ width: "100%", display: "flex", flexDirection: "column", gap: 2 }}>
                          {visibleEvents.map((event) => (
                            <div
                              key={event.id}
                              style={{ display: "flex", alignItems: "center", gap: 4, width: "100%" }}
                            >
                              <span
                                style={{
                                  width: 6,
                                  height: 6,
                                  borderRadius: "50%",
                                  backgroundColor: `var(--mantine-color-${event.color ?? "gray"}-6)`,
                                  flexShrink: 0,
                                }}
                              />
                              <Text size="xs" lineClamp={1} style={{ flex: 1 }}>
                                {event.title}
                              </Text>
                            </div>
                          ))}
                          {extraCount > 0 && (
                            <Text size="xs" c="dimmed" fw={600} ta="center">
                              +{extraCount}
                            </Text>
                          )}
                        </div>

                        {/* Mobile: Dot View */}
                        <div className="mobile-only" style={{ display: "flex", justifyContent: "center", gap: 2, flexWrap: "wrap", width: '100%' }}>
                          {dayEvents.slice(0, 3).map((event) => (
                            <span
                              key={event.id}
                              style={{
                                width: 4,
                                height: 4,
                                borderRadius: "50%",
                                backgroundColor: `var(--mantine-color-${event.color ?? "gray"}-6)`,
                              }}
                            />
                          ))}
                          {dayEvents.length > 3 && (
                            <span style={{ width: 4, height: 4, borderRadius: "50%", backgroundColor: "var(--mantine-color-gray-4)" }} />
                          )}
                        </div>
                      </div>
                    );
                  }}
                />

                {/* Mobile: Full Schedule List for the Month */}
                <Box className="mobile-only" mt="xl">
                  <Divider label="이달의 전체 일정" labelPosition="center" mb="lg" />
                  <Stack gap="sm">
                    {events.length > 0 ? (
                      events.map((event) => (
                        <Paper key={event.id} p="sm" radius="md" withBorder style={{ borderLeft: `4px solid var(--mantine-color-${event.color ?? "gray"}-5)` }}>
                          <Group justify="space-between" align="flex-start" wrap="nowrap">
                            <Stack gap={2}>
                              <Text size="xs" c="dimmed" fw={700}>{dayjs(event.event_date).format('MM.DD (ddd)')}</Text>
                              <Text size="sm" fw={700}>{event.title}</Text>
                            </Stack>
                            <Badge variant="light" color={event.color ?? "gray"} size="xs">{event.color ? '중요' : '일반'}</Badge>
                          </Group>
                        </Paper>
                      ))
                    ) : (
                      <Text size="sm" c="dimmed" ta="center">이달의 일정이 없습니다.</Text>
                    )}
                  </Stack>
                </Box>
              </Paper>
            </Grid.Col>

            <Grid.Col span={{ base: 12, md: 4 }}>
              <Stack gap="lg">
                <Paper
                  className="app-surface"
                  p="lg"
                  radius="md"
                  style={{ cursor: "pointer", transition: "transform 0.1s, box-shadow 0.1s" }}
                  onClick={() => router.push("/todo")}
                >
                  <Group justify="space-between" mb="md">
                    <Group gap="xs">
                      <Title order={4}>To-Do</Title>
                      <IconCheckbox size={20} color="var(--mantine-color-gray-6)" />
                    </Group>
                    <Text size="sm" c="dimmed">
                      {todos.length}건
                    </Text>
                  </Group>
                  <ScrollArea h={300} offsetScrollbars>
                    <Stack gap={0}>
                      {summaryTodos.map((todo) => (
                        <Box key={todo.id} py={8} style={{ borderBottom: '1px solid var(--mantine-color-gray-1)' }}>
                          <Group justify="space-between" wrap="nowrap" gap="xs">
                            <Group gap="xs" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
                              <Box style={{ width: 4, height: 16, borderRadius: 2, backgroundColor: `var(--mantine-color-${priorityColor(todo.priority)}-5)` }} />
                              <Text size="sm" fw={600} lineClamp={1} style={{ flex: 1 }}>
                                {todo.title}
                              </Text>
                            </Group>
                            <Badge
                              color={statusColor(todo.status)}
                              variant="dot"
                              size="xs"
                              radius="md"
                              style={{ flexShrink: 0 }}
                            >
                              {statusLabels[todo.status]}
                            </Badge>
                          </Group>
                        </Box>
                      ))}
                    </Stack>
                  </ScrollArea>
                  {!summaryTodos.length && (
                    <Text size="sm" c="dimmed" mt="sm">
                      표시할 To-Do가 없습니다.
                    </Text>
                  )}
                </Paper>

                <Paper
                  className="app-surface"
                  p="lg"
                  radius="md"
                  withBorder
                  style={{ cursor: "pointer", transition: "transform 0.1s, box-shadow 0.1s" }}
                  onClick={() => router.push("/expenses")}
                >
                  <Group justify="space-between" mb="md">
                    <Group gap="xs">
                      <Title order={4}>경비 청구</Title>
                      <IconReceipt size={20} color="var(--mantine-color-indigo-6)" />
                    </Group>
                    <IconChartBar size={20} color="var(--mantine-color-gray-4)" />
                  </Group>
                  <Stack gap="xs">
                    <Paper withBorder p="md" radius="md" bg="gray.0" style={{ borderStyle: 'solid' }}>
                      <Group justify="space-between">
                        <Text size="xs" fw={800} c="dimmed" tt="uppercase">전체 청구액</Text>
                        <Text size="lg" fw={900}>{stats.expense.total.toLocaleString()}원</Text>
                      </Group>
                    </Paper>
                    <SimpleGrid cols={2} spacing="xs">
                      <Paper withBorder p="md" radius="md" bg="var(--mantine-color-white)">
                        <Stack gap={2}>
                          <Text size="xs" fw={800} c="orange.7">대기</Text>
                          <Text size="md" fw={900}>{stats.expense.pending.toLocaleString()}원</Text>
                        </Stack>
                      </Paper>
                      <Paper withBorder p="md" radius="md" bg="var(--mantine-color-white)">
                        <Stack gap={2}>
                          <Text size="xs" fw={800} c="indigo.7">지급</Text>
                          <Text size="md" fw={900}>{stats.expense.approved.toLocaleString()}원</Text>
                        </Stack>
                      </Paper>
                    </SimpleGrid>
                  </Stack>
                </Paper>

                <Paper
                  className="app-surface"
                  p="lg"
                  radius="md"
                  withBorder
                  style={{ cursor: "pointer", transition: "transform 0.1s, box-shadow 0.1s" }}
                  onClick={() => router.push("/utility-bills")}
                >
                  <Group justify="space-between" mb="md">
                    <Group gap="xs">
                      <Title order={4}>공과금 관리</Title>
                      <Box bg="indigo.6" style={{ borderRadius: '50%', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <IconChartBar size={14} color="white" />
                      </Box>
                    </Group>
                    <Badge variant="light" color={stats.utility.unpaidCount > 0 ? "orange" : "gray"} radius="md">
                      미납 {stats.utility.unpaidCount}건
                    </Badge>
                  </Group>
                  <Stack gap="xs">
                    <Paper withBorder p="md" radius="md" bg="gray.0" style={{ borderStyle: 'solid' }}>
                      <Group justify="space-between">
                        <Text size="xs" fw={800} c="dimmed" tt="uppercase">총 청구액</Text>
                        <Text size="lg" fw={900}>{stats.utility.total.toLocaleString()}원</Text>
                      </Group>
                    </Paper>
                  </Stack>
                </Paper>

                <Paper className="app-surface" p="lg" radius="md" withBorder>
                  <Group justify="space-between" mb="sm">
                    <Text fw={700} size="md">오늘의 일정</Text>
                    <Badge variant="light" color="gray" radius="md">
                      {selectedEvents.length}건
                    </Badge>
                  </Group>
                  {selectedEvents.length ? (
                    <Stack gap="md">
                      {selectedEvents.map((event) => (
                        <Paper
                          key={event.id}
                          withBorder
                          p="sm"
                          radius="md"
                          bg="gray.0"
                          style={{
                            borderLeft: `4px solid var(--mantine-color-${event.color ?? "gray"}-6)`,
                          }}
                        >
                          <Stack gap={4}>
                            <Text fw={700} size="sm">
                              {event.title}
                            </Text>
                            {event.note && (
                              <Text size="xs" c="dimmed" lineClamp={2}>
                                {event.note}
                              </Text>
                            )}
                          </Stack>
                        </Paper>
                      ))}
                    </Stack>
                  ) : (
                    <Text size="sm" c="dimmed">
                      일정이 없습니다.
                    </Text>
                  )}
                </Paper>
              </Stack>
            </Grid.Col>
          </Grid>
        </Stack>
      </Container>
    </>
  );
}

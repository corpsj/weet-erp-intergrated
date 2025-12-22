"use client";

import { Badge, Button, Container, Grid, Group, Paper, Stack, Table, Text, TextInput, Textarea, Title, SimpleGrid } from "@mantine/core";
import { Calendar, type DateStringValue } from "@mantine/dates";
import { notifications } from "@mantine/notifications";
import { IconCalendar as IconCalendarTabler, IconCheckbox, IconSearch, IconReceipt, IconChartBar } from "@tabler/icons-react";
import dayjs from "dayjs";
import { useCallback, useEffect, useMemo, useState } from "react";
import "dayjs/locale/ko";
import { supabase } from "@/lib/supabaseClient";
import type { AppUser, CalendarEvent, Todo, TodoPriority, TodoStatus } from "@/lib/types";
import { useRouter } from "next/navigation";

dayjs.locale("ko");

type ExpenseStats = {
  total: number;
  pending: number;
  approved: number;
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
  const [todos, setTodos] = useState<Todo[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [currentDate, setCurrentDate] = useState<DateStringValue>(dayjs().format("YYYY-MM-DD"));
  const [hoveredDate, setHoveredDate] = useState<DateStringValue | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [expenseStats, setExpenseStats] = useState<ExpenseStats>({ total: 0, pending: 0, approved: 0 });
  const [loadingExpenses, setLoadingExpenses] = useState(false);

  const loadExpenseStats = useCallback(async () => {
    setLoadingExpenses(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) return;

      const response = await fetch("/api/expenses", {
        headers: { authorization: `Bearer ${token}` },
      });
      const payload = await response.json();
      if (response.ok && payload.items) {
        const items = payload.items as any[];
        const stats = items.reduce(
          (acc, item) => {
            const amt = Number(item.amount) || 0;
            acc.total += amt;
            if (item.status === "submitted") acc.pending += amt;
            if (item.status === "approved" || item.status === "paid") acc.approved += amt;
            return acc;
          },
          { total: 0, pending: 0, approved: 0 }
        );
        setExpenseStats(stats);
      }
    } catch (error) {
      console.error("Failed to load expense stats:", error);
    } finally {
      setLoadingExpenses(false);
    }
  }, []);

  const loadTodos = useCallback(async () => {
    const { data, error } = await supabase
      .from("todos")
      .select("*")
      .order("due_date", { ascending: true })
      .order("created_at", { ascending: false });

    if (error) {
      notifications.show({ title: "To-Do 불러오기 실패", message: error.message, color: "red" });
      return;
    }

    setTodos(data ?? []);
  }, []);

  const loadUsers = useCallback(async () => {
    const { data, error } = await supabase.from("app_users").select("*").order("created_at");

    if (error) {
      notifications.show({ title: "사용자 불러오기 실패", message: error.message, color: "red" });
      return;
    }

    setUsers(data ?? []);
  }, []);

  const loadEvents = useCallback(async (targetDate: DateStringValue) => {
    const startDate = dayjs(targetDate).startOf("month").format("YYYY-MM-DD");
    const endDate = dayjs(targetDate).endOf("month").format("YYYY-MM-DD");

    const { data, error } = await supabase
      .from("calendar_events")
      .select("*")
      .gte("event_date", startDate)
      .lte("event_date", endDate)
      .order("event_date", { ascending: true });

    if (error) {
      notifications.show({ title: "일정 불러오기 실패", message: error.message, color: "red" });
      return;
    }

    setEvents(data ?? []);
  }, []);

  useEffect(() => {
    loadTodos();
    loadUsers();
    loadExpenseStats();
  }, [loadTodos, loadUsers, loadExpenseStats]);

  useEffect(() => {
    loadEvents(currentDate);
  }, [currentDate, loadEvents]);

  const userMap = useMemo(() => {
    return users.reduce<Record<string, AppUser>>((acc, user) => {
      acc[user.id] = user;
      return acc;
    }, {});
  }, [users]);

  const summaryTodos = useMemo(() => {
    const active = todos.filter((todo) => todo.status !== "done");
    const done = todos.filter((todo) => todo.status === "done");

    const sortByPriority = (list: Todo[]) =>
      [...list].sort((a, b) => {
        const statusDiff = statusOrder[a.status] - statusOrder[b.status];
        if (statusDiff !== 0) return statusDiff;

        const aDue = a.due_date ? dayjs(a.due_date).valueOf() : Number.POSITIVE_INFINITY;
        const bDue = b.due_date ? dayjs(b.due_date).valueOf() : Number.POSITIVE_INFINITY;
        if (aDue !== bDue) return aDue - bDue;

        return dayjs(b.created_at).valueOf() - dayjs(a.created_at).valueOf();
      });

    return [...sortByPriority(active), ...sortByPriority(done)].slice(0, 6);
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
          <Paper className="app-surface" p="md" radius="md">
            <Group gap="md">
              <TextInput
                placeholder="전역 검색 (업무, 일정, 계정...)"
                size="lg"
                leftSection={<IconSearch size={20} />}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.currentTarget.value)}
                style={{ flex: 1 }}
                styles={{
                  input: {
                    fontSize: "16px",
                    fontWeight: 500,
                    backgroundColor: "rgba(0,0,0,0.02)",
                    border: "none",
                  },
                }}
              />
              <Stack gap={0}>
                <Text fw={700} size="sm">
                  {dayjs().format("YYYY년 M월 D일")}
                </Text>
                <Text c="dimmed" size="xs">
                  {dayjs().format("dddd")}
                </Text>
              </Stack>
            </Group>
          </Paper>

          <Grid gutter="lg">
            <Grid.Col span={{ base: 12, md: 8 }}>
              <Paper
                className="app-surface"
                p="lg"
                radius="md"
                style={{ cursor: "pointer", transition: "transform 0.1s, box-shadow 0.1s" }}
                onClick={() => router.push("/calendar")}
              >
                <Group justify="space-between" mb="md">
                  <Group gap="xs">
                    <Title order={4}>캘린더</Title>
                    <Badge variant="light" color="gray">
                      이번 달 {events.length}건
                    </Badge>
                  </Group>
                  <Group gap="xs">
                    <Text size="sm" c="dimmed">
                      {dayjs(currentDate).format("YYYY년 M월")}
                    </Text>
                    <Button
                      size="xs"
                      variant="light"
                      color="gray"
                      onClick={() => setCurrentDate(dayjs().format("YYYY-MM-DD"))}
                    >
                      오늘
                    </Button>
                  </Group>
                </Group>
                <Calendar
                  size="md"
                  locale="ko"
                  firstDayOfWeek={0}
                  date={currentDate}
                  onDateChange={setCurrentDate}
                  getDayProps={(date) => {
                    const isSelected = dayjs(date).isSame(currentDate, "day");
                    const isHovered = hoveredDate ? dayjs(date).isSame(hoveredDate, "day") : false;

                    return {
                      selected: isSelected,
                      onClick: () => setCurrentDate(date),
                      onMouseEnter: () => setHoveredDate(date),
                      onMouseLeave: () => setHoveredDate(null),
                      style: {
                        backgroundColor: isSelected
                          ? "var(--mantine-color-gray-5)"
                          : isHovered
                            ? "var(--mantine-color-gray-2)"
                            : undefined,
                      },
                    };
                  }}
                  withCellSpacing={false}
                  style={{ width: "100%" }}
                  styles={{
                    month: { width: "100%", tableLayout: "fixed" },
                    monthCell: { verticalAlign: "top" },
                    day: {
                      width: "100%",
                      height: 96,
                      alignItems: "flex-start",
                      justifyContent: "flex-start",
                      padding: "6px",
                      cursor: "pointer",
                    },
                    weekday: { textAlign: "left" },
                  }}
                  renderDay={(date) => {
                    const key = dayjs(date).format("YYYY-MM-DD");
                    const dayEvents = eventsByDate[key] ?? [];
                    const visibleEvents = dayEvents.slice(0, 2);
                    const extraCount = dayEvents.length - visibleEvents.length;
                    return (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, width: "100%" }}>
                        <Text size="sm" fw={700}>
                          {dayjs(date).date()}
                        </Text>
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
                            <Text size="sm" lineClamp={1} style={{ flex: 1 }}>
                              {event.title}
                            </Text>
                          </div>
                        ))}
                        {extraCount > 0 && (
                          <Text size="sm" c="dimmed" fw={600}>
                            +{extraCount}건
                          </Text>
                        )}
                      </div>
                    );
                  }}
                />
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
                  <Table verticalSpacing="sm" highlightOnHover>
                    <Table.Tbody>
                      {summaryTodos.slice(0, 4).map((item) => (
                        <Table.Tr key={item.id}>
                          <Table.Td>
                            <Stack gap={2}>
                              <Text size="sm" fw={600} lineClamp={1}>
                                {item.title}
                              </Text>
                              <Group gap={4}>
                                <Badge color={statusColor(item.status)} variant="light" size="xs">
                                  {statusLabels[item.status]}
                                </Badge>
                                <Text size="xs" c="dimmed">
                                  {item.due_date ? dayjs(item.due_date).format("MM/DD") : "-"}
                                </Text>
                              </Group>
                            </Stack>
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
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
                  style={{ cursor: "pointer", transition: "transform 0.1s, box-shadow 0.1s" }}
                  onClick={() => router.push("/expenses")}
                >
                  <Group justify="space-between" mb="md">
                    <Group gap="xs">
                      <Title order={4}>경비 청구</Title>
                      <IconReceipt size={20} color="var(--mantine-color-gray-6)" />
                    </Group>
                    <IconChartBar size={20} color="var(--mantine-color-gray-4)" />
                  </Group>
                  <Stack gap="xs">
                    <Group justify="space-between">
                      <Text size="sm" c="dimmed">총 청구액</Text>
                      <Text size="sm" fw={700}>{expenseStats.total.toLocaleString()}원</Text>
                    </Group>
                    <Group justify="space-between">
                      <Text size="sm" c="dimmed">승인 대기</Text>
                      <Text size="sm" fw={700} c="yellow.7">{expenseStats.pending.toLocaleString()}원</Text>
                    </Group>
                    <Group justify="space-between">
                      <Text size="sm" c="dimmed">승인/지급 완료</Text>
                      <Text size="sm" fw={700} c="green.7">{expenseStats.approved.toLocaleString()}원</Text>
                    </Group>
                  </Stack>
                </Paper>

                <Paper className="app-surface" p="lg" radius="md">
                  <Group justify="space-between" mb="sm">
                    <Text fw={700} size="md">오늘의 일정</Text>
                    <Badge variant="light" color="gray">
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
                          style={{
                            borderLeft: `4px solid var(--mantine-color-${event.color ?? "gray"}-6)`,
                            backgroundColor: "rgba(0,0,0,0.01)",
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

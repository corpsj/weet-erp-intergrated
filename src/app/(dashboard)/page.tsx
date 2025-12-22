"use client";

import { Badge, Box, Button, Container, Grid, Group, Paper, Stack, Table, Text, Title, ThemeIcon } from "@mantine/core";
import { Calendar, type DateStringValue } from "@mantine/dates";
import { notifications } from "@mantine/notifications";
import { IconChecklist, IconCalendarEvent, IconUsers, IconRocket, IconChevronRight } from "@tabler/icons-react";
import dayjs from "dayjs";
import { useCallback, useEffect, useMemo, useState } from "react";
import "dayjs/locale/ko";
import { supabase } from "@/lib/supabaseClient";
import type { AppUser, CalendarEvent, Todo, TodoPriority, TodoStatus } from "@/lib/types";

dayjs.locale("ko");

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
  if (status === "done") return "teal";
  if (status === "in_progress") return "indigo";
  return "slate";
};

const priorityColor = (priority: TodoPriority) => {
  if (priority === "high") return "red";
  if (priority === "medium") return "amber";
  return "slate";
};

export default function HubPage() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [currentDate, setCurrentDate] = useState<DateStringValue>(dayjs().format("YYYY-MM-DD"));
  const [hoveredDate, setHoveredDate] = useState<DateStringValue | null>(null);

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
  }, [loadTodos, loadUsers]);

  useEffect(() => {
    loadEvents(currentDate);
  }, [currentDate, loadEvents]);

  const userMap = useMemo(() => {
    return users.reduce<Record<string, AppUser>>((acc, user) => {
      acc[user.id] = user;
      return acc;
    }, {});
  }, [users]);

  const stats = useMemo(() => {
    const activeTodos = todos.filter((t) => t.status !== "done").length;
    const upcomingEvents = events.filter((e) => dayjs(e.event_date).isAfter(dayjs().subtract(1, "day"))).length;
    return [
      { label: "활성 To-Do", value: activeTodos, icon: IconChecklist, color: "indigo" },
      { label: "다가오는 일정", value: upcomingEvents, icon: IconCalendarEvent, color: "cyan" },
      { label: "함께하는 멤버", value: users.length, icon: IconUsers, color: "violet" },
      { label: "진행률", value: `${Math.round((todos.filter(t => t.status === 'done').length / (todos.length || 1)) * 100)}%`, icon: IconRocket, color: "orange" },
    ];
  }, [todos, events, users]);

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

    return [...sortByPriority(active), ...sortByPriority(done)].slice(0, 5);
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
    <Container size="xl" p="md" className="animate-fade-in-up">
      <Stack gap="xl">
        <Group justify="space-between" align="flex-end">
          <Box>
            <Title order={1} className="brand-title" size="h2" mb={4}>허브 대시보드</Title>
            <Text c="dimmed" size="sm" fw={500}>
              {dayjs().format("YYYY년 M월 D일 dddd")} · 반가워요!
            </Text>
          </Box>
          <Button variant="light" size="sm" rightSection={<IconChevronRight size={14} />}>
            전체 리포트 보기
          </Button>
        </Group>

        <Grid gutter="md">
          {stats.map((stat, idx) => (
            <Grid.Col key={idx} span={{ base: 6, sm: 3 }}>
              <Paper className="app-surface" p="lg" radius="lg">
                <Group justify="space-between" align="flex-start" mb="xs">
                  <ThemeIcon variant="light" color={stat.color} size="lg" radius="md">
                    <stat.icon size={20} stroke={2} />
                  </ThemeIcon>
                  <Text size="xs" c="dimmed" fw={600} tt="uppercase">{stat.label}</Text>
                </Group>
                <Text size="xl" fw={800}>{stat.value}</Text>
              </Paper>
            </Grid.Col>
          ))}
        </Grid>

        <Grid gutter="lg">
          <Grid.Col span={{ base: 12, lg: 5 }}>
            <Paper className="app-surface" p="xl" radius="lg" h="100%">
              <Group justify="space-between" mb="xl">
                <Title order={4}>주요 업무 (To-Do)</Title>
                <Badge variant="dot" color="indigo" size="lg">
                  전체 {todos.length}건
                </Badge>
              </Group>
              <Stack gap="sm">
                {summaryTodos.map((item) => (
                  <Paper key={item.id} withBorder p="md" radius="md"
                    className="glass-card"
                    style={{ borderLeft: `4px solid var(--mantine-color-${statusColor(item.status)}-5)` }}>
                    <Group justify="space-between" wrap="nowrap">
                      <Stack gap={4} style={{ flex: 1 }}>
                        <Text size="sm" fw={700} lineClamp={1}>{item.title}</Text>
                        <Group gap="xs">
                          <Badge color={priorityColor(item.priority)} variant="light" size="xs">
                            {priorityLabels[item.priority]}
                          </Badge>
                          <Text size="xs" c="dimmed">
                            {item.due_date ? dayjs(item.due_date).format("MM/DD 마감") : "기한 없음"}
                          </Text>
                        </Group>
                      </Stack>
                      <Badge color={statusColor(item.status)} variant="filled" size="sm">
                        {statusLabels[item.status]}
                      </Badge>
                    </Group>
                  </Paper>
                ))}
                {!summaryTodos.length && (
                  <Text size="sm" c="dimmed" ta="center" py="xl">
                    현재 진행 중인 업무가 없습니다.
                  </Text>
                )}
                {todos.length > 5 && (
                  <Button variant="subtle" fullWidth mt="xs">전체 보기</Button>
                )}
              </Stack>
            </Paper>
          </Grid.Col>

          <Grid.Col span={{ base: 12, lg: 7 }}>
            <Paper className="app-surface" p="xl" radius="lg">
              <Group justify="space-between" mb="xl">
                <Group gap="xs">
                  <Title order={4}>캘린더 요약</Title>
                  <Badge variant="light" color="indigo">
                    이번 달 {events.length}건
                  </Badge>
                </Group>
                <Group gap="xs">
                  <Text size="sm" fw={600} c="indigo">
                    {dayjs(currentDate).format("M월")}
                  </Text>
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    onClick={() => setCurrentDate(dayjs().format("YYYY-MM-DD"))}
                  >
                    오늘
                  </Button>
                </Group>
              </Group>

              <Box mb="xl">
                <Calendar
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
                    };
                  }}
                  withCellSpacing={false}
                  style={{ width: "100%" }}
                  styles={{
                    month: { width: "100%", tableLayout: "fixed" },
                    day: {
                      width: "100%",
                      height: 80,
                      alignItems: "flex-start",
                      justifyContent: "flex-start",
                      padding: "8px",
                      borderRadius: "12px",
                      margin: "2px",
                      transition: "all 0.2s ease",
                    },
                  }}
                  renderDay={(date) => {
                    const key = dayjs(date).format("YYYY-MM-DD");
                    const dayEvents = eventsByDate[key] ?? [];
                    return (
                      <Stack gap={2} w="100%">
                        <Text size="xs" fw={700} c={dayjs(date).day() === 0 ? 'red' : dayjs(date).day() === 6 ? 'blue' : undefined}>
                          {dayjs(date).date()}
                        </Text>
                        <Group gap={2} wrap="nowrap">
                          {dayEvents.slice(0, 3).map((event) => (
                            <Box
                              key={event.id}
                              w={6}
                              h={6}
                              style={{
                                borderRadius: "50%",
                                backgroundColor: `var(--mantine-color-${event.color ?? "indigo"}-6)`,
                                boxShadow: `0 0 4px var(--mantine-color-${event.color ?? "indigo"}-3)`
                              }}
                            />
                          ))}
                          {dayEvents.length > 3 && (
                            <Text size="8px" fw={700} c="dimmed" lh={1}>+</Text>
                          )}
                        </Group>
                      </Stack>
                    );
                  }}
                />
              </Box>

              <Stack gap="sm">
                <Group justify="space-between">
                  <Text size="sm" fw={700}>{dayjs(currentDate).format("M월 D일")} 일정</Text>
                  <Badge variant="light" size="sm">{selectedEvents.length}건</Badge>
                </Group>
                {selectedEvents.length ? (
                  <Stack gap="xs">
                    {selectedEvents.map((event) => (
                      <Paper key={event.id} withBorder p="sm" radius="md" className="glass-card">
                        <Group gap="sm">
                          <Box w={4} h={16} style={{ borderRadius: '4px', backgroundColor: `var(--mantine-color-${event.color ?? "indigo"}-6)` }} />
                          <Box style={{ flex: 1 }}>
                            <Text size="sm" fw={600}>{event.title}</Text>
                            {event.note && <Text size="xs" c="dimmed" lineClamp={1}>{event.note}</Text>}
                          </Box>
                        </Group>
                      </Paper>
                    ))}
                  </Stack>
                ) : (
                  <Paper withBorder p="md" radius="md" style={{ borderStyle: 'dashed', backgroundColor: 'transparent' }}>
                    <Text size="xs" c="dimmed" ta="center">지정된 일정이 없습니다.</Text>
                  </Paper>
                )}
              </Stack>
            </Paper>
          </Grid.Col>
        </Grid>
      </Stack>
    </Container>
  );
}


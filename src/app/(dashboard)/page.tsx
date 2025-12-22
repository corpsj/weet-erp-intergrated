"use client";

import { Badge, Button, Container, Grid, Group, Paper, Stack, Table, Text, Title } from "@mantine/core";
import { Calendar, type DateStringValue } from "@mantine/dates";
import { notifications } from "@mantine/notifications";
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
    <Container size="xl" p="md">
      <Group justify="space-between" mb="lg">
        <div>
          <Title order={2}>허브</Title>
          <Text c="dimmed" size="sm">
            {dayjs().format("YYYY년 M월 D일 dddd")}
          </Text>
        </div>
      </Group>

      <Grid gutter="lg">
        <Grid.Col span={{ base: 12, md: 5 }}>
          <Paper className="app-surface" p="lg" radius="md" h="100%">
            <Group justify="space-between" mb="md">
              <Title order={4}>To-Do</Title>
              <Text size="sm" c="dimmed">
                {todos.length}건
              </Text>
            </Group>
            <Table verticalSpacing="sm" highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>상태</Table.Th>
                  <Table.Th>업무</Table.Th>
                  <Table.Th>담당</Table.Th>
                  <Table.Th>마감</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {summaryTodos.map((item) => (
                  <Table.Tr key={item.id}>
                    <Table.Td>
                      <Badge color={statusColor(item.status)} variant="light">
                        {statusLabels[item.status]}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Stack gap={2}>
                        <Text size="sm" fw={600} lineClamp={2}>
                          {item.title}
                        </Text>
                        <Badge color={priorityColor(item.priority)} variant="light" size="sm">
                          {priorityLabels[item.priority]}
                        </Badge>
                      </Stack>
                    </Table.Td>
                    <Table.Td>
                      {item.assignee_id ? userMap[item.assignee_id]?.name ?? "누구나" : "누구나"}
                    </Table.Td>
                    <Table.Td>{item.due_date ? dayjs(item.due_date).format("MM/DD") : "-"}</Table.Td>
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
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 7 }}>
          <Paper className="app-surface" p="lg" radius="md">
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
            <Stack gap="xs" mt="lg">
              <Group justify="space-between">
                <Text fw={600}>선택한 날짜 일정</Text>
                <Badge variant="light" color="gray">
                  {selectedEvents.length}건
                </Badge>
              </Group>
              {selectedEvents.length ? (
                selectedEvents.map((event) => (
                  <Paper key={event.id} withBorder p="sm" radius="md">
                    <Badge color={event.color ?? "gray"} variant="light" size="sm">
                      {event.title}
                    </Badge>
                    {event.note && (
                      <Text size="sm" c="dimmed" mt={6}>
                        {event.note}
                      </Text>
                    )}
                  </Paper>
                ))
              ) : (
                <Text size="sm" c="dimmed">
                  선택한 날짜에 일정이 없습니다.
                </Text>
              )}
            </Stack>
          </Paper>
        </Grid.Col>
      </Grid>
    </Container>
  );
}

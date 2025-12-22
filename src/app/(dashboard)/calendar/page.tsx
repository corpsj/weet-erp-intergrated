"use client";

import {
  ActionIcon,
  Badge,
  Button,
  ColorSwatch,
  Container,
  Group,
  Paper,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { Calendar, type DateStringValue } from "@mantine/dates";
import { notifications } from "@mantine/notifications";
import { IconPencil, IconTrash } from "@tabler/icons-react";
import dayjs from "dayjs";
import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react";
import "dayjs/locale/ko";
import { supabase } from "@/lib/supabaseClient";
import type { CalendarEvent } from "@/lib/types";

dayjs.locale("ko");

const colorOptions = [
  { value: "yellow", label: "노랑" },
  { value: "blue", label: "파랑" },
  { value: "red", label: "빨강" },
];

const emptyForm = {
  title: "",
  event_date: null as DateStringValue | null,
  color: "gray",
  note: "",
};

const resolveInputValue = (
  payload: ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | string | null | undefined
) => {
  if (typeof payload === "string") return payload;
  return payload?.currentTarget?.value ?? "";
};

const colorSwatch = (value: string) => {
  if (value === "yellow") return "#FEBD16";
  return `var(--mantine-color-${value}-6)`;
};

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState<DateStringValue>(dayjs().format("YYYY-MM-DD"));
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [quickTitle, setQuickTitle] = useState("");
  const [quickNote, setQuickNote] = useState("");
  const [quickColor, setQuickColor] = useState("gray");
  const [quickSaving, setQuickSaving] = useState(false);
  const [hoveredDate, setHoveredDate] = useState<DateStringValue | null>(null);

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
    loadEvents(currentDate);
  }, [currentDate, loadEvents]);

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

  const openEdit = (event: CalendarEvent) => {
    setEditing(event);
    setForm({
      title: event.title ?? "",
      event_date: event.event_date,
      color: event.color ?? "gray",
      note: event.note ?? "",
    });
  };

  const handleQuickAdd = async () => {
    const title = quickTitle.trim();
    if (!title) {
      notifications.show({ title: "필수 입력", message: "일정 제목을 입력해주세요.", color: "red" });
      return;
    }

    setQuickSaving(true);

    const payload = {
      title,
      event_date: currentDate,
      color: quickColor || "gray",
      note: quickNote.trim() || null,
    };

    const { error } = await supabase.from("calendar_events").insert(payload);
    setQuickSaving(false);

    if (error) {
      notifications.show({ title: "추가 실패", message: error.message, color: "red" });
      return;
    }

    notifications.show({ title: "추가 완료", message: "일정이 추가되었습니다.", color: "gray" });
    setQuickTitle("");
    setQuickNote("");
    await loadEvents(currentDate);
  };


  const handleSave = async () => {
    const title = form.title.trim();
    if (!title) {
      notifications.show({ title: "필수 입력", message: "일정 제목을 입력해주세요.", color: "red" });
      return;
    }

    if (!form.event_date) {
      notifications.show({ title: "필수 입력", message: "날짜를 선택해주세요.", color: "red" });
      return;
    }

    setSaving(true);

    const payload = {
      title,
      event_date: form.event_date,
      color: form.color || "gray",
      note: form.note.trim() || null,
    };

    const { error } = editing
      ? await supabase.from("calendar_events").update(payload).eq("id", editing.id)
      : await supabase.from("calendar_events").insert(payload);

    setSaving(false);

    if (error) {
      notifications.show({ title: "저장 실패", message: error.message, color: "red" });
      return;
    }

    notifications.show({ title: "저장 완료", message: "일정이 저장되었습니다.", color: "gray" });
    if (form.event_date) setCurrentDate(form.event_date);
    await loadEvents(form.event_date);
  };

  const handleDelete = async (event: CalendarEvent) => {
    const confirmed = window.confirm(`"${event.title}" 일정을 삭제할까요?`);
    if (!confirmed) return;

    const { error } = await supabase.from("calendar_events").delete().eq("id", event.id);

    if (error) {
      notifications.show({ title: "삭제 실패", message: error.message, color: "red" });
      return;
    }

    notifications.show({ title: "삭제 완료", message: "일정이 삭제되었습니다.", color: "gray" });
    await loadEvents(currentDate);
  };

  return (
    <Container size="xl" p="md">
      <Group justify="space-between" mb="lg">
        <div>
          <Title order={2}>캘린더</Title>
          <Text c="dimmed" size="sm">
            {dayjs(currentDate).format("YYYY년 M월")}
          </Text>
        </div>
      </Group>

      <Paper className="app-surface" p="lg" radius="md">
        <Group align="flex-start" wrap="nowrap">
          <Calendar
            size="lg"
            date={currentDate}
            onDateChange={setCurrentDate}
            locale="ko"
            firstDayOfWeek={0}
            withCellSpacing={false}
            style={{ width: "100%", flex: 1, minWidth: 0 }}
            styles={{
              month: { width: "100%", tableLayout: "fixed" },
              monthRow: { height: "auto" },
              monthCell: { verticalAlign: "top" },
              day: {
                width: "100%",
                height: 120,
                alignItems: "flex-start",
                justifyContent: "flex-start",
                padding: "8px",
                overflow: "hidden",
                cursor: "pointer",
              },
              weekday: { textAlign: "left" },
            }}
            getDayProps={(date) => {
              const isSelected = dayjs(date).isSame(currentDate, "day");
              const isHovered = hoveredDate ? dayjs(date).isSame(hoveredDate, "day") : false;

              return {
                selected: isSelected,
                onClick: () => {
                  setCurrentDate(dayjs(date).format("YYYY-MM-DD"));
                },
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
            renderDay={(date) => {
              const key = dayjs(date).format("YYYY-MM-DD");
              const dayEvents = eventsByDate[key] ?? [];
              const visibleEvents = dayEvents.slice(0, 3);
              const extraCount = dayEvents.length - visibleEvents.length;

              return (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%" }}>
                  <Text size="xs" fw={600}>
                    {dayjs(date).date()}
                  </Text>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, width: "100%" }}>
                    {visibleEvents.map((event) => (
                      <div
                        key={event.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          width: "100%",
                          textAlign: "left",
                          cursor: "default",
                        }}
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
                        <Text size="xs" style={{ flex: 1 }} lineClamp={1}>
                          {event.title}
                        </Text>
                      </div>
                    ))}
                    {extraCount > 0 && (
                      <Text size="xs" c="dimmed">
                        +{extraCount}건 더보기
                      </Text>
                    )}
                  </div>
                </div>
              );
            }}
          />

          <Paper withBorder p="md" radius="md" style={{ width: 360, flexShrink: 0 }}>
            <Stack gap="sm">
              <Group justify="space-between">
                <div>
                  <Title order={4}>{dayjs(currentDate).format("YYYY년 MM월 DD일 dddd")}</Title>
                  <Text size="xs" c="dimmed">
                    선택 날짜 일정
                  </Text>
                </div>
              </Group>
              <Group align="flex-end" wrap="wrap">
                <TextInput
                  label="빠른 추가"
                  placeholder="일정 제목을 입력하세요"
                  value={quickTitle}
                  onChange={(event) => setQuickTitle(resolveInputValue(event))}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handleQuickAdd();
                    }
                  }}
                  style={{ flex: 1, minWidth: 180 }}
                />
                <Stack gap={4}>
                  <Text size="xs" fw={600}>
                    색상
                  </Text>
                  <Group gap="xs">
                    {colorOptions.map((option) => (
                      <ActionIcon
                        key={option.value}
                        variant={quickColor === option.value ? "filled" : "light"}
                        color={option.value}
                        onClick={() => setQuickColor(option.value)}
                        aria-label={`${option.label} 선택`}
                      >
                        <ColorSwatch color={colorSwatch(option.value)} size={18} />
                      </ActionIcon>
                    ))}
                  </Group>
                </Stack>
                <TextInput
                  label="메모"
                  placeholder="간단 메모"
                  value={quickNote}
                  onChange={(event) => setQuickNote(resolveInputValue(event))}
                  style={{ flex: 1, minWidth: 160 }}
                />
                <Button color="gray" onClick={handleQuickAdd} loading={quickSaving}>
                  추가
                </Button>
              </Group>
              {editing && (
                <Paper withBorder p="sm" radius="md">
                  <Stack gap="xs">
                    <Group justify="space-between">
                      <Text size="sm" fw={600}>
                        일정 수정
                      </Text>
                      <Button
                        size="xs"
                        variant="light"
                        color="gray"
                        onClick={() => setEditing(null)}
                      >
                        닫기
                      </Button>
                    </Group>
                    <TextInput
                      label="제목"
                      value={form.title}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, title: resolveInputValue(event) }))
                      }
                    />
                    <Stack gap={4}>
                      <Text size="xs" fw={600}>
                        색상
                      </Text>
                      <Group gap="xs">
                        {colorOptions.map((option) => (
                          <ActionIcon
                            key={option.value}
                            variant={form.color === option.value ? "filled" : "light"}
                            color={option.value}
                            onClick={() => setForm((prev) => ({ ...prev, color: option.value }))}
                            aria-label={`${option.label} 선택`}
                          >
                            <ColorSwatch color={colorSwatch(option.value)} size={18} />
                          </ActionIcon>
                        ))}
                      </Group>
                    </Stack>
                    <TextInput
                      label="메모"
                      placeholder="간단 메모"
                      value={form.note}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, note: resolveInputValue(event) }))
                      }
                    />
                    <Button color="gray" onClick={handleSave} loading={saving}>
                      저장
                    </Button>
                  </Stack>
                </Paper>
              )}
              <Badge variant="light" color="gray">
                {selectedEvents.length}건
              </Badge>
              {selectedEvents.length ? (
                selectedEvents.map((event) => (
                  <Paper key={event.id} withBorder p="sm" radius="md">
                    <Group justify="space-between" align="flex-start">
                      <Badge color={event.color ?? "gray"} variant="light" size="sm">
                        {event.title}
                      </Badge>
                      <Group gap={4}>
                        <ActionIcon
                          variant="subtle"
                          color="gray"
                          onClick={() => openEdit(event)}
                          aria-label="일정 수정"
                        >
                          <IconPencil size={16} />
                        </ActionIcon>
                        <ActionIcon
                          variant="subtle"
                          color="red"
                          onClick={() => handleDelete(event)}
                          aria-label="일정 삭제"
                        >
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Group>
                    </Group>
                    {event.note && (
                      <Text size="xs" c="dimmed" mt={6}>
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
        </Group>
      </Paper>

    </Container>
  );
}


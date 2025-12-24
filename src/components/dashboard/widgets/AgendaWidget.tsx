"use client";

import { Paper, Title, Text, Group, Stack, Timeline, ThemeIcon, Badge, Button, Center, Skeleton } from "@mantine/core";
import { IconCalendarEvent, IconClock } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import dayjs from "dayjs";
import type { CalendarEvent } from "@/lib/types"; // Ensure type exists

export function AgendaWidget() {
    const { data: events = [], isLoading } = useQuery<CalendarEvent[]>({
        queryKey: ["agendaEvents"],
        queryFn: async () => {
            const today = dayjs().format("YYYY-MM-DD");
            // Fetch only future or today's events, limit 4
            const { data, error } = await supabase
                .from("calendar_events")
                .select("*")
                .gte("event_date", today)
                .order("event_date", { ascending: true })
                .limit(4);

            if (error) throw error;
            return data || [];
        }
    });

    if (isLoading) return <Skeleton height={300} radius="lg" />;

    return (
        <Paper p="lg" radius="lg" withBorder h="100%">
            <Group justify="space-between" mb="lg">
                <Title order={4} fw={700}>Agenda</Title>
                <Button variant="light" size="xs" color="gray" radius="md">전체보기</Button>
            </Group>

            {events.length === 0 ? (
                <Center h={200}>
                    <Stack align="center" gap="xs">
                        <ThemeIcon color="gray" variant="light" size="xl" radius="md">
                            <IconCalendarEvent size={24} />
                        </ThemeIcon>
                        <Text c="dimmed" size="sm">다가오는 일정이 없습니다.</Text>
                    </Stack>
                </Center>
            ) : (
                <Timeline active={0} bulletSize={24} lineWidth={2}>
                    {events.map((event, index) => {
                        const dDay = dayjs(event.event_date).diff(dayjs().startOf('day'), 'day');
                        const dDayText = dDay === 0 ? "Today" : `D-${dDay}`;
                        const badgeColor = dDay === 0 ? "red" : dDay <= 3 ? "orange" : "blue";

                        return (
                            <Timeline.Item
                                key={event.id}
                                bullet={
                                    <ThemeIcon size={22} color="indigo" radius="xl">
                                        <IconCalendarEvent size={12} />
                                    </ThemeIcon>
                                }
                                title={
                                    <Group justify="space-between">
                                        <Text size="sm" fw={600} lineClamp={1}>{event.title}</Text>
                                        <Badge size="xs" variant="light" color={badgeColor}>{dDayText}</Badge>
                                    </Group>
                                }
                            >
                                <Text c="dimmed" size="xs" mt={4}>
                                    {dayjs(event.event_date).format("M월 D일 (ddd)")}
                                    {event.start_time && ` • ${event.start_time}`}
                                </Text>
                            </Timeline.Item>
                        );
                    })}
                </Timeline>
            )}
        </Paper>
    );
}

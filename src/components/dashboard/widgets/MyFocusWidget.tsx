"use client";

import { Paper, Title, Text, Group, Stack, RingProgress, Center, Button, TextInput, Box, Checkbox, Badge } from "@mantine/core";
import { IconPlus, IconCheck } from "@tabler/icons-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import dayjs from "dayjs";
import { useState } from "react";
import type { Todo } from "@/lib/types";

export function MyFocusWidget() {
    const queryClient = useQueryClient();
    const [inputValue, setInputValue] = useState("");

    const { data: todos = [] } = useQuery<Todo[]>({
        queryKey: ["myFocusTodos"],
        queryFn: async () => {
            const today = dayjs().format("YYYY-MM-DD");
            const { data, error } = await supabase
                .from("todos")
                .select("*")
                .or(`due_date.eq.${today},status.eq.in_progress`) // Fetch item due today OR in progress
                .order("due_date", { ascending: true })
                .limit(5); // focus on top 5
            if (error) throw error;
            return data || [];
        },
    });

    const addMutation = useMutation({
        mutationFn: async (title: string) => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("No user");

            // Get max order
            const { data: maxOrderData } = await supabase.from('todos').select('sort_order').order('sort_order', { ascending: false }).limit(1).single();
            const nextOrder = (maxOrderData?.sort_order || 0) + 1000;

            const { data, error } = await supabase.from("todos").insert({
                title,
                status: "todo",
                user_id: user.id,
                sort_order: nextOrder,
                due_date: dayjs().format("YYYY-MM-DD"), // Default to today for focus
            }).select().single();
            if (error) throw error;
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["myFocusTodos"] });
            queryClient.invalidateQueries({ queryKey: ["todos"] });
            setInputValue("");
        },
    });

    const toggleMutation = useMutation({
        mutationFn: async ({ id, status }: { id: string; status: string }) => {
            const { error } = await supabase.from("todos").update({ status }).eq("id", id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["myFocusTodos"] });
            queryClient.invalidateQueries({ queryKey: ["todos"] });
        }
    });

    // Calculate stats
    const total = 5; // Goal
    const completed = todos.filter(t => t.status === 'done').length; // Logic flaw: query filters out 'done' usually? 
    // Actually our query above: due_date=today OR status=in_progress. It might not fetch 'done' ones if they are done.
    // Ideally Focus Widget shows "Remaining".
    // Let's change query: fetch ALL due today, regardless of status.
    // Re-do query logic slightly:

    // Improved query logic in UI component for simplicity:
    // We want to show "Today's Tasks".
    // 3 displayed items. Ring is % of today's tasks done.

    const todayTodosQuery = useQuery({
        queryKey: ["todayTodos"],
        queryFn: async () => {
            const today = dayjs().format("YYYY-MM-DD");
            const { data } = await supabase.from("todos").select("*").eq("due_date", today);
            return data || [];
        }
    });

    const todayTodos = todayTodosQuery.data || [];
    const doneCount = todayTodos.filter(t => t.status === "done").length;
    const totalToday = todayTodos.length;
    const progress = totalToday > 0 ? (doneCount / totalToday) * 100 : 0;

    // Items to show: Pending ones first
    const displayItems = todayTodos.filter(t => t.status !== "done").slice(0, 3);
    // If all done, show done ones?
    const finalItems = displayItems.length > 0 ? displayItems : todayTodos.slice(0, 3);


    return (
        <Paper p="lg" radius="lg" withBorder h="100%" style={{ display: 'flex', flexDirection: 'column' }}>
            <Group justify="space-between" mb="md">
                <Title order={4} fw={700}>My Focus</Title>
                <Badge variant="light" color="blue">{dayjs().format("M월 D일")}</Badge>
            </Group>

            <Group align="center" mb="xl">
                <RingProgress
                    size={80}
                    roundCaps
                    thickness={8}
                    sections={[{ value: progress, color: 'blue' }]}
                    label={
                        <Center>
                            <Text c="blue" fw={700} size="xs">
                                {Math.round(progress)}%
                            </Text>
                        </Center>
                    }
                />
                <Box style={{ flex: 1 }}>
                    <Text size="sm" c="dimmed">오늘 완료한 업무</Text>
                    <Title order={3} fw={800}>
                        {doneCount} <Text span size="sm" c="dimmed" fw={500}>/ {totalToday}</Text>
                    </Title>
                </Box>
            </Group>

            <Stack gap="sm" style={{ flex: 1 }}>
                {finalItems.length === 0 && (
                    <Center h={100} bg="gray.0" style={{ borderRadius: 8 }}>
                        <Text size="sm" c="dimmed">오늘 예정된 업무가 없습니다.</Text>
                    </Center>
                )}
                {finalItems.map((todo) => (
                    <Paper key={todo.id} withBorder p="xs" radius="md" bg="gray.0">
                        <Group>
                            <Checkbox
                                checked={todo.status === "done"}
                                onChange={() => toggleMutation.mutate({ id: todo.id, status: todo.status === "done" ? "todo" : "done" })}
                                color="blue"
                                radius="xl"
                            />
                            <Text size="sm" fw={500} td={todo.status === "done" ? "line-through" : undefined} c={todo.status === "done" ? "dimmed" : "dark"}>
                                {todo.title}
                            </Text>
                        </Group>
                    </Paper>
                ))}
            </Stack>

            <Box mt="lg">
                <TextInput
                    placeholder="새로운 업무 빠른 추가..."
                    size="sm"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.currentTarget.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && inputValue.trim()) {
                            addMutation.mutate(inputValue);
                        }
                    }}
                    rightSection={
                        <ActionIcon size="sm" variant="subtle" onClick={() => inputValue.trim() && addMutation.mutate(inputValue)}>
                            <IconPlus size={14} />
                        </ActionIcon>
                    }
                />
            </Box>
        </Paper>
    );
}

// Helper to fix TS error for ActionIcon import if missing? 
// No, I need to import ActionIcon.
import { ActionIcon } from "@mantine/core";

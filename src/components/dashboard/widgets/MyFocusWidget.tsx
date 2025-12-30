"use client";

import { Paper, Title, Text, Group, Stack, Center, Button, TextInput, Box, Checkbox, ActionIcon } from "@mantine/core";
import { IconPlus, IconChevronRight } from "@tabler/icons-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";
import { useState } from "react";
import type { Todo } from "@/lib/types";

export function MyFocusWidget() {
    const queryClient = useQueryClient();
    const [inputValue, setInputValue] = useState("");

    const { data: todos = [] } = useQuery<Todo[]>({
        queryKey: ["dashboardTodos"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("todos")
                .select("*")
                .neq("status", "done")
                .order("due_date", { ascending: true })
                .limit(5);

            if (error) throw error;
            return data || [];
        },
    });

    const addMutation = useMutation({
        mutationFn: async (title: string) => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("No user");

            const { data: maxOrderData } = await supabase.from('todos').select('sort_order').order('sort_order', { ascending: false }).limit(1).single();
            const nextOrder = (maxOrderData?.sort_order || 0) + 1000;

            const { data, error } = await supabase.from("todos").insert({
                title,
                status: "todo",
                user_id: user.id,
                sort_order: nextOrder,
                due_date: new Date().toISOString().split('T')[0],
            }).select().single();
            if (error) throw error;
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["dashboardTodos"] });
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
            queryClient.invalidateQueries({ queryKey: ["dashboardTodos"] });
            queryClient.invalidateQueries({ queryKey: ["todos"] });
        }
    });


    return (
        <Paper p="lg" radius="lg" withBorder h="100%" style={{ display: 'flex', flexDirection: 'column' }}>
            <Group justify="space-between" mb="md">
                <Title order={4} fw={700}>To-Do</Title>
                <Button component={Link} href="/todo" variant="subtle" size="xs" rightSection={<IconChevronRight size={14} />}>
                    전체보기
                </Button>
            </Group>



            <Stack gap="sm" style={{ flex: 1 }}>
                {todos.length === 0 && (
                    <Center h={100} style={{ borderRadius: 8, border: '1px solid var(--border)' }}>
                        <Text size="sm" c="dimmed">할 일이 없습니다.</Text>
                    </Center>
                )}
                {todos.map((todo) => (
                    <Paper key={todo.id} withBorder p="xs" radius="md" style={{ backgroundColor: 'var(--surface)' }}>
                        <Group>
                            <Checkbox
                                checked={todo.status === "done"}
                                onChange={() => toggleMutation.mutate({ id: todo.id, status: todo.status === "done" ? "todo" : "done" })}
                                color="blue"
                                radius="xl"
                            />
                            <Text size="sm" fw={500} td={todo.status === "done" ? "line-through" : undefined} c={todo.status === "done" ? "dimmed" : "var(--ink)"}>
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



"use client";

import { Paper, Title, Text, Group, Stack, SimpleGrid, ThemeIcon, Skeleton } from "@mantine/core";
import { IconReceipt, IconBolt, IconTrendingUp, IconAlertCircle } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";

export function FinancialPulseWidget() {
    // We reuse the logic from the original page for fetching stats
    // Or simplified queries.

    const { data: stats, isLoading } = useQuery({
        queryKey: ["financialPulse"],
        queryFn: async () => {
            // Expenses: count 'unpaid' (pending approval or payment)
            // Actually 'unpaid' usually means 'approved but not paid'? 
            // Or 'pending' status?
            // Let's count 'pending' status for Expenses.
            const { count: expensePending } = await supabase
                .from("expenses")
                .select("*", { count: 'exact', head: true })
                .eq("status", "pending"); // Assuming 'pending' status

            // Utility: count 'is_paid' = false
            const { count: utilityUnpaid } = await supabase
                .from("utility_bills")
                .select("*", { count: 'exact', head: true })
                .eq("is_paid", false);

            return {
                expensePending: expensePending || 0,
                utilityUnpaid: utilityUnpaid || 0,
            };
        }
    });

    if (isLoading) {
        return <Skeleton height={200} radius="lg" />;
    }

    return (
        <Paper p="lg" radius="lg" withBorder h="100%">
            <Group justify="space-between" mb="lg">
                <Title order={4} fw={700}>Financial Pulse</Title>
                <ThemeIcon variant="light" color="teal" radius="md">
                    <IconTrendingUp size={18} />
                </ThemeIcon>
            </Group>

            <SimpleGrid cols={2} spacing="md">
                <Paper p="md" radius="md" bg="var(--mantine-color-red-light)" style={{ border: '1px solid var(--mantine-color-red-light-color)' }}>
                    <Stack gap="xs">
                        <ThemeIcon color="red" variant="white" radius="xl">
                            <IconReceipt size={16} />
                        </ThemeIcon>
                        <Text size="xs" c="red" fw={600} tt="uppercase">승인 대기 경비</Text>
                        <Group align="flex-end" gap={4}>
                            <Title order={2} c="red" fw={800}>{stats?.expensePending}</Title>
                            <Text size="sm" c="red" mb={4}>건</Text>
                        </Group>
                    </Stack>
                </Paper>

                <Paper p="md" radius="md" bg="var(--mantine-color-orange-light)" style={{ border: '1px solid var(--mantine-color-orange-light-color)' }}>
                    <Stack gap="xs">
                        <ThemeIcon color="orange" variant="white" radius="xl">
                            <IconBolt size={16} />
                        </ThemeIcon>
                        <Text size="xs" c="orange" fw={600} tt="uppercase">미납 공과금</Text>
                        <Group align="flex-end" gap={4}>
                            <Title order={2} c="orange" fw={800}>{stats?.utilityUnpaid}</Title>
                            <Text size="sm" c="orange" mb={4}>건</Text>
                        </Group>
                    </Stack>
                </Paper>
            </SimpleGrid>

            {/* Insight or Status */}
            <Group mt="lg" gap="xs">
                <IconAlertCircle size={16} color="var(--mantine-color-gray-6)" />
                <Text size="xs" c="dimmed">
                    {(stats?.expensePending || 0) + (stats?.utilityUnpaid || 0) > 0
                        ? "처리해야 할 재무 항목이 남아있습니다."
                        : "모든 재무 항목이 정상입니다."}
                </Text>
            </Group>
        </Paper>
    );
}

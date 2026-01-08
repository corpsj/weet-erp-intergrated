"use client";

import { Paper, Title, SimpleGrid, UnstyledButton, Text, Group, ThemeIcon, Stack } from "@mantine/core";
import { IconCalculator, IconReceipt, IconNotes, IconKey, IconUserPlus, IconSettings } from "@tabler/icons-react";
import Link from "next/link";

const shortcuts = [
    { label: "새 견적 작성", icon: IconCalculator, link: "/estimate/new", color: "indigo" },
    { label: "경비 청구", icon: IconReceipt, link: "/expenses", color: "red" },
    { label: "메모 작성", icon: IconNotes, link: "/memos", color: "yellow" },
    { label: "계정 공유", icon: IconKey, link: "/vault", color: "teal" },
    { label: "사용자 초대", icon: IconUserPlus, link: "/settings?tab=users", color: "cyan" },
    { label: "시스템 설정", icon: IconSettings, link: "/settings", color: "gray" },
];

export function QuickLauncherWidget() {
    return (
        <Paper p="lg" radius="lg" withBorder h="100%">
            <Title order={4} fw={700} mb="md">Quick Actions</Title>
            <SimpleGrid cols={3} spacing="sm">
                {shortcuts.map((item) => (
                    <UnstyledButton
                        key={item.label}
                        component={Link}
                        href={item.link}
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '16px',
                            borderRadius: '12px',
                            backgroundColor: 'var(--mantine-color-default)',
                            transition: 'all 0.2s ease',
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = 'var(--mantine-color-default-hover)';
                            e.currentTarget.style.transform = 'translateY(-2px)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'var(--mantine-color-default)';
                            e.currentTarget.style.transform = 'translateY(0)';
                        }}
                    >
                        <ThemeIcon color={item.color} variant="light" size="lg" radius="md" mb="xs">
                            <item.icon size={20} />
                        </ThemeIcon>
                        <Text size="xs" fw={600} ta="center" c="dimmed">{item.label}</Text>
                    </UnstyledButton>
                ))}
            </SimpleGrid>
        </Paper>
    );
}

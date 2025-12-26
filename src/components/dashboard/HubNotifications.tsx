"use client";

import { useNotifications, type MenuId } from "@/contexts/NotificationContext";
import { Paper, Title, Group, Button, Badge, Text, SimpleGrid, ThemeIcon, Stack, Box, ActionIcon, Tooltip, Transition, rem } from "@mantine/core";
import { IconBell, IconChevronRight, IconCheck, IconBellRinging, IconArrowRight } from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const menuLabels: Record<MenuId, string> = {
    notice: "공지사항",
    estimate: "견적서",
    todo: "To-Do",
    memo: "메모",
    expense: "경비 청구",
    utility: "공과금",
    tax: "세금계산서",
    transaction: "입출금 내역",
};

const menuLinks: Record<MenuId, string> = {
    notice: "/",
    estimate: "/estimate",
    todo: "/todo",
    memo: "/memos",
    expense: "/expenses",
    utility: "/utility-bills",
    tax: "/tax-invoices",
    transaction: "/transactions",
};

// Premium gradient styles
const gradientBg = "linear-gradient(135deg, var(--mantine-color-indigo-6) 0%, var(--mantine-color-violet-6) 100%)";
const glassStyle = {
    backgroundColor: "rgba(255, 255, 255, 0.7)",
    backdropFilter: "blur(12px)",
    border: "1px solid rgba(255, 255, 255, 0.4)",
};

export function HubNotifications() {
    const { unreadCounts, markAllAsRead } = useNotifications();
    const router = useRouter();
    const [animate, setAnimate] = useState(false);

    useEffect(() => {
        if ("Notification" in window && Notification.permission === "default") {
            Notification.requestPermission();
        }
        setAnimate(true);
    }, []);

    const totalUnread = Object.values(unreadCounts).reduce((a, b) => a + b, 0);
    const unreadMenus = (Object.keys(unreadCounts) as MenuId[]).filter((k) => unreadCounts[k] > 0);

    if (totalUnread === 0) {
        return (
            <Paper
                p="lg"
                radius="lg"
                style={{
                    backgroundColor: 'var(--surface)',
                    border: '1px dashed var(--border)',
                    opacity: 0.8
                }}
            >
                <Group justify="center" gap="sm" style={{ opacity: 0.6 }}>
                    <ThemeIcon color="gray" variant="light" size="md" radius="xl">
                        <IconCheck size={16} />
                    </ThemeIcon>
                    <Text size="sm" fw={500} c="dimmed">새로운 알림이 없습니다.</Text>

                    <Tooltip label="알림 테스트 (권한 확인용)" withArrow position="top" color="gray">
                        <ActionIcon
                            variant="subtle"
                            color="gray"
                            size="sm"
                            onClick={() => {
                                if ("Notification" in window) {
                                    Notification.requestPermission().then(permission => {
                                        if (permission === "granted") {
                                            new Notification("🔔 알림 테스트", {
                                                body: "알림 권한이 정상적으로 설정되었습니다.",
                                                icon: "/app-icon-192.jpg",
                                                badge: "/app-icon-192.jpg"
                                            });
                                        } else {
                                            alert("알림 권한이 필요합니다.");
                                        }
                                    });
                                }
                            }}
                        >
                            <IconBell size={14} />
                        </ActionIcon>
                    </Tooltip>
                </Group>
            </Paper>
        );
    }

    return (
        <Paper
            p={0}
            radius="lg"
            className={`animate-fade-in-up`}
            style={{
                position: 'relative',
                overflow: 'hidden',
                background: 'var(--panel)',
                border: '1px solid var(--border)',
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.05)',
            }}
        >
            {/* Decorative accent */}
            <Box
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '4px',
                    height: '100%',
                    background: gradientBg,
                }}
            />

            <Group p="lg" align="flex-start" justify="space-between" wrap="nowrap">
                <Group gap="md" align="flex-start">
                    <ThemeIcon
                        size={48}
                        radius="md"
                        variant="gradient"
                        gradient={{ from: 'indigo.5', to: 'violet.5', deg: 45 }}
                        style={{ boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)' }}
                    >
                        <IconBellRinging size={26} stroke={1.5} />
                    </ThemeIcon>
                    <Box>
                        <Title order={4} fw={800} style={{ fontFamily: 'var(--mantine-font-family)', fontSize: rem(20) }}>
                            읽지 않은 알림 <Text span c="indigo.6" inherit>{totalUnread}건</Text>이 있습니다
                        </Title>
                        <Text size="sm" c="dimmed" mt={4} fw={500}>
                            확인하지 않은 업무 내역을 모아봤어요.
                        </Text>
                    </Box>
                </Group>

                <Group gap={8}>
                    <Tooltip label="알림 테스트 (권한 확인용)" withArrow position="left" color="gray">
                        <ActionIcon
                            variant="subtle"
                            color="gray"
                            size="lg"
                            radius="md"
                            onClick={() => {
                                if ("Notification" in window) {
                                    // Force permission req
                                    Notification.requestPermission().then(permission => {
                                        if (permission === "granted") {
                                            new Notification("🔔 알림 테스트", {
                                                body: "알림 권한이 정상적으로 설정되었습니다.",
                                                icon: "/app-icon-192.jpg",
                                                badge: "/app-icon-192.jpg"
                                            });
                                        } else {
                                            alert("알림 권한이 필요합니다.");
                                        }
                                    });
                                }
                            }}
                            aria-label="Test Notification"
                        >
                            <IconBell size={20} stroke={2} />
                        </ActionIcon>
                    </Tooltip>
                    <Tooltip label="모든 알림 읽음 처리" withArrow position="left" color="indigo">
                        <ActionIcon
                            variant="light"
                            color="indigo"
                            size="lg"
                            radius="md"
                            onClick={() => markAllAsRead()}
                            aria-label="Mark all as read"
                        >
                            <IconCheck size={20} stroke={2} />
                        </ActionIcon>
                    </Tooltip>
                </Group>
            </Group>

            <Box px="lg" pb="lg">
                <SimpleGrid cols={{ base: 1, sm: 2, md: 3, lg: 4 }} spacing="sm">
                    {unreadMenus.map((menu) => (
                        <Box
                            key={menu}
                            component={Link}
                            href={menuLinks[menu]}
                            style={{ textDecoration: 'none', display: 'block' }}
                        >
                            <Group
                                justify="space-between"
                                p="sm"
                                style={{
                                    backgroundColor: 'var(--surface)',
                                    borderRadius: 'var(--mantine-radius-md)',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease',
                                    border: '1px solid transparent',
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = 'var(--mantine-color-indigo-0)';
                                    e.currentTarget.style.transform = 'translateY(-2px)';
                                    e.currentTarget.style.borderColor = 'var(--mantine-color-indigo-2)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = 'var(--surface)';
                                    e.currentTarget.style.transform = 'translateY(0)';
                                    e.currentTarget.style.borderColor = 'transparent';
                                }}
                            >
                                <Group gap="xs">
                                    <Text size="sm" fw={600} c="var(--ink)">
                                        {menuLabels[menu]}
                                    </Text>
                                </Group>
                                <Badge
                                    variant="gradient"
                                    gradient={{ from: 'red.5', to: 'pink.5', deg: 45 }}
                                    size="sm"
                                    circle
                                    style={{ boxShadow: '0 2px 8px rgba(250, 82, 82, 0.4)' }}
                                >
                                    {unreadCounts[menu]}
                                </Badge>
                            </Group>
                        </Box>
                    ))}
                </SimpleGrid>
            </Box>
        </Paper>
    );
}

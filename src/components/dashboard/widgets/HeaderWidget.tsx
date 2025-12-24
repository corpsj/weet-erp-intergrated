"use client";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { Paper, Group, Title, Text, TextInput, rem, ThemeIcon, Box, Stack } from "@mantine/core";
import { IconSearch, IconSun, IconCloud } from "@tabler/icons-react";
import dayjs from "dayjs";
import { useState, useEffect } from "react";

export function HeaderWidget() {
    const [searchQuery, setSearchQuery] = useState("");
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    const { data: displayName } = useQuery({
        queryKey: ["currentUserProfileHeader"],
        queryFn: async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user) {
                const { data: profile } = await supabase
                    .from("app_users")
                    .select("name")
                    .eq("id", session.user.id)
                    .maybeSingle();
                return profile?.name || session.user.user_metadata?.name || session.user.email?.split("@")[0] || "사용자";
            }
            return "사용자";
        },
        staleTime: 1000 * 60 * 5, // 5 minutes
    });

    // Simulating weather for aesthetic purpose
    const WeatherIcon = IconSun;
    const weatherText = "맑음, 24°C";

    if (!mounted) return null;

    return (
        <Paper
            p="xl"
            radius="lg"
            style={{
                background: "linear-gradient(135deg, var(--mantine-color-indigo-6) 0%, var(--mantine-color-blue-5) 100%)",
                color: "white",
                position: "relative",
                overflow: "hidden",
            }}
        >
            {/* Background pattern */}
            <Box
                style={{
                    position: "absolute",
                    top: 0,
                    right: 0,
                    width: "300px",
                    height: "100%",
                    backgroundImage: "radial-gradient(circle at center, rgba(255,255,255,0.1) 0%, transparent 70%)",
                    pointerEvents: "none",
                }}
            />

            <Group justify="space-between" align="flex-end">
                <Box>
                    <Group gap="xs" mb="xs" style={{ opacity: 0.9 }}>
                        <Text size="sm" fw={600}>{dayjs().format("YYYY년 M월 D일 dddd")}</Text>
                        <Text size="sm" fw={400} style={{ opacity: 0.7 }}>|</Text>
                        <Group gap={4}>
                            <WeatherIcon size={14} />
                            <Text size="sm">{weatherText}</Text>
                        </Group>
                    </Group>
                    <Title order={2} fw={800} style={{ fontSize: rem(28), letterSpacing: "-0.02em" }}>
                        안녕하세요, {displayName}님 👋
                    </Title>
                    <Text size="md" mt={4} style={{ opacity: 0.85 }}>
                        오늘도 생산적인 하루를 시작해보세요.
                    </Text>
                </Box>

                <TextInput
                    placeholder="검색어를 입력하세요..."
                    leftSection={<IconSearch size={16} />}
                    radius="md"
                    size="md"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.currentTarget.value)}
                    style={{ width: 320 }}
                    styles={{
                        input: {
                            backgroundColor: "rgba(255, 255, 255, 0.15)",
                            border: "1px solid rgba(255, 255, 255, 0.2)",
                            color: "white",
                            "::placeholder": { color: "rgba(255, 255, 255, 0.6)" },
                            "&:focus": {
                                backgroundColor: "rgba(255, 255, 255, 0.25)",
                                borderColor: "rgba(255, 255, 255, 0.4)",
                            }
                        },
                        section: { color: "rgba(255, 255, 255, 0.7)" }
                    }}
                />
            </Group>
        </Paper>
    );
}

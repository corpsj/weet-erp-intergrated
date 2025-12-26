"use client";

import { useMantineColorScheme, ActionIcon, Group } from "@mantine/core";
import { IconSun, IconMoon } from "@tabler/icons-react";

export function ThemeToggle() {
    const { colorScheme, setColorScheme } = useMantineColorScheme();

    return (
        <Group justify="center">
            <ActionIcon
                onClick={() => setColorScheme(colorScheme === "light" ? "dark" : "light")}
                variant="default"
                size="lg"
                aria-label="Toggle color scheme"
            >
                <IconSun className="mantine-visible-dark" stroke={1.5} />
                <IconMoon className="mantine-visible-light" stroke={1.5} />
            </ActionIcon>
        </Group>
    );
}

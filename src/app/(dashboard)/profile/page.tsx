"use client";

import { Box, Group, Paper, Stack, Text, Title } from "@mantine/core";
import { ProfileEditor } from "@/components/ProfileEditor";

export default function ProfilePage() {
  return (
    <Box p="md">
      <Group justify="space-between" mb="lg">
        <div>
          <Title order={2}>프로필</Title>
          <Text c="dimmed" size="sm">
            내 이름/표시 정보를 관리합니다.
          </Text>
        </div>
      </Group>
      <Paper className="app-surface" p="lg" radius="md">
        <Stack gap="md">
          <ProfileEditor />
        </Stack>
      </Paper>
    </Box>
  );
}


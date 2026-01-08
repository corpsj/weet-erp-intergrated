"use client";

import { Button, Container, Group, Paper, Text, Title } from "@mantine/core";
import Link from "next/link";

export default function EstimatesEntryPage() {
  return (
    <Container size="md" p="md">
      <Paper className="app-surface" p="xl" radius="md">
        <Group justify="space-between" align="flex-start">
          <div>
            <Title order={3}>견적 모듈로 이동</Title>
            <Text c="dimmed" mt="xs">
              견적 산출은 통합 모듈에서 진행합니다.
            </Text>
          </div>
          <Button component={Link} href="/estimate/materials" color="gray">
            견적 열기
          </Button>
        </Group>
      </Paper>
    </Container>
  );
}

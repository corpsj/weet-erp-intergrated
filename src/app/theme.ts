import { createTheme, rem } from "@mantine/core";

export const theme = createTheme({
  primaryColor: "indigo",
  primaryShade: { light: 6, dark: 5 },
  fontFamily: "var(--font-body)",
  headings: {
    fontFamily: "var(--font-display)",
    fontWeight: "800",
  },
  defaultRadius: "md",
  cursorType: "pointer",
  black: "#0f172a", // Slate 900
  white: "#ffffff",
  colors: {
    // Custom slate-based grays for ERP reliability
    gray: [
      "#f8fafc", // 50
      "#f1f5f9", // 100
      "#e2e8f0", // 200
      "#cbd5e1", // 300
      "#94a3b8", // 400
      "#64748b", // 500
      "#475569", // 600
      "#334155", // 700
      "#1e293b", // 800
      "#0f172a", // 900 (Main dark background if needed)
    ],
    dark: [
      "#C1C2C5",
      "#A6A7AB",
      "#909296",
      "#5c5f66",
      "#373A40",
      "#2C2E33",
      "#25262b",
      "#1A1B1E",
      "#141517",
      "#101113",
    ],
  },
  components: {
    Paper: {
      defaultProps: {
        radius: "md",
        withBorder: true,
      },
    },
    Button: {
      defaultProps: {
        radius: "md",
        fw: 600,
      },
    },
    TextInput: {
      defaultProps: {
        radius: "md",
      }
    },
    Select: {
      defaultProps: {
        radius: "md",
      }
    },
    Card: {
      defaultProps: {
        radius: "md",
        withBorder: true,
      }
    },
    Badge: {
      defaultProps: {
        radius: "sm",
        fw: 700,
      }
    }
  },
});

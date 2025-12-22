import { createTheme } from "@mantine/core";

export const theme = createTheme({
  primaryColor: "indigo",
  primaryShade: 6,
  fontFamily: "var(--font-body)",
  headings: {
    fontFamily: "var(--font-display)",
    fontWeight: "700",
  },
  defaultRadius: "lg",
  components: {
    Paper: {
      defaultProps: {
        radius: "lg",
      },
    },
    Button: {
      defaultProps: {
        radius: "md",
      },
    },
  },
});

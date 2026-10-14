import type { Config } from "tailwindcss";
import type { PluginAPI } from "tailwindcss/types/config";

/**
 * Token values are copied verbatim from the approved Stitch export
 * (`tailwind.config` block inside each generated `code.html`).
 * Do not re-theme these values: the design is approved as-is.
 */
const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        "surface-container": "#e5eeff",
        "on-tertiary-container": "#389189",
        secondary: "#1d4ed8",
        "on-background": "#0b1c30",
        "secondary-container": "#4069f2",
        tertiary: "#000000",
        outline: "#76777d",
        "on-surface": "#0b1c30",
        "primary-container": "#131b2e",
        "on-secondary-fixed-variant": "#0039b5",
        "on-surface-variant": "#45464d",
        "surface-container-highest": "#d3e4fe",
        "tertiary-fixed": "#9cf2e8",
        "on-tertiary": "#ffffff",
        "tertiary-container": "#00201d",
        "inverse-surface": "#213145",
        "outline-variant": "#c6c6cd",
        "secondary-fixed-dim": "#b7c4ff",
        "surface-variant": "#d3e4fe",
        background: "#f8f9ff",
        "on-primary": "#ffffff",
        "primary-fixed-dim": "#bec6e0",
        "secondary-fixed": "#dce1ff",
        "on-tertiary-fixed": "#00201d",
        "on-primary-fixed": "#131b2e",
        "on-secondary-container": "#fffbff",
        "on-primary-fixed-variant": "#3f465c",
        "tertiary-fixed-dim": "#80d5cb",
        "inverse-primary": "#bec6e0",
        "surface-bright": "#f8f9ff",
        surface: "#f8f9ff",
        "surface-container-high": "#dce9ff",
        "on-secondary": "#ffffff",
        "primary-fixed": "#dae2fd",
        "inverse-on-surface": "#eaf1ff",
        "on-error": "#ffffff",
        error: "#ba1a1a",
        "error-container": "#ffdad6",
        "surface-container-low": "#eff4ff",
        "on-primary-container": "#7c839b",
        "surface-container-lowest": "#ffffff",
        "surface-dim": "#cbdbf5",
        "on-error-container": "#93000a",
        "surface-tint": "#565e74",
        primary: "#000000",
        "on-tertiary-fixed-variant": "#00504a",
        "on-secondary-fixed": "#001551",
      },
      borderRadius: {
        DEFAULT: "0.125rem",
        lg: "0.25rem",
        xl: "0.5rem",
        full: "0.75rem",
      },
      spacing: {
        margin: "1.5rem",
        "space-xl": "2rem",
        "margin-mobile": "1rem",
        "gutter-compact": "0.5rem",
        "space-xs": "0.25rem",
        gutter: "1rem",
        "space-sm": "0.5rem",
        "space-lg": "1.25rem",
        "space-md": "0.75rem",
      },
      fontFamily: {
        "body-lg": ["Inter"],
        "data-mono": ["JetBrains Mono"],
        "label-md": ["Inter"],
        "body-sm": ["Inter"],
        "body-md": ["Inter"],
        "label-caps": ["Inter"],
        "headline-xl": ["Inter"],
        "headline-sm": ["Inter"],
        "label-sm": ["Inter"],
        "headline-lg": ["Inter"],
      },
      fontSize: {
        "body-lg": ["15px", { lineHeight: "22px", letterSpacing: "-0.005em" }],
        "data-mono": ["12px", { lineHeight: "16px", letterSpacing: "0em" }],
        "label-md": [
          "13px",
          { lineHeight: "18px", letterSpacing: "-0.005em" },
        ],
        "body-sm": ["12px", { lineHeight: "16px", letterSpacing: "0em" }],
        "body-md": ["13px", { lineHeight: "19px", letterSpacing: "0em" }],
        "label-caps": [
          "11px",
          { lineHeight: "14px", letterSpacing: "0.06em" },
        ],
        "headline-xl": [
          "28px",
          { lineHeight: "36px", letterSpacing: "-0.02em" },
        ],
        "headline-sm": [
          "16px",
          { lineHeight: "24px", letterSpacing: "-0.01em" },
        ],
        "label-sm": ["11px", { lineHeight: "14px", letterSpacing: "0em" }],
        "headline-lg": [
          "20px",
          { lineHeight: "28px", letterSpacing: "-0.015em" },
        ],
      },
    },
  },
  plugins: [
    /**
     * The Stitch token table defines a font weight alongside every type token.
     * Tailwind v3 cannot express weight inside `fontSize`, so this plugin
     * re-applies the approved weight to the matching `text-*` utility.
     * Result: `text-label-caps` renders 11px/14px/0.06em at weight 600, exactly
     * as the static HTML export does.
     */
    function stitchTypographyWeights({ addUtilities }: PluginAPI) {
      addUtilities({
        ".text-body-lg": { fontWeight: "400" },
        ".text-data-mono": { fontWeight: "400" },
        ".text-label-md": { fontWeight: "500" },
        ".text-body-sm": { fontWeight: "400" },
        ".text-body-md": { fontWeight: "400" },
        ".text-label-caps": { fontWeight: "600" },
        ".text-headline-xl": { fontWeight: "600" },
        ".text-headline-sm": { fontWeight: "600" },
        ".text-label-sm": { fontWeight: "500" },
        ".text-headline-lg": { fontWeight: "600" },
      });
    },
  ],
};

export default config;

import { ImageResponse } from "next/og";

/**
 * Default OpenGraph image for DialDazzle. (STEP 65)
 *
 * Served from the metadata file convention, so no page has to reference it
 * manually and no external image dependency exists at runtime. The only asset
 * is the Geist font already bundled with `next/og`.
 */

export const alt = "DialDazzle - Software for modern work.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "#0b1020",
          color: "#f8fafc",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 88,
              height: 88,
              borderRadius: 20,
              background: "#6366f1",
              color: "#ffffff",
              fontSize: 40,
              fontWeight: 700,
            }}
          >
            DD
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 40,
              fontWeight: 600,
              letterSpacing: 6,
              textTransform: "uppercase",
            }}
          >
            DialDazzle
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", fontSize: 84, fontWeight: 700 }}>
            Software for modern work.
          </div>
          <div style={{ display: "flex", fontSize: 34, color: "#c7d2fe" }}>
            Focused desktop products by DialDazzle.
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}

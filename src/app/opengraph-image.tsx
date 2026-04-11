import { ImageResponse } from "next/og"

export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "#0a0a0a",
          color: "#fafafa",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
        }}
      >
        <div style={{ fontSize: 64, fontWeight: 500, letterSpacing: "-0.025em" }}>
          JD van Staden
        </div>
        <div style={{ fontSize: 28, color: "#a1a1a1", marginTop: 16 }}>
          Software Development Engineer · Cape Town
        </div>
      </div>
    )
  )
}

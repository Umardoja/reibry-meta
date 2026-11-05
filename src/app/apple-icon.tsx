import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";
export const alt = "REIBRY";

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0F6B5C",
        borderRadius: "22%",
        color: "#F8F4EC",
        fontFamily: "Georgia, serif",
        fontSize: 104,
        fontWeight: 700,
        letterSpacing: "-8px",
        paddingRight: 8,
      }}
    >
      R
    </div>,
    size,
  );
}

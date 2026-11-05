import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";
export const alt = "REIBRY";

/** Brand icon generated at build time; no bitmap or licensed asset is required. */
export default function Icon() {
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
        fontSize: 292,
        fontWeight: 700,
        letterSpacing: "-24px",
        paddingRight: 22,
      }}
    >
      R
    </div>,
    size,
  );
}

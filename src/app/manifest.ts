import type { MetadataRoute } from "next";

/**
 * A deliberately small install manifest. It has no service worker: authenticated
 * API responses, session cookies, and owner-scoped Memories must never be put
 * into an offline cache merely to make the app installable.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "REIBRY — From saved to done",
    short_name: "REIBRY",
    description: "From saved to done. Keep useful things close to what you are trying to do.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#F8F4EC",
    theme_color: "#0F6B5C",
    icons: [
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    launch_handler: { client_mode: "focus-existing" },
    // Chromium Android sends the shared title/text/url to the existing Capture
    // page. Capture reuses its bounded HTTPS-link parser and owner-scoped POST.
    // It intentionally remains an explicit save: a URL query alone cannot prove
    // it came from the operating-system share sheet and must not trigger a CSRF-like write.
    share_target: {
      action: "/capture",
      method: "GET",
      params: { title: "title", text: "text", url: "url" },
    },
  };
}

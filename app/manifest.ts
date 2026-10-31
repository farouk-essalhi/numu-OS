import type { MetadataRoute } from "next";

// Installable on phones ("Add to Home Screen") so the team can move cards from a shoot.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "NUMU OS",
    short_name: "NUMU",
    description: "Retainers, deliverables, approvals and money in one place.",
    start_url: "/",
    display: "standalone",
    background_color: "#ecebe7",
    theme_color: "#ecebe7",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-maskable.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}

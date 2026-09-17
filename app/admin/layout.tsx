import type { ReactNode } from "react";
import { AdminThemeScope } from "@/components/AdminTheme";

// Runs before anything below it paints, so opening the desk in daylight
// doesn't flash dark first. Deliberately tiny and deliberately silent: if
// storage is unavailable the desk just opens dark.
const NO_FLASH = `try{if(localStorage.getItem("dbd-admin-theme")==="light"){document.documentElement.setAttribute("data-admin-theme","light")}}catch(e){}`;

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: NO_FLASH }} />
      <AdminThemeScope />
      {children}
    </>
  );
}

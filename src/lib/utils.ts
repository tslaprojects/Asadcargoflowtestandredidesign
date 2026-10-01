import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * Типографические роли дизайн-системы (globals.css, @utility text-*) — это размер шрифта, а не цвет.
 * Без явной регистрации tailwind-merge считает «text-meta» и «text-delayed» одной группой и выбрасывает роль.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["display", "h1", "h2", "h3", "h4", "caption", "overline", "metric", "meta"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

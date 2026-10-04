import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * Типографические роли дизайн-системы (globals.css, @utility text-*) — это размер шрифта, а не цвет.
 * Без явной регистрации tailwind-merge считает «text-meta» и «text-delayed» одной группой и выбрасывает роль.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "large-title",
            "title1",
            "title2",
            "title3",
            "headline",
            "body",
            "callout",
            "subheadline",
            "footnote",
            "caption",
            "section",
            "figure",
          ],
        },
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
